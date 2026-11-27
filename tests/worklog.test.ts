import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { closeDb, getDb, openDatabase, setDb } from '../server/db/connection.js';

describe('Worklog API & Database (node:sqlite)', () => {
  beforeEach(() => {
    setDb(openDatabase(':memory:'));
  });

  afterEach(() => {
    closeDb();
  });

  it('สร้าง แก้ไข เปลี่ยนสถานะ (บันทึก/ล้าง completed_at) และลบงานได้ถูกต้อง', async () => {
    const app = createApp();

    const createRes = await request(app).post('/api/tasks').send({
      title: 'จัดทำสรุปผลงานประจำเดือน',
      description: 'รวบรวมข้อมูลจากทุกแผนก',
      work_date: '2026-11-04',
      due_date: '2026-11-05',
      category: 'เอกสาร',
      priority: 'high',
      status: 'todo',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeGreaterThan(0);
    expect(createRes.body.completed_at).toBeNull();

    const taskId = createRes.body.id;

    // เปลี่ยนสถานะเป็น done -> ต้องมี completed_at
    const doneRes = await request(app).patch(`/api/tasks/${taskId}/status`).send({ status: 'done' });
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.status).toBe('done');
    expect(doneRes.body.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // เปลี่ยนสถานะกลับเป็น doing -> completed_at ต้องถูกล้างเป็น null
    const doingRes = await request(app).patch(`/api/tasks/${taskId}/status`).send({ status: 'doing' });
    expect(doingRes.status).toBe(200);
    expect(doingRes.body.status).toBe('doing');
    expect(doingRes.body.completed_at).toBeNull();

    // เปลี่ยนสถานะเป็น review (รอ ตรวจสอบ/แก้ไข) -> completed_at ยังคงเป็น null
    const reviewRes = await request(app).patch(`/api/tasks/${taskId}/status`).send({ status: 'review' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe('review');
    expect(reviewRes.body.completed_at).toBeNull();

    // ลบงาน
    const delRes = await request(app).delete(`/api/tasks/${taskId}`);
    expect(delRes.status).toBe(204);

    // ทดสอบลบหลายรายการพร้อมรหัสผ่านยืนยัน (P@ssw0rd*)
    const t1 = await request(app).post('/api/tasks').send({ title: 'งาน 1', work_date: '2026-11-04' });
    const t2 = await request(app).post('/api/tasks').send({ title: 'งาน 2', work_date: '2026-11-04' });

    const wrongPw = await request(app)
      .post('/api/tasks/bulk-delete')
      .send({ ids: [t1.body.id, t2.body.id], password: 'wrong' });
    expect(wrongPw.status).toBe(403);

    const rightPw = await request(app)
      .post('/api/tasks/bulk-delete')
      .send({ ids: [t1.body.id, t2.body.id], password: 'P@ssw0rd*' });
    expect(rightPw.status).toBe(200);
    expect(rightPw.body.deleted).toBe(2);
  });

  it('ทำ Migration ฐานข้อมูลจาก v1 เป็น v5 โดยสำรองไฟล์อัตโนมัติและข้อมูลเดิมไม่หาย', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worklog-mig-test-'));
    const dbFile = path.join(tmpDir, 'worklog.db');
    try {
      // สร้างฐานข้อมูลรุ่นเก่า (v1) ที่มีเฉพาะตาราง tasks, categories, settings
      const raw = new DatabaseSync(dbFile);
      raw.exec(`
        CREATE TABLE tasks (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          title         TEXT    NOT NULL,
          description   TEXT,
          work_date     TEXT    NOT NULL,
          due_date      TEXT,
          category      TEXT,
          priority      TEXT    NOT NULL DEFAULT 'medium',
          status        TEXT    NOT NULL DEFAULT 'todo',
          completed_at  TEXT,
          result_note   TEXT,
          evidence_link TEXT,
          created_at    TEXT    NOT NULL,
          updated_at    TEXT    NOT NULL
        );
        CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO tasks (title, work_date, priority, status, created_at, updated_at)
        VALUES ('งานเดิมก่อนอัปเกรด', '2026-09-10', 'high', 'done', '2026-09-10T10:00:00Z', '2026-09-10T10:00:00Z');
        PRAGMA user_version = 1;
      `);
      raw.close();

      // เปิดด้วย openDatabase ซึ่งจะสำรองไฟล์อัตโนมัติและรัน migration v2..v5
      const migrated = openDatabase(dbFile);
      const row = migrated.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
      const ver = row?.user_version;
      expect(ver).toBe(5);

      // ต้องมีไฟล์สำรอง worklog.db.bak ถูกสร้างขึ้นอัตโนมัติ
      expect(fs.existsSync(`${dbFile}.bak`)).toBe(true);

      // ข้อมูลเดิมต้องยังอยู่ครบ
      const rows = migrated.prepare('SELECT * FROM tasks').all() as { title: string; project_id: number | null }[];
      expect(rows.length).toBe(1);
      expect(rows[0].title).toBe('งานเดิมก่อนอัปเกรด');
      expect(rows[0].project_id).toBeNull();
      migrated.close();
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        // ignore Windows file lock on tmpdir cleanup
      }
    }
  });

  it('รองรับสถานะงาน "รอ ตรวจสอบ/แก้ไข" (review) ทั้งการสร้าง แก้ไข นับสถิติ กรอง และรายงาน', async () => {
    const app = createApp();

    // 1. สร้างงานด้วยสถานะ review โดยตรง
    const createRes = await request(app).post('/api/tasks').send({
      title: 'ตรวจสอบเอกสารจัดซื้อจัดจ้าง',
      work_date: '2026-11-05',
      priority: 'high',
      status: 'review',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('review');
    expect(createRes.body.completed_at).toBeNull();
    const taskId = createRes.body.id;

    // 2. เปลี่ยนสถานะเป็น done แล้วเปลี่ยนกลับเป็น review
    const doneRes = await request(app).patch(`/api/tasks/${taskId}/status`).send({ status: 'done' });
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.status).toBe('done');
    expect(doneRes.body.completed_at).not.toBeNull();

    const backToReview = await request(app).patch(`/api/tasks/${taskId}/status`).send({ status: 'review' });
    expect(backToReview.status).toBe(200);
    expect(backToReview.body.status).toBe('review');
    expect(backToReview.body.completed_at).toBeNull();

    // 3. ตรวจสอบ Dashboard stats: review ต้องถูกนับใน notDone และ counts.review
    const dashRes = await request(app).get('/api/dashboard');
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.counts.review).toBe(1);
    expect(dashRes.body.counts.notDone).toBeGreaterThanOrEqual(1);

    // 4. กรองงานตามสถานะ review
    const reviewList = await request(app).get('/api/tasks?status=review');
    expect(reviewList.status).toBe(200);
    expect(reviewList.body.some((t: { id: number }) => t.id === taskId)).toBe(true);

    // 5. กรองงานที่ยังไม่เสร็จ (pending=1) ต้องรวมงานสถานะ review ด้วย
    const pendingList = await request(app).get('/api/tasks?pending=1');
    expect(pendingList.status).toBe(200);
    expect(pendingList.body.some((t: { id: number }) => t.id === taskId)).toBe(true);

    // 6. เลื่อนงานค้าง (postpone) ต้องรองรับงานสถานะ review
    const postRes = await request(app).post('/api/tasks/postpone').send({ ids: [taskId] });
    expect(postRes.status).toBe(200);
    expect(postRes.body.updated.length).toBe(1);
    expect(postRes.body.skipped.length).toBe(0);

    // 7. รายงานรายเดือน: งานสถานะ review ต้องอยู่ใน pending และไม่อยู่ใน completed
    const reportRes = await request(app).get('/api/reports/monthly?month=2026-11');
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.pending.some((t: { id: number }) => t.id === taskId)).toBe(true);
    expect(reportRes.body.completed.some((t: { id: number }) => t.id === taskId)).toBe(false);
  });

  it('เฟส 1-3: โปรเจกต์ระยะยาว 4 เดือน 3 Milestone งานกระจาย 3 เดือน รายงานรายเดือน ย้ายงาน ลบโปรเจกต์ สำรองข้อมูล และฟีเจอร์เสริมทำงานถูกต้อง', async () => {
    const app = createApp();
    const db = getDb();

    // 1. สร้างโปรเจกต์ระยะยาว 4 เดือน (2026-09 ถึง 2026-12)
    const projRes = await request(app).post('/api/projects').send({
      name: 'พัฒนาระบบศูนย์ข้อมูลกลางระยะยาว',
      description: 'โปรเจกต์ระยะยาว 4 เดือน',
      start_date: '2026-09-01',
      target_end_date: '2026-12-31',
      status: 'active',
      color: '#0044CC',
      progress_mode: 'auto',
    });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.id as number;

    // 2. สร้าง 3 Milestone
    const m1Res = await request(app).post(`/api/projects/${projectId}/milestones`).send({
      title: 'เฟส 1: สำรวจและออกแบบ',
      due_date: '2026-09-30',
      status: 'todo',
      sort_order: 1,
    });
    const m2Res = await request(app).post(`/api/projects/${projectId}/milestones`).send({
      title: 'เฟส 2: พัฒนาระบบหลัก',
      due_date: '2026-10-31',
      status: 'todo',
      sort_order: 2,
    });
    const m3Res = await request(app).post(`/api/projects/${projectId}/milestones`).send({
      title: 'เฟส 3: ทดสอบและส่งมอบ',
      due_date: '2026-12-15',
      status: 'todo',
      sort_order: 3,
    });
    expect(m1Res.status).toBe(201);
    expect(m2Res.status).toBe(201);
    expect(m3Res.status).toBe(201);
    const m1Id = m1Res.body.id as number;
    const m2Id = m2Res.body.id as number;
    const m3Id = m3Res.body.id as number;

    // 3. ผูกงาน 6 งาน กระจายใน 3 เดือน (ก.ย., ต.ค., พ.ย.) + งานทั่วไปที่ไม่ผูกโปรเจกต์ 1 งาน
    const t1 = await request(app).post('/api/tasks').send({
      title: 'งานโปรเจกต์ 1 (ก.ย.)',
      work_date: '2026-09-05',
      project_id: projectId,
      milestone_id: m1Id,
      status: 'todo',
    });
    const t2 = await request(app).post('/api/tasks').send({
      title: 'งานโปรเจกต์ 2 (ก.ย.)',
      work_date: '2026-09-15',
      project_id: projectId,
      milestone_id: m1Id,
      status: 'todo',
    });
    const t3 = await request(app).post('/api/tasks').send({
      title: 'งานโปรเจกต์ 3 (ต.ค.)',
      work_date: '2026-10-10',
      project_id: projectId,
      milestone_id: m2Id,
      status: 'todo',
    });
    const t4 = await request(app).post('/api/tasks').send({
      title: 'งานโปรเจกต์ 4 (ต.ค.)',
      work_date: '2026-10-20',
      project_id: projectId,
      milestone_id: m2Id,
      status: 'todo',
    });
    const t5 = await request(app).post('/api/tasks').send({
      title: 'งานโปรเจกต์ 5 (พ.ย. - งานหลายวัน)',
      work_date: '2026-11-02',
      work_end_date: '2026-11-05',
      project_id: projectId,
      milestone_id: m3Id,
      status: 'todo',
    });
    const t6 = await request(app).post('/api/tasks').send({
      title: 'งานโปรเจกต์ 6 (พ.ย. - ยังไม่เสร็จ)',
      work_date: '2026-11-12',
      project_id: projectId,
      milestone_id: m3Id,
      status: 'doing',
    });
    const generalTask = await request(app).post('/api/tasks').send({
      title: 'งานทั่วไปประจำเดือน ก.ย.',
      work_date: '2026-09-12',
      status: 'done',
    });
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-09-12T15:00:00.000Z', generalTask.body.id);

    // ทดสอบทำ t1 และ t2 เสร็จ -> เมื่อ t2 เสร็จครบทุกงานใน Milestone 1 ต้องส่ง promptCompleteMilestone กลับมาถามผู้ใช้ (โดยยังไม่เปลี่ยนสถานะ Milestone เอง)
    await request(app).patch(`/api/tasks/${t1.body.id}/status`).send({ status: 'done' });
    const doneT2 = await request(app).patch(`/api/tasks/${t2.body.id}/status`).send({ status: 'done' });
    expect(doneT2.body.promptCompleteMilestone).toBeTruthy();
    expect(doneT2.body.promptCompleteMilestone.id).toBe(m1Id);

    // ผู้ใช้ยืนยันเปลี่ยนสถานะ Milestone 1 เป็น done
    const m1Done = await request(app).patch(`/api/projects/milestones/${m1Id}/status`).send({ status: 'done' });
    expect(m1Done.body.status).toBe('done');

    // กำหนดเวลา completed_at ของงานและ Milestone ให้ตรงตามเดือนที่ทดสอบ (ก.ย., ต.ค., พ.ย.)
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-09-10T10:00:00.000Z', t1.body.id);
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-09-25T16:00:00.000Z', t2.body.id);
    db.prepare('UPDATE milestones SET completed_at = ? WHERE id = ?').run('2026-09-25T16:05:00.000Z', m1Id);

    // เดือน ต.ค.: ทำ t3 และ t4 เสร็จ และปิด Milestone 2
    await request(app).patch(`/api/tasks/${t3.body.id}/status`).send({ status: 'done' });
    await request(app).patch(`/api/tasks/${t4.body.id}/status`).send({ status: 'done' });
    await request(app).patch(`/api/projects/milestones/${m2Id}/status`).send({ status: 'done' });
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-10-12T11:00:00.000Z', t3.body.id);
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-10-28T17:00:00.000Z', t4.body.id);
    db.prepare('UPDATE milestones SET completed_at = ? WHERE id = ?').run('2026-10-28T17:10:00.000Z', m2Id);

    // เดือน พ.ย.: ทำ t5 เสร็จ ส่วน t6 ยังเป็น doing (ยังไม่เสร็จ)
    await request(app).patch(`/api/tasks/${t5.body.id}/status`).send({ status: 'done' });
    db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?').run('2026-11-05T14:00:00.000Z', t5.body.id);

    // บันทึก project_updates ประจำเดือน ก.ย., ต.ค., พ.ย.
    await request(app).put(`/api/projects/${projectId}/updates`).send({
      period: '2026-09',
      summary: 'ออกแบบสถาปัตยกรรมเสร็จสมบูรณ์',
      issues: 'ไม่มี',
      next_plan: 'เริ่มพัฒนาโมดูลหลักในเดือน ต.ค.',
    });
    await request(app).put(`/api/projects/${projectId}/updates`).send({
      period: '2026-10',
      summary: 'พัฒนาโมดูลหลักเสร็จครบถ้วน',
      issues: 'ปรับโครงสร้าง API เล็กน้อย',
      next_plan: 'ทดสอบระบบในเดือน พ.ย.',
    });
    await request(app).put(`/api/projects/${projectId}/updates`).send({
      period: '2026-11',
      summary: 'เริ่มทดสอบระบบร่วมกับผู้ใช้',
      issues: 'รอผลทดสอบรอบสุดท้าย',
      next_plan: 'เตรียมส่งมอบธันวาคม',
    });

    // ตรวจความคืบหน้าโปรเจกต์ (5 จาก 6 งานเสร็จ = 83%)
    const projDetail = await request(app).get(`/api/projects/${projectId}`);
    expect(projDetail.body.total_tasks).toBe(6);
    expect(projDetail.body.done_tasks).toBe(5);
    expect(projDetail.body.progress).toBe(83);

    // 4. เปิดรายงานรายเดือนของทั้ง 3 เดือน (ก.ย., ต.ค., พ.ย.)
    const repSep = await request(app).get('/api/reports/monthly?month=2026-09');
    const repOct = await request(app).get('/api/reports/monthly?month=2026-10');
    const repNov = await request(app).get('/api/reports/monthly?month=2026-11');

    // ก.ย.: งานโปรเจกต์เสร็จ 2 งาน (33%), Milestone เสร็จ 1 อัน, งานทั่วไปเสร็จ 1 งาน
    const prSep = repSep.body.projectReports.find((r: any) => r.project.id === projectId);
    expect(prSep).toBeTruthy();
    expect(prSep.completedTasks.length).toBe(2);
    expect(prSep.completedMilestones.length).toBe(1);
    expect(prSep.progressAtEndOfMonth).toBe(33);
    expect(prSep.progressDelta).toBe(33);
    expect(prSep.update.summary).toBe('ออกแบบสถาปัตยกรรมเสร็จสมบูรณ์');
    expect(repSep.body.generalCompleted.length).toBe(1);

    // ต.ค.: งานโปรเจกต์เสร็จในเดือน ต.ค. เท่านั้น 2 งาน (ไม่ซ้ำกับ ก.ย.), ความคืบหน้าสะสม 67% (+34%)
    const prOct = repOct.body.projectReports.find((r: any) => r.project.id === projectId);
    expect(prOct).toBeTruthy();
    expect(prOct.completedTasks.length).toBe(2);
    expect(prOct.completedTasks.map((t: any) => t.id)).toEqual([t3.body.id, t4.body.id]);
    expect(prOct.completedMilestones.length).toBe(1);
    expect(prOct.progressAtEndOfMonth).toBe(67);
    expect(prOct.progressDelta).toBe(34);

    // พ.ย.: งานโปรเจกต์เสร็จในเดือน พ.ย. 1 งาน (t5), ส่วน t6 ที่เป็น doing ต้องไม่ถูกนับเป็นงานที่เสร็จ
    const prNov = repNov.body.projectReports.find((r: any) => r.project.id === projectId);
    expect(prNov).toBeTruthy();
    expect(prNov.completedTasks.length).toBe(1);
    expect(prNov.completedTasks[0].id).toBe(t5.body.id);
    expect(prNov.progressAtEndOfMonth).toBe(83);
    expect(prNov.progressDelta).toBe(16);

    // 5. ทดสอบงานหลายวัน (work_end_date: 2026-11-02 ถึง 2026-11-05) แสดงในวันที่ 2026-11-04 ได้
    const dayTasks = await request(app).get('/api/tasks?date=2026-11-04');
    expect(dayTasks.body.some((t: any) => t.id === t5.body.id)).toBe(true);

    // 6. ทดสอบย้ายงานระหว่าง Milestone และระหว่างโปรเจกต์
    const moveMilestoneRes = await request(app).put(`/api/tasks/${t6.body.id}`).send({
      title: t6.body.title,
      work_date: t6.body.work_date,
      status: 'doing',
      priority: 'medium',
      project_id: projectId,
      milestone_id: m2Id,
    });
    expect(moveMilestoneRes.status).toBe(200);
    expect(moveMilestoneRes.body.milestone_id).toBe(m2Id);

    // 7. ทดสอบคัดลอกโปรเจกต์เป็นแม่แบบ (Clone as Template)
    const cloneRes = await request(app).post(`/api/projects/${projectId}/clone`).send({ name: 'โปรเจกต์แม่แบบใหม่' });
    expect(cloneRes.status).toBe(201);
    expect(cloneRes.body.name).toBe('โปรเจกต์แม่แบบใหม่');
    expect(cloneRes.body.total_milestones).toBe(3);
    expect(cloneRes.body.done_milestones).toBe(0);

    // 8. ทดสอบลบโปรเจกต์แบบ "ปลดงานออกจากโปรเจกต์ แต่เก็บงานไว้" (unlink) vs "ลบงานที่ผูกอยู่ด้วย" (delete)
    // สร้างโปรเจกต์ชั่วคราวพร้อมงาน 1 ชิ้นเพื่อทดสอบลบแบบ delete
    const tempProj = await request(app).post('/api/projects').send({
      name: 'โปรเจกต์ทดสอบลบงาน',
      start_date: '2026-11-01',
    });
    const tempTask = await request(app).post('/api/tasks').send({
      title: 'งานที่จะถูกลบไปพร้อมโปรเจกต์',
      work_date: '2026-11-02',
      project_id: tempProj.body.id,
    });
    const delWithTasks = await request(app).delete(`/api/projects/${tempProj.body.id}?taskAction=delete`);
    expect(delWithTasks.status).toBe(200);
    const checkDeletedTask = await request(app).get(`/api/tasks/${tempTask.body.id}`);
    expect(checkDeletedTask.status).toBe(404);

    //9. ทดสอบส่งออกและนำเข้าไฟล์สำรองข้อมูล (รวมถึงรองรับไฟล์สำรองรุ่นเก่าที่ไม่มีฟิลด์ projects)
    const exported = await request(app).get('/api/backup');
    expect(exported.status).toBe(200);
    expect(exported.body.projects.length).toBeGreaterThanOrEqual(2);
    expect(exported.body.milestones.length).toBeGreaterThanOrEqual(3);
    expect(exported.body.project_updates.length).toBe(3);

    // ลบโปรเจกต์หลักแบบ unlink (ปลดงานออกแต่เก็บงานไว้)
    const unlinkRes = await request(app).delete(`/api/projects/${projectId}?taskAction=unlink`);
    expect(unlinkRes.status).toBe(200);
    const unlinkedTask = await request(app).get(`/api/tasks/${t1.body.id}`);
    expect(unlinkedTask.status).toBe(200);
    expect(unlinkedTask.body.project_id).toBeNull();

    // กู้คืนข้อมูลจากไฟล์สำรองกลับมาแบบ replace
    const restoreRes = await request(app).post('/api/backup/import').send({
      mode: 'replace',
      data: exported.body,
    });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.importedProjects).toBeGreaterThanOrEqual(2);

    // ทดสอบนำเข้าไฟล์สำรองรุ่นเก่า (v1 ที่ไม่มี projects, milestones, project_updates) แบบ merge
    const legacyImportRes = await request(app).post('/api/backup/import').send({
      mode: 'merge',
      data: {
        app: 'worklog-local',
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        tasks: [
          {
            title: 'งานจากไฟล์สำรองรุ่นเก่า v1',
            work_date: '2026-11-04',
            priority: 'low',
            status: 'todo',
          },
        ],
        categories: [{ name: 'หมวดรุ่นเก่า' }],
      },
    });
    expect(legacyImportRes.status).toBe(200);
    expect(legacyImportRes.body.importedTasks).toBe(1);
  });

  it('คำนวณรายงานรายเดือน สำรองข้อมูล และกู้คืนข้อมูลได้ถูกต้อง', async () => {
    const app = createApp();

    await request(app).post('/api/tasks').send({
      title: 'งานเสร็จในเดือน',
      work_date: '2026-11-02',
      category: 'โครงการ',
      priority: 'medium',
      status: 'done',
      result_note: 'เรียบร้อย',
    });

    const reportRes = await request(app).get('/api/reports/monthly?month=2026-11');
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.summary.planned).toBe(1);

    const backupRes = await request(app).get('/api/backup');
    expect(backupRes.status).toBe(200);
    expect(backupRes.body.app).toBe('worklog-local');
    expect(backupRes.body.tasks.length).toBe(1);

    // ทดสอบนำเข้าแบบแทนที่ข้อมูลทั้งหมด (replace)
    const importRes = await request(app)
      .post('/api/backup/import')
      .send({
        mode: 'replace',
        data: {
          ...backupRes.body,
          tasks: [
            {
              title: 'งานจากไฟล์สำรอง',
              work_date: '2026-11-04',
              priority: 'high',
              status: 'todo',
            },
          ],
        },
      });
    expect(importRes.status).toBe(200);
    expect(importRes.body.importedTasks).toBe(1);

    const tasksRes = await request(app).get('/api/tasks');
    expect(tasksRes.body.length).toBe(1);
    expect(tasksRes.body[0].title).toBe('งานจากไฟล์สำรอง');
  });

  it('มี /api/health และ /api/shutdown ที่รับเฉพาะ 127.0.0.1', async () => {
    const app = createApp();

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);
    expect(health.body.app).toBe('worklog-local');

    const shutdownRes = await request(app).post('/api/shutdown');
    expect(shutdownRes.status).toBe(200);
    expect(shutdownRes.body.ok).toBe(true);
  });
});

