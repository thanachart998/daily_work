import { dayjs, todayStr } from '@shared/dates';
import type { MilestoneWithStats, ProjectDetail } from '@shared/schemas';
import { ArrowLeft, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, FolderKanban, GanttChart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar, ProjectStatusBadge, StatusBadge } from '../components/Badges';
import EmptyState from '../components/EmptyState';
import { ErrorBox, Loading, PageHeader, SegmentedControl } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useLoad } from '../hooks/useLoad';
import { api } from '../lib/api';
import { formatDateShort, formatMonth } from '../lib/format';

type ZoomMode = 'month' | 'quarter';

export default function TimelinePage() {
  const { yearFormat } = useApp();
  const today = todayStr();
  const [zoom, setZoom] = useState<ZoomMode>('quarter');
  const [anchorMonth, setAnchorMonth] = useState(() => dayjs(today).subtract(1, 'month').format('YYYY-MM'));

  // โหลดรายละเอียดโปรเจกต์ทั้งหมดพร้อม Milestone
  const { data: projectDetails, error, loading } = useLoad(async () => {
    const list = await api.listProjects();
    return Promise.all(list.map((p) => api.getProject(p.id)));
  }, []);

  const monthCount = zoom === 'month' ? 3 : 6;

  const months = useMemo(() => {
    const start = dayjs(`${anchorMonth}-01`);
    return Array.from({ length: monthCount }, (_, i) => {
      const m = start.add(i, 'month');
      return {
        ym: m.format('YYYY-MM'),
        start: m.startOf('month').format('YYYY-MM-DD'),
        end: m.endOf('month').format('YYYY-MM-DD'),
        days: m.daysInMonth(),
      };
    });
  }, [anchorMonth, monthCount]);

  const rangeStart = months[0].start;
  const rangeEnd = months[months.length - 1].end;
  const totalDays = Math.max(1, dayjs(rangeEnd).diff(dayjs(rangeStart), 'day') + 1);

  const dateToPct = (dateStr: string): number => {
    const diff = dayjs(dateStr).diff(dayjs(rangeStart), 'day');
    return Math.max(0, Math.min(100, (diff / totalDays) * 100));
  };

  const todayInRange = today >= rangeStart && today <= rangeEnd;
  const todayPct = todayInRange ? dateToPct(today) : null;

  const shiftWindow = (deltaMonths: number) => {
    setAnchorMonth(dayjs(`${anchorMonth}-01`).add(deltaMonths, 'month').format('YYYY-MM'));
  };

  const resetToday = () => {
    setAnchorMonth(dayjs(today).subtract(1, 'month').format('YYYY-MM'));
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="เส้นเวลาโปรเจกต์ (Timeline)"
        subtitle="ภาพรวมระยะเวลาของโปรเจกต์และ Milestone ข้ามเดือน พร้อมเส้นบอกตำแหน่งวันนี้"
        actions={
          <Link to="/projects" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> กลับไปหน้าโปรเจกต์
          </Link>
        }
      />

      {/* ควบคุมช่วงเวลาและการย่อ/ขยาย */}
      <div className="ios-card flex flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex items-center gap-1.5">
          <button
            className="btn-secondary h-8 w-8 p-0 inline-flex items-center justify-center rounded-full"
            onClick={() => shiftWindow(zoom === 'month' ? -1 : -3)}
            aria-label="ช่วงก่อนหน้า"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="btn-secondary btn-sm" onClick={resetToday}>
            วันนี้
          </button>
          <button
            className="btn-secondary h-8 w-8 p-0 inline-flex items-center justify-center rounded-full"
            onClick={() => shiftWindow(zoom === 'month' ? 1 : 3)}
            aria-label="ช่วงถัดไป"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs font-bold text-ios-primary">
            {formatMonth(months[0].ym, yearFormat)} – {formatMonth(months[months.length - 1].ym, yearFormat)}
          </span>
        </div>

        <div className="w-56">
          <SegmentedControl
            value={zoom}
            onChange={(val) => setZoom(val as ZoomMode)}
            options={[
              { value: 'month', label: '3 เดือน' },
              { value: 'quarter', label: '6 เดือน' },
            ]}
          />
        </div>
      </div>

      {loading && !projectDetails ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : !projectDetails || projectDetails.length === 0 ? (
        <EmptyState
          icon={GanttChart}
          title="ยังไม่มีโปรเจกต์เพื่อแสดงบนเส้นเวลา"
          description="สร้างโปรเจกต์และกำหนดวันเริ่ม–วันสิ้นสุดเพื่อดูแถบเส้นเวลาข้ามเดือน"
          action={
            <Link to="/projects" className="btn-primary">
              <FolderKanban className="h-4 w-4" aria-hidden /> ไปหน้าโปรเจกต์
            </Link>
          }
        />
      ) : (
        <div className="ios-card overflow-x-auto p-4">
          <div className="min-w-[760px]">
            {/* Month Header */}
            <div className="grid grid-cols-12 border-b border-ios-separator/20 pb-2 text-xs font-bold text-ios-secondary">
              <div className="col-span-4 pr-3">โปรเจกต์ / Milestone</div>
              <div className="col-span-8 relative">
                <div className="grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
                  {months.map((m) => (
                    <div key={m.ym} className="border-l border-ios-separator/20 px-2 py-1 text-center">
                      {formatMonth(m.ym, yearFormat)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Project Rows */}
            <div className="divide-y divide-ios-separator/20">
              {projectDetails.map((p: ProjectDetail) => {
                const startStr = p.start_date;
                const endStr = p.target_end_date ?? p.actual_end_date ?? rangeEnd;
                const barLeft = dateToPct(startStr < rangeStart ? rangeStart : startStr);
                const barRight = dateToPct(endStr > rangeEnd ? rangeEnd : endStr);
                const barWidth = Math.max(2, barRight - barLeft);
                const outOfView = endStr < rangeStart || startStr > rangeEnd;

                return (
                  <div key={p.id} className="py-4">
                    <div className="grid grid-cols-12 items-center gap-2">
                      <div className="col-span-4 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                          <Link to={`/projects/${p.id}`} className="font-bold text-xs text-ios-primary hover:text-accent truncate">
                            {p.name}
                          </Link>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ios-secondary">
                          <ProjectStatusBadge status={p.status} />
                          <span className="inline-flex items-center gap-1">
                            <CalendarRange className="h-3 w-3 opacity-60" aria-hidden />
                            {formatDateShort(p.start_date, yearFormat)} – {p.target_end_date ? formatDateShort(p.target_end_date, yearFormat) : 'ไม่ระบุ'}
                          </span>
                        </div>
                        <div className="mt-1.5 max-w-[200px]">
                          <ProgressBar value={p.progress} color={p.color} size="sm" />
                        </div>
                      </div>

                      <div className="col-span-8 relative h-10 rounded-ios-control bg-ios-bg border border-ios-separator/20 overflow-hidden">
                        {/* Month Dividers */}
                        <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
                          {months.map((m) => (
                            <div key={m.ym} className="border-l border-ios-separator/20" />
                          ))}
                        </div>

                        {/* Today Indicator */}
                        {todayPct !== null && (
                          <div
                            className="absolute inset-y-0 z-20 border-l-2 border-red-500 pointer-events-none"
                            style={{ left: `${todayPct}%` }}
                            title={`วันนี้ (${formatDateShort(today, yearFormat)})`}
                          >
                            <span className="rounded-b bg-red-500 px-1 py-0.5 text-[9px] font-bold text-white shadow-sm">วันนี้</span>
                          </div>
                        )}

                        {/* Project Bar */}
                        {!outOfView ? (
                          <div
                            className="absolute top-2 h-6 rounded-md shadow-sm flex items-center px-2 text-[10px] font-bold text-white overflow-hidden whitespace-nowrap transition-transform hover:scale-[1.01]"
                            style={{
                              left: `${barLeft}%`,
                              width: `${barWidth}%`,
                              backgroundColor: p.color,
                            }}
                            title={`${p.name} (${p.progress}%)`}
                          >
                            {p.progress}% · {p.name}
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-ios-secondary opacity-60">
                            อยู่นอกช่วงเดือนที่เลือก
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Milestones */}
                    {p.milestones.length > 0 && (
                      <div className="mt-2 space-y-1.5 pl-4">
                        {p.milestones.map((m: MilestoneWithStats, idx: number) => {
                          const prevDue = idx > 0 ? p.milestones[idx - 1].due_date : p.start_date;
                          const msStart = prevDue || p.start_date;
                          const msEnd = m.due_date || p.target_end_date || msStart;
                          const msOut = msEnd < rangeStart || msStart > rangeEnd;
                          const msLeft = dateToPct(msStart < rangeStart ? rangeStart : msStart);
                          const msRight = dateToPct(msEnd > rangeEnd ? rangeEnd : msEnd);
                          const msWidth = Math.max(2, msRight - msLeft);

                          return (
                            <div key={m.id} className="grid grid-cols-12 items-center gap-2 text-xs">
                              <div className="col-span-4 flex items-center justify-between gap-2 pr-3 text-ios-secondary">
                                <span className="truncate text-xs">
                                  ↳ {m.title} ({m.progress}%)
                                </span>
                                <StatusBadge status={m.status} />
                              </div>
                              <div className="col-span-8 relative h-6 rounded bg-ios-bg/60 overflow-hidden">
                                <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
                                  {months.map((mm) => (
                                    <div key={mm.ym} className="border-l border-ios-separator/10" />
                                  ))}
                                </div>
                                {todayPct !== null && (
                                  <div
                                    className="absolute inset-y-0 z-10 border-l border-dashed border-red-500/50 pointer-events-none"
                                    style={{ left: `${todayPct}%` }}
                                  />
                                )}
                                {!msOut && (
                                  <div
                                    className={`absolute top-1 h-4 rounded px-1.5 text-[9px] font-semibold flex items-center gap-1 whitespace-nowrap overflow-hidden ${
                                      m.status === 'done'
                                        ? 'bg-status-done text-white'
                                        : m.status === 'doing'
                                          ? 'bg-accent text-white'
                                          : 'bg-ios-separator text-ios-primary'
                                    }`}
                                    style={{ left: `${msLeft}%`, width: `${msWidth}%` }}
                                    title={`${m.title} — กำหนด ${m.due_date ? formatDateShort(m.due_date, yearFormat) : '-'}`}
                                  >
                                    {m.status === 'done' && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                                    {m.title}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

