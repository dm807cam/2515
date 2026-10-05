export type Muscle =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves';

export const MUSCLES: Muscle[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves',
];

export type Equipment = 'barbell' | 'rack' | 'dumbbell' | 'bench' | 'cable' | 'machine' | 'bar' | 'band';
export const EQUIPMENT: Equipment[] = ['barbell', 'rack', 'dumbbell', 'bench', 'cable', 'machine', 'bar', 'band'];

export type Pattern =
  | 'h_push' | 'inc_push' | 'v_push' | 'chest_fly'
  | 'h_pull' | 'v_pull' | 'rear_delt'
  | 'squat' | 'lunge' | 'hinge' | 'hip_ext' | 'knee_ext' | 'knee_flex'
  | 'elbow_flex' | 'elbow_ext' | 'lat_raise' | 'calf';

export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'lower_back' | 'knee' | 'hip';
export const JOINTS: Joint[] = ['shoulder', 'elbow', 'wrist', 'lower_back', 'knee', 'hip'];

export type Goal = 'hypertrophy' | 'strength' | 'general';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type LoadType = 'external' | 'bodyweight';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** muscle -> credit per working set (1 = direct, 0.5 = secondary, 0.25 = minor). */
  muscles: Partial<Record<Muscle, number>>;
  /** all required; empty = bodyweight / improvised */
  equipment: Equipment[];
  kind: 'compound' | 'isolation';
  /** 1 easy to learn/safe, 3 technical */
  skill: 1 | 2 | 3;
  /** systemic/joint fatigue cost, 1..3 */
  fatigue: 1 | 2 | 3;
  /** default (hypertrophy) rep range */
  reps: [number, number];
  strengthReps?: [number, number];
  /** smallest sensible jump in kg (per dumbbell for dumbbells) */
  increment: number;
  /** typical novice working weight for ~10 reps as a fraction of bodyweight (kg). 0 for bodyweight moves */
  startRatio: number;
  load: LoadType;
  stress: Partial<Record<Joint, 1 | 2>>;
  /** bodyweight exercises: harder variation to advance to */
  progressTo?: string;
  /** bodyweight exercises that can also take added weight (pull-up) */
  canAddLoad?: boolean;
  unilateral?: boolean;
  /** stimulus quality multiplier for ranking (default 1) */
  q?: number;
  /** needs household stuff (table, chair, towel) rather than gym equipment */
  note?: string;
}

export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface Profile {
  goal: Goal;
  level: Level;
  /** weekday indexes, Mon=0 */
  days: number[];
  minutes: number;
  equipment: Equipment[];
  limits: Joint[];
  bodyweight?: number;
  avoid: string[];
  createdOn: string;
}

export type Effort = 'easy' | 'right' | 'hard';
/** reps in reserve implied by the effort tap */
export const EFFORT_RIR: Record<Effort, number> = { easy: 4, right: 2, hard: 0 };

export interface SetLog {
  id: string;
  weight: number;
  reps: number;
  done: boolean;
  warmup?: boolean;
  /** planned values, used to prefill and to evaluate */
  targetReps?: number;
}

export type RxAction =
  | 'start' | 'estimate' | 'increase' | 'build' | 'hold' | 'reduce' | 'deload' | 'reset' | 'advance' | 'trim';

export interface WorkoutExercise {
  uid: string;
  exerciseId: string;
  origExerciseId?: string;
  sets: SetLog[];
  targetSets: number;
  repMin: number;
  repMax: number;
  rir: number;
  rest: number;
  effort?: Effort;
  skipped?: boolean;
  /** the user answered the "too heavy / too light" check on this exercise */
  calibrated?: boolean;
  rxAction: RxAction;
  rxReason: string;
}

export type TemplateId = 'full_a' | 'full_b' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full';

export interface Workout {
  id: string;
  date: string;
  template: TemplateId;
  title: string;
  exercises: WorkoutExercise[];
  explanation: string;
  notes: string[];
  plannedSets: number;
  plannedMinutes: number;
  minutesCap?: number;
  mode: 'normal' | 'trim' | 'deload';
  startedAt?: number;
  finishedAt?: number;
  /** rest timer, persisted so it survives leaving the app */
  restEndsAt?: number;
  restTotal?: number;
}

export interface PlanOptions {
  minutes?: number;
  equipment?: EquipmentPreset;
  tired?: boolean;
  /** pain areas for today only (also persisted as 7-day limits at the state level) */
  limits?: Joint[];
  exclude?: string[];
  trainAnyway?: boolean;
}

export type EquipmentPreset = 'none' | 'dumbbells' | 'machines' | 'home' | 'travel';

export interface DeloadState {
  until: string | null;
  dismissedUntil: string | null;
  lastDeloadEnd: string | null;
}

export interface TempLimit { area: Joint; until: string }
