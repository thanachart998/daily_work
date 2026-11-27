import type { MonthlyProjectReport, MonthlyReport, ProjectUpdate, Task } from '@shared/schemas';
import { todayStr } from '@shared/dates';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CircleDashed,
  ClipboardCopy,
  FileEdit,
  FolderKanban,
  ListTodo,
  Milestone as MilestoneIcon,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProgressBar, ProjectStatusBadge, StatusBadge } from '../components/Badges';
import EmptyState from '../components/EmptyState';
import ProjectUpdateModal from '../components/ProjectUpdateModal';
import { EvidenceLink } from '../components/TaskDetailModal';
import { ErrorBox, Loading, PageHeader, StatCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useLoad } from '../hooks/useLoad';
import { api } from '../lib/api';
import { formatDateShort, formatDateTime, formatMonth, THAI_MONTHS, yearLabel, type YearFormat } from '../lib/format';
import { buildReportText } from '../lib/reportText';
import ReportActions from './ReportActions';

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}

/** หน้ารายงานผลงานรายเดือน */
export default function ReportPage() {
  const { yearFormat, notifyChanged } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : todayStr().slice(0, 7);
  const [y, m] = month.split('-').map(Number);

  const { data: report, error, loading } = useLoad(() => api.monthlyReport(month), [month]);
  const text = useMemo(() => (report ? buildReportText(report, yearFormat) : ''), [report, yearFormat]);
  const [showText, setShowText] = useState(true);
  const [editingUpdate, setEditingUpdate] = useState<{
    projectId: number;
    projectName: string;
    existing: ProjectUpdate | null;
  } | null>(null);

  const setMonth = (yy: number, mm: number) => setParams({ month: `${yy}-${String(mm).padStart(2, '0')}` }, { replace: true });

  const currentYear = Number(todayStr().slice(0, 4));
  const years = Array.from({ length: 8 }, (_, i) => currentYear + 1 - i);
  if (!years.includes(y)) years.push(y);

  const copy = async () => {
    try {
      await copyText(text);
      toast.success('คัดลอกข้อความสรุปแล้ว นำไปวางในเอกสารได้เลย');
    } catch {
      toast.error('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วกด Ctrl+C');
    }
  };

  const isEmptyReport =
    report &&
    report.summary.planned === 0 &&
    report.summary.completedInMonth === 0 &&
    (!report.projectReports || report.projectReports.length === 0);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="รายงานผลงานรายเดือน"
        subtitle={formatMonth(month, yearFormat)}
        actions={report && <ReportActions report={report} />}
      />

      {/* Date Selector */}
      <div className="no-print ios-card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="r-month">
            เดือน
          </label>
          <select id="r-month" className="ios-input" value={m} onChange={(e) => setMonth(y, Number(e.target.value))}>
            {THAI_MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-ios-secondary mb-1.5" htmlFor="r-year">
            ปี
          </label>
          <select id="r-year" className="ios-input" value={y} onChange={(e) => setMonth(Number(e.target.value), m)}>
            {years
              .sort((a, b) => b - a)
              .map((yy) => (
                <option key={yy} value={yy}>
                  {yearLabel(yy, yearFormat)}
                </option>
              ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setMonth(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1)}>
            ‹ ก่อนหน้า
          </button>
          <button className="btn-secondary" onClick={() => setMonth(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)}>
            ถัดไป ›
          </button>
        </div>
      </div>

      {/* หัวรายงานสำหรับการพิมพ์ */}
      <div className="print-only mb-4">
        <h1 className="text-xl font-bold">รายงานผลงานประจำเดือน {formatMonth(month, yearFormat)}</h1>
        {report && <p className="text-xs text-slate-600">จัดทำเมื่อ {formatDateTime(report.generatedAt, yearFormat)}</p>}
      </div>

      {loading && !report ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : report ? (
        isEmptyReport ? (
          <EmptyState icon={BarChart3} title="ยังไม่มีข้อมูลงานในเดือนนี้" description="เลือกเดือนอื่น หรือเพิ่มงานที่มีวันที่ทำงานอยู่ในเดือนนี้" />
        ) : (
          <ReportBody
            report={report}
            yearFormat={yearFormat}
            text={text}
            showText={showText}
            setShowText={setShowText}
            onCopy={copy}
            onEditProjectUpdate={(projectId, projectName, existing) => setEditingUpdate({ projectId, projectName, existing })}
          />
        )
      ) : null}

      {editingUpdate && (
        <ProjectUpdateModal
          projectId={editingUpdate.projectId}
          projectName={editingUpdate.projectName}
          initialPeriod={month}
          existingUpdate={editingUpdate.existing}
          lockPeriod={true}
          onClose={() => setEditingUpdate(null)}
          onSaved={() => {
            setEditingUpdate(null);
            notifyChanged();
          }}
        />
      )}
    </div>
  );
}

function ReportBody({
  report,
  yearFormat,
  text,
  showText,
  setShowText,
  onCopy,
  onEditProjectUpdate,
}: {
  report: MonthlyReport;
  yearFormat: YearFormat;
  text: string;
  showText: boolean;
  setShowText: (v: boolean) => void;
  onCopy: () => void;
  onEditProjectUpdate: (projectId: number, projectName: string, existing: ProjectUpdate | null) => void;
}) {
  const s = report.summary;
  const projectReports = report.projectReports ?? [];
  const generalCompleted = report.generalCompleted ?? report.completed.filter((t) => !t.project_id);

  return (
    <div className="space-y-6">
      {/* 6 Stat Widgets */}
      <section aria-label="สรุปตัวเลข" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="งานที่วางแผน" value={s.planned} icon={<ListTodo className="h-4 w-4" aria-hidden />} hint="ในเดือนนี้" />
        <StatCard label="ผลงานที่เสร็จ" value={s.completedInMonth} tone="emerald" icon={<CheckCircle2 className="h-4 w-4 text-status-done" aria-hidden />} hint="เสร็จในเดือนนี้" />
        <StatCard label="แผนที่เสร็จแล้ว" value={s.plannedDone} tone="emerald" icon={<CheckCircle2 className="h-4 w-4 text-status-done" aria-hidden />} hint="ตามแผน" />
        <StatCard label="ยังไม่เสร็จ" value={s.pending} tone="amber" icon={<CircleDashed className="h-4 w-4 text-status-warning" aria-hidden />} hint="ค้างอยู่" />
        <StatCard label="เลยกำหนด" value={s.overdue} tone={s.overdue ? 'red' : 'slate'} icon={<AlertCircle className={`h-4 w-4 ${s.overdue ? 'text-status-overdue' : 'text-ios-secondary'}`} aria-hidden />} hint="ต้องตามงาน" />
        <StatCard label="อัตราความสำเร็จ" value={`${s.successRate}%`} tone="accent" icon={<Target className="h-4 w-4 text-accent" aria-hidden />} hint={`${s.plannedDone}/${s.planned}`} />
      </section>

      {/* Long-term projects section */}
      <section className="ios-card print-avoid-break overflow-hidden" aria-labelledby="proj-report-h">
        <div className="border-b border-ios-separator/20 bg-accent/5 px-4 py-3">
          <h2 id="proj-report-h" className="flex items-center gap-2 font-bold text-sm text-ios-primary">
            <FolderKanban className="h-4 w-4 text-accent" aria-hidden />
            ความคืบหน้าโปรเจกต์ระยะยาว ({projectReports.length} โปรเจกต์)
          </h2>
          <p className="mt-0.5 text-xs text-ios-secondary">
            ความคืบหน้าสะสมของโปรเจกต์ที่ดำเนินงานในเดือนนี้ พร้อมงานย่อยและ Milestone
          </p>
        </div>

        {projectReports.length === 0 ? (
          <p className="px-4 py-4 text-xs text-ios-secondary">ไม่มีโปรเจกต์ระยะยาวที่ดำเนินการอยู่ในเดือนนี้</p>
        ) : (
          <div className="divide-y divide-ios-separator/20">
            {projectReports.map((pr: MonthlyProjectReport) => {
              const deltaSign = pr.progressDelta > 0 ? `+${pr.progressDelta}%` : `${pr.progressDelta}%`;
              return (
                <div key={pr.project.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pr.project.color }} />
                        <Link to={`/projects/${pr.project.id}`} className="text-sm font-bold text-ios-primary hover:text-accent">
                          {pr.project.name}
                        </Link>
                        <ProjectStatusBadge status={pr.project.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-ios-secondary">
                        ช่วงเวลา: {formatDateShort(pr.project.start_date, yearFormat)}
                        {pr.project.target_end_date ? ` – ${formatDateShort(pr.project.target_end_date, yearFormat)}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-ios-primary">
                          <span>สิ้นเดือน: {pr.progressAtEndOfMonth}%</span>
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              pr.progressDelta > 0
                                ? 'bg-status-done/15 text-status-done'
                                : pr.progressDelta < 0
                                  ? 'bg-status-overdue/15 text-status-overdue'
                                  : 'bg-ios-separator/30 text-ios-secondary'
                            }`}
                          >
                            <TrendingUp className="h-3 w-3" aria-hidden />
                            {deltaSign}
                          </span>
                        </div>
                        <div className="mt-1 w-44 max-w-full ml-auto">
                          <ProgressBar value={pr.progressAtEndOfMonth} color={pr.project.color} showLabel={false} />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onEditProjectUpdate(pr.project.id, pr.project.name, pr.update)}
                        className="no-print btn-secondary btn-sm"
                      >
                        <FileEdit className="h-3.5 w-3.5" aria-hidden />
                        {pr.update ? 'แก้ไขอัปเดต' : 'เขียนอัปเดต'}
                      </button>
                    </div>
                  </div>

                  {/* Monthly update text */}
                  {pr.update ? (
                    <div className="grid grid-cols-1 gap-2.5 rounded-ios-control border border-ios-separator/20 bg-ios-bg p-3 text-xs sm:grid-cols-3">
                      <div>
                        <p className="font-semibold text-ios-secondary">สรุปสิ่งที่ทำในเดือนนี้</p>
                        <p className="mt-1 whitespace-pre-wrap text-ios-primary leading-relaxed">{pr.update.summary}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-ios-secondary">ปัญหา / อุปสรรค</p>
                        <p className="mt-1 whitespace-pre-wrap text-ios-primary leading-relaxed">{pr.update.issues || '-'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-ios-secondary">แผนเดือนถัดไป</p>
                        <p className="mt-1 whitespace-pre-wrap text-ios-primary leading-relaxed">{pr.update.next_plan || '-'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-ios-control border border-dashed border-ios-separator/60 p-2.5 text-xs text-ios-secondary">
                      <span>ยังไม่มีข้อความสรุปความคืบหน้าประจำเดือนสำหรับโปรเจกต์นี้</span>
                      <button
                        type="button"
                        onClick={() => onEditProjectUpdate(pr.project.id, pr.project.name, null)}
                        className="font-semibold text-accent hover:underline"
                      >
                        + เขียนสรุปเดือนนี้
                      </button>
                    </div>
                  )}

                  {/* Completed Milestones */}
                  {pr.completedMilestones.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold text-status-done">
                        <MilestoneIcon className="h-3.5 w-3.5" aria-hidden />
                        Milestone ที่สำเร็จในเดือนนี้:
                      </span>
                      {pr.completedMilestones.map((m) => (
                        <span key={m.id} className="rounded-full bg-status-done/15 px-2.5 py-0.5 font-medium text-status-done">
                          ✓ {m.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Completed Tasks in project */}
                  <div>
                    <p className="text-xs font-semibold text-ios-secondary mb-1.5">
                      งานย่อยที่ทำเสร็จในเดือนนี้ ({pr.completedTasks.length} งาน):
                    </p>
                    {pr.completedTasks.length === 0 ? (
                      <p className="text-xs text-ios-secondary opacity-70">ไม่มีงานย่อยที่ทำเสร็จในเดือนนี้</p>
                    ) : (
                      <ul className="space-y-1 text-xs text-ios-primary">
                        {pr.completedTasks.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-ios-control bg-ios-bg px-2.5 py-1.5">
                            <span className="font-medium">
                              ✓ {t.title}
                              {t.milestone_title && <span className="ml-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">{t.milestone_title}</span>}
                              {t.result_note && <span className="ml-2 text-ios-secondary">— {t.result_note}</span>}
                            </span>
                            <span className="text-ios-secondary text-[11px] tabular-nums">{formatDateTime(t.completed_at, yearFormat)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Category Breakdown Table */}
      <section className="ios-card print-avoid-break overflow-hidden" aria-labelledby="cat-h">
        <h2 id="cat-h" className="border-b border-ios-separator/20 px-4 py-3 font-bold text-sm text-ios-primary">
          สรุปตามหมวดหมู่
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-ios-bg text-left text-ios-secondary font-semibold">
              <tr>
                <th className="px-4 py-2.5">หมวดหมู่</th>
                <th className="px-4 py-2.5 text-right">วางแผน</th>
                <th className="px-4 py-2.5 text-right">วางแผนและเสร็จ</th>
                <th className="px-4 py-2.5 text-right">ยังไม่เสร็จ</th>
                <th className="px-4 py-2.5 text-right font-bold text-status-done">ผลงานที่เสร็จในเดือน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ios-separator/20 tabular-nums">
              {report.byCategory.map((c) => (
                <tr key={c.category} className="hover:bg-ios-bg/40">
                  <td className="px-4 py-2.5 font-medium text-ios-primary">{c.category}</td>
                  <td className="px-4 py-2.5 text-right text-ios-secondary">{c.planned}</td>
                  <td className="px-4 py-2.5 text-right text-ios-secondary">{c.plannedDone}</td>
                  <td className="px-4 py-2.5 text-right text-ios-secondary">{c.pending}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-status-done">{c.completedInMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TaskTable
        title={`งานทั่วไปที่ทำเสร็จในเดือนนี้ (${generalCompleted.length})`}
        tone="emerald"
        tasks={generalCompleted}
        yearFormat={yearFormat}
        empty="ไม่มีงานทั่วไปที่ทำเสร็จในเดือนนี้"
        note="เฉพาะงานทั่วไปที่ไม่ได้ผูกกับโปรเจกต์ระยะยาว"
      />

      <TaskTable
        title={`ผลงานที่ทำเสร็จทั้งหมดในเดือนนี้ — รวมงานโปรเจกต์และงานทั่วไป (${report.completed.length})`}
        tone="emerald"
        tasks={report.completed}
        yearFormat={yearFormat}
        empty="ยังไม่มีงานที่ทำเสร็จในเดือนนี้"
        note="นับจากวันเวลาที่ทำเสร็จจริงในเดือนนี้"
      />

      <TaskTable
        title={`งานค้าง / ยังไม่เสร็จ (${report.pending.length})`}
        tone="amber"
        tasks={report.pending}
        yearFormat={yearFormat}
        empty="ไม่มีงานค้างในเดือนนี้ 🎉"
        today={report.today}
        note="งานที่วางแผนในเดือนนี้แต่ยังไม่เสร็จ"
      />

      {report.plannedDoneElsewhere.length > 0 && (
        <TaskTable
          title={`งานของเดือนนี้ที่ทำเสร็จในเดือนอื่น (${report.plannedDoneElsewhere.length})`}
          tone="slate"
          tasks={report.plannedDoneElsewhere}
          yearFormat={yearFormat}
          empty=""
          note="นับเป็นผลงานของเดือนที่ทำเสร็จจริง"
        />
      )}

      {/* Text Summary */}
      <section className="ios-card print-avoid-break p-4 space-y-3" aria-labelledby="text-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="text-h" className="font-bold text-sm text-ios-primary">
            สรุปผลงานเป็นข้อความ
          </h2>
          <div className="no-print flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setShowText(!showText)}>
              {showText ? 'ซ่อน' : 'แสดง'}
            </button>
            <button className="btn-primary btn-sm" onClick={onCopy}>
              <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> คัดลอกข้อความ
            </button>
          </div>
        </div>
        {showText && (
          <pre className="whitespace-pre-wrap rounded-ios-control bg-ios-bg p-4 font-sans text-xs leading-relaxed text-ios-primary border border-ios-separator/20">
            {text}
          </pre>
        )}
      </section>
    </div>
  );
}

function TaskTable({
  title,
  tone,
  tasks,
  yearFormat,
  empty,
  note,
  today,
}: {
  title: string;
  tone: 'emerald' | 'amber' | 'slate';
  tasks: Task[];
  yearFormat: YearFormat;
  empty: string;
  note?: string;
  today?: string;
}) {
  return (
    <section className="ios-card print-avoid-break overflow-hidden">
      <div className="border-b border-ios-separator/20 bg-ios-bg/60 px-4 py-3">
        <h2 className="font-bold text-sm text-ios-primary">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-ios-secondary">{note}</p>}
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-4 text-xs text-ios-secondary">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-ios-bg text-left text-ios-secondary font-semibold">
              <tr>
                <th className="w-8 px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">ชื่องาน</th>
                <th className="px-3 py-2.5">โปรเจกต์ / หมวดหมู่</th>
                <th className="whitespace-nowrap px-3 py-2.5">วันที่ทำงาน</th>
                <th className="whitespace-nowrap px-3 py-2.5">{today ? 'สถานะ / กำหนดส่ง' : 'วันที่เสร็จ'}</th>
                <th className="px-3 py-2.5">ผลลัพธ์</th>
                <th className="px-3 py-2.5">หลักฐาน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ios-separator/20 align-top">
              {tasks.map((t, i) => (
                <tr key={t.id} className="hover:bg-ios-bg/40">
                  <td className="px-3 py-2.5 text-ios-secondary tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-ios-primary">{t.title}</td>
                  <td className="px-3 py-2.5">
                    {t.project_name ? (
                      <div>
                        <span className="font-semibold text-accent">{t.project_name}</span>
                        {t.milestone_title && <span className="block text-[11px] text-ios-secondary">{t.milestone_title}</span>}
                      </div>
                    ) : (
                      <span className="text-ios-secondary">{t.category || '-'}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-ios-secondary tabular-nums">
                    {formatDateShort(t.work_date, yearFormat)}
                    {t.work_end_date && t.work_end_date > t.work_date ? ` – ${formatDateShort(t.work_end_date, yearFormat)}` : ''}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {today ? (
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={t.status} />
                        {t.due_date && (
                          <span className={`text-[11px] tabular-nums ${t.due_date < today ? 'font-semibold text-status-overdue' : 'text-ios-secondary'}`}>
                            {t.due_date < today ? 'เลยกำหนด ' : 'ส่ง '}
                            {formatDateShort(t.due_date, yearFormat)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ios-secondary tabular-nums">{formatDateTime(t.completed_at, yearFormat)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-pre-wrap text-ios-primary">{t.result_note || '-'}</td>
                  <td className="max-w-[220px] px-3 py-2.5 text-xs">
                    <EvidenceLink value={t.evidence_link} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
