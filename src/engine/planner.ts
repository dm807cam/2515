import type {
  DeloadState, Equipment, EquipmentPreset, Exercise, Joint, Muscle, PlanOptions, Profile,
  SetLog, TempLimit, TemplateId, Workout, WorkoutExercise,
} from './types';
import { MUSCLES } from './types';
import { EXERCISES, EX, MUSCLE_LABEL, canDo, isBlockedByJoint, primaryMuscles } from './exercises';
import { addDays, diffDays } from './dates';
import { exposures } from './history';
import { assessFatigue, type FatigueReport } from './fatigue';
import { prescribe } from './progression';
import {
  MAX_SESSION_SETS, MIN_EXERCISE_SETS, MUSCLE_IMPORTANCE, estimateMinutes, repRange, restSeconds, roundTo,
  sessionCap,
} from './rules';
import { TEMPLATES, computeWeek, emptyMuscles, type WeekState } from './weekly';

export interface PlanInput {
  profile: Profile;
  history: Workout[];
  today: string;
  options?: PlanOptions;
  deload?: DeloadState;
  tempLimits?: TempLimit[];
}

export interface PlanResult {
  workout: Workout;
  week: WeekState;
  fatigue: FatigueReport;
  /** the current week is already complete; this is next week's first session */
  nextWeek: boolean;
  limits: Joint[];
  equipment: Set<Equipment>;
}

export const EMPTY_DELOAD: DeloadState = { until: null, dismissedUntil: null, lastDeloadEnd: null };

export function resolveEquipment(profile: Profile, preset?: EquipmentPreset): Set<Equipment> {
  const has = (e: Equipment) => profile.equipment.includes(e);
  switch (preset) {
    case 'none': return new Set();
    case 'dumbbells': return new Set<Equipment>(has('bench') || has('machine') || has('barbell') ? ['dumbbell', 'bench'] : ['dumbbell']);
    case 'machines': return new Set<Equipment>(['machine', 'cable']);
    case 'home': return new Set<Equipment>(['dumbbell', 'bench', 'bar', 'band']);
    case 'travel': return new Set<Equipment>(has('band') ? ['band'] : []);
    default: return new Set(profile.equipment);
  }
}

export const PRESET_LABEL: Record<EquipmentPreset, string> = {
  none: 'No equipment', dumbbells: 'Only dumbbells', machines: 'Only machines', home: 'Home workout', travel: 'Travel workout',
};

const PATTERN_ORDER = ['squat', 'hinge', 'h_push', 'h_pull', 'inc_push', 'v_push', 'v_pull', 'lunge', 'hip_ext'];

interface Item { ex: Exercise; sets: number }

function maxSets(e: Exercise): number {
  return e.kind === 'compound' ? 4 : 4;
}

function variantOnlyIds(): Set<string> {
  return new Set(EXERCISES.map(e => e.progressTo).filter((x): x is string => !!x));
}
const VARIANT_ONLY = variantOnlyIds();

function activeLimits(profile: Profile, temp: TempLimit[], today: string, options: PlanOptions): Joint[] {
  const s = new Set<Joint>(profile.limits);
  for (const t of temp) if (t.until >= today) s.add(t.area);
  for (const j of options.limits ?? []) s.add(j);
  return [...s];
}

