import type { CalendarDay, DashboardData, Milestone, MilestoneWithStats, ProjectWithStats, Task } from '../../shared/schemas.js';
import { addDays, dayjs, monthRange, todayStr } from '../../shared/dates.js';
import { getDb } from '../db/connection.js';
import { computeMilestoneProgress, listProjects } from './projectService.js';
import { listTasks } from './taskService.js';

/** จำนวนวันล่วงหน้าที่ถือว่า "ใกล้ถึงกำหนด" (รวมวันนี้) */
export const DUE_SOON_DAYS = 3;

export function getDashboard(): DashboardData {
  const db = getDb();
  const today = todayStr();
  const soonLimit = addDays(today, DUE_SOON_DAYS);

  const todayTasks = listTasks({ date: today });

  const c = db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(status='done'),0)   AS done,
        COALESCE(SUM(status='doing'),0)  AS doing,
        COALESCE(SUM(status='review'),0) AS review,
        COALESCE(SUM(status='todo'),0)   AS todo
       FROM tasks`,
    )
    .get() as { total: number; done: number; doing: number; review: number; todo: number };

  const overdue = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color, m.title AS milestone_title
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN milestones m ON m.id = t.milestone_id
       WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
       ORDER BY t.due_date, t.id`,
    )
    .all(today) as Task[];

  const dueSoon = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color, m.title AS milestone_title
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN milestones m ON m.id = t.milestone_id
       WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date BETWEEN ? AND ?
       ORDER BY t.due_date, t.id`,
    )
    .all(today, soonLimit) as Task[];

  // งานค้างจากวันก่อน (ไม่รวมงานที่เลยกำหนด และไม่รวมงานหลายวันที่ยังไม่พ้น work_end_date)
  const carryOver = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.color AS project_color, m.title AS milestone_title
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN milestones m ON m.id = t.milestone_id
       WHERE t.status <> 'done'
         AND COALESCE(t.work_end_date, t.work_date) < @today
         AND NOT (t.due_date IS NOT NULL AND t.due_date < @today)
       ORDER BY t.work_date, t.id`,
    )
    .all({ today }) as Task[];

  const todayDone = todayTasks.filter((t) => t.status === 'done').length;

  const allProjects = listProjects();
  const activeProjects = allProjects.filter((p) => p.status === 'active');

  // Milestone ที่ใกล้ถึงกำหนด (ภายใน 14 วัน) หรือเลยกำหนด ของโปรเจกต์ที่กำลังทำ/วางแผน
  const milestoneLimit = addDays(today, 14);
  const rawMilestones = db
    .prepare(
      `SELECT m.*, p.name AS project_name, p.color AS project_color,
        (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id) AS total_tasks,
        (SELECT COALESCE(SUM(t.status = 'done'), 0) FROM tasks t WHERE t.milestone_id = m.id) AS done_tasks
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
       WHERE m.status <> 'done'
         AND p.status IN ('active', 'planning')
         AND m.due_date IS NOT NULL
         AND m.due_date <= ?
       ORDER BY m.due_date ASC, m.sort_order ASC, m.id ASC
       LIMIT 8`,
    )
    .all(milestoneLimit) as (Milestone & { project_name: string; project_color: string; total_tasks: number; done_tasks: number })[];

  const upcomingMilestones: (MilestoneWithStats & { project_name: string; project_color: string })[] = rawMilestones.map((m) => ({
    ...m,
    progress: computeMilestoneProgress(m.total_tasks, m.done_tasks, m.status),
  }));

  // โปรเจกต์ที่ต้องเตือน: เลยกำหนด / ใกล้กำหนดเสร็จใน 7 วัน / ไม่มีความเคลื่อนไหวเกิน 14 วัน ("โปรเจกต์นิ่ง")
  const staleOrUrgentProjects: (ProjectWithStats & { alertReason: 'stale' | 'due_soon' | 'overdue' })[] = [];
  for (const p of allProjects) {
    if (p.status !== 'active' && p.status !== 'planning') continue;
    if (p.is_overdue) {
      staleOrUrgentProjects.push({ ...p, alertReason: 'overdue' });
    } else if (p.days_remaining !== null && p.days_remaining >= 0 && p.days_remaining <= 7) {
      staleOrUrgentProjects.push({ ...p, alertReason: 'due_soon' });
    } else if (p.is_stale) {
      staleOrUrgentProjects.push({ ...p, alertReason: 'stale' });
    }
  }

  return {
    today,
    todayTasks,
    counts: { total: c.total, done: c.done, notDone: c.total - c.done, doing: c.doing, review: c.review, todo: c.todo },
    todayCounts: { total: todayTasks.length, done: todayDone, notDone: todayTasks.length - todayDone },
    dueSoon,
    overdue,
    carryOver,
    activeProjects,
    upcomingMilestones,
    staleOrUrgentProjects,
  };
}

/** สรุปจำนวนงานต่อวันในเดือน (รองรับงานหลายวัน work_date .. work_end_date) */
export function getCalendar(month: string): CalendarDay[] {
  const { start, end } = monthRange(month);
  const today = todayStr();
  const rows = getDb()
    .prepare(
      `SELECT work_date, work_end_date, due_date, status
       FROM tasks
       WHERE work_date <= @end AND COALESCE(work_end_date, work_date) >= @start`,
    )
    .all({ start, end }) as { work_date: string; work_end_date: string | null; due_date: string | null; status: string }[];

  const map = new Map<string, CalendarDay>();
  for (const r of rows) {
    const s = r.work_date < start ? start : r.work_date;
    const e = (r.work_end_date || r.work_date) > end ? end : r.work_end_date || r.work_date;
    for (let d = dayjs(s); !d.isAfter(dayjs(e), 'day'); d = d.add(1, 'day')) {
      const ds = d.format('YYYY-MM-DD');
      let entry = map.get(ds);
      if (!entry) {
        entry = { date: ds, total: 0, todo: 0, doing: 0, done: 0, overdue: 0 };
        map.set(ds, entry);
      }
      entry.total++;
      if (r.status === 'todo') entry.todo++;
      else if (r.status === 'doing') entry.doing++;
      else if (r.status === 'review') entry.review = (entry.review || 0) + 1;
      else if (r.status === 'done') entry.done++;
      if (r.status !== 'done' && r.due_date !== null && r.due_date < today) {
        entry.overdue++;
      }
    }
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
