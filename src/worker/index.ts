// 가족 대시보드 서버 (Cloudflare Worker + D1).
// 화면 파일(public/)은 정적으로, /api/* 와 /hook/* 만 여기서 처리합니다.
import { schoolWarning } from '../shared/school.ts';
import { HAJUN_STEPS, kstOf, modeAt, MORNING_STEPS, shiftDate, stepKeys, weekStartOf, type Who } from '../shared/time.ts';
import { checkCode, hasCode, isFamily, loginCookie, setCode } from './auth.ts';
import type { Env } from './env.ts';
import { pqConfig, PQ_PREVIEW, PQ_REAL, readFamily, type PqPlayer } from './pokequiz.ts';
import { receiveAlimi, recentArrivals, retryPending } from './school.ts';
import { getSetting, json, randomToken, setSetting } from './store.ts';
import { getWeather } from './weather.ts';

export const PEOPLE = [
  { key: 'mom', name: '엄마', face: '👩' },
  { key: 'dad', name: '아빠', face: '👨' },
  { key: 'grandma', name: '외할머니', face: '👵' },
];
const PEOPLE_KEYS = PEOPLE.map(p => p.key);

/** 이 기기의 시험 시각(개발 메뉴): 진짜 시각에 더할 ms. 0이면 진짜 */
function simOffset(request: Request) {
  const n = Number(request.headers.get('x-sim-offset'));
  return Number.isFinite(n) ? Math.max(-400 * 86400_000, Math.min(400 * 86400_000, Math.round(n))) : 0;
}
const pqPlayerOf = (request: Request): PqPlayer => (request.headers.get('x-pq-player') === 'sim' ? 'sim' : 'family');
/** 시험 중인 기기 = 시험 시각을 쓰거나 포켓퀴즈 시험용 기록을 봄 → 아침 기록도 시험용으로 */
const isSim = (request: Request) => simOffset(request) !== 0 || pqPlayerOf(request) === 'sim';

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 4000) throw new Error('내용이 너무 길어요.');
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

async function hookKey(env: Env) {
  let k = await getSetting(env, 'hook_key');
  if (!k) { k = randomToken(18); await setSetting(env, 'hook_key', k); }
  return k;
}

// ---------- 아침 ----------
async function morningTaps(env: Env, date: string, sim: boolean) {
  const { results } = await env.DB.prepare('SELECT who, step, time FROM morning_taps WHERE date = ? AND sim = ?').bind(date, sim ? 1 : 0).all<{ who: Who; step: string; time: string }>();
  return results;
}

// ---------- 할 일 ----------
async function todoList(env: Env, today: string) {
  // 안 한 것 전부 + 오늘·어제 끝낸 것
  const since = shiftDate(today, -1);
  const { results } = await env.DB.prepare(`SELECT id, kind, text, by, created_at, done_by, done_at FROM todos
    WHERE deleted = 0 AND (done_at IS NULL OR substr(done_at, 1, 10) >= ?) ORDER BY done_at IS NOT NULL, id DESC LIMIT 200`).bind(since).all();
  return results;
}

