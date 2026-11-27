import type { Category } from '../../shared/schemas.js';
import { getDb } from '../db/connection.js';
import { AppError, notFound } from '../errors.js';

export function listCategories(): Category[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM tasks t WHERE t.category = c.name) AS task_count
       FROM categories c ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as Category[];
}

/** เพิ่มหมวดหมู่ถ้ายังไม่มี (ใช้ตอนบันทึกงานที่พิมพ์หมวดใหม่) */
export function ensureCategory(name: string): void {
  getDb().prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name.trim());
}

export function createCategory(name: string): Category {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (exists) throw new AppError(409, `มีหมวดหมู่ "${name}" อยู่แล้ว`);
  const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  return { id: Number(info.lastInsertRowid), name, task_count: 0 };
}

/** เปลี่ยนชื่อหมวดหมู่ และอัปเดตงานที่ใช้หมวดเดิมด้วย */
export function renameCategory(id: number, name: string): Category {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | undefined;
  if (!cur) throw notFound('หมวดหมู่');
  const dup = db.prepare('SELECT id FROM categories WHERE name = ? AND id <> ?').get(name, id);
  if (dup) throw new AppError(409, `มีหมวดหมู่ "${name}" อยู่แล้ว`);
  db.transaction(() => {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
    db.prepare('UPDATE tasks SET category = ? WHERE category = ?').run(name, cur.name);
  })();
  return { id, name };
}

/** ลบหมวดหมู่ งานที่ใช้หมวดนี้จะกลายเป็น "ไม่มีหมวดหมู่" */
export function deleteCategory(id: number): { affectedTasks: number } {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category | undefined;
  if (!cur) throw notFound('หมวดหมู่');
  let affected = 0;
  db.transaction(() => {
    affected = db.prepare('UPDATE tasks SET category = NULL WHERE category = ?').run(cur.name).changes;
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  })();
  return { affectedTasks: affected };
}
