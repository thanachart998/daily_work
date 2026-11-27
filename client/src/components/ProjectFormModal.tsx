import {
  PROGRESS_MODES,
  PROGRESS_MODE_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  projectInputSchema,
  type Project,
  type ProjectInput,
  type ProjectWithStats,
} from '@shared/schemas';
import { todayStr } from '@shared/dates';
import { Check } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import Modal from './Modal';
import { SegmentedControl } from './ui';

const COLOR_PRESETS = ['#007AFF', '#5856D6', '#AF52DE', '#30B0C7', '#34C759', '#FF9500', '#FF3B30', '#8E8E93'];

interface Props {
  project?: Project;
  onClose: () => void;
  onSaved: (p: ProjectWithStats) => void;
}

export default function ProjectFormModal({ project, onClose, onSaved }: Props) {
  const toast = useToast();
  const isEdit = !!project;

  const [v, setV] = useState<ProjectInput>(() => ({
    name: project?.name ?? '',
    description: project?.description ?? '',
    start_date: project?.start_date ?? todayStr(),
    target_end_date: project?.target_end_date ?? '',
    status: project?.status ?? 'active',
    color: project?.color ?? '#007AFF',
    progress_mode: project?.progress_mode ?? 'auto',
    manual_progress: project?.manual_progress ?? 0,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ProjectInput>(k: K, val: ProjectInput[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = projectInputSchema.safeParse(v);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      toast.error('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง');
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit ? await api.updateProject(project.id, v) : await api.createProject(v);
      toast.success(isEdit ? 'บันทึกข้อมูลโปรเจกต์แล้ว' : 'สร้างโปรเจกต์ใหม่เรียบร้อยแล้ว');
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(err.details);
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'แก้ไขข้อมูลโปรเจกต์' : 'สร้างโปรเจกต์ใหม่'}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="submit" form="project-form" className="btn-primary" disabled={saving}>
            {saving ? 'กำลังบันทึก…' : isEdit ? 'บันทึกการแก้ไข' : 'สร้างโปรเจกต์'}
          </button>
        </div>
      }
    >
      <form id="project-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="ชื่อโปรเจกต์" required error={errors.name}>
          <input
            className={`ios-input w-full ${errors.name ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="เช่น พัฒนาระบบบริการออนไลน์ ระยะที่ 1"
            autoFocus
            maxLength={200}
          />
        </Field>

        <Field label="รายละเอียด / ขอบเขตงาน" error={errors.description}>
          <textarea
            className="ios-input min-h-[80px] w-full resize-none"
            value={(v.description as string) ?? ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="อธิบายเป้าหมาย ขอบเขตงาน หรือผลลัพธ์ที่คาดหวัง (ไม่บังคับ)"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="วันเริ่มโปรเจกต์" required error={errors.start_date}>
            <input
              type="date"
              className={`ios-input w-full ${errors.start_date ? 'border-red-500' : ''}`}
              value={v.start_date}
              onChange={(e) => set('start_date', e.target.value)}
            />
          </Field>

          <Field label="วันสิ้นสุดตามแผน" hint="ไม่บังคับ" error={errors.target_end_date}>
            <input
              type="date"
              min={v.start_date}
              className={`ios-input w-full ${errors.target_end_date ? 'border-red-500' : ''}`}
              value={(v.target_end_date as string) ?? ''}
              onChange={(e) => set('target_end_date', e.target.value)}
            />
          </Field>
        </div>

        <div>
          <label className="text-xs font-semibold text-ios-secondary">สถานะโปรเจกต์</label>
          <div className="mt-1.5">
            <SegmentedControl
              value={v.status ?? 'active'}
              onChange={(val) => set('status', val as ProjectInput['status'])}
              options={PROJECT_STATUSES.map((s) => ({
                value: s,
                label: PROJECT_STATUS_LABEL[s],
              }))}
            />
          </div>
          {v.status === 'done' && (
            <p className="mt-1.5 text-xs text-status-done font-medium">✓ ระบบจะบันทึกวันเสร็จจริงให้อัตโนมัติเมื่อเลือกเสร็จสิ้น</p>
          )}
        </div>

        <Field label="สีประจำโปรเจกต์" error={errors.color}>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {COLOR_PRESETS.map((c) => {
              const selected = (v.color ?? '#007AFF').toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-95 ${
                    selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-ios-card scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`เลือกสี ${c}`}
                >
                  {selected && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </Field>

        <div>
          <label className="text-xs font-semibold text-ios-secondary">วิธีคำนวณความคืบหน้า</label>
          <div className="mt-1.5">
            <SegmentedControl
              value={v.progress_mode ?? 'auto'}
              onChange={(val) => set('progress_mode', val as ProjectInput['progress_mode'])}
              options={PROGRESS_MODES.map((m) => ({
                value: m,
                label: PROGRESS_MODE_LABEL[m],
              }))}
            />
          </div>
        </div>

        {v.progress_mode === 'manual' && (
          <div className="ios-card p-3 space-y-2 border border-ios-separator/20">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ios-primary">ความคืบหน้าด้วยตนเอง</span>
              <span className="font-bold tabular-nums text-accent">{v.manual_progress}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={v.manual_progress}
                onChange={(e) => set('manual_progress', Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={v.manual_progress}
                onChange={(e) => set('manual_progress', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="ios-input w-20 text-center font-semibold tabular-nums text-sm py-1.5"
              />
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-ios-secondary mb-1.5">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
        {hint && <span className="ml-1 font-normal opacity-70">({hint})</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs font-medium text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
