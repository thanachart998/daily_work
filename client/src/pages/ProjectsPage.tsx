import {
  PROGRESS_MODE_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type ProjectStatus,
  type ProjectWithStats,
} from '@shared/schemas';
import {
  AlertCircle,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock,
  Copy,
  FolderKanban,
  GanttChart,
  Milestone,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ProgressBar, ProjectStatusBadge } from '../components/Badges';
import EmptyState from '../components/EmptyState';
import ProjectFormModal from '../components/ProjectFormModal';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useLoad } from '../hooks/useLoad';
import { api } from '../lib/api';
import { formatDateShort } from '../lib/format';

export default function ProjectsPage() {
  const { yearFormat, notifyChanged } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const statusFilter = (params.get('status') as ProjectStatus | null) ?? '';

  const { data: projects, error, loading } = useLoad(
    () => api.listProjects(statusFilter || undefined),
    [statusFilter],
  );
  const [showCreate, setShowCreate] = useState(false);

  const setFilter = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set('status', s);
    else next.delete('status');
    setParams(next, { replace: true });
  };

  const handleClone = async (p: ProjectWithStats, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const cloned = await api.cloneProject(p.id);
      toast.success(`คัดลอกโปรเจกต์ "${cloned.name}" เป็นแม่แบบเรียบร้อยแล้ว`);
      notifyChanged();
      navigate(`/projects/${cloned.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="โปรเจกต์ระยะยาว"
        subtitle="บริหารโปรเจกต์หลายเดือน แบ่ง Milestone และติดตามความคืบหน้า"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/timeline" className="btn-secondary">
              <GanttChart className="h-4 w-4" aria-hidden /> เส้นเวลา (Timeline)
            </Link>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden /> สร้างโปรเจกต์
            </button>
          </div>
        }
      />

      {/* iOS Segmented Status Pills */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-ios-control bg-ios-separator/20 w-fit" role="tablist" aria-label="กรองตามสถานะโปรเจกต์">
        <button
          role="tab"
          aria-selected={statusFilter === ''}
          onClick={() => setFilter('')}
          className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
            statusFilter === ''
              ? 'bg-ios-card text-ios-primary shadow-sm'
              : 'text-ios-secondary hover:text-ios-primary'
          }`}
        >
          ทั้งหมด
        </button>
        {PROJECT_STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={statusFilter === s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              statusFilter === s
                ? 'bg-ios-card text-ios-primary shadow-sm'
                : 'text-ios-secondary hover:text-ios-primary'
            }`}
          >
            {PROJECT_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading && !projects ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="ios-card group relative flex flex-col justify-between p-5 transition hover:border-accent"
              style={{ borderLeftWidth: '5px', borderLeftColor: p.color }}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <ProjectStatusBadge status={p.status} />
                      {p.is_overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-status-overdue">
                          <AlertCircle className="h-3 w-3" aria-hidden /> เลย {Math.abs(p.days_remaining ?? 0)} วัน
                        </span>
                      )}
                      {!p.is_overdue && p.days_remaining !== null && p.days_remaining <= 7 && p.status !== 'done' && p.status !== 'cancelled' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-status-warning">
                          <Clock className="h-3 w-3" aria-hidden /> เหลือ {p.days_remaining} วัน
                        </span>
                      )}
                      {p.is_stale && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" aria-hidden /> นิ่ง (&gt;14 วัน)
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-ios-primary group-hover:text-accent transition-colors">
                      {p.name}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleClone(p, e)}
                    className="btn-ghost btn-sm shrink-0 text-xs px-2"
                    title="คัดลอกโปรเจกต์นี้เป็นแม่แบบ"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>

                {p.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-ios-secondary leading-relaxed">
                    {p.description}
                  </p>
                )}

                {/* Date range */}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ios-secondary">
                  <span className="inline-flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5 opacity-60" aria-hidden />
                    เริ่ม {formatDateShort(p.start_date, yearFormat)}
                    {p.target_end_date ? ` · เป้าหมาย ${formatDateShort(p.target_end_date, yearFormat)}` : ''}
                  </span>
                  {p.status === 'done' && p.actual_end_date && (
                    <span className="inline-flex items-center gap-1 font-semibold text-status-done">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> เสร็จจริง {formatDateShort(p.actual_end_date, yearFormat)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3 border-t border-ios-separator/20 pt-3">
                {/* Progress bar */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-ios-secondary">
                      ความคืบหน้า ({p.progress_mode === 'auto' ? `งาน ${p.done_tasks}/${p.total_tasks}` : PROGRESS_MODE_LABEL.manual})
                    </span>
                    <span className="font-bold tabular-nums text-ios-primary">{p.progress}%</span>
                  </div>
                  <ProgressBar value={p.progress} color={p.color} showLabel={false} />
                </div>

                {/* Next Milestone */}
                <div className="flex items-center justify-between gap-2 rounded-ios-control bg-ios-bg p-2.5 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5 text-ios-primary">
                    <Milestone className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                    {p.next_milestone ? (
                      <span className="truncate">
                        <strong className="font-medium">ถัดไป:</strong> {p.next_milestone.title}
                        {p.next_milestone.due_date ? ` (${formatDateShort(p.next_milestone.due_date, yearFormat)})` : ''}
                      </span>
                    ) : p.total_milestones > 0 ? (
                      <span className="text-status-done font-medium">ครบทุก Milestone แล้ว ({p.done_milestones}/{p.total_milestones})</span>
                    ) : (
                      <span className="text-ios-secondary">ยังไม่มี Milestone</span>
                    )}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-ios-secondary">
                    {p.done_milestones}/{p.total_milestones}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderKanban}
          title={statusFilter ? `ไม่พบโปรเจกต์ในสถานะ "${PROJECT_STATUS_LABEL[statusFilter]}"` : 'ยังไม่มีโปรเจกต์ระยะยาว'}
          description="สร้างโปรเจกต์เพื่อแบ่งเฟสการทำงานเป็น Milestone ผูกงานรายวัน และติดตามความก้าวหน้า"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {statusFilter && (
                <button className="btn-secondary" onClick={() => setFilter('')}>
                  ดูทุกสถานะ
                </button>
              )}
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" aria-hidden /> สร้างโปรเจกต์แรก
              </button>
            </div>
          }
        />
      )}

      {showCreate && (
        <ProjectFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(created) => {
            setShowCreate(false);
            notifyChanged();
            navigate(`/projects/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

