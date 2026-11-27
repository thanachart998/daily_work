import type { ImportMode } from '@shared/schemas';
import { todayStr } from '@shared/dates';
import { Download, FolderOpen, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

/** หน้าสำรองและกู้คืนข้อมูล JSON */
export default function BackupPage() {
  const { notifyChanged, confirm } = useApp();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const backup = await api.exportBackup();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `worklog-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(
        `ส่งออกไฟล์สำรองข้อมูลเรียบร้อยแล้ว (${backup.tasks.length} งาน, ${backup.projects?.length ?? 0} โปรเจกต์)`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.error('ไฟล์ที่เลือกไม่ใช่ไฟล์ JSON ที่ถูกต้อง');
      return;
    }

    if (mode === 'replace') {
      const ok = await confirm({
        title: 'ยืนยันการแทนที่ข้อมูลทั้งหมด',
        message: 'ข้อมูลงาน โปรเจกต์ และหมวดหมู่เดิมในเครื่องจะถูกลบทั้งหมด แล้วแทนที่ด้วยข้อมูลจากไฟล์สำรอง ต้องการดำเนินการต่อหรือไม่?',
        confirmText: 'แทนที่ข้อมูลทั้งหมด',
        danger: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await api.importBackup(parsed, mode);
      toast.success(
        `นำเข้าข้อมูลสำเร็จ ${res.importedTasks} งาน (${res.importedProjects ?? 0} โปรเจกต์, ${res.importedCategories} หมวดหมู่)`,
      );
      notifyChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="สำรองและกู้คืนข้อมูล"
        subtitle="ส่งออกข้อมูลเก็บไว้เป็นไฟล์ JSON หรือนำเข้าข้อมูลกลับมาใช้งาน"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Card */}
        <section className="ios-card p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
            <Download className="h-4 w-4 text-accent" aria-hidden />
            <h2>ส่งออกข้อมูลสำรอง (Export)</h2>
          </div>
          <p className="text-xs text-ios-secondary leading-relaxed">
            ดาวน์โหลดข้อมูลงานทั้งหมด หมวดหมู่ โปรเจกต์ และการตั้งค่า เป็นไฟล์ <code className="rounded bg-ios-separator/20 px-1 py-0.5 text-ios-primary font-mono text-[11px]">.json</code> เพื่อเก็บสำรองหรือย้ายไปเครื่องอื่น
          </p>
          <button className="btn-primary" onClick={handleExport} disabled={busy}>
            <Download className="h-4 w-4" aria-hidden /> ดาวน์โหลดไฟล์สำรอง
          </button>
        </section>

        {/* Import Card */}
        <section className="ios-card p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
            <Upload className="h-4 w-4 text-status-done" aria-hidden />
            <h2>นำเข้าข้อมูลสำรอง (Import)</h2>
          </div>
          <p className="text-xs text-ios-secondary leading-relaxed">เลือกรูปแบบการนำเข้า แล้วเลือกไฟล์สำรองข้อมูล (.json)</p>

          <div className="rounded-ios-control border border-ios-separator/20 bg-ios-bg p-3 space-y-2.5 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                className="mt-0.5 accent-accent"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              <span>
                <strong className="block text-ios-primary font-semibold">รวมเข้ากับข้อมูลเดิม (แนะนำ)</strong>
                <span className="block text-ios-secondary mt-0.5">เก็บงานเดิมไว้ แล้วเพิ่มรายการใหม่จากไฟล์สำรอง</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                className="mt-0.5 accent-red-500"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              <span>
                <strong className="block text-status-overdue font-semibold">แทนที่ข้อมูลเดิมทั้งหมด</strong>
                <span className="block text-ios-secondary mt-0.5">ลบข้อมูลเดิมในเครื่องออกทั้งหมด แล้วใช้ข้อมูลจากไฟล์สำรองแทน</span>
              </span>
            </label>
          </div>

          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" aria-hidden /> เลือกไฟล์สำรอง (.json)
          </button>
        </section>
      </div>

      {/* Portable Info Card */}
      <section className="ios-card p-5 space-y-2.5">
        <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
          <FolderOpen className="h-4 w-4 text-status-warning" aria-hidden />
          <h2>การย้ายโฟลเดอร์หรืออัปเดตโปรแกรม (แบบพกพา)</h2>
        </div>
        <p className="text-xs leading-relaxed text-ios-secondary">
          ฐานข้อมูลทั้งหมดถูกเก็บไว้ในโฟลเดอร์ <code className="rounded bg-ios-separator/20 px-1.5 py-0.5 font-mono text-[11px] text-ios-primary">data/worklog.db</code> ภายในโฟลเดอร์โปรแกรม
          คุณสามารถคัดลอกทั้งโฟลเดอร์ไปไว้ในแฟลชไดรฟ์หรือเครื่องอื่นแล้วเปิดใช้งานต่อได้ทันที
          และเมื่อต้องการอัปเดตเวอร์ชันโปรแกรม เพียงนำโฟลเดอร์ <code className="rounded bg-ios-separator/20 px-1.5 py-0.5 font-mono text-[11px] text-ios-primary">app/</code> ใหม่มาวางทับโดยไม่ต้องลบโฟลเดอร์{' '}
          <code className="rounded bg-ios-separator/20 px-1.5 py-0.5 font-mono text-[11px] text-ios-primary">data/</code> ข้อมูลเดิมจะยังคงอยู่ครบถ้วน 100%
        </p>
      </section>
    </div>
  );
}

