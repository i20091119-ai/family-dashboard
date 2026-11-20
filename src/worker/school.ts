// 등교 알림 받기 → 문구 속 시각만 꺼내 기록 → 포켓퀴즈 "제때 등교"로 보냄.
import { parseAlimi } from '../shared/alimi.ts';
import type { Env } from './env.ts';
import { sendArrival, type PqPlayer } from './pokequiz.ts';
import { getSetting, setSetting } from './store.ts';

export type ArrivalRow = { id: number; date: string; time: string; source: string; sim: number; status: string; ok: number | null; deadline: string | null; message: string | null; received_at: string; sent_at: string | null };

async function forward(env: Env, row: ArrivalRow) {
  const r = await sendArrival(env, row.sim ? 'sim' : 'family', row.date, row.time);
  if (r.ok) {
    await env.DB.prepare('UPDATE arrivals SET status = ?, ok = ?, deadline = ?, message = ?, sent_at = ? WHERE id = ?')
      .bind(r.status, r.good === null ? null : r.good ? 1 : 0, r.deadline, r.message, new Date().toISOString(), row.id).run();
  } else {
    await env.DB.prepare('UPDATE arrivals SET status = ?, message = ? WHERE id = ?').bind(r.retry ? 'pending' : 'refused', r.error, row.id).run();
  }
  return r;
}

/** 알림 문구 하나 받기. today = 한국 오늘 */
export async function receiveAlimi(env: Env, text: string, today: string, player: PqPlayer, source: string) {
  const p = parseAlimi(text, today);
  if (!p.ok) return { accepted: false, reason: p.reason };
  const { date, time } = p.arrival;
  if (date > today) return { accepted: false, reason: '아직 오지 않은 날짜예요.' };
  const sim = player === 'sim' ? 1 : 0;
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO arrivals (date, time, source, sim, status, received_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(date, time, source, sim, 'pending', new Date().toISOString()).run();
  if (ins.meta.changes === 0) return { accepted: true, duplicate: true, date, time, reason: '그날 등교는 이미 받았어요.' };
  const row = await env.DB.prepare('SELECT * FROM arrivals WHERE date = ? AND sim = ?').bind(date, sim).first<ArrivalRow>();
  const r = await forward(env, row!);
  return { accepted: true, date, time, sent: r.ok, result: r };
}

/** 못 보낸 것 다시 보내기 (5분에 한 번, 14일 안의 것만) */
export async function retryPending(env: Env, today: string) {
  const last = Number(await getSetting(env, 'arrival_retry_at')) || 0;
  if (Date.now() - last < 5 * 60_000) return;
  await setSetting(env, 'arrival_retry_at', String(Date.now()));
  const { results } = await env.DB.prepare("SELECT * FROM arrivals WHERE status = 'pending' ORDER BY date LIMIT 5").all<ArrivalRow>();
  const from = new Date(Date.parse(today + 'T00:00:00Z') - 14 * 86400_000).toISOString().slice(0, 10);
  for (const row of results) if (row.date >= from) await forward(env, row);
}

export async function recentArrivals(env: Env, sim: boolean, limit = 30) {
  const { results } = await env.DB.prepare('SELECT * FROM arrivals WHERE sim = ? ORDER BY date DESC LIMIT ?').bind(sim ? 1 : 0, limit).all<ArrivalRow>();
  return results;
}
