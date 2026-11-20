// 아이알리미 알림 문구 읽기.
// 예: "이서준 학생이 11/19 08:46에 교문[후문]으로 등교하였습니다"
// "등교"가 든 알림만 받고(하교는 무시), 문구 속 날짜·시각만 꺼냅니다. 알림 원문은 어디에도 저장하지 않습니다.
import { shiftDate } from './time.ts';

export type Arrival = { date: string; time: string };
export type ParseResult = { ok: true; arrival: Arrival } | { ok: false; reason: string };

/** today = 한국 오늘 (문구에 연도가 없어서 올해/작년을 고를 때 씀) */
export function parseAlimi(text: string, today: string): ParseResult {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, reason: '문구가 비어 있어요.' };
  if (t.includes('하교')) return { ok: false, reason: '하교 알림이라 건너뛰었어요.' };
  if (!t.includes('등교')) return { ok: false, reason: '"등교"가 없는 알림이라 건너뛰었어요.' };
  const tm = t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (!tm) return { ok: false, reason: '문구에서 시각을 찾지 못했어요.' };
  const h = Number(tm[1]), m = Number(tm[2]);
  if (h > 23 || m > 59) return { ok: false, reason: '시각이 이상해요.' };
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  // 날짜: 11/19, 11.19, 11월 19일 (없으면 오늘)
  const dm = t.match(/(\d{1,2})\s*[/.]\s*(\d{1,2})(?!\s*:)/) ?? t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  let date = today;
  if (dm) {
    const mo = Number(dm[1]), d = Number(dm[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { ok: false, reason: '날짜가 이상해요.' };
    let year = Number(today.slice(0, 4));
    const candidate = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // 1월에 받은 12월 알림 = 작년
    if (candidate > shiftDate(today, 1)) year -= 1;
    date = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return { ok: true, arrival: { date, time } };
}
