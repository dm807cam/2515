import type { Equipment, Exercise, Joint, Pattern, Profile, Workout } from './types';
import { EXERCISES, EX, canDo, isBlockedByJoint } from './exercises';
import { exposures } from './history';
import { assessFatigue } from './fatigue';
import { EMPTY_DELOAD } from './planner';
import { prescribe } from './progression';

export interface Substitute {
  exercise: Exercise;
  score: number;
  why: string;
  weight: number;
  hasHistory: boolean;
  note: string;
}

const AFFINITY: [Pattern, Pattern, number][] = [
  ['h_push', 'inc_push', 0.8], ['h_push', 'chest_fly', 0.5], ['inc_push', 'chest_fly', 0.45], ['inc_push', 'v_push', 0.5],
  ['h_push', 'v_push', 0.3], ['h_pull', 'v_pull', 0.6], ['h_pull', 'rear_delt', 0.4], ['v_pull', 'rear_delt', 0.2],
  ['squat', 'lunge', 0.8], ['squat', 'knee_ext', 0.5], ['lunge', 'knee_ext', 0.5], ['hinge', 'hip_ext', 0.6],
  ['hinge', 'knee_flex', 0.5], ['hip_ext', 'knee_flex', 0.3], ['elbow_ext', 'h_push', 0.2], ['lat_raise', 'rear_delt', 0.3],
  ['lat_raise', 'v_push', 0.3],
];

export function patternAffinity(a: Pattern, b: Pattern): number {
  if (a === b) return 1;
  const hit = AFFINITY.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? hit[2] : 0;
}

function cosine(a: Exercise, b: Exercise): number {
  const keys = new Set([...Object.keys(a.muscles), ...Object.keys(b.muscles)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const x = (a.muscles as Record<string, number>)[k] ?? 0;
    const y = (b.muscles as Record<string, number>)[k] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function repOverlap(a: [number, number], b: [number, number]): number {
  const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
  const span = Math.min(a[1] - a[0], b[1] - b[0]) || 1;
  return Math.max(0, Math.min(1, (hi - lo) / span));
}

export function equipmentLabel(e: Exercise): string {
  if (!e.equipment.length) return 'Bodyweight';
  if (e.equipment.includes('barbell')) return 'Barbell';
  if (e.equipment.includes('dumbbell')) return 'Dumbbells';
  if (e.equipment.includes('machine')) return 'Machine';
  if (e.equipment.includes('cable')) return 'Cable';
  if (e.equipment.includes('band')) return 'Band';
  if (e.equipment.includes('bar')) return 'Pull-up bar';
  return 'Equipment';
}

export interface SubContext {
  profile: Profile;
  history: Workout[];
  available: Set<Equipment>;
  limits: Joint[];
  /** exercises already in this workout */
  inWorkout: string[];
  today: string;
  sets: number;
}

/**
 * Rank replacements that preserve the *intent* of an exercise: movement pattern first,
 * then the muscle credit profile, then kind / rep zone / skill. Hard filters: equipment,
 * joint limits, user-avoided, already in the workout.
 */
export function rankSubstitutes(sourceId: string, ctx: SubContext, n = 5): Substitute[] {
  const src = EX[sourceId];
  if (!src) return [];
  const avoid = new Set(ctx.profile.avoid);
  const out: Substitute[] = [];
  const fatigue = assessFatigue(ctx.history, ctx.today, { level: ctx.profile.level, deload: EMPTY_DELOAD });
  for (const c of EXERCISES) {
    if (c.id === src.id || ctx.inWorkout.includes(c.id) || avoid.has(c.id)) continue;
    if (!canDo(c, ctx.available) || isBlockedByJoint(c, ctx.limits)) continue;
    const hist = exposures(ctx.history, c.id).length > 0;
    if (!hist && EXERCISES.some(e => e.progressTo === c.id)) continue; // locked progression variants
    const pat = patternAffinity(src.pattern, c.pattern);
    const cos = cosine(src, c);
    let score = 0.5 * pat + 0.25 * cos + (src.kind === c.kind ? 0.08 : 0)
      + 0.07 * repOverlap(src.reps, c.reps) + 0.05 * (1 - Math.abs(src.skill - c.skill) / 2);
    if (hist) score += 0.05;
    score += 0.3 * ((c.q ?? 1) - 1); // fallback variants (floor press, cable press) rank below the real thing
    if (src.load === 'external' && c.load === 'bodyweight') score -= 0.08; // loadable beats improvised
    if (score < 0.4 || cos < 0.5) continue;
    const rx = prescribe(c, {
      goal: ctx.profile.goal, level: ctx.profile.level, bodyweight: ctx.profile.bodyweight, fatigue: fatigue.level,
      mode: 'normal', sets: ctx.sets, history: ctx.history, available: ctx.available,
    });
    const why = pat === 1 ? `Same movement · ${equipmentLabel(c)}`
      : cos >= 0.8 ? `Same muscles · ${equipmentLabel(c)}` : `Similar target · ${equipmentLabel(c)}`;
    out.push({ exercise: c, score, why, weight: rx.weight, hasHistory: hist, note: c.note ?? '' });
  }
  return out.sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id)).slice(0, n);
}

/** swap an exercise inside a workout, keeping intent and logging the origin */
export function swapExercise(
  w: Workout, uid: string, newId: string, ctx: Pick<SubContext, 'profile' | 'history' | 'available' | 'today'>,
): Workout {
  const cur = w.exercises.find(x => x.uid === uid);
  if (!cur) return w;
  const ex = EX[newId];
  const fatigue = assessFatigue(ctx.history, ctx.today, { level: ctx.profile.level, deload: EMPTY_DELOAD });
  const rx = prescribe(ex, {
    goal: ctx.profile.goal, level: ctx.profile.level, bodyweight: ctx.profile.bodyweight, fatigue: fatigue.level,
    mode: w.mode, sets: cur.targetSets, history: ctx.history, available: ctx.available,
  });
  const hadWarm = cur.sets.some(s => s.warmup);
  const working = Array.from({ length: cur.targetSets }, (_, i) => ({
    id: `${uid}-${newId}-s${i}`, weight: rx.weight, reps: rx.targetReps[i] ?? rx.repMin, done: false, targetReps: rx.targetReps[i] ?? rx.repMin,
  }));
  const warm = hadWarm && ex.load === 'external' && rx.weight >= 20
    ? [{ id: `${uid}-${newId}-w0`, weight: Math.max(ex.increment, Math.round((rx.weight * 0.5) / (ex.increment || 1)) * (ex.increment || 1)), reps: 6, done: false, warmup: true }]
    : [];
  const swapped = {
    ...cur,
    exerciseId: newId,
    origExerciseId: cur.origExerciseId ?? cur.exerciseId,
    sets: [...warm, ...working],
    repMin: rx.repMin, repMax: rx.repMax, rir: rx.rir, rxAction: rx.action, rxReason: rx.reason,
    effort: undefined, skipped: false,
  };
  return { ...w, exercises: w.exercises.map(x => (x.uid === uid ? swapped : x)) };
}
