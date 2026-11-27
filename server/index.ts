import fs from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { nowIso } from '../shared/dates.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, getDb } from './db/connection.js';
import { logApp } from './logger.js';
import { setServerRuntimeInfo } from './routes/misc.js';

const MAX_PORT_RETRIES = 50;

function writeServerState(port: number): void {
  try {
    fs.mkdirSync(path.dirname(config.serverStatePath), { recursive: true });
    fs.writeFileSync(
      config.serverStatePath,
      JSON.stringify(
        {
          app: 'worklog-local',
          pid: process.pid,
          port,
          host: config.host,
          dbPath: config.dbPath,
          startedAt: nowIso(),
        },
        null,
        2,
      ),
      'utf8',
    );
  } catch (err) {
    logApp('WARN', 'ไม่สามารถเขียนไฟล์สถานะเซิร์ฟเวอร์', err);
  }
}

function removeServerState(): void {
  try {
    if (fs.existsSync(config.serverStatePath)) {
      const raw = JSON.parse(fs.readFileSync(config.serverStatePath, 'utf8'));
      if (!raw?.pid || raw.pid === process.pid) {
        fs.unlinkSync(config.serverStatePath);
      }
    }
  } catch {
    // ignore cleanup error
  }
}

let activeServer: Server | null = null;
let isShuttingDown = false;

export function shutdown(reason = 'SIGNAL'): void {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logApp('INFO', `กำลังปิดเซิร์ฟเวอร์อย่างปลอดภัย (${reason})`);

  const finish = () => {
    try {
      closeDb();
      removeServerState();
      logApp('INFO', 'บันทึกข้อมูลลงฐานข้อมูลและปิดเซิร์ฟเวอร์เรียบร้อยแล้ว');
    } catch (err) {
      logApp('ERROR', 'เกิดข้อผิดพลาดขณะปิดฐานข้อมูล', err);
    }
    process.exit(0);
  };

  if (activeServer) {
    activeServer.closeIdleConnections?.();
    activeServer.close(() => finish());
    setTimeout(() => {
      activeServer?.closeAllConnections?.();
      finish();
    }, 2000).unref();
  } else {
    finish();
  }
}

function startServer(portToTry: number, attempt = 0): void {
  const app = createApp();
  const srv = app.listen(portToTry, config.host, () => {
    activeServer = srv;
    setServerRuntimeInfo(portToTry, () => shutdown('API_SHUTDOWN'));
    writeServerState(portToTry);
    logApp('INFO', `เริ่มเซิร์ฟเวอร์สำเร็จที่ http://${config.host}:${portToTry} (ฐานข้อมูล: ${config.dbPath})`);

    console.log('');
    console.log('  Worklog พร้อมใช้งานแล้ว');
    console.log(`  เปิดเบราว์เซอร์ที่:  http://${config.host}:${portToTry}`);
    console.log(`  ฐานข้อมูล:          ${config.dbPath}`);
    console.log('  กด Ctrl + C หรือกดปุ่ม "ปิดโปรแกรม" ในหน้าเว็บเพื่อหยุดทำงาน');
    console.log('');
  });

  srv.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_RETRIES && process.env.STRICT_PORT !== '1') {
      const nextPort = portToTry + 1;
      logApp('WARN', `พอร์ต ${portToTry} ถูกใช้งานอยู่ ระบบกำลังสลับไปใช้พอร์ต ${nextPort} อัตโนมัติ`);
      startServer(nextPort, attempt + 1);
      return;
    }

    const msg =
      err.code === 'EADDRINUSE'
        ? `ไม่สามารถเริ่มโปรแกรมได้: พอร์ต ${config.port} ถึง ${portToTry} ถูกใช้งานอยู่ทั้งหมด กรุณาปิดโปรแกรมอื่นที่ใช้พอร์ตเหล่านี้`
        : `ไม่สามารถเริ่มโปรแกรมได้: ${err.message}`;
    logApp('ERROR', msg, err);
    console.error(msg);
    closeDb();
    process.exit(1);
  });
}

try {
  // เปิดฐานข้อมูลตั้งแต่เริ่ม เพื่อสร้างไฟล์และตารางอัตโนมัติ
  getDb();
  startServer(config.port);
} catch (err) {
  logApp('ERROR', 'เริ่มโปรแกรมไม่สำเร็จขณะเตรียมฐานข้อมูล', err);
  console.error('เริ่มโปรแกรมไม่สำเร็จ:', err);
  process.exit(1);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logApp('ERROR', 'เกิดข้อผิดพลาดที่ไม่คาดคิด (uncaughtException)', err);
  shutdown('uncaughtException');
});
