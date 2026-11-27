import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveCurrentDir(): string {
  if (typeof __dirname === 'string') return __dirname;
  return path.dirname(fileURLToPath(import.meta.url));
}

const currentDir = resolveCurrentDir();
const rootDir = process.env.WORKLOG_ROOT ? path.resolve(process.env.WORKLOG_ROOT) : path.resolve(currentDir, '..');

function resolveDistDir(): string {
  const candidates = [
    path.join(rootDir, 'app', 'dist'),
    path.join(rootDir, 'dist'),
    path.join(currentDir, 'dist'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return path.join(rootDir, 'dist');
}

const dbPath = process.env.WORKLOG_DB ? path.resolve(process.env.WORKLOG_DB) : path.join(rootDir, 'data', 'worklog.db');
const logPath = process.env.WORKLOG_LOG ? path.resolve(process.env.WORKLOG_LOG) : path.join(rootDir, 'logs', 'app.log');
const serverStatePath = path.join(path.dirname(dbPath), 'server.json');

/** ค่าตั้งของเซิร์ฟเวอร์ (เปลี่ยนพอร์ตได้ด้วยตัวแปร PORT) */
export const config = {
  rootDir,
  /** รับการเชื่อมต่อเฉพาะเครื่องนี้เท่านั้น — ห้ามเปลี่ยนเป็น 0.0.0.0 */
  host: '127.0.0.1',
  port: Number(process.env.PORT) || 3000,
  dbPath,
  logPath,
  serverStatePath,
  distDir: resolveDistDir(),
};
