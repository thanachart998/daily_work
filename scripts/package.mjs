import { build as esbuild } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release', 'Worklog-Portable');

/** สร้างไฟล์ไอคอน .ico ขนาด 32x32 (สีคราม Indigo พร้อมเครื่องหมายถูกสีขาว) สำหรับ Shortcut บน Windows */
function createAppIconBuffer() {
  const width = 32;
  const height = 32;
  const pixelBytes = width * height * 4;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const maskBytes = maskRowBytes * height;
  const bmpHeaderSize = 40;
  const imageSize = bmpHeaderSize + pixelBytes + maskBytes;

  const buf = Buffer.alloc(6 + 16 + imageSize, 0);
  // ICONDIR
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2); // type 1 = ICO
  buf.writeUInt16LE(1, 4); // 1 image

  // ICONDIRENTRY
  buf.writeUInt8(width, 6);
  buf.writeUInt8(height, 7);
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt16LE(1, 10); // color planes
  buf.writeUInt16LE(32, 12); // bits per pixel
  buf.writeUInt32LE(imageSize, 14);
  buf.writeUInt32LE(22, 18); // offset

  // BITMAPINFOHEADER
  const hOffset = 22;
  buf.writeUInt32LE(bmpHeaderSize, hOffset);
  buf.writeInt32LE(width, hOffset + 4);
  buf.writeInt32LE(height * 2, hOffset + 8);
  buf.writeUInt16LE(1, hOffset + 12);
  buf.writeUInt16LE(32, hOffset + 14);
  buf.writeUInt32LE(0, hOffset + 16);
  buf.writeUInt32LE(pixelBytes + maskBytes, hOffset + 20);

  const pOffset = hOffset + bmpHeaderSize;
  for (let y = 0; y < height; y++) {
    // BMP stores rows bottom-up
    const py = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const idx = pOffset + (y * width + x) * 4;
      // Rounded square mask
      const dx = Math.max(0, Math.abs(x - 15.5) - 10.5);
      const dy = Math.max(0, Math.abs(py - 15.5) - 10.5);
      if (dx * dx + dy * dy > 20) {
        buf.writeUInt32LE(0x00000000, idx);
        continue;
      }

      // Checkmark geometry
      const d1 = Math.abs(py - x - 3) <= 2.2 && x >= 8 && x <= 14;
      const d2 = Math.abs(py + x - 31) <= 2.2 && x >= 14 && x <= 23;
      if (d1 || d2) {
        // White
        buf[idx] = 255;
        buf[idx + 1] = 255;
        buf[idx + 2] = 255;
        buf[idx + 3] = 255;
      } else {
        // Primary theme #0044CC -> B=204, G=68, R=0
        buf[idx] = 204;
        buf[idx + 1] = 68;
        buf[idx + 2] = 0;
        buf[idx + 3] = 255;
      }
    }
  }
  return buf;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function writeNormalizedFile(src, dest) {
  if (src.endsWith('.bat') || src.endsWith('.vbs')) {
    const content = fs.readFileSync(src, 'utf8').replace(/\r?\n/g, '\r\n');
    fs.writeFileSync(dest, content, 'utf8');
  } else if (src.endsWith('.command') || src.endsWith('.sh')) {
    const content = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(dest, content, 'utf8');
  } else {
    fs.copyFileSync(src, dest);
  }
}

function populateAppFolder(targetRoot) {
  const appDir = path.join(targetRoot, 'app');
  fs.mkdirSync(appDir, { recursive: true });
  writeNormalizedFile(path.join(rootDir, 'scripts', 'launcher.mjs'), path.join(appDir, 'launcher.mjs'));
  writeNormalizedFile(path.join(rootDir, 'scripts', 'launch.vbs'), path.join(appDir, 'launch.vbs'));
  writeNormalizedFile(path.join(rootDir, 'scripts', 'shortcut.mjs'), path.join(appDir, 'shortcut.mjs'));
  fs.writeFileSync(path.join(appDir, 'icon.ico'), createAppIconBuffer());

  const appDist = path.join(appDir, 'dist');
  if (fs.existsSync(appDist)) fs.rmSync(appDist, { recursive: true, force: true });
  copyDirRecursive(path.join(rootDir, 'dist'), appDist);
}

