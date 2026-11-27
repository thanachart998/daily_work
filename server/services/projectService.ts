import type {
  Milestone,
  MilestoneInputParsed,
  MilestoneWithStats,
  Project,
  ProjectDeleteAction,
  ProjectDetail,
  ProjectInputParsed,
  ProjectStatus,
  ProjectUpdate,
  ProjectUpdateInputParsed,
  ProjectWithStats,
  Task,
  TaskStatus,
} from '../../shared/schemas.js';
import { addDays, dayjs, nowIso, todayStr } from '../../shared/dates.js';
import { getDb } from '../db/connection.js';
import { AppError, notFound } from '../errors.js';
import { listTasks } from './taskService.js';

export function resolveActualEndDate(
  prevStatus: ProjectStatus | null,
  prevActualEndDate: string | null,
  nextStatus: ProjectStatus,
): string | null {
  if (nextStatus !== 'done') return null;
  if (prevStatus === 'done' && prevActualEndDate) return prevActualEndDate;
  return todayStr();
}

export function resolveMilestoneCompletedAt(
  prevStatus: TaskStatus | null,
  prevCompletedAt: string | null,
  nextStatus: TaskStatus,
): string | null {
  if (nextStatus !== 'done') return null;
  if (prevStatus === 'done' && prevCompletedAt) return prevCompletedAt;
  return nowIso();
}

/** คำนวณความคืบหน้าของ Milestone: ถ้ามีงานใช้ done/total, ถ้าไม่มีงานเลยใช้สถานะ (done=100%, อื่นๆ=0%) */
export function computeMilestoneProgress(totalTasks: number, doneTasks: number, status: TaskStatus): number {
  if (totalTasks > 0) {
    return Math.round((doneTasks / totalTasks) * 100);
  }
  return status === 'done' ? 100 : 0;
}

/** คำนวณความคืบหน้าของโปรเจกต์ (auto) */
export function computeProjectAutoProgress(totalTasks: number, doneTasks: number, status: ProjectStatus): number {
  if (totalTasks > 0) {
    return Math.round((doneTasks / totalTasks) * 100);
  }
  return status === 'done' ? 100 : 0;
}

export function getMilestoneWithStats(id: number): MilestoneWithStats {
  const db = getDb();
  const m = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;
  if (!m) throw notFound('Milestone');

  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'done'), 0) AS done
       FROM tasks WHERE milestone_id = ?`,
    )
    .get(id) as { total: number; done: number };

  return {
    ...m,
    total_tasks: counts.total,
    done_tasks: counts.done,
    progress: computeMilestoneProgress(counts.total, counts.done, m.status),
  };
}

export function listProjectMilestones(projectId: number): MilestoneWithStats[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id) AS total_tasks,
        (SELECT COALESCE(SUM(t.status = 'done'), 0) FROM tasks t WHERE t.milestone_id = m.id) AS done_tasks
       FROM milestones m
       WHERE m.project_id = ?
       ORDER BY m.sort_order ASC, CASE WHEN m.due_date IS NULL THEN 1 ELSE 0 END, m.due_date ASC, m.id ASC`,
    )
    .all(projectId) as (Milestone & { total_tasks: number; done_tasks: number })[];

  return rows.map((r) => ({
    ...r,
    progress: computeMilestoneProgress(r.total_tasks, r.done_tasks, r.status),
  }));
}

