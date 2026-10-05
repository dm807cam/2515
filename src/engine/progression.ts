import type { Exercise, Goal, Level, RxAction, Workout } from './types';
import { EX, canDo } from './exercises';
import type { FatigueLevel } from './fatigue';
import { exposures, isStalled, stallWindow, topWeight, bestScore } from './history';
import { epley, repRange, roundTo, targetRir } from './rules';
import type { Equipment } from './types';

export interface RxContext {
  goal: Goal;
  level: Level;
  bodyweight?: number;
  fatigue: FatigueLevel;
  mode: 'normal' | 'trim' | 'deload';
  sets: number;
  history: Workout[];
  available: Set<Equipment>;
}

export interface Prescription {
  weight: number;
  targetReps: number[];
  repMin: number;
  repMax: number;
  rir: number;
  action: RxAction;
  reason: string;
  advanceTo?: string;
}

export const FATIGUE_HOLD = 'You hit the top reps, but recent sessions look tiring — hold the load one more time.';

const LEVEL_FACTOR: Record<Level, number> = { beginner: 0.9, intermediate: 1.3, advanced: 1.7 };

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

/** First-time weight: from a related exercise the user has done, else from bodyweight × novice ratio. */
export function estimateStart(ex: Exercise, ctx: Pick<RxContext, 'level' | 'bodyweight' | 'history'>): { weight: number; source?: string; assumedBw: boolean } {
  const bw = ctx.bodyweight ?? 75;
  const assumedBw = ctx.bodyweight == null;
  if (ex.load === 'bodyweight' || ex.startRatio <= 0) return { weight: 0, assumedBw };

  // find the most relevant exercise with history
  let best: { src: Exercise; sim: number; e1rm: number } | null = null;
  const seen = new Set<string>();
  for (const w of [...ctx.history].reverse()) {
    if (!w.finishedAt) continue;
    for (const we of w.exercises) {
      const src = EX[we.exerciseId];
      if (!src || src.id === ex.id || seen.has(src.id) || src.load !== 'external' || src.startRatio <= 0) continue;
      seen.add(src.id);
      let sim = cosine(ex, src) * (src.pattern === ex.pattern ? 1 : 0.7);
      if (src.kind !== ex.kind) sim *= 0.85;
      if (sim < 0.7) continue;
      const exps = exposures(ctx.history, src.id);
      if (!exps.length) continue;
      const e1 = Math.max(...exps.slice(-3).map(e => bestScore(e)));
      if (!best || sim > best.sim) best = { src, sim, e1rm: e1 };
    }
  }
  if (best) {
    const w10src = best.e1rm / epley(1, 10);
    const idx = Math.min(4, Math.max(0.5, w10src / (best.src.startRatio * bw)));
    return { weight: roundTo(idx * ex.startRatio * bw * 0.9, ex.increment), source: best.src.name, assumedBw };
  }
  return { weight: roundTo(ex.startRatio * bw * LEVEL_FACTOR[ctx.level], ex.increment), assumedBw };
}

function fill(n: number, base: number[]): number[] {
  if (!base.length) return Array(n).fill(0);
  return Array.from({ length: n }, (_, i) => base[Math.min(i, base.length - 1)]);
}

