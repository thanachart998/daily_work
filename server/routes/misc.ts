import { Router, type Request } from 'express';
import { z } from 'zod';
import { importModeSchema, monthString, settingsSchema } from '../../shared/schemas.js';
import { currentMonth } from '../../shared/dates.js';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { logApp } from '../logger.js';
import { exportBackup, importBackup } from '../services/backupService.js';
import { getCalendar, getDashboard } from '../services/dashboardService.js';
import { getMonthlyReport } from '../services/reportService.js';
import { getSettings, updateSettings } from '../services/settingsService.js';
import { seedSampleData } from '../services/seedService.js';

let activePort = config.port;
let shutdownHandler: (() => void) | null = null;

export function setServerRuntimeInfo(port: number, onShutdown: () => void): void {
  activePort = port;
  shutdownHandler = onShutdown;
}

export function getActivePort(): number {
  return activePort;
}

function isLoopback(req: Request): boolean {
  const addr = req.socket?.remoteAddress || req.ip || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/** เส้นทางอื่นๆ: ภาพรวม ปฏิทิน รายงาน ตั้งค่า สำรองข้อมูล และปิดโปรแกรม */
export const miscRouter = Router();

miscRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'worklog-local',
    pid: process.pid,
    port: activePort,
    dbPath: config.dbPath,
  });
});

miscRouter.get('/dashboard', (_req, res) => {
  res.json(getDashboard());
});

miscRouter.get('/calendar', (req, res) => {
  const month = monthString.parse(req.query.month ?? currentMonth());
  res.json(getCalendar(month));
});

miscRouter.get('/reports/monthly', (req, res) => {
  const month = monthString.parse(req.query.month ?? currentMonth());
  res.json(getMonthlyReport(month));
});

miscRouter.get('/settings', (_req, res) => {
  res.json(getSettings());
});

miscRouter.put('/settings', (req, res) => {
  res.json(updateSettings(settingsSchema.parse(req.body)));
});

miscRouter.post('/sample-data', (_req, res) => {
  res.status(201).json(seedSampleData());
});

miscRouter.get('/backup', (_req, res) => {
  res.json(exportBackup());
});

const importPayloadSchema = z.object({
  mode: importModeSchema.default('merge'),
  data: z.unknown(),
});

miscRouter.post('/backup/import', (req, res) => {
  const { mode, data } = importPayloadSchema.parse(req.body ?? {});
  const result = importBackup(data ?? req.body, mode);
  res.json(result);
});

miscRouter.post('/shutdown', (req, res) => {
  if (!isLoopback(req)) {
    throw new AppError(403, 'อนุญาตให้สั่งปิดโปรแกรมเฉพาะจากเครื่องนี้ (127.0.0.1) เท่านั้น');
  }
  logApp('INFO', 'ได้รับคำสั่งปิดโปรแกรมจากหน้าเว็บ (/api/shutdown)');
  res.json({ ok: true, message: 'กำลังปิดโปรแกรมอย่างปลอดภัยและบันทึกข้อมูลเรียบร้อยแล้ว' });
  res.on('finish', () => {
    if (shutdownHandler) {
      setTimeout(() => shutdownHandler?.(), 50);
    }
  });
});
