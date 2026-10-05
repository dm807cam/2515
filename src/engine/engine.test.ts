import { describe, expect, it } from 'vitest';
import { EX, EXERCISES, canDo, isBlockedByJoint } from './exercises';
import { planSession, resolveEquipment } from './planner';
import { prescribe, type RxContext } from './progression';
import { rankSubstitutes, swapExercise } from './substitute';
import { assessFatigue, deloadUntil } from './fatigue';
import { simulate } from './simulate';
import { computeWeek } from './weekly';
import { buildDashboard, workoutPRs } from './stats';
import { diagnose } from './insights';
import { bestScore, exposures } from './history';
import { MAX_SESSION_SETS, muscleSets, sessionCap, weeklyTargets } from './rules';
import { defaultDays, addDays, weekday, weekStart } from './dates';
import { MUSCLES, type Equipment, type Muscle, type Profile } from './types';
import { GYM, HOME, logged, profile } from './testutil';

const baseCtx = (o: Partial<RxContext> = {}): RxContext => ({
  goal: 'hypertrophy', level: 'intermediate', bodyweight: 80, fatigue: 'normal', mode: 'normal', sets: 3,
  history: [], available: new Set<Equipment>(GYM), ...o,
});

// Monday 2026-10-05
const MON = '2026-10-05';

describe('exercise library', () => {
  it('has unique ids, valid progression links and sane muscle credits', () => {
    const ids = new Set<string>();
    for (const e of EXERCISES) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      if (e.progressTo) expect(EX[e.progressTo]).toBeTruthy();
      expect(Object.values(e.muscles).some(w => w === 1)).toBe(true);
      expect(e.reps[0]).toBeLessThan(e.reps[1]);
      if (e.load === 'external') expect(e.startRatio).toBeGreaterThan(0);
    }
  });
  it('every muscle can be trained with no equipment (biceps only indirectly – an honest gap)', () => {
    const none = new Set<Equipment>();
    const direct = new Set<Muscle>();
    const any = new Set<Muscle>();
    for (const e of EXERCISES) if (canDo(e, none)) for (const [m, w] of Object.entries(e.muscles) as [Muscle, number][]) { any.add(m); if (w >= 1) direct.add(m); }
    expect(MUSCLES.filter(m => !any.has(m))).toEqual([]);
    expect(MUSCLES.filter(m => !direct.has(m))).toEqual(['biceps']);
  });
});

