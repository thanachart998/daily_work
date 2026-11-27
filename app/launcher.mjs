import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.WORKLOG_ROOT ? path.resolve(process.env.WORKLOG_ROOT) : path.resolve(currentDir, '..');
const dataDir = process.env.WORKLOG_DATA_DIR ? path.resolve(process.env.WORKLOG_DATA_DIR) : path.join(rootDir, 'data');
const logPath = process.env.WORKLOG_LOG ? path.resolve(process.env.WORKLOG_LOG) : path.join(rootDir, 'logs', 'app.log');
const serverStatePath = path.join(dataDir, 'server.json');
const lockPath = path.join(dataDir, 'launcher.lock');
const basePort = Number(process.env.PORT) || 3000;
const noBrowser = process.env.WORKLOG_NO_BROWSER === '1' || process.argv.includes('--no-browser');

function log(level, message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [LAUNCHER:${level}] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // ignore
  }
}

function showUserError(thaiMessage) {
  log('ERROR', thaiMessage);
  console.error(thaiMessage);
  if (process.env.WORKLOG_NO_DIALOG === '1' || noBrowser) return;

  try {
    if (process.platform === 'win32') {
      const vbsPath = path.join(dataDir, 'error-msg.vbs');
      fs.mkdirSync(dataDir, { recursive: true });
      const safeMsg = thaiMessage.replace(/"/g, '""').replace(/\r?\n/g, '" & vbCrLf & "');
      const vbsContent = `MsgBox "${safeMsg}", 16, "บันทึกงานประจำวัน - เปิดโปรแกรมไม่สำเร็จ"\r\n`;
      // Write UTF-16LE with BOM so VBScript displays Thai characters properly on all Windows locales
      const bom = Buffer.from([0xff, 0xfe]);
      const body = Buffer.from(vbsContent, 'utf16le');
      fs.writeFileSync(vbsPath, Buffer.concat([bom, body]));
      spawn('wscript.exe', ['//NoLogo', vbsPath], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    } else if (process.platform === 'darwin') {
      const safe = thaiMessage.replace(/"/g, '\\"');
      spawn('osascript', ['-e', `display alert "เปิดโปรแกรมไม่สำเร็จ" message "${safe}" as critical`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      spawn('zenity', ['--error', '--title=เปิดโปรแกรมไม่สำเร็จ', `--text=${thaiMessage}`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
  } catch {
    // ignore dialog error
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** ตรวจว่าพอร์ตนั้นมี Worklog server ทำงานอยู่หรือไม่ (ผ่าน /api/health) */
function probeWorklogHealth(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.ok === true && parsed.app === 'worklog-local') {
              resolve({ port: parsed.port || port, pid: parsed.pid });
              return;
            }
          } catch {
            // ignore
          }
          resolve(null);
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

/** ค้นหา Worklog server ที่รันอยู่แล้ว */
async function findRunningWorklogServer() {
  // 1. ตรวจจากไฟล์ server.json ก่อน
  try {
    if (fs.existsSync(serverStatePath)) {
      const state = JSON.parse(fs.readFileSync(serverStatePath, 'utf8'));
      if (state?.port) {
        const health = await probeWorklogHealth(Number(state.port));
        if (health) return health;
      }
    }
  } catch {
    // ignore invalid state file
  }

  // 2. สแกนพอร์ตใกล้เคียงเผื่อไฟล์สถานะถูกลบ
  const ports = Array.from({ length: 12 }, (_, i) => basePort + i);
  const results = await Promise.all(ports.map((p) => probeWorklogHealth(p, 500)));
  return results.find((r) => r !== null) || null;
}

/** ตรวจว่าพอร์ตว่างจริงหรือไม่ (ทั้งการลองเชื่อมต่อไปยัง 127.0.0.1 และการลองเปิดรับการเชื่อมต่อ) */
function isPortFree(port) {
  return new Promise((resolve) => {
    // ขั้นที่ 1: ลองเชื่อมต่อว่ามีโปรแกรมอื่นฟังอยู่บนพอร์ตนี้หรือไม่
    const socket = net.connect({ host: '127.0.0.1', port });
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    socket.setTimeout(250);
    socket.on('connect', () => {
      socket.destroy();
      // มีโปรแกรมอื่นเปิดพอร์ตนี้อยู่แล้ว
      done(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      tryBind();
    });
    socket.on('error', () => {
      socket.destroy();
      tryBind();
    });

    function tryBind() {
      const tester = net.createServer();
      tester.once('error', () => done(false));
      tester.once('listening', () => {
        tester.close(() => done(true));
      });
      tester.listen(port, '127.0.0.1');
    }
  });
}

async function findAvailablePort(startPort) {
  for (let p = startPort; p < startPort + 50; p++) {
    if (await isPortFree(p)) return p;
  }
  return null;
}

function openBrowser(url) {
  if (noBrowser) {
    console.log(`READY_URL=${url}`);
    return;
  }
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    log('WARN', `ไม่สามารถเปิดเบราว์เซอร์อัตโนมัติได้: ${err.message}`);
  }
}

function resolveServerEntry() {
  const candidates = [
    path.join(rootDir, 'app', 'server.cjs'),
    path.join(currentDir, 'server.cjs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return { args: ['--experimental-sqlite', '--no-warnings', c] };
    }
  }

  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverTs = path.join(rootDir, 'server', 'index.ts');
  if (fs.existsSync(tsxCli) && fs.existsSync(serverTs)) {
    return { args: ['--experimental-sqlite', '--no-warnings', tsxCli, serverTs] };
  }
  return null;
}

function acquireLock() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(lockPath)) {
      const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const age = Date.now() - (raw.time || 0);
      if (raw.pid && isProcessAlive(raw.pid) && age < 15000) {
        return false;
      }
    }
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, time: Date.now() }), 'utf8');
    return true;
  } catch {
    return true;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(lockPath)) {
      const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (raw.pid === process.pid) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch {
    // ignore
  }
}

async function main() {
  // 1. ตรวจว่ามี Worklog Server รันอยู่แล้วหรือไม่
  const existing = await findRunningWorklogServer();
  if (existing) {
    const url = `http://127.0.0.1:${existing.port}`;
    log('INFO', `เซิร์ฟเวอร์ทำงานอยู่แล้วที่ ${url} (PID ${existing.pid}) — เปิดเบราว์เซอร์โดยไม่เปิดเซิร์ฟเวอร์ซ้ำ`);
    openBrowser(url);
    return;
  }

  // ป้องกันการดับเบิลคลิกซ้ำติดกันขณะที่กำลังเริ่มเซิร์ฟเวอร์
  if (!acquireLock()) {
    log('INFO', 'กำลังรอการเริ่มเซิร์ฟเวอร์จากการคลิกก่อนหน้า...');
    for (let i = 0; i < 60; i++) {
      await sleep(200);
      const running = await findRunningWorklogServer();
      if (running) {
        const url = `http://127.0.0.1:${running.port}`;
        log('INFO', `เซิร์ฟเวอร์พร้อมแล้วที่ ${url} — เปิดเบราว์เซอร์`);
        openBrowser(url);
        return;
      }
    }
  }

  try {
    // ตรวจซ้ำอีกครั้งหลังได้ lock
    const doubleCheck = await findRunningWorklogServer();
    if (doubleCheck) {
      const url = `http://127.0.0.1:${doubleCheck.port}`;
      log('INFO', `เซิร์ฟเวอร์ทำงานอยู่แล้วที่ ${url} — เปิดเบราว์เซอร์โดยไม่เปิดเซิร์ฟเวอร์ซ้ำ`);
      openBrowser(url);
      return;
    }

    const entry = resolveServerEntry();
    if (!entry) {
      showUserError('ไม่พบไฟล์ตัวโปรแกรม (app/server.cjs หรือ server/index.ts) กรุณารันคำสั่ง npm run package หรือตรวจสอบโฟลเดอร์ app/');
      process.exitCode = 1;
      return;
    }

    // 2. เลือกพอร์ตที่ว่างอัตโนมัติ (ถ้าพอร์ตหลักถูกใช้งานอยู่จะเลือกพอร์ตถัดไป)
    const freePort = await findAvailablePort(basePort);
    if (!freePort) {
      showUserError(`ไม่สามารถเริ่มโปรแกรมได้ เนื่องจากพอร์ต ${basePort} ถึง ${basePort + 49} ถูกใช้งานอยู่ทั้งหมด`);
      process.exitCode = 1;
      return;
    }

    if (freePort !== basePort) {
      log('INFO', `พอร์ตหลัก ${basePort} ถูกใช้งานอยู่ ระบบเลือกพอร์ตถัดไปอัตโนมัติ: ${freePort}`);
    }

    log('INFO', `กำลังเริ่มเซิร์ฟเวอร์เบื้องหลังที่พอร์ต ${freePort}...`);

    const child = spawn(process.execPath, entry.args, {
      cwd: rootDir,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(freePort),
        WORKLOG_ROOT: rootDir,
        WORKLOG_DB: path.join(dataDir, 'worklog.db'),
        WORKLOG_LOG: logPath,
      },
    });
    child.unref();

    // 3. รอจนกว่า /api/health จะพร้อมแล้วจึงเปิดเบราว์เซอร์
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      const health = (await probeWorklogHealth(freePort, 500)) || (await findRunningWorklogServer());
      if (health) {
        const url = `http://127.0.0.1:${health.port}`;
        log('INFO', `เซิร์ฟเวอร์พร้อมใช้งานแล้ว (${url}) — เปิดเบราว์เซอร์เริ่มต้นของเครื่อง`);
        openBrowser(url);
        return;
      }
    }

    showUserError('ไม่สามารถเริ่มเซิร์ฟเวอร์ได้ภายในเวลาที่กำหนด กรุณาตรวจสอบรายละเอียดในไฟล์ logs/app.log');
    process.exitCode = 1;
  } catch (err) {
    showUserError(`เกิดข้อผิดพลาดในการเริ่มโปรแกรม: ${err.message}`);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

main();

