import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  taskInputSchema,
  type MilestoneWithStats,
  type Task,
  type TaskInput,
} from '@shared/schemas';
import { todayStr } from '@shared/dates';
import { Save } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import Modal from './Modal';
import { SegmentedControl } from './ui';

interface Props {
  task?: Task;
  defaults?: Partial<TaskInput>;
  onClose: () => void;
  onSaved: (t: Task) => void;
}

type FormValues = {
  title: string;
  description: string;
  work_date: string;
  work_end_date: string;
  due_date: string;
  category: string;
  priority: Task['priority'];
  status: Task['status'];
  result_note: string;
  evidence_link: string;
  project_id: number | null;
  milestone_id: number | null;
};

function initialValues(task?: Task, defaults?: Partial<TaskInput>): FormValues {
  return {
    title: task?.title ?? defaults?.title ?? '',
    description: task?.description ?? '',
    work_date: task?.work_date ?? defaults?.work_date ?? todayStr(),
    work_end_date: task?.work_end_date ?? (defaults?.work_end_date as string) ?? '',
    due_date: task?.due_date ?? (defaults?.due_date as string) ?? '',
    category: task?.category ?? (defaults?.category as string) ?? '',
    priority: task?.priority ?? defaults?.priority ?? 'medium',
    status: task?.status ?? defaults?.status ?? 'todo',
    result_note: task?.result_note ?? '',
    evidence_link: task?.evidence_link ?? '',
    project_id: task?.project_id ?? (typeof defaults?.project_id === 'number' ? defaults.project_id : null),
    milestone_id: task?.milestone_id ?? (typeof defaults?.milestone_id === 'number' ? defaults.milestone_id : null),
  };
}