function enrichProject(p: Project, today = todayStr()): ProjectWithStats {
  const db = getDb();
  const taskCounts = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'done'), 0) AS done,
              MAX(updated_at) AS max_task_updated
       FROM tasks WHERE project_id = ?`,
    )
    .get(p.id) as { total: number; done: number; max_task_updated: string | null };

  const milestones = listProjectMilestones(p.id);
  const doneMilestones = milestones.filter((m) => m.status === 'done').length;

  const pendingMilestones = milestones
    .filter((m) => m.status !== 'done')
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.sort_order - b.sort_order || a.id - b.id;
    });

  const nextMilestone = pendingMilestones[0] ?? null;

  const maxMilestoneUpdated = milestones.reduce((max, m) => (m.updated_at > max ? m.updated_at : max), '');
  const updateRow = db
    .prepare('SELECT MAX(updated_at) AS max_u FROM project_updates WHERE project_id = ?')
    .get(p.id) as { max_u: string | null } | undefined;

  const lastActivity = [p.updated_at, taskCounts.max_task_updated ?? '', maxMilestoneUpdated, updateRow?.max_u ?? '']
    .filter(Boolean)
    .sort()
    .pop() || p.updated_at;

  const autoProgress = computeProjectAutoProgress(taskCounts.total, taskCounts.done, p.status);
  const progress = p.progress_mode === 'manual' ? p.manual_progress : autoProgress;

  const isClosed = p.status === 'done' || p.status === 'cancelled';
  const daysRemaining =
    p.target_end_date && !isClosed ? dayjs(p.target_end_date).diff(dayjs(today), 'day') : null;
  const isOverdue = !isClosed && p.target_end_date !== null && p.target_end_date < today;

  const inactiveDays = dayjs(today).diff(dayjs(lastActivity.slice(0, 10)), 'day');
  const isStale = (p.status === 'active' || p.status === 'planning') && inactiveDays > 14;

  return {
    ...p,
    total_tasks: taskCounts.total,
    done_tasks: taskCounts.done,
    auto_progress: autoProgress,
    progress,
    total_milestones: milestones.length,
    done_milestones: doneMilestones,
    next_milestone: nextMilestone,
    last_activity_at: lastActivity,
    is_overdue: isOverdue,
    is_stale: isStale,
    days_remaining: daysRemaining,
  };
}

export function listProjects(status?: ProjectStatus): ProjectWithStats[] {
  const db = getDb();
  const today = todayStr();
  const rows = (
    status
      ? db.prepare('SELECT * FROM projects WHERE status = ? ORDER BY start_date DESC, id DESC').all(status)
      : db
          .prepare(
            `SELECT * FROM projects
             ORDER BY CASE status
               WHEN 'active' THEN 0
               WHEN 'planning' THEN 1
               WHEN 'on_hold' THEN 2
               WHEN 'done' THEN 3
               ELSE 4
             END, start_date DESC, id DESC`,
          )
          .all()
  ) as Project[];

  return rows.map((p) => enrichProject(p, today));
}

export function getProject(id: number): ProjectWithStats {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  if (!row) throw notFound('โปรเจกต์');
  return enrichProject(row);
}

export function getProjectDetail(id: number): ProjectDetail {
  const proj = getProject(id);
  const milestones = listProjectMilestones(id);
  const tasks = listTasks({ project_id: String(id) });
  const updates = listProjectUpdates(id);
  return {
    ...proj,
    milestones,
    tasks,
    updates,
  };
}

export function createProject(input: ProjectInputParsed): ProjectWithStats {
  const db = getDb();
  const now = nowIso();
  const actualEnd = resolveActualEndDate(null, null, input.status);
  const info = db
    .prepare(
      `INSERT INTO projects (name, description, start_date, target_end_date, actual_end_date, status, color,
        progress_mode, manual_progress, created_at, updated_at)
       VALUES (@name, @description, @start_date, @target_end_date, @actual_end_date, @status, @color,
        @progress_mode, @manual_progress, @now, @now)`,
    )
    .run({
      name: input.name,
      description: input.description ?? null,
      start_date: input.start_date,
      target_end_date: input.target_end_date ?? null,
      actual_end_date: actualEnd,
      status: input.status,
      color: input.color,
      progress_mode: input.progress_mode,
      manual_progress: input.manual_progress,
      now,
    });
  return getProject(Number(info.lastInsertRowid));
}

export function updateProject(id: number, input: ProjectInputParsed): ProjectWithStats {
  const db = getDb();
  const prev = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  if (!prev) throw notFound('โปรเจกต์');

  const actualEnd = resolveActualEndDate(prev.status, prev.actual_end_date, input.status);
  db.prepare(
    `UPDATE projects
     SET name=@name, description=@description, start_date=@start_date, target_end_date=@target_end_date,
         actual_end_date=@actual_end_date, status=@status, color=@color, progress_mode=@progress_mode,
         manual_progress=@manual_progress, updated_at=@now
     WHERE id=@id`,
  ).run({
    id,
    name: input.name,
    description: input.description ?? null,
    start_date: input.start_date,
    target_end_date: input.target_end_date ?? null,
    actual_end_date: actualEnd,
    status: input.status,
    color: input.color,
    progress_mode: input.progress_mode,
    manual_progress: input.manual_progress,
    now: nowIso(),
  });
  return getProject(id);
}

export function deleteProject(id: number, taskAction: ProjectDeleteAction = 'unlink'): { deletedTasks: number; unlinkedTasks: number } {
  const db = getDb();
  const prev = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!prev) throw notFound('โปรเจกต์');

  let deletedTasks = 0;
  let unlinkedTasks = 0;
  const now = nowIso();

  db.transaction(() => {
    if (taskAction === 'delete') {
      deletedTasks = db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id).changes;
    } else {
      unlinkedTasks = db
        .prepare('UPDATE tasks SET project_id = NULL, milestone_id = NULL, updated_at = ? WHERE project_id = ?')
        .run(now, id).changes;
    }
    db.prepare('DELETE FROM milestones WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM project_updates WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  })();

  return { deletedTasks, unlinkedTasks };
}

/** คัดลอกโปรเจกต์และโครงสร้าง Milestone เป็นแม่แบบ (Template) สำหรับโปรเจกต์ใหม่ */
export function cloneProjectAsTemplate(id: number, customName?: string, customStartDate?: string): ProjectDetail {
  const db = getDb();
  const src = getProject(id);
  const srcMilestones = listProjectMilestones(id);
  const newStart = customStartDate || todayStr();
  const shiftDays = dayjs(newStart).diff(dayjs(src.start_date), 'day');
  const newTargetEnd = src.target_end_date ? addDays(src.target_end_date, shiftDays) : null;
  const now = nowIso();

  let newProjectId = 0;
  db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO projects (name, description, start_date, target_end_date, actual_end_date, status, color,
          progress_mode, manual_progress, created_at, updated_at)
         VALUES (@name, @description, @start_date, @target_end_date, NULL, 'planning', @color,
          'auto', 0, @now, @now)`,
      )
      .run({
        name: (customName?.trim() || `${src.name} (สำเนา)`).slice(0, 200),
        description: src.description,
        start_date: newStart,
        target_end_date: newTargetEnd,
        color: src.color,
        now,
      });
    newProjectId = Number(info.lastInsertRowid);

    const insertMs = db.prepare(
      `INSERT INTO milestones (project_id, title, description, due_date, status, completed_at, sort_order, created_at, updated_at)
       VALUES (@project_id, @title, @description, @due_date, 'todo', NULL, @sort_order, @now, @now)`,
    );
    for (const m of srcMilestones) {
      insertMs.run({
        project_id: newProjectId,
        title: m.title,
        description: m.description,
        due_date: m.due_date ? addDays(m.due_date, shiftDays) : null,
        sort_order: m.sort_order,
        now,
      });
    }
  })();

  return getProjectDetail(newProjectId);
}

