import { ZodError } from 'zod';

/** Error ที่มีรหัส HTTP และข้อความภาษาไทยสำหรับแสดงผู้ใช้ */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'ข้อมูล') => new AppError(404, `ไม่พบ${what}ที่ต้องการ`);

/** แปลง ZodError เป็นรายการข้อความ { field: message } */
export function zodDetails(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
