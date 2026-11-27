import type { CalendarDay } from '@shared/schemas';
import { dayjs, todayStr } from '@shared/dates';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState';
import TaskItem from '../components/TaskItem';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useLoad } from '../hooks/useLoad';
import { api } from '../lib/api';
import { formatDateFull, formatMonth, shiftMonth, WEEKDAYS_SHORT } from '../lib/format';

/** หน้าปฏิทินรายเดือน + รายการงานของวันที่เลือก แบบ iOS Calendar */
export default function CalendarPage() {
  const { yearFormat, openNewTask } = useApp();
  const today = todayStr();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);

  const cal = useLoad(() => api.calendar(month), [month]);
  const day = useLoad(() => api.listTasks({ date: selectedDate }), [selectedDate]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of cal.data ?? []) m.set(d.date, d);
    return m;
  }, [cal.data]);

  // สร้างช่องวันในตาราง (เริ่มวันอาทิตย์)
  const cells = useMemo(() => {
    const first = dayjs(`${month}-01`);
    const startPad = first.day();
    const daysInMonth = first.daysInMonth();
    const arr: (string | null)[] = Array(startPad).fill(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(first.date(i).format('YYYY-MM-DD'));
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [month]);

  const goMonth = (delta: number) => {
    const m = shiftMonth(month, delta);
    setMonth(m);
    setSelectedDate(m === today.slice(0, 7) ? today : `${m}-01`);
  };

  const goDay = (delta: number) => {
    const d = dayjs(selectedDate).add(delta, 'day').format('YYYY-MM-DD');
    setSelectedDate(d);
    if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7));
  };

  const goToday = () => {
    setMonth(today.slice(0, 7));
    setSelectedDate(today);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="ปฏิทินงาน"
        subtitle="แตะเลือกวันเพื่อดูและจัดการงานในแต่ละวัน"
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Month View Card */}
        <section className="ios-card p-5 lg:col-span-3 space-y-4" aria-label="ปฏิทินรายเดือน">
          <div className="flex items-center justify-between">
            <button
              className="btn-secondary h-8 w-8 p-0 inline-flex items-center justify-center rounded-full"
              onClick={() => goMonth(-1)}
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <h2 className="text-base font-bold text-ios-primary">{formatMonth(month, yearFormat)}</h2>
              <button
                className="text-xs font-semibold text-accent hover:opacity-80 transition mt-0.5"
                onClick={goToday}
              >
                วันนี้
              </button>
            </div>
            <button
              className="btn-secondary h-8 w-8 p-0 inline-flex items-center justify-center rounded-full"
              onClick={() => goMonth(1)}
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {cal.error && <ErrorBox message={cal.error} />}

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ios-secondary">
            {WEEKDAYS_SHORT.map((w, i) => (
              <div key={w} className={`py-1 ${i === 0 ? 'text-red-500' : ''}`}>
                {w}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1.5" role="grid">
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="min-h-[60px] sm:min-h-[72px]" />;
              const info = byDate.get(date);
              const isSel = date === selectedDate;
              const isToday = date === today;
              const pending = info ? info.total - info.done : 0;
              const allDone = info && info.total > 0 && info.done === info.total;
              const label = `${formatDateFull(date, yearFormat)}${info ? ` มี ${info.total} งาน เสร็จ ${info.done} ค้าง ${pending}` : ' ไม่มีงาน'}`;

              return (
                <button
                  key={date}
                  role="gridcell"
                  aria-selected={isSel}
                  aria-label={label}
                  onClick={() => setSelectedDate(date)}
                  className={`group relative flex min-h-[64px] flex-col items-center justify-between rounded-ios-control p-1.5 transition sm:min-h-[76px] ${
                    isSel
                      ? 'border-2 border-accent bg-accent/10 shadow-sm'
                      : 'border border-ios-separator/20 bg-ios-bg hover:border-accent/40 hover:bg-ios-elevated'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition ${
                      isToday
                        ? 'bg-accent text-white font-bold'
                        : isSel
                        ? 'text-accent font-bold'
                        : 'text-ios-primary'
                    }`}
                  >
                    {Number(date.slice(8))}
                  </span>

                  {info && info.total > 0 && (
                    <div className="w-full flex flex-col items-center gap-0.5 mt-1 text-[10px] tabular-nums">
                      <div className="flex items-center gap-1">
                        {allDone ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-status-done" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                        )}
                        <span className="font-semibold text-ios-primary">{info.total}</span>
                      </div>

                      {info.overdue > 0 ? (
                        <span className="text-status-overdue font-bold text-[9px]">
                          เลย {info.overdue}
                        </span>
                      ) : !allDone && pending > 0 ? (
                        <span className="text-ios-secondary text-[9px]">
                          ค้าง {pending}
                        </span>
                      ) : null}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2 text-xs text-ios-secondary border-t border-ios-separator/20">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-status-done" /> เสร็จครบ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" /> มีงานรอทำ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-status-overdue" /> มีงานเลยกำหนด
            </span>
          </div>
        </section>

        {/* Selected Day Task List */}
        <section className="space-y-4 lg:col-span-2" aria-label="งานของวันที่เลือก">
          <div className="ios-card flex items-center justify-between p-3">
            <button
              className="btn-ghost h-8 w-8 p-0 inline-flex items-center justify-center rounded-full"
              onClick={() => goDay(-1)}
              aria-label="วันก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-center font-bold text-sm text-ios-primary">
              {formatDateFull(selectedDate, yearFormat)}
            </h2>
            <button
              className="btn-ghost h-8 w-8 p-0 inline-flex items-center justify-center rounded-full"
              onClick={() => goDay(1)}
              aria-label="วันถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            className="btn-primary w-full"
            onClick={() => openNewTask({ work_date: selectedDate })}
          >
            <Plus className="h-4 w-4" aria-hidden /> เพิ่มงานในวันนี้
          </button>

          {day.loading && !day.data ? (
            <Loading />
          ) : day.error ? (
            <ErrorBox message={day.error} />
          ) : day.data && day.data.length ? (
            <ul className="space-y-2">
              {day.data.map((t) => (
                <TaskItem key={t.id} task={t} showDate={false} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="ไม่มีงานในวันนี้"
              description="แตะปุ่มด้านบนเพื่อเพิ่มงานในวันที่เลือก"
            />
          )}
        </section>
      </div>
    </div>
  );
}
