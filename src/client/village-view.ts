// 포켓몬 마을 보기 전용 그림. 눌러도 아무 일 없음 (pointer-events: none).
// 땅은 캔버스 한 장, 물건·포켓몬은 그 위에. 그림 파일은 포켓퀴즈 사이트에서 바로 불러옴.
import { autotileQuarters, GROUND_RECTS, groundFn, lockedRegions, OBJECTS, openBox, SHEETS, TILE, TOP_ROWS, villageObjects, type Box, type FamilyVillage } from '../shared/village.ts';
import type { Pq } from './types.ts';

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(src: string) {
  let p = imgCache.get(src);
  if (!p) { p = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); imgCache.set(src, p); }
  return p;
}

let lastKey = '';
let wanderTimer = 0;

/** el 안에 마을을 꽉 차게 그림 */
export function renderVillage(el: HTMLElement, pq: Pq, base: string) {
  const v = pq.village;
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return;
  // 화면을 빈칸 없이 꽉 채움: 긴 쪽으로 22칸쯤 보이게. 열린 땅이 화면보다 작으면 둘레(잠긴 땅은 안개)까지 넓혀 채우고,
  // 열린 땅이 화면보다 크면 천천히 훑어봄
  const open = openBox(v);
  let scale = Math.max(W, H) / (22 * TILE);
  const minX = v.map.x0, maxX = v.map.x0 + v.map.width, minY = -TOP_ROWS, maxY = v.map.height;
  scale = Math.max(scale, W / ((maxX - minX) * TILE), H / ((maxY - minY) * TILE));
  const grow = (start: number, len: number, need: number, lo: number, hi: number) => {
    if (len >= need) return [start, len];
    let a = start - Math.floor((need - len) / 2);
    a = Math.max(lo, Math.min(a, hi - need));
    return [a, need];
  };
  const [bx, bc] = grow(open.x0, open.cols, Math.ceil(W / (scale * TILE)), minX, maxX);
  const [by, br] = grow(open.y0, open.rows, Math.ceil(H / (scale * TILE)), minY, maxY);
  const box: Box = { x0: bx, y0: by, cols: bc, rows: br };
  const key = JSON.stringify([v.map.regions.map(r => r.open), v.placed, v.guests.map(g => g.species), pq.partner?.species, W, H, base]);
  if (key === lastKey && el.querySelector('.vw-world')) return;
  lastKey = key;

  const world = document.createElement('div');
  world.className = 'vw-world';
  world.style.width = `${box.cols * TILE * scale}px`;
  world.style.height = `${box.rows * TILE * scale}px`;

  // 땅
  const canvas = document.createElement('canvas');
  canvas.width = box.cols * TILE; canvas.height = box.rows * TILE;
  canvas.className = 'vw-ground';
  world.appendChild(canvas);
  void loadImg(base + SHEETS.ground.file).then(img => drawGround(canvas, img, v, box)).catch(() => undefined);

  // 물건
  const sheet = base + SHEETS.objects.file;
  for (const o of villageObjects(v, box)) {
    const [sx, sy, w, h] = OBJECTS[o.kind].rect;
    const i = document.createElement('i');
    i.className = 'vw-obj';
    Object.assign(i.style, {
      left: `${(o.x - box.x0) * TILE * scale}px`, top: `${(o.y - box.y0) * TILE * scale}px`, width: `${w * scale}px`, height: `${h * scale}px`,
      backgroundImage: `url(${sheet})`, backgroundSize: `${SHEETS.objects.width * scale}px ${SHEETS.objects.height * scale}px`,
      backgroundPosition: `${-sx * scale}px ${-sy * scale}px`, zIndex: String(o.z),
    });
    world.appendChild(i);
  }

  // 잠긴 땅은 안개
  for (const r of lockedRegions(v, box)) {
    const f = document.createElement('div');
    f.className = 'vw-fog';
    if (Math.min(r.x + r.w, box.x0 + box.cols) - Math.max(r.x, box.x0) >= 5) f.innerHTML = `<span>🔒 ${r.emoji} ${r.name}</span>`;
    const x = Math.max(r.x, box.x0), y = Math.max(r.y, box.y0);
    Object.assign(f.style, { left: `${(x - box.x0) * TILE * scale}px`, top: `${(y - box.y0) * TILE * scale}px`, width: `${(Math.min(r.x + r.w, box.x0 + box.cols) - x) * TILE * scale}px`, height: `${(Math.min(r.y + r.h, box.y0 + box.rows) - y) * TILE * scale}px` });
    world.appendChild(f);
  }

  // 포켓몬: 파트너(집 앞) + 오늘 손님(자기 서식지 옆). 천천히 한 칸씩 움직임 (보기만)
  const mons: { el: HTMLElement; hx: number; hy: number; x: number; y: number }[] = [];
  const addMon = (src: string, x: number, y: number, title: string) => {
    const m = document.createElement('img');
    m.className = 'vw-mon'; m.src = src; m.alt = title;
    m.style.width = m.style.height = `${TILE * scale * 3}px`;
    world.appendChild(m);
    mons.push({ el: m, hx: x, hy: y, x, y });
  };
  if (pq.partner) addMon(pq.partner.image.pixel, 6, 7, pq.partner.name);
  for (const g of v.guests) addMon(g.image.pixel, g.x, g.y, g.name);
  const place = () => mons.forEach(m => {
    m.el.style.left = `${(m.x - box.x0 + 0.5) * TILE * scale}px`;
    m.el.style.top = `${(m.y - box.y0 + 1) * TILE * scale}px`;
    m.el.style.zIndex = String(12 + m.y);
  });
  place();
  window.clearInterval(wanderTimer);
  wanderTimer = window.setInterval(() => {
    for (const m of mons) {
      if (Math.random() < 0.6) continue;
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      const x = m.x + dx, y = m.y + dy;
      if (Math.abs(x - m.hx) > 2 || Math.abs(y - m.hy) > 1) continue;
      if (dx) m.el.classList.toggle('flip', dx > 0);
      m.x = x; m.y = y;
    }
    place();
  }, 2500);

  el.replaceChildren(world);
  pan(world, el);
}

