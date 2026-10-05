import { useMemo, useState } from 'react';
import { EQUIPMENT, JOINTS, type Equipment, type Goal, type Joint, type Level, type Profile } from '../engine/types';
import { DAY_LABELS, defaultDays, todayKey } from '../engine/dates';
import { TEMPLATES, weekTemplates } from '../engine/weekly';
import { planSession } from '../engine/planner';
import { EX } from '../engine/exercises';
import { Icon } from './primitives';

const GOALS: { id: Goal; t: string; d: string; icon: string }[] = [
  { id: 'hypertrophy', t: 'Build muscle', d: 'Size and shape, steady strength gains', icon: 'dumbbell' },
  { id: 'strength', t: 'Get stronger', d: 'Heavier lifts, lower reps, longer rests', icon: 'target' },
  { id: 'general', t: 'Stay fit & healthy', d: 'Balanced, sustainable, not too hard', icon: 'leaf' },
];
const LEVELS: { id: Level; t: string; d: string }[] = [
  { id: 'beginner', t: 'New to lifting', d: 'Under ~6 months of regular training' },
  { id: 'intermediate', t: 'Some experience', d: '6 months to 2 years' },
  { id: 'advanced', t: 'Experienced', d: '2+ years, you know your lifts' },
];
const EQ_PRESETS: { id: string; t: string; d: string; eq: Equipment[]; icon: string }[] = [
  { id: 'gym', t: 'Full gym', d: 'Barbells, machines, cables, dumbbells', eq: ['barbell', 'rack', 'dumbbell', 'bench', 'cable', 'machine', 'bar'], icon: 'dumbbell' },
  { id: 'home', t: 'Home gym', d: 'Barbell/rack, dumbbells, bench', eq: ['barbell', 'rack', 'dumbbell', 'bench', 'bar', 'band'], icon: 'home' },
  { id: 'db', t: 'Dumbbells only', d: 'Plus a bench if you have one', eq: ['dumbbell', 'bench'], icon: 'dumbbell' },
  { id: 'bw', t: 'Bodyweight only', d: 'No equipment needed', eq: [], icon: 'bolt' },
];
const EQ_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell', rack: 'Squat rack', dumbbell: 'Dumbbells', bench: 'Bench', cable: 'Cables', machine: 'Machines', bar: 'Pull-up bar', band: 'Bands',
};
const MINUTES = [20, 30, 45, 60];

