import type {
  BackupFile,
  CalendarDay,
  Category,
  DashboardData,
  ImportMode,
  MilestoneInput,
  MilestoneWithStats,
  MonthlyReport,
  ProjectDeleteAction,
  ProjectDetail,
  ProjectInput,
  ProjectStatus,
  ProjectUpdate,
  ProjectUpdateInput,
  ProjectWithStats,
  Settings,
  Task,
  TaskFilter,
  TaskInput,
  TaskStatus,
} from '@shared/schemas';

/** Error จาก API พร้อมข้อความภาษาไทยและรายละเอียดรายช่อง */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจว่าโปรแกรมยังเปิดอยู่', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error ?? `เกิดข้อผิดพลาด (${res.status})`, res.status, data?.details);
  }
  return data as T;
}

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  listTasks: (f: TaskFilter = {}) => request<Task[]>('GET', `/api/tasks${qs(f as Record<string, string>)}`),
  getTask: (id: number) => request<Task>('GET', `/api/tasks/${id}`),
  createTask: (input: TaskInput) => request<Task>('POST', '/api/tasks', input),
  updateTask: (id: number, input: TaskInput) => request<Task>('PUT', `/api/tasks/${id}`, input),
  setStatus: (id: number, status: TaskStatus) => request<Task>('PATCH', `/api/tasks/${id}/status`, { status }),
  deleteTask: (id: number) => request<void>('DELETE', `/api/tasks/${id}`),
  bulkDeleteTasks: (ids: number[], password: string) =>
    request<{ deleted: number }>('POST', '/api/tasks/bulk-delete', { ids, password }),
  postpone: (ids: number[]) => request<{ updated: Task[]; skipped: number[] }>('POST', '/api/tasks/postpone', { ids }),

  listProjects: (status?: ProjectStatus) =>
    request<ProjectWithStats[]>('GET', `/api/projects${qs({ status })}`),
  getProject: (id: number) => request<ProjectDetail>('GET', `/api/projects/${id}`),
  createProject: (input: ProjectInput) => request<ProjectWithStats>('POST', '/api/projects', input),
  updateProject: (id: number, input: ProjectInput) => request<ProjectWithStats>('PUT', `/api/projects/${id}`, input),
  deleteProject: (id: number, taskAction: ProjectDeleteAction) =>
    request<{ deletedTasks: number; unlinkedTasks: number }>('DELETE', `/api/projects/${id}?taskAction=${taskAction}`),
  cloneProject: (id: number, name?: string, start_date?: string) =>
    request<ProjectDetail>('POST', `/api/projects/${id}/clone`, { name, start_date }),

  listMilestones: (projectId: number) =>
    request<MilestoneWithStats[]>('GET', `/api/projects/${projectId}/milestones`),
  createMilestone: (projectId: number, input: MilestoneInput) =>
    request<MilestoneWithStats>('POST', `/api/projects/${projectId}/milestones`, input),
  updateMilestone: (milestoneId: number, input: MilestoneInput) =>
    request<MilestoneWithStats>('PUT', `/api/projects/milestones/${milestoneId}`, input),
  setMilestoneStatus: (milestoneId: number, status: TaskStatus) =>
    request<MilestoneWithStats>('PATCH', `/api/projects/milestones/${milestoneId}/status`, { status }),
  deleteMilestone: (milestoneId: number) =>
    request<void>('DELETE', `/api/projects/milestones/${milestoneId}`),

  listProjectUpdates: (projectId: number) =>
    request<ProjectUpdate[]>('GET', `/api/projects/${projectId}/updates`),
  saveProjectUpdate: (projectId: number, input: ProjectUpdateInput) =>
    request<ProjectUpdate>('PUT', `/api/projects/${projectId}/updates`, input),
  deleteProjectUpdate: (projectId: number, period: string) =>
    request<void>('DELETE', `/api/projects/${projectId}/updates/${period}`),

  dashboard: () => request<DashboardData>('GET', '/api/dashboard'),
  calendar: (month: string) => request<CalendarDay[]>('GET', `/api/calendar?month=${month}`),
  monthlyReport: (month: string) => request<MonthlyReport>('GET', `/api/reports/monthly?month=${month}`),

  listCategories: () => request<Category[]>('GET', '/api/categories'),
  createCategory: (name: string) => request<Category>('POST', '/api/categories', { name }),
  renameCategory: (id: number, name: string) => request<Category>('PUT', `/api/categories/${id}`, { name }),
  deleteCategory: (id: number) => request<{ affectedTasks: number }>('DELETE', `/api/categories/${id}`),

  getSettings: () => request<Settings>('GET', '/api/settings'),
  updateSettings: (s: Settings) => request<Settings>('PUT', '/api/settings', s),
  seedSample: () => request<{ inserted: number; from: string; to: string; projectsInserted?: number }>('POST', '/api/sample-data'),

  exportBackup: () => request<BackupFile>('GET', '/api/backup'),
  importBackup: (data: unknown, mode: ImportMode) =>
    request<{ importedTasks: number; importedCategories: number; importedProjects: number }>('POST', '/api/backup/import', { mode, data }),

  health: () => request<{ ok: boolean; app: string; pid: number; port: number; dbPath: string }>('GET', '/api/health'),
  shutdown: () => request<{ ok: boolean; message: string }>('POST', '/api/shutdown'),
};
