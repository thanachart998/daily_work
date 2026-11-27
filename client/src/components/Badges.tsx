import {
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  STATUS_LABEL,
  type ProjectStatus,
  type TaskPriority,
  type TaskStatus,
} from '@shared/schemas';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Compass,
  FileSearch,
  PauseCircle,
  PlayCircle,
  Rocket,
} from 'lucide-react';
import { relativeDue } from '../lib/format';

/** ป้ายสถานะงานสไตล์ iOS: สีเฉพาะตัวพร้อมไอคอนและป้ายข้อความ */
export const STATUS_STYLE: Record<TaskStatus, { cls: string; dotCls: string; Icon: typeof Circle }> = {
  todo: {
    cls: 'bg-ios-fill text-ios-secondary',
    dotCls: 'bg-status-todo',
    Icon: Circle,
  },
  doing: {
    cls: 'bg-accent-tint text-accent font-medium',
    dotCls: 'bg-accent',
    Icon: PlayCircle,
  },
  review: {
    cls: 'bg-status-review-tint text-status-review font-medium',
    dotCls: 'bg-status-review',
    Icon: FileSearch,
  },
  done: {
    cls: 'bg-status-done-tint text-status-done font-medium',
    dotCls: 'bg-status-done',
    Icon: CheckCircle2,
  },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { cls, Icon } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${cls}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** ป้ายสถานะโปรเจกต์สไตล์ iOS */
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, { cls: string; Icon: typeof Circle }> = {
  planning: { cls: 'bg-accent-tint text-accent', Icon: Compass },
  active: { cls: 'bg-accent-tint text-accent font-semibold', Icon: Rocket },
  on_hold: { cls: 'bg-status-warning-tint text-status-warning', Icon: PauseCircle },
  done: { cls: 'bg-status-done-tint text-status-done font-semibold', Icon: CheckCircle2 },
  cancelled: { cls: 'bg-ios-fill text-ios-tertiary', Icon: Ban },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { cls, Icon } = PROJECT_STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${cls}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}

/** ป้ายระดับความสำคัญ: แสดงจุดสีและข้อความชัดเจน */
const PRIORITY_STYLE: Record<TaskPriority, { textCls: string; dotCls: string }> = {
  low: { textCls: 'text-ios-secondary', dotCls: 'bg-status-todo' },
  medium: { textCls: 'text-status-warning', dotCls: 'bg-status-warning' },
  high: { textCls: 'text-status-overdue font-medium', dotCls: 'bg-status-overdue' },
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { textCls, dotCls } = PRIORITY_STYLE[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${textCls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} aria-hidden />
      ความสำคัญ{PRIORITY_LABEL[priority]}
    </span>
  );
}

/** ป้ายกำหนดส่ง: เลยกำหนด (แดง) / ใกล้ถึง (ส้ม) */
export function DueBadge({ due, today, done }: { due: string | null; today: string; done: boolean }) {
  if (!due || done) return null;
  if (due < today) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-status-overdue-tint px-2.5 py-0.5 text-xs font-semibold text-status-overdue">
        <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
        {relativeDue(due, today)}
      </span>
    );
  }
  const isSoon = due <= addDaysSimple(today, 3);
  if (!isSoon) return null;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-status-warning-tint px-2.5 py-0.5 text-xs font-medium text-status-warning">
      <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
      {relativeDue(due, today)}
    </span>
  );
}

/** แถบ Progress Bar โค้งมนสไตล์ iOS */
export function ProgressBar({
  value,
  color,
  size = 'md',
  label,
  showLabel = false,
}: {
  value: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const h = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-full overflow-hidden rounded-full bg-ios-fill ${h}`}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `ความคืบหน้า ${clamped}%`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${clamped === 100 ? 'bg-status-done' : 'bg-accent'}`}
          style={{
            width: `${clamped}%`,
            backgroundColor: clamped === 100 ? undefined : color,
          }}
        />
      </div>
      {showLabel && <span className="tabular-nums shrink-0 text-xs font-semibold text-ios-secondary">{clamped}%</span>}
    </div>
  );
}

/** วงแหวนความคืบหน้า (Progress Ring) สไตล์ iOS Widget Activity Ring */
export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 6,
  color,
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 transform">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-ios-fill"
        />
        {/* Animated Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={clamped === 100 ? 'var(--color-done)' : (color || 'var(--color-accent)')}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}

function addDaysSimple(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
