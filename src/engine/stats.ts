import type { Muscle, Profile, Workout } from './types';
import { MUSCLES } from './types';
import { EX } from './exercises';
import { addDays, weekStart } from './dates';
import { bestScore, exposures, finished, topWeight } from './history';
import { HIT_THRESHOLD, MAX_SESSION_SETS, muscleSets, perfScore, sessionCap, setIsEffective, workingDone, workingSetCount } from './rules';
import { computeWeek, TEMPLATES } from './weekly';

export interface WeekSummary { weekStart: string; done: number; planned: number; met: boolean }

/** a week "counts" when at least two thirds of the planned sessions happened */
export function weekMet(done: number, planned: number): boolean {
  return planned > 0 && done >= Math.ceil((planned * 2) / 3);
}

export interface FreqGroup { id: string; label: string; muscles: Muscle[]; threshold: number }
export const FREQ_GROUPS: FreqGroup[] = [
  { id: 'chest', label: 'Chest', muscles: ['chest'], threshold: HIT_THRESHOLD },
  { id: 'back', label: 'Back', muscles: ['back'], threshold: HIT_THRESHOLD },
  { id: 'shoulders', label: 'Shoulders', muscles: ['shoulders'], threshold: HIT_THRESHOLD },
  { id: 'arms', label: 'Arms', muscles: ['biceps', 'triceps'], threshold: 3 },
  { id: 'quads', label: 'Quads', muscles: ['quads'], threshold: HIT_THRESHOLD },
  { id: 'posterior', label: 'Hamstrings & glutes', muscles: ['hamstrings', 'glutes'], threshold: 3 },
];

function groupSets(ms: Record<Muscle, number>, g: FreqGroup): number {
  return g.muscles.reduce((a, m) => a + ms[m], 0);
}

export interface FreqRow {
  id: string; label: string; hits: number; status: 'ok' | 'pending' | 'attention'; weeksMet: number; weeksTotal: number;
}

export interface Dashboard {
  hasData: boolean;
  consistency: {
    thisWeek: { done: number; planned: number };
    weeks: WeekSummary[];
    adherence: number | null;
    streak: number;
    total: number;
  };
  frequency: FreqRow[];
  hardSets: { status: 'ok' | 'warn'; over: { muscle: Muscle; count: number }[]; sessions: number; peak: { muscle: Muscle; sets: number } | null; cap: number };
  workload: { sessions: number; avgSets: number; within: number; overRepSets: number; status: 'ok' | 'warn' };
  effectiveShare: number | null;
  lifts: LiftTrend[];
  progress: { weekStart: string; improved: number; total: number }[];
}

export interface LiftTrend {
  exerciseId: string; name: string; series: { date: string; value: number }[];
  first: number; latest: number; bestWeight: number; unit: 'kg' | 'reps'; repPR: number;
}

