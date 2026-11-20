// "이번 주 등교 기록 0건" 경고: 이번 주(월~)에 지나간 평일이 하루라도 있는데(그날 10:00이 지나야 셈) 기록이 하나도 없으면.
// 아이알리미 → MacroDroid → 대시보드 연결이 끊긴 것을 보호자가 알아채게 하려는 것.
import { parseHm, shiftDate, weekdayOf, weekStartOf, type KstNow } from './time.ts';

export const WARN_AFTER = '10:00';

export function schoolWarning(now: Pick<KstNow, 'date' | 'minutes'>, recordDates: string[]): { warn: boolean; weekdays: number; records: number } {
  const mon = weekStartOf(now.date);
  let weekdays = 0;
  for (let i = 0; i < 5; i++) {
    const d = shiftDate(mon, i);
    if (d < now.date || (d === now.date && now.minutes >= parseHm(WARN_AFTER))) weekdays += 1;
  }
  const records = new Set(recordDates.filter(d => d >= mon && d <= now.date && weekdayOf(d) >= 1 && weekdayOf(d) <= 5)).size;
  return { warn: weekdays >= 1 && records === 0, weekdays, records };
}
