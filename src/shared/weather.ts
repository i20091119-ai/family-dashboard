// 날씨 그림·글, 미세먼지 단계, "나갈 때" 한 줄 (서버·화면 같이 씀)

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
/** 밤이면 해 대신 달 */
export function emojiAt(code: number, hour: number) {
  const e = describe(code).emoji;
  if (hour >= 6 && hour < 18) return e;
  return e === '☀️' ? '🌙' : e === '🌤️' ? '☁️' : e;
}

/** 미세먼지 단계 (환경부 기준: PM10 30/80/150, PM2.5 15/35/75). 둘 중 나쁜 쪽 */
export function dustLevel(pm10: number | null, pm25: number | null): { level: number; text: string; face: string } {
  const step = (v: number | null, cut: number[]) => (v === null ? 0 : cut.findIndex(c => v <= c) === -1 ? 3 : cut.findIndex(c => v <= c));
  const level = Math.max(step(pm10, [30, 80, 150]), step(pm25, [15, 35, 75]));
  return [{ level: 0, text: '좋음', face: '😊' }, { level: 1, text: '보통', face: '🙂' }, { level: 2, text: '나쁨', face: '😷' }, { level: 3, text: '매우 나쁨', face: '😷' }][level];
}

/** 나갈 때 한 줄: 앞으로 12시간 비 확률 50% 이상이면 우산, 추우면 겉옷 */
export function outingTip(min: number, hours: { at: string; rain: number | null }[], nowHour: string): string {
  const next = hours.filter(h => h.at.slice(0, 13) >= nowHour).slice(0, 12);
  const rainy = next.find(h => (h.rain ?? 0) >= 50);
  const tips: string[] = [];
  if (rainy) tips.push(`☔ ${Number(rainy.at.slice(11, 13))}시쯤 비 ${rainy.rain}% — 우산 챙기기`);
  if (min <= 3) tips.push('🧤 많이 추워요 — 장갑·목도리');
  else if (min <= 10) tips.push('🧥 쌀쌀해요 — 겉옷 챙기기');
  return tips.join(' · ');
}
