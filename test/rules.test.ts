import { describe, expect, it } from 'vitest';
import { parseAlimi } from '../src/shared/alimi.ts';
import { schoolWarning } from '../src/shared/school.ts';
import { kstOf, modeAt, msOfKst, weekStartOf } from '../src/shared/time.ts';
import { groundFn, iGa, openBox, villageObjects, type FamilyVillage } from '../src/shared/village.ts';

describe('아이알리미 문구', () => {
  it('등교 알림에서 날짜·시각만 꺼냄', () => {
    expect(parseAlimi('이서준 학생이 11/19 08:46에 교문[후문]으로 등교하였습니다', '2026-11-20')).toEqual({ ok: true, arrival: { date: '2026-11-19', time: '08:46' } });
  });
  it('하교·다른 알림은 건너뜀', () => {
    expect(parseAlimi('이서준 학생이 11/19 14:20에 교문으로 하교하였습니다', '2026-11-20').ok).toBe(false);
    expect(parseAlimi('가정통신문이 도착했습니다', '2026-11-20').ok).toBe(false);
  });
  it('날짜가 없으면 오늘, 1월에 받은 12월 알림은 작년', () => {
    expect(parseAlimi('등교하였습니다 8:31', '2026-11-20')).toEqual({ ok: true, arrival: { date: '2026-11-20', time: '08:31' } });
    expect(parseAlimi('이서준 학생이 12/31 08:40에 등교하였습니다', '2027-01-02')).toEqual({ ok: true, arrival: { date: '2026-12-31', time: '08:40' } });
  });
});

describe('시간대별 화면', () => {
  const at = (date: string, time: string) => kstOf(msOfKst(date, time));
  it('평일 07:30–08:30 아침, 17:00–22:00 홈, 그 외 어두움', () => {
    expect(modeAt(at('2026-11-20', '07:29'))).toBe('dark');
    expect(modeAt(at('2026-11-20', '07:30'))).toBe('morning');
    expect(modeAt(at('2026-11-20', '08:29'))).toBe('morning');
    expect(modeAt(at('2026-11-20', '08:30'))).toBe('dark');
    expect(modeAt(at('2026-11-21', '07:45'))).toBe('dark'); // 토요일
    expect(modeAt(at('2026-11-21', '18:00'))).toBe('home');
    expect(modeAt(at('2026-11-20', '22:00'))).toBe('dark');
  });
  it('한국 시각 바꾸기가 맞음', () => {
    expect(at('2026-11-20', '08:15:30')).toMatchObject({ date: '2026-11-20', time: '08:15:30', weekday: 5 });
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16');
  });
});

describe('이번 주 등교 0건 경고', () => {
  it('월요일 10시 전에는 아직 경고 안 함', () => {
    expect(schoolWarning({ date: '2026-11-16', minutes: 9 * 60 }, []).warn).toBe(false);
  });
  it('지나간 평일이 있는데 0건이면 경고, 한 건이라도 있으면 괜찮음', () => {
    expect(schoolWarning({ date: '2026-11-17', minutes: 8 * 60 }, []).warn).toBe(true);
    expect(schoolWarning({ date: '2026-11-17', minutes: 8 * 60 }, ['2026-11-16']).warn).toBe(false);
    expect(schoolWarning({ date: '2026-11-17', minutes: 8 * 60 }, ['2026-11-13']).warn).toBe(true); // 지난주 기록은 안 셈
  });
});

describe('마을 그림', () => {
  const v = {
    map: { tile: 16, x0: -2, width: 6, height: 4, legend: { '.': 'grass', s: 'soil', '~': 'water' }, ground: ['..ss..', '..ss..', '......', '~~....'],
      regions: [{ id: 'C1', name: '', emoji: '', x: 0, y: 0, w: 4, h: 4, open: true }, { id: 'B1', name: '', emoji: '', x: -2, y: 0, w: 2, h: 4, open: false }],
      fixedObjects: [{ kind: 'house', x: 0, y: -2 }] },
    placed: { plots: [0, 1, 2, 3].map(i => ({ cell: i, x: i % 2, y: Math.floor(i / 2), item: 'bush' })).concat([{ cell: 4, x: 0, y: 0, item: 'puddle' }]).slice(0, 4),
      habitats: [], decor: [{ item: 'fence', kind: 'fenceT', x: 2, y: 2 }, { item: 'fence', kind: 'fenceT', x: 3, y: 2 }], terrain: [{ x: 3, y: 3, ground: 'stone' }], trees: [] },
    guests: [], seojun: { name: '서준', inside: false }, open: true, entered: false, level: { level: 1, points: 0, next: 50, keys: 0 },
  } as unknown as FamilyVillage;
  it('열린 땅만 담고, 처음 마을이면 위쪽 숲 줄도', () => {
    expect(openBox(v)).toEqual({ x0: 0, y0: -2, cols: 4, rows: 6 });
  });
  it('밭 4칸이 모두 풀숲이면 큰 덤불 하나, 울타리는 이어진 모양', () => {
    const kinds = villageObjects(v, openBox(v)).map(o => o.kind);
    expect(kinds).toContain('bushBig');
    expect(kinds.filter(k => k === 'bush')).toHaveLength(0);
    expect(kinds).toContain('fenceT');
    expect(kinds).toContain('house');
  });
  it('땅 바꾸기·물웅덩이가 지도 글자보다 먼저', () => {
    const at = groundFn(v);
    expect(at(3, 3)).toBe('stone');
    expect(at(-2, 3)).toBe('water');
    expect(at(1, 1)).toBe('soil');
    const v2 = { ...v, placed: { ...v.placed, plots: [{ cell: 0, x: 1, y: 0, item: 'puddle' }] } } as FamilyVillage;
    expect(groundFn(v2)(1, 0)).toBe('water');
  });
  it('이/가', () => { expect(iGa('뚜벅쵸')).toBe('가'); expect(iGa('피카츄')).toBe('가'); expect(iGa('꼬부기')).toBe('가'); expect(iGa('파이리')).toBe('가'); expect(iGa('리자몽')).toBe('이'); });
});
