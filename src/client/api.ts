// 서버와 주고받기. 이 기기의 시험 시각·포켓퀴즈 시험용 기록 설정을 머리글로 같이 보냄.
const SIM_KEY = 'fd-sim-offset';
const PQ_KEY = 'fd-pq-player';

function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string | null) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* 저장 안 돼도 화면은 그대로 */ } }

export const device = {
  get simOffset() { return Number(read(SIM_KEY)) || 0; },
  set simOffset(ms: number) { write(SIM_KEY, ms ? String(Math.round(ms)) : null); },
  get pqPlayer(): 'family' | 'sim' { return read(PQ_KEY) === 'sim' ? 'sim' : 'family'; },
  set pqPlayer(p: 'family' | 'sim') { write(PQ_KEY, p === 'sim' ? 'sim' : null); },
};

export class ApiError extends Error { constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); } }

export async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sim-offset': String(device.simOffset), 'x-pq-player': device.pqPlayer },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? '잠시 뒤에 다시 해 주세요.'), res.status, data);
  return data as T;
}
