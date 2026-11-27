import { z } from 'zod';

/** ค่าคงที่และ Zod schema ที่ใช้ร่วมกันทั้งฝั่ง API และฟอร์ม */

export const STATUSES = ['todo', 'doing', 'review', 'done'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'done', 'cancelled'] as const;
export const PROGRESS_MODES = ['auto', 'manual'] as const;

export type TaskStatus = (typeof STATUSES)[number];
export type TaskPriority = (typeof PRIORITIES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProgressMode = (typeof PROGRESS_MODES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'ยังไม่เริ่ม',
  doing: 'กำลังทำ',
  review: 'รอ ตรวจสอบ/แก้ไข',
  done: 'เสร็จแล้ว',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'ต่ำ',
  medium: 'ปานกลาง',
  high: 'สูง',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'กำลังวางแผน',
  active: 'กำลังดำเนินการ',
  on_hold: 'พักไว้ชั่วคราว',
  done: 'เสร็จแล้ว',
  cancelled: 'ยกเลิก',
};

export const PROGRESS_MODE_LABEL: Record<ProgressMode, string> = {
  auto: 'คำนวณอัตโนมัติจากงานย่อย',
  manual: 'กำหนดเปอร์เซ็นต์เอง',
};

export const PROJECT_COLORS = [
  '#0044CC',
  '#0284C7',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#DB2777',
  '#475569',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** ตรวจว่าเป็นวันที่จริงตามปฏิทิน (เช่น 2026-02-30 ไม่ผ่าน) */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const dateString = z
  .string({ required_error: 'กรุณาระบุวันที่', invalid_type_error: 'รูปแบบวันที่ไม่ถูกต้อง' })
  .refine(isRealDate, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD และเป็นวันที่ที่มีอยู่จริง');

export const monthString = z.string().regex(MONTH_RE, 'รูปแบบเดือนต้องเป็น YYYY-MM');

/** แปลงสตริงว่างให้เป็น null สำหรับช่องที่ไม่บังคับ */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined || v === 0 || v === '0' ? null : Number(v)),
  z.number().int().positive().nullable().optional(),
);

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label}ยาวเกิน ${max} ตัวอักษร`).nullable().optional(),
  );

const optionalLink = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(1000, 'ลิงก์ยาวเกินไป')
    .nullable()
    .optional(),
);

export const taskInputSchema = z
  .object({
    title: z
      .string({ required_error: 'กรุณากรอกชื่องาน' })
      .trim()
      .min(1, 'กรุณากรอกชื่องาน')
      .max(200, 'ชื่องานยาวเกิน 200 ตัวอักษร'),
    description: optionalText(5000, 'รายละเอียด'),
    work_date: dateString,
    work_end_date: z.preprocess(emptyToNull, dateString.nullable().optional()),
    due_date: z.preprocess(emptyToNull, dateString.nullable().optional()),
    category: optionalText(100, 'หมวดหมู่'),
    priority: z.enum(PRIORITIES, { errorMap: () => ({ message: 'ความสำคัญไม่ถูกต้อง' }) }).default('medium'),
    status: z.enum(STATUSES, { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) }).default('todo'),
    result_note: optionalText(5000, 'ผลลัพธ์/หมายเหตุ'),
    evidence_link: optionalLink,
    project_id: optionalId,
    milestone_id: optionalId,
  })
  .refine((d) => !d.work_end_date || d.work_end_date >= d.work_date, {
    message: 'วันสิ้นสุดงานต้องไม่ก่อนวันที่เริ่มทำงาน',
    path: ['work_end_date'],
  });

export type TaskInput = z.input<typeof taskInputSchema>;
export type TaskInputParsed = z.output<typeof taskInputSchema>;

export const statusUpdateSchema = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) }),
});

export const postponeSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'กรุณาเลือกงานอย่างน้อย 1 งาน'),
});

export const DELETE_CONFIRM_PASSWORD = 'P@ssw0rd*';

export const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'กรุณาเลือกงานอย่างน้อย 1 งาน'),
  password: z.string({ required_error: 'กรุณากรอกรหัสผ่านยืนยันการลบ' }).min(1, 'กรุณากรอกรหัสผ่านยืนยันการลบ'),
});

export const taskFilterSchema = z.object({
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  status: z.enum(STATUSES).optional(),
  category: z.string().trim().max(100).optional(),
  q: z.string().trim().max(200).optional(),
  pending: z.enum(['1', 'true']).optional(),
  project_id: z.string().optional(),
  milestone_id: z.string().optional(),
});
export type TaskFilter = z.infer<typeof taskFilterSchema>;

export const categoryInputSchema = z.object({
  name: z.string({ required_error: 'กรุณากรอกชื่อหมวดหมู่' }).trim().min(1, 'กรุณากรอกชื่อหมวดหมู่').max(100, 'ชื่อหมวดหมู่ยาวเกิน 100 ตัวอักษร'),
});

/** Schema สำหรับโปรเจกต์ระยะยาว */
export const projectInputSchema = z
  .object({
    name: z
      .string({ required_error: 'กรุณากรอกชื่อโปรเจกต์' })
      .trim()
      .min(1, 'กรุณากรอกชื่อโปรเจกต์')
      .max(200, 'ชื่อโปรเจกต์ยาวเกิน 200 ตัวอักษร'),
    description: optionalText(5000, 'รายละเอียดโปรเจกต์'),
    start_date: dateString,
    target_end_date: z.preprocess(emptyToNull, dateString.nullable().optional()),
    status: z.enum(PROJECT_STATUSES, { errorMap: () => ({ message: 'สถานะโปรเจกต์ไม่ถูกต้อง' }) }).default('active'),
    color: z.string().regex(COLOR_RE, 'รหัสสีต้องเป็น #RRGGBB').default('#0044CC'),
    progress_mode: z.enum(PROGRESS_MODES).default('auto'),
    manual_progress: z.coerce.number().int().min(0, 'ความคืบหน้าต้องอยู่ระหว่าง 0-100').max(100, 'ความคืบหน้าต้องอยู่ระหว่าง 0-100').default(0),
  })
  .refine((d) => !d.target_end_date || d.target_end_date >= d.start_date, {
    message: 'วันกำหนดเสร็จต้องไม่ก่อนวันเริ่มโปรเจกต์',
    path: ['target_end_date'],
  });

export type ProjectInput = z.input<typeof projectInputSchema>;
export type ProjectInputParsed = z.output<typeof projectInputSchema>;

export const projectDeleteActionSchema = z.enum(['unlink', 'delete']).default('unlink');
export type ProjectDeleteAction = z.infer<typeof projectDeleteActionSchema>;
export type ProjectTaskDeleteAction = ProjectDeleteAction;

/** Schema สำหรับ Milestone */
export const milestoneInputSchema = z.object({
  title: z
    .string({ required_error: 'กรุณากรอกชื่อ Milestone' })
    .trim()
    .min(1, 'กรุณากรอกชื่อ Milestone')
    .max(200, 'ชื่อ Milestone ยาวเกิน 200 ตัวอักษร'),
  description: optionalText(3000, 'รายละเอียด Milestone'),
  due_date: z.preprocess(emptyToNull, dateString.nullable().optional()),
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'สถานะ Milestone ไม่ถูกต้อง' }) }).default('todo'),
  sort_order: z.coerce.number().int().default(0),
});

export type MilestoneInput = z.input<typeof milestoneInputSchema>;
export type MilestoneInputParsed = z.output<typeof milestoneInputSchema>;

/** Schema สำหรับบันทึกความคืบหน้ารายเดือนของโปรเจกต์ (เฟส 2) */
export const projectUpdateInputSchema = z.object({
  period: monthString,
  summary: z
    .string({ required_error: 'กรุณาระบุสิ่งที่ทำในเดือนนี้' })
    .trim()
    .min(1, 'กรุณาระบุสิ่งที่ทำในเดือนนี้')
    .max(5000, 'เนื้อหายาวเกิน 5000 ตัวอักษร'),
  issues: optionalText(5000, 'ปัญหา/อุปสรรค'),
  next_plan: optionalText(5000, 'แผนเดือนหน้า'),
});

export type ProjectUpdateInput = z.input<typeof projectUpdateInputSchema>;
export type ProjectUpdateInputParsed = z.output<typeof projectUpdateInputSchema>;

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const ACCENT_COLORS = ['blue', 'indigo', 'purple', 'teal', 'orange'] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const THAI_FONTS = ['anuphan', 'noto-sans-thai', 'ibm-plex-sans-thai-looped'] as const;
export type ThaiFont = (typeof THAI_FONTS)[number];

export const settingsSchema = z.object({
  yearFormat: z.enum(['BE', 'CE']),
  theme: z.enum(THEME_MODES).default('light'),
  accentColor: z.enum(ACCENT_COLORS).default('blue'),
  thaiFont: z.enum(THAI_FONTS).default('anuphan'),
});
export type Settings = z.infer<typeof settingsSchema>;

/** ข้อมูลงานที่ส่งกลับจาก API */
export interface Task {
  id: number;
  title: string;
  description: string | null;
  work_date: string;
  work_end_date?: string | null;
  due_date: string | null;
  category: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  result_note: string | null;
  evidence_link: string | null;
  project_id?: number | null;
  milestone_id?: number | null;
  project_name?: string | null;
  project_color?: string | null;
  milestone_title?: string | null;
  created_at: string;
  updated_at: string;
  /** แจ้งเตือนฝั่งหน้าเว็บเมื่อทำางานสุดท้ายใน Milestone เสร็จ */
  promptCompleteMilestone?: {
    id: number;
    title: string;
    project_id: number;
  } | null;
}

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MilestoneWithStats extends Milestone {
  total_tasks: number;
  done_tasks: number;
  progress: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  start_date: string;
  target_end_date: string | null;
  actual_end_date: string | null;
  status: ProjectStatus;
  color: string;
  progress_mode: ProgressMode;
  manual_progress: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectUpdate {
  id: number;
  project_id: number;
  period: string;
  summary: string;
  issues: string | null;
  next_plan: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  total_tasks: number;
  done_tasks: number;
  auto_progress: number;
  progress: number;
  total_milestones: number;
  done_milestones: number;
  next_milestone: MilestoneWithStats | null;
  last_activity_at: string;
  is_overdue: boolean;
  is_stale: boolean;
  days_remaining: number | null;
}

export interface ProjectDetail extends ProjectWithStats {
  milestones: MilestoneWithStats[];
  tasks: Task[];
  updates: ProjectUpdate[];
}

export interface Category {
  id: number;
  name: string;
  task_count?: number;
}

export interface DashboardData {
  today: string;
  todayTasks: Task[];
  counts: { total: number; done: number; notDone: number; doing: number; review?: number; todo: number };
  todayCounts: { total: number; done: number; notDone: number };
  dueSoon: Task[];
  overdue: Task[];
  /** งานที่วันที่ทำงานผ่านไปแล้วแต่ยังไม่เสร็จ */
  carryOver: Task[];
  /** โปรเจกต์ที่กำลังทำ (active) */
  activeProjects: ProjectWithStats[];
  /** Milestone ที่ใกล้ถึงกำหนดหรือเลยกำหนด */
  upcomingMilestones: (MilestoneWithStats & { project_name: string; project_color: string })[];
  /** โปรเจกต์นิ่ง (ไม่มีความเคลื่อนไหวเกิน 14 วัน หรือใกล้กำหนดเสร็จภายใน 7 วัน) */
  staleOrUrgentProjects: (ProjectWithStats & { alertReason: 'stale' | 'due_soon' | 'overdue' })[];
}

export interface CalendarDay {
  date: string;
  total: number;
  todo: number;
  doing: number;
  review?: number;
  done: number;
  overdue: number;
}

export interface CategorySummary {
  category: string;
  planned: number;
  plannedDone: number;
  pending: number;
  completedInMonth: number;
}

export interface MonthlyProjectReport {
  project: ProjectWithStats;
  /** % ความคืบหน้า ณ สิ้นเดือนที่เลือก */
  progressAtEndOfMonth: number;
  /** % ความคืบหน้า ณ สิ้นเดือนก่อนหน้า */
  progressAtPrevMonth: number;
  /** % ที่เพิ่มขึ้นในเดือนนี้ */
  progressDelta: number;
  /** งานย่อยของโปรเจกต์ที่ทำเสร็จในเดือนนั้น */
  completedTasks: Task[];
  /** งานย่อยของโปรเจกต์ที่วางแผนหรือกำลังทำแต่ยังไม่เสร็จ */
  pendingTasks: Task[];
  /** Milestone ที่ถึงเป้า (completed_at หรือครบกำหนด/เสร็จ) ในเดือนนั้น */
  completedMilestones: MilestoneWithStats[];
  /** บันทึกความคืบหน้าประจำเดือนนั้น (ถ้ามี) */
  update: ProjectUpdate | null;
}

export interface MonthlyReport {
  month: string;
  generatedAt: string;
  today: string;
  summary: {
    planned: number;
    completedInMonth: number;
    plannedDone: number;
    pending: number;
    overdue: number;
    successRate: number;
  };
  byCategory: CategorySummary[];
  completed: Task[];
  pending: Task[];
  plannedDoneElsewhere: Task[];
  /** งานทั่วไปที่ไม่ผูกกับโปรเจกต์ */
  generalCompleted: Task[];
  generalPending: Task[];
  /** รายงานความคืบหน้าโปรเจกต์ระยะยาวในเดือนนั้น */
  projectReports: MonthlyProjectReport[];
}

/** รูปแบบไฟล์สำรองข้อมูล (รองรับทั้งไฟล์รุ่นเก่าและรุ่นใหม่ที่มีโปรเจกต์) */
const backupTaskSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  work_date: dateString,
  work_end_date: dateString.nullable().optional(),
  due_date: dateString.nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
  completed_at: z.string().nullable().optional(),
  result_note: z.string().nullable().optional(),
  evidence_link: z.string().nullable().optional(),
  project_id: z.number().int().nullable().optional(),
  milestone_id: z.number().int().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const backupProjectSchema = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  start_date: dateString,
  target_end_date: dateString.nullable().optional(),
  actual_end_date: dateString.nullable().optional(),
  status: z.enum(PROJECT_STATUSES).default('active'),
  color: z.string().default('#0044CC'),
  progress_mode: z.enum(PROGRESS_MODES).default('auto'),
  manual_progress: z.number().int().min(0).max(100).default(0),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const backupMilestoneSchema = z.object({
  id: z.number().int(),
  project_id: z.number().int(),
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  due_date: dateString.nullable().optional(),
  status: z.enum(STATUSES).default('todo'),
  completed_at: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const backupProjectUpdateSchema = z.object({
  id: z.number().int().optional(),
  project_id: z.number().int(),
  period: monthString,
  summary: z.string().trim().min(1),
  issues: z.string().nullable().optional(),
  next_plan: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const backupSchema = z.object({
  app: z.literal('worklog-local'),
  version: z.number().int(),
  exportedAt: z.string(),
  tasks: z.array(backupTaskSchema),
  categories: z.array(z.object({ name: z.string().trim().min(1).max(100) })).default([]),
  projects: z.array(backupProjectSchema).default([]),
  milestones: z.array(backupMilestoneSchema).default([]),
  project_updates: z.array(backupProjectUpdateSchema).default([]),
  settings: z.record(z.string()).optional(),
});
export type BackupFile = z.infer<typeof backupSchema>;

export const importModeSchema = z.enum(['merge', 'replace']);
export type ImportMode = z.infer<typeof importModeSchema>;