export function planSession(input: PlanInput): PlanResult {
  const { profile, history, today } = input;
  const options = input.options ?? {};
  const deload = input.deload ?? EMPTY_DELOAD;
  const level = profile.level;
  const cap = sessionCap(level);
  const available = resolveEquipment(profile, options.equipment);
  const minutes = options.minutes ?? profile.minutes;
  const limits = activeLimits(profile, input.tempLimits ?? [], today, options);
  const avoid = new Set(profile.avoid);
  const exclude = new Set(options.exclude ?? []);
  const fatigue = assessFatigue(history, today, { level, deload, tiredToday: options.tired, bodyweight: profile.bodyweight });
  const deloadActive = !!deload.until && deload.until >= today;
  const mode: Workout['mode'] = deloadActive ? 'deload' : options.tired ? 'trim' : 'normal';

  let week = computeWeek(profile, history, today);
  let nextWeek = false;
  if (week.complete) {
    week = computeWeek(profile, history, today, addDays(week.weekStart, 7));
    nextWeek = true;
  }

  // ── which template, and how many sets per muscle today ──
  const recency = (m: Muscle): number => {
    const lt = week.lastTrained[m];
    if (!lt) return 1;
    const hours = diffDays(today, lt.date) * 24;
    return hours < 36 ? 0.4 : hours < 60 ? 0.85 : 1;
  };
  const tScore = (t: TemplateId): number => {
    const f = TEMPLATES[t].focus;
    const s = f.reduce((a, m) => a + Math.min(week.deficits[m], cap) * MUSCLE_IMPORTANCE[m] * recency(m), 0) / f.length;
    return s - pool.indexOf(t) * 0.001;
  };
  // fewer slots than planned sessions (missed days): two full-body sessions beat "upper then lower",
  // because every muscle still gets hit twice
  const truncated = week.slotsLeft > 0 && week.slotsLeft < week.remaining.length;
  const pool: TemplateId[] = truncated ? Array<TemplateId>(week.slotsLeft).fill('full') : week.remaining;
  const ordered = [...pool].sort((a, b) => tScore(b) - tScore(a));
  const template: TemplateId = ordered[0] ?? 'full';
  const slots = Math.max(1, week.slotsLeft || 1);
  const future = ordered.slice(1, slots);
  const laterHits = (m: Muscle) => future.filter(t => TEMPLATES[t].focus.includes(m)).length;

  const focus = new Set(TEMPLATES[template].focus);
  const targets = emptyMuscles();
  const catchUp: Muscle[] = [];
  const recovering: Muscle[] = [];
  const modeMul = mode === 'deload' ? 0.6 : mode === 'trim' ? 0.75 : 1;
  for (const m of MUSCLES) {
    const d = week.deficits[m];
    let t: number;
    if (focus.has(m)) t = Math.ceil(d / (laterHits(m) + 1) - 0.01);
    else {
      t = Math.ceil(d - laterHits(m) * cap - 0.01);
      // only catch up on a real shortfall (a missed session), never on small leftovers
      if (t < Math.max(3, 0.4 * week.targets[m]) || mode !== 'normal') t = 0; else catchUp.push(m);
    }
    t = Math.min(t, cap);
    const r = recency(m);
    if (r < 1 && t > 0) { t = Math.round(t * r); if (focus.has(m)) recovering.push(m); }
    targets[m] = Math.round(t * modeMul);
  }

  // ── candidates ──
  const wantsVariant = new Set<string>();
  for (const e of EXERCISES) {
    if (e.progressTo && exposures(history, e.progressTo).length && canDo(EX[e.progressTo], available)) wantsVariant.add(e.id);
  }
  const candidates = EXERCISES.filter(e =>
    canDo(e, available) && !avoid.has(e.id) && !isBlockedByJoint(e, limits)
    && !(e.id === 'deadlift' && profile.goal !== 'strength')
    && !(VARIANT_ONLY.has(e.id) && !exposures(history, e.id).length)
    && !wantsVariant.has(e.id),
  );

  const recentIds = new Set<string>();
  for (const w of history) if (w.finishedAt && diffDays(today, w.date) <= 28) for (const we of w.exercises) if (!we.skipped) recentIds.add(we.exerciseId);

  const setsFor = (c: Exercise, needs: Record<Muscle, number>): number => {
    let primNeed = 0;
    for (const [m, w] of Object.entries(c.muscles) as [Muscle, number][]) if (w >= 1) primNeed = Math.max(primNeed, needs[m] / w);
    return Math.max(MIN_EXERCISE_SETS, Math.min(maxSets(c), Math.round(primNeed)));
  };

  const minutesOf = (items: Item[]): number => {
    const sorted = orderItems(items);
    return estimateMinutes(sorted.map(i => ({ exerciseId: i.ex.id, sets: i.sets, rest: restSeconds(i.ex, profile.goal) })), warmupCount(sorted));
  };

  // ── greedy construction ──
  let needs = { ...targets };
  const got = emptyMuscles();
  const chosen: Item[] = [];
  const usedPatterns = new Set<string>();
  const perMuscle = emptyMuscles();
  for (let iter = 0; iter < 9; iter++) {
    let best: { c: Exercise; sets: number; score: number } | null = null;
    for (const c of candidates) {
      if (chosen.some(i => i.ex.id === c.id) || usedPatterns.has(c.pattern)) continue;
      const prim = primaryMuscles(c);
      if (!prim.some(m => needs[m] >= 1)) continue;
      if (prim.some(m => perMuscle[m] >= 2)) continue;
      let sets = setsFor(c, needs);
      const fits = (s: number) => (Object.entries(c.muscles) as [Muscle, number][]).every(([m, w]) => got[m] + s * w <= cap + 0.5);
      while (sets >= MIN_EXERCISE_SETS && !fits(sets)) sets--;
      if (sets < MIN_EXERCISE_SETS) continue;
      let gainRaw = 0, gainW = 0;
      for (const [m, w] of Object.entries(c.muscles) as [Muscle, number][]) {
        const g = Math.min(needs[m], sets * w);
        gainRaw += g; gainW += g * MUSCLE_IMPORTANCE[m];
      }
      if (gainRaw < 1.8) continue;
      const time = minutesOf([{ ex: c, sets }]);
      let score = (gainW * (c.q ?? 1)) / Math.pow(time, 0.35);
      if (c.load === 'bodyweight') score *= 0.5; // improvised / harder to progress: a fallback, not a first choice
      if (c.kind === 'compound') score *= 1.1;
      if (c.pattern === 'lat_raise') score *= 1.35; // presses barely train side delts
      if (c.pattern === 'rear_delt') score *= 1.15;
      if (recentIds.has(c.id)) score *= 1.15;
      if (!week.patternsDone.has(c.pattern)) score *= 1.12;
      if (level === 'beginner') score *= c.skill === 3 ? 0.7 : c.skill === 2 ? 0.9 : 1;
      if (profile.goal === 'strength' && c.kind === 'compound' && level !== 'beginner') {
        score *= c.equipment.includes('barbell') ? 1.6 : c.equipment.includes('dumbbell') ? 1.1 : c.equipment.includes('machine') ? 0.75 : 1;
      }
      score *= 1 - 0.05 * (c.fatigue - 1);
      if (exclude.has(c.id)) score *= 0.25;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && c.id < best.c.id)) best = { c, sets, score };
    }
    if (!best) break;
    chosen.push({ ex: best.c, sets: best.sets });
    usedPatterns.add(best.c.pattern);
    for (const [m, w] of Object.entries(best.c.muscles) as [Muscle, number][]) {
      needs = { ...needs, [m]: Math.max(0, needs[m] - best.sets * w) };
      got[m] += best.sets * w;
    }
    for (const m of primaryMuscles(best.c)) perMuscle[m] += 1;
  }

  // ── prune to time and set limits ──
  const unpruned = chosen.map(i => ({ ...i }));
  const totalSets = (items: Item[]) => items.reduce((a, i) => a + i.sets, 0);
  const recomputeGot = (items: Item[]) => {
    const g = emptyMuscles();
    for (const i of items) for (const [m, w] of Object.entries(i.ex.muscles) as [Muscle, number][]) g[m] += i.sets * w;
    return g;
  };
  const loss = (items: Item[], i: Item, k: number): number => {
    const g = recomputeGot(items);
    let l = 0;
    for (const [m, w] of Object.entries(i.ex.muscles) as [Muscle, number][]) {
      const before = Math.max(0, targets[m] - g[m]);
      const after = Math.max(0, targets[m] - (g[m] - k * w));
      l += MUSCLE_IMPORTANCE[m] * (after - before) + MUSCLE_IMPORTANCE[m] * 0.15 * k * w;
    }
    return l;
  };
  let guard = 60;
  while (chosen.length && guard-- > 0 && (totalSets(chosen) > MAX_SESSION_SETS || minutesOf(chosen) > minutes + 1)) {
    const cur = minutesOf(chosen);
    let bestIdx = -1, bestRatio = Infinity;
    chosen.forEach((it, idx) => {
      const remove = it.sets <= MIN_EXERCISE_SETS;
      const k = remove ? it.sets : 1;
      const rest = remove ? chosen.filter((_, j) => j !== idx) : chosen.map((x, j) => (j === idx ? { ...x, sets: x.sets - 1 } : x));
      const saved = Math.max(0.25, cur - (rest.length ? minutesOf(rest) : 0));
      const ratio = loss(chosen, it, k) / saved;
      if (ratio < bestRatio - 1e-9) { bestRatio = ratio; bestIdx = idx; }
    });
    if (bestIdx < 0) break;
    const it = chosen[bestIdx];
    if (it.sets <= MIN_EXERCISE_SETS) chosen.splice(bestIdx, 1); else it.sets -= 1;
  }

  const final = orderItems(chosen);
  const finalGot = recomputeGot(final);
  const dropped: Muscle[] = MUSCLES.filter(m => targets[m] >= 2 && finalGot[m] < targets[m] - 1.5 && unpruned.length > 0 && recomputeGot(unpruned)[m] > finalGot[m]);

  // ── prescriptions ──
  const exercises: WorkoutExercise[] = [];
  final.forEach((it, idx) => {
    exercises.push(materialize(it.ex, it.sets, idx, profile, history, fatigue, mode, available, limits, avoid, idx === 0));
  });

  const plannedSets = exercises.reduce((a, we) => a + we.targetSets, 0);
  const plannedMinutes = estimateMinutes(
    exercises.map(we => ({ exerciseId: we.exerciseId, sets: we.targetSets, rest: we.rest })),
    exercises.some(we => we.sets.some(s => s.warmup)) ? 1 : 0,
  );

  // ── explanation ──
  const notes: string[] = [];
  const title = TEMPLATES[template].name;
  const trainedList = MUSCLES.filter(m => finalGot[m] >= 2).sort((a, b) => finalGot[b] - finalGot[a]);
  const shown = trainedList.slice(0, trainedList.length <= 5 ? 5 : 4);
  const more = trainedList.length - shown.length;
  const names = shown.map(m => MUSCLE_LABEL[m].toLowerCase());
  if (more > 0) names.push(`${more} more`);
  const nameStr = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'nothing';
  const maxGot = Math.max(0, ...MUSCLES.map(m => finalGot[m]));
  let explanation = `Today: ${plannedSets} working sets, ~${plannedMinutes} min. ${capitalize(nameStr)} ${names.length > 1 ? 'are' : 'is'} trained while each muscle stays at or under ~${Math.max(cap, Math.ceil(maxGot)) > cap ? cap + 1 : cap} hard sets.`;
  if (!exercises.length) explanation = 'No suitable exercises with today\'s equipment and restrictions.';

  if (mode === 'deload') notes.push('Recovery week: about 40% fewer sets, lighter weights, and stop further from failure.');
  if (mode === 'trim') notes.push('Lighter session: about 25% fewer sets and one more rep in reserve. Unfinished volume rolls into later sessions.');
  if (options.equipment) notes.push(`${PRESET_LABEL[options.equipment]}: exercises chosen from what you have, matched to today's muscles.`);
  if (options.minutes && options.minutes < profile.minutes && dropped.length) {
    notes.push(`Cut to ${options.minutes} min — the highest-value lifts kept; ${dropped.map(m => MUSCLE_LABEL[m].toLowerCase()).slice(0, 3).join(', ')} volume trimmed${slots > 1 ? ' and rolled into later sessions' : ''}.`);
  } else if (options.minutes && options.minutes < profile.minutes) {
    notes.push(`Fits ${options.minutes} min.`);
  }
  if (week.missedCount > 0 && catchUp.length) {
    notes.push(`A session was missed earlier this week, so ${catchUp.map(m => MUSCLE_LABEL[m].toLowerCase()).slice(0, 3).join(', ')} get${catchUp.length === 1 ? 's' : ''} extra sets today — within the per-session limit.`);
  } else if (week.missedCount > 0) {
    notes.push('A session was missed earlier this week; the rest of the week is re-balanced around it.');
  }
  if (recovering.length) notes.push(`${recovering.map(m => MUSCLE_LABEL[m]).slice(0, 3).join(', ')} trained recently — kept lighter today.`);
  if (limits.length) notes.push(`Avoiding ${limits.map(j => j.replace('_', ' ')).join(' / ')}-stressing movements. If pain persists, see a qualified professional.`);
  if (nextWeek) notes.push("This week's plan is complete — this starts next week's first session early.");
  const uncovered = MUSCLES.filter(m => targets[m] >= 2 && finalGot[m] < 1 && !dropped.includes(m));
  if (uncovered.length && exercises.length) notes.push(`No suitable ${uncovered.map(m => MUSCLE_LABEL[m].toLowerCase()).slice(0, 3).join('/')} exercise with today's equipment or restrictions.`);

  const workout: Workout = {
    id: `w-${today}-${template}`,
    date: today,
    template,
    title,
    exercises,
    explanation,
    notes,
    plannedSets,
    plannedMinutes,
    minutesCap: options.minutes,
    mode,
  };
  return { workout, week, fatigue, nextWeek, limits, equipment: available };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function orderItems(items: Item[]): Item[] {
  const pi = (p: string) => { const i = PATTERN_ORDER.indexOf(p); return i < 0 ? 99 : i; };
  return [...items].sort((a, b) => {
    if (a.ex.kind !== b.ex.kind) return a.ex.kind === 'compound' ? -1 : 1;
    if (a.ex.fatigue !== b.ex.fatigue) return b.ex.fatigue - a.ex.fatigue;
    return pi(a.ex.pattern) - pi(b.ex.pattern) || a.ex.id.localeCompare(b.ex.id);
  });
}