export default function TaskFormModal({ task, defaults, onClose, onSaved }: Props) {
  const { categories, projects, yearFormat } = useApp();
  const toast = useToast();
  const [v, setV] = useState<FormValues>(() => initialValues(task, defaults));
  const [milestones, setMilestones] = useState<MilestoneWithStats[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const isEdit = !!task;

  useEffect(() => {
    if (!v.project_id) {
      setMilestones([]);
      return;
    }
    let cancelled = false;
    api
      .listMilestones(v.project_id)
      .then((list) => {
        if (!cancelled) setMilestones(list);
      })
      .catch(() => {
        if (!cancelled) setMilestones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [v.project_id]);

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const handleProjectChange = (pidStr: string) => {
    const pid = pidStr ? Number(pidStr) : null;
    setV((p) => ({ ...p, project_id: pid, milestone_id: null }));
    if (errors.project_id || errors.milestone_id) {
      setErrors((e) => ({ ...e, project_id: '', milestone_id: '' }));
    }
  };

  const submit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const parsed = taskInputSchema.safeParse(v);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      toast.error('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง');
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit ? await api.updateTask(task.id, v) : await api.createTask(v);
      toast.success(isEdit ? 'บันทึกการแก้ไขเรียบร้อยแล้ว' : 'เพิ่มงานใหม่เรียบร้อยแล้ว');
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
      title={isEdit ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'}
      onClose={onClose}
      size="lg"
      headerRight={
        <button
          type="submit"
          form="task-form"
          disabled={saving}
          className="btn-ios-plain px-0 font-semibold text-accent hover:opacity-80 disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      }
      footer={
        <div className="flex w-full items-center justify-end gap-2.5">
          <button type="button" className="btn-ios-tinted" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="submit" form="task-form" className="btn-ios-filled" disabled={saving}>
            <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</span>
          </button>
        </div>
      }
    >
      <form id="task-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="ชื่องาน" required error={errors.title} className="sm:col-span-2">
          <input
            className={`ios-input font-medium ${errors.title ? 'ios-input-error' : ''}`}
            value={v.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="เช่น จัดทำรายงานสรุปประจำสัปดาห์"
            autoFocus
            maxLength={200}
          />
        </Field>

        <Field label="ผูกกับโปรเจกต์" hint="ไม่บังคับ" error={errors.project_id}>
          <select
            className="ios-input"
            value={v.project_id ?? ''}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            <option value="">-- ไม่ผูกโปรเจกต์ (งานทั่วไป) --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Milestone ย่อย"
          hint={v.project_id ? 'เฉพาะของโปรเจกต์ที่เลือก' : 'เลือกโปรเจกต์ก่อน'}
          error={errors.milestone_id}
        >
          <select
            className="ios-input"
            value={v.milestone_id ?? ''}
            onChange={(e) => set('milestone_id', e.target.value ? Number(e.target.value) : null)}
            disabled={!v.project_id}
          >
            <option value="">-- ไม่ระบุ Milestone --</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="รายละเอียดงาน" error={errors.description} className="sm:col-span-2">
          <textarea
            className="ios-input min-h-[75px]"
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
          />
        </Field>

        <Field label="วันที่ทำงาน (วันเริ่ม)" required error={errors.work_date}>
          <input
            type="date"
            className={`ios-input ${errors.work_date ? 'ios-input-error' : ''}`}
            value={v.work_date}
            onChange={(e) => set('work_date', e.target.value)}
          />
        </Field>

        <Field label="ทำถึงวันที่ (งานหลายวัน)" hint="เว้นว่างได้ถ้าทำวันเดียว" error={errors.work_end_date}>
          <input
            type="date"
            min={v.work_date}
            className={`ios-input ${errors.work_end_date ? 'ios-input-error' : ''}`}
            value={v.work_end_date}
            onChange={(e) => set('work_end_date', e.target.value)}
          />
        </Field>

        <Field label="กำหนดส่ง" hint="ไม่บังคับ" error={errors.due_date}>
          <input
            type="date"
            className={`ios-input ${errors.due_date ? 'ios-input-error' : ''}`}
            value={v.due_date}
            onChange={(e) => set('due_date', e.target.value)}
          />
        </Field>

        <Field label="หมวดหมู่" hint="เลือกหรือพิมพ์หมวดใหม่" error={errors.category}>
          <input
            className="ios-input"
            list="category-options"
            value={v.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="เช่น งานประจำ"
            maxLength={100}
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>

        <Field label="ความสำคัญ" error={errors.priority} className="sm:col-span-2">
          <SegmentedControl
            className="w-full grid grid-cols-3"
            options={PRIORITIES.map((p) => ({
              value: p,
              label: PRIORITY_LABEL[p],
            }))}
            value={v.priority}
            onChange={(val) => set('priority', val)}
          />
        </Field>

        <Field label="สถานะการทำงาน" error={errors.status} className="sm:col-span-2">
          <SegmentedControl
            className="w-full grid grid-cols-2 sm:grid-cols-4"
            options={STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            }))}
            value={v.status}
            onChange={(val) => set('status', val)}
          />

          {isEdit && task.completed_at && v.status === 'done' && (
            <p className="mt-1.5 text-xs text-status-done">
              ✓ ทำเสร็จเมื่อ {formatDateTime(task.completed_at, yearFormat)}
            </p>
          )}
          {v.status === 'done' && !task?.completed_at && (
            <p className="mt-1.5 text-xs text-ios-secondary">ระบบจะบันทึกวันเวลาที่ทำเสร็จให้อัตโนมัติ</p>
          )}
          {isEdit && task.status === 'done' && v.status !== 'done' && (
            <p className="mt-1.5 text-xs text-status-warning">เมื่อบันทึก วันเวลาที่ทำเสร็จจะถูกล้างออก</p>
          )}
        </Field>

        <Field label="ผลลัพธ์ / หมายเหตุหลังทำเสร็จ" error={errors.result_note} className="sm:col-span-2">
          <textarea
            className="ios-input min-h-[70px]"
            value={v.result_note}
            onChange={(e) => set('result_note', e.target.value)}
            placeholder="สิ่งที่ได้จากงานนี้ เช่น ส่งรายงานแล้ว ได้รับอนุมัติเรียบร้อย"
          />
        </Field>

        <Field label="ลิงก์หรือหลักฐานอ้างอิง" hint="ไม่บังคับ" error={errors.evidence_link} className="sm:col-span-2">
          <input
            className="ios-input"
            value={v.evidence_link}
            onChange={(e) => set('evidence_link', e.target.value)}
            placeholder="เช่น https://… หรือ ที่อยู่ไฟล์ในเครื่อง"
          />
        </Field>
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
      <label className="label flex items-center justify-between text-xs font-medium text-ios-secondary mb-1.5">
        <span>
          {label}
          {required && <span className="ml-1 text-status-overdue">*</span>}
        </span>
        {hint && <span className="text-[11px] font-normal text-ios-tertiary">({hint})</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs font-medium text-status-overdue" role="alert">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
