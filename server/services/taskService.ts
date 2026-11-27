import type { Task, TaskFilter, TaskInputParsed, TaskStatus } from '../../shared/schemas.js';
import { addDays, nowIso, todayStr } from '../../shared/dates.js';
import { getDb } from '../db/connection.js';
import { AppError, notFound } from '../errors.js';
import { ensureCategory } from './categoryService.js';
import { checkMilestoneCompletionPrompt } from './projectService.js';

/** คำนวณ completed_at ตามกติกา: บันทึกเมื่อเปลี่ยนเป็น done, ล้างเมื่อเปลี่ยนกลับ */
export function resolveCompletedAt(prevStatus: TaskStatus | null, prevCompletedAt: string | null, nextStatus: TaskStatus): string | null {
  if (nextStatus !== 'done') return null;
  if (prevStatus === 'done' && prevCompletedAt) return prevCompletedAt;
  return nowIso();
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SELECT_TASK_SQL = `
  SELECT t.*,
         p.name  AS project_name,
         p.color AS project_color,
         m.title AS milestone_title
  FROM tasks t
  LEFT JOIN projects p   ON p.id = t.project_id
  LEFT JOIN milestones m ON m.id = t.milestone_id
`;

export function listTasks(filter: TaskFilter = {}): Task[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.date) {
    where.push('(t.work_date <= @date AND COALESCE(t.work_end_date, t.work_date) >= @date)');
    params.date = filter.date;
  }
  if (filter.from) {
    where.push('COALESCE(t.work_end_date, t.work_date) >= @from');
    params.from = filter.from;
  }
  if (filter.to) {
    where.push('t.work_date <= @to');
    params.to = filter.to;
  }
  if (filter.status) {
    where.push('t.status = @status');
    params.status = filter.status;
  }
  if (filter.pending) {
    where.push("t.status <> 'done'");
  }
  if (filter.category) {
    if (filter.category === '__none__') {
      where.push("(t.category IS NULL OR t.category = '')");
    } else {
      where.push('t.category = @category');
      params.category = filter.category;
    }
  }
  if (filter.project_id) {
    if (filter.project_id === '__none__') {
      where.push('t.project_id IS NULL');
    } else {
      where.push('t.project_id = @project_id');
      params.project_id = Number(filter.project_id);
    }
  }
  if (filter.milestone_id) {
    if (filter.milestone_id === '__none__') {
      where.push('t.milestone_id IS NULL');
    } else {
      where.push('t.milestone_id = @milestone_id');
      params.milestone_id = Number(filter.milestone_id);
    }
  }
  if (filter.q) {
    where.push("(t.title LIKE @q ESCAPE '\\' OR IFNULL(t.description,'') LIKE @q ESCAPE '\\')");
    params.q = `%${escapeLike(filter.q)}%`;
  }

  const sql = `
    ${SELECT_TASK_SQL}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.work_date DESC,
      CASE t.status WHEN 'doing' THEN 0 WHEN 'review' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      t.id DESC`;
  return getDb().prepare(sql).all(params) as Task[];
}

export function getTask(id: number): Task {
  const row = getDb()
    .prepare(`${SELECT_TASK_SQL} WHERE t.id = ?`)
    .get(id) as Task | undefined;
  if (!row) throw notFound('งาน');
  return row;
}

function validateProjectAndMilestone(projectId: number | null, milestoneId: number | null): { project_id: number | null; milestone_id: number | null } {
  const db = getDb();
  let resolvedProjectId = projectId;
  const resolvedMilestoneId = milestoneId;

  if (resolvedProjectId !== null) {
    const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(resolvedProjectId);
    if (!p) throw new AppError(400, 'ไม่พบโปรเจกต์ที่เลือก', { project_id: 'ไม่พบโปรเจกต์ที่เลือก' });
  }

  if (resolvedMilestoneId !== null) {
    const m = db.prepare('SELECT id, project_id FROM milestones WHERE id = ?').get(resolvedMilestoneId) as
      | { id: number; project_id: number }
      | undefined;
    if (!m) throw new AppError(400, 'ไม่พบ Milestone ที่เลือก', { milestone_id: 'ไม่พบ Milestone ที่เลือก' });
    if (resolvedProjectId !== null && m.project_id !== resolvedProjectId) {
      throw new AppError(400, 'Milestone ที่เลือกไม่ได้อยู่ในโปรเจกต์นี้', { milestone_id: 'Milestone ไม่ตรงกับโปรเจกต์' });
    }
    resolvedProjectId = m.project_id;
  }

  return { project_id: resolvedProjectId, milestone_id: resolvedMilestoneId };
}

