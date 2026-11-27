import {
  milestoneInputSchema,
  PROGRESS_MODE_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  STATUSES,
  STATUS_LABEL,
  type MilestoneInput,
  type MilestoneWithStats,
  type ProjectStatus,
  type ProjectTaskDeleteAction,
  type ProjectUpdate,
  type TaskStatus,
} from '@shared/schemas';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  Copy,
  FileText,
  FolderKanban,
  Milestone as MilestoneIcon,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProgressBar, ProjectStatusBadge, StatusBadge } from '../components/Badges';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ProjectFormModal from '../components/ProjectFormModal';
import ProjectUpdateModal from '../components/ProjectUpdateModal';
import TaskItem from '../components/TaskItem';
import { ErrorBox, Loading } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useLoad } from '../hooks/useLoad';
import { api, ApiError } from '../lib/api';
import { formatDate, formatDateShort, formatDateTime, formatMonth } from '../lib/format';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { yearFormat, openNewTask, notifyChanged, confirm } = useApp();
  const toast = useToast();

  const { data: project, error, loading } = useLoad(() => api.getProject(projectId), [projectId]);

  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState<{ mode: 'new' } | { mode: 'edit'; milestone: MilestoneWithStats } | null>(null);
  const [updateModal, setUpdateModal] = useState<{ existing?: ProjectUpdate | null } | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | 'all' | 'unassigned'>('all');

  const filteredTasks = useMemo(() => {
    if (!project) return [];
    if (selectedMilestoneId === 'all') return project.tasks;
    if (selectedMilestoneId === 'unassigned') return project.tasks.filter((t) => !t.milestone_id);
    return project.tasks.filter((t) => t.milestone_id === selectedMilestoneId);
  }, [project, selectedMilestoneId]);

  if (loading && !project) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!project) return null;

  const handleStatusChange = async (nextStatus: ProjectStatus) => {
    if (nextStatus === project.status) return;
    try {
      await api.updateProject(project.id, {
        name: project.name,
        description: project.description,
        start_date: project.start_date,
        target_end_date: project.target_end_date,
        status: nextStatus,
        color: project.color,
        progress_mode: project.progress_mode,
        manual_progress: project.manual_progress,
      });
      toast.success(`เปลี่ยนสถานะโปรเจกต์เป็น "${PROJECT_STATUS_LABEL[nextStatus]}" แล้ว`);
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleClone = async () => {
    try {
      const cloned = await api.cloneProject(project.id);
      toast.success(`คัดลอกโปรเจกต์ "${cloned.name}" เป็นแม่แบบเรียบร้อยแล้ว`);
      notifyChanged();
      navigate(`/projects/${cloned.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleMilestoneStatus = async (m: MilestoneWithStats, next: TaskStatus) => {
    if (m.status === next) return;
    try {
      await api.setMilestoneStatus(m.id, next);
      toast.success(`เปลี่ยนสถานะ Milestone "${m.title}" เป็น "${STATUS_LABEL[next]}" แล้ว`);
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDeleteMilestone = async (m: MilestoneWithStats) => {
    const ok = await confirm({
      title: 'ยืนยันการลบ Milestone',
      message: `ต้องการลบ Milestone "${m.title}" ใช่หรือไม่? (งานที่ผูกกับ Milestone นี้จะไม่ถูกลบ แต่จะถูกปลดออกจาก Milestone มารวมอยู่ในโปรเจกต์หลัก)`,
      confirmText: 'ลบ Milestone',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteMilestone(m.id);
      toast.success('ลบ Milestone เรียบร้อยแล้ว');
      if (selectedMilestoneId === m.id) setSelectedMilestoneId('all');
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDeleteUpdate = async (u: ProjectUpdate) => {
    const ok = await confirm({
      title: 'ยืนยันการลบสรุปรายเดือน',
      message: `ต้องการลบบันทึกความคืบหน้าประจำเดือน ${formatMonth(u.period, yearFormat)} ใช่หรือไม่?`,
      confirmText: 'ลบรายการ',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteProjectUpdate(project.id, u.period);
      toast.success('ลบบันทึกความคืบหน้ารายเดือนแล้ว');
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link to="/projects" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80 transition">
          <ArrowLeft className="h-4 w-4" aria-hidden /> กลับไปหน้ารายการโปรเจกต์
        </Link>

        {/* Project Header Card */}
        <div
          className="ios-card p-5"
          style={{ borderLeftWidth: '5px', borderLeftColor: project.color }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <ProjectStatusBadge status={project.status} />
                {project.is_overdue && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-status-overdue">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden /> เลยกำหนด {Math.abs(project.days_remaining ?? 0)} วัน
                  </span>
                )}
                {project.is_stale && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> นิ่งเกิน 14 วัน
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold tracking-tight text-ios-primary">{project.name}</h1>
              {project.description && (
                <p className="mt-2 whitespace-pre-wrap text-xs text-ios-secondary leading-relaxed">
                  {project.description}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-secondary btn-sm" onClick={handleClone} title="คัดลอกเป็นแม่แบบ">
                <Copy className="h-3.5 w-3.5" aria-hidden /> แม่แบบ
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setShowEditProject(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> แก้ไข
              </button>
              <button className="btn-danger btn-sm" onClick={() => setShowDeleteProject(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> ลบ
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ios-separator/20 pt-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <p className="font-semibold text-ios-secondary">ช่วงเวลา</p>
              <p className="mt-1 font-medium text-ios-primary flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden />
                {formatDate(project.start_date, yearFormat)}
                {project.target_end_date ? ` – ${formatDate(project.target_end_date, yearFormat)}` : ' (ไม่ระบุวันจบ)'}
              </p>
              {project.actual_end_date && (
                <p className="mt-1 font-semibold text-status-done">เสร็จจริง: {formatDate(project.actual_end_date, yearFormat)}</p>
              )}
            </div>

            <div>
              <p className="font-semibold text-ios-secondary">เวลาคงเหลือ</p>
              <p className="mt-1 font-medium text-ios-primary">
                {project.status === 'done'
                  ? 'เสร็จสิ้นแล้ว 🎉'
                  : project.days_remaining === null
                    ? 'ไม่ได้กำหนดวันสิ้นสุด'
                    : project.days_remaining < 0
                      ? `เลยกำหนด ${Math.abs(project.days_remaining)} วัน`
                      : project.days_remaining === 0
                        ? 'ครบกำหนดวันนี้'
                        : `เหลืออีก ${project.days_remaining} วัน`}
              </p>
            </div>

            <div>
              <p className="font-semibold text-ios-secondary mb-1">เปลี่ยนสถานะ</p>
              <select
                className="ios-input py-1 text-xs w-full"
                value={project.status}
                onChange={(e) => handleStatusChange(e.target.value as ProjectStatus)}
                aria-label="เปลี่ยนสถานะโปรเจกต์"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROJECT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ios-secondary">
                  ความคืบหน้า ({project.progress_mode === 'auto' ? `${project.done_tasks}/${project.total_tasks} งาน` : PROGRESS_MODE_LABEL.manual})
                </span>
                <span className="font-bold tabular-nums text-ios-primary">{project.progress}%</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={project.progress} color={project.color} size="md" showLabel={false} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ส่วนที่ 1: Milestone */}
      <section className="ios-card p-5 space-y-4" aria-labelledby="milestones-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="milestones-h" className="flex items-center gap-2 text-base font-bold text-ios-primary">
              <MilestoneIcon className="h-4 w-4 text-accent" aria-hidden />
              Milestone ของโปรเจกต์ ({project.done_milestones}/{project.total_milestones} สำเร็จ)
            </h2>
            <p className="text-xs text-ios-secondary mt-0.5">
              ความคืบหน้าคำนวณจากงานย่อยที่เสร็จในแต่ละ Milestone
            </p>
          </div>
          <button className="btn-primary btn-sm" onClick={() => setMilestoneModal({ mode: 'new' })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่ม Milestone
          </button>
        </div>

        {project.milestones.length === 0 ? (
          <div className="rounded-ios-control border border-dashed border-ios-separator/60 p-6 text-center text-xs text-ios-secondary">
            <p className="font-semibold text-ios-primary">ยังไม่มี Milestone ในโปรเจกต์นี้</p>
            <p className="mt-1">แบ่งโปรเจกต์ออกเป็นระยะเพื่อติดตามงานได้ชัดเจนยิ่งขึ้น</p>
            <button className="btn-secondary btn-sm mt-3 inline-flex" onClick={() => setMilestoneModal({ mode: 'new' })}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่ม Milestone แรก
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {project.milestones.map((m, idx) => (
              <div
                key={m.id}
                className={`rounded-ios-card border p-3.5 transition ${
                  selectedMilestoneId === m.id
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-ios-separator/20 bg-ios-bg hover:border-accent/40'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-ios-separator/30 px-2 py-0.5 text-xs font-semibold text-ios-primary tabular-nums">
                        #{idx + 1}
                      </span>
                      <StatusBadge status={m.status} />
                      <h3 className="font-bold text-sm text-ios-primary">{m.title}</h3>
                      {m.due_date && (
                        <span className="text-xs text-ios-secondary">· กำหนด {formatDateShort(m.due_date, yearFormat)}</span>
                      )}
                      {m.completed_at && m.status === 'done' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-done">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {formatDateTime(m.completed_at, yearFormat)}
                        </span>
                      )}
                    </div>
                    {m.description && <p className="mt-1 text-xs text-ios-secondary leading-relaxed">{m.description}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      className="ios-input py-1 text-xs"
                      value={m.status}
                      onChange={(e) => handleMilestoneStatus(m, e.target.value as TaskStatus)}
                      aria-label={`สถานะของ Milestone ${m.title}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => openNewTask({ project_id: project.id, milestone_id: m.id })}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่มงาน
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setMilestoneModal({ mode: 'edit', milestone: m })}
                      aria-label={`แก้ไข Milestone ${m.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="btn-ghost btn-sm text-status-overdue"
                      onClick={() => handleDeleteMilestone(m)}
                      aria-label={`ลบ Milestone ${m.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar value={m.progress} color={project.color} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedMilestoneId(selectedMilestoneId === m.id ? 'all' : m.id)}
                    className="text-xs font-semibold text-accent hover:opacity-80 transition shrink-0"
                  >
                    งานย่อย {m.done_tasks}/{m.total_tasks} รายการ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ส่วนที่ 2: รายการงานย่อย */}
      <section className="ios-card p-5 space-y-4" aria-labelledby="project-tasks-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="project-tasks-h" className="flex items-center gap-2 text-base font-bold text-ios-primary">
              <FolderKanban className="h-4 w-4 text-accent" aria-hidden />
              งานรายวันที่ผูกกับโปรเจกต์นี้ ({filteredTasks.length} รายการ)
            </h2>
            <p className="text-xs text-ios-secondary mt-0.5">คลิกติ๊กถูกเพื่อเปลี่ยนสถานะ หรือคลิกชื่องานเพื่อดูรายละเอียด</p>
          </div>
          <button
            className="btn-primary btn-sm"
            onClick={() =>
              openNewTask({
                project_id: project.id,
                milestone_id: typeof selectedMilestoneId === 'number' ? selectedMilestoneId : null,
              })
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่มงานใหม่
          </button>
        </div>

        {/* Milestone Selector Pills */}
        {project.milestones.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => setSelectedMilestoneId('all')}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                selectedMilestoneId === 'all' ? 'bg-accent text-white shadow-sm' : 'bg-ios-bg text-ios-secondary hover:text-ios-primary'
              }`}
            >
              ทุกงาน ({project.tasks.length})
            </button>
            {project.milestones.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMilestoneId(m.id)}
                className={`rounded-full px-3 py-1 font-semibold transition ${
                  selectedMilestoneId === m.id ? 'bg-accent text-white shadow-sm' : 'bg-ios-bg text-ios-secondary hover:text-ios-primary'
                }`}
              >
                {m.title} ({m.total_tasks})
              </button>
            ))}
            <button
              onClick={() => setSelectedMilestoneId('unassigned')}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                selectedMilestoneId === 'unassigned' ? 'bg-accent text-white shadow-sm' : 'bg-ios-bg text-ios-secondary hover:text-ios-primary'
              }`}
            >
              ไม่ระบุ Milestone ({project.tasks.filter((t) => !t.milestone_id).length})
            </button>
          </div>
        )}

        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="ยังไม่มีงานย่อยในหมวดที่เลือก"
            description="กดปุ่มเพื่อเพิ่มงานประจำวันเข้ากับโปรเจกต์นี้"
            action={
              <button
                className="btn-primary btn-sm"
                onClick={() =>
                  openNewTask({
                    project_id: project.id,
                    milestone_id: typeof selectedMilestoneId === 'number' ? selectedMilestoneId : null,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> เพิ่มงานใหม่
              </button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {filteredTasks.map((t) => (
              <TaskItem key={t.id} task={t} showProject={false} />
            ))}
          </ul>
        )}
      </section>

      {/* ส่วนที่ 3: บันทึกความคืบหน้ารายเดือน */}
      <section className="ios-card p-5 space-y-4" aria-labelledby="project-updates-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="project-updates-h" className="flex items-center gap-2 text-base font-bold text-ios-primary">
              <FileText className="h-4 w-4 text-accent" aria-hidden />
              บันทึกความคืบหน้ารายเดือน ({project.updates.length} เดือน)
            </h2>
            <p className="text-xs text-ios-secondary mt-0.5">
              สรุปความคืบหน้า ปัญหา และแผนเดือนถัดไปจะนำไปแสดงในรายงานผลงานรายเดือน
            </p>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setUpdateModal({ existing: null })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> บันทึกอัปเดตประจำเดือน
          </button>
        </div>

        {project.updates.length === 0 ? (
          <div className="rounded-ios-control border border-dashed border-ios-separator/60 p-4 text-center text-xs text-ios-secondary">
            ยังไม่มีบันทึกความคืบหน้ารายเดือนของโปรเจกต์นี้
          </div>
        ) : (
          <div className="space-y-3">
            {project.updates.map((u) => (
              <div key={u.id} className="rounded-ios-card border border-ios-separator/20 bg-ios-bg p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-accent/15 px-3 py-0.5 text-xs font-bold text-accent">
                    ประจำเดือน {formatMonth(u.period, yearFormat)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => setUpdateModal({ existing: u })}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> แก้ไข
                    </button>
                    <button className="btn-ghost btn-sm text-status-overdue" onClick={() => handleDeleteUpdate(u)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
                <dl className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold text-ios-secondary">สิ่งที่ทำในเดือนนี้</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ios-primary leading-relaxed">{u.summary}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ios-secondary">ปัญหา / อุปสรรค</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ios-primary leading-relaxed">{u.issues || '-'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ios-secondary">แผนเดือนถัดไป</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ios-primary leading-relaxed">{u.next_plan || '-'}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      {showEditProject && (
        <ProjectFormModal
          project={project}
          onClose={() => setShowEditProject(false)}
          onSaved={() => {
            setShowEditProject(false);
            notifyChanged();
          }}
        />
      )}

      {showDeleteProject && (
        <DeleteProjectModal
          projectName={project.name}
          taskCount={project.total_tasks}
          onClose={() => setShowDeleteProject(false)}
          onConfirm={async (taskAction) => {
            try {
              await api.deleteProject(project.id, taskAction);
              toast.success('ลบโปรเจกต์เรียบร้อยแล้ว');
              setShowDeleteProject(false);
              notifyChanged();
              navigate('/projects');
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

      {milestoneModal && (
        <MilestoneFormModal
          projectId={project.id}
          milestone={milestoneModal.mode === 'edit' ? milestoneModal.milestone : undefined}
          nextOrder={project.milestones.length + 1}
          onClose={() => setMilestoneModal(null)}
          onSaved={() => {
            setMilestoneModal(null);
            notifyChanged();
          }}
        />
      )}

      {updateModal && (
        <ProjectUpdateModal
          projectId={project.id}
          projectName={project.name}
          existingUpdate={updateModal.existing}
          onClose={() => setUpdateModal(null)}
          onSaved={() => {
            setUpdateModal(null);
            notifyChanged();
          }}
        />
      )}
    </div>
  );
}

function DeleteProjectModal({
  projectName,
  taskCount,
  onClose,
  onConfirm,
}: {
  projectName: string;
  taskCount: number;
  onClose: () => void;
  onConfirm: (taskAction: ProjectTaskDeleteAction) => Promise<void>;
}) {
  const [taskAction, setTaskAction] = useState<ProjectTaskDeleteAction>('unlink');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(taskAction);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="ยืนยันการลบโปรเจกต์"
      size="md"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" className="btn-danger" onClick={handleConfirm} disabled={busy}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {busy ? 'กำลังลบ…' : 'ยืนยันลบโปรเจกต์'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <p className="text-ios-primary text-sm">
          คุณต้องการลบโปรเจกต์ <strong className="font-bold">"{projectName}"</strong> ใช่หรือไม่? (รวมถึง Milestone และบันทึกประจำเดือน)
        </p>

        <div className="rounded-ios-card border border-ios-separator/20 bg-ios-bg p-3.5 space-y-3">
          <p className="font-semibold text-ios-primary">
            เลือกวิธีจัดการกับงานรายวันที่ผูกอยู่ ({taskCount} งาน):
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="project-delete-action"
              className="mt-0.5 accent-accent"
              checked={taskAction === 'unlink'}
              onChange={() => setTaskAction('unlink')}
            />
            <span>
              <strong className="block text-ios-primary font-semibold">ปลดงานออกจากโปรเจกต์ แต่เก็บงานไว้ (แนะนำ)</strong>
              <span className="block text-ios-secondary mt-0.5">
                งานทั้งหมด {taskCount} งานจะยังคงอยู่ในระบบและรายงานรายเดือน แต่จะไม่ผูกกับโปรเจกต์นี้
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="project-delete-action"
              className="mt-0.5 accent-red-500"
              checked={taskAction === 'delete'}
              onChange={() => setTaskAction('delete')}
            />
            <span>
              <strong className="block text-status-overdue font-semibold">ลบงานที่ผูกอยู่ด้วยทั้งหมด</strong>
              <span className="block text-ios-secondary mt-0.5">
                ลบโปรเจกต์พร้อมงานย่อย {taskCount} งานออกจากระบบอย่างถาวร
              </span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

function MilestoneFormModal({
  projectId,
  milestone,
  nextOrder,
  onClose,
  onSaved,
}: {
  projectId: number;
  milestone?: MilestoneWithStats;
  nextOrder: number;
  onClose: () => void;
  onSaved: (m: MilestoneWithStats) => void;
}) {
  const toast = useToast();
  const isEdit = !!milestone;
  const [v, setV] = useState<MilestoneInput>({
    title: milestone?.title ?? '',
    description: milestone?.description ?? '',
    due_date: milestone?.due_date ?? '',
    status: milestone?.status ?? 'todo',
    sort_order: milestone?.sort_order ?? nextOrder,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = milestoneInputSchema.safeParse(v);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const saved = isEdit ? await api.updateMilestone(milestone.id, v) : await api.createMilestone(projectId, v);
      toast.success(isEdit ? 'แก้ไข Milestone เรียบร้อยแล้ว' : 'เพิ่ม Milestone เรียบร้อยแล้ว');
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
      title={isEdit ? 'แก้ไข Milestone' : 'เพิ่ม Milestone ใหม่'}
      size="md"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </button>
          <button type="submit" form="milestone-form" className="btn-primary" disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      }
    >
      <form id="milestone-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="ms-title">
            ชื่อ Milestone <span className="text-red-500">*</span>
          </label>
          <input
            id="ms-title"
            className={`ios-input w-full ${errors.title ? 'border-red-500' : ''}`}
            value={v.title}
            onChange={(e) => {
              setV((p) => ({ ...p, title: e.target.value }));
              if (errors.title) setErrors((p) => ({ ...p, title: '' }));
            }}
            placeholder="เช่น เฟส 1: สำรวจความต้องการและออกแบบระบบ"
            autoFocus
            maxLength={200}
          />
          {errors.title && <p className="mt-1 text-xs font-medium text-red-500">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="ms-desc">
            รายละเอียด <span className="font-normal opacity-70">(ไม่บังคับ)</span>
          </label>
          <textarea
            id="ms-desc"
            className="ios-input min-h-[70px] w-full resize-none"
            value={(v.description as string) ?? ''}
            onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))}
            placeholder="สิ่งที่ต้องส่งมอบในระยะนี้"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="ms-due">
              วันครบกำหนด
            </label>
            <input
              id="ms-due"
              type="date"
              className="ios-input w-full text-xs"
              value={(v.due_date as string) ?? ''}
              onChange={(e) => setV((p) => ({ ...p, due_date: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="ms-status">
              สถานะ
            </label>
            <select
              id="ms-status"
              className="ios-input w-full text-xs"
              value={v.status}
              onChange={(e) => setV((p) => ({ ...p, status: e.target.value as TaskStatus }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="ms-order">
              ลำดับที่
            </label>
            <input
              id="ms-order"
              type="number"
              className="ios-input w-full text-xs"
              value={v.sort_order}
              onChange={(e) => setV((p) => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
