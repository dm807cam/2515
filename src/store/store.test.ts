import { describe, expect, it } from 'vitest';
import { initialState, reducer, type AppState } from './state';
import { loadState, saveState, STORAGE_KEY } from './persist';
import { planSession } from '../engine/planner';
import { profile } from '../engine/testutil';
import { EX } from '../engine/exercises';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const start = (): AppState => {
  let s = reducer(initialState, { type: 'ONBOARD', profile: profile() });
  const w = planSession({ profile: s.profile!, history: [], today: '2026-10-05' }).workout;
  s = reducer(s, { type: 'START', workout: w, now: 1000 });
  return s;
};

describe('store', () => {
  it('logging sets marks them done and starts the rest timer', () => {
    let s = start();
    const we = s.active!.exercises[0];
    const set = we.sets.find(x => !x.warmup)!;
    s = reducer(s, { type: 'LOG_SET', uid: we.uid, setId: set.id, weight: 50, reps: 9, now: 5000 });
    const got = s.active!.exercises[0].sets.find(x => x.id === set.id)!;
    expect(got).toMatchObject({ done: true, weight: 50, reps: 9 });
    expect(s.active!.restEndsAt).toBe(5000 + we.rest * 1000);
    s = reducer(s, { type: 'UNDO_SET', uid: we.uid, setId: set.id });
    expect(s.active!.exercises[0].sets.find(x => x.id === set.id)!.done).toBe(false);
  });

  it('survives a full serialise → reload cycle mid-workout (persistence)', () => {
    let s = start();
    const we = s.active!.exercises[0];
    const set = we.sets.find(x => !x.warmup)!;
    s = reducer(s, { type: 'LOG_SET', uid: we.uid, setId: set.id, weight: 50, reps: 9, now: 5000 });
    s = reducer(s, { type: 'SET_EFFORT', uid: we.uid, effort: 'hard' });
    const st = new MemStorage();
    expect(saveState(s, st)).toBe(true);
    const loaded = loadState(st);
    expect(loaded.error).toBeUndefined();
    expect(loaded.state).toEqual(s);
    expect(loaded.state.active!.exercises[0].effort).toBe('hard');
  });

  it('add / remove set only touches unlogged working sets and keeps at least one', () => {
    let s = start();
    const uid = s.active!.exercises[0].uid;
    const n0 = s.active!.exercises[0].sets.filter(x => !x.warmup).length;
    s = reducer(s, { type: 'ADD_SET', uid });
    expect(s.active!.exercises[0].sets.filter(x => !x.warmup).length).toBe(n0 + 1);
    for (let i = 0; i < 10; i++) s = reducer(s, { type: 'REMOVE_SET', uid });
    expect(s.active!.exercises[0].sets.filter(x => !x.warmup).length).toBe(1);
  });

  it('finishing moves the workout to history and clears active + quick-swap options', () => {
    let s = start();
    s = reducer(s, { type: 'SET_OPTIONS', date: '2026-10-05', opts: { minutes: 20 } });
    s = reducer(s, { type: 'FINISH', now: 9999 });
    expect(s.active).toBeNull();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].finishedAt).toBe(9999);
    expect(s.options).toBeNull();
  });

  it('corrupt storage does not crash and the blob is preserved; newer versions are not overwritten', () => {
    const st = new MemStorage();
    st.setItem(STORAGE_KEY, '{not json');
    const r = loadState(st);
    expect(r.error).toBe('corrupt');
    expect(r.state).toEqual(initialState);
    expect(st.getItem(`${STORAGE_KEY}:corrupt`)).toBe('{not json');
    st.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, v: 99 }));
    expect(loadState(st).error).toBe('newer');
    expect(loadState(null).error).toBe('unavailable');
  });

  it('avoid list and temp limits are managed immutably', () => {
    let s = start();
    s = reducer(s, { type: 'AVOID', id: 'squat' });
    s = reducer(s, { type: 'AVOID', id: 'squat' });
    expect(s.profile!.avoid).toEqual(['squat']);
    s = reducer(s, { type: 'ADD_LIMIT', area: 'shoulder', until: '2026-10-12' });
    s = reducer(s, { type: 'ADD_LIMIT', area: 'shoulder', until: '2026-10-13' });
    expect(s.tempLimits).toEqual([{ area: 'shoulder', until: '2026-10-13' }]);
    s = reducer(s, { type: 'REMOVE_LIMIT', area: 'shoulder' });
    expect(s.tempLimits).toEqual([]);
  });

  it('planned exercises are real and weights are finite', () => {
    const s = start();
    for (const we of s.active!.exercises) {
      expect(EX[we.exerciseId]).toBeTruthy();
      for (const set of we.sets) expect(Number.isFinite(set.weight)).toBe(true);
    }
  });
});