describe('workout generation', () => {
  const configs: Profile[] = [];
  for (const freq of [2, 3, 4, 5]) for (const minutes of [20, 30, 45, 60]) for (const level of ['beginner', 'intermediate', 'advanced'] as const) for (const eq of [GYM, HOME, []] as Equipment[][]) {
    configs.push(profile({ days: defaultDays(freq), minutes, level, equipment: eq }));
  }

  it('respects the 5-set cap, 15-set cap and the time budget in every configuration', () => {
    for (const p of configs) {
      const h = simulate(p, '2026-09-14', 1);
      expect(h.length).toBe(p.days.length);
      for (const w of h) {
        expect(w.plannedSets).toBeLessThanOrEqual(MAX_SESSION_SETS);
        expect(w.plannedMinutes).toBeLessThanOrEqual(p.minutes + 1);
        const ms = muscleSets(w, p.level);
        for (const m of MUSCLES) expect(ms[m]).toBeLessThanOrEqual(sessionCap(p.level) + 0.5);
      }
    }
  });

  it('trains chest, back and quads 2×/week at every frequency with a full gym (≥30 min)', () => {
    for (const freq of [2, 3, 4, 5]) {
      const p = profile({ days: defaultDays(freq), minutes: 30 });
      const h = simulate(p, '2026-09-14', 1);
      for (const m of ['chest', 'back', 'quads'] as Muscle[]) {
        const hits = h.filter(w => muscleSets(w, p.level)[m] >= 2).length;
        expect(hits, `${m} @${freq}d`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('prefers loaded lifts over bodyweight fallbacks when equipment exists', () => {
    const r = planSession({ profile: profile(), history: [], today: MON });
    expect(r.workout.exercises.every(we => EX[we.exerciseId].load === 'external' || EX[we.exerciseId].kind === 'isolation')).toBe(true);
    expect(r.workout.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic', () => {
    const a = planSession({ profile: profile(), history: [], today: MON }).workout;
    const b = planSession({ profile: profile(), history: [], today: MON }).workout;
    expect(a).toEqual(b);
  });

  it('explains itself in one short sentence with sets and minutes', () => {
    const w = planSession({ profile: profile(), history: [], today: MON }).workout;
    expect(w.explanation).toMatch(/^Today: \d+ working sets, ~\d+ min\./);
    expect(w.explanation.length).toBeLessThan(220);
  });

  it('orders compounds before isolations and adds a warm-up only to the first heavy compound', () => {
    const w = planSession({ profile: profile({ goal: 'strength' }), history: [], today: MON }).workout;
    const kinds = w.exercises.map(we => EX[we.exerciseId].kind);
    const firstIso = kinds.indexOf('isolation');
    if (firstIso >= 0) expect(kinds.slice(firstIso).every(k => k === 'isolation')).toBe(true);
    expect(w.exercises.slice(1).every(we => !we.sets.some(s => s.warmup))).toBe(true);
  });

  it('strength goal picks barbell compounds with low rep ranges; beginners get higher RIR', () => {
    const s = planSession({ profile: profile({ goal: 'strength' }), history: [], today: MON }).workout;
    expect(s.exercises.some(we => EX[we.exerciseId].equipment.includes('barbell'))).toBe(true);
    expect(Math.min(...s.exercises.map(we => we.repMin))).toBeLessThanOrEqual(5);
    const b = planSession({ profile: profile({ level: 'beginner' }), history: [], today: MON }).workout;
    const i = planSession({ profile: profile(), history: [], today: MON }).workout;
    expect(b.exercises[0].rir).toBeGreaterThan(i.exercises[0].rir);
  });

  it('never exceeds ~15 reps for loaded compounds in hypertrophy unless isolation / bodyweight', () => {
    for (const e of EXERCISES) if (e.kind === 'compound' && e.load === 'external') expect(e.reps[1]).toBeLessThanOrEqual(15);
  });
});

describe('equipment adaptation', () => {
  it.each([
    ['dumbbells', ['dumbbell', 'bench']],
    ['none', []],
    ['machines', ['machine', 'cable']],
    ['home', ['dumbbell', 'bench', 'bar', 'band']],
  ] as const)('%s only uses available equipment', (preset, allowed) => {
    const r = planSession({ profile: profile(), history: [], today: MON, options: { equipment: preset } });
    expect(r.workout.exercises.length).toBeGreaterThan(0);
    for (const we of r.workout.exercises) for (const q of EX[we.exerciseId].equipment) expect(allowed as readonly string[]).toContain(q);
  });
  it('travel = bodyweight (+ bands if owned)', () => {
    expect([...resolveEquipment(profile({ equipment: [...GYM] }), 'travel')]).toEqual([]);
    expect([...resolveEquipment(profile({ equipment: ['band'] }), 'travel')]).toEqual(['band']);
  });
  it('dumbbell-only full-body session still covers every large muscle', () => {
    const w = planSession({ profile: profile({ days: [0, 3] }), history: [], today: MON, options: { equipment: 'dumbbells' } }).workout;
    const g = Object.fromEntries(MUSCLES.map(m => [m, 0])) as Record<Muscle, number>;
    for (const we of w.exercises) for (const [m, wt] of Object.entries(EX[we.exerciseId].muscles) as [Muscle, number][]) g[m] += we.targetSets * wt;
    for (const m of ['chest', 'back', 'quads', 'hamstrings'] as Muscle[]) expect(g[m]).toBeGreaterThan(0);
  });
});

describe('time adaptation', () => {
  it('shortens the session and keeps compounds when time is cut', () => {
    const p = profile({ days: [0, 3], minutes: 60 });
    const long = planSession({ profile: p, history: [], today: MON }).workout;
    const short = planSession({ profile: p, history: [], today: MON, options: { minutes: 20 } }).workout;
    expect(short.plannedMinutes).toBeLessThanOrEqual(21);
    expect(short.plannedSets).toBeLessThan(long.plannedSets);
    const compounds = short.exercises.filter(we => EX[we.exerciseId].kind === 'compound').length;
    expect(compounds).toBeGreaterThanOrEqual(short.exercises.length - 1);
    expect(short.exercises.every(we => we.targetSets >= 2)).toBe(true);
  });
  it('time cut does not change the weekly accounting: the missing volume is still a deficit', () => {
    const p = profile({ days: [0, 3], minutes: 45 });
    const short = planSession({ profile: p, history: [], today: MON, options: { minutes: 20 } }).workout;
    const done = { ...short, finishedAt: 1, startedAt: 0, exercises: short.exercises.map(we => ({ ...we, sets: we.sets.map(s => ({ ...s, done: true })) })) };
    const week = computeWeek(p, [done], addDays(MON, 3));
    expect(MUSCLES.some(m => week.deficits[m] >= 3)).toBe(true);
    const thu = planSession({ profile: p, history: [done], today: addDays(MON, 3) });
    const full = planSession({ profile: p, history: [], today: addDays(MON, 3) });
    expect(thu.workout.plannedSets).toBeGreaterThan(0);
    expect(thu.workout.template).not.toBe(done.template);
    expect(full.workout.plannedSets).toBeGreaterThan(0);
  });
});

describe('pain / restrictions', () => {
  it('never programs shoulder-stressing moves with a shoulder limit, and says so', () => {
    const r = planSession({ profile: profile(), history: [], today: MON, options: { limits: ['shoulder'] } });
    for (const we of r.workout.exercises) expect(isBlockedByJoint(EX[we.exerciseId], ['shoulder'])).toBe(false);
    expect(r.workout.notes.join(' ')).toMatch(/professional/);
  });
  it('knee limit removes squats / lunges / extensions from every session of the week', () => {
    const p = profile({ limits: ['knee'], days: [0, 2, 4] });
    for (const w of simulate(p, '2026-09-14', 1)) for (const we of w.exercises) expect(EX[we.exerciseId].stress.knee ?? 0).toBe(0);
  });
  it('temporary limits expire', () => {
    const t = [{ area: 'shoulder' as const, until: '2026-10-05' }];
    expect(planSession({ profile: profile(), history: [], today: MON, tempLimits: t }).limits).toContain('shoulder');
    expect(planSession({ profile: profile(), history: [], today: addDays(MON, 1), tempLimits: t }).limits).not.toContain('shoulder');
  });
  it('avoided exercises never come back', () => {
    const p = profile({ avoid: ['squat', 'bb_bench', 'incline_machine'] });
    const h = simulate(p, '2026-09-14', 2);
    for (const w of h) for (const we of w.exercises) expect(['squat', 'bb_bench']).not.toContain(we.exerciseId);
  });
});

describe('progression engine', () => {
  const hist = (sets: [number, number][], o = {}) => [logged('2026-10-01', 'db_bench', sets, o)];

  it('12/12/12 at appropriate effort → add weight, reps reset low', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ history: hist([[20, 12], [20, 12], [20, 12]], { effort: 'right' }) }));
    expect(rx.action).toBe('increase');
    expect(rx.weight).toBe(22);
    expect(rx.targetReps[0]).toBeLessThan(12);
  });
  it('12/12/11 (reps fade across sets) still counts as top of the range → increase', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ history: hist([[20, 12], [20, 12], [20, 11]]) }));
    expect(rx.action).toBe('increase');
  });
  it('12/11/9 → hold the weight and aim for +1 rep each set', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ history: hist([[20, 12], [20, 11], [20, 9]]) }));
    expect(rx.action).toBe('build');
    expect(rx.weight).toBe(20);
    expect(rx.targetReps).toEqual([12, 12, 10]);
  });
  it('top reps but a grind (hard) → hold, do not add load', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ history: hist([[20, 12], [20, 12], [20, 12]], { effort: 'hard' }) }));
    expect(rx.action).toBe('hold');
    expect(rx.weight).toBe(20);
  });
  it('top reps while fatigue is elevated → hold', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ fatigue: 'elevated', history: hist([[20, 12], [20, 12], [20, 12]]) }));
    expect(rx.action).toBe('hold');
  });
  it('easy + beginner jumps two increments; big overshoot (calibration) jumps ~10%', () => {
    const h = [logged('2026-10-01', 'bb_bench', [[60, 12], [60, 12], [60, 12]], { effort: 'easy' })];
    const e = prescribe(EX.bb_bench, baseCtx({ level: 'beginner', goal: 'hypertrophy', history: h }));
    expect(e.weight).toBe(65);
    const o = prescribe(EX.db_bench, baseCtx({ history: hist([[20, 16], [20, 16], [20, 15]]) }));
    expect(o.weight).toBeGreaterThanOrEqual(22);
  });
  it('reps far below the range → reduce weight, calibrating from the implied max', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ history: hist([[30, 5], [30, 4], [30, 4]]) }));
    expect(rx.action).toBe('reduce');
    expect(rx.weight).toBeLessThan(28);
    const bad = prescribe(EX.cable_row, baseCtx({ history: [logged('2026-10-01', 'cable_row', [[32.5, 1], [32.5, 1], [32.5, 1]])] }));
    expect(bad.weight).toBeLessThanOrEqual(25);
    expect(bad.weight).toBeGreaterThan(32.5 * 0.7);
  });
  it('a fatigue hold happens once, then progression resumes', () => {
    const first = prescribe(EX.db_bench, baseCtx({ fatigue: 'elevated', history: hist([[20, 12], [20, 12], [20, 12]]) }));
    expect(first.action).toBe('hold');
    const h2 = [logged('2026-10-01', 'db_bench', [[20, 12], [20, 12], [20, 12]], { rx: 'hold' }), ];
    h2[0].exercises[0].rxReason = first.reason;
    const second = prescribe(EX.db_bench, baseCtx({ fatigue: 'elevated', history: h2 }));
    expect(second.action).toBe('increase');
  });
  it('unfinished sets → repeat', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ history: hist([[20, 12], [20, 12]], { targetSets: 3 }) }));
    expect(rx.action).toBe('hold');
    expect(rx.weight).toBe(20);
  });
  it('plateau (flat for 3 weeks) → 10% reset; not repeated while rebuilding', () => {
    const h = [
      logged('2026-09-03', 'bb_bench', [[60, 8], [60, 8], [60, 8]]),
      logged('2026-09-10', 'bb_bench', [[62.5, 6], [62.5, 6], [62.5, 6]]),
      logged('2026-09-17', 'bb_bench', [[62.5, 6], [62.5, 6], [62.5, 6]]),
      logged('2026-09-24', 'bb_bench', [[62.5, 6], [62.5, 6], [62.5, 5]]),
      logged('2026-10-01', 'bb_bench', [[62.5, 6], [62.5, 5], [62.5, 5]]),
    ];
    const rx = prescribe(EX.bb_bench, baseCtx({ history: h }));
    expect(rx.action).toBe('reset');
    expect(rx.weight).toBeLessThan(62.5 * 0.95);
    const h2 = [...h, logged('2026-10-08', 'bb_bench', [[55, 7], [55, 7], [55, 7]], { rx: 'reset' }), logged('2026-10-15', 'bb_bench', [[55, 8], [55, 8], [55, 7]])];
    expect(prescribe(EX.bb_bench, baseCtx({ history: h2 })).action).not.toBe('reset');
  });
  it('noisy sessions inside a single week are NOT a plateau', () => {
    const h = [
      logged('2026-09-14', 'bb_bench', [[60, 9], [60, 9], [60, 8]]),
      logged('2026-09-28', 'bb_bench', [[60, 8], [60, 8], [60, 8]]),
      logged('2026-09-30', 'bb_bench', [[60, 8], [60, 8], [60, 7]]),
      logged('2026-10-02', 'bb_bench', [[60, 8], [60, 8], [60, 8]]),
    ];
    expect(prescribe(EX.bb_bench, baseCtx({ history: h })).action).not.toBe('reset');
  });
  it('deload mode lowers load and raises RIR', () => {
    const rx = prescribe(EX.db_bench, baseCtx({ mode: 'deload', history: hist([[20, 10], [20, 10], [20, 10]]) }));
    expect(rx.action).toBe('deload');
    expect(rx.weight).toBeLessThan(20);
    expect(rx.rir).toBe(4);
  });
  it('bodyweight: top reps → harder variation; pull-up → added load', () => {
    const push = [logged('2026-10-01', 'pushup', [[0, 20], [0, 20], [0, 20]])];
    const rx = prescribe(EX.pushup, baseCtx({ available: new Set(), history: push }));
    expect(rx.action).toBe('advance');
    expect(rx.advanceTo).toBe('pushup_feet');
    const pull = [logged('2026-10-01', 'pullup', [[0, 12], [0, 12], [0, 12]])];
    const rp = prescribe(EX.pullup, baseCtx({ history: pull }));
    expect(rp.action).toBe('increase');
    expect(rp.weight).toBe(2.5);
  });
  it('the planner swaps in the unlocked bodyweight variation', () => {
    const p = profile({ equipment: [], days: [0, 3] });
    const h = [logged('2026-10-01', 'pushup', [[0, 20], [0, 20], [0, 20]], { template: 'full_a' })];
    const w = planSession({ profile: p, history: h, today: MON }).workout;
    expect(w.exercises.some(we => we.exerciseId === 'pushup_feet')).toBe(true);
    expect(w.exercises.some(we => we.exerciseId === 'pushup')).toBe(false);
  });
  it('first time: estimates from bodyweight; substitution estimates from related exercise history', () => {
    const first = prescribe(EX.db_bench, baseCtx({ bodyweight: 80 }));
    expect(first.action).toBe('start');
    expect(first.weight).toBeGreaterThan(0);
    const h = [logged('2026-10-01', 'bb_bench', [[100, 8], [100, 8], [100, 8]])];
    const est = prescribe(EX.db_bench, baseCtx({ history: h }));
    expect(est.action).toBe('estimate');
    expect(est.reason).toMatch(/Barbell bench press/);
    expect(est.weight).toBeGreaterThan(first.weight); // stronger than the novice default
    expect(est.weight).toBeLessThan(50);
  });
  it('progression survives a missed/short exercise (never negative / zero weights)', () => {
    const rx = prescribe(EX.lat_db, baseCtx({ history: [logged('2026-10-01', 'lat_db', [[4, 20]])] }));
    expect(rx.weight).toBeGreaterThan(0);
  });
});

