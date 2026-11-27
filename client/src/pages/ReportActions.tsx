import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL, type MonthlyReport } from '@shared/schemas';
import { Download, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateShort, formatDateTime } from '../lib/format';

function csvCell(val: string | number | null | undefined): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** ปุ่มส่งออกรายงานรายเดือนเป็นไฟล์ CSV (รองรับภาษาไทยใน Excel) และพิมพ์/บันทึก PDF */
export default function ReportActions({ report }: { report: MonthlyReport }) {
  const { yearFormat } = useApp();

  const downloadCsv = () => {
    const headers = [
      'กลุ่ม',
      'ลำดับ',
      'ชื่องาน / โปรเจกต์',
      'โปรเจกต์ที่ผูก',
      'Milestone',
      'หมวดหมู่',
      'ความสำคัญ',
      'สถานะ / ความคืบหน้า',
      'วันที่ทำงาน',
      'กำหนดส่ง',
      'ทำเสร็จเมื่อ',
      'ผลลัพธ์ / สรุปความคืบหน้า',
      'หลักฐาน / ปัญหา-แผนถัดไป',
    ];

    const rows: string[][] = [headers];

    if (report.projectReports && report.projectReports.length > 0) {
      report.projectReports.forEach((pr, i) => {
        const deltaStr = pr.progressDelta >= 0 ? `+${pr.progressDelta}%` : `${pr.progressDelta}%`;
        rows.push([
          'ความคืบหน้าโปรเจกต์ระยะยาว',
          String(i + 1),
          pr.project.name,
          pr.project.name,
          pr.completedMilestones.map((m) => m.title).join(', ') || '-',
          'โปรเจกต์ระยะยาว',
          '-',
          `${PROJECT_STATUS_LABEL[pr.project.status]} (${pr.progressAtEndOfMonth}%, ${deltaStr})`,
          formatDateShort(pr.project.start_date, yearFormat),
          pr.project.target_end_date ? formatDateShort(pr.project.target_end_date, yearFormat) : '-',
          pr.project.actual_end_date ? formatDateShort(pr.project.actual_end_date, yearFormat) : '-',
          pr.update?.summary ?? `งานเสร็จในเดือน ${pr.completedTasks.length} งาน`,
          [pr.update?.issues ? `ปัญหา: ${pr.update.issues}` : '', pr.update?.next_plan ? `แผนถัดไป: ${pr.update.next_plan}` : '']
            .filter(Boolean)
            .join(' | '),
        ]);
      });
    }

    report.completed.forEach((t, i) => {
      rows.push([
        'ผลงานที่เสร็จในเดือนนี้',
        String(i + 1),
        t.title,
        t.project_name ?? 'งานทั่วไป',
        t.milestone_title ?? '-',
        t.category ?? 'ไม่มีหมวดหมู่',
        PRIORITY_LABEL[t.priority],
        STATUS_LABEL[t.status],
        formatDateShort(t.work_date, yearFormat),
        t.due_date ? formatDateShort(t.due_date, yearFormat) : '-',
        formatDateTime(t.completed_at, yearFormat),
        t.result_note ?? '',
        t.evidence_link ?? '',
      ]);
    });

    report.pending.forEach((t, i) => {
      rows.push([
        'งานค้าง/ยังไม่เสร็จ',
        String(i + 1),
        t.title,
        t.project_name ?? 'งานทั่วไป',
        t.milestone_title ?? '-',
        t.category ?? 'ไม่มีหมวดหมู่',
        PRIORITY_LABEL[t.priority],
        STATUS_LABEL[t.status],
        formatDateShort(t.work_date, yearFormat),
        t.due_date ? formatDateShort(t.due_date, yearFormat) : '-',
        '-',
        t.result_note ?? '',
        t.evidence_link ?? '',
      ]);
    });

    const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worklog-report-${report.month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" onClick={downloadCsv}>
        <Download className="h-4 w-4" aria-hidden /> ส่งออก CSV (Excel)
      </button>
      <button className="btn-primary" onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden /> พิมพ์ / บันทึก PDF
      </button>
    </div>
  );
}

