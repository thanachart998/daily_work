import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

/** หัวเรื่องของหน้า: Large Title (32px Bold) พร้อมคำอธิบายและปุ่มการกระทำ */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-ios-primary leading-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-ios-secondary leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Skeleton Placeholder สำหรับโหลดข้อมูลแบบ iOS Shimmer */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-ios-fill ${className}`} aria-hidden="true" />
  );
}

/** หน้าโหลดข้อมูลแบบ Skeleton Cards */
export function Loading() {
  return (
    <div className="space-y-4 py-4" role="status" aria-label="กำลังโหลดข้อมูล">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ios-card p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="ios-card p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

/** กล่องแจ้งข้อผิดพลาดสไตล์ iOS Banner */
export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-status-overdue/25 bg-status-overdue-tint p-4 text-sm text-status-overdue"
      role="alert"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="font-medium leading-relaxed">{message}</span>
    </div>
  );
}

/** การ์ดสรุปตัวเลขสไตล์ iOS Widget */
export function StatCard({
  label,
  value,
  tone = 'slate',
  icon,
  hint,
  accessory,
}: {
  label: string;
  value: ReactNode;
  tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'indigo' | 'accent';
  icon?: ReactNode;
  hint?: string;
  accessory?: ReactNode;
}) {
  const tones = {
    slate: 'text-ios-primary',
    emerald: 'text-status-done',
    amber: 'text-status-warning',
    red: 'text-status-overdue',
    indigo: 'text-accent',
    accent: 'text-accent',
  };

  return (
    <div className="ios-card print-avoid-break flex flex-col justify-between p-4 transition-all hover:border-ios-separator-opaque">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-ios-secondary">
          {icon && <span className="opacity-90">{icon}</span>}
          <span>{label}</span>
        </div>
        {accessory}
      </div>

      <div className="mt-2">
        <p className={`tabular-nums text-[28px] sm:text-[32px] font-bold tracking-tight ${tones[tone]} leading-tight`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-ios-secondary">{hint}</p>}
      </div>
    </div>
  );
}

/** iOS Segmented Control */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center rounded-xl bg-ios-fill p-1 text-xs font-medium text-ios-secondary select-none ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-1.5 transition-all ${
              active
                ? 'bg-ios-card text-ios-primary font-semibold shadow-sm'
                : 'hover:text-ios-primary text-ios-secondary'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
