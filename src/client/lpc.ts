// 가족 캐릭터 (LPC 걷기 그림, 포켓퀴즈 lib/village-lpc.ts 와 같은 층·같은 모습).
// 그림 파일은 포켓퀴즈 사이트 /assets/village/lpc/ 에서 바로 불러옴. 64×64 칸 × 9장 × 4줄(위·왼쪽·아래·오른쪽)
export const LPC_FRAME = 64;
const ROW = { up: 0, left: 1, down: 2, right: 3 } as const;
export type Dir = keyof typeof ROW;

const soft = (f: string) => `/assets/village/lpc/${f}_soft.png`;
/** 서준 = 포켓퀴즈 진짜 마을 모습(LPC_REAL: 빨간 티셔츠·아이 얼굴·부드러운 테두리, 서준 비율 _sj) */
const SEOJUN = ['body_teen', 'shoes_thin_gray', 'shorts_thin_tan', 'tshirt_teen_red', 'head_child_on_teen', 'hair_relm_child_brown_on_teen'].map(f => soft(f + '_sj'));
export const FAMILY: { id: string; name: string; layers: string[]; small?: boolean }[] = [
  { id: 'seojun', name: '서준', layers: SEOJUN },
  { id: 'hajun', name: '하준', small: true, layers: ['body_child', 'childpants_darkblue', 'childshirt_yellow', 'head_child', 'hair_relm_child_brown'].map(soft) },
  { id: 'mom', name: '엄마', layers: ['body_teen', 'shoes_thin_gray', 'pants_thin_navy', 'longsleeve_teen_lightpink', 'head_female', 'hair_bob_chestnut'].map(soft) },
  { id: 'dad', name: '아빠', layers: ['body_teen', 'shoes_thin_gray', 'pants_thin_charcoal', 'longsleeve_teen_forest', 'head_male', 'hair_plain_brown'].map(soft) },
];

/** 사람 하나 (층을 겹쳐 그림). frame 0 = 서 있기, 1~8 = 걷기 */
export function lpcEl(base: string, id: string, scale: number, label = true): HTMLElement {
  const p = FAMILY.find(f => f.id === id)!;
  const box = document.createElement('div');
  box.className = 'lpc';
  const size = LPC_FRAME * scale;
  box.style.width = box.style.height = `${size}px`;
  for (const l of p.layers) {
    const i = document.createElement('i');
    i.style.backgroundImage = `url(${base}${l})`;
    i.style.backgroundSize = `${9 * size}px ${4 * size}px`;
    box.appendChild(i);
  }
  if (label) { const n = document.createElement('b'); n.textContent = p.name; box.appendChild(n); }
  setPose(box, 'down', 0);
  return box;
}
export function setPose(box: HTMLElement, dir: Dir, frame: number) {
  const size = parseFloat(box.style.width);
  box.querySelectorAll('i').forEach(i => { (i as HTMLElement).style.backgroundPosition = `${-frame * size}px ${-ROW[dir] * size}px`; });
}

/** 칸 위를 가끔 한 칸씩 걷기 (보기만). home 근처 range 칸 안에서 */
export function wander(box: HTMLElement, place: (x: number, y: number) => void, start: { x: number; y: number }, range: number, blocked: (x: number, y: number) => boolean) {
  let { x, y } = start;
  place(x, y);
  return window.setInterval(() => {
    if (Math.random() < 0.55) return;
    const [dx, dy, dir] = ([[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'down'], [0, -1, 'up']] as const)[Math.floor(Math.random() * 4)];
    const nx = x + dx, ny = y + dy;
    if (Math.abs(nx - start.x) > range || Math.abs(ny - start.y) > range || blocked(nx, ny)) { setPose(box, dir, 0); return; }
    x = nx; y = ny;
    place(x, y);
    let f = 1;
    const t = window.setInterval(() => { setPose(box, dir, f); f += 1; if (f > 8) { window.clearInterval(t); setPose(box, dir, 0); } }, 90);
  }, 1800);
}
