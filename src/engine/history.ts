import type { SetLog, Workout, WorkoutExercise } from './types';
import { EX } from './exercises';
import { diffDays } from './dates';
import { perfScore, workingDone } from './rules';

export interface Exposure {
  date: string;
  workoutId: string;
  we: WorkoutExercise;
  sets: SetLog[];
}

export function finished(history: Workout[]): Workout[] {
  return history.filter(w => w.finishedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.finishedAt! - b.finishedAt!));
}

/** every time the user actually did this exercise (≥1 completed working set), oldest first */
export function exposures(history: Workout[], exerciseId: string): Exposure[] {
  const out: Exposure[] = [];
  for (const w of finished(history)) {
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId || we.skipped) continue;
      const sets = workingDone(we);
      if (sets.length) out.push({ date: w.date, workoutId: w.id, we, sets });
    }
  }
  return out;
}

export function topWeight(sets: SetLog[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight), 0);
}

export function bestScore(exp: Exposure, bodyweight?: number): number {
  const ex = EX[exp.we.exerciseId];
  return exp.sets.reduce((m, s) => Math.max(m, perfScore(ex, s, bodyweight)), 0);
}

/** exposures since the last planned drop (reset / deload) – the only fair baseline for "has this stalled?" */
export function currentBlock(exps: Exposure[]): Exposure[] {
  let start = 0;
  exps.forEach((e, i) => { if (e.we.rxAction === 'reset' || e.we.rxAction === 'deload') start = i; });
  return exps.slice(start);
}

/**
 * Stalled = within the last `windowDays` (≥ `minCount` exposures) nothing beat the best earlier result
 * of the current block by ≥ 1 %. Time-based so noisy sessions in one week never count as a plateau.
 */
export function isStalled(exps: Exposure[], windowDays: number, bodyweight?: number, minCount = 3): boolean {
  const block = currentBlock(exps);
  if (block.length < minCount + 1) return false;
  const lastDate = block[block.length - 1].date;
  const win = block.filter(e => diffDays(lastDate, e.date) <= windowDays);
  const prior = block.filter(e => diffDays(lastDate, e.date) > windowDays);
  if (win.length < minCount || !prior.length) return false;
  const best = (xs: Exposure[]) => Math.max(...xs.map(e => bestScore(e, bodyweight)));
  return best(win) <= best(prior) * 1.01;
}

/** days of flat performance that count as a plateau */
export function stallWindow(kind: 'compound' | 'isolation'): number {
  return kind === 'compound' ? 21 : 35;
}