export function buildDashboard(profile: Profile, history: Workout[], today: string): Dashboard {
  const all = finished(history);
  const level = profile.level;
  const cap = sessionCap(level);
  const curWs = weekStart(today);
  const start = all.length ? weekStart(all[0].date) : curWs;
  const firstWs = weekStart(profile.createdOn) < start ? start : start;

  // ── consistency ──
  const weeks: WeekSummary[] = [];
  for (let ws = curWs, i = 0; i < 4 && ws >= firstWs; ws = addDays(ws, -7), i++) {
    const done = all.filter(w => w.date >= ws && w.date <= addDays(ws, 6)).length;
    const planned = profile.days.length;
    weeks.unshift({ weekStart: ws, done, planned, met: weekMet(done, planned) });
  }
  const completedWeeks = weeks.filter(w => w.weekStart !== curWs);
  const doneSum = completedWeeks.reduce((a, w) => a + Math.min(w.done, w.planned), 0);
  const plannedSum = completedWeeks.reduce((a, w) => a + w.planned, 0);
  let streak = 0;
  for (let ws = addDays(curWs, -7); ws >= firstWs; ws = addDays(ws, -7)) {
    const done = all.filter(w => w.date >= ws && w.date <= addDays(ws, 6)).length;
    if (weekMet(done, profile.days.length)) streak++; else break;
  }
  const curDone = all.filter(w => w.date >= curWs).length;
  if (weekMet(curDone, profile.days.length)) streak++;

  // ── 2: frequency ──
  const week = computeWeek(profile, history, today);
  // same rule as the planner: with fewer slots than planned sessions, the remaining sessions become full-body
  const truncated = week.slotsLeft > 0 && week.slotsLeft < week.remaining.length;
  const laterGroupCover = (g: FreqGroup) => truncated
    ? week.slotsLeft
    : week.remaining.slice(0, week.slotsLeft).filter(t => TEMPLATES[t].focus.some(m => g.muscles.includes(m))).length;
  const perWeekHits = (ws: string, g: FreqGroup): number => {
    let n = 0;
    for (const w of all.filter(x => x.date >= ws && x.date <= addDays(ws, 6))) {
      if (groupSets(muscleSets(w, level), g) >= g.threshold) n++;
    }
    return n;
  };
  const prevWeeks = [1, 2, 3, 4].map(i => addDays(curWs, -7 * i)).filter(ws => ws >= firstWs);
  const frequency: FreqRow[] = FREQ_GROUPS.map(g => {
    const hits = perWeekHits(curWs, g);
    const status: FreqRow['status'] = hits >= 2 ? 'ok' : hits + laterGroupCover(g) >= 2 ? 'pending' : 'attention';
    const weeksMet = prevWeeks.filter(ws => perWeekHits(ws, g) >= 2).length;
    return { id: g.id, label: g.label, hits, status, weeksMet, weeksTotal: prevWeeks.length };
  });

  // ── 5: hard sets per session (last 14 sessions) ──
  const recent = all.slice(-14);
  const overCount = new Map<Muscle, number>();
  let peak: { muscle: Muscle; sets: number } | null = null;
  for (const w of recent) {
    const ms = muscleSets(w, level);
    for (const m of MUSCLES) {
      if (ms[m] > cap + 0.5) overCount.set(m, (overCount.get(m) ?? 0) + 1);
      if (!peak || ms[m] > peak.sets) peak = { muscle: m, sets: ms[m] };
    }
  }
  const over = [...overCount.entries()].map(([muscle, count]) => ({ muscle, count })).sort((a, b) => b.count - a.count);
  const hardSets = { status: (over.some(o => o.count >= 2) ? 'warn' : 'ok') as 'ok' | 'warn', over, sessions: recent.length, peak, cap };

  // ── 15: workload ──
  const setCounts = recent.map(w => workingSetCount(w));
  const within = setCounts.filter(n => n <= MAX_SESSION_SETS).length;
  let overRep = 0;
  for (const w of recent) for (const we of w.exercises) {
    const ex = EX[we.exerciseId];
    if (ex?.kind === 'compound' && ex.load === 'external') overRep += workingDone(we).filter(s => s.reps > 15).length;
  }
  const workload = {
    sessions: recent.length,
    avgSets: setCounts.length ? Math.round((setCounts.reduce((a, b) => a + b, 0) / setCounts.length) * 10) / 10 : 0,
    within,
    overRepSets: overRep,
    status: (recent.length && (within < recent.length || overRep >= 3) ? 'warn' : 'ok') as 'ok' | 'warn',
  };

  // ── effective share ──
  let done = 0, eff = 0;
  for (const w of recent) for (const we of w.exercises) {
    if (we.skipped) continue;
    const n = workingDone(we).length;
    done += n;
    if (setIsEffective(we, level)) eff += n;
  }

  // ── lifts ──
  const ids = new Set<string>();
  for (const w of all) for (const we of w.exercises) if (!we.skipped) ids.add(we.exerciseId);
  const lifts: LiftTrend[] = [];
  for (const id of ids) {
    const ex = EX[id];
    if (!ex) continue;
    const loaded = ex.load === 'external' || (ex.canAddLoad && profile.bodyweight);
    const exps = exposures(history, id);
    if (exps.length < 2) continue;
    const series = exps.map(e => ({ date: e.date, value: Math.round((loaded ? bestScore(e, profile.bodyweight) : Math.max(...e.sets.map(s => s.reps))) * 10) / 10 }));
    const bestW = Math.max(...exps.map(e => topWeight(e.sets)));
    const repPR = Math.max(...exps.map(e => Math.max(...e.sets.filter(s => s.weight >= bestW * 0.97).map(s => s.reps))));
    lifts.push({
      exerciseId: id, name: ex.name, series, first: series[0].value, latest: series[series.length - 1].value,
      bestWeight: bestW, unit: loaded ? 'kg' : 'reps', repPR,
    });
  }
  lifts.sort((a, b) => {
    const ca = EX[a.exerciseId].kind === 'compound' ? 1 : 0, cb = EX[b.exerciseId].kind === 'compound' ? 1 : 0;
    return cb - ca || b.series.length - a.series.length || a.name.localeCompare(b.name);
  });

  // ── progress rate per week: share of repeated exercises that improved ──
  const progress: { weekStart: string; improved: number; total: number }[] = [];
  for (const ws of [3, 2, 1, 0].map(i => addDays(curWs, -7 * i)).filter(w => w >= firstWs)) {
    let improved = 0, total = 0;
    for (const w of all.filter(x => x.date >= ws && x.date <= addDays(ws, 6))) {
      for (const we of w.exercises) {
        if (we.skipped || NO_BASELINE.includes(we.rxAction)) continue;
        const exps = exposures(history, we.exerciseId);
        const idx = exps.findIndex(e => e.workoutId === w.id);
        if (idx < 1) continue;
        total++;
        const cur = exps[idx], prev = exps[idx - 1];
        const reps = (e: typeof cur) => e.sets.reduce((a, s) => a + s.reps, 0);
        if (bestScore(cur, profile.bodyweight) > bestScore(prev, profile.bodyweight) * 1.005 || topWeight(cur.sets) > topWeight(prev.sets) || reps(cur) > reps(prev)) improved++;
      }
    }
    progress.push({ weekStart: ws, improved, total });
  }

  return {
    hasData: all.length > 0,
    consistency: {
      thisWeek: { done: curDone, planned: profile.days.length },
      weeks,
      adherence: plannedSum ? Math.round((doneSum / plannedSum) * 100) : null,
      streak,
      total: all.length,
    },
    frequency, hardSets, workload,
    effectiveShare: done ? Math.round((eff / done) * 100) : null,
    lifts, progress,
  };
}

