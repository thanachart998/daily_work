import type { TaskPriority, TaskStatus } from '../../shared/schemas.js';
import { dayjs, nowIso, todayStr, TZ } from '../../shared/dates.js';
import { getDb } from '../db/connection.js';
import { ensureCategory } from './categoryService.js';

/** สุ่มแบบกำหนด seed ได้ เพื่อให้ข้อมูลตัวอย่างออกมาเหมือนเดิมทุกครั้ง */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEMPLATES: { title: string; category: string; description?: string; result?: string; link?: string }[] = [
  { title: 'ตรวจสอบอีเมลและตอบกลับลูกค้า', category: 'งานประจำ', result: 'ตอบกลับครบทุกฉบับ' },
  { title: 'ประชุมทีมประจำสัปดาห์', category: 'ประชุม', description: 'อัปเดตความคืบหน้างานของทีม', result: 'สรุปมติที่ประชุมส่งทีมแล้ว' },
  { title: 'จัดทำรายงานยอดขายประจำสัปดาห์', category: 'เอกสาร', result: 'ส่งรายงานให้หัวหน้าแล้ว', link: 'https://example.local/report/weekly' },
  { title: 'ออกแบบหน้าจอระบบลงทะเบียน', category: 'โครงการ', description: 'ทำ wireframe และ mockup', result: 'ได้ mockup 5 หน้าจอ' },
  { title: 'ทดสอบระบบก่อนขึ้นใช้งานจริง', category: 'โครงการ', result: 'พบข้อบกพร่อง 3 จุด แก้ไขแล้ว' },
  { title: 'อัปเดตเอกสารคู่มือผู้ใช้', category: 'เอกสาร', result: 'เพิ่มหัวข้อใหม่ 2 บท' },
  { title: 'สำรองข้อมูลเซิร์ฟเวอร์', category: 'งานประจำ', result: 'สำรองข้อมูลสำเร็จ ตรวจไฟล์แล้ว' },
  { title: 'ประชุมกับลูกค้าเพื่อเก็บความต้องการ', category: 'ประชุม', result: 'ได้รายการความต้องการ 12 ข้อ' },
  { title: 'แก้ไขข้อบกพร่องหน้าค้นหา', category: 'โครงการ', result: 'แก้ไขเรียบร้อย ส่งให้ทีมทดสอบแล้ว' },
  { title: 'เตรียมสไลด์นำเสนอผู้บริหาร', category: 'เอกสาร', result: 'นำเสนอผ่าน ได้รับอนุมัติงบประมาณ' },
  { title: 'อบรมการใช้งานระบบใหม่', category: 'การพัฒนาตนเอง', result: 'ผ่านการอบรมและได้ใบรับรอง' },
  { title: 'ตรวจสอบใบแจ้งหนี้และเอกสารเบิกจ่าย', category: 'งานประจำ', result: 'ตรวจครบ 18 รายการ' },
  { title: 'รีวิวโค้ดของสมาชิกทีม', category: 'โครงการ', result: 'รีวิว 4 pull request' },
  { title: 'วางแผนงานไตรมาสถัดไป', category: 'ประชุม', description: 'กำหนดเป้าหมายและตัวชี้วัด' },
  { title: 'อ่านบทความเทคนิคและสรุปความรู้', category: 'การพัฒนาตนเอง', result: 'สรุปเป็นบันทึกแบ่งปันทีม' },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'medium', 'high'];

/**
 * เพิ่มข้อมูลตัวอย่าง: 2 เดือนก่อนหน้า + เดือนปัจจุบัน (+ ล่วงหน้า 7 วัน)
 * พร้อมโปรเจกต์ระยะยาว 2 โปรเจกต์ที่ครอบคลุมหลายเดือน มี Milestone และบันทึกความคืบหน้ารายเดือน
 */
