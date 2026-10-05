import type { Effort, Exercise, Goal, Level, Muscle, Profile, SetLog, Workout, WorkoutExercise } from './types';
import { EFFORT_RIR, MUSCLES } from './types';
import { EX } from './exercises';

/**
 * The 2/5/15 framework expressed as parameters.
 *   2  -> WEEKLY_FREQ_TARGET (hits per muscle per week)
 *   5  -> sessionCap()       (weighted effective sets per muscle per session)
 *   15 -> MAX_SESSION_SETS   (+ default rep ceiling in repRange())
 */
export const WEEKLY_FREQ_TARGET = 2;
export const MAX_SESSION_SETS = 15;
export const MIN_EXERCISE_SETS = 2;
/** weighted effective sets that count as "training a muscle" in a session */
export const HIT_THRESHOLD = 2;

export const BASE_WEEKLY_TARGET: Record<Muscle, number> = {
  chest: 10, back: 10, shoulders: 8, biceps: 7, triceps: 7, quads: 8, hamstrings: 6, glutes: 4, calves: 4,
};

/** relative importance for deciding what survives when time is short */
export const MUSCLE_IMPORTANCE: Record<Muscle, number> = {
  chest: 1, back: 1, quads: 1, hamstrings: 1, shoulders: 0.75, glutes: 0.75, triceps: 0.55, biceps: 0.55, calves: 0.4,
};

export function sessionCap(level: Level): number {
  return level === 'beginner' ? 4 : 5;
}

/** Hard sets are sets taken to ≤ this many reps in reserve. Beginners misjudge effort, so be lenient. */
export function effortThreshold(level: Level): number {
  return level === 'beginner' ? 4 : 3;
}

/** rough sets-per-session ceiling from minutes available */
export function setCapForMinutes(minutes: number): number {
  return Math.max(5, Math.min(MAX_SESSION_SETS, Math.round(minutes / 2.6)));
}

export function weeklyTargets(p: Pick<Profile, 'goal' | 'level' | 'minutes'> & { days: number[] }): Record<Muscle, number> {
  const base = { ...BASE_WEEKLY_TARGET };
  if (p.goal === 'strength') {
    base.biceps *= 0.5; base.triceps *= 0.5; base.calves *= 0.5; base.shoulders *= 0.8;
  }
  const goalMul = p.goal === 'general' ? 0.8 : 1;
  const levelMul = p.level === 'beginner' ? 0.8 : p.level === 'advanced' ? 1.1 : 1;
  const freq = p.days.length;
  const capacity = freq * setCapForMinutes(p.minutes) * 1.5;
  const sum = Object.values(base).reduce((a, b) => a + b, 0);
  const scale = Math.max(0.55, Math.min(1, capacity / sum));
  const out = {} as Record<Muscle, number>;
  for (const m of MUSCLES) out[m] = Math.round(base[m] * goalMul * levelMul * scale * 2) / 2;
  return out;
}

export function repRange(e: Exercise, goal: Goal, level: Level): [number, number] {
  if (goal === 'strength' && level !== 'beginner' && e.kind === 'compound' && e.strengthReps) return e.strengthReps;
  return e.reps;
}

/** reps in reserve to aim for */
export function targetRir(e: Exercise, goal: Goal, level: Level): number {
  let rir = e.kind === 'compound' ? 2 : 1;
  if (level === 'beginner') rir += 1;
  if (goal === 'general') rir += 1;
  return rir;
}

export function restSeconds(e: Exercise, goal: Goal): number {
  let s: number;
  if (e.kind === 'isolation') s = 75;
  else s = e.fatigue === 3 ? 150 : e.fatigue === 2 ? 120 : 90;
  if (goal === 'strength' && e.kind === 'compound') s *= 1.25;
  return Math.round(s / 15) * 15;
}

export function estimateMinutes(items: { exerciseId: string; sets: number; rest: number }[], warmups: number): number {
  let sec = warmups * 75;
  for (const it of items) {
    const work = EX[it.exerciseId]?.unilateral ? 90 : 45;
    sec += 60 + it.sets * work + Math.max(0, it.sets - 1) * it.rest;
  }
  return Math.max(1, Math.round(sec / 60));
}

export function roundTo(x: number, inc: number): number {
  if (inc <= 0) return Math.round(x);
  return Math.max(inc, Math.round(x / inc) * inc);
}

// ───────────── performance maths ─────────────

export function epley(weight: number, reps: number): number {
  return weight * (1 + Math.min(reps, 12) / 30);
}

/** comparable performance score for an exercise set; null when it can't be compared meaningfully */
export function perfScore(e: Exercise, s: Pick<SetLog, 'weight' | 'reps'>, bodyweight?: number): number {
  if (e.load === 'external') return epley(s.weight, s.reps);
  if (e.canAddLoad && bodyweight) return epley(bodyweight + s.weight, s.reps);
  return s.reps + s.weight; // reps (+ added load as a tie-breaker)
}

export function workingDone(we: WorkoutExercise): SetLog[] {
  return we.sets.filter(s => s.done && !s.warmup);
}

export function setIsEffective(we: WorkoutExercise, level: Level): boolean {
  const rir = we.effort ? EFFORT_RIR[we.effort] : we.rir;
  return rir <= effortThreshold(level);
}

/** weighted per-muscle sets; planning counts completed sets, stats can ask for effective-only */
export function muscleSets(w: Workout, level: Level, effectiveOnly = false): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map(m => [m, 0])) as Record<Muscle, number>;
  for (const we of w.exercises) {
    if (we.skipped) continue;
    const ex = EX[we.exerciseId];
    if (!ex) continue;
    if (effectiveOnly && !setIsEffective(we, level)) continue;
    const n = workingDone(we).length;
    for (const [m, wt] of Object.entries(ex.muscles) as [Muscle, number][]) out[m] += n * wt;
  }
  return out;
}

export function workingSetCount(w: Workout): number {
  return w.exercises.reduce((a, we) => a + (we.skipped ? 0 : workingDone(we).length), 0);
}

export function effortLabel(e: Effort): string {
  return e === 'easy' ? 'Easy' : e === 'right' ? 'Just right' : 'Hard';
}
