export const MONTHS = ['Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым', 'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'];
export const MONTHS_GEN = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
export const WEEKDAYS = ['Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі'];
export const WEEKDAYS_SHORT = ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Қазақстан уақыты бойынша бүгінгі күн, YYYY-MM-DD */
export function todayISO(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Almaty' }));
  return toISO(now);
}
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
/** Екі күн арасындағы күндер саны */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}
export function mondayOf(s: string): string {
  const d = parseISO(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISO(d);
}
export function weekdayIndex(s: string): number {
  return (parseISO(s).getDay() + 6) % 7;
}
/** «15 қараша, сенбі» */
export function longDate(s: string, withWeekday = true): string {
  const d = parseISO(s);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return withWeekday ? `${base}, ${WEEKDAYS[weekdayIndex(s)].toLowerCase()}` : base;
}
/** «15.11.2026» */
export function shortDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = s.length > 10 ? new Date(s) : parseISO(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export function dateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function weekRange(start: string): string {
  const a = parseISO(start);
  const b = parseISO(addDays(start, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}
export function relativeTime(s: string | null | undefined): string {
  if (!s) return 'Белсенділік жоқ';
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'Жаңа ғана';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин бұрын`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} сағ бұрын`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} күн бұрын`;
  return shortDate(s);
}
export function minutesLabel(min: number): string {
  if (!min) return '0 мин';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} сағ ${m} мин` : `${h} сағ`;
}
export function durationLabel(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}
/** Ай торы: дүйсенбіден басталатын 6 апта */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = mondayOf(toISO(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/* ---------- Тапсырма кезеңі: ай және айдың аптасы ----------
 * 1-апта = 1–7, 2-апта = 8–14, 3-апта = 15–21, 4-апта = 22–28,
 * 5-апта = 29–айдың соңы (тек 28 күннен ұзақ айларда). Деректер базасындағы
 * `period_week_range` функциясымен бірдей ереже. */
export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function weeksInMonth(year: number, month: number) {
  return daysInMonth(year, month) > 28 ? 5 : 4;
}
export function periodWeekDays(year: number, month: number, week: number) {
  const start = (week - 1) * 7 + 1;
  return { start, end: Math.min(start + 6, daysInMonth(year, month)) };
}
export function periodWeekLabel(year: number, month: number, week: number) {
  const { start, end } = periodWeekDays(year, month, week);
  return `${week}-апта (${start === end ? start : `${start}–${end}`} ${MONTHS_GEN[month - 1]})`;
}
export function periodOf(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, week: Math.min(5, Math.ceil(d / 7)) };
}
export function periodShort(p: { period_year: number; period_month: number; period_week: number }) {
  return `${MONTHS[p.period_month - 1]} ${p.period_year}, ${p.period_week}-апта`;
}