/** 화면보다 큰 마을은 천천히 훑어보기 (끝에서 잠깐 멈춤) */
function pan(world: HTMLElement, el: HTMLElement) {
  const dx = Math.max(0, world.offsetWidth - el.clientWidth), dy = Math.max(0, world.offsetHeight - el.clientHeight);
  if (!dx && !dy) return;
  const sec = Math.max(dx, dy) / 12;
  world.animate([
    { transform: `translate(${dx / 2}px, ${dy / 2}px)`, offset: 0 },
    { transform: `translate(${dx / 2}px, ${dy / 2}px)`, offset: 0.15 },
    { transform: `translate(${-dx / 2}px, ${-dy / 2}px)`, offset: 0.5 },
    { transform: `translate(${-dx / 2}px, ${-dy / 2}px)`, offset: 0.65 },
    { transform: `translate(${dx / 2}px, ${dy / 2}px)`, offset: 1 },
  ], { duration: sec * 2 * 1000 / 0.7, iterations: Infinity, easing: 'ease-in-out' });
}

function drawGround(canvas: HTMLCanvasElement, img: HTMLImageElement, v: FamilyVillage, box: Box) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const at = groundFn(v);
  const tile = (name: string, dx: number, dy: number) => { const [sx, sy] = GROUND_RECTS[name].rect; ctx.drawImage(img, sx, sy, TILE, TILE, dx, dy, TILE, TILE); };
  for (let r = 0; r < box.rows; r++) for (let c = 0; c < box.cols; c++) {
    const x = box.x0 + c, y = box.y0 + r, g = at(x, y);
    tile(g === 'water' ? 'water' : 'grass', c * TILE, r * TILE);
    if (g === 'grass') continue;
    for (const [sx, sy, dx, dy] of autotileQuarters(g, (a, b) => at(a, b) === g, x, y)) ctx.drawImage(img, sx, sy, 8, 8, c * TILE + dx, r * TILE + dy, 8, 8);
  }
}