async function api(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  // 처음 한 번: 가족 접속 코드 정하기
  if (path === '/api/setup' && method === 'POST') {
    if (await hasCode(env)) return json({ error: '이미 코드가 있어요.' }, 400);
    const b = await readBody(request);
    try { await setCode(env, String(b.code ?? '')); } catch (e) { return json({ error: (e as Error).message }, 400); }
    return json({ ok: true }, 200, { 'Set-Cookie': await loginCookie(env, request) });
  }
  if (path === '/api/login' && method === 'POST') {
    const b = await readBody(request);
    if (!(await checkCode(env, String(b.code ?? '')))) return json({ error: '코드가 맞지 않아요.' }, 401);
    return json({ ok: true }, 200, { 'Set-Cookie': await loginCookie(env, request) });
  }
  if (!(await isFamily(env, request))) return json({ error: '가족 접속 코드를 넣어 주세요.', setup: !(await hasCode(env)) }, 401);

  const offset = simOffset(request);
  const now = kstOf(Date.now() + offset);
  const sim = isSim(request);
  const player = pqPlayerOf(request);

  if (path === '/api/state' && method === 'GET') {
    await retryPending(env, kstOf(Date.now()).date).catch(() => undefined);
    const [pq, weather, taps, todos, arrivals] = await Promise.all([
      readFamily(env, player), getWeather(env), morningTaps(env, now.date, sim), todoList(env, now.date), recentArrivals(env, sim, 14),
    ]);
    const dates = [...arrivals.map(a => a.date), ...(pq.data?.school.recent.map(r => r.date) ?? [])];
    return json({
      now: { ms: Date.now() + offset, ...now }, mode: modeAt(now), sim: offset !== 0 ? { offset } : null, pqPlayer: player,
      morning: { taps }, todos, people: PEOPLE, weather,
      pq: pq.data, pqError: pq.error, pqBase: pq.base,
      school: { warning: schoolWarning(now, dates), today: arrivals.find(a => a.date === now.date) ?? null },
    });
  }

  if (path === '/api/morning' && method === 'POST') {
    const b = await readBody(request);
    const who = b.who === 'hajun' ? 'hajun' : b.who === 'seojun' ? 'seojun' : null;
    const step = String(b.step ?? '');
    if (!who || !stepKeys(who).includes(step)) return json({ error: '버튼을 다시 눌러 주세요.' }, 400);
    // 한 번 더 누르면 취소
    const del = await env.DB.prepare('DELETE FROM morning_taps WHERE date = ? AND who = ? AND step = ? AND sim = ?').bind(now.date, who, step, sim ? 1 : 0).run();
    if (del.meta.changes === 0) {
      await env.DB.prepare('INSERT INTO morning_taps (date, who, step, time, at, sim) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(now.date, who, step, now.time, new Date().toISOString(), sim ? 1 : 0).run();
    }
    return json({ taps: await morningTaps(env, now.date, sim) });
  }

  if (path === '/api/todos' && method === 'POST') {
    const b = await readBody(request);
    const by = String(b.by ?? '');
    if (!PEOPLE_KEYS.includes(by)) return json({ error: '얼굴 버튼을 먼저 눌러 주세요.' }, 400);
    const at = new Date(Date.now() + offset).toISOString();
    const id = Number(b.id);
    if (b.op === 'add') {
      const text = String(b.text ?? '').trim().slice(0, 60);
      if (!text) return json({ error: '할 일을 적어 주세요.' }, 400);
      await env.DB.prepare('INSERT INTO todos (kind, text, by, created_at) VALUES (?, ?, ?, ?)').bind(b.kind === 'shop' ? 'shop' : 'todo', text, by, at).run();
    } else if (b.op === 'done') {
      await env.DB.prepare('UPDATE todos SET done_by = ?, done_at = ? WHERE id = ? AND done_at IS NULL').bind(by, at, id).run();
    } else if (b.op === 'undone') {
      await env.DB.prepare('UPDATE todos SET done_by = NULL, done_at = NULL WHERE id = ?').bind(id).run();
    } else if (b.op === 'delete') {
      await env.DB.prepare('UPDATE todos SET deleted = 1 WHERE id = ?').bind(id).run();
    } else return json({ error: '다시 눌러 주세요.' }, 400);
    return json({ todos: await todoList(env, now.date) });
  }

  if (path === '/api/admin' && method === 'GET') {
    const from = shiftDate(now.date, -20);
    const [cfg, key, arrivals, taps] = await Promise.all([
      pqConfig(env), hookKey(env), recentArrivals(env, sim, 30),
      env.DB.prepare('SELECT date, who, step, time FROM morning_taps WHERE date >= ? AND sim = ? ORDER BY date DESC').bind(from, sim ? 1 : 0).all<{ date: string; who: Who; step: string; time: string }>(),
    ]);
    const pq = await readFamily(env, player);
    const dates = [...arrivals.map(a => a.date), ...(pq.data?.school.recent.map(r => r.date) ?? [])];
    return json({
      now, sim, pqPlayer: player,
      pq: { url: cfg.url, hasCode: !!cfg.code, real: PQ_REAL, preview: PQ_PREVIEW, error: pq.error, school: pq.data?.school ?? null },
      hookUrl: `${new URL(request.url).origin}/hook/alimi?k=${key}`,
      arrivals, taps: taps.results, steps: { seojun: MORNING_STEPS, hajun: HAJUN_STEPS },
      warning: schoolWarning(now, dates), weekStart: weekStartOf(now.date), familyCodeFromEnv: !!env.FAMILY_CODE,
    });
  }

  if (path === '/api/admin' && method === 'POST') {
    const b = await readBody(request);
    if (b.op === 'pq') {
      const url = String(b.url ?? '').trim().replace(/\/+$/, '');
      if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) return json({ error: '주소를 확인해 주세요.' }, 400);
      await setSetting(env, 'pq_url', url);
      if (typeof b.code === 'string' && b.code.trim()) await setSetting(env, 'pq_code', b.code.trim());
      return json({ ok: true });
    }
    if (b.op === 'code') {
      if (env.FAMILY_CODE) return json({ error: 'Cloudflare 설정에 코드가 들어 있어서 여기서는 못 바꿔요.' }, 400);
      try { await setCode(env, String(b.code ?? '')); } catch (e) { return json({ error: (e as Error).message }, 400); }
      return json({ ok: true }, 200, { 'Set-Cookie': await loginCookie(env, request) });
    }
    if (b.op === 'hookReset') { await setSetting(env, 'hook_key', randomToken(18)); return json({ ok: true }); }
    if (b.op === 'simArrival') {
      // 개발 메뉴: 알림 문구를 넣어 시험 (시험용 기록에만, 포켓퀴즈도 ?player=sim)
      return json(await receiveAlimi(env, String(b.text ?? ''), now.date, 'sim', 'test'));
    }
    if (b.op === 'clearSim') {
      await env.DB.batch([env.DB.prepare('DELETE FROM morning_taps WHERE sim = 1'), env.DB.prepare('DELETE FROM arrivals WHERE sim = 1')]);
      return json({ ok: true });
    }
    return json({ error: '다시 눌러 주세요.' }, 400);
  }
  return json({ error: '없는 주소예요.' }, 404);
}

/** MacroDroid 가 보내는 아이알리미 알림. 본문(글자) 또는 JSON {text} 또는 ?text= */
async function hook(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('k') !== (await getSetting(env, 'hook_key'))) return json({ error: '주소의 열쇠가 맞지 않아요.' }, 401);
  let text = url.searchParams.get('text') ?? '';
  if (request.method === 'POST') {
    const raw = (await request.text()).slice(0, 2000);
    const type = request.headers.get('content-type') ?? '';
    if (type.includes('json')) { try { const j = JSON.parse(raw); text = String(j.text ?? j.message ?? j.body ?? text); } catch { text = raw; } }
    else if (type.includes('x-www-form-urlencoded')) text = new URLSearchParams(raw).get('text') ?? raw;
    else text = raw || text;
  }
  const r = await receiveAlimi(env, text, kstOf(Date.now()).date, 'family', 'alimi');
  return json(r);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith('/api/')) return await api(request, env, path);
      if (path === '/hook/alimi') return await hook(request, env);
    } catch (error) {
      console.error(error);
      return json({ error: '잠시 뒤에 다시 해 주세요.' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