const NO_BASELINE = ['deload', 'reset', 'reduce', 'trim', 'advance', 'estimate', 'start'];

// ── PRs for the finish screen ──
export interface PR { exerciseId: string; label: string }

export function workoutPRs(w: Workout, historyBefore: Workout[], bodyweight?: number): PR[] {
  const out: PR[] = [];
  for (const we of w.exercises) {
    if (we.skipped) continue;
    const ex = EX[we.exerciseId];
    const sets = workingDone(we);
    if (!ex || !sets.length) continue;
    const prev = exposures(historyBefore, we.exerciseId);
    if (!prev.length) continue;
    const bestPrevW = Math.max(...prev.map(e => topWeight(e.sets)));
    const curW = topWeight(sets);
    if (ex.load === 'external') {
      if (curW > bestPrevW) { out.push({ exerciseId: ex.id, label: `${ex.name}: ${curW} kg (+${Math.round((curW - bestPrevW) * 10) / 10})` }); continue; }
      const bestPrevS = Math.max(...prev.map(e => bestScore(e, bodyweight)));
      const curS = Math.max(...sets.map(s => perfScore(ex, s, bodyweight)));
      const prevRepsAtW = Math.max(0, ...prev.flatMap(e => e.sets.filter(s => s.weight >= curW * 0.97).map(s => s.reps)));
      const curReps = Math.max(...sets.filter(s => s.weight >= curW * 0.97).map(s => s.reps));
      if (curReps > prevRepsAtW && prevRepsAtW > 0) out.push({ exerciseId: ex.id, label: `${ex.name}: ${curReps} reps at ${curW} kg (was ${prevRepsAtW})` });
      else if (curS > bestPrevS * 1.01) out.push({ exerciseId: ex.id, label: `${ex.name}: new estimated max` });
    } else {
      const prevBest = Math.max(...prev.map(e => Math.max(...e.sets.map(s => s.reps))));
      const cur = Math.max(...sets.map(s => s.reps));
      if (cur > prevBest) out.push({ exerciseId: ex.id, label: `${ex.name}: ${cur} reps (was ${prevBest})` });
    }
  }
  return out;
}