/** ===== การจัดการ Milestone ===== */

export function createMilestone(projectId: number, input: MilestoneInputParsed): MilestoneWithStats {
  const db = getDb();
  const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!proj) throw notFound('โปรเจกต์');

  const now = nowIso();
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM milestones WHERE project_id = ?').get(projectId) as { m: number }
  ).m;

  const info = db
    .prepare(
      `INSERT INTO milestones (project_id, title, description, due_date, status, completed_at, sort_order, created_at, updated_at)
       VALUES (@project_id, @title, @description, @due_date, @status, @completed_at, @sort_order, @now, @now)`,
    )
    .run({
      project_id: projectId,
      title: input.title,
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      status: input.status,
      completed_at: resolveMilestoneCompletedAt(null, null, input.status),
      sort_order: input.sort_order || maxOrder + 1,
      now,
    });

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
  return getMilestoneWithStats(Number(info.lastInsertRowid));
}

export function updateMilestone(id: number, input: MilestoneInputParsed): MilestoneWithStats {
  const db = getDb();
  const prev = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;
  if (!prev) throw notFound('Milestone');

  const now = nowIso();
  db.prepare(
    `UPDATE milestones
     SET title=@title, description=@description, due_date=@due_date, status=@status,
         completed_at=@completed_at, sort_order=@sort_order, updated_at=@now
     WHERE id=@id`,
  ).run({
    id,
    title: input.title,
    description: input.description ?? null,
    due_date: input.due_date ?? null,
    status: input.status,
    completed_at: resolveMilestoneCompletedAt(prev.status, prev.completed_at, input.status),
    sort_order: input.sort_order ?? prev.sort_order,
    now,
  });

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, prev.project_id);
  return getMilestoneWithStats(id);
}