export function seedSampleData(): { inserted: number; from: string; to: string; projectsInserted: number } {
  const db = getDb();
  const rand = mulberry32(20260101);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const today = todayStr();
  const now = dayjs().tz(TZ);
  const start = now.subtract(2, 'month').startOf('month');
  const prevMonth = now.subtract(1, 'month');
  const nextMonthEnd = now.add(1, 'month').endOf('month');
  const end = now.add(7, 'day');
  const createdAt = nowIso();

  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, work_date, work_end_date, due_date, category, priority, status, completed_at,
      result_note, evidence_link, project_id, milestone_id, created_at, updated_at)
     VALUES (@title, @description, @work_date, @work_end_date, @due_date, @category, @priority, @status, @completed_at,
      @result_note, @evidence_link, @project_id, @milestone_link_id, @created_at, @created_at)`,
  );

  const insertProject = db.prepare(
    `INSERT INTO projects (name, description, start_date, target_end_date, actual_end_date, status, color,
      progress_mode, manual_progress, created_at, updated_at)
     VALUES (@name, @description, @start_date, @target_end_date, NULL, @status, @color,
      'auto', 0, @created_at, @created_at)`,
  );

  const insertMilestone = db.prepare(
    `INSERT INTO milestones (project_id, title, description, due_date, status, completed_at, sort_order, created_at, updated_at)
     VALUES (@project_id, @title, @description, @due_date, @status, @completed_at, @sort_order, @created_at, @created_at)`,
  );

  const insertUpdate = db.prepare(
    `INSERT INTO project_updates (project_id, period, summary, issues, next_plan, created_at, updated_at)
     VALUES (@project_id, @period, @summary, @issues, @next_plan, @created_at, @created_at)
     ON CONFLICT(project_id, period) DO UPDATE SET summary = excluded.summary`,
  );

  let inserted = 0;
  let projectsInserted = 0;

  db.transaction(() => {
    for (const t of TEMPLATES) ensureCategory(t.category);

    // ===== สร้างโปรเจกต์ระยะยาว 2 โปรเจกต์ (ครอบคลุมหลายเดือน) =====
    const p1Id = Number(
      insertProject.run({
        name: 'โครงการพัฒนาระบบบริการประชาชนออนไลน์ (E-Service Portal)',
        description: 'ยกระดับระบบยื่นคำร้องและติดตามสถานะเอกสารออนไลน์ รองรับการยืนยันตัวตนและออกใบเสร็จอิเล็กทรอนิกส์',
        start_date: start.format('YYYY-MM-DD'),
        target_end_date: nextMonthEnd.format('YYYY-MM-DD'),
        status: 'active',
        color: '#0044CC',
        created_at: createdAt,
      }).lastInsertRowid,
    );

    const p1m1 = Number(
      insertMilestone.run({
        project_id: p1Id,
        title: 'เฟส 1: สำรวจความต้องการและออกแบบ UX/UI',
        description: 'เก็บ Requirement จากหน่วยงานและจัดทำ Prototype',
        due_date: start.endOf('month').format('YYYY-MM-DD'),
        status: 'done',
        completed_at: start.endOf('month').hour(16).format('YYYY-MM-DDTHH:mm:ssZ'),
        sort_order: 1,
        created_at: createdAt,
      }).lastInsertRowid,
    );

    const p1m2 = Number(
      insertMilestone.run({
        project_id: p1Id,
        title: 'เฟส 2: พัฒนาโมดูลยื่นคำร้องและฐานข้อมูลหลัก',
        description: 'สร้าง API ยื่นคำร้อง ระบบแนบไฟล์ และเชื่อมต่อระบบแจ้งเตือน',
        due_date: now.endOf('month').format('YYYY-MM-DD'),
        status: 'doing',
        completed_at: null,
        sort_order: 2,
        created_at: createdAt,
      }).lastInsertRowid,
    );

    const p1m3 = Number(
      insertMilestone.run({
        project_id: p1Id,
        title: 'เฟส 3: ทดสอบ UAT และเปิดใช้งานจริง',
        description: 'ทดสอบร่วมกับผู้ใช้งานจริงและอบรมเจ้าหน้าที่',
        due_date: nextMonthEnd.format('YYYY-MM-DD'),
        status: 'todo',
        completed_at: null,
        sort_order: 3,
        created_at: createdAt,
      }).lastInsertRowid,
    );

    // งานของโปรเจกต์ที่ 1
    const p1Tasks = [
      {
        title: 'สัมภาษณ์เจ้าหน้าที่และรวบรวมแบบฟอร์มคำร้องเดิม',
        work_date: start.add(4, 'day').format('YYYY-MM-DD'),
        work_end_date: start.add(6, 'day').format('YYYY-MM-DD'),
        due_date: start.add(10, 'day').format('YYYY-MM-DD'),
        status: 'done' as TaskStatus,
        completed_at: start.add(6, 'day').hour(15).format('YYYY-MM-DDTHH:mm:ssZ'),
        result_note: 'รวบรวมแบบฟอร์มได้ครบ 14 ประเภท',
        milestone_link_id: p1m1,
      },
      {
        title: 'ออกแบบหน้าจอยื่นคำร้องและติดตามสถานะ (Figma)',
        work_date: prevMonth.startOf('month').add(3, 'day').format('YYYY-MM-DD'),
        work_end_date: prevMonth.startOf('month').add(5, 'day').format('YYYY-MM-DD'),
        due_date: prevMonth.startOf('month').add(7, 'day').format('YYYY-MM-DD'),
        status: 'done' as TaskStatus,
        completed_at: prevMonth.startOf('month').add(5, 'day').hour(17).format('YYYY-MM-DDTHH:mm:ssZ'),
        result_note: 'คณะกรรมการอนุมัติแบบหน้าจอแล้ว',
        milestone_link_id: p1m1,
      },
      {
        title: 'พัฒนา API บันทึกคำร้องและอัปโหลดไฟล์แนบ',
        work_date: now.startOf('month').add(1, 'day').format('YYYY-MM-DD'),
        work_end_date: now.startOf('month').add(2, 'day').format('YYYY-MM-DD'),
        due_date: now.startOf('month').add(5, 'day').format('YYYY-MM-DD'),
        status: 'done' as TaskStatus,
        completed_at: (now.startOf('month').add(2, 'day').isAfter(now) ? now : now.startOf('month').add(2, 'day')).hour(14).format('YYYY-MM-DDTHH:mm:ssZ'),
        result_note: 'รองรับไฟล์ PDF/JPG ขนาดสูงสุด 20MB พร้อมตรวจไวรัสเบื้องต้น',
        milestone_link_id: p1m2,
      },
      {
        title: 'พัฒนาระบบแจ้งเตือนสถานะคำร้องทางอีเมล',
        work_date: today,
        work_end_date: now.add(2, 'day').format('YYYY-MM-DD'),
        due_date: now.add(3, 'day').format('YYYY-MM-DD'),
        status: 'doing' as TaskStatus,
        completed_at: null,
        result_note: null,
        milestone_link_id: p1m2,
      },
      {
        title: 'เตรียมแผนทดสอบ UAT ร่วมกับตัวแทนหน่วยงาน',
        work_date: now.add(5, 'day').format('YYYY-MM-DD'),
        work_end_date: null,
        due_date: nextMonthEnd.subtract(10, 'day').format('YYYY-MM-DD'),
        status: 'todo' as TaskStatus,
        completed_at: null,
        result_note: null,
        milestone_link_id: p1m3,
      },
    ];

    for (const pt of p1Tasks) {
      insertTask.run({
        title: pt.title,
        description: 'งานภายใต้โครงการ E-Service Portal',
        work_date: pt.work_date,
        work_end_date: pt.work_end_date,
        due_date: pt.due_date,
        category: 'โครงการ',
        priority: 'high',
        status: pt.status,
        completed_at: pt.completed_at,
        result_note: pt.result_note,
        evidence_link: null,
        project_id: p1Id,
        milestone_link_id: pt.milestone_link_id,
        created_at: createdAt,
      });
      inserted++;
    }

    insertUpdate.run({
      project_id: p1Id,
      period: prevMonth.format('YYYY-MM'),
      summary: 'สรุปความต้องการครบ 14 แบบฟอร์ม และออกแบบ UX/UI ผ่านการอนุมัติเรียบร้อย',
      issues: 'มีแบบฟอร์มบางรายการต้องปรับช่องข้อมูลให้สอดคล้องกับระเบียบใหม่',
      next_plan: 'เริ่มพัฒนา API ยื่นคำร้องและระบบแจ้งเตือนในเดือนถัดไป',
      created_at: createdAt,
    });

    insertUpdate.run({
      project_id: p1Id,
      period: now.format('YYYY-MM'),
      summary: 'พัฒนา API ยื่นคำร้องและระบบอัปโหลดเอกสารเสร็จสมบูรณ์ กำลังเชื่อมต่อระบบแจ้งเตือน',
      issues: 'รอเซิร์ฟเวอร์ SMTP ทดสอบจากฝ่ายโครงสร้างพื้นฐาน',
      next_plan: 'ทดสอบระบบรวม (Integration Test) และเตรียมเอกสาร UAT',
      created_at: createdAt,
    });

    // โปรเจกต์ที่ 2
    const p2Id = Number(
      insertProject.run({
        name: 'โครงการยกระดับมาตรฐานความปลอดภัยข้อมูล (PDPA & ISO 27001)',
        description: 'จัดทำนโยบายคุ้มครองข้อมูลส่วนบุคคล ตรวจสอบสิทธิ์การเข้าถึงระบบ และซ้อมแผนรับมือเหตุฉุกเฉินไซเบอร์',
        start_date: prevMonth.startOf('month').format('YYYY-MM-DD'),
        target_end_date: now.add(1, 'month').date(15).format('YYYY-MM-DD'),
        status: 'active',
        color: '#059669',
        created_at: createdAt,
      }).lastInsertRowid,
    );

    const p2m1 = Number(
      insertMilestone.run({
        project_id: p2Id,
        title: 'จัดทำบัญชีรายการข้อมูลส่วนบุคคล (RoPA)',
        description: 'สำรวจข้อมูลส่วนบุคคลที่จัดเก็บในทุกแผนก',
        due_date: prevMonth.endOf('month').format('YYYY-MM-DD'),
        status: 'done',
        completed_at: prevMonth.endOf('month').hour(15).format('YYYY-MM-DDTHH:mm:ssZ'),
        sort_order: 1,
        created_at: createdAt,
      }).lastInsertRowid,
    );

    const p2m2 = Number(
      insertMilestone.run({
        project_id: p2Id,
        title: 'ทบทวนสิทธิ์ผู้ใช้งานและตั้งค่าการสำรองข้อมูล',
        description: 'ตรวจสอบ Access Control และทดสอบการกู้คืนข้อมูล',
        due_date: now.add(5, 'day').format('YYYY-MM-DD'),
        status: 'doing',
        completed_at: null,
        sort_order: 2,
        created_at: createdAt,
      }).lastInsertRowid,
    );

    const p2Tasks = [
      {
        title: 'สำรวจและจัดทำตาราง RoPA ของฝ่ายบุคคลและการเงิน',
        work_date: prevMonth.date(10).format('YYYY-MM-DD'),
        work_end_date: prevMonth.date(12).format('YYYY-MM-DD'),
        due_date: prevMonth.date(15).format('YYYY-MM-DD'),
        status: 'done' as TaskStatus,
        completed_at: prevMonth.date(12).hour(16).format('YYYY-MM-DDTHH:mm:ssZ'),
        result_note: 'ได้รายการข้อมูลครบทั้ง 2 ฝ่าย',
        milestone_link_id: p2m1,
      },
      {
        title: 'ตรวจสอบและเพิกถอนสิทธิ์บัญชีผู้ใช้ที่ไม่ได้ใช้งานเกิน 90 วัน',
        work_date: now.startOf('month').format('YYYY-MM-DD'),
        work_end_date: null,
        due_date: now.startOf('month').add(3, 'day').format('YYYY-MM-DD'),
        status: 'done' as TaskStatus,
        completed_at: now.startOf('month').hour(11).format('YYYY-MM-DDTHH:mm:ssZ'),
        result_note: 'ปรับปรุงสิทธิ์เรียบร้อย 24 บัญชี',
        milestone_link_id: p2m2,
      },
      {
        title: 'ซ้อมแผนกู้คืนฐานข้อมูลจากไฟล์สำรองประจำไตรมาส',
        work_date: today,
        work_end_date: null,
        due_date: now.add(5, 'day').format('YYYY-MM-DD'),
        status: 'todo' as TaskStatus,
        completed_at: null,
        result_note: null,
        milestone_link_id: p2m2,
      },
    ];

    for (const pt of p2Tasks) {
      insertTask.run({
        title: pt.title,
        description: 'งานภายใต้โครงการ PDPA & ISO 27001',
        work_date: pt.work_date,
        work_end_date: pt.work_end_date,
        due_date: pt.due_date,
        category: 'โครงการ',
        priority: 'medium',
        status: pt.status,
        completed_at: pt.completed_at,
        result_note: pt.result_note,
        evidence_link: null,
        project_id: p2Id,
        milestone_link_id: pt.milestone_link_id,
        created_at: createdAt,
      });
      inserted++;
    }

    insertUpdate.run({
      project_id: p2Id,
      period: now.format('YYYY-MM'),
      summary: 'ทบทวนและปรับปรุงสิทธิ์บัญชีผู้ใช้งานเสร็จแล้ว อยู่ระหว่างเตรียมซ้อมกู้คืนฐานข้อมูล',
      issues: 'ไม่มีอุปสรรคสำคัญ',
      next_plan: 'สรุปผลการซ้อมแผนกู้คืนข้อมูลและจัดอบรมพนักงาน',
      created_at: createdAt,
    });

    projectsInserted = 2;

    // ===== งานรายวันทั่วไป (ไม่ผูกโปรเจกต์) =====
    for (let d = start; !d.isAfter(end, 'day'); d = d.add(1, 'day')) {
      const dow = d.day();
      if (dow === 0 || dow === 6) continue; // ข้ามเสาร์-อาทิตย์
      const date = d.format('YYYY-MM-DD');
      const count = 1 + Math.floor(rand() * 2);

      for (let i = 0; i < count; i++) {
        const tpl = pick(TEMPLATES);
        const hasDue = rand() < 0.5;
        const due = hasDue ? d.add(Math.floor(rand() * 5), 'day').format('YYYY-MM-DD') : null;

        let status: TaskStatus = 'todo';
        let completedAt: string | null = null;
        if (date < today) {
          const r = rand();
          status = r < 0.82 ? 'done' : r < 0.92 ? 'doing' : 'todo';
        } else if (date === today) {
          status = pick<TaskStatus>(['todo', 'doing', 'done']);
        }
        if (status === 'done') {
          let done = d.hour(9 + Math.floor(rand() * 9)).minute(Math.floor(rand() * 60)).second(0);
          if (rand() < 0.2) done = done.add(1 + Math.floor(rand() * 2), 'day');
          if (done.isAfter(now)) done = now;
          completedAt = done.format('YYYY-MM-DDTHH:mm:ssZ');
        }

        insertTask.run({
          title: tpl.title,
          description: tpl.description ?? null,
          work_date: date,
          work_end_date: null,
          due_date: due,
          category: tpl.category,
          priority: pick(PRIORITIES),
          status,
          completed_at: completedAt,
          result_note: status === 'done' ? (tpl.result ?? null) : null,
          evidence_link: status === 'done' ? (tpl.link ?? null) : null,
          project_id: null,
          milestone_link_id: null,
          created_at: createdAt,
        });
        inserted++;
      }
    }

    // กรณีทดสอบ: งานวันสุดท้ายของเดือนก่อน แต่ทำเสร็จวันแรกของเดือนนี้ (ต้องนับเป็นผลงานเดือนนี้)
    const lastPrev = now.subtract(1, 'month').endOf('month');
    const firstCur = now.startOf('month').hour(10).minute(30).second(0);
    insertTask.run({
      title: 'ปิดงบประมาณสิ้นเดือน (เสร็จข้ามเดือน)',
      description: 'ตัวอย่างงานที่วางแผนเดือนก่อน แต่ทำเสร็จในเดือนนี้',
      work_date: lastPrev.format('YYYY-MM-DD'),
      work_end_date: null,
      due_date: lastPrev.format('YYYY-MM-DD'),
      category: 'เอกสาร',
      priority: 'high',
      status: 'done',
      completed_at: (firstCur.isAfter(now) ? now : firstCur).format('YYYY-MM-DDTHH:mm:ssZ'),
      result_note: 'ส่งงบประมาณให้ฝ่ายการเงินแล้ว',
      evidence_link: null,
      project_id: null,
      milestone_link_id: null,
      created_at: createdAt,
    });
    // กรณีทดสอบ: งานค้างที่เลยกำหนด
    insertTask.run({
      title: 'ส่งแบบประเมินความพึงพอใจ (ค้าง)',
      description: 'ตัวอย่างงานที่ยังไม่เสร็จและเลยกำหนดแล้ว',
      work_date: now.subtract(5, 'day').format('YYYY-MM-DD'),
      work_end_date: null,
      due_date: now.subtract(2, 'day').format('YYYY-MM-DD'),
      category: 'งานประจำ',
      priority: 'high',
      status: 'doing',
      completed_at: null,
      result_note: null,
      evidence_link: null,
      project_id: null,
      milestone_link_id: null,
      created_at: createdAt,
    });
    inserted += 2;
  })();

  return { inserted, from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD'), projectsInserted };
}
