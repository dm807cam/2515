import type { DeloadState, Level, Workout } from './types';
import { EX } from './exercises';
import { addDays, diffDays, weekday } from './dates';
import { bestScore, exposures, finished } from './history';
import { workingDone } from './rules';

export type FatigueLevel = 'fresh' | 'normal' | 'elevated' | 'high';

export interface FatigueReport {
  level: FatigueLevel;
  score: number;
  reasons: string[];
  recommendDeload: boolean;
}

const NO_BASELINE = ['deload', 'reset', 'reduce', 'trim', 'advance', 'estimate', 'start'];

/** Share of recently-repeated exercises whose performance dropped > 5 % without a planned lighter load. */
function performanceDropShare(history: Workout[], lastSessions: Workout[], bodyweight?: number): { share: number; n: number } {
  let n = 0, drops = 0;
  for (const w of lastSessions) {
    for (const we of w.exercises) {
      if (we.skipped || NO_BASELINE.includes(we.rxAction)) continue;
      const ex = EX[we.exerciseId];
      if (!ex || ex.kind !== 'compound') continue;
      const exps = exposures(history, we.exerciseId).filter(e => e.workoutId === w.id || e.date < w.date);
      const idx = exps.findIndex(e => e.workoutId === w.id);
      if (idx < 1) continue;
      n++;
      if (bestScore(exps[idx], bodyweight) < bestScore(exps[idx - 1], bodyweight) * 0.95) drops++;
    }
  }
  return { share: n ? drops / n : 0, n };
}

export function assessFatigue(
  history: Workout[],
  today: string,
  opts: { level: Level; deload: DeloadState; tiredToday?: boolean; bodyweight?: number },
): FatigueReport {
  const done = finished(history).filter(w => diffDays(today, w.date) <= 21);
  const last3 = done.slice(-3);
  const last2 = done.slice(-2);
  const reasons: string[] = [];
  let score = 0;

  const drop = performanceDropShare(history, last2, opts.bodyweight);
  if (drop.n >= 2) {
    if (drop.share >= 0.4) { score += 2; reasons.push('Strength dipped on several lifts in your last two sessions'); }
    else if (drop.share >= 0.25) { score += 1; reasons.push('Performance dipped slightly on some lifts'); }
  }

  const rated = last3.flatMap(w => w.exercises.filter(we => we.effort && !we.skipped));
  if (rated.length >= 3) {
    const hard = rated.filter(we => we.effort === 'hard').length / rated.length;
    if (hard >= 0.75) { score += 2; reasons.push('Most recent exercises felt "hard"'); }
    else if (hard >= 0.5) { score += 1; reasons.push('Many recent exercises felt "hard"'); }
  }

  if (last3.length >= 2) {
    const planned = last3.reduce((a, w) => a + w.exercises.reduce((b, we) => b + we.targetSets, 0), 0);
    const doneSets = last3.reduce((a, w) => a + w.exercises.reduce((b, we) => b + (we.skipped ? 0 : Math.min(we.targetSets, workingDone(we).length)), 0), 0);
    if (planned > 0 && doneSets / planned < 0.75) { score += 1; reasons.push('You have been finishing fewer sets than planned'); }
  }

  const all = finished(history);
  if (all.length >= 6) {
    const since = opts.deload.lastDeloadEnd && opts.deload.lastDeloadEnd > all[0].date ? opts.deload.lastDeloadEnd : all[0].date;
    const weeks = Math.floor(diffDays(today, since) / 7);
    if (weeks >= 7) { score += 2; reasons.push(`${weeks} weeks since a lighter week`); }
    else if (weeks >= 5) { score += 1; reasons.push(`${weeks} weeks since a lighter week`); }
  }

  const inDeload = !!opts.deload.until && opts.deload.until >= today;
  let level: FatigueLevel = score >= 3 ? 'high' : score === 2 ? 'elevated' : score === 1 ? 'normal' : 'fresh';
  if (opts.tiredToday && level === 'fresh') level = 'normal';
  if (opts.tiredToday && level === 'normal') level = 'elevated';

  const dismissed = !!opts.deload.dismissedUntil && opts.deload.dismissedUntil >= today;
  return { level, score, reasons, recommendDeload: score >= 3 && !inDeload && !dismissed };
}

export function deloadUntil(today: string): string {
  // through the coming Sunday; if that is < 4 days away, through the following Sunday
  const toSunday = 6 - weekday(today);
  return addDays(today, toSunday >= 4 ? toSunday : toSunday + 7);
}
