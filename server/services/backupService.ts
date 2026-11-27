import {
  backupSchema,
  settingsSchema,
  type BackupFile,
  type ImportMode,
  type Milestone,
  type Project,
  type ProjectUpdate,
  type Task,
} from '../../shared/schemas.js';
import { nowIso, toBangkokIso } from '../../shared/dates.js';
import { getDb } from '../db/connection.js';
import { getSettings, updateSettings } from './settingsService.js';

export function exportBackup(): BackupFile {
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY work_date ASC, id ASC').all() as Task[];
  const cats = db.prepare('SELECT name FROM categories ORDER BY name COLLATE NOCASE').all() as { name: string }[];
  const projects = db.prepare('SELECT * FROM projects ORDER BY id ASC').all() as Project[];
  const milestones = db.prepare('SELECT * FROM milestones ORDER BY project_id ASC, sort_order ASC, id ASC').all() as Milestone[];
  const projectUpdates = db.prepare('SELECT * FROM project_updates ORDER BY project_id ASC, period ASC').all() as ProjectUpdate[];
  const settings = getSettings();

  return {
    app: 'worklog-local',
    version: 2,
    exportedAt: nowIso(),
    tasks,
    categories: cats.map((c) => ({ name: c.name })),
    projects,
    milestones,
    project_updates: projectUpdates,
    settings: { yearFormat: settings.yearFormat, theme: settings.theme },
  };
}

