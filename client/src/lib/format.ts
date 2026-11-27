import { dayjs, TZ } from '@shared/dates';

export type YearFormat = 'BE' | 'CE';

/** รูปแบบปีตามการตั้งค่า (BBBB = พ.ศ. จาก plugin buddhistEra) */
const Y = (yf: YearFormat, short = false) => (yf === 'BE' ? (short ? 'BB' : 'BBBB') : short ? 'YY' : 'YYYY');

/** เช่น "4 พฤศจิกายน 2569" */
export function formatDate(date: string | null | undefined, yf: YearFormat): string {
  if (!date) return '-';
  return dayjs(date).format(`D MMMM ${Y(yf)}`);
}

/** เช่น "4 พ.ย. 69" */
export function formatDateShort(date: string | null | undefined, yf: YearFormat): string {
  if (!date) return '-';
  return dayjs(date).format(`D MMM ${Y(yf, true)}`);
}

/** เช่น "วันพุธที่ 4 พฤศจิกายน พ.ศ. 2569" */
export function formatDateFull(date: string, yf: YearFormat): string {
  const d = dayjs(date);
  const era = yf === 'BE' ? 'พ.ศ.' : 'ค.ศ.';
  return `วัน${d.format('dddd')}ที่ ${d.format('D MMMM')} ${era} ${d.format(Y(yf))}`;
}

/** วันเวลาจาก ISO เช่น "4 พ.ย. 2569 13:15 น." */
export function formatDateTime(iso: string | null | undefined, yf: YearFormat): string {
  if (!iso) return '-';
  const d = dayjs(iso).tz(TZ);
  return `${d.format(`D MMM ${Y(yf)}`)} ${d.format('HH:mm')} น.`;
}

/** ชื่อเดือนและปี เช่น "พฤศจิกายน 2569" */
export function formatMonth(month: string, yf: YearFormat): string {
  return dayjs(`${month}-01`).format(`MMMM ${Y(yf)}`);
}

export function yearLabel(year: number, yf: YearFormat): string {
  return yf === 'BE' ? `พ.ศ. ${year + 543}` : `ค.ศ. ${year}`;
}

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** ระยะห่างจากวันนี้เป็นข้อความ เช่น "วันนี้", "อีก 2 วัน", "เลยมา 3 วัน" */
export function relativeDue(due: string, today: string): string {
  const diff = dayjs(due).diff(dayjs(today), 'day');
  if (diff === 0) return 'ครบกำหนดวันนี้';
  if (diff === 1) return 'ครบกำหนดพรุ่งนี้';
  if (diff > 1) return `อีก ${diff} วัน`;
  return `เลยกำหนด ${-diff} วัน`;
}

export function shiftMonth(month: string, delta: number): string {
  return dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM');
}
