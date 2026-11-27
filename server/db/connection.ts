import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

const req = typeof require === 'function' ? require : createRequire(fileURLToPath(import.meta.url));
const { DatabaseSync } = req('node:sqlite') as typeof import('node:sqlite');

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface DB {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
}

function extractNamedParams(sql: string): Set<string> {
  const names = new Set<string>();
  const re = /[@:$]([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    names.add(m[1]);
  }
  return names;
}

function normalizeParams(params: unknown[], namedParams: Set<string>): SQLInputValue[] {
  if (params.length === 0) return [];
  if (
    params.length === 1 &&
    typeof params[0] === 'object' &&
    params[0] !== null &&
    !Array.isArray(params[0]) &&
    !(params[0] instanceof Uint8Array)
  ) {
    const rawObj = params[0] as Record<string, unknown>;
    if (namedParams.size === 0) return [];
    const filtered: Record<string, SQLInputValue> = {};
    for (const key of namedParams) {
      const val = rawObj[key];
      filtered[key] = (val === undefined ? null : val) as SQLInputValue;
    }
    return [filtered as unknown as SQLInputValue];
  }
  return params.map((p) => (p === undefined ? null : (p as SQLInputValue)));
}

class SqliteDatabase implements DB {
  private raw: DatabaseSyncType;
  private txDepth = 0;
  private isOpen = true;

  constructor(private filePath: string) {
    this.raw = new DatabaseSync(filePath);
  }

  prepare(sql: string): Statement {
    const stmt = this.raw.prepare(sql);
    stmt.setAllowBareNamedParameters(true);
    const namedParams = extractNamedParams(sql);

    return {
      run: (...params: unknown[]): RunResult => {
        const res = stmt.run(...normalizeParams(params, namedParams));
        return {
          changes: Number(res.changes),
          lastInsertRowid: Number(res.lastInsertRowid),
        };
      },
      get: (...params: unknown[]): unknown => {
        const row = stmt.get(...normalizeParams(params, namedParams)) as Record<string, unknown> | undefined;
        return row ? { ...row } : undefined;
      },
      all: (...params: unknown[]): unknown[] => {
        const rows = stmt.all(...normalizeParams(params, namedParams)) as Record<string, unknown>[];
        return rows.map((r) => ({ ...r }));
      },
    };
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    if (options?.simple) {
      const row = this.raw.prepare(`PRAGMA ${sql}`).get() as Record<string, unknown> | undefined;
      if (!row) return undefined;
      const firstKey = Object.keys(row)[0];
      return firstKey !== undefined ? row[firstKey] : undefined;
    }
    this.raw.exec(`PRAGMA ${sql}`);
    return undefined;
  }

  transaction<T extends (...args: never[]) => unknown>(fn: T): T {
    const wrapped = (...args: Parameters<T>): ReturnType<T> => {
      const depth = this.txDepth++;
      const sp = `sp_${depth}`;
      this.raw.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
      try {
        const result = fn(...args) as ReturnType<T>;
        this.raw.exec(depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${sp}`);
        return result;
      } catch (err) {
        try {
          this.raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${sp}`);
        } catch {
          // ignore rollback error
        }
        throw err;
      } finally {
        this.txDepth--;
      }
    };
    return wrapped as T;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    try {
      if (this.filePath !== ':memory:') {
        this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      }
    } catch {
      // ignore checkpoint error on close
    }
    this.raw.close();
  }
}

let instance: DB | null = null;

/** เปิดฐานข้อมูล (สร้างโฟลเดอร์/ไฟล์/ตารางอัตโนมัติถ้ายังไม่มี) */
export function openDatabase(filePath: string = config.dbPath): DB {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new SqliteDatabase(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db, filePath);
  return db;
}

/** ใช้ฐานข้อมูลตัวเดียวทั้งแอป */
export function getDb(): DB {
  if (!instance) instance = openDatabase();
  return instance;
}

/** ใช้ในการทดสอบ: กำหนดฐานข้อมูลเอง */
export function setDb(db: DB): void {
  instance = db;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
