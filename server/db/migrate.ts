import fs from 'node:fs';
import type { DB } from './connection.js';

/**
 * Migration แบบเรียงเวอร์ชัน ใช้ PRAGMA user_version เก็บเวอร์ชันปัจจุบัน
 * เพิ่ม migration ใหม่ต่อท้ายอาร์เรย์เท่านั้น ห้ามแก้ของเดิม
 * ก่อนรัน migration บนไฟล์ฐานข้อมูลที่มีข้อมูลอยู่ จะสำรองไฟล์อัตโนมัติเสมอ
 */
export const migrations: string[] = [
  // v1: โครงสร้างเริ่มต้น
  `
  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    description   TEXT,
    work_date     TEXT    NOT NULL CHECK (work_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    due_date      TEXT    CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    category      TEXT,
    priority      TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
    status        TEXT    NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo','doing','done')),
    completed_at  TEXT,
    result_note   TEXT,
    evidence_link TEXT,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_work_date    ON tasks(work_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_status       ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_date     ON tasks(due_date);

  CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('yearFormat', 'BE');
  INSERT OR IGNORE INTO categories (name) VALUES ('งานประจำ'), ('ประชุม'), ('โครงการ'), ('เอกสาร');
  `,

  // v2 (เฟส 1): ตารางโปรเจกต์ (projects), Milestone (milestones) และการผูกงานเข้ากับโปรเจกต์
  `
  CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    description     TEXT,
    start_date      TEXT    NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    target_end_date TEXT    CHECK (target_end_date IS NULL OR target_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    actual_end_date TEXT    CHECK (actual_end_date IS NULL OR actual_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('planning','active','on_hold','done','cancelled')),
    color           TEXT    NOT NULL DEFAULT '#0044CC',
    progress_mode   TEXT    NOT NULL DEFAULT 'auto' CHECK (progress_mode IN ('auto','manual')),
    manual_progress INTEGER NOT NULL DEFAULT 0 CHECK (manual_progress >= 0 AND manual_progress <= 100),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

  CREATE TABLE IF NOT EXISTS milestones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    description  TEXT,
    due_date     TEXT    CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    status       TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
    completed_at TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
  CREATE INDEX IF NOT EXISTS idx_milestones_due_date   ON milestones(due_date);

  ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
  ALTER TABLE tasks ADD COLUMN milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_tasks_project_id   ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id);
  `,

  // v3 (เฟส 2): ตารางบันทึกความคืบหน้ารายเดือนของโปรเจกต์ (project_updates)
  `
  CREATE TABLE IF NOT EXISTS project_updates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    period     TEXT    NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    summary    TEXT    NOT NULL CHECK (length(trim(summary)) > 0),
    issues     TEXT,
    next_plan  TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE(project_id, period)
  );
  CREATE INDEX IF NOT EXISTS idx_project_updates_project_period ON project_updates(project_id, period);
  `,

  // v4 (เฟส 3): รองรับงานหลายวันต่อเนื่อง (work_end_date)
  `
  ALTER TABLE tasks ADD COLUMN work_end_date TEXT CHECK (work_end_date IS NULL OR work_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
  CREATE INDEX IF NOT EXISTS idx_tasks_work_end_date ON tasks(work_end_date);
  `,

  // v5: เพิ่มสถานะงาน "รอ ตรวจสอบ/แก้ไข" (review) ให้ tasks และ milestones
  `
  CREATE TABLE tasks_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    description   TEXT,
    work_date     TEXT    NOT NULL CHECK (work_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    work_end_date TEXT    CHECK (work_end_date IS NULL OR work_end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    due_date      TEXT    CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    category      TEXT,
    priority      TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
    status        TEXT    NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo','doing','review','done')),
    completed_at  TEXT,
    result_note   TEXT,
    evidence_link TEXT,
    project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    milestone_id  INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
  );

  INSERT INTO tasks_new (
    id, title, description, work_date, work_end_date, due_date, category, priority, status, completed_at,
    result_note, evidence_link, project_id, milestone_id, created_at, updated_at
  )
  SELECT
    id,
    title,
    description,
    work_date,
    work_end_date,
    due_date,
    category,
    priority,
    status,
    CASE WHEN status = 'done' AND completed_at IS NULL THEN updated_at ELSE completed_at END,
    result_note,
    evidence_link,
    project_id,
    milestone_id,
    created_at,
    updated_at
  FROM tasks;

  DROP TABLE tasks;
  ALTER TABLE tasks_new RENAME TO tasks;

  CREATE INDEX IF NOT EXISTS idx_tasks_work_date     ON tasks(work_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_completed_at  ON tasks(completed_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_date      ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_project_id    ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id  ON tasks(milestone_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_work_end_date ON tasks(work_end_date);

  CREATE TABLE milestones_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    description  TEXT,
    due_date     TEXT    CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    status       TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done')),
    completed_at TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    CHECK ((status = 'done' AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL))
  );

  INSERT INTO milestones_new (
    id, project_id, title, description, due_date, status, completed_at, sort_order, created_at, updated_at
  )
  SELECT
    id,
    project_id,
    title,
    description,
    due_date,
    status,
    CASE WHEN status = 'done' AND completed_at IS NULL THEN updated_at ELSE completed_at END,
    sort_order,
    created_at,
    updated_at
  FROM milestones;

  DROP TABLE milestones;
  ALTER TABLE milestones_new RENAME TO milestones;

  CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
  CREATE INDEX IF NOT EXISTS idx_milestones_due_date   ON milestones(due_date);
  `,
];

let lastBackupPath: string | null = null;

export function getLastMigrationBackupPath(): string | null {
  return lastBackupPath;
}

/**
 * สำรองไฟล์ฐานข้อมูลอัตโนมัติก่อนทำการอัปเกรดโครงสร้าง (Migration)
 */
export function backupDatabaseBeforeMigrate(db: DB, filePath?: string): string | null {
  if (!filePath || filePath === ':memory:') return null;
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (stat.size === 0) return null;

  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // ignore if not in WAL mode yet
  }

  const currentVersion = (db.pragma('user_version', { simple: true }) as number) || 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `${filePath}.bak-v${currentVersion}-${stamp}`;
  const latestBackupFile = `${filePath}.bak`;

  fs.copyFileSync(filePath, backupFile);
  fs.copyFileSync(filePath, latestBackupFile);
  lastBackupPath = backupFile;
  return backupFile;
}

export function runMigrations(db: DB, filePath?: string, targetVersion: number = migrations.length): void {
  const current = (db.pragma('user_version', { simple: true }) as number) || 0;
  const maxVersion = Math.min(targetVersion, migrations.length);
  if (current >= maxVersion) return;

  // สำรองไฟล์อัตโนมัติก่อน migrate หากมีฐานข้อมูลเดิมอยู่แล้ว (current > 0 หรือมีไฟล์ขนาด > 0)
  if (filePath && filePath !== ':memory:' && current > 0) {
    backupDatabaseBeforeMigrate(db, filePath);
  }

  for (let v = current; v < maxVersion; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