export function prescribe(ex: Exercise, ctx: RxContext): Prescription {
  const [repMin, repMax] = repRange(ex, ctx.goal, ctx.level);
  let rir = targetRir(ex, ctx.goal, ctx.level);
  if (ctx.mode === 'deload') rir += 2;
  else if (ctx.mode === 'trim') rir += 1;
  const n = ctx.sets;
  const base = { repMin, repMax, rir };
  const bodyweight = ex.load === 'bodyweight';
  const inc = ex.increment;
  const exps = exposures(ctx.history, ex.id);

  // ── never done: estimate ──
  if (!exps.length) {
    const est = estimateStart(ex, ctx);
    const startReps = Math.round(repMin + (repMax - repMin) * (bodyweight ? 0.3 : 0.4));
    let w = est.weight;
    if (ctx.mode === 'deload' && !bodyweight) w = roundTo(w * 0.92, inc);
    const reason = bodyweight
      ? `New for you — pick the variation you can do for about ${startReps} reps with ${rir} in reserve.`
      : est.source
        ? `Estimated from your ${est.source}. First time on this lift — adjust to ${rir} reps in reserve.`
        : `Starting estimate${est.assumedBw ? ' (add your bodyweight in Settings for better guesses)' : ''}. Adjust so the last rep leaves ~${rir} in reserve.`;
    return { ...base, weight: w, targetReps: Array(n).fill(startReps), action: est.source ? 'estimate' : 'start', reason };
  }

  const last = exps[exps.length - 1];
  const lastW = topWeight(last.sets);
  const atW = last.sets.filter(s => s.weight >= lastW * 0.97);
  const reps = atW.map(s => s.reps);
  const completedAll = atW.length >= last.we.targetSets;
  const effort = last.we.effort;
  const avg = reps.reduce((a, b) => a + b, 0) / reps.length;
  const builtTargets = (coarseJump: boolean): number[] => fill(n, reps.map(r => Math.min(repMax + (coarseJump ? 3 : 0), r + 1)));
  const same = (): number[] => fill(n, reps.map(r => Math.max(repMin, Math.min(repMax, r))));

  const ret = (weight: number, targetReps: number[], action: RxAction, reason: string, advanceTo?: string): Prescription =>
    ({ ...base, weight, targetReps, action, reason, advanceTo });

  // ── deload week: lighter load, same rep quality ──
  if (ctx.mode === 'deload') {
    const w = bodyweight ? lastW : roundTo(lastW * 0.92, inc);
    return ret(w, fill(n, [Math.max(repMin, Math.min(repMax, Math.round(avg)))]), 'deload', 'Recovery week — lighter load, stop well short of failure.');
  }

  // ── plateau reset ──
  if (isStalled(exps, stallWindow(ex.kind), ctx.bodyweight)) {
    if (bodyweight && ex.progressTo && canDo(EX[ex.progressTo], ctx.available)) {
      return ret(0, [], 'advance', `Stalled on ${ex.name} — moving to a harder variation.`, ex.progressTo);
    }
    if (!bodyweight) {
      return ret(roundTo(lastW * 0.9, inc), fill(n, [repMin + 1]), 'reset', 'Progress has stalled for 3+ weeks — drop 10% and rebuild with clean reps.');
    }
  }

  // ── far below the range → reduce ──
  const low = reps.filter(r => r < repMin).length;
  // marginal misses (1 rep under) just hold and rebuild; only clearly-too-heavy loads get reduced
  if (!bodyweight && reps.length && low >= Math.ceil(reps.length / 2) && repMin - avg >= 1.5) {
    // pick the weight the implied max says you can do for ~repMin reps with the target RIR left, within 7–25 % below
    const calib = epley(lastW, avg) / (1 + (repMin + rir) / 30);
    const w = Math.min(lastW - inc, roundTo(Math.min(lastW * 0.93, Math.max(calib, lastW * 0.75)), inc));
    return ret(Math.max(inc, w), fill(n, [repMin]), 'reduce', `Reps fell below ${repMin} last time — a lighter weight lets you rebuild.`);
  }

  // ── didn't finish the sets: repeat ──
  if (!completedAll) {
    return ret(lastW, same(), 'hold', 'You did not finish every set last time — repeat the same weight and target.');
  }

  // ── top of the range on every set → progress ──
  // reps naturally fade across sets, so "top" = at least half the sets at the ceiling and none more than 1 rep short
  // a coarse jump (one increment > 12 % of the load) has to be earned with extra reps, otherwise it just fails and reverts
  const coarse = !bodyweight && inc > lastW * 0.12;
  const topRep = repMax + (coarse ? 2 : 0);
  const allTop = reps.every(r => r >= topRep - 1) && reps.filter(r => r >= topRep).length >= Math.ceil(reps.length / 2);
  if (allTop) {
    // pause for fatigue once, never twice in a row (otherwise a persistent "elevated" blocks progress forever)
    if ((ctx.fatigue === 'elevated' || ctx.fatigue === 'high') && last.we.rxReason !== FATIGUE_HOLD) {
      return ret(lastW, fill(n, [repMax]), 'hold', FATIGUE_HOLD);
    }
    if (effort === 'hard') {
      return ret(lastW, fill(n, [repMax]), 'hold', 'Top reps, but it was a grind — repeat once to own the weight before adding load.');
    }
    if (bodyweight) {
      if (ex.canAddLoad) {
        return ret(lastW + inc, fill(n, [repMin]), 'increase', `All sets at ${repMax} reps — add ${inc} kg and start the reps again.`);
      }
      if (ex.progressTo && canDo(EX[ex.progressTo], ctx.available)) {
        return ret(0, [], 'advance', `All sets at ${repMax} — ready for a harder variation.`, ex.progressTo);
      }
      return ret(0, fill(n, reps.map(r => r + 1)), 'build', 'Keep adding reps — slow the lowering phase for extra challenge.');
    }
    let step = inc;
    const overshoot = avg - repMax;
    if (overshoot >= 3) step = Math.max(inc, roundTo(lastW * 0.1, inc));
    else if (effort === 'easy' && ctx.level !== 'advanced') step = inc * 2;
    step = Math.min(step, Math.max(inc, roundTo(lastW * 0.12, inc)));
    return ret(lastW + step, fill(n, [repMin + 1]), 'increase', `Top of the range (${repMax}) on nearly every set — add ${step} kg.`);
  }

  // ── otherwise: same weight, +1 rep ──
  if (effort === 'hard') {
    return ret(lastW, same(), 'hold', 'That was a hard one — repeat and match last time before pushing for more.');
  }
  return ret(lastW, builtTargets(coarse), 'build', coarse && reps.every(r => r >= repMax) ? 'Same weight — the next jump is big, so own a few extra reps first.' : 'Same weight — aim for one more rep on each set.');
}