function normalize(input: TaskInputParsed) {
  const { project_id, milestone_id } = validateProjectAndMilestone(input.project_id ?? null, input.milestone_id ?? null);
  return {
    title: input.title,
    description: input.description ?? null,
    work_date: input.work_date,
    work_end_date: input.work_end_date && input.work_end_date !== input.work_date ? input.work_end_date : null,
    due_date: input.due_date ?? null,
    category: input.category ?? null,
    priority: input.priority,
    status: input.status,
    result_note: input.result_note ?? null,
    evidence_link: input.evidence_link ?? null,
    project_id,
    milestone_id,
  };
}

export function createTask(input: TaskInputParsed): Task {
  const db = getDb();
  const data = normalize(input);
  const now = nowIso();
  if (data.category) ensureCategory(data.category);
  const info = db
    .prepare(
      `INSERT INTO tasks (title, description, work_date, work_end_date, due_date, category, priority, status, completed_at,
        result_note, evidence_link, project_id, milestone_id, created_at, updated_at)
       VALUES (@title, @description, @work_date, @work_end_date, @due_date, @category, @priority, @status, @completed_at,
        @result_note, @evidence_link, @project_id, @milestone_id, @now, @now)`,
    )
    .run({ ...data, completed_at: resolveCompletedAt(null, null, data.status), now });

  if (data.project_id) {
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, data.project_id);
  }

  const saved = getTask(Number(info.lastInsertRowid));
  const prompt = checkMilestoneCompletionPrompt(saved.milestone_id, saved.status);
  return prompt ? { ...saved, promptCompleteMilestone: prompt } : saved;
}

export function updateTask(id: number, input: TaskInputParsed): Task {
  const db = getDb();
  const prev = getTask(id);
  const data = normalize(input);
  const now = nowIso();
  if (data.category) ensureCategory(data.category);
  db.prepare(
    `UPDATE tasks SET title=@title, description=@description, work_date=@work_date, work_end_date=@work_end_date,
      due_date=@due_date, category=@category, priority=@priority, status=@status, completed_at=@completed_at,
      result_note=@result_note, evidence_link=@evidence_link, project_id=@project_id, milestone_id=@milestone_id,
      updated_at=@now
     WHERE id=@id`,
  ).run({
    ...data,
    id,
    completed_at: resolveCompletedAt(prev.status, prev.completed_at, data.status),
    now,
  });

  if (data.project_id) {
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, data.project_id);
  }
  if (prev.project_id && prev.project_id !== data.project_id) {
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, prev.project_id);
  }

  const saved = getTask(id);
  const prompt = checkMilestoneCompletionPrompt(saved.milestone_id, saved.status);
  return prompt ? { ...saved, promptCompleteMilestone: prompt } : saved;
}

export function setTaskStatus(id: number, status: TaskStatus): Task {
  const db = getDb();
  const prev = getTask(id);
  const now = nowIso();
  db.prepare('UPDATE tasks SET status=?, completed_at=?, updated_at=? WHERE id=?').run(
    status,
    resolveCompletedAt(prev.status, prev.completed_at, status),
    now,
    id,
  );
  if (prev.project_id) {
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, prev.project_id);
  }
  const saved = getTask(id);
  const prompt = checkMilestoneCompletionPrompt(saved.milestone_id, saved.status);
  return prompt ? { ...saved, promptCompleteMilestone: prompt } : saved;
}

export function deleteTask(id: number): void {
  const info = getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (info.changes === 0) throw notFound('งาน');
}

/** ลบงานหลายรายการพร้อมกันในครั้งเดียว (ภายใต้ transaction เดียว) */
export function deleteTasksBulk(ids: number[]): { deleted: number } {
  const db = getDb();
  const uniqueIds = [...new Set(ids)];
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  let deleted = 0;
  db.transaction(() => {
    for (const id of uniqueIds) {
      deleted += stmt.run(id).changes;
    }
  })();
  return { deleted };
}

/**
 * เลื่อนงานค้างไปวันถัดไป: วันที่ใหม่ = วันถัดจาก work_date เดิม
 * แต่ถ้ายังเป็นอดีต ให้ย้ายมาเป็นวันนี้แทน (งานที่เสร็จแล้วจะถูกข้าม)
 */
export function postponeTasks(ids: number[]): { updated: Task[]; skipped: number[] } {
  const db = getDb();
  const today = todayStr();
  const updated: Task[] = [];
  const skipped: number[] = [];
  const stmt = db.prepare('UPDATE tasks SET work_date=?, updated_at=? WHERE id=?');
  db.transaction(() => {
    for (const id of [...new Set(ids)]) {
      const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
      if (!t || t.status === 'done') {
        skipped.push(id);
        continue;
      }
      let next = addDays(t.work_date, 1);
      if (next < today) next = today;
      stmt.run(next, nowIso(), id);
      updated.push({ ...t, work_date: next });
    }
  })();
  return { updated, skipped };
}
