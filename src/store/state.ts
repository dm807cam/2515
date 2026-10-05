import type { DeloadState, Effort, Joint, PlanOptions, Profile, TempLimit, Workout } from '../engine/types';
import { EMPTY_DELOAD } from '../engine/planner';
import { EX } from '../engine/exercises';
import { roundTo } from '../engine/rules';

export const STATE_VERSION = 1;

export interface AppState {
  v: number;
  profile: Profile | null;
  history: Workout[];
  active: Workout | null;
  /** quick-swap choices for one specific day */
  options: { date: string; opts: PlanOptions } | null;
  deload: DeloadState;
  tempLimits: TempLimit[];
  introSeen: boolean;
}

export const initialState: AppState = {
  v: STATE_VERSION,
  profile: null,
  history: [],
  active: null,
  options: null,
  deload: EMPTY_DELOAD,
  tempLimits: [],
  introSeen: false,
};

export type Action =
  | { type: 'ONBOARD'; profile: Profile }
  | { type: 'UPDATE_PROFILE'; patch: Partial<Profile> }
  | { type: 'SET_OPTIONS'; date: string; opts: PlanOptions }
  | { type: 'START'; workout: Workout; now: number }
  | { type: 'LOG_SET'; uid: string; setId: string; weight: number; reps: number; now: number }
  | { type: 'EDIT_SET'; uid: string; setId: string; weight: number; reps: number }
  | { type: 'UNDO_SET'; uid: string; setId: string }
  | { type: 'ADD_SET'; uid: string }
  | { type: 'REMOVE_SET'; uid: string }
  | { type: 'DROP_SET'; uid: string; setId: string }
  | { type: 'ADJUST_REMAINING'; uid: string; dir: 'heavy' | 'light' | 'ok' }
  | { type: 'DISMISS_INTRO' }
  | { type: 'SET_EFFORT'; uid: string; effort: Effort | undefined }
  | { type: 'SKIP'; uid: string; skipped: boolean }
  | { type: 'REPLACE_ACTIVE'; workout: Workout }
  | { type: 'CLEAR_REST' }
  | { type: 'FINISH'; now: number }
  | { type: 'DISCARD' }
  | { type: 'ACCEPT_DELOAD'; until: string }
  | { type: 'DISMISS_DELOAD'; until: string }
  | { type: 'END_DELOAD'; today: string }
  | { type: 'AVOID'; id: string }
  | { type: 'UNAVOID'; id: string }
  | { type: 'ADD_LIMIT'; area: Joint; until: string }
  | { type: 'REMOVE_LIMIT'; area: Joint }
  | { type: 'LOAD_DEMO'; profile: Profile; history: Workout[] }
  | { type: 'RESET' }
  | { type: 'REPLACE_ALL'; state: AppState };

