import type { Effort, Equipment, Profile, RxAction, Workout, WorkoutExercise } from './types';
import { EX } from './exercises';
import { parseKey } from './dates';

export const GYM: Equipment[] = ['barbell', 'rack', 'dumbbell', 'bench', 'cable', 'machine', 'bar'];
export const HOME: Equipment[] = ['dumbbell', 'bench', 'bar', 'band'];

export function profile(o: Partial<Profile> = {}): Profile {
  return {
    goal: 'hypertrophy', level: 'intermediate', days: [0, 2, 4], minutes: 45, equipment: [...GYM],
    limits: [], bodyweight: 80, avoid: [], createdOn: '2026-08-01', ...o,
  };
}

let n = 0;
/** a finished one-exercise workout for progression tests */
export function logged(
  date: string, exerciseId: string, sets: [number, number][],
  o: { effort?: Effort; targetSets?: number; rx?: RxAction; template?: Workout['template'] } = {},
): Workout {
  const ex = EX[exerciseId];
  const we: WorkoutExercise = {
    uid: `${exerciseId}-0`, exerciseId, targetSets: o.targetSets ?? sets.length, repMin: ex.reps[0], repMax: ex.reps[1],
    rir: 2, rest: 90, effort: o.effort, rxAction: o.rx ?? 'hold', rxReason: '',
    sets: sets.map(([weight, reps], i) => ({ id: `s${i}`, weight, reps, done: true })),
  };
  n++;
  return {
    id: `t${n}`, date, template: o.template ?? 'upper', title: 't', exercises: [we], explanation: '', notes: [],
    plannedSets: sets.length, plannedMinutes: 20, mode: 'normal',
    startedAt: parseKey(date).getTime(), finishedAt: parseKey(date).getTime() + 3600e3,
  };
}
