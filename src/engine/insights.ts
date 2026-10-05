import type { DeloadState, Muscle, Profile, Workout } from './types';
import { MUSCLES } from './types';
import { EX, MUSCLE_LABEL } from './exercises';
import { addDays, DAY_LABELS, diffDays, weekStart } from './dates';
import { assessFatigue } from './fatigue';
import { bestScore, exposures, finished, isStalled, stallWindow } from './history';
import { muscleSets } from './rules';
import { buildDashboard, FREQ_GROUPS } from './stats';

export interface Insight {
  id: string;
  tone: 'good' | 'info' | 'warn';
  title: string;
  body: string;
  action?: 'settings' | 'deload';
  /** higher = more likely the cause */
  weight: number;
}

function weeklyMuscleSets(all: Workout[], level: Profile['level'], ws: string): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map(m => [m, 0])) as Record<Muscle, number>;
  for (const w of all.filter(x => x.date >= ws && x.date <= addDays(ws, 6))) {
    const ms = muscleSets(w, level);
    for (const m of MUSCLES) out[m] += ms[m];
  }
  return out;
}

/**
 * Pattern-based diagnosis: connects data points rather than listing them.
 * No medical claims — recovery language stays about training load and performance.
 */
export function diagnose(profile: Profile, history: Workout[], today: string, deload: DeloadState): Insight[] {
  const all = finished(history);
  const out: Insight[] = [];
  if (all.length < 3) return out;
  const level = profile.level;
  const curWs = weekStart(today);
  const dash = buildDashboard(profile, history, today);

  // 1. consistency
  const done = dash.consistency.weeks.filter(w => w.weekStart !== curWs);
  if (done.length >= 2) {
    const d = done.reduce((a, w) => a + Math.min(w.done, w.planned), 0), p = done.reduce((a, w) => a + w.planned, 0);
    if (p && d / p < 0.6) {
      out.push({
        id: 'consistency', tone: 'warn', weight: 9, action: 'settings',
        title: 'Consistency is the bottleneck',
        body: `You completed ${d} of ${p} planned sessions over the last ${done.length} weeks. A plan with fewer or shorter sessions that you actually do beats a bigger one you skip — try ${Math.max(2, profile.days.length - 1)} days or ${Math.max(20, profile.minutes - 10)} minutes.`,
      });
    }
  }

  // 2. frequency shortfall
  const lastWeeks = [1, 2, 3].map(i => addDays(curWs, -7 * i));
  for (const g of FREQ_GROUPS) {
    let short = 0;
    for (const ws of lastWeeks) {
      const n = all.filter(w => w.date >= ws && w.date <= addDays(ws, 6) && g.muscles.reduce((a, m) => a + muscleSets(w, level)[m], 0) >= g.threshold).length;
      if (all.some(w => w.date >= ws && w.date <= addDays(ws, 6)) && n < 2) short++;
    }
    if (short >= 2 && g.id !== 'arms') {
      out.push({
        id: `freq-${g.id}`, tone: 'warn', weight: 6,
        title: `${g.label} is getting trained once a week`,
        body: `In ${short} of the last 3 weeks ${g.label.toLowerCase()} was trained fewer than 2×. Hitting a muscle twice usually beats the same sets in one session.`,
      });
    }
  }

  // 3. plateau with context
  const stalled: string[] = [];
  for (const ex of Object.values(EX)) {
    if (ex.kind !== 'compound' || ex.load !== 'external') continue;
    const exps = exposures(history, ex.id).filter(e => diffDays(today, e.date) <= 70);
    if (diffDays(today, exps[exps.length - 1]?.date ?? '1970-01-01') <= 14 && isStalled(exps, stallWindow('compound'), profile.bodyweight)) stalled.push(ex.id);
  }
  for (const id of stalled.slice(0, 2)) {
    const ex = EX[id];
    const exps = exposures(history, id);
    const best = Math.round(Math.max(...exps.slice(-4).map(e => bestScore(e))) * 10) / 10;
    const primary = (Object.entries(ex.muscles) as [Muscle, number][]).sort((a, b) => b[1] - a[1])[0][0];
    const wsNow = addDays(curWs, -7), wsPrev = addDays(curWs, -28);
    const recentVol = [0, 1, 2].map(i => weeklyMuscleSets(all, level, addDays(wsNow, -7 * i))[primary]);
    const baseVol = weeklyMuscleSets(all, level, wsPrev)[primary];
    const volUp = baseVol > 0 && recentVol[0] > baseVol * 1.15;
    const rated = all.slice(-4).flatMap(w => w.exercises.filter(e => e.effort));
    const hard = rated.length >= 3 && rated.filter(e => e.effort === 'hard').length / rated.length >= 0.4;
    let body = `${ex.name} has not improved for 3 weeks (best estimated max ${best} kg).`;
    if (volUp) body += ` ${MUSCLE_LABEL[primary]} volume has gone up recently`;
    if (hard) body += `${volUp ? ' and' : ' Recent sessions also'} felt hard.`; else if (volUp) body += '.';
    body += volUp || hard ? ` Consider reducing ${MUSCLE_LABEL[primary].toLowerCase()} volume this week.` : ' The load will be reset by 10% so you can rebuild with clean reps.';
    out.push({ id: `plateau-${id}`, tone: 'warn', weight: volUp || hard ? 8 : 5, title: `${ex.name} has stalled`, body });
  }

  // 4. fatigue
  const fat = assessFatigue(history, today, { level, deload, bodyweight: profile.bodyweight });
  if (fat.level === 'high' || fat.level === 'elevated') {
    out.push({
      id: 'fatigue', tone: 'warn', weight: fat.level === 'high' ? 9 : 6, action: fat.recommendDeload ? 'deload' : undefined,
      title: 'Training load looks high',
      body: `${fat.reasons.slice(0, 2).join('. ')}. ${fat.level === 'high' ? 'A lighter week usually brings performance back.' : 'Increases are paused until it settles.'}`,
    });
  }

  // 5. too much per session
  if (dash.hardSets.over.some(o => o.count >= 2)) {
    const o = dash.hardSets.over[0];
    out.push({
      id: 'cap', tone: 'info', weight: 4,
      title: `${MUSCLE_LABEL[o.muscle]} often gets more than ${dash.hardSets.cap} hard sets in a session`,
      body: 'Past that point extra sets add fatigue faster than growth. Spread them over another day instead.',
    });
  }

  // 6. substitutions
  const recent = all.filter(w => diffDays(today, w.date) <= 21);
  const exs = recent.flatMap(w => w.exercises.filter(e => !e.skipped));
  const swapped = exs.filter(e => e.origExerciseId).length;
  if (exs.length >= 8 && swapped / exs.length > 0.3) {
    out.push({
      id: 'swaps', tone: 'info', weight: 5, action: 'settings',
      title: 'Lots of exercise swaps',
      body: `${swapped} of ${exs.length} exercises were swapped recently. Progress is tracked per exercise, so frequent swaps slow it down. If equipment is the reason, update your equipment list; if you dislike an exercise, mark it "never again".`,
    });
  }

  // 7. weekday pattern
  const missedByDay = new Map<number, number>();
  for (let i = 1; i <= 4; i++) {
    const ws = addDays(curWs, -7 * i);
    for (const wd of profile.days) {
      const date = addDays(ws, wd);
      if (!all.some(w => w.date >= ws && w.date <= addDays(ws, 6) && w.date === date)) missedByDay.set(wd, (missedByDay.get(wd) ?? 0) + 1);
    }
  }
  const worst = [...missedByDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3 && all.length >= 6) {
    out.push({
      id: 'weekday', tone: 'info', weight: 5, action: 'settings',
      title: `${DAY_LABELS[worst[0]]} keeps getting missed`,
      body: `You skipped ${DAY_LABELS[worst[0]]} in ${worst[1]} of the last 4 weeks. Moving it to a day that fits your week makes the plan easier to keep.`,
    });
  }

  if (!out.length) {
    const p = dash.progress.filter(x => x.total > 0).slice(-2);
    const improved = p.reduce((a, x) => a + x.improved, 0), total = p.reduce((a, x) => a + x.total, 0);
    out.push({
      id: 'ok', tone: 'good', weight: 0,
      title: 'Nothing is holding you back',
      body: total ? `${improved} of ${total} repeated exercises improved over the last two weeks, and consistency and volume are inside your limits. Keep going.` : 'Consistency and volume look healthy. Keep logging — trends appear after a few weeks.',
    });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 4);
}

