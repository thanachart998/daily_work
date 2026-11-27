import { projectUpdateInputSchema, type ProjectUpdate } from '@shared/schemas';
import { todayStr } from '@shared/dates';
import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { formatMonth } from '../lib/format';
import Modal from './Modal';

interface Props {
  projectId: number;
  projectName: string;
  initialPeriod?: string;
  existingUpdate?: ProjectUpdate | null;
  lockPeriod?: boolean;
  onClose: () => void;
  onSaved: (u: ProjectUpdate) => void;
}

export default function ProjectUpdateModal({
  projectId,
  projectName,
  initialPeriod,
  existingUpdate,
  lockPeriod = false,
  onClose,
  onSaved,
}: Props) {
  const { yearFormat } = useApp();
  const toast = useToast();
  const [period, setPeriod] = useState(existingUpdate?.period ?? initialPeriod ?? todayStr().slice(0, 7));
  const [summary, setSummary] = useState(existingUpdate?.summary ?? '');
  const [issues, setIssues] = useState(existingUpdate?.issues ?? '');
  const [nextPlan, setNextPlan] = useState(existingUpdate?.next_plan ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = { period, summary, issues, next_plan: nextPlan };
    const parsed = projectUpdateInputSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      toast.error('กรุณาตรวจสอบข้อมูลที่ไฮไลต์สีแดง');
      return;
    }

    setSaving(true);
    try {
      const saved = await api.saveProjectUpdate(projectId, payload);
      toast.success(`บันทึกอัปเดตความคืบหน้าเดือน ${formatMonth(period, yearFormat)} เรียบร้อยแล้ว`);
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
      title={`อัปเดตความคืบหน้า — ${projectName}`}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="submit" form="project-update-form" className="btn-primary" disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึกอัปเดต'}
          </button>
        </div>
      }
    >
      <form id="project-update-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="pu-period">
            ประจำเดือน <span className="text-red-500">*</span>
          </label>
          <input
            id="pu-period"
            type="month"
            className={`ios-input max-w-[220px] ${errors.period ? 'border-red-500' : ''}`}
            value={period}
            disabled={lockPeriod}
            onChange={(e) => {
              setPeriod(e.target.value);
              if (errors.period) setErrors((p) => ({ ...p, period: '' }));
            }}
          />
          {errors.period && <p className="mt-1 text-xs font-medium text-red-500">{errors.period}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="pu-summary">
            สรุปความคืบหน้าในเดือนนี้ <span className="text-red-500">*</span>
          </label>
          <textarea
            id="pu-summary"
            className={`ios-input min-h-[90px] w-full resize-none ${errors.summary ? 'border-red-500' : ''}`}
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              if (errors.summary) setErrors((p) => ({ ...p, summary: '' }));
            }}
            placeholder="เช่น ดำเนินการออกแบบและพัฒนาโมดูลหลักเสร็จสิ้น 60% พร้อมทดสอบร่วมกับผู้ใช้งาน"
            autoFocus
          />
          {errors.summary && <p className="mt-1 text-xs font-medium text-red-500">{errors.summary}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="pu-issues">
            ปัญหา / อุปสรรคที่พบ <span className="font-normal opacity-70">(ไม่บังคับ)</span>
          </label>
          <textarea
            id="pu-issues"
            className="ios-input min-h-[70px] w-full resize-none"
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
            placeholder="เช่น รอข้อมูลตัวอย่างจากหน่วยงานภายนอก ทำให้ต้องปรับลำดับงานย่อยบางส่วน"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="pu-next">
            แผนดำเนินงานเดือนถัดไป <span className="font-normal opacity-70">(ไม่บังคับ)</span>
          </label>
          <textarea
            id="pu-next"
            className="ios-input min-h-[70px] w-full resize-none"
            value={nextPlan}
            onChange={(e) => setNextPlan(e.target.value)}
            placeholder="เช่น ทดสอบระบบ UAT ร่วมกับผู้ใช้งานจริง และเตรียมคู่มือการปฏิบัติงาน"
          />
        </div>
      </form>
    </Modal>
  );
}

