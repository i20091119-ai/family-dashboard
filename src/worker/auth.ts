// 가족 접속 코드: 처음 한 번 넣으면 그 기기에서 1년 기억(서명 쿠키). 코드를 바꾸면 모든 기기가 다시 넣어야 함.
import type { Env } from './env.ts';
import { getSetting, randomToken, setSetting, sha256 } from './store.ts';

const COOKIE = 'fd_auth';
const MAX_AGE = 60 * 60 * 24 * 365;

async function codeHash(env: Env): Promise<string | null> {
  if (env.FAMILY_CODE) return sha256('family:' + env.FAMILY_CODE);
  return getSetting(env, 'family_code_hash');
}
async function secret(env: Env) {
  let s = await getSetting(env, 'auth_secret');
  if (!s) { s = randomToken(32); await setSetting(env, 'auth_secret', s); }
  return s;
}
async function sign(value: string, key: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => (c === '+' ? '-' : c === '/' ? '_' : ''));
}
const normalize = (code: string) => String(code ?? '').trim().replace(/\s+/g, '');

export const hasCode = async (env: Env) => !!(await codeHash(env));

export async function checkCode(env: Env, code: string) {
  const h = await codeHash(env);
  return !!h && h === await sha256('family:' + normalize(code));
}
export async function setCode(env: Env, code: string) {
  const c = normalize(code);
  if (c.length < 4) throw new Error('코드는 4글자 이상으로 정해 주세요.');
  await setSetting(env, 'family_code_hash', await sha256('family:' + c));
}

export async function loginCookie(env: Env, request: Request) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const h = (await codeHash(env)) ?? '';
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${exp}.${await sign(exp + ':' + h, await secret(env))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export async function isFamily(env: Env, request: Request) {
  const h = await codeHash(env);
  if (!h) return false;
  const v = (request.headers.get('cookie') ?? '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!v) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return sig === await sign(exp + ':' + h, await secret(env));
}
