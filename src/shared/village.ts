// 포켓몬 마을 그림 계산 (보기 전용).
// 포켓퀴즈 GET /api/family 의 village(지도 글자·물건·아이가 놓은 것)를 받아, 땅 칸과 물건 그림 목록으로 바꿉니다.
// 그림 조각 자리(village-assets.json)는 포켓퀴즈 lib/data/village-assets.json 을 그대로 복사한 것이고,
// 그림 파일(ground.png·objects.png)은 포켓퀴즈 사이트 주소에서 바로 불러옵니다.
// 그리는 규칙은 포켓퀴즈 lib/village-map.ts·village-decor.ts 와 같게 맞췄습니다(오토타일·울타리 모양·밭 큰 덤불).
import assets from './village-assets.json' with { type: 'json' };

export type Ground = 'grass' | 'path' | 'soil' | 'water' | 'stone';
type Rect = number[];
type ObjInfo = { rect: Rect; cells: number[]; foot?: number[] | null; flat?: boolean };
export const TILE = assets.tile;
export const SHEETS = assets.sheets;
export const GROUND_RECTS = assets.ground as Record<string, { rect: Rect }>;
export const OBJECTS = assets.objects as unknown as Record<string, ObjInfo>;
/** 지도 위쪽에 더 그리는 숲 줄 (그림만) */
export const TOP_ROWS = 2;

export type FamilyVillage = {
  open: boolean; entered: boolean;
  level: { level: number; points: number; next: number | null; keys: number };
  map: {
    tile: number; x0: number; width: number; height: number;
    legend: Record<string, string>; ground: string[];
    regions: { id: string; name: string; emoji: string; x: number; y: number; w: number; h: number; open: boolean }[];
    fixedObjects: { kind: string; x: number; y: number }[];
  };
  placed: {
    plots: { cell: number; x: number; y: number; item: string }[];
    habitats: { plot: number; kind: string; name: string; since: string; x: number; y: number }[];
    decor: { item: string; kind: string; x: number; y: number }[];
    terrain: { x: number; y: number; ground: Ground }[];
    trees: { x: number; y: number; spot: number; berry: string; ready: boolean }[];
  };
  guests: { species: number; name: string; habitat: string; habitatName: string; plot: number; x: number; y: number; image: { art: string; pixel: string } }[];
  seojun: { name: string; inside: boolean; x?: number; y?: number };
};

export type Box = { x0: number; y0: number; cols: number; rows: number };
export type DrawObject = { kind: string; x: number; y: number; z: number };

/** 지금 보이는 땅 (땅 바꾸기 > 밭의 물웅덩이 > 지도 글자) */
export function groundFn(v: FamilyVillage): (x: number, y: number) => Ground {
  const { map, placed } = v;
  const terrain = new Map(placed.terrain.map(t => [`${t.x},${t.y}`, t.ground]));
  const puddles = new Set(placed.plots.filter(p => p.item === 'puddle').map(p => `${p.x},${p.y}`));
  return (x, y) => {
    const t = terrain.get(`${x},${y}`);
    if (t) return t;
    if (y < 0 || y >= map.height || x < map.x0 || x >= map.x0 + map.width) return 'grass';
    const g = (map.legend[map.ground[y]?.[x - map.x0] ?? '.'] ?? 'grass') as Ground;
    if (g === 'soil' && puddles.has(`${x},${y}`)) return 'water';
    return g;
  };
}

/** 열린 구역을 모두 담는 네모 (처음 마을이 열려 있으면 위쪽 숲 줄도) */
export function openBox(v: FamilyVillage): Box {
  const open = v.map.regions.filter(r => r.open);
  const list = open.length ? open : [{ x: 0, y: 0, w: 12, h: 20 }];
  const x0 = Math.min(...list.map(r => r.x)), x1 = Math.max(...list.map(r => r.x + r.w));
  let y0 = Math.min(...list.map(r => r.y));
  const y1 = Math.max(...list.map(r => r.y + r.h));
  if (y0 === 0) y0 = -TOP_ROWS;
  return { x0, y0, cols: x1 - x0, rows: y1 - y0 };
}

/** 안 열린 칸 (네모 안에서 안개로 덮을 칸) */
export function lockedRegions(v: FamilyVillage, box: Box) {
  return v.map.regions.filter(r => !r.open && r.x < box.x0 + box.cols && r.x + r.w > box.x0 && r.y < box.y0 + box.rows && r.y + r.h > box.y0);
}