function httpRequest(port: number, method: string, urlPath: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ status: res.statusCode || 0, data: raw });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('Launcher & Portable Package (ไม่พึ่งพา Node.js ในเครื่อง)', () => {
  it('เปิดเซิร์ฟเวอร์ด้วย runtime พกพา ไม่เปิดซ้อนเมื่อคลิกซ้ำ เลือกพอร์ตถัดไปเมื่อพอร์ตหลักไม่ว่าง และปิดผ่าน /api/shutdown โดยข้อมูลยังอยู่เมื่อย้ายโฟลเดอร์', async () => {
    const rootDir = process.cwd();
    const portableSrc = path.join(rootDir, 'release', 'Worklog-Portable');
    const runtimeNode =
      process.platform === 'win32'
        ? path.join(portableSrc, 'runtime', 'node.exe')
        : path.join(portableSrc, 'runtime', 'bin', 'node');

    expect(fs.existsSync(runtimeNode)).toBe(true);
    expect(fs.existsSync(path.join(portableSrc, 'เปิดโปรแกรม.bat'))).toBe(true);
    expect(fs.existsSync(path.join(portableSrc, 'เปิดโปรแกรม.command'))).toBe(true);
    expect(fs.existsSync(path.join(portableSrc, 'เปิดโปรแกรม.sh'))).toBe(true);

    // จำลองการคัดลอกโฟลเดอร์ไปที่ตำแหน่งใหม่ (Temp directory)
    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'worklog-portable-test-'));
    const dirA = path.join(tempBase, 'folder-A');
    const dirB = path.join(tempBase, 'folder-B');
    fs.mkdirSync(path.join(dirA, 'app'), { recursive: true });
    fs.mkdirSync(path.join(dirA, 'data'), { recursive: true });
    fs.mkdirSync(path.join(dirA, 'logs'), { recursive: true });

    // คัดลอกไฟล์ app/ ไปยัง dirA
    fs.cpSync(path.join(portableSrc, 'app'), path.join(dirA, 'app'), { recursive: true });

    // จองพอร์ตเริ่มต้น 4310 เพื่อทดสอบว่าเมื่อพอร์ตหลักถูกใช้งานอยู่ ระบบจะเลือกพอร์ตถัดไปอัตโนมัติ (4311)
    const occupiedPort = 4310;
    const dummyServer = net.createServer();
    await new Promise<void>((resolve) => dummyServer.listen(occupiedPort, '127.0.0.1', () => resolve()));

    try {
      // จำลองสภาพแวดล้อมเครื่องที่ไม่มี Node.js ใน PATH
      const cleanEnv = {
        SystemRoot: process.env.SystemRoot || 'C:\\Windows',
        windir: process.env.windir || 'C:\\Windows',
        TEMP: os.tmpdir(),
        TMP: os.tmpdir(),
        PATH: 'C:\\Windows\\System32;C:\\Windows',
        PORT: String(occupiedPort),
        WORKLOG_ROOT: dirA,
        WORKLOG_NO_BROWSER: '1',
        WORKLOG_NO_DIALOG: '1',
      };

      // คลิกครั้งที่ 1: ต้องหลบพอร์ต 4310 ที่ไม่ว่าง ไปเปิดที่ 4311
      const run1 = spawnSync(runtimeNode, [path.join(dirA, 'app', 'launcher.mjs')], {
        cwd: dirA,
        env: cleanEnv,
        encoding: 'utf8',
      });
      expect(run1.status).toBe(0);
      expect(run1.stdout).toContain('READY_URL=http://127.0.0.1:4311');

      const health1 = await httpRequest(4311, 'GET', '/api/health');
      expect(health1.status).toBe(200);
      expect(health1.data.ok).toBe(true);
      const firstPid = health1.data.pid;

      // คลิกครั้งที่ 2 (ดับเบิลคลิกซ้ำขณะรันอยู่): ต้องไม่สร้างเซิร์ฟเวอร์ซ้อน (PID เดิม พอร์ตเดิม)
      const run2 = spawnSync(runtimeNode, [path.join(dirA, 'app', 'launcher.mjs')], {
        cwd: dirA,
        env: cleanEnv,
        encoding: 'utf8',
      });
      expect(run2.status).toBe(0);
      expect(run2.stdout).toContain('READY_URL=http://127.0.0.1:4311');

      const health2 = await httpRequest(4311, 'GET', '/api/health');
      expect(health2.data.pid).toBe(firstPid);

      // บันทึกงานใหม่ลงฐานข้อมูล
      const created = await httpRequest(4311, 'POST', '/api/tasks', {
        title: 'ทดสอบบันทึกงานแบบพกพา',
        work_date: '2026-11-04',
        priority: 'high',
        status: 'done',
      });
      expect(created.status).toBe(201);

      // กดปุ่ม "ปิดโปรแกรม" (/api/shutdown)
      const stopRes = await httpRequest(4311, 'POST', '/api/shutdown');
      expect(stopRes.status).toBe(200);
      expect(stopRes.data.ok).toBe(true);

      // รอให้เซิร์ฟเวอร์ปิดตัวลงจริง
      await new Promise((r) => setTimeout(r, 400));
      let serverStillUp = false;
      try {
        await httpRequest(4311, 'GET', '/api/health');
        serverStillUp = true;
      } catch {
        serverStillUp = false;
      }
      expect(serverStillUp).toBe(false);

      // ย้ายโฟลเดอร์ทั้งหมดจาก dirA ไปยัง dirB (จำลองการย้ายโฟลเดอร์ไปที่อื่น/เครื่องอื่น)
      fs.renameSync(dirA, dirB);
      expect(fs.existsSync(path.join(dirB, 'data', 'worklog.db'))).toBe(true);

      // เปิดโปรแกรมใหม่จากโฟลเดอร์ dirB
      const run3 = spawnSync(runtimeNode, [path.join(dirB, 'app', 'launcher.mjs')], {
        cwd: dirB,
        env: { ...cleanEnv, WORKLOG_ROOT: dirB },
        encoding: 'utf8',
      });
      expect(run3.status).toBe(0);

      // ตรวจว่าข้อมูลที่บันทึกไว้ยังอยู่ครบถ้วน
      const tasksAfterMove = await httpRequest(4311, 'GET', '/api/tasks');
      expect(tasksAfterMove.status).toBe(200);
      expect(tasksAfterMove.data.length).toBe(1);
      expect(tasksAfterMove.data[0].title).toBe('ทดสอบบันทึกงานแบบพกพา');

      // ปิดเซิร์ฟเวอร์รอบสุดท้าย
      await httpRequest(4311, 'POST', '/api/shutdown');
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      dummyServer.close();
      try {
        fs.rmSync(tempBase, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }, 30000);
});

