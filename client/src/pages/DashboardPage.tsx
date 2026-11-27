import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FolderKanban,
  History,
  ListTodo,
  Milestone as MilestoneIcon,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar, ProgressRing, ProjectStatusBadge } from '../components/Badges';
import EmptyState from '../components/EmptyState';
import TaskItem from '../components/TaskItem';
import { ErrorBox, Loading, PageHeader, StatCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useLoad } from '../hooks/useLoad';
import { api } from '../lib/api';
import { formatDateFull, formatDateShort } from '../lib/format';

export default function DashboardPage() {
  const { yearFormat, openNewTask, notifyChanged } = useApp();
  const toast = useToast();
  const { data, error, loading } = useLoad(() => api.dashboard());
  const [seeding, setSeeding] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const {
    today,
    todayTasks,
    counts,
    todayCounts,
    dueSoon,
    overdue,
    carryOver,
    activeProjects = [],
    upcomingMilestones = [],
    staleOrUrgentProjects = [],
  } = data;
  const isEmpty = counts.total === 0 && activeProjects.length === 0;

  const postponeAll = async () => {
    try {
      const r = await api.postpone(carryOver.map((t) => t.id));
      toast.success(`เลื่อนงานค้าง ${r.updated.length} งานแล้ว`);
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const r = await api.seedSample();
      toast.success(`เพิ่มข้อมูลตัวอย่าง ${r.inserted} งาน และโปรเจกต์ตัวอย่างเรียบร้อยแล้ว`);
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const todayPercent = todayCounts.total > 0 ? Math.round((todayCounts.done / todayCounts.total) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="ภาพรวม"
        subtitle={formatDateFull(today, yearFormat)}
        actions={
          <button className="btn-primary" onClick={() => openNewTask({ work_date: today })}>
            <Plus className="h-4 w-4" aria-hidden /> เพิ่มงานวันนี้
          </button>
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={CalendarCheck2}
          title="ยินดีต้อนรับ! ยังไม่มีงานในระบบ"
          description="เริ่มบันทึกงานแรกของวันนี้ หรือลองเพิ่มข้อมูลตัวอย่างเพื่อดูการทำงานของระบบ"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={() => openNewTask({ work_date: today })}>
                <Plus className="h-4 w-4" aria-hidden /> เพิ่มงานแรก
              </button>
              <button className="btn-secondary" onClick={seed} disabled={seeding}>
                {seeding ? 'กำลังเพิ่ม…' : 'เพิ่มข้อมูลตัวอย่าง'}
              </button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* iOS Widgets Grid */}
          <section aria-label="สรุปจำนวนงาน" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="งานทั้งหมด"
              value={counts.total}
              icon={<ListTodo className="h-4 w-4" aria-hidden />}
              hint={`${counts.notDone} งานที่ต้องทำ`}
            />
            <StatCard
              label="เสร็จสิ้นแล้ว"
              value={counts.done}
              tone="emerald"
              icon={<CheckCircle2 className="h-4 w-4 text-status-done" aria-hidden />}
              hint={`สำเร็จ ${counts.total ? Math.round((counts.done / counts.total) * 100) : 0}% ของทั้งหมด`}
            />
            {/* Today Widget with ProgressRing */}
            <div className="ios-card flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-semibold text-ios-secondary">งานวันนี้</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-ios-primary tabular-nums">
                  {todayCounts.done}
                  <span className="text-base font-normal text-ios-secondary">/{todayCounts.total}</span>
                </p>
                <p className="mt-1 text-xs text-ios-secondary">
                  {todayCounts.total === 0 ? 'ยังไม่มีงาน' : `${todayPercent}% สำเร็จ`}
                </p>
              </div>
              <ProgressRing value={todayPercent} size={48} strokeWidth={5} color="var(--color-accent)" />
            </div>

            <StatCard
              label="เลยกำหนด"
              value={overdue.length}
              tone={overdue.length ? 'red' : 'slate'}
              icon={<AlertCircle className={`h-4 w-4 ${overdue.length ? 'text-status-overdue' : 'text-ios-secondary'}`} aria-hidden />}
              hint={overdue.length ? 'ต้องรีบดำเนินการ' : 'ไม่มีงานเลยกำหนด'}
            />
          </section>

          {/* Stale / Urgent Projects Notice */}
          {staleOrUrgentProjects.length > 0 && (
            <section className="rounded-ios-card border border-status-warning/30 bg-amber-500/10 p-4" aria-labelledby="stale-proj-h">
              <h2 id="stale-proj-h" className="mb-3 flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                แจ้งเตือนโปรเจกต์ระยะยาว ({staleOrUrgentProjects.length})
              </h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {staleOrUrgentProjects.map((p) => (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="ios-card flex items-center justify-between gap-3 p-3 transition hover:border-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ios-primary text-sm">{p.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {p.is_overdue && (
                          <span className="font-semibold text-status-overdue">เลยกำหนด {Math.abs(p.days_remaining ?? 0)} วัน</span>
                        )}
                        {!p.is_overdue && p.days_remaining !== null && p.days_remaining <= 7 && (
                          <span className="font-medium text-status-warning">ใกล้ครบกำหนด (เหลือ {p.days_remaining} วัน)</span>
                        )}
                        {p.is_stale && (
                          <span className="font-medium text-ios-secondary">💤 ไม่มีการอัปเดตเกิน 14 วัน</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-accent">{p.progress}%</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Overdue Tasks Section */}
          {overdue.length > 0 && (
            <section className="rounded-ios-card border border-status-overdue/25 bg-red-500/10 p-4" aria-labelledby="overdue-h">
              <h2 id="overdue-h" className="mb-3 flex items-center gap-2 font-semibold text-status-overdue">
                <AlertCircle className="h-4 w-4" aria-hidden /> งานเลยกำหนด ({overdue.length})
              </h2>
              <ul className="space-y-2">
                {overdue.map((t) => (
                  <TaskItem key={t.id} task={t} />
                ))}
              </ul>
            </section>
          )}

          {/* Active Projects Widget */}
          <section className="ios-card p-5" aria-labelledby="active-projects-h">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="active-projects-h" className="flex items-center gap-2 text-base font-semibold text-ios-primary">
                <FolderKanban className="h-4 w-4 text-accent" aria-hidden />
                โปรเจกต์ที่กำลังทำ ({activeProjects.length})
              </h2>
              <Link to="/projects" className="text-xs font-semibold text-accent hover:underline">
                ดูโปรเจกต์ทั้งหมด →
              </Link>
            </div>

            {activeProjects.length === 0 ? (
              <div className="rounded-ios-control border border-dashed border-ios-separator/60 p-6 text-center text-sm text-ios-secondary">
                <p>ยังไม่มีโปรเจกต์ที่กำลังทำในขณะนี้</p>
                <Link to="/projects" className="btn-secondary btn-sm mt-3 inline-flex">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> สร้างโปรเจกต์ใหม่
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {activeProjects.map((p) => (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="ios-card group relative p-4 transition hover:border-accent"
                    style={{ borderLeftWidth: '4px', borderLeftColor: p.color }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ios-primary group-hover:text-accent transition-colors">
                          {p.name}
                        </p>
                        <p className="mt-0.5 text-xs text-ios-secondary">
                          เริ่ม {formatDateShort(p.start_date, yearFormat)}
                          {p.target_end_date ? ` · สิ้นสุด ${formatDateShort(p.target_end_date, yearFormat)}` : ''}
                        </p>
                      </div>
                      <ProjectStatusBadge status={p.status} />
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={p.progress} color={p.color} />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs text-ios-secondary">
                      <span className="truncate">
                        {p.next_milestone ? (
                          <>
                            <strong className="text-ios-primary font-medium">Milestone:</strong> {p.next_milestone.title}
                          </>
                        ) : (
                          'ไม่มี Milestone ที่รอทำ'
                        )}
                      </span>
                      <span className="shrink-0 pl-2 font-medium tabular-nums">
                        {p.done_tasks}/{p.total_tasks} งาน
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {upcomingMilestones.length > 0 && (
              <div className="mt-5 border-t border-ios-separator/20 pt-4">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-ios-secondary uppercase tracking-wider">
                  <MilestoneIcon className="h-3.5 w-3.5 text-accent" aria-hidden />
                  Milestone ที่ใกล้ถึงกำหนด (ภายใน 14 วัน)
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {upcomingMilestones.map((m) => (
                    <Link
                      key={m.id}
                      to={`/projects/${m.project_id}`}
                      className="ios-card flex items-center justify-between gap-3 p-3 text-xs hover:border-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ios-primary">{m.title}</p>
                        <p className="truncate text-ios-secondary mt-0.5">
                          {m.project_name} · กำหนด {formatDateShort(m.due_date, yearFormat)}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-accent">{m.progress}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Today & Carry-over 2-column Layout */}
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Today's Tasks */}
            <section className="space-y-3 lg:col-span-3" aria-labelledby="today-h">
              <div className="flex items-center justify-between">
                <h2 id="today-h" className="text-base font-semibold text-ios-primary">
                  งานวันนี้
                  <span className="ml-2 text-xs font-normal text-ios-secondary tabular-nums">
                    เสร็จ {todayCounts.done}/{todayCounts.total}
                  </span>
                </h2>
                <button className="btn-secondary btn-sm" onClick={() => openNewTask({ work_date: today })}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่ม
                </button>
              </div>

              {todayTasks.length ? (
                <ul className="space-y-2">
                  {todayTasks.map((t) => (
                    <TaskItem key={t.id} task={t} showDate={false} />
                  ))}
                </ul>
              ) : (
                <div className="ios-card p-8 text-center text-ios-secondary">
                  <CalendarCheck2 className="mx-auto h-8 w-8 text-ios-secondary/50 mb-2" />
                  <p className="font-semibold text-ios-primary text-sm">ไม่มีงานสำหรับวันนี้</p>
                  <p className="text-xs mt-1 text-ios-secondary">แตะปุ่มเพื่อเพิ่มงานใหม่</p>
                  <button className="btn-primary btn-sm mt-3" onClick={() => openNewTask({ work_date: today })}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่มงานวันนี้
                  </button>
                </div>
              )}
            </section>

            {/* Sidebar Column: Due Soon & Carry-over */}
            <div className="space-y-6 lg:col-span-2">
              <section aria-labelledby="soon-h" className="space-y-3">
                <h2 id="soon-h" className="flex items-center gap-2 text-base font-semibold text-ios-primary">
                  <Clock className="h-4 w-4 text-status-warning" aria-hidden /> ใกล้ถึงกำหนด (3 วัน)
                </h2>
                {dueSoon.length ? (
                  <ul className="space-y-2">
                    {dueSoon.map((t) => (
                      <TaskItem key={t.id} task={t} />
                    ))}
                  </ul>
                ) : (
                  <div className="ios-card p-4 text-center text-xs text-ios-secondary">
                    ไม่มีงานที่ใกล้ถึงกำหนด
                  </div>
                )}
              </section>

              {carryOver.length > 0 && (
                <section aria-labelledby="carry-h" className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 id="carry-h" className="flex items-center gap-2 text-base font-semibold text-ios-primary">
                      <History className="h-4 w-4 text-ios-secondary" aria-hidden /> งานค้างจากวันก่อน ({carryOver.length})
                    </h2>
                    <button className="btn-secondary btn-sm" onClick={postponeAll}>
                      เลื่อนทั้งหมด
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {carryOver.slice(0, 8).map((t) => (
                      <TaskItem key={t.id} task={t} />
                    ))}
                  </ul>
                  {carryOver.length > 8 && (
                    <Link to="/tasks?pending=1" className="block text-center text-xs font-semibold text-accent hover:underline pt-1">
                      ดูงานค้างทั้งหมด ({carryOver.length}) →
                    </Link>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