async function main() {
  console.log('1/4 กำลัง Build หน้าเว็บ (Frontend SPA + PWA)...');
  await viteBuild({ configFile: path.join(rootDir, 'vite.config.ts'), logLevel: 'info' });

  console.log('2/4 กำลังรวมไฟล์เซิร์ฟเวอร์ (Backend Bundle)...');
  const rootAppDir = path.join(rootDir, 'app');
  fs.mkdirSync(rootAppDir, { recursive: true });
  const serverBundlePath = path.join(rootAppDir, 'server.cjs');

  await esbuild({
    entryPoints: [path.join(rootDir, 'server', 'index.ts')],
    outfile: serverBundlePath,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['node:*'],
    logOverride: { 'empty-import-meta': 'silent' },
    logLevel: 'info',
  });

  populateAppFolder(rootDir);

  console.log('3/4 กำลังจัดเตรียมโฟลเดอร์พกพา (Portable Package)...');
  fs.mkdirSync(releaseDir, { recursive: true });

  // อัปเดตเฉพาะโฟลเดอร์ app/ และ runtime/ โดยไม่ลบโฟลเดอร์ data/ หากมีข้อมูลอยู่แล้ว
  const releaseAppDir = path.join(releaseDir, 'app');
  if (fs.existsSync(releaseAppDir)) fs.rmSync(releaseAppDir, { recursive: true, force: true });
  populateAppFolder(releaseDir);
  fs.copyFileSync(serverBundlePath, path.join(releaseAppDir, 'server.cjs'));

  // สร้างโฟลเดอร์ data/ และ logs/ แยกจากตัวโปรแกรม
  const releaseDataDir = path.join(releaseDir, 'data');
  const releaseLogsDir = path.join(releaseDir, 'logs');
  fs.mkdirSync(releaseDataDir, { recursive: true });
  fs.mkdirSync(releaseLogsDir, { recursive: true });
  if (!fs.existsSync(path.join(releaseDataDir, '.gitkeep'))) {
    fs.writeFileSync(path.join(releaseDataDir, '.gitkeep'), '', 'utf8');
  }
  if (!fs.existsSync(path.join(releaseLogsDir, '.gitkeep'))) {
    fs.writeFileSync(path.join(releaseLogsDir, '.gitkeep'), '', 'utf8');
  }

  // คัดลอกตัวเปิดโปรแกรมทั้ง Windows / Mac / Linux และสคริปต์เสริม
  const rootFiles = [
    'เปิดโปรแกรม.bat',
    'เปิดโปรแกรม.command',
    'เปิดโปรแกรม.sh',
    'สร้างทางลัดบนหน้าจอ.bat',
    'ตั้งค่าเปิดอัตโนมัติ.bat',
    'README.md',
  ];
  for (const file of rootFiles) {
    const src = path.join(rootDir, file);
    const dest = path.join(releaseDir, file);
    if (fs.existsSync(src)) {
      writeNormalizedFile(src, dest);
      if (file.endsWith('.command') || file.endsWith('.sh')) {
        try {
          fs.chmodSync(dest, 0o755);
        } catch {
          // ignore on Windows
        }
      }
    }
  }

  console.log('4/4 กำลังคัดลอก Node.js Runtime ลงในโฟลเดอร์ runtime/...');
  const runtimeDir = path.join(releaseDir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  const targetNodePath =
    process.platform === 'win32'
      ? path.join(runtimeDir, 'node.exe')
      : path.join(runtimeDir, 'bin', 'node');

  fs.mkdirSync(path.dirname(targetNodePath), { recursive: true });
  fs.copyFileSync(process.execPath, targetNodePath);
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(targetNodePath, 0o755);
    } catch {
      // ignore
    }
  }

  fs.writeFileSync(
    path.join(runtimeDir, 'README-runtime.txt'),
    [
      'โฟลเดอร์นี้บรรจุ Node.js Runtime สำหรับรันโปรแกรมแบบพกพาโดยไม่ต้องติดตั้ง Node.js ในเครื่อง',
      `- ระบบที่สร้างแพ็กเกจ: ${process.platform} (${process.arch})`,
      `- เวอร์ชัน Node.js: ${process.version}`,
      '- Windows ใช้ไฟล์ runtime/node.exe',
      '- macOS / Linux ใช้ไฟล์ runtime/bin/node (หรือ runtime/node)',
    ].join('\r\n'),
    'utf8',
  );

  console.log('');
  console.log('============================================================');
  console.log('สร้างชุดโปรแกรมแบบพกพา (Portable) สำเร็จแล้ว!');
  console.log(`โฟลเดอร์พร้อมใช้งาน: ${releaseDir}`);
  console.log('โครงสร้างภายในประกอบด้วย:');
  console.log('  - เปิดโปรแกรม.bat / .command / .sh  (ดับเบิลคลิกเพื่อเปิดใช้งานทันที)');
  console.log('  - app/                             (ตัวโปรแกรมและหน้าเว็บ)');
  console.log('  - runtime/                         (Node.js runtime ในตัว)');
  console.log('  - data/                            (ฐานข้อมูล แยกจากตัวโปรแกรม)');
  console.log('  - logs/                            (บันทึกการทำงาน app.log)');
  console.log('============================================================');
}

main().catch((err) => {
  console.error('เกิดข้อผิดพลาดในการสร้างแพ็กเกจ:', err);
  process.exit(1);
});
