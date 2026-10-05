import type { Equipment, Exercise, Joint, LoadType, Muscle, Pattern } from './types';

type M = Partial<Record<Muscle, number>>;
type S = Partial<Record<Joint, 1 | 2>>;

interface Def {
  id: string; name: string; pattern: Pattern; muscles: M; equipment: Equipment[];
  kind: 'compound' | 'isolation'; skill: 1 | 2 | 3; fatigue: 1 | 2 | 3;
  reps: [number, number]; strengthReps?: [number, number];
  increment: number; startRatio?: number; q?: number; load?: LoadType; stress?: S;
  progressTo?: string; canAddLoad?: boolean; unilateral?: boolean; note?: string;
}

const d = (x: Def): Exercise => ({
  load: 'external', startRatio: 0, stress: {}, ...x,
});

export const EXERCISES: Exercise[] = [
  // ───────────── Chest ─────────────
  d({ id: 'bb_bench', name: 'Barbell bench press', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 }, equipment: ['barbell', 'bench', 'rack'], kind: 'compound', skill: 3, fatigue: 3, reps: [6, 10], strengthReps: [4, 6], increment: 2.5, startRatio: 0.5, stress: { shoulder: 1, wrist: 1 } }),
  d({ id: 'db_bench', name: 'Dumbbell bench press', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 }, equipment: ['dumbbell', 'bench'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], strengthReps: [6, 8], increment: 2, startRatio: 0.2, stress: { shoulder: 1 } }),
  d({ id: 'db_floor_press', q: 0.85, name: 'Dumbbell floor press', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 }, equipment: ['dumbbell'], kind: 'compound', skill: 1, fatigue: 2, reps: [8, 12], strengthReps: [6, 8], increment: 2, startRatio: 0.18, stress: { shoulder: 1 } }),
  d({ id: 'machine_chest', name: 'Machine chest press', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 }, equipment: ['machine'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], strengthReps: [6, 8], increment: 2.5, startRatio: 0.45, stress: { shoulder: 1 } }),
  d({ id: 'cable_press', q: 0.7, name: 'Standing cable press', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 }, equipment: ['cable'], kind: 'compound', skill: 1, fatigue: 1, reps: [10, 15], increment: 2.5, startRatio: 0.15, stress: { shoulder: 1 } }),
  d({ id: 'pushup', name: 'Push-up', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 20], increment: 0, load: 'bodyweight', progressTo: 'pushup_feet', stress: { shoulder: 1, wrist: 1 } }),
  d({ id: 'pushup_feet', name: 'Feet-elevated push-up', pattern: 'h_push', muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [6, 15], increment: 0, load: 'bodyweight', stress: { shoulder: 1, wrist: 1 }, note: 'Feet on a chair or sofa' }),
  d({ id: 'inc_db', q: 0.95, name: 'Incline dumbbell press', pattern: 'inc_push', muscles: { chest: 1, shoulders: 0.25, triceps: 0.5 }, equipment: ['dumbbell', 'bench'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], strengthReps: [6, 8], increment: 2, startRatio: 0.17, stress: { shoulder: 1 } }),
  d({ id: 'inc_bb', q: 0.95, name: 'Incline barbell press', pattern: 'inc_push', muscles: { chest: 1, shoulders: 0.25, triceps: 0.5 }, equipment: ['barbell', 'bench', 'rack'], kind: 'compound', skill: 3, fatigue: 3, reps: [6, 10], strengthReps: [5, 8], increment: 2.5, startRatio: 0.4, stress: { shoulder: 2 } }),
  d({ id: 'inc_machine', q: 0.95, name: 'Incline machine press', pattern: 'inc_push', muscles: { chest: 1, shoulders: 0.25, triceps: 0.5 }, equipment: ['machine'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], increment: 2.5, startRatio: 0.4, stress: { shoulder: 1 } }),
  d({ id: 'cable_fly', name: 'Cable fly', pattern: 'chest_fly', muscles: { chest: 1 }, equipment: ['cable'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 2.5, startRatio: 0.1, stress: { shoulder: 1 } }),
  d({ id: 'db_fly', q: 0.9, name: 'Dumbbell fly', pattern: 'chest_fly', muscles: { chest: 1 }, equipment: ['dumbbell', 'bench'], kind: 'isolation', skill: 2, fatigue: 1, reps: [10, 15], increment: 1, startRatio: 0.08, stress: { shoulder: 2 } }),
  d({ id: 'pec_deck', name: 'Pec deck', pattern: 'chest_fly', muscles: { chest: 1 }, equipment: ['machine'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 2.5, startRatio: 0.35, stress: { shoulder: 1 } }),

  // ───────────── Shoulders ─────────────
  d({ id: 'bb_ohp', name: 'Overhead press', pattern: 'v_push', muscles: { shoulders: 1, triceps: 0.5 }, equipment: ['barbell'], kind: 'compound', skill: 3, fatigue: 3, reps: [6, 10], strengthReps: [4, 6], increment: 2.5, startRatio: 0.3, stress: { shoulder: 2, lower_back: 1 } }),
  d({ id: 'db_ohp', name: 'Dumbbell shoulder press', pattern: 'v_push', muscles: { shoulders: 1, triceps: 0.5 }, equipment: ['dumbbell'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], strengthReps: [6, 8], increment: 2, startRatio: 0.14, stress: { shoulder: 2 } }),
  d({ id: 'machine_ohp', name: 'Machine shoulder press', pattern: 'v_push', muscles: { shoulders: 1, triceps: 0.5 }, equipment: ['machine'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], increment: 2.5, startRatio: 0.3, stress: { shoulder: 2 } }),
  d({ id: 'pike_pushup', name: 'Pike push-up', pattern: 'v_push', muscles: { shoulders: 1, triceps: 0.5 }, equipment: [], kind: 'compound', skill: 2, fatigue: 1, reps: [6, 15], increment: 0, load: 'bodyweight', progressTo: 'pike_feet', stress: { shoulder: 2, wrist: 1 } }),
  d({ id: 'pike_feet', name: 'Feet-elevated pike push-up', pattern: 'v_push', muscles: { shoulders: 1, triceps: 0.5 }, equipment: [], kind: 'compound', skill: 2, fatigue: 1, reps: [5, 12], increment: 0, load: 'bodyweight', stress: { shoulder: 2, wrist: 1 }, note: 'Feet on a chair' }),
  d({ id: 'lat_db', name: 'Dumbbell lateral raise', pattern: 'lat_raise', muscles: { shoulders: 1 }, equipment: ['dumbbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 20], increment: 1, startRatio: 0.05, stress: { shoulder: 1 } }),
  d({ id: 'lat_cable', name: 'Cable lateral raise', pattern: 'lat_raise', muscles: { shoulders: 1 }, equipment: ['cable'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 20], increment: 1.25, startRatio: 0.04, stress: { shoulder: 1 }, unilateral: true }),
  d({ id: 'lat_band', name: 'Band lateral raise', pattern: 'lat_raise', muscles: { shoulders: 1 }, equipment: ['band'], kind: 'isolation', skill: 1, fatigue: 1, reps: [15, 25], increment: 0, load: 'bodyweight', stress: { shoulder: 1 } }),
  d({ id: 'rear_db', name: 'Rear-delt dumbbell fly', pattern: 'rear_delt', muscles: { shoulders: 1, back: 0.25 }, equipment: ['dumbbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 20], increment: 1, startRatio: 0.04 }),
  d({ id: 'rear_machine', name: 'Reverse pec deck', pattern: 'rear_delt', muscles: { shoulders: 1, back: 0.25 }, equipment: ['machine'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 20], increment: 2.5, startRatio: 0.25 }),
  d({ id: 'face_pull', name: 'Face pull', pattern: 'rear_delt', muscles: { shoulders: 1, back: 0.25 }, equipment: ['cable'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 20], increment: 2.5, startRatio: 0.2 }),
  d({ id: 'band_pullapart', name: 'Band pull-apart', pattern: 'rear_delt', muscles: { shoulders: 1, back: 0.25 }, equipment: ['band'], kind: 'isolation', skill: 1, fatigue: 1, reps: [15, 25], increment: 0, load: 'bodyweight' }),

  // ───────────── Back ─────────────
  d({ id: 'bb_row', name: 'Barbell row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: ['barbell'], kind: 'compound', skill: 3, fatigue: 3, reps: [6, 10], strengthReps: [5, 8], increment: 2.5, startRatio: 0.5, stress: { lower_back: 2 } }),
  d({ id: 'db_row', name: 'One-arm dumbbell row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: ['dumbbell'], kind: 'compound', skill: 1, fatigue: 2, reps: [8, 12], strengthReps: [6, 8], increment: 2, startRatio: 0.22, unilateral: true }),
  d({ id: 'cs_db_row', name: 'Chest-supported dumbbell row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: ['dumbbell', 'bench'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], increment: 2, startRatio: 0.18 }),
  d({ id: 'cable_row', name: 'Seated cable row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: ['cable'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], increment: 2.5, startRatio: 0.45 }),
  d({ id: 'machine_row', name: 'Chest-supported machine row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: ['machine'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], increment: 2.5, startRatio: 0.45 }),
  d({ id: 'band_row', name: 'Band row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: ['band'], kind: 'compound', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight' }),
  d({ id: 'inv_row', name: 'Inverted row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [6, 15], increment: 0, load: 'bodyweight', progressTo: 'inv_row_feet', note: 'Under a sturdy table or low bar', stress: {} }),
  d({ id: 'inv_row_feet', name: 'Feet-elevated inverted row', pattern: 'h_pull', muscles: { back: 1, biceps: 0.5, shoulders: 0.25 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [5, 12], increment: 0, load: 'bodyweight', note: 'Under a sturdy table, feet on a chair' }),
  d({ id: 'pulldown', name: 'Lat pulldown', pattern: 'v_pull', muscles: { back: 1, biceps: 0.5 }, equipment: ['cable'], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 12], strengthReps: [6, 10], increment: 2.5, startRatio: 0.5 }),
  d({ id: 'pullup', name: 'Pull-up', pattern: 'v_pull', muscles: { back: 1, biceps: 0.5 }, equipment: ['bar'], kind: 'compound', skill: 2, fatigue: 2, reps: [5, 12], strengthReps: [3, 6], increment: 2.5, load: 'bodyweight', canAddLoad: true, stress: { shoulder: 1, elbow: 1 } }),
  d({ id: 'chinup', name: 'Chin-up', pattern: 'v_pull', muscles: { back: 1, biceps: 0.75 }, equipment: ['bar'], kind: 'compound', skill: 2, fatigue: 2, reps: [5, 12], strengthReps: [3, 6], increment: 2.5, load: 'bodyweight', canAddLoad: true, stress: { elbow: 1 } }),
  d({ id: 'band_pulldown', name: 'Band pulldown', pattern: 'v_pull', muscles: { back: 1, biceps: 0.5 }, equipment: ['band'], kind: 'compound', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight', note: 'Anchor the band overhead' }),

  // ───────────── Quads / glutes / hamstrings ─────────────
  d({ id: 'squat', name: 'Back squat', pattern: 'squat', muscles: { quads: 1, glutes: 0.5 }, equipment: ['barbell', 'rack'], kind: 'compound', skill: 3, fatigue: 3, reps: [6, 10], strengthReps: [4, 6], increment: 2.5, startRatio: 0.6, stress: { knee: 2, hip: 1, lower_back: 1 } }),
  d({ id: 'goblet', q: 0.85, name: 'Goblet squat', pattern: 'squat', muscles: { quads: 1, glutes: 0.5 }, equipment: ['dumbbell'], kind: 'compound', skill: 1, fatigue: 2, reps: [8, 15], increment: 2, startRatio: 0.22, stress: { knee: 2 } }),
  d({ id: 'leg_press', name: 'Leg press', pattern: 'squat', muscles: { quads: 1, glutes: 0.5 }, equipment: ['machine'], kind: 'compound', skill: 1, fatigue: 2, reps: [8, 15], increment: 5, startRatio: 1.2, stress: { knee: 1 } }),
  d({ id: 'bw_squat', name: 'Bodyweight squat', pattern: 'squat', muscles: { quads: 1, glutes: 0.5 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight', progressTo: 'bw_split', stress: { knee: 1 } }),
  d({ id: 'bw_split', name: 'Split squat', pattern: 'lunge', muscles: { quads: 1, glutes: 0.5 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 15], increment: 0, load: 'bodyweight', progressTo: 'bw_bulgarian', unilateral: true, stress: { knee: 2 } }),
  d({ id: 'bw_bulgarian', name: 'Rear-foot-elevated split squat', pattern: 'lunge', muscles: { quads: 1, glutes: 0.5 }, equipment: [], kind: 'compound', skill: 2, fatigue: 2, reps: [6, 12], increment: 0, load: 'bodyweight', unilateral: true, stress: { knee: 2 }, note: 'Rear foot on a chair' }),
  d({ id: 'db_bulgarian', name: 'Dumbbell split squat (rear foot up)', pattern: 'lunge', muscles: { quads: 1, glutes: 0.5 }, equipment: ['dumbbell', 'bench'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], increment: 2, startRatio: 0.12, unilateral: true, stress: { knee: 2 } }),
  d({ id: 'db_lunge', name: 'Dumbbell lunge', pattern: 'lunge', muscles: { quads: 1, glutes: 0.5 }, equipment: ['dumbbell'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], increment: 2, startRatio: 0.12, unilateral: true, stress: { knee: 2 } }),
  d({ id: 'leg_ext', name: 'Leg extension', pattern: 'knee_ext', muscles: { quads: 1 }, equipment: ['machine'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 5, startRatio: 0.35, stress: { knee: 1 } }),
  d({ id: 'rdl', name: 'Romanian deadlift', pattern: 'hinge', muscles: { hamstrings: 1, glutes: 0.5 }, equipment: ['barbell'], kind: 'compound', skill: 3, fatigue: 2, reps: [6, 10], strengthReps: [5, 8], increment: 2.5, startRatio: 0.6, stress: { lower_back: 1, hip: 1 } }),
  d({ id: 'db_rdl', name: 'Dumbbell Romanian deadlift', pattern: 'hinge', muscles: { hamstrings: 1, glutes: 0.5 }, equipment: ['dumbbell'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], increment: 2, startRatio: 0.22, stress: { lower_back: 1, hip: 1 } }),
  d({ id: 'deadlift', name: 'Deadlift', pattern: 'hinge', muscles: { hamstrings: 1, glutes: 1, back: 0.5, quads: 0.25 }, equipment: ['barbell'], kind: 'compound', skill: 3, fatigue: 3, reps: [5, 8], strengthReps: [3, 5], increment: 2.5, startRatio: 0.8, stress: { lower_back: 2, hip: 1 } }),
  d({ id: 'leg_curl', name: 'Leg curl', pattern: 'knee_flex', muscles: { hamstrings: 1 }, equipment: ['machine'], kind: 'isolation', skill: 1, fatigue: 1, reps: [8, 15], increment: 5, startRatio: 0.3 }),
  d({ id: 'slide_curl', name: 'Towel slide leg curl', pattern: 'knee_flex', muscles: { hamstrings: 1 }, equipment: [], kind: 'isolation', skill: 2, fatigue: 1, reps: [6, 15], increment: 0, load: 'bodyweight', note: 'Heels on a towel on a smooth floor' }),
  d({ id: 'band_curl_leg', name: 'Band leg curl', pattern: 'knee_flex', muscles: { hamstrings: 1 }, equipment: ['band'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight' }),
  d({ id: 'hip_thrust', name: 'Barbell hip thrust', pattern: 'hip_ext', muscles: { glutes: 1, hamstrings: 0.25 }, equipment: ['barbell', 'bench'], kind: 'compound', skill: 2, fatigue: 2, reps: [8, 12], increment: 5, startRatio: 0.8 }),
  d({ id: 'db_hip_thrust', name: 'Dumbbell hip thrust', pattern: 'hip_ext', muscles: { glutes: 1, hamstrings: 0.25 }, equipment: ['dumbbell', 'bench'], kind: 'compound', skill: 1, fatigue: 1, reps: [10, 15], increment: 2, startRatio: 0.35 }),
  d({ id: 'glute_bridge', name: 'Glute bridge', pattern: 'hip_ext', muscles: { glutes: 1, hamstrings: 0.25 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight', progressTo: 'sl_bridge' }),
  d({ id: 'sl_bridge', name: 'Single-leg glute bridge', pattern: 'hip_ext', muscles: { glutes: 1, hamstrings: 0.25 }, equipment: [], kind: 'compound', skill: 1, fatigue: 1, reps: [8, 15], increment: 0, load: 'bodyweight', unilateral: true }),
  d({ id: 'calf_machine', name: 'Standing calf raise (machine)', pattern: 'calf', muscles: { calves: 1 }, equipment: ['machine'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 20], increment: 5, startRatio: 0.8 }),
  d({ id: 'calf_db', name: 'Single-leg dumbbell calf raise', pattern: 'calf', muscles: { calves: 1 }, equipment: ['dumbbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 20], increment: 2, startRatio: 0.2, unilateral: true }),
  d({ id: 'calf_bw', name: 'Calf raise (bodyweight)', pattern: 'calf', muscles: { calves: 1 }, equipment: [], kind: 'isolation', skill: 1, fatigue: 1, reps: [15, 30], increment: 0, load: 'bodyweight', progressTo: 'calf_sl_bw' }),
  d({ id: 'calf_sl_bw', name: 'Single-leg calf raise', pattern: 'calf', muscles: { calves: 1 }, equipment: [], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 25], increment: 0, load: 'bodyweight', unilateral: true }),

  // ───────────── Arms ─────────────
  d({ id: 'bb_curl', name: 'Barbell curl', pattern: 'elbow_flex', muscles: { biceps: 1 }, equipment: ['barbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [8, 12], increment: 2.5, startRatio: 0.25, stress: { wrist: 1 } }),
  d({ id: 'db_curl', name: 'Dumbbell curl', pattern: 'elbow_flex', muscles: { biceps: 1 }, equipment: ['dumbbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [8, 12], increment: 1, startRatio: 0.1 }),
  d({ id: 'hammer', name: 'Hammer curl', pattern: 'elbow_flex', muscles: { biceps: 1 }, equipment: ['dumbbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [8, 12], increment: 1, startRatio: 0.11 }),
  d({ id: 'inc_curl', name: 'Incline dumbbell curl', pattern: 'elbow_flex', muscles: { biceps: 1 }, equipment: ['dumbbell', 'bench'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 1, startRatio: 0.08 }),
  d({ id: 'cable_curl', name: 'Cable curl', pattern: 'elbow_flex', muscles: { biceps: 1 }, equipment: ['cable'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 2.5, startRatio: 0.2 }),
  d({ id: 'band_curl', name: 'Band curl', pattern: 'elbow_flex', muscles: { biceps: 1 }, equipment: ['band'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight' }),
  d({ id: 'pushdown', name: 'Cable pushdown', pattern: 'elbow_ext', muscles: { triceps: 1 }, equipment: ['cable'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 2.5, startRatio: 0.25, stress: { elbow: 1 } }),
  d({ id: 'oh_tri_db', name: 'Overhead dumbbell triceps extension', pattern: 'elbow_ext', muscles: { triceps: 1 }, equipment: ['dumbbell'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 2, startRatio: 0.15, stress: { elbow: 1, shoulder: 1 } }),
  d({ id: 'oh_tri_cable', name: 'Overhead cable triceps extension', pattern: 'elbow_ext', muscles: { triceps: 1 }, equipment: ['cable'], kind: 'isolation', skill: 1, fatigue: 1, reps: [10, 15], increment: 2.5, startRatio: 0.2, stress: { elbow: 1, shoulder: 1 } }),
  d({ id: 'band_pushdown', name: 'Band pushdown', pattern: 'elbow_ext', muscles: { triceps: 1 }, equipment: ['band'], kind: 'isolation', skill: 1, fatigue: 1, reps: [12, 25], increment: 0, load: 'bodyweight' }),
  d({ id: 'close_pushup', name: 'Close-grip push-up', pattern: 'elbow_ext', muscles: { triceps: 1, chest: 0.25 }, equipment: [], kind: 'isolation', skill: 1, fatigue: 1, reps: [8, 20], increment: 0, load: 'bodyweight', stress: { wrist: 1, elbow: 1 } }),
  d({ id: 'close_bench', name: 'Close-grip bench press', pattern: 'elbow_ext', muscles: { triceps: 1, chest: 0.25, shoulders: 0.25 }, equipment: ['barbell', 'bench', 'rack'], kind: 'isolation', skill: 3, fatigue: 2, reps: [6, 10], increment: 2.5, startRatio: 0.4, stress: { wrist: 1, elbow: 1, shoulder: 1 } }),
];

export const EX: Record<string, Exercise> = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

export function getExercise(id: string): Exercise {
  const e = EX[id];
  if (!e) throw new Error(`Unknown exercise ${id}`);
  return e;
}

export function canDo(e: Exercise, available: Set<Equipment>): boolean {
  return e.equipment.every(q => available.has(q));
}

export function isBlockedByJoint(e: Exercise, limits: Iterable<Joint>): boolean {
  for (const j of limits) if ((e.stress[j] ?? 0) >= 1) return true;
  return false;
}

export function primaryMuscles(e: Exercise): Muscle[] {
  return (Object.entries(e.muscles) as [Muscle, number][]).filter(([, w]) => w >= 1).map(([m]) => m);
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
};

export const PATTERN_LABEL: Record<Pattern, string> = {
  h_push: 'Horizontal push', inc_push: 'Incline push', v_push: 'Vertical push', chest_fly: 'Chest fly',
  h_pull: 'Horizontal pull', v_pull: 'Vertical pull', rear_delt: 'Rear delt', squat: 'Squat', lunge: 'Lunge / split squat',
  hinge: 'Hip hinge', hip_ext: 'Hip extension', knee_ext: 'Knee extension', knee_flex: 'Knee flexion',
  elbow_flex: 'Elbow flexion', elbow_ext: 'Elbow extension', lat_raise: 'Lateral raise', calf: 'Calf',
};