function mapEx(w: Workout, uid: string, f: (we: Workout['exercises'][number]) => Workout['exercises'][number]): Workout {
  return { ...w, exercises: w.exercises.map(we => (we.uid === uid ? f(we) : we)) };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'ONBOARD':
      return { ...initialState, profile: a.profile };
    case 'UPDATE_PROFILE':
      return s.profile ? { ...s, profile: { ...s.profile, ...a.patch } } : s;
    case 'SET_OPTIONS':
      return { ...s, options: { date: a.date, opts: a.opts } };
    case 'START':
      return { ...s, active: { ...a.workout, startedAt: a.now } };
    case 'LOG_SET': {
      if (!s.active) return s;
      const w = mapEx(s.active, a.uid, we => ({
        ...we,
        sets: we.sets.map(x => (x.id === a.setId ? { ...x, weight: a.weight, reps: a.reps, done: true } : x)),
      }));
      const we = w.exercises.find(x => x.uid === a.uid)!;
      const set = we.sets.find(x => x.id === a.setId)!;
      const rest = set.warmup ? 45 : we.rest;
      return { ...s, active: { ...w, restEndsAt: a.now + rest * 1000, restTotal: rest } };
    }
    case 'EDIT_SET':
      return s.active ? { ...s, active: mapEx(s.active, a.uid, we => ({ ...we, sets: we.sets.map(x => (x.id === a.setId ? { ...x, weight: a.weight, reps: a.reps } : x)) })) } : s;
    case 'UNDO_SET':
      return s.active ? { ...s, active: mapEx(s.active, a.uid, we => ({ ...we, sets: we.sets.map(x => (x.id === a.setId ? { ...x, done: false } : x)) })) } : s;
    case 'ADD_SET':
      return s.active ? {
        ...s, active: mapEx(s.active, a.uid, we => {
          const last = [...we.sets].reverse().find(x => !x.warmup) ?? we.sets[we.sets.length - 1];
          const n = we.sets.filter(x => !x.warmup).length;
          return { ...we, sets: [...we.sets, { id: `${we.uid}-x${n}-${we.sets.length}`, weight: last?.weight ?? 0, reps: last?.targetReps ?? last?.reps ?? we.repMin, targetReps: last?.targetReps, done: false }] };
        }),
      } : s;
    case 'REMOVE_SET':
      return s.active ? {
        ...s, active: mapEx(s.active, a.uid, we => {
          const idx = [...we.sets].map((x, i) => ({ x, i })).reverse().find(({ x }) => !x.done && !x.warmup);
          if (!idx || we.sets.filter(x => !x.warmup).length <= 1) return we;
          return { ...we, sets: we.sets.filter((_, i) => i !== idx.i) };
        }),
      } : s;
    case 'DROP_SET':
      return s.active ? { ...s, active: mapEx(s.active, a.uid, we => ({ ...we, sets: we.sets.filter(x => x.id !== a.setId) })) } : s;
    case 'DISMISS_INTRO':
      return { ...s, introSeen: true };
    case 'ADJUST_REMAINING':
      return s.active ? {
        ...s, active: mapEx(s.active, a.uid, we => {
          if (a.dir === 'ok') return { ...we, calibrated: true };
          const ex = EX[we.exerciseId];
          const heavy = a.dir === 'heavy';
          return {
            ...we, calibrated: true,
            sets: we.sets.map(x => {
              if (x.done || x.warmup) return x;
              if (ex.load === 'external') {
                const inc = ex.increment || 1;
                const base = x.weight * (heavy ? 0.9 : 1.1);
                let w = roundTo(base, inc);
                if (heavy && w >= x.weight) w = Math.max(inc, x.weight - inc);
                if (!heavy && w <= x.weight) w = x.weight + inc;
                return { ...x, weight: w };
              }
              const reps = Math.max(1, x.reps + (heavy ? -2 : 3));
              return { ...x, reps, targetReps: reps };
            }),
          };
        }),
      } : s;
    case 'SET_EFFORT':
      return s.active ? { ...s, active: mapEx(s.active, a.uid, we => ({ ...we, effort: a.effort })) } : s;
    case 'SKIP':
      return s.active ? { ...s, active: mapEx(s.active, a.uid, we => ({ ...we, skipped: a.skipped })) } : s;
    case 'REPLACE_ACTIVE':
      return { ...s, active: a.workout };
    case 'CLEAR_REST':
      return s.active ? { ...s, active: { ...s.active, restEndsAt: undefined, restTotal: undefined } } : s;
    case 'FINISH': {
      if (!s.active) return s;
      const w: Workout = { ...s.active, finishedAt: a.now, restEndsAt: undefined, restTotal: undefined };
      return { ...s, history: [...s.history, w], active: null, options: null };
    }
    case 'DISCARD':
      return { ...s, active: null };
    case 'ACCEPT_DELOAD':
      return { ...s, deload: { ...s.deload, until: a.until, dismissedUntil: null }, options: null };
    case 'DISMISS_DELOAD':
      return { ...s, deload: { ...s.deload, dismissedUntil: a.until } };
    case 'END_DELOAD':
      return { ...s, deload: { until: null, dismissedUntil: null, lastDeloadEnd: a.today }, options: null };
    case 'AVOID':
      return s.profile && !s.profile.avoid.includes(a.id) ? { ...s, profile: { ...s.profile, avoid: [...s.profile.avoid, a.id] } } : s;
    case 'UNAVOID':
      return s.profile ? { ...s, profile: { ...s.profile, avoid: s.profile.avoid.filter(x => x !== a.id) } } : s;
    case 'ADD_LIMIT':
      return { ...s, tempLimits: [...s.tempLimits.filter(t => t.area !== a.area), { area: a.area, until: a.until }] };
    case 'REMOVE_LIMIT':
      return { ...s, tempLimits: s.tempLimits.filter(t => t.area !== a.area) };
    case 'LOAD_DEMO':
      return { ...initialState, profile: a.profile, history: a.history };
    case 'RESET':
      return initialState;
    case 'REPLACE_ALL':
      return a.state;
  }
}
