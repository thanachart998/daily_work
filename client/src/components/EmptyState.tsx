import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** หน้าว่างมินิมอลสไตล์ iOS: ไอคอนนุ่มตา ข้อความสั้น และปุ่มหลัก */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[18px] border border-ios-separator/80 bg-ios-card/60 px-6 py-12 text-center backdrop-blur-sm">
      <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint">
        <Icon className="h-7 w-7 text-accent" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-ios-primary">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ios-secondary">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
