import { todayStr } from '@shared/dates';
import {
  type AccentColor,
  type ImportMode,
  type ThaiFont,
  type ThemeMode,
} from '@shared/schemas';
import {
  Check,
  Download,
  FolderOpen,
  Languages,
  Palette,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { PageHeader, SegmentedControl } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

const ACCENT_OPTIONS: { id: AccentColor; name: string; hex: string }[] = [
  { id: 'blue', name: 'น้ำเงิน', hex: '#007AFF' },
  { id: 'indigo', name: 'คราม', hex: '#5856D6' },
  { id: 'purple', name: 'ม่วง', hex: '#AF52DE' },
  { id: 'teal', name: 'เขียวน้ำทะเล', hex: '#30B0C7' },
  { id: 'orange', name: 'ส้ม', hex: '#FF9500' },
];

const FONT_OPTIONS: { id: ThaiFont; name: string; desc: string; sample: string }[] = [
  { id: 'anuphan', name: 'Anuphan (อนุพันธ์)', desc: 'ไม่มีหัว โมเดิร์น คลีน (ค่าเริ่มต้น)', sample: 'กขคง 123' },
  { id: 'noto-sans-thai', name: 'Noto Sans Thai', desc: 'ไม่มีหัว เรียบง่าย อ่านสบายตา', sample: 'กขคง 123' },
  { id: 'ibm-plex-sans-thai-looped', name: 'IBM Plex Sans Thai Looped', desc: 'มีหัว เป็นทางการ อ่านง่ายสำหรับงานเอกสาร', sample: 'กขคง 123' },
];

/** หน้าตั้งค่าระบบ: ธีมมืด/สว่าง สี Accent แบบอักษรไทย หมวดหมู่ ข้อมูลตัวอย่าง และปิดโปรแกรม */
export default function SettingsPage() {
  const {
    settings,
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    thaiFont,
    setThaiFont,
    saveSettings,
    categories,
    reloadCategories,
    notifyChanged,
    confirm,
    shutdownAppWithConfirm,
  } = useApp();
  const toast = useToast();

  const [newCat, setNewCat] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');

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

    if (importMode === 'replace') {
      const ok = await confirm({
        title: 'ยืนยันการแทนที่ข้อมูลทั้งหมด',
        message:
          'ข้อมูลงาน โปรเจกต์ และหมวดหมู่เดิมในเครื่องจะถูกลบทั้งหมด แล้วแทนที่ด้วยข้อมูลจากไฟล์สำรอง ต้องการดำเนินการต่อหรือไม่?',
        confirmText: 'แทนที่ข้อมูลทั้งหมด',
        danger: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await api.importBackup(parsed, importMode);
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

  const changeYearFormat = async (yearFormat: 'BE' | 'CE') => {
    try {
      await saveSettings({ ...settings, yearFormat });
      toast.success(`เปลี่ยนการแสดงผลปีเป็น ${yearFormat === 'BE' ? 'พ.ศ.' : 'ค.ศ.'} แล้ว`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const changeTheme = async (mode: ThemeMode) => {
    try {
      await setTheme(mode);
      const label = mode === 'dark' ? 'โหมดมืด' : mode === 'light' ? 'โหมดสว่าง' : 'ตามระบบ';
      toast.success(`เปลี่ยนธีมเป็น "${label}" แล้ว`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAccentChange = async (color: AccentColor) => {
    try {
      await setAccentColor(color);
      toast.success('เปลี่ยนสีเน้น (Accent Color) แล้ว');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleFontChange = async (font: ThaiFont) => {
    try {
      await setThaiFont(font);
      toast.success('เปลี่ยนแบบอักษรภาษาไทยแล้ว');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.createCategory(name);
      setNewCat('');
      await reloadCategories();
      toast.success(`เพิ่มหมวดหมู่ "${name}" แล้ว`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: number) => {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.renameCategory(id, name);
      setEditingId(null);
      notifyChanged();
      toast.success('เปลี่ยนชื่อหมวดหมู่เรียบร้อยแล้ว');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCategory = async (id: number, name: string, count = 0) => {
    const ok = await confirm({
      title: 'ยืนยันการลบหมวดหมู่',
      message:
        count > 0
          ? `ต้องการลบหมวดหมู่ "${name}" หรือไม่? งานที่อยู่ในหมวดนี้จำนวน ${count} งานจะถูกเปลี่ยนเป็น "ไม่มีหมวดหมู่" (ตัวงานไม่ถูกลบ)`
          : `ต้องการลบหมวดหมู่ "${name}" ใช่หรือไม่?`,
      confirmText: 'ลบหมวดหมู่',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCategory(id);
      notifyChanged();
      toast.success(`ลบหมวดหมู่ "${name}" แล้ว`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSeed = async () => {
    setBusy(true);
    try {
      const r = await api.seedSample();
      notifyChanged();
      toast.success(`เพิ่มข้อมูลตัวอย่าง ${r.inserted} งานแล้ว`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="ตั้งค่า"
        subtitle="ปรับแต่งหน้าตา สีสัน แบบอักษร หมวดหมู่ และการทำงานของระบบ"
      />

      {/* Group 1: Appearance & Typography */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ios-secondary px-1">
          การแสดงผลและหน้าตา (Appearance)
        </h2>

        <div className="ios-card divide-y divide-ios-separator/20 overflow-hidden">
          {/* Theme Mode */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-sm text-ios-primary flex items-center gap-2">
                <Sun className="h-4 w-4 text-accent" /> ธีมหน้าจอ (Dark Mode)
              </p>
              <p className="text-xs text-ios-secondary mt-0.5">เลือกโหมดสว่าง มืด หรือปรับตามระบบเครื่อง</p>
            </div>
            <div className="w-full sm:w-72">
              <SegmentedControl
                value={theme}
                onChange={(v) => changeTheme(v as ThemeMode)}
                options={[
                  { value: 'light', label: 'สว่าง' },
                  { value: 'dark', label: 'มืด' },
                  { value: 'system', label: 'ตามระบบ' },
                ]}
              />
            </div>
          </div>

          {/* Accent Color */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-sm text-ios-primary flex items-center gap-2">
                <Palette className="h-4 w-4 text-accent" /> สีเน้นของระบบ (Accent Color)
              </p>
              <p className="text-xs text-ios-secondary mt-0.5">สีที่ใช้ในปุ่ม ไฮไลต์ ไอคอน และสถานะที่กำลังทำ</p>
            </div>
            <div className="flex items-center gap-3">
              {ACCENT_OPTIONS.map((c) => {
                const isSel = (accentColor || 'blue') === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleAccentChange(c.id)}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-95 ${
                      isSel ? 'ring-2 ring-accent ring-offset-2 ring-offset-ios-card scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    aria-label={`เลือกสีเน้น ${c.name}`}
                    title={c.name}
                  >
                    {isSel && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thai Font Family */}
          <div className="p-4 space-y-3">
            <div>
              <p className="font-semibold text-sm text-ios-primary flex items-center gap-2">
                <Type className="h-4 w-4 text-accent" /> แบบอักษรภาษาไทย (Thai Font)
              </p>
              <p className="text-xs text-ios-secondary mt-0.5">
                ฟอนต์ติดตั้งแบบออฟไลน์ทั้งหมดในตัวโปรแกรม ไม่เชื่อมต่อ CDN
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {FONT_OPTIONS.map((f) => {
                const isSel = (thaiFont || 'anuphan') === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleFontChange(f.id)}
                    className={`rounded-ios-control p-3 text-left transition border ${
                      isSel
                        ? 'border-accent bg-accent/10 shadow-sm'
                        : 'border-ios-separator/20 bg-ios-bg hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-ios-primary">{f.name}</span>
                      {isSel && <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />}
                    </div>
                    <p className="mt-1 text-[11px] text-ios-secondary">{f.desc}</p>
                    <p className="mt-2 text-xs font-semibold text-ios-primary opacity-80">{f.sample}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Year Format */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-sm text-ios-primary flex items-center gap-2">
                <Languages className="h-4 w-4 text-accent" /> รูปแบบปีปฏิทิน
              </p>
              <p className="text-xs text-ios-secondary mt-0.5">แสดงปีในระบบและรายงานผลงาน</p>
            </div>
            <div className="w-full sm:w-60">
              <SegmentedControl
                value={settings.yearFormat}
                onChange={(v) => changeYearFormat(v as 'BE' | 'CE')}
                options={[
                  { value: 'BE', label: 'พ.ศ. (2569)' },
                  { value: 'CE', label: 'ค.ศ. (2026)' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Group 2: Backup & Restore (ต่อท้ายหมวด Appearance) */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ios-secondary px-1">
          สำรองและกู้คืนข้อมูล (Backup & Restore)
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Export Card */}
          <section className="ios-card p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
              <Download className="h-4 w-4 text-accent" aria-hidden />
              <h3>ส่งออกข้อมูลสำรอง (Export)</h3>
            </div>
            <p className="text-xs text-ios-secondary leading-relaxed">
              ดาวน์โหลดข้อมูลงานทั้งหมด หมวดหมู่ โปรเจกต์ และการตั้งค่า เป็นไฟล์{' '}
              <code className="rounded bg-ios-separator/20 px-1 py-0.5 text-ios-primary font-mono text-[11px]">
                .json
              </code>{' '}
              เพื่อเก็บสำรองหรือย้ายไปเครื่องอื่น
            </p>
            <button type="button" className="btn-primary" onClick={handleExport} disabled={busy}>
              <Download className="h-4 w-4" aria-hidden /> ดาวน์โหลดไฟล์สำรอง
            </button>
          </section>

          {/* Import Card */}
          <section className="ios-card p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
              <Upload className="h-4 w-4 text-status-done" aria-hidden />
              <h3>นำเข้าข้อมูลสำรอง (Import)</h3>
            </div>
            <p className="text-xs text-ios-secondary leading-relaxed">
              เลือกรูปแบบการนำเข้า แล้วเลือกไฟล์สำรองข้อมูล (.json)
            </p>

            <div className="rounded-ios-control border border-ios-separator/20 bg-ios-bg p-3 space-y-2.5 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="import-mode"
                  className="mt-0.5 accent-accent"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                />
                <span>
                  <strong className="block text-ios-primary font-semibold">
                    รวมเข้ากับข้อมูลเดิม (แนะนำ)
                  </strong>
                  <span className="block text-ios-secondary mt-0.5">
                    เก็บงานเดิมไว้ แล้วเพิ่มรายการใหม่จากไฟล์สำรอง
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="import-mode"
                  className="mt-0.5 accent-red-500"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                />
                <span>
                  <strong className="block text-status-overdue font-semibold">
                    แทนที่ข้อมูลเดิมทั้งหมด
                  </strong>
                  <span className="block text-ios-secondary mt-0.5">
                    ลบข้อมูลเดิมในเครื่องออกทั้งหมด แล้วใช้ข้อมูลจากไฟล์สำรองแทน
                  </span>
                </span>
              </label>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload className="h-4 w-4" aria-hidden /> เลือกไฟล์สำรอง (.json)
            </button>
          </section>
        </div>

        {/* Portable Info Card */}
        <section className="ios-card p-5 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
            <FolderOpen className="h-4 w-4 text-status-warning" aria-hidden />
            <h3>การย้ายโฟลเดอร์หรืออัปเดตโปรแกรม (แบบพกพา)</h3>
          </div>
          <p className="text-xs leading-relaxed text-ios-secondary">
            ฐานข้อมูลทั้งหมดถูกเก็บไว้ในโฟลเดอร์{' '}
            <code className="rounded bg-ios-separator/20 px-1.5 py-0.5 font-mono text-[11px] text-ios-primary">
              data/worklog.db
            </code>{' '}
            ภายในโฟลเดอร์โปรแกรม
            คุณสามารถคัดลอกทั้งโฟลเดอร์ไปไว้ในแฟลชไดรฟ์หรือเครื่องอื่นแล้วเปิดใช้งานต่อได้ทันที
            และเมื่อต้องการอัปเดตเวอร์ชันโปรแกรม เพียงนำโฟลเดอร์{' '}
            <code className="rounded bg-ios-separator/20 px-1.5 py-0.5 font-mono text-[11px] text-ios-primary">
              app/
            </code>{' '}
            ใหม่มาวางทับโดยไม่ต้องลบโฟลเดอร์{' '}
            <code className="rounded bg-ios-separator/20 px-1.5 py-0.5 font-mono text-[11px] text-ios-primary">
              data/
            </code>{' '}
            ข้อมูลเดิมจะยังคงอยู่ครบถ้วน 100%
          </p>
        </section>
      </div>

      {/* Group 3: Categories */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ios-secondary px-1">
          หมวดหมู่งาน ({categories.length})
        </h2>

        <div className="ios-card p-4 space-y-4">
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              className="ios-input flex-1 max-w-sm"
              placeholder="เพิ่มชื่อหมวดหมู่ใหม่..."
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              maxLength={100}
            />
            <button type="submit" className="btn-primary" disabled={busy || !newCat.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> เพิ่ม
            </button>
          </form>

          <ul className="divide-y divide-ios-separator/20 rounded-ios-control border border-ios-separator/20 overflow-hidden bg-ios-bg">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
                {editingId === c.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      className="ios-input py-1 text-xs"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      maxLength={100}
                      autoFocus
                    />
                    <button type="button" className="btn-primary btn-sm" onClick={() => handleRename(c.id)} disabled={busy}>
                      <Check className="h-3.5 w-3.5" aria-hidden /> บันทึก
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" aria-hidden /> ยกเลิก
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ios-primary">{c.name}</span>
                      <span className="text-ios-secondary tabular-nums">({c.task_count ?? 0} งาน)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditingName(c.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> แก้ไข
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm text-status-overdue"
                        onClick={() => handleDeleteCategory(c.id, c.name, c.task_count)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> ลบ
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Group 3: System Actions */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ios-secondary px-1">
          การจัดการระบบ (System)
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Sample Data */}
          <div className="ios-card p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-ios-primary">
              <Sparkles className="h-4 w-4 text-status-warning" aria-hidden />
              <span>ข้อมูลตัวอย่างสำหรับทดลองใช้งาน</span>
            </div>
            <p className="text-xs text-ios-secondary leading-relaxed">
              สร้างงานและโปรเจกต์ตัวอย่างย้อนหลังเพื่อทดลองดูสถิติ ปฏิทิน และรายงานสรุปผลงานรายเดือน
            </p>
            <button type="button" className="btn-secondary" onClick={handleSeed} disabled={busy}>
              <Sparkles className="h-4 w-4" aria-hidden /> เพิ่มข้อมูลตัวอย่าง
            </button>
          </div>

          {/* Safe Shutdown */}
          <div className="ios-card p-5 space-y-3 border-status-overdue/30 bg-red-500/5">
            <div className="flex items-center gap-2 font-bold text-sm text-status-overdue">
              <Power className="h-4 w-4" aria-hidden />
              <span>ปิดโปรแกรมอย่างปลอดภัย</span>
            </div>
            <p className="text-xs text-ios-secondary leading-relaxed">
              เซิร์ฟเวอร์จะบันทึกข้อมูลทั้งหมดลงฐานข้อมูลอย่างปลอดภัยก่อนหยุดทำงานทั้งหมด
            </p>
            <button type="button" className="btn-danger" onClick={shutdownAppWithConfirm}>
              <Power className="h-4 w-4" aria-hidden /> ปิดโปรแกรม
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}