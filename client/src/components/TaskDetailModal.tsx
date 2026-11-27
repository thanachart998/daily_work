import { STATUSES, STATUS_LABEL, type Task, type TaskStatus } from '@shared/schemas';
import { todayStr } from '@shared/dates';
import { CalendarClock, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { DueBadge, PriorityBadge, StatusBadge } from './Badges';
import Modal from './Modal';
import { SegmentedControl } from './ui';

export function EvidenceLink({ value }: { value: string | null }) {
  if (!value) return <span className="text-ios-tertiary">-</span>;
  if (/^https?:\/\//i.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 break-all text-accent hover:underline"
      >
        <span>{value}</span>
        <ExternalLink className="no-print h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      </a>
    );
  }
  return <span className="break-all text-ios-primary">{value}</span>;
}

export default function TaskDetailModal({
  task,
  onClose,
  onChanged,
}: {
  task: Task;
  onClose: () => void;
  onChanged: (t: Task) => void;
}) {
  const { yearFormat, openEditTask, deleteTaskWithConfirm } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const today = todayStr();

  const changeStatus = async (s: TaskStatus) => {
    if (s === task.status) return;
    setBusy(true);
    try {
      const t = await api.setStatus(task.id, s);
      toast.success(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[s]}" แล้ว`);
      onChanged(t);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const postpone = async () => {
    setBusy(true);
    try {
      await api.postpone([task.id]);
      const t = await api.getTask(task.id);
      toast.success(`เลื่อนงานไปวันที่ ${formatDate(t.work_date, yearFormat)} แล้ว`);
      onChanged(t);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="รายละเอียดงาน"
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ios-plain text-status-overdue hover:bg-status-overdue-tint"
            onClick={() => deleteTaskWithConfirm(task)}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span>ลบงาน</span>
          </button>

          <div className="flex items-center gap-2">
            {task.status !== 'done' && (
              <button
                type="button"
                className="btn-ios-tinted"
                onClick={postpone}
                disabled={busy}
              >
                <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                <span>เลื่อนไปวันพรุ่งนี้</span>
              </button>
            )}
            <button
              type="button"
              className="btn-ios-filled"
              onClick={() => openEditTask(task)}
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <span>แก้ไข</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Title & Badges */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ios-primary leading-snug">
            {task.title}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <DueBadge due={task.due_date} today={today} done={task.status === 'done'} />
            {task.category && (
              <span className="rounded-full bg-ios-fill px-2.5 py-0.5 text-xs font-medium text-ios-secondary">
                {task.category}
              </span>
            )}
          </div>
        </div>

        {/* Quick Status Segmented Switch */}
        <div>
          <p className="label">เปลี่ยนสถานะ</p>
          <SegmentedControl
            className="w-full grid grid-cols-2 sm:grid-cols-4"
            options={STATUSES.map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            }))}
            value={task.status}
            onChange={(val) => changeStatus(val)}
          />
        </div>

        {/* Inset Grouped Details Table (Apple Settings Style) */}
        <div className="ios-inset-group divide-y divide-ios-separator text-sm">
          <DetailRow label="โปรเจกต์">
            {task.project_name ? (
              <span className="font-semibold text-accent">{task.project_name}</span>
            ) : (
              <span className="text-ios-tertiary">งานทั่วไป (ไม่ผูกโปรเจกต์)</span>
            )}
          </DetailRow>

          <DetailRow label="Milestone">
            {task.milestone_title || <span className="text-ios-tertiary">-</span>}
          </DetailRow>

          <DetailRow label="วันที่ทำงาน">
            <span className="tabular-nums">
              {formatDate(task.work_date, yearFormat)}
              {task.work_end_date && task.work_end_date > task.work_date
                ? ` – ${formatDate(task.work_end_date, yearFormat)}`
                : ''}
            </span>
          </DetailRow>

          <DetailRow label="กำหนดส่ง">
            <span className="tabular-nums">
              {task.due_date ? formatDate(task.due_date, yearFormat) : <span className="text-ios-tertiary">-</span>}
            </span>
          </DetailRow>

          {task.completed_at && (
            <DetailRow label="ทำเสร็จเมื่อ">
              <span className="tabular-nums text-status-done font-medium">
                {formatDateTime(task.completed_at, yearFormat)}
              </span>
            </DetailRow>
          )}

          {task.description && (
            <DetailRow label="รายละเอียด" multiline>
              <span className="whitespace-pre-wrap">{task.description}</span>
            </DetailRow>
          )}

          {task.result_note && (
            <DetailRow label="ผลลัพธ์ / หมายเหตุ" multiline>
              <span className="whitespace-pre-wrap font-medium text-status-done">{task.result_note}</span>
            </DetailRow>
          )}

          {task.evidence_link && (
            <DetailRow label="ลิงก์ / หลักฐาน" multiline>
              <EvidenceLink value={task.evidence_link} />
            </DetailRow>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({
  label,
  children,
  multiline = false,
}: {
  label: string;
  children: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className={`px-4 py-3 flex ${multiline ? 'flex-col gap-1' : 'items-center justify-between gap-4'}`}>
      <span className="text-xs font-medium text-ios-secondary shrink-0">{label}</span>
      <div className={`text-ios-primary text-sm ${multiline ? 'mt-0.5' : 'text-right'}`}>{children}</div>
    </div>
  );
}
