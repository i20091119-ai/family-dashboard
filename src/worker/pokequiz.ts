// 포켓퀴즈 연결 (docs/family-api.md). 읽기 GET /api/family, 보내기는 제때 등교 하나(POST /api/family/events)뿐.
// 포켓퀴즈 기록 저장소는 절대 직접 건드리지 않습니다.
import type { Env } from './env.ts';
import { getSetting } from './store.ts';

export type PqPlayer = 'family' | 'sim';
export const PQ_REAL = 'https://poke-quiz.gnmc-swteacher.workers.dev';
export const PQ_PREVIEW = 'https://poke-quiz-preview.gnmc-swteacher.workers.dev';

export async function pqConfig(env: Env) {
  const [url, code] = await Promise.all([getSetting(env, 'pq_url'), getSetting(env, 'pq_code')]);
  return { url: (url || PQ_REAL).replace(/\/+$/, ''), code: code ?? '' };
}

const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 45_000;

/** 포켓퀴즈 요약 읽기 (45초 동안은 같은 답) */
export async function readFamily(env: Env, player: PqPlayer): Promise<{ data: PqFamily | null; error: string | null; base: string }> {
  const { url, code } = await pqConfig(env);
  if (!code) return { data: null, error: '포켓퀴즈 접속 코드를 아직 넣지 않았어요 (⚙️ 설정).', base: url };
  const key = `${url}|${player}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { data: hit.data as PqFamily, error: null, base: url };
  try {
    const res = await fetch(`${url}/api/family${player === 'sim' ? '?player=sim' : ''}`, { headers: { Authorization: `Bearer ${code}` } });
    if (res.status === 401) return { data: null, error: '포켓퀴즈 접속 코드가 맞지 않아요 (⚙️ 설정).', base: url };
    if (!res.ok) return { data: (hit?.data as PqFamily) ?? null, error: `포켓퀴즈가 응답하지 않아요 (${res.status}).`, base: url };
    const data = await res.json() as PqFamily;
    cache.set(key, { at: Date.now(), data });
    return { data, error: null, base: url };
  } catch {
    return { data: (hit?.data as PqFamily) ?? null, error: '포켓퀴즈에 연결하지 못했어요.', base: url };
  }
}

export type SendResult = { ok: true; status: string; good: boolean | null; deadline: string | null; message: string } | { ok: false; error: string; retry: boolean };

/** 제때 등교 보내기 (판정은 포켓퀴즈가 함) */
export async function sendArrival(env: Env, player: PqPlayer, date: string, time: string): Promise<SendResult> {
  const { url, code } = await pqConfig(env);
  if (!code) return { ok: false, error: '포켓퀴즈 접속 코드가 없어요.', retry: true };
  try {
    const res = await fetch(`${url}/api/family/events${player === 'sim' ? '?player=sim' : ''}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'onTimeArrival', date, time }),
    });
    const body = await res.json().catch(() => ({})) as { status?: string; ok?: boolean; deadline?: string; message?: string; error?: string };
    if (res.status === 400) return { ok: false, error: body.error ?? '포켓퀴즈가 받지 않았어요.', retry: false };
    if (!res.ok) return { ok: false, error: body.error ?? `포켓퀴즈 응답 ${res.status}`, retry: true };
    for (const k of cache.keys()) if (k.endsWith('|' + player)) cache.delete(k);
    return { ok: true, status: body.status ?? 'recorded', good: typeof body.ok === 'boolean' ? body.ok : null, deadline: body.deadline ?? null, message: body.message ?? '' };
  } catch {
    return { ok: false, error: '포켓퀴즈에 연결하지 못했어요.', retry: true };
  }
}

type Img = { art: string; pixel: string };
export type PqFamily = {
  player: PqPlayer; today: string; now: string;
  partner: { species: number; name: string; shiny: boolean; image: Img } | null;
  dailyMission: { date: string; started: boolean; done: boolean; answered: number; total: number; correct: number; review: boolean };
  training: { weekStart: string; days: { date: string; dow: string; mark: string | null; symbol: string | null; future: boolean }[]; score: number; goal: number; reached: boolean; unopenedBoxes: number };
  village: import('../shared/village.ts').FamilyVillage;
  school: { today: { time: string; ok: boolean; deadline: string; source: string } | null; deadlineToday: string; recent: { date: string; time: string; ok: boolean; deadline?: string; source?: string }[] };
};
