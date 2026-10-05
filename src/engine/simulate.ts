import type { DeloadState, Profile, Workout } from './types';
import { EX } from './exercises';
import { addDays, parseKey, weekday } from './dates';
import { EMPTY_DELOAD, planSession } from './planner';
import { epley } from './rules';
import { estimateStart } from './progression';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimBehavior {
  seed?: number;
  /** probability of skipping a scheduled day */
  missProb?: number;
  /** weekly strength gain of the hidden capacity */
  weeklyGain?: number;
  /** days (dates) the user misses for sure */
  missDates?: string[];
  /** from this date on, performance gets worse (accumulated fatigue) */
  fatigueFrom?: string;
  deload?: DeloadState;
}

/** Runs the planner like a real user would for N weeks and returns the resulting history. */
export function simulate(profile: Profile, start: string, weeks: number, b: SimBehavior = {}): Workout[] {
  const rnd = mulberry32(b.seed ?? 7);
  const history: Workout[] = [];
  const hidden: Record<string, number> = {}; // hidden e1RM per exercise
  const gain = b.weeklyGain ?? (profile.level === 'beginner' ? 0.02 : 0.008);
  const deload = b.deload ?? EMPTY_DELOAD;
  let n = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(start, i);
    if (!profile.days.includes(weekday(date))) continue;
    if (b.missDates?.includes(date) || rnd() < (b.missProb ?? 0)) continue;
    const plan = planSession({ profile, history, today: date, deload });
    const w: Workout = JSON.parse(JSON.stringify(plan.workout));
    const weeksIn = i / 7;
    const tired = b.fatigueFrom && date >= b.fatigueFrom;
    for (const we of w.exercises) {
      const ex = EX[we.exerciseId];
      if (ex.load === 'external' && hidden[ex.id] == null) {
        const est = estimateStart(ex, { level: profile.level, bodyweight: profile.bodyweight, history });
        const personal = 0.85 + rnd() * 0.5;
        hidden[ex.id] = epley(est.weight || ex.increment, 10) * personal;
      }
      const cap = ex.load === 'external' ? hidden[ex.id] * (1 + gain * weeksIn) * (tired ? 0.9 : 1) : 0;
      let repsRaw = 0;
      let hardCount = 0, easyCount = 0, cnt = 0;
      we.sets.forEach((s, si) => {
        if (s.warmup) { s.done = true; return; }
        let reps: number;
        if (ex.load === 'external') {
          reps = Math.floor(30 * (cap / Math.max(0.1, s.weight) - 1) - we.rir + (rnd() - 0.5) * 1.5 - si * 0.5);
        } else {
          reps = Math.floor((s.targetReps ?? we.repMin) + (rnd() - 0.4) * 2.5 - si * 0.4 + weeksIn * 0.1 - (tired ? 3 : 0));
        }
        reps = Math.max(1, Math.min(ex.reps[1] + 4, reps));
        s.reps = reps;
        s.done = !(si === we.sets.length - 1 && rnd() < 0.03);
        repsRaw += reps; cnt++;
        if (reps < (s.targetReps ?? we.repMin)) hardCount++;
        if (reps >= (s.targetReps ?? 0) + 2) easyCount++;
      });
      void repsRaw;
      we.effort = hardCount >= cnt / 2 ? 'hard' : easyCount >= cnt / 2 ? 'easy' : 'right';
    }
    n++;
    w.id = `${w.id}-${n}`;
    w.startedAt = parseKey(date).getTime() + 17 * 3600e3;
    w.finishedAt = w.startedAt + 40 * 60e3;
    history.push(w);
  }
  return history;
}
