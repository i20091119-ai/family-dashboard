// 날씨: Open-Meteo (무료, 열쇠 없음). 창원시 의창구 중동. 30분마다 새로 받음.
import type { Env } from './env.ts';
import { getJson, setSetting } from './store.ts';

export const PLACE = { name: '창원 중동', lat: 35.2437, lon: 128.65 };
const EVERY_MS = 30 * 60_000;

export type Weather = { place: string; temp: number; max: number; min: number; rain: number | null; code: number; emoji: string; text: string; at: string };

export function describe(code: number): { emoji: string; text: string } {
  if (code === 0) return { emoji: '☀️', text: '맑음' };
  if (code <= 2) return { emoji: '🌤️', text: '구름 조금' };
  if (code === 3) return { emoji: '☁️', text: '흐림' };
  if (code === 45 || code === 48) return { emoji: '🌫️', text: '안개' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', text: '이슬비' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧️', text: '비' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '🌨️', text: '눈' };
  if (code >= 95) return { emoji: '⛈️', text: '천둥번개' };
  return { emoji: '🌡️', text: '' };
}

export async function getWeather(env: Env): Promise<Weather | null> {
  const saved = await getJson<Weather>(env, 'weather');
  if (saved && Date.now() - Date.parse(saved.at) < EVERY_MS) return saved;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=1`;
    const res = await fetch(u);
    if (!res.ok) return saved;
    const d = await res.json() as { current: { temperature_2m: number; weather_code: number }; daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] } };
    const w: Weather = {
      place: PLACE.name, temp: Math.round(d.current.temperature_2m), code: d.current.weather_code,
      max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]), rain: d.daily.precipitation_probability_max?.[0] ?? null,
      ...describe(d.current.weather_code), at: new Date().toISOString(),
    };
    await setSetting(env, 'weather', JSON.stringify(w));
    return w;
  } catch {
    return saved;
  }
}
