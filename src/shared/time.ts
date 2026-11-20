// 시간 계산 (모두 한국 시간). 서버와 화면이 같이 씁니다.

export type KstNow = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS */
  time: string;
  /** 0시부터 지난 분 */
  minutes: number;
  /** 0 = 일요일 … 6 = 토요일 */
  weekday: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 진짜 시각(ms) → 한국 시각 */
export function kstOf(ms: number): KstNow {
  const d = new Date(ms + 9 * 3600_000);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return { date, time, minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}

/** 한국 날짜·시각 → 진짜 시각(ms) */
export function msOfKst(date: string, hm: string): number {
  const [h, m, s] = hm.split(':').map(Number);
  return Date.parse(`${date}T00:00:00Z`) - 9 * 3600_000 + ((h * 60 + m) * 60 + (s || 0)) * 1000;
}

export const hm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const parseHm = (text: string) => { const [h, m] = text.split(':').map(Number); return h * 60 + m; };

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
/** 그 주 월요일 */
export const weekStartOf = (date: string) => shiftDate(date, -((weekdayOf(date) + 6) % 7));
export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- 시간대별 화면 ----------
export const MORNING = { start: '07:30', end: '08:30' };
export const HOME = { start: '17:00', end: '22:00' };
/** 아침 단계 (끝낼 시각) */
export const MORNING_STEPS = [
  { key: 'meal', label: '밥', until: '08:15', emoji: '🍚' },
  { key: 'wash', label: '세수·양치', until: '08:20', emoji: '🪥' },
  { key: 'dress', label: '옷·머리·로션', until: '08:25', emoji: '👕' },
  { key: 'bag', label: '가방 메고 현관', until: '08:28', emoji: '🎒' },
] as const;
/** 하준 그림 버튼 */
export const HAJUN_STEPS = [
  { key: 'meal', label: '밥', emoji: '🍚' },
  { key: 'brush', label: '양치', emoji: '🪥' },
  { key: 'dress', label: '옷', emoji: '👕' },
  { key: 'lotion', label: '로션', emoji: '🧴' },
  { key: 'bag', label: '가방', emoji: '🎒' },
] as const;
export type Who = 'seojun' | 'hajun';
export const stepKeys = (who: Who): string[] => (who === 'seojun' ? MORNING_STEPS : HAJUN_STEPS).map(s => s.key);

export type Mode = 'morning' | 'home' | 'dark';
const isWeekday = (w: number) => w >= 1 && w <= 5;
/** 지금 보여 줄 화면: 평일 07:30–08:30 아침, 17:00–22:00 홈, 그 외 어두운 화면 */
export function modeAt(now: Pick<KstNow, 'minutes' | 'weekday'>): Mode {
  if (isWeekday(now.weekday) && now.minutes >= parseHm(MORNING.start) && now.minutes < parseHm(MORNING.end)) return 'morning';
  if (now.minutes >= parseHm(HOME.start) && now.minutes < parseHm(HOME.end)) return 'home';
  return 'dark';
}
