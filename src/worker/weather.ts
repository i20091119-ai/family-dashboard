// 날씨: Open-Meteo (무료, 열쇠 없음). 창원시 의창구 중동. 30분마다 새로 받음.
// 지금 날씨 + 오늘 최고·최저 + 앞으로 몇 시간 + 미세먼지 + "나갈 때" 한 줄.
import { describe as describeCode, outingTip } from '../shared/weather.ts';
import { kstOf } from '../shared/time.ts';
import type { Env } from './env.ts';
import { getJson, setSetting } from './store.ts';

export const PLACE = { name: '창원 중동', lat: 35.2437, lon: 128.65 };
const EVERY_MS = 30 * 60_000;
const KEY = 'weather_v2';

export type Hour = { at: string; temp: number; code: number; rain: number | null };
export type Weather = {
  place: string; temp: number; max: number; min: number; rain: number | null; code: number; emoji: string; text: string; at: string;
  hours: Hour[];
  dust: { pm10: number | null; pm25: number | null } | null;
  tip: string;
};

export async function getWeather(env: Env): Promise<Weather | null> {
  const saved = await getJson<Weather>(env, KEY);
  if (saved && Date.now() - Date.parse(saved.at) < EVERY_MS) return saved;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=temperature_2m,weather_code`
      + `&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=2`;
    const a = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;
    const [res, air] = await Promise.all([fetch(u), fetch(a).catch(() => null)]);
    if (!res.ok) return saved;
    const d = await res.json() as {
      current: { temperature_2m: number; weather_code: number };
      hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: (number | null)[] };
      daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
    };
    const dust = air?.ok ? ((await air.json()) as { current?: { pm10?: number; pm2_5?: number } }).current ?? null : null;
    const hours: Hour[] = d.hourly.time.map((t, i) => ({ at: t, temp: Math.round(d.hourly.temperature_2m[i]), code: d.hourly.weather_code[i], rain: d.hourly.precipitation_probability?.[i] ?? null }));
    const w: Weather = {
      place: PLACE.name, temp: Math.round(d.current.temperature_2m), code: d.current.weather_code,
      max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]), rain: d.daily.precipitation_probability_max?.[0] ?? null,
      ...describeCode(d.current.weather_code), at: new Date().toISOString(), hours,
      dust: dust ? { pm10: dust.pm10 ?? null, pm25: dust.pm2_5 ?? null } : null, tip: '',
    };
    const k = kstOf(Date.now());
    w.tip = outingTip(w.min, hours, `${k.date}T${k.time.slice(0, 2)}`);
    await setSetting(env, KEY, JSON.stringify(w));
    return w;
  } catch {
    return saved;
  }
}
