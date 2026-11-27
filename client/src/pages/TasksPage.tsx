import { DELETE_CONFIRM_PASSWORD, STATUSES, STATUS_LABEL, type Task, type TaskFilter, type TaskStatus } from '@shared/schemas';
import { AlertCircle, CalendarClock, Eye, EyeOff, FilterX, KeyRound, ListTodo, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import TaskItem from '../components/TaskItem';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useLoad } from '../hooks/useLoad';
import { api } from '../lib/api';

const FILTER_KEYS = ['date', 'from', 'to', 'status', 'category', 'project_id', 'q', 'pending'] as const;

/** หน้ารายการงาน: กรองตามวันที่/สถานะ/หมวดหมู่/โปรเจกต์ ค้นหา เลือกหลายงานเพื่อเลื่อนวันหรือลบพร้อมรหัสผ่านยืนยัน */
export default function TasksPage() {
  const { categories, projects, openNewTask, notifyChanged } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const filter = useMemo(() => {
    const f: Record<string, string> = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f as TaskFilter;
  }, [params]);

  const { data: tasks, error, loading } = useLoad(() => api.listTasks(filter), [JSON.stringify(filter)]);

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') !== qInput.trim()) updateParam('q', qInput.trim());
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  useEffect(() => setSelected(new Set()), [tasks]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'date' && value) {
      next.delete('from');
      next.delete('to');
    }
    if ((key === 'from' || key === 'to') && value) next.delete('date');
    setParams(next, { replace: true });
  }

  const clearFilters = () => {
    setQInput('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const hasFilter = Object.keys(filter).length > 0;
  const allTasks = tasks ?? [];
  const allSelected = allTasks.length > 0 && allTasks.every((t) => selected.has(t.id));
  const selectedTasks = useMemo(() => allTasks.filter((t) => selected.has(t.id)), [allTasks, selected]);

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allTasks.map((t) => t.id)));

  const bulkPostpone = async () => {
    try {
      const r = await api.postpone([...selected]);
      toast.success(`เลื่อนงาน ${r.updated.length} งานไปวันถัดไปแล้ว${r.skipped.length ? ` (ข้ามงานที่เสร็จแล้ว ${r.skipped.length} งาน)` : ''}`);
      setSelected(new Set());
      notifyChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const statusValue = filter.pending ? 'pending' : (filter.status ?? '');
  const setStatusFilter = (v: string) => {
    const next = new URLSearchParams(params);
    next.delete('status');
    next.delete('pending');
    if (v === 'pending') next.set('pending', '1');
    else if (v) next.set('status', v);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="งานทั้งหมด"
        subtitle={tasks ? `พบ ${tasks.length} รายการ` : undefined}
        actions={
          <button className="btn-primary" onClick={() => openNewTask(filter.date ? { work_date: filter.date } : undefined)}>
            <Plus className="h-4 w-4" aria-hidden /> เพิ่มงาน
          </button>
        }
      />

      {/* iOS Filter Card */}
      <section className="ios-card p-4 space-y-3" aria-label="ตัวกรอง">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="q">
              ค้นหา
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ios-secondary" aria-hidden />
              <input
                id="q"
                className="ios-input pl-9 pr-8 w-full"
                placeholder="ค้นหาชื่องาน รายละเอียด..."
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
              {qInput && (
                <button
                  type="button"
                  onClick={() => setQInput('')}
                  className="absolute right-2.5 top-2.5 text-ios-secondary hover:text-ios-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="f-project">
              โปรเจกต์
            </label>
            <select
              id="f-project"
              className="ios-input w-full"
              value={filter.project_id ?? ''}
              onChange={(e) => updateParam('project_id', e.target.value)}
            >
              <option value="">ทุกโปรเจกต์และงานทั่วไป</option>
              <option value="__none__">เฉพาะงานทั่วไป (ไม่ผูกโปรเจกต์)</option>
              {projects.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="f-status">
              สถานะ
            </label>
            <select
              id="f-status"
              className="ios-input w-full"
              value={statusValue}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">ทุกสถานะ</option>
              <option value="pending">ยังไม่เสร็จ (ทั้งหมด)</option>
              {STATUSES.map((s: TaskStatus) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="f-cat">
              หมวดหมู่
            </label>
            <select
              id="f-cat"
              className="ios-input w-full"
              value={filter.category ?? ''}
              onChange={(e) => updateParam('category', e.target.value)}
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value="__none__">ไม่มีหมวดหมู่</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
            <div>
              <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="f-from">
                ตั้งแต่
              </label>
              <input
                id="f-from"
                type="date"
                className="ios-input w-full text-xs px-2"
                value={filter.from ?? ''}
                onChange={(e) => updateParam('from', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="f-to">
                ถึง
              </label>
              <input
                id="f-to"
                type="date"
                className="ios-input w-full text-xs px-2"
                value={filter.to ?? ''}
                onChange={(e) => updateParam('to', e.target.value)}
              />
            </div>
          </div>
        </div>

        {hasFilter && (
          <div className="pt-2 border-t border-ios-separator/20 flex justify-end">
            <button
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:opacity-80 transition"
              onClick={clearFilters}
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden /> ล้างตัวกรองทั้งหมด
            </button>
          </div>
        )}
      </section>

      {/* Bulk Action Toolbar */}
      {allTasks.length > 0 && (
        <div className="ios-card flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-ios-primary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded text-accent accent-accent focus:ring-accent"
              checked={allSelected}
              onChange={toggleAll}
            />
            <span>เลือกทั้งหมด ({allTasks.length})</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-ios-secondary tabular-nums">
              เลือกแล้ว <strong className="text-ios-primary">{selected.size}</strong> รายการ
            </span>
            <button
              className="btn-secondary btn-sm"
              disabled={selected.size === 0}
              onClick={bulkPostpone}
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> เลื่อนไปวันถัดไป
            </button>
            <button
              className="btn-danger btn-sm"
              disabled={selected.size === 0}
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> ลบที่เลือก {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      )}

      {loading && !tasks ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : tasks && tasks.length ? (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              selectable={true}
              selected={selected.has(t.id)}
              onSelect={(c) =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (c) n.add(t.id);
                  else n.delete(t.id);
                  return n;
                })
              }
            />
          ))}
        </ul>
      ) : hasFilter ? (
        <EmptyState
          icon={Search}
          title="ไม่พบงานที่ตรงกับเงื่อนไข"
          description="ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง"
          action={
            <button className="btn-secondary" onClick={clearFilters}>
              ล้างตัวกรอง
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={ListTodo}
          title="ยังไม่มีงาน"
          description="เริ่มบันทึกงานแรกของคุณได้เลย"
          action={
            <button className="btn-primary" onClick={() => openNewTask()}>
              <Plus className="h-4 w-4" aria-hidden /> เพิ่มงาน
            </button>
          }
        />
      )}

      {showDeleteModal && (
        <BulkDeletePasswordModal
          tasks={selectedTasks}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={(deletedCount) => {
            setShowDeleteModal(false);
            setSelected(new Set());
            toast.success(`ลบงานที่เลือกจำนวน ${deletedCount} รายการเรียบร้อยแล้ว`);
            notifyChanged();
          }}
        />
      )}
    </div>
  );
}

function BulkDeletePasswordModal({
  tasks,
  onClose,
  onDeleted,
}: {
  tasks: Task[];
  onClose: () => void;
  onDeleted: (deletedCount: number) => void;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('กรุณากรอกรหัสผ่านเพื่อยืนยันการลบข้อมูล');
      return;
    }
    if (password !== DELETE_CONFIRM_PASSWORD) {
      setError('รหัสผ่านยืนยันไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      return;
    }

    setDeleting(true);
    setError('');
    try {
      const res = await api.bulkDeleteTasks(
        tasks.map((t) => t.id),
        password,
      );
      onDeleted(res.deleted);
    } catch (err) {
      setError((err as Error).message || 'เกิดข้อผิดพลาดในการลบข้อมูล');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="ยืนยันการลบหลายรายการ"
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={deleting}>
            ยกเลิก
          </button>
          <button type="submit" form="bulk-delete-form" className="btn-danger" disabled={deleting}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {deleting ? 'กำลังลบ…' : `ลบ ${tasks.length} รายการ`}
          </button>
        </div>
      }
    >
      <form id="bulk-delete-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="flex items-start gap-3 rounded-ios-card border border-status-overdue/30 bg-red-500/10 p-3.5 text-xs text-status-overdue">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold text-sm">ต้องการลบงาน {tasks.length} รายการ?</p>
            <p className="mt-1 leading-relaxed opacity-90">การลบนี้ไม่สามารถกู้คืนได้ เพื่อความปลอดภัยกรุณากรอกรหัสผ่านยืนยัน</p>
          </div>
        </div>

        <div className="max-h-32 overflow-y-auto rounded-ios-control border border-ios-separator/20 bg-ios-bg p-3 text-xs text-ios-secondary">
          <ul className="list-inside list-disc space-y-1">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id} className="truncate text-ios-primary">
                {t.title}
              </li>
            ))}
            {tasks.length > 5 && <li className="font-medium text-ios-secondary">...และอีก {tasks.length - 5} รายการ</li>}
          </ul>
        </div>

        <div>
          <label htmlFor="confirm-delete-password" className="block text-xs font-semibold text-ios-secondary mb-1.5 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            รหัสผ่านยืนยันการลบ <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="confirm-delete-password"
              type={showPassword ? 'text' : 'password'}
              className={`ios-input w-full pr-10 ${error ? 'border-red-500' : ''}`}
              placeholder="กรอกรหัสผ่านยืนยัน..."
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              autoFocus
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-2.5 text-ios-secondary hover:text-ios-primary"
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {error && (
            <p className="mt-1 text-xs font-medium text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