export function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [days, setDays] = useState<number[]>([0, 2, 4]);
  const [minutes, setMinutes] = useState(45);
  const [preset, setPreset] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [custom, setCustom] = useState(false);
  const [bw, setBw] = useState('');
  const [limits, setLimits] = useState<Joint[]>([]);
  const TOTAL = 6;

  const profile: Profile = useMemo(() => ({
    goal: goal ?? 'hypertrophy', level: level ?? 'beginner', days: [...days].sort(), minutes, equipment, limits,
    bodyweight: bw && Number(bw) > 25 && Number(bw) < 300 ? Number(bw) : undefined, avoid: [], createdOn: todayKey(),
  }), [goal, level, days, minutes, equipment, limits, bw]);

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => Math.max(0, s - 1));
  const toggleDay = (d: number) => setDays(cur => cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]);
  const setCount = (n: number) => setDays(defaultDays(n));

  const preview = useMemo(() => step === 5 ? planSession({ profile, history: [], today: todayKey(), options: { trainAnyway: true } }) : null, [step, profile]);

  return (
    <div className="ob">
      <div className="dots" aria-label={`Step ${step + 1} of ${TOTAL}`}>{Array.from({ length: TOTAL }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (<>
        <h1>What are you training for?</h1>
        <p className="why">This sets rep ranges, rest and how much volume you need.</p>
        <div className="col">
          {GOALS.map(g => (
            <button key={g.id} className="opt" aria-pressed={goal === g.id} onClick={() => { setGoal(g.id); next(); }}>
              <span className="ic"><Icon name={g.icon} /></span>
              <span><div className="t">{g.t}</div><div className="d">{g.d}</div></span>
            </button>
          ))}
        </div>
      </>)}

      {step === 1 && (<>
        <h1>How experienced are you?</h1>
        <p className="why">Beginners progress on less volume. Experienced lifters need a bit more and get tougher targets.</p>
        <div className="col">
          {LEVELS.map(l => (
            <button key={l.id} className="opt" aria-pressed={level === l.id} onClick={() => { setLevel(l.id); next(); }}>
              <span><div className="t">{l.t}</div><div className="d">{l.d}</div></span>
            </button>
          ))}
        </div>
      </>)}

      {step === 2 && (<>
        <h1>When can you train?</h1>
        <p className="why">Pick the days that usually work. If a day gets missed, the rest of the week re-plans around it.</p>
        <div className="section-label" style={{ marginTop: 0 }}>Days per week</div>
        <div className="chips">
          {[2, 3, 4, 5].map(n => <button key={n} className="chip" aria-pressed={days.length === n} onClick={() => setCount(n)}>{n} days</button>)}
        </div>
        <div className="section-label">Which days</div>
        <div className="daypick">
          {DAY_LABELS.map((d, i) => <button key={d} aria-pressed={days.includes(i)} onClick={() => toggleDay(i)}>{d}</button>)}
        </div>
        {days.length < 2 || days.length > 6 ? <p className="small muted" style={{ marginTop: 8 }}>Pick 2–6 days.</p> : null}
        <div className="section-label">Time per workout</div>
        <div className="chips">
          {MINUTES.map(m => <button key={m} className="chip" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} min</button>)}
        </div>
        <div className="foot"><button className="btn primary big" disabled={days.length < 2 || days.length > 6} onClick={next}>Continue</button></div>
      </>)}

      {step === 3 && (<>
        <h1>What do you have access to?</h1>
        <p className="why">Workouts are built from what you actually have. You can switch for a single day later.</p>
        <div className="col">
          {EQ_PRESETS.map(p => (
            <button key={p.id} className="opt" aria-pressed={preset === p.id} onClick={() => { setPreset(p.id); setEquipment(p.eq); }}>
              <span className="ic"><Icon name={p.icon} /></span>
              <span><div className="t">{p.t}</div><div className="d">{p.d}</div></span>
            </button>
          ))}
        </div>
        <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => setCustom(c => !c)}>{custom ? 'Hide' : 'Customise equipment'}</button>
        {custom && (
          <div className="chips" style={{ marginTop: 6 }}>
            {EQUIPMENT.map(e => (
              <button key={e} className="chip" aria-pressed={equipment.includes(e)} onClick={() => { setPreset(preset ?? 'custom'); setEquipment(cur => cur.includes(e) ? cur.filter(x => x !== e) : [...cur, e]); }}>{EQ_LABEL[e]}</button>
            ))}
          </div>
        )}
        <div className="foot"><button className="btn primary big" disabled={preset === null} onClick={next}>Continue</button></div>
      </>)}

      {step === 4 && (<>
        <h1>Anything to avoid?</h1>
        <p className="why">Optional. Tap any area that’s bothering you — we’ll skip movements that load it. We don’t diagnose; if something hurts, see a professional.</p>
        <div className="chips">
          {JOINTS.map(j => <button key={j} className="chip warn" aria-pressed={limits.includes(j)} onClick={() => setLimits(cur => cur.includes(j) ? cur.filter(x => x !== j) : [...cur, j])}>{j.replace('_', ' ')}</button>)}
        </div>
        <div className="section-label">Body weight (optional)</div>
        <label className="field">
          <input inputMode="decimal" placeholder="e.g. 78" value={bw} onChange={e => setBw(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Body weight in kilograms" />
          <span className="muted">kg</span>
        </label>
        <p className="small muted" style={{ marginTop: 8 }}>Only used to guess sensible starting weights. Skip it and the first session simply starts a bit more cautiously.</p>
        <div className="foot"><button className="btn primary big" onClick={next}>Build my plan</button></div>
      </>)}

      {step === 5 && preview && (<>
        <h1>Your week</h1>
        <p className="why">Every muscle is trained about twice a week, with a hard cap on junk volume per session.</p>
        <div className="card flush">
          {weekTemplates(profile.days.length).map((t, i) => (
            <div key={i} className="list-row" style={{ padding: '14px 16px' }}>
              <span className="pill accent">{DAY_LABELS[[...profile.days].sort()[i]]}</span>
              <div className="grow"><div className="bold">{TEMPLATES[t].name}</div></div>
            </div>
          ))}
        </div>
        <div className="section-label">First workout</div>
        <div className="card">
          <div className="small muted">{preview.workout.explanation}</div>
          <div className="xlist">
            {preview.workout.exercises.map(we => (
              <div className="xrow" key={we.uid}><span className="n">{EX[we.exerciseId].name}</span><span className="s num">{we.targetSets} × {we.repMin}–{we.repMax}</span></div>
            ))}
          </div>
        </div>
        <div className="foot"><button className="btn primary big" onClick={() => onDone(profile)}>Let’s go</button></div>
      </>)}

      {step > 0 && <button className="btn ghost block" style={{ marginTop: step === 5 || step === 2 || step === 3 || step === 4 ? 8 : 20 }} onClick={back}>Back</button>}
    </div>
  );
}
