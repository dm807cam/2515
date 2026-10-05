import type { Muscle, Profile, TemplateId, Workout } from './types';
import { MUSCLES } from './types';
import { addDays, weekStart, weekday } from './dates';
import { EX } from './exercises';
import { finished } from './history';
import { HIT_THRESHOLD, muscleSets, weeklyTargets, workingSetCount } from './rules';

export interface Template { id: TemplateId; name: string; focus: Muscle[] }

const UPPER: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const LOWER: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves'];

export const TEMPLATES: Record<TemplateId, Template> = {
  full_a: { id: 'full_a', name: 'Full body A', focus: [...UPPER, ...LOWER] },
  full_b: { id: 'full_b', name: 'Full body B', focus: [...UPPER, ...LOWER] },
  full: { id: 'full', name: 'Full body', focus: [...UPPER, ...LOWER] },
  upper: { id: 'upper', name: 'Upper body', focus: UPPER },
  lower: { id: 'lower', name: 'Lower body', focus: LOWER },
  push: { id: 'push', name: 'Push', focus: ['chest', 'shoulders', 'triceps'] },
  pull: { id: 'pull', name: 'Pull', focus: ['back', 'biceps', 'shoulders'] },
  legs: { id: 'legs', name: 'Legs', focus: LOWER },
};

/** every muscle lands ≈2×/week for each frequency */
export function weekTemplates(freq: number): TemplateId[] {
  switch (freq) {
    case 1: return ['full'];
    case 2: return ['full_a', 'full_b'];
    case 3: return ['upper', 'lower', 'full'];
    case 4: return ['upper', 'lower', 'upper', 'lower'];
    default: return ['upper', 'lower', 'push', 'pull', 'legs'];
  }
}

export type DayStatus = 'done' | 'missed' | 'madeup' | 'today' | 'upcoming' | 'rest' | 'extra';

export interface DayInfo {
  date: string;
  weekday: number;
  scheduled: boolean;
  status: DayStatus;
  workout?: Workout;
}

export interface WeekState {
  weekStart: string;
  today: string;
  freq: number;
  targets: Record<Muscle, number>;
  /** weighted effective sets so far this week */
  done: Record<Muscle, number>;
  hits: Record<Muscle, number>;
  deficits: Record<Muscle, number>;
  workouts: Workout[];
  templates: TemplateId[];
  remaining: TemplateId[];
  /** training slots still available this week, counting today if it can be used */
  slotsLeft: number;
  days: DayInfo[];
  missedCount: number;
  patternsDone: Set<string>;
  /** hours since each muscle last got ≥3 weighted sets (Infinity if never / long ago) */
  lastTrained: Record<Muscle, { date: string; sets: number } | null>;
  /** current week already contains every planned session */
  complete: boolean;
}

export function emptyMuscles(v = 0): Record<Muscle, number> {
  return Object.fromEntries(MUSCLES.map(m => [m, v])) as Record<Muscle, number>;
}

export function computeWeek(profile: Profile, history: Workout[], today: string, wsOverride?: string): WeekState {
  const ws = wsOverride ?? weekStart(today);
  const we = addDays(ws, 6);
  const freq = profile.days.length;
  const templates = weekTemplates(freq);
  const targets = weeklyTargets(profile);
  const all = finished(history);
  const workouts = all.filter(w => w.date >= ws && w.date <= we);

  const done = emptyMuscles();
  const hits = emptyMuscles();
  const patternsDone = new Set<string>();
  const remaining = [...templates];
  for (const w of workouts) {
    const ms = muscleSets(w, profile.level);
    for (const m of MUSCLES) {
      done[m] += ms[m];
      if (ms[m] >= HIT_THRESHOLD) hits[m] += 1;
    }
    for (const x of w.exercises) if (!x.skipped && EX[x.exerciseId]) patternsDone.add(EX[x.exerciseId].pattern);
    const i = remaining.indexOf(w.template);
    if (i >= 0) remaining.splice(i, 1);
    else if (remaining.length) {
      // an ad-hoc template: consume the remaining one with the most overlap
      let bestI = 0, bestOv = -1;
      remaining.forEach((t, idx) => {
        const ov = TEMPLATES[t].focus.reduce((a, m) => a + (ms[m] > 0 ? 1 : 0), 0);
        if (ov > bestOv) { bestOv = ov; bestI = idx; }
      });
      remaining.splice(bestI, 1);
    }
  }

  const deficits = emptyMuscles();
  for (const m of MUSCLES) deficits[m] = Math.max(0, targets[m] - done[m]);

  // last training of each muscle (any week) for recovery spacing
  const lastTrained = Object.fromEntries(MUSCLES.map(m => [m, null])) as WeekState['lastTrained'];
  for (const w of [...all].reverse()) {
    const ms = muscleSets(w, profile.level);
    for (const m of MUSCLES) if (!lastTrained[m] && ms[m] >= 3) lastTrained[m] = { date: w.date, sets: ms[m] };
  }

  // days
  const days: DayInfo[] = [];
  const scheduledWd = new Set(profile.days);
  const extras: Workout[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(ws, i);
    const wd = weekday(date);
    const scheduled = scheduledWd.has(wd);
    const w = workouts.find(x => x.date === date);
    let status: DayStatus;
    if (w) status = scheduled ? 'done' : 'extra';
    else if (date === today) status = scheduled ? 'today' : 'rest';
    else if (date < today) status = scheduled ? 'missed' : 'rest';
    else status = scheduled ? 'upcoming' : 'rest';
    if (w && !scheduled) extras.push(w);
    days.push({ date, weekday: wd, scheduled, status, workout: w });
  }
  // extra sessions made up for earlier missed days
  for (const ex of extras) {
    const m = days.find(d => d.status === 'missed' && d.date < ex.date);
    if (m) m.status = 'madeup';
  }
  const missedCount = days.filter(d => d.status === 'missed').length;

  // slots left: scheduled days from today on (today counts when scheduled or when the user trains anyway)
  const daysAfter = days.filter(d => d.date > today && d.scheduled && !d.workout).length;
  const todayDone = days.find(d => d.date === today)?.workout;
  const slotsLeft = Math.max(0, Math.min(remaining.length, daysAfter + (todayDone ? 0 : 1)));

  return {
    weekStart: ws, today, freq, targets, done, hits, deficits, workouts, templates, remaining,
    slotsLeft, days, missedCount, patternsDone, lastTrained, complete: remaining.length === 0,
  };
}

export function sessionsDone(w: WeekState): number {
  return w.workouts.length;
}

export function plannedSetsFor(w: Workout): number {
  return workingSetCount(w) || w.plannedSets;
}
