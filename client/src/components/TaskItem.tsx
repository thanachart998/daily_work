import { STATUS_LABEL, type Task, type TaskStatus } from '@shared/schemas';
import { todayStr } from '@shared/dates';
import { CalendarClock, Check, ChevronRight, FolderKanban, Milestone, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { formatDateShort } from '../lib/format';
import { DueBadge, PriorityBadge, StatusBadge } from './Badges';

interface Props {
  task: Task;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  showDate?: boolean;
  showProject?: boolean;
}

/** แถวแสดงงานสไตล์ iOS: Checkbox วงกลม แอนิเมชันนุ่มนวล และปุ่มลอยเมื่อชี้เมาส์ */
export default function TaskItem({
  task,
  selectable,
  selected,
  onSelect,
  showDate = true,
  showProject = true,
}: Props) {
  const { yearFormat, openTaskDetail, openEditTask, deleteTaskWithConfirm, notifyChanged, handleTaskSaved } = useApp();
  const toast = useToast();
  const today = todayStr();
  const done = task.status === 'done';
  const overdue = !done && !!task.due_date && task.due_date < today;
  const isMultiDay = !!task.work_end_date && task.work_end_date > task.work_date;

  const toggleDone = async () => {
    const next: TaskStatus = done ? 'todo' : 'done';
    try {
      const updated = await api.setStatus(task.id, next);
      toast.success(done ? `เปลี่ยนกลับเป็น "${STATUS_LABEL.todo}" แล้ว` : 'ทำเครื่องหมายว่าเสร็จแล้ว');
      await handleTaskSaved(updated);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const postpone = async () => {
    try {
      await api.postpone([task.id]);
      toast.success('เลื่อนงานไปวันถัดไปแล้ว');
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <li
      className={`group relative flex items-start gap-3 rounded-[13px] border bg-ios-card px-3.5 py-3 transition-all hover:bg-ios-fill/40 hover:border-ios-separator-opaque ${
        overdue
          ? 'border-status-overdue/40 bg-status-overdue-tint/10'
          : 'border-ios-separator'
      }`}
    >
      {selectable && (
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 rounded-md border-ios-separator-opaque accent-accent"
          checked={!!selected}
          onChange={(e) => onSelect?.(e.target.checked)}
          aria-label={`เลือกงาน ${task.title}`}
        />
      )}

      {/* iOS Circular Animated Checkbox */}
      <button
        type="button"
        onClick={toggleDone}
        title={done ? 'คลิกเพื่อเปลี่ยนกลับเป็นยังไม่เริ่ม' : 'คลิกเพื่อทำเครื่องหมายว่าเสร็จ'}
        aria-label={done ? `ยกเลิกเสร็จ: ${task.title}` : `ทำเครื่องหมายเสร็จ: ${task.title}`}
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.75px] transition-all active:scale-90 ${
          done
            ? 'border-status-done bg-status-done text-white shadow-sm'
            : 'border-ios-separator-opaque text-transparent hover:border-accent hover:bg-accent-tint/30'
        }`}
      >
        <motion.div
          initial={false}
          animate={{ scale: done ? 1 : 0.4, opacity: done ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </motion.div>
      </button>

      {/* Task Details */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => openTaskDetail(task)}
      >
        <p
          className={`text-[15px] leading-snug font-medium transition-colors ${
            done ? 'text-ios-tertiary line-through decoration-ios-tertiary/60' : 'text-ios-primary'
          }`}
        >
          {task.title}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ios-secondary">
          <StatusBadge status={task.status} />
          <DueBadge due={task.due_date} today={today} done={done} />
          {task.priority !== 'medium' && <PriorityBadge priority={task.priority} />}

          {showProject && task.project_name && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-ios-fill px-2 py-0.5 font-medium text-ios-primary"
              style={task.project_color ? { borderLeft: `3px solid ${task.project_color}` } : undefined}
            >
              <FolderKanban className="h-3 w-3 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
              {task.project_name}
            </span>
          )}

          {task.milestone_title && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 font-medium text-accent">
              <Milestone className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
              {task.milestone_title}
            </span>
          )}

          {task.category && (
            <span className="rounded-full bg-ios-fill px-2 py-0.5 font-medium text-ios-secondary">
              {task.category}
            </span>
          )}

          {(showDate || isMultiDay) && (
            <span className="text-ios-secondary">
              {formatDateShort(task.work_date, yearFormat)}
              {isMultiDay ? ` – ${formatDateShort(task.work_end_date, yearFormat)}` : ''}
            </span>
          )}

          {task.due_date && !done && (
            <span className="text-ios-secondary">· ส่ง {formatDateShort(task.due_date, yearFormat)}</span>
          )}
        </div>
      </button>

      {/* Desktop Hover Quick Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {!done && (
          <button
            type="button"
            onClick={postpone}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ios-secondary transition hover:bg-ios-fill hover:text-ios-primary"
            title="เลื่อนไปวันถัดไป"
            aria-label={`เลื่อนไปวันถัดไป: ${task.title}`}
          >
            <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => openEditTask(task)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ios-secondary transition hover:bg-ios-fill hover:text-ios-primary"
          title="แก้ไขงาน"
          aria-label={`แก้ไขงาน: ${task.title}`}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => deleteTaskWithConfirm(task)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-status-overdue transition hover:bg-status-overdue-tint"
          title="ลบงาน"
          aria-label={`ลบงาน: ${task.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </button>
        <ChevronRight className="hidden h-4 w-4 text-ios-tertiary sm:block" strokeWidth={1.75} aria-hidden />
      </div>
    </li>
  );
}