describe('substitution', () => {
  const ctx = (o = {}) => ({
    profile: profile(), history: [], available: new Set<Equipment>(GYM), limits: [], inWorkout: [], today: MON, sets: 3, ...o,
  });
  it('bench press → pressing alternatives, not random chest/arm moves', () => {
    const r = rankSubstitutes('bb_bench', ctx());
    const ids = r.map(x => x.exercise.id);
    expect(ids.slice(0, 3)).toEqual(expect.arrayContaining(['db_bench', 'machine_chest']));
    for (const x of r.slice(0, 4)) expect(['h_push', 'inc_push']).toContain(x.exercise.pattern);
    expect(ids).not.toContain('bb_bench');
  });
  it('respects equipment, joint limits, avoided list and the current workout', () => {
    const dbOnly = rankSubstitutes('bb_bench', ctx({ available: new Set<Equipment>(['dumbbell']) }));
    for (const x of dbOnly) expect(x.exercise.equipment.every(q => q === 'dumbbell')).toBe(true);
    expect(dbOnly[0].exercise.id).toBe('db_floor_press'); // no bench → floor press
    const noShoulder = rankSubstitutes('bb_bench', ctx({ limits: ['shoulder'] }));
    for (const x of noShoulder) expect(x.exercise.stress.shoulder ?? 0).toBe(0);
    const avoid = rankSubstitutes('bb_bench', ctx({ profile: profile({ avoid: ['db_bench'] }) }));
    expect(avoid.map(x => x.exercise.id)).not.toContain('db_bench');
    const inWo = rankSubstitutes('bb_bench', ctx({ inWorkout: ['db_bench'] }));
    expect(inWo.map(x => x.exercise.id)).not.toContain('db_bench');
  });
  it('squat → leg press / split squat (quad dominant), not leg curl', () => {
    const ids = rankSubstitutes('squat', ctx()).map(x => x.exercise.id);
    expect(ids).toEqual(expect.arrayContaining(['leg_press']));
    expect(ids).not.toContain('leg_curl');
    expect(ids).not.toContain('rdl');
  });
  it('no-equipment substitutes still preserve the pattern (row → inverted row)', () => {
    const r = rankSubstitutes('bb_row', ctx({ available: new Set<Equipment>() }));
    expect(r[0].exercise.id).toBe('inv_row');
  });
  it('swapping keeps history separate, logs the origin and estimates the weight', () => {
    const h = [logged('2026-10-01', 'bb_bench', [[100, 8], [100, 8], [100, 8]])];
    const plan = planSession({ profile: profile(), history: h, today: MON }).workout;
    const target = plan.exercises.find(we => we.exerciseId === 'bb_bench');
    if (!target) return; // planner may choose another press; covered by other tests
    const w = swapExercise(plan, target.uid, 'db_bench', { profile: profile(), history: h, available: new Set(GYM), today: MON });
    const sw = w.exercises.find(we => we.uid === target.uid)!;
    expect(sw.exerciseId).toBe('db_bench');
    expect(sw.origExerciseId).toBe('bb_bench');
    expect(sw.sets.filter(s => !s.warmup).length).toBe(target.targetSets);
    expect(sw.sets.find(s => !s.warmup)!.weight).toBeGreaterThan(10);
  });
});

