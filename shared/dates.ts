import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import buddhistEra from 'dayjs/plugin/buddhistEra.js';
import 'dayjs/locale/th.js';

/** ตั้งค่า dayjs ให้ใช้เขตเวลา Asia/Bangkok ทั้งระบบ */
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(buddhistEra);
dayjs.locale('th');

export const TZ = 'Asia/Bangkok';
dayjs.tz.setDefault(TZ);

export { dayjs };

/** วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD */
export function todayStr(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}

/** เวลาปัจจุบันแบบ ISO 8601 พร้อม offset +07:00 */
export function nowIso(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DDTHH:mm:ssZ');
}

/** แปลงเวลา ISO ใดๆ ให้อยู่ในรูป ISO เขตเวลาไทย (คืน null หากรูปแบบผิด) */
export function toBangkokIso(value: string): string | null {
  const d = dayjs(value);
  if (!d.isValid()) return null;
  return d.tz(TZ).format('YYYY-MM-DDTHH:mm:ssZ');
}

/** บวกวันให้วันที่รูปแบบ YYYY-MM-DD */
export function addDays(date: string, days: number): string {
  return dayjs(date, 'YYYY-MM-DD').add(days, 'day').format('YYYY-MM-DD');
}

/** ช่วงวันแรก/วันสุดท้ายของเดือน YYYY-MM */
export function monthRange(month: string): { start: string; end: string } {
  const d = dayjs(`${month}-01`);
  return { start: d.format('YYYY-MM-DD'), end: d.endOf('month').format('YYYY-MM-DD') };
}

export function currentMonth(): string {
  return dayjs().tz(TZ).format('YYYY-MM');
}