// ---------- 오토타일 (포켓퀴즈 lib/village-map.ts autotileQuarters 와 같음) ----------
const AUTOTILE: Record<Exclude<Ground, 'grass'>, { set: string; inner: string }> = {
  path: { set: 'sand', inner: 'sandIn' },
  soil: { set: 'sand', inner: 'sandIn' },
  water: { set: 'shore', inner: 'shoreIn' },
  stone: { set: 'stoneSet', inner: 'stoneIn' },
};
export function autotileQuarters(kind: Exclude<Ground, 'grass'>, same: (x: number, y: number) => boolean, x: number, y: number): [number, number, number, number][] {
  const { set, inner } = AUTOTILE[kind];
  const [fx, fy] = GROUND_RECTS[set].rect;
  const [ix, iy] = GROUND_RECTS[inner].rect;
  const out: [number, number, number, number][] = [];
  for (const qx of [0, 1]) for (const qy of [0, 1]) {
    const hx = qx ? 1 : -1, vy = qy ? 1 : -1;
    const ho = !same(x + hx, y), vo = !same(x, y + vy);
    if (!ho && !vo && !same(x + hx, y + vy)) { out.push([ix + (qx ? 0 : 24), iy + (qy ? 0 : 24), qx * 8, qy * 8]); continue; }
    const i = ho ? (qx ? 3 : 0) : (qx ? 2 : 1);
    const j = vo ? (qy ? 3 : 0) : (qy ? 2 : 1);
    out.push([fx + i * 8, fy + j * 8, qx * 8, qy * 8]);
  }
  return out;
}

// ---------- 물건 ----------
const info = (kind: string): ObjInfo => OBJECTS[kind] ?? { rect: [0, 0, 0, 0], cells: [1, 1] };
/** 꾸미기 물건의 바닥 칸 → 그림 왼쪽 위 (포켓퀴즈 decorImageAt) */
function decorImageAt(d: { kind: string; x: number; y: number }) {
  const { cells, foot } = info(d.kind);
  const dx = foot ? foot[0] : 0, dy = foot ? foot[1] : cells[1] - 1;
  return { x: d.x - dx, y: d.y - dy };
}
/** 울타리 모양 (이웃을 보고, 포켓퀴즈 fenceKind) */
function fenceKind(decor: FamilyVillage['placed']['decor'], x: number, y: number) {
  const at = (a: number, b: number) => decor.some(d => d.item === 'fence' && d.x === a && d.y === b);
  const n = at(x, y - 1), s = at(x, y + 1), w = at(x - 1, y), e = at(x + 1, y);
  if (e && s && !w && !n) return 'fenceTL';
  if (w && s && !e && !n) return 'fenceTR';
  if (e && n && !w && !s) return 'fenceBL';
  if (w && n && !e && !s) return 'fenceBR';
  if ((n || s) && !w && !e) return 'fenceL';
  if (w || e) return 'fenceT';
  return 'fencePost';
}
const FLOWERS = ['flowerYellow', 'flowerPink', 'flowerWhite', 'flowerBlue'];

/** 그릴 물건 목록 (z = 앞뒤: 바닥에 붙은 것 3, 나머지 11 + 아래 줄) */
export function villageObjects(v: FamilyVillage, box: Box): DrawObject[] {
  const list: { kind: string; x: number; y: number }[] = [...v.map.fixedObjects];
  // 밭: 4칸 모두 풀숲이면 큰 덤불 숲 하나
  const byPlot = new Map<number, FamilyVillage['placed']['plots']>();
  for (const p of v.placed.plots) { const k = Math.floor(p.cell / 4); byPlot.set(k, [...(byPlot.get(k) ?? []), p]); }
  for (const cells of byPlot.values()) {
    if (cells.length === 4 && cells.every(c => c.item === 'bush')) {
      list.push({ kind: 'bushBig', x: Math.min(...cells.map(c => c.x)), y: Math.min(...cells.map(c => c.y)) });
      continue;
    }
    for (const c of cells) {
      if (c.item === 'bush') list.push({ kind: 'bush', x: c.x, y: c.y });
      else if (c.item === 'flowers') list.push({ kind: FLOWERS[c.cell % FLOWERS.length], x: c.x, y: c.y });
    }
  }
  for (const d of v.placed.decor) {
    const kind = d.item === 'fence' ? fenceKind(v.placed.decor, d.x, d.y) : d.item === 'bush' ? 'bushSmall' : d.kind;
    list.push({ kind, ...decorImageAt({ kind, x: d.x, y: d.y }) });
  }
  for (const t of v.placed.trees) list.push({ kind: t.ready && OBJECTS[`fruitTree_${t.berry}`] ? `fruitTree_${t.berry}` : 'treeRound', x: t.x, y: t.y });
  return list
    .filter(o => OBJECTS[o.kind])
    .filter(o => { const [w, h] = info(o.kind).cells; return o.x + w > box.x0 && o.x < box.x0 + box.cols && o.y + h > box.y0 && o.y < box.y0 + box.rows; })
    .map(o => { const i = info(o.kind); return { ...o, z: i.flat ? 3 : 11 + o.y + i.cells[1] - 1 }; });
}

/** 받침 있는 이름이면 "이", 아니면 "가" */
export function iGa(name: string) {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return '가';
  return (c - 0xac00) % 28 ? '이' : '가';
}