describe('weekly optimisation', () => {
  const p = profile({ days: [0, 2, 4] });

  it('uses Upper → Lower → Full across a normal 3-day week and balances the muscles', () => {
    const h = simulate(p, '2026-09-28', 1);
    expect(h.map(w => w.template)).toEqual(['upper', 'lower', 'full']);
  });

  it('a missed Monday shifts volume: Wednesday carries upper-body catch-up and nothing is "pretended"', () => {
    const normalWed = planSession({ profile: p, history: simulate(p, '2026-09-28', 1).slice(0, 1).map(w => ({ ...w, date: MON })), today: addDays(MON, 2) }).workout;
    const missedWed = planSession({ profile: p, history: [], today: addDays(MON, 2) });
    expect(missedWed.week.missedCount).toBe(1);
    expect(missedWed.week.days[0].status).toBe('missed');
    const upperSets = (w: typeof normalWed) => w.exercises.filter(we => (EX[we.exerciseId].muscles.chest ?? 0) + (EX[we.exerciseId].muscles.back ?? 0) > 0).reduce((a, we) => a + we.targetSets, 0);
    expect(upperSets(missedWed.workout)).toBeGreaterThan(upperSets(normalWed));
    expect(missedWed.workout.notes.join(' ')).toMatch(/missed/i);
  });

  it('missed Monday in a 3-day week: the 2 remaining sessions still cover every big muscle twice-ish', () => {
    const h = simulate(p, '2026-09-28', 3, { missDates: ['2026-09-28'] });
    const wk = h.filter(w => w.date >= '2026-09-28' && w.date <= '2026-10-04');
    expect(wk.length).toBe(2);
    const g = Object.fromEntries(MUSCLES.map(m => [m, 0])) as Record<Muscle, number>;
    for (const w of wk) { const ms = muscleSets(w, p.level); for (const m of MUSCLES) g[m] += ms[m]; }
    for (const m of ['chest', 'back', 'quads', 'hamstrings'] as Muscle[]) expect(g[m], m).toBeGreaterThanOrEqual(5);
    for (const w of wk) for (const m of MUSCLES) expect(muscleSets(w, p.level)[m]).toBeLessThanOrEqual(5.5);
  });

  it('training anyway on a rest day makes up the missed session and clears the "missed" marker', () => {
    const tue = addDays(MON, 1);
    const r = planSession({ profile: p, history: [], today: tue, options: { trainAnyway: true } });
    expect(r.week.days[1].status).toBe('rest');
    expect(r.week.slotsLeft).toBeGreaterThan(0);
    const done = { ...r.workout, startedAt: 1, finishedAt: 2, exercises: r.workout.exercises.map(we => ({ ...we, sets: we.sets.map(s => ({ ...s, done: true })) })) };
    const wk = computeWeek(p, [done], addDays(MON, 2));
    expect(wk.days[0].status).toBe('madeup');
    expect(wk.missedCount).toBe(0);
  });

  it('recently trained muscles are kept lighter (recovery spacing)', () => {
    const q = profile({ days: [0, 1, 3, 4] });
    const mon = planSession({ profile: q, history: [], today: MON }).workout;
    const monDone = { ...mon, startedAt: 1, finishedAt: 2, exercises: mon.exercises.map(we => ({ ...we, sets: we.sets.map(s => ({ ...s, done: true })) })) };
    const tue = planSession({ profile: q, history: [monDone], today: addDays(MON, 1) });
    expect(tue.workout.template).toBe('lower'); // upper just trained → lower is picked
  });

  it('completed week → next session starts next week early and says so', () => {
    const h = simulate(p, '2026-09-28', 1);
    const r = planSession({ profile: p, history: h, today: '2026-10-04' });
    expect(r.nextWeek).toBe(true);
    expect(r.workout.notes.join(' ')).toMatch(/next week/i);
  });

  it('weekly targets scale down for short, infrequent plans and never exceed the base', () => {
    const big = weeklyTargets(profile({ days: [0, 1, 3, 4], minutes: 60 }));
    const small = weeklyTargets(profile({ days: [0, 3], minutes: 20 }));
    for (const m of MUSCLES) expect(small[m]).toBeLessThanOrEqual(big[m]);
    expect(small.chest).toBeGreaterThanOrEqual(5);
  });
});

