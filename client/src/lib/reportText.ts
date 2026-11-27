import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL, type MonthlyReport } from '@shared/schemas';
import { formatDateShort, formatDateTime, formatMonth, type YearFormat } from './format';

/** สร้างข้อความสรุปผลงานรายเดือน สำหรับคัดลอกไปใช้เขียนรายงาน/ประเมินผล */
export function buildReportText(r: MonthlyReport, yf: YearFormat): string {
  const s = r.summary;
  const lines: string[] = [];
  lines.push(`สรุปผลงานประจำเดือน ${formatMonth(r.month, yf)}`);
  lines.push('');
  lines.push('ภาพรวม');
  lines.push(`- งานที่วางแผนในเดือน: ${s.planned} งาน`);
  lines.push(`- ผลงานที่ทำเสร็จในเดือน: ${s.completedInMonth} งาน`);
  lines.push(`- งานที่วางแผนและเสร็จแล้ว: ${s.plannedDone} งาน (อัตราความสำเร็จ ${s.successRate}%)`);
  lines.push(`- ยังไม่เสร็จ: ${s.pending} งาน${s.overdue ? ` (เลยกำหนด ${s.overdue} งาน)` : ''}`);

  if (r.projectReports && r.projectReports.length > 0) {
    lines.push('');
    lines.push(`ความคืบหน้าโปรเจกต์ระยะยาว (${r.projectReports.length} โปรเจกต์)`);
    r.projectReports.forEach((pr, idx) => {
      const sign = pr.progressDelta >= 0 ? `+${pr.progressDelta}%` : `${pr.progressDelta}%`;
      lines.push(
        `${idx + 1}. โปรเจกต์: ${pr.project.name} [${PROJECT_STATUS_LABEL[pr.project.status]}] — ความคืบหน้าสะสม ${pr.progressAtEndOfMonth}% (เปลี่ยนแปลงจากเดือนก่อน ${sign})`,
      );
      if (pr.update) {
        lines.push(`   สรุปความคืบหน้าเดือนนี้: ${pr.update.summary}`);
        if (pr.update.issues) lines.push(`   ปัญหา/อุปสรรค: ${pr.update.issues}`);
        if (pr.update.next_plan) lines.push(`   แผนเดือนถัดไป: ${pr.update.next_plan}`);
      }
      if (pr.completedMilestones.length > 0) {
        lines.push(
          `   Milestone ที่สำเร็จในเดือนนี้ (${pr.completedMilestones.length}): ${pr.completedMilestones.map((m) => m.title).join(', ')}`,
        );
      }
      if (pr.completedTasks.length > 0) {
        lines.push(`   งานย่อยที่ทำเสร็จในเดือนนี้ (${pr.completedTasks.length} งาน):`);
        pr.completedTasks.forEach((t) => {
          const ms = t.milestone_title ? ` (${t.milestone_title})` : '';
          lines.push(`   - ${t.title}${ms} — เสร็จ ${formatDateTime(t.completed_at, yf)}${t.result_note ? ` | ผลลัพธ์: ${t.result_note}` : ''}`);
        });
      }
    });
  }

  if (r.byCategory.length) {
    lines.push('');
    lines.push('แยกตามหมวดหมู่');
    for (const c of r.byCategory) {
      lines.push(`- ${c.category}: เสร็จในเดือน ${c.completedInMonth} งาน, วางแผน ${c.planned} งาน, ค้าง ${c.pending} งาน`);
    }
  }

  const generalCompleted = r.generalCompleted ?? r.completed;
  lines.push('');
  lines.push(`ผลงานที่ทำเสร็จทั้งหมดในเดือน (${r.completed.length} งาน — งานทั่วไป ${generalCompleted.length} งาน)`);
  if (!r.completed.length) lines.push('- ไม่มี');
  r.completed.forEach((t, i) => {
    const cat = t.category ? ` [${t.category}]` : '';
    const proj = t.project_name ? ` [โปรเจกต์: ${t.project_name}]` : '';
    lines.push(`${i + 1}. ${t.title}${proj}${cat} — เสร็จ ${formatDateTime(t.completed_at, yf)}`);
    if (t.result_note) lines.push(`   ผลลัพธ์: ${t.result_note}`);
    if (t.evidence_link) lines.push(`   หลักฐาน: ${t.evidence_link}`);
  });

  if (r.pending.length) {
    lines.push('');
    lines.push(`งานที่ยังไม่เสร็จ (${r.pending.length} งาน)`);
    r.pending.forEach((t, i) => {
      const overdue = t.due_date && t.due_date < r.today ? ' — เลยกำหนด' : '';
      const proj = t.project_name ? ` [โปรเจกต์: ${t.project_name}]` : '';
      lines.push(
        `${i + 1}. ${t.title}${proj} (${STATUS_LABEL[t.status]}, ความสำคัญ${PRIORITY_LABEL[t.priority]}, วันที่ทำงาน ${formatDateShort(t.work_date, yf)}${
          t.due_date ? `, กำหนดส่ง ${formatDateShort(t.due_date, yf)}` : ''
        })${overdue}`,
      );
    });
  }
  return lines.join('\n');
}