export function setMilestoneStatus(id: number, status: TaskStatus): MilestoneWithStats {
  const db = getDb();
  const prev = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;
  if (!prev) throw notFound('Milestone');

  const now = nowIso();
  db.prepare('UPDATE milestones SET status=?, completed_at=?, updated_at=? WHERE id=?').run(
    status,
    resolveMilestoneCompletedAt(prev.status, prev.completed_at, status),
    now,
    id,
  );
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, prev.project_id);
  return getMilestoneWithStats(id);
}

export function deleteMilestone(id: number): void {
  const db = getDb();
  const prev = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Milestone | undefined;
  if (!prev) throw notFound('Milestone');

  const now = nowIso();
  db.transaction(() => {
    db.prepare('UPDATE tasks SET milestone_id = NULL, updated_at = ? WHERE milestone_id = ?').run(now, id);
    db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, prev.project_id);
  })();
}

/**
 * ตรวจว่าหลังจากงานเปลี่ยนเป็น done แล้ว งานทั้งหมดใน Milestone นั้นเสร็จครบ 100% หรือยัง
 * ถ้าเสร็จครบและ Milestone ยังไม่ได้เป็น done จะส่งข้อมูลกลับไปให้หน้าเว็บถามผู้ใช้
 */
export function checkMilestoneCompletionPrompt(
  milestoneId: number | null | undefined,
  taskStatus: TaskStatus,
): { id: number; title: string; project_id: number } | null {
  if (!milestoneId || taskStatus !== 'done') return null;
  const db = getDb();
  const ms = db.prepare('SELECT * FROM milestones WHERE id = ?').get(milestoneId) as Milestone | undefined;
  if (!ms || ms.status === 'done') return null;

  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'done'), 0) AS done
       FROM tasks WHERE milestone_id = ?`,
    )
    .get(milestoneId) as { total: number; done: number };

  if (counts.total > 0 && counts.done === counts.total) {
    return { id: ms.id, title: ms.title, project_id: ms.project_id };
  }
  return null;
}

/** ===== บันทึกความคืบหน้ารายเดือน (เฟส 2) ===== */

export function listProjectUpdates(projectId: number): ProjectUpdate[] {
  return getDb()
    .prepare('SELECT * FROM project_updates WHERE project_id = ? ORDER BY period DESC')
    .all(projectId) as ProjectUpdate[];
}

export function getProjectUpdateByPeriod(projectId: number, period: string): ProjectUpdate | null {
  const row = getDb()
    .prepare('SELECT * FROM project_updates WHERE project_id = ? AND period = ?')
    .get(projectId, period) as ProjectUpdate | undefined;
  return row ?? null;
}

export function upsertProjectUpdate(projectId: number, input: ProjectUpdateInputParsed): ProjectUpdate {
  const db = getDb();
  const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!proj) throw notFound('โปรเจกต์');

  const now = nowIso();
  const existing = getProjectUpdateByPeriod(projectId, input.period);
  if (existing) {
    db.prepare(
      `UPDATE project_updates
       SET summary=@summary, issues=@issues, next_plan=@next_plan, updated_at=@now
       WHERE id=@id`,
    ).run({
      id: existing.id,
      summary: input.summary,
      issues: input.issues ?? null,
      next_plan: input.next_plan ?? null,
      now,
    });
  } else {
    db.prepare(
      `INSERT INTO project_updates (project_id, period, summary, issues, next_plan, created_at, updated_at)
       VALUES (@project_id, @period, @summary, @issues, @next_plan, @now, @now)`,
    ).run({
      project_id: projectId,
      period: input.period,
      summary: input.summary,
      issues: input.issues ?? null,
      next_plan: input.next_plan ?? null,
      now,
    });
  }

  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
  const saved = getProjectUpdateByPeriod(projectId, input.period);
  if (!saved) throw new AppError(500, 'ไม่สามารถบันทึกความคืบหน้าโปรเจกต์ได้');
  return saved;
}

export function deleteProjectUpdate(projectId: number, period: string): void {
  const db = getDb();
  const info = db.prepare('DELETE FROM project_updates WHERE project_id = ? AND period = ?').run(projectId, period);
  if (info.changes === 0) throw notFound('บันทึกความคืบหน้า');
}