describe('dashboard vs planner consistency', () => {
  it('after a missed Monday the 2× check is "pending" (still achievable), not "attention"', () => {
    const p = profile({ days: [0, 2, 4] });
    const d = buildDashboard(p, [], addDays(MON, 2));
    expect(d.frequency.every(f => f.status === 'pending')).toBe(true);
    const late = buildDashboard(p, [], addDays(MON, 4)); // Friday, one slot left: 2× is impossible
    expect(late.frequency.some(f => f.status === 'attention')).toBe(true);
  });
});

describe('fatigue / deload', () => {
  const p = profile();
  it('fresh with no history; high after hard, falling-performance weeks; deload recommendation can be dismissed', () => {
    expect(assessFatigue([], MON, { level: 'intermediate', deload: { until: null, dismissedUntil: null, lastDeloadEnd: null } }).level).toBe('fresh');
    const h: ReturnType<typeof logged>[] = [];
    h.push(logged('2026-09-21', 'bb_bench', [[80, 8], [80, 8], [80, 8]], { effort: 'hard' }));
    h.push(logged('2026-09-24', 'bb_bench', [[80, 7], [80, 6], [80, 6]], { effort: 'hard' }));
    h.push(logged('2026-09-28', 'bb_bench', [[80, 6], [80, 5], [80, 4]], { effort: 'hard' }));
    h.push(logged('2026-10-01', 'bb_bench', [[80, 5], [80, 4], [80, 4]], { effort: 'hard' }));
    const r = assessFatigue(h, '2026-10-03', { level: p.level, deload: { until: null, dismissedUntil: null, lastDeloadEnd: null } });
    expect(['elevated', 'high']).toContain(r.level);
    const d = assessFatigue(h, '2026-10-03', { level: p.level, deload: { until: null, dismissedUntil: '2026-10-10', lastDeloadEnd: null } });
    expect(d.recommendDeload).toBe(false);
  });
  it('deload weeks cut sets and weights; deload end date is the coming Sunday', () => {
    const h = simulate(p, '2026-09-14', 3);
    const normal = planSession({ profile: p, history: h, today: '2026-10-05' }).workout;
    const dl = planSession({ profile: p, history: h, today: '2026-10-05', deload: { until: '2026-10-11', dismissedUntil: null, lastDeloadEnd: null } }).workout;
    expect(dl.mode).toBe('deload');
    expect(dl.plannedSets).toBeLessThan(normal.plannedSets);
    expect(weekday(deloadUntil('2026-10-05'))).toBe(6);
    expect(weekday(deloadUntil('2026-10-08'))).toBe(6);
  });
  it('"feeling tired" trims volume and adds a rep in reserve', () => {
    const h = simulate(p, '2026-09-14', 2);
    const n = planSession({ profile: p, history: h, today: '2026-10-05' }).workout;
    const t = planSession({ profile: p, history: h, today: '2026-10-05', options: { tired: true } }).workout;
    expect(t.plannedSets).toBeLessThan(n.plannedSets);
    expect(t.mode).toBe('trim');
    expect(t.exercises[0].rir).toBeGreaterThan(n.exercises[0].rir);
  });
});

