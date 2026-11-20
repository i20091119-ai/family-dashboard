import type { FamilyVillage } from '../shared/village.ts';
import type { KstNow, Mode, Who } from '../shared/time.ts';

type Img = { art: string; pixel: string };
export type Person = { key: string; name: string; face: string };
export type Todo = { id: number; kind: 'todo' | 'shop'; text: string; by: string; created_at: string; done_by: string | null; done_at: string | null };
export type Pq = {
  player: 'family' | 'sim'; today: string; now: string;
  partner: { species: number; name: string; shiny: boolean; image: Img } | null;
  dailyMission: { date: string; started: boolean; done: boolean; answered: number; total: number; correct: number; review: boolean };
  training: { weekStart: string; days: { date: string; dow: string; mark: string | null; symbol: string | null; future: boolean }[]; score: number; goal: number; reached: boolean; unopenedBoxes: number };
  village: FamilyVillage;
  school: { today: { time: string; ok: boolean; deadline: string } | null; deadlineToday: string; recent: { date: string; time: string; ok: boolean }[] };
};
export type State = {
  now: KstNow & { ms: number }; mode: Mode; sim: { offset: number } | null; pqPlayer: 'family' | 'sim';
  morning: { taps: { who: Who; step: string; time: string }[] };
  todos: Todo[]; people: Person[];
  weather: { place: string; temp: number; max: number; min: number; rain: number | null; emoji: string; text: string } | null;
  pq: Pq | null; pqError: string | null; pqBase: string;
  school: { warning: { warn: boolean }; today: { time: string } | null };
};