function warmupCount(sorted: Item[]): number {
  const f = sorted[0];
  return f && f.ex.kind === 'compound' && f.ex.load === 'external' && f.ex.fatigue >= 2 ? 1 : 0;
}

export function materialize(
  ex0: Exercise, sets: number, idx: number, profile: Profile, history: Workout[], fatigue: FatigueReport,
  mode: Workout['mode'], available: Set<Equipment>, limits: Joint[], avoid: Set<string>, first: boolean,
): WorkoutExercise {
  const mk = (ex: Exercise) => prescribe(ex, {
    goal: profile.goal, level: profile.level, bodyweight: profile.bodyweight, fatigue: fatigue.level, mode, sets, history, available,
  });
  let ex = ex0;
  let rx = mk(ex);
  let advancedFrom: string | undefined;
  if (rx.action === 'advance' && rx.advanceTo) {
    const nx = EX[rx.advanceTo];
    if (nx && canDo(nx, available) && !avoid.has(nx.id) && !isBlockedByJoint(nx, limits)) {
      advancedFrom = ex.name;
      const reasonOld = rx.reason;
      ex = nx;
      rx = mk(ex);
      rx = { ...rx, action: 'advance', reason: `${reasonOld} Now: ${ex.name}.` };
    } else {
      rx = { ...rx, action: 'build', weight: 0, targetReps: Array(sets).fill(rx.repMax), reason: 'Keep adding reps.' };
    }
  }
  void advancedFrom;
  const uid = `${ex.id}-${idx}`;
  const working: SetLog[] = Array.from({ length: sets }, (_, i) => ({
    id: `${uid}-s${i}`, weight: rx.weight, reps: rx.targetReps[i] ?? rx.repMin, done: false, targetReps: rx.targetReps[i] ?? rx.repMin,
  }));
  const all: SetLog[] = [];
  if (first && ex.kind === 'compound' && ex.load === 'external' && ex.fatigue >= 2 && rx.weight >= 20) {
    all.push({ id: `${uid}-w0`, weight: roundTo(rx.weight * 0.5, ex.increment || 1), reps: 6, done: false, warmup: true });
  }
  all.push(...working);
  return {
    uid, exerciseId: ex.id, sets: all, targetSets: sets, repMin: rx.repMin, repMax: rx.repMax, rir: rx.rir,
    rest: restSeconds(ex, profile.goal), rxAction: rx.action, rxReason: rx.reason,
  };
}

export { repRange };