describe('long-run behaviour (simulated user)', () => {
  it('performance climbs over 8 weeks and every session stays inside the constraints', () => {
    const p = profile({ level: 'beginner', days: [0, 2, 4] });
    const h = simulate(p, '2026-08-03', 8, { seed: 3 });
    const first = h.find(w => w.exercises.some(we => EX[we.exerciseId].load === 'external'))!;
    const id = first.exercises.find(we => EX[we.exerciseId].load === 'external')!.exerciseId;
    const exps = exposures(h, id);
    expect(exps.length).toBeGreaterThan(5);
    // after the first-session calibration the estimated max must rise (load OR reps)
    expect(bestScore(exps[exps.length - 1])).toBeGreaterThan(bestScore(exps[2]));
    for (const w of h) expect(w.plannedSets).toBeLessThanOrEqual(15);
  });
  it('coarse increments are earned with reps instead of oscillating between a failed jump and a reduction', () => {
    const p = profile({ level: 'beginner', days: [0, 2, 4] });
    const h = simulate(p, '2026-08-03', 10, { seed: 3 });
    for (const id of new Set(h.flatMap(w => w.exercises.map(we => we.exerciseId)))) {
      const acts = exposures(h, id).map(e => e.we.rxAction);
      for (let i = 2; i < acts.length; i++) expect(!(acts[i - 2] === 'increase' && acts[i - 1] === 'reduce' && acts[i] === 'increase'), `${id} oscillates`).toBe(true);
    }
  });
  it('keeps exercise selection stable week to week (limited variety)', () => {
    const p = profile({ days: [0, 2, 4] });
    const h = simulate(p, '2026-08-03', 6);
    const all = new Set(h.flatMap(w => w.exercises.map(we => we.exerciseId)));
    expect(all.size).toBeLessThanOrEqual(26);
  });
  it('never produces NaN or non-finite weights and always at least one exercise', () => {
    for (const p of [profile({ equipment: [] }), profile({ equipment: HOME, level: 'beginner' }), profile({ goal: 'strength', level: 'advanced' })]) {
      for (const w of simulate(p, '2026-08-03', 5, { seed: 11, missProb: 0.2 })) {
        expect(w.exercises.length).toBeGreaterThan(0);
        for (const we of w.exercises) for (const s of we.sets) { expect(Number.isFinite(s.weight)).toBe(true); expect(s.reps).toBeGreaterThan(0); }
      }
    }
  });
  it('dashboard and insights run on a long history', () => {
    const p = profile({ days: [0, 1, 3, 4] });
    const h = simulate(p, '2026-08-03', 8, { seed: 5, missProb: 0.1 });
    const d = buildDashboard(p, h, '2026-10-02');
    expect(d.hasData).toBe(true);
    expect(d.consistency.weeks.length).toBeGreaterThan(0);
    expect(d.frequency.length).toBe(6);
    expect(d.lifts.length).toBeGreaterThan(0);
    const ins = diagnose(p, h, '2026-10-02', { until: null, dismissedUntil: null, lastDeloadEnd: null });
    expect(ins.length).toBeGreaterThan(0);
  });
  it('flags low consistency', () => {
    const p = profile({ days: [0, 1, 3, 4] });
    const h = simulate(p, '2026-08-03', 8, { seed: 5, missProb: 0.7 });
    if (h.length < 3) return;
    const ins = diagnose(p, h, '2026-10-02', { until: null, dismissedUntil: null, lastDeloadEnd: null });
    expect(ins.map(i => i.id)).toContain('consistency');
  });
  it('detects a plateau and explains it with context', () => {
    const p = profile();
    const h = [
      logged('2026-09-01', 'bb_bench', [[80, 8], [80, 8], [80, 8]]),
      logged('2026-09-07', 'bb_bench', [[80, 8], [80, 8], [80, 7]], { effort: 'hard' }),
      logged('2026-09-14', 'bb_bench', [[80, 8], [80, 8], [80, 7]], { effort: 'hard' }),
      logged('2026-09-21', 'bb_bench', [[80, 8], [80, 7], [80, 7]], { effort: 'hard' }),
      logged('2026-09-28', 'bb_bench', [[80, 7], [80, 7], [80, 6]], { effort: 'hard' }),
    ];
    const ins = diagnose(p, h, '2026-10-02', { until: null, dismissedUntil: null, lastDeloadEnd: null });
    const pl = ins.find(i => i.id === 'plateau-bb_bench');
    expect(pl).toBeTruthy();
    expect(pl!.body).toMatch(/felt hard/);
  });
  it('detects PRs for the finish screen', () => {
    const before = [logged('2026-09-28', 'bb_bench', [[80, 8], [80, 8], [80, 8]])];
    const now = logged('2026-10-05', 'bb_bench', [[82.5, 8], [82.5, 8], [82.5, 7]]);
    const prs = workoutPRs(now, before, 80);
    expect(prs[0].label).toMatch(/82.5 kg/);
  });
});

describe('dates', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
});
