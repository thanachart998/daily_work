import type { CategorySummary, MonthlyProjectReport, MonthlyReport, Task } from '../../shared/schemas.js';
import { dayjs, monthRange, nowIso, todayStr } from '../../shared/dates.js';
import { getDb } from '../db/connection.js';
import { getProjectUpdateByPeriod, listProjectMilestones, listProjects } from './projectService.js';

const NO_CATEGORY = 'ไม่มีหมวดหมู่';

const SELECT_TASK_WITH_RELATIONS = `
  SELECT t.*,
         p.name  AS project_name,
         p.color AS project_color,
         m.title AS milestone_title
  FROM tasks t
  LEFT JOIN projects p   ON p.id = t.project_id
  LEFT JOIN milestones m ON m.id = t.milestone_id
`;

/**
 * รายงานรายเดือน — กติกาการนับ:
 *  - ผลงานที่เสร็จ (completed)  = status='done' และ completed_at อยู่ในเดือน
 *  - งานที่วางแผน (planned)     = work_date อยู่ในเดือน
 *  - ยังไม่เสร็จ (pending)       = วางแผนในเดือน และ status <> 'done' (ห้ามนับเป็นผลงานที่เสร็จ)
 *  - เลยกำหนด (overdue)         = ยังไม่เสร็จ และ due_date < วันนี้
 *  - อัตราความสำเร็จ             = งานที่วางแผนในเดือนและเสร็จแล้ว / งานที่วางแผน
 *  - แยกแสดง "ความคืบหน้าโปรเจกต์ระยะยาว" และ "งานทั่วไป" (งานที่ไม่ผูกโปรเจกต์)
 */
export function getMonthlyReport(month: string): MonthlyReport {
  const db = getDb();
  const { start, end } = monthRange(month);
  const prevMonth = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM');
  const today = todayStr();

  const completed = db
    .prepare(
      `${SELECT_TASK_WITH_RELATIONS}
       WHERE t.status = 'done' AND substr(t.completed_at, 1, 7) = ?
       ORDER BY t.completed_at, t.work_date, t.id`,
    )
    .all(month) as Task[];

  const planned = db
    .prepare(
      `${SELECT_TASK_WITH_RELATIONS}
       WHERE t.work_date BETWEEN ? AND ?
       ORDER BY t.work_date, t.id`,
    )
    .all(start, end) as Task[];

  const pending = planned.filter((t) => t.status !== 'done');
  const plannedDone = planned.filter((t) => t.status === 'done');
  const plannedDoneElsewhere = plannedDone.filter((t) => !t.completed_at || t.completed_at.slice(0, 7) !== month);
  const overdue = pending.filter((t) => t.due_date !== null && t.due_date < today);

  const generalCompleted = completed.filter((t) => !t.project_id);
  const generalPending = pending.filter((t) => !t.project_id);

  const cats = new Map<string, CategorySummary>();
  const bucket = (t: Task) => {
    const key = t.category || NO_CATEGORY;
    let s = cats.get(key);
    if (!s) {
      s = { category: key, planned: 0, plannedDone: 0, pending: 0, completedInMonth: 0 };
      cats.set(key, s);
    }
    return s;
  };
  for (const t of planned) {
    const s = bucket(t);
    s.planned++;
    if (t.status === 'done') s.plannedDone++;
    else s.pending++;
  }
  for (const t of completed) bucket(t).completedInMonth++;

  const byCategory = [...cats.values()].sort(
    (a, b) => b.planned + b.completedInMonth - (a.planned + a.completedInMonth) || a.category.localeCompare(b.category, 'th'),
  );

  // รายงานความคืบหน้าโปรเจกต์ระยะยาวในเดือนที่เลือก
  const allProjects = listProjects();
  const projectReports: MonthlyProjectReport[] = [];

  for (const proj of allProjects) {
    const projTasks = db
      .prepare(`${SELECT_TASK_WITH_RELATIONS} WHERE t.project_id = ? ORDER BY t.work_date, t.id`)
      .all(proj.id) as Task[];
    const milestones = listProjectMilestones(proj.id);
    const update = getProjectUpdateByPeriod(proj.id, month);

    // งานของโปรเจกต์ที่ทำเสร็จในเดือนนี้เท่านั้น (ห้ามซ้ำข้ามเดือน และห้ามนับงานที่ยังไม่เสร็จ)
    const completedInMonthTasks = projTasks.filter((t) => t.status === 'done' && t.completed_at?.slice(0, 7) === month);
    const pendingInMonthTasks = projTasks.filter(
      (t) => t.status !== 'done' && t.work_date <= end,
    );

    // Milestone ที่ถึงเป้าในเดือนนั้น (completed_at อยู่ในเดือนนั้น หรือเสร็จแล้วและ due_date อยู่ในเดือนนั้น)
    const completedMilestones = milestones.filter(
      (m) =>
        m.status === 'done' &&
        (m.completed_at?.slice(0, 7) === month || (!m.completed_at && m.due_date?.slice(0, 7) === month)),
    );

    // ตรวจว่าโปรเจกต์นี้คาบเกี่ยวกับเดือนที่รายงานหรือไม่
    const startedBeforeOrInMonth = proj.start_date <= end;
    const endedBeforeMonth = proj.actual_end_date !== null && proj.actual_end_date < start;
    const hasActivityInMonth =
      completedInMonthTasks.length > 0 ||
      completedMilestones.length > 0 ||
      update !== null ||
      projTasks.some((t) => t.work_date >= start && t.work_date <= end);

    if (!hasActivityInMonth && (!startedBeforeOrInMonth || endedBeforeMonth || proj.status === 'cancelled')) {
      continue;
    }

    // คำนวณ % ความคืบหน้า ณ สิ้นเดือน และ % ที่เพิ่มขึ้นจากเดือนก่อน
    let progressAtEndOfMonth = proj.progress;
    let progressAtPrevMonth = 0;

    if (proj.total_tasks > 0 && proj.progress_mode === 'auto') {
      const doneByEndOfMonth = projTasks.filter(
        (t) => t.status === 'done' && (!t.completed_at || t.completed_at.slice(0, 7) <= month),
      ).length;
      const doneByPrevMonth = projTasks.filter(
        (t) => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 7) <= prevMonth,
      ).length;
      progressAtEndOfMonth = Math.round((doneByEndOfMonth / proj.total_tasks) * 100);
      progressAtPrevMonth = Math.round((doneByPrevMonth / proj.total_tasks) * 100);
    } else if (proj.progress_mode === 'manual') {
      progressAtEndOfMonth = proj.manual_progress;
      progressAtPrevMonth = proj.start_date.slice(0, 7) === month ? 0 : proj.manual_progress;
    }

    const progressDelta = Math.max(0, progressAtEndOfMonth - progressAtPrevMonth);

    projectReports.push({
      project: proj,
      progressAtEndOfMonth,
      progressAtPrevMonth,
      progressDelta,
      completedTasks: completedInMonthTasks,
      pendingTasks: pendingInMonthTasks,
      completedMilestones,
      update,
    });
  }

  return {
    month,
    generatedAt: nowIso(),
    today,
    summary: {
      planned: planned.length,
      completedInMonth: completed.length,
      plannedDone: plannedDone.length,
      pending: pending.length,
      overdue: overdue.length,
      successRate: planned.length ? Math.round((plannedDone.length / planned.length) * 1000) / 10 : 0,
    },
    byCategory,
    completed,
    pending,
    plannedDoneElsewhere,
    generalCompleted,
    generalPending,
    projectReports,
  };
}
