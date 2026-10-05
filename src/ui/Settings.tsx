import { useState } from 'react';
import { useApp } from '../store/context';
import { EQUIPMENT, JOINTS, type Equipment, type Goal, type Level } from '../engine/types';
import { DAY_LABELS } from '../engine/dates';
import { EX } from '../engine/exercises';
import { simulate } from '../engine/simulate';
import { Icon, Sheet } from './primitives';
import { STORAGE_KEY } from '../store/persist';

const EQ_LABEL: Record<Equipment, string> = { barbell: 'Barbell', rack: 'Squat rack', dumbbell: 'Dumbbells', bench: 'Bench', cable: 'Cables', machine: 'Machines', bar: 'Pull-up bar', band: 'Bands' };

export function Settings({ onClose }: { onClose: () => void }) {
  const { state, dispatch, today } = useApp();
  const p = state.profile!;
  const [confirmReset, setConfirmReset] = useState(false);
  const patch = (x: Partial<typeof p>) => dispatch({ type: 'UPDATE_PROFILE', patch: x });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `minimum-effective-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const demo = () => {
    const prof = { ...p, createdOn: '2026-08-03' };
    const start = (() => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 56 - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
    const h = simulate(prof, start, 8, { seed: 21, missProb: 0.12 }).filter(w => w.date < today);
    dispatch({ type: 'LOAD_DEMO', profile: { ...prof, createdOn: start }, history: h });
    onClose();
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="section-label" style={{ marginTop: 0 }}>Goal</div>
      <div className="chips">{([['hypertrophy', 'Build muscle'], ['strength', 'Get stronger'], ['general', 'Stay fit']] as [Goal, string][]).map(([g, l]) => <button key={g} className="chip" aria-pressed={p.goal === g} onClick={() => patch({ goal: g })}>{l}</button>)}</div>
      <div className="section-label">Experience</div>
      <div className="chips">{([['beginner', 'New'], ['intermediate', 'Some'], ['advanced', 'Experienced']] as [Level, string][]).map(([g, l]) => <button key={g} className="chip" aria-pressed={p.level === g} onClick={() => patch({ level: g })}>{l}</button>)}</div>
      <div className="section-label">Training days</div>
      <div className="daypick">{DAY_LABELS.map((d, i) => <button key={d} aria-pressed={p.days.includes(i)} onClick={() => { const n = toggle(p.days, i).sort(); if (n.length >= 2 && n.length <= 6) patch({ days: n }); }}>{d}</button>)}</div>
      <div className="section-label">Minutes per workout</div>
      <div className="chips">{[20, 30, 45, 60].map(m => <button key={m} className="chip" aria-pressed={p.minutes === m} onClick={() => patch({ minutes: m })}>{m}</button>)}</div>
      <div className="section-label">Equipment</div>
      <div className="chips">{EQUIPMENT.map(e => <button key={e} className="chip" aria-pressed={p.equipment.includes(e)} onClick={() => patch({ equipment: toggle(p.equipment, e) })}>{EQ_LABEL[e]}</button>)}</div>
      <div className="section-label">Always avoid (ongoing)</div>
      <div className="chips">{JOINTS.map(j => <button key={j} className="chip warn" aria-pressed={p.limits.includes(j)} onClick={() => patch({ limits: toggle(p.limits, j) })}>{j.replace('_', ' ')}</button>)}</div>
      <div className="section-label">Body weight</div>
      <label className="field"><input inputMode="decimal" aria-label="Body weight" value={p.bodyweight ?? ''} placeholder="optional" onChange={e => { const v = Number(e.target.value.replace(/[^0-9.]/g, '')); patch({ bodyweight: v > 25 && v < 300 ? v : undefined }); }} /><span className="muted">kg</span></label>

      {p.avoid.length > 0 && (<>
        <div className="section-label">Hidden exercises</div>
        <div className="chips">{p.avoid.map(id => <button key={id} className="chip" onClick={() => dispatch({ type: 'UNAVOID', id })}>{EX[id]?.name ?? id} <Icon name="x" size={14} /></button>)}</div>
      </>)}

      <div className="section-label">Your data</div>
      <p className="small muted">Everything stays on this device. Export a backup any time.</p>
      <div className="col" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn block" onClick={exportData}>Export data (JSON)</button>
        <button className="btn block" onClick={demo}>Load 8 weeks of demo history</button>
        <button className="btn block danger" onClick={() => setConfirmReset(true)}>Erase everything</button>
      </div>
      <p className="tiny muted" style={{ marginTop: 14 }}>Minimum Effective gives general training guidance, not medical advice. Stop if something hurts and see a qualified professional. Storage key: {STORAGE_KEY}.</p>

      {confirmReset && (
        <Sheet title="Erase all data?" sub="Your profile and every logged workout will be deleted from this device." onClose={() => setConfirmReset(false)}>
          <div className="col" style={{ gap: 8 }}>
            <button className="btn block danger" onClick={() => { dispatch({ type: 'RESET' }); setConfirmReset(false); onClose(); }}>Erase everything</button>
            <button className="btn block" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