export function importBackup(
  raw: unknown,
  mode: ImportMode = 'merge',
): { importedTasks: number; importedCategories: number; importedProjects: number } {
  const data = backupSchema.parse(raw);
  const db = getDb();
  const now = nowIso();

  let importedTasks = 0;
  let importedProjects = 0;
  const catSet = new Set<string>();

  for (const c of data.categories ?? []) {
    if (c.name.trim()) catSet.add(c.name.trim());
  }
  for (const t of data.tasks) {
    if (t.category?.trim()) catSet.add(t.category.trim());
  }

  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  const insertProject = db.prepare(
    `INSERT INTO projects (name, description, start_date, target_end_date, actual_end_date, status, color,
      progress_mode, manual_progress, created_at, updated_at)
     VALUES (@name, @description, @start_date, @target_end_date, @actual_end_date, @status, @color,
      @progress_mode, @manual_progress, @created_at, @updated_at)`,
  );
  const insertMilestone = db.prepare(
    `INSERT INTO milestones (project_id, title, description, due_date, status, completed_at, sort_order, created_at, updated_at)
     VALUES (@project_id, @title, @description, @due_date, @status, @completed_at, @sort_order, @created_at, @updated_at)`,
  );
  const insertUpdate = db.prepare(
    `INSERT INTO project_updates (project_id, period, summary, issues, next_plan, created_at, updated_at)
     VALUES (@project_id, @period, @summary, @issues, @next_plan, @created_at, @updated_at)
     ON CONFLICT(project_id, period) DO UPDATE SET
       summary = excluded.summary,
       issues = excluded.issues,
       next_plan = excluded.next_plan,
       updated_at = excluded.updated_at`,
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, work_date, work_end_date, due_date, category, priority, status, completed_at,
      result_note, evidence_link, project_id, milestone_id, created_at, updated_at)
     VALUES (@title, @description, @work_date, @work_end_date, @due_date, @category, @priority, @status, @completed_at,
      @result_note, @evidence_link, @project_id, @milestone_id, @created_at, @updated_at)`,
  );

  db.transaction(() => {
    if (mode === 'replace') {
      db.prepare('DELETE FROM tasks').run();
      db.prepare('DELETE FROM project_updates').run();
      db.prepare('DELETE FROM milestones').run();
      db.prepare('DELETE FROM projects').run();
      db.prepare('DELETE FROM categories').run();
    }

    for (const name of catSet) {
      insertCat.run(name);
    }

    // แผนที่เชื่อม old ID -> new ID เพื่อให้การผูกโปรเจกต์และ Milestone ของงานยังคงถูกต้อง
    const projectIdMap = new Map<number, number>();
    const milestoneIdMap = new Map<number, number>();

    for (const p of data.projects ?? []) {
      const info = insertProject.run({
        name: p.name.trim(),
        description: p.description?.trim() || null,
        start_date: p.start_date,
        target_end_date: p.target_end_date || null,
        actual_end_date: p.status === 'done' ? p.actual_end_date || p.target_end_date || p.start_date : null,
        status: p.status,
        color: p.color || '#0044CC',
        progress_mode: p.progress_mode || 'auto',
        manual_progress: p.manual_progress ?? 0,
        created_at: (p.created_at ? toBangkokIso(p.created_at) : null) ?? now,
        updated_at: (p.updated_at ? toBangkokIso(p.updated_at) : null) ?? now,
      });
      projectIdMap.set(p.id, Number(info.lastInsertRowid));
      importedProjects++;
    }

    for (const m of data.milestones ?? []) {
      const mappedProjectId = projectIdMap.get(m.project_id);
      if (!mappedProjectId) continue;
      let completedAt: string | null = null;
      if (m.status === 'done') {
        completedAt = (m.completed_at ? toBangkokIso(m.completed_at) : null) ?? now;
      }
      const info = insertMilestone.run({
        project_id: mappedProjectId,
        title: m.title.trim(),
        description: m.description?.trim() || null,
        due_date: m.due_date || null,
        status: m.status,
        completed_at: completedAt,
        sort_order: m.sort_order ?? 0,
        created_at: (m.created_at ? toBangkokIso(m.created_at) : null) ?? now,
        updated_at: (m.updated_at ? toBangkokIso(m.updated_at) : null) ?? now,
      });
      milestoneIdMap.set(m.id, Number(info.lastInsertRowid));
    }

    for (const u of data.project_updates ?? []) {
      const mappedProjectId = projectIdMap.get(u.project_id);
      if (!mappedProjectId) continue;
      insertUpdate.run({
        project_id: mappedProjectId,
        period: u.period,
        summary: u.summary.trim(),
        issues: u.issues?.trim() || null,
        next_plan: u.next_plan?.trim() || null,
        created_at: (u.created_at ? toBangkokIso(u.created_at) : null) ?? now,
        updated_at: (u.updated_at ? toBangkokIso(u.updated_at) : null) ?? now,
      });
    }

    for (const t of data.tasks) {
      let completedAt: string | null = null;
      if (t.status === 'done') {
        completedAt = (t.completed_at ? toBangkokIso(t.completed_at) : null) ?? `${t.work_date}T17:00:00+07:00`;
      }
      const mappedProjectId = t.project_id ? (projectIdMap.get(t.project_id) ?? null) : null;
      const mappedMilestoneId = t.milestone_id ? (milestoneIdMap.get(t.milestone_id) ?? null) : null;

      insertTask.run({
        title: t.title.trim(),
        description: t.description?.trim() || null,
        work_date: t.work_date,
        work_end_date: t.work_end_date || null,
        due_date: t.due_date || null,
        category: t.category?.trim() || null,
        priority: t.priority,
        status: t.status,
        completed_at: completedAt,
        result_note: t.result_note?.trim() || null,
        evidence_link: t.evidence_link?.trim() || null,
        project_id: mappedProjectId,
        milestone_id: mappedMilestoneId,
        created_at: (t.created_at ? toBangkokIso(t.created_at) : null) ?? now,
        updated_at: (t.updated_at ? toBangkokIso(t.updated_at) : null) ?? now,
      });
      importedTasks++;
    }

    if (data.settings) {
      const parsedSettings = settingsSchema.safeParse(data.settings);
      if (parsedSettings.success) {
        updateSettings(parsedSettings.data);
      }
    }
  })();

  return { importedTasks, importedCategories: catSet.size, importedProjects };
}
