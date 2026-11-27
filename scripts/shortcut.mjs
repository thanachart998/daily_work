import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.WORKLOG_ROOT ? path.resolve(process.env.WORKLOG_ROOT) : path.resolve(currentDir, '..');
const mode = process.argv[2] || 'desktop'; // 'desktop' | 'autostart-toggle' | 'autostart-install' | 'autostart-remove'

function runVbs(vbsContent) {
  const dataDir = path.join(rootDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const vbsPath = path.join(dataDir, 'shortcut-helper.vbs');
  const bom = Buffer.from([0xff, 0xfe]);
  const body = Buffer.from(vbsContent, 'utf16le');
  fs.writeFileSync(vbsPath, Buffer.concat([bom, body]));
  try {
    const res = spawnSync('cscript.exe', ['//NoLogo', vbsPath], { encoding: 'utf8', windowsHide: true });
    return res.status === 0;
  } finally {
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      // ignore
    }
  }
}

function getLaunchVbsPath() {
  const p1 = path.join(rootDir, 'app', 'launch.vbs');
  if (fs.existsSync(p1)) return p1;
  return path.join(rootDir, 'scripts', 'launch.vbs');
}

function getIconPath() {
  const p1 = path.join(rootDir, 'app', 'icon.ico');
  if (fs.existsSync(p1)) return p1;
  return path.join(rootDir, 'client', 'public', 'favicon.ico');
}

if (process.platform === 'win32') {
  const vbsTarget = getLaunchVbsPath().replace(/"/g, '""');
  const iconPath = getIconPath().replace(/"/g, '""');
  const workDir = rootDir.replace(/"/g, '""');

  if (mode === 'desktop') {
    const vbs = `
Dim shell, desktop, lnk
Set shell = CreateObject("WScript.Shell")
desktop = shell.SpecialFolders("Desktop")
Set lnk = shell.CreateShortcut(desktop & "\\บันทึกงานประจำวัน.lnk")
lnk.TargetPath = "wscript.exe"
lnk.Arguments = "//NoLogo ""${vbsTarget}"""
lnk.WorkingDirectory = "${workDir}"
lnk.Description = "เปิดโปรแกรมบันทึกงานประจำวันและสรุปผลงานรายเดือน"
lnk.IconLocation = "${iconPath},0"
lnk.Save
MsgBox "สร้างทางลัด ""บันทึกงานประจำวัน"" บนหน้าจอ Desktop เรียบร้อยแล้ว", 64, "บันทึกงานประจำวัน"
`;
    runVbs(vbs);
  } else {
    const forceInstall = mode === 'autostart-install' ? 'True' : 'False';
    const forceRemove = mode === 'autostart-remove' ? 'True' : 'False';
    const vbs = `
Dim fso, shell, startupDir, lnkPath, lnk
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
startupDir = shell.SpecialFolders("Startup")
lnkPath = startupDir & "\\บันทึกงานประจำวัน.lnk"

If ${forceRemove} Or (Not ${forceInstall} And fso.FileExists(lnkPath)) Then
  If fso.FileExists(lnkPath) Then fso.DeleteFile(lnkPath)
  MsgBox "ยกเลิกการเปิดโปรแกรมอัตโนมัติเมื่อเปิดเครื่องเรียบร้อยแล้ว", 64, "บันทึกงานประจำวัน"
Else
  Set lnk = shell.CreateShortcut(lnkPath)
  lnk.TargetPath = "wscript.exe"
  lnk.Arguments = "//NoLogo ""${vbsTarget}"""
  lnk.WorkingDirectory = "${workDir}"
  lnk.Description = "เปิดโปรแกรมบันทึกงานประจำวันอัตโนมัติเมื่อเปิดเครื่อง"
  lnk.IconLocation = "${iconPath},0"
  lnk.Save
  MsgBox "ตั้งค่าให้เปิดโปรแกรมอัตโนมัติเมื่อเปิดเครื่องเรียบร้อยแล้ว (ดับเบิลคลิกไฟล์นี้อีกครั้งหากต้องการยกเลิก)", 64, "บันทึกงานประจำวัน"
End If
`;
    runVbs(vbs);
  }
} else {
  console.log('สคริปต์สร้างทางลัดรองรับบน Windows เรียบร้อยแล้ว');
}

