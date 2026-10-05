import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useNow, useToast } from '../store/context';
import { EX, MUSCLE_LABEL } from '../engine/exercises';
import { exposures, topWeight } from '../engine/history';
import { rankSubstitutes, swapExercise } from '../engine/substitute';
import { prescribe } from '../engine/progression';
import { assessFatigue } from '../engine/fatigue';
import { resolveEquipment } from '../engine/planner';
import { workoutPRs, type PR } from '../engine/stats';
import { muscleSets, workingDone } from '../engine/rules';
import { diffDays, addDays } from '../engine/dates';
import { JOINTS, MUSCLES, type Effort, type Joint, type Workout, type WorkoutExercise } from '../engine/types';
import { Icon, Sheet, fmtLoad, fmtTime, kg, plural } from './primitives';

export interface Summary {
  workout: Workout;
  prs: PR[];
  next: { name: string; text: string; up: boolean }[];
  muscles: { muscle: string; sets: number }[];
  minutes: number;
  weekDone: number;
  weekPlanned: number;
}

function lastText(history: Workout[], id: string, today: string): string | null {
  const exps = exposures(history, id);
  if (!exps.length) return null;
  const e = exps[exps.length - 1];
  const w = topWeight(e.sets);
  const reps = e.sets.map(s => s.reps).join('/');
  const ago = diffDays(today, e.date);
  return `Last: ${fmtLoad(id, w)} × ${reps}${ago > 0 ? ` · ${ago === 1 ? 'yesterday' : `${ago}d ago`}` : ''}`;
}

function Stepper({ label, value, step, min = 0, max = 999, unit, onChange, decimals = 1 }: {
  label: string; value: number; step: number; min?: number; max?: number; unit?: string; onChange: (n: number) => void; decimals?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const fmt = (n: number) => `${Math.round(n * 10 ** decimals) / 10 ** decimals}`;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="stepper">
      <span className="lab">{label}</span>
      <div className="ctl">
        <button aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(Math.round((value - step) * 100) / 100))}><Icon name="minus" size={22} /></button>
        <input
          inputMode="decimal" aria-label={label} value={text ?? fmt(value)}
          onFocus={e => { setText(fmt(value)); e.currentTarget.select(); }}
          onChange={e => setText(e.target.value.replace(/[^0-9.]/g, ''))}
          onBlur={() => { if (text !== null && text !== '' && !Number.isNaN(Number(text))) onChange(clamp(Number(text))); setText(null); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <button aria-label={`Increase ${label}`} onClick={() => onChange(clamp(Math.round((value + step) * 100) / 100))}><Icon name="plus" size={22} /></button>
      </div>
      {unit && <div className="unit">{unit}</div>}
    </div>
  );
}

export function WorkoutScreen({ onExit, onFinished }: { onExit: () => void; onFinished: (s: Summary) => void }) {
  const { state, dispatch, today } = useApp();
  const w = state.active!;
  const profile = state.profile!;
  const [openUid, setOpenUid] = useState<string | null>(() => w.exercises.find(we => !we.skipped && we.sets.some(s => !s.done))?.uid ?? null);
  const [menu, setMenu] = useState<string | null>(null);
  const [swap, setSwap] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { msg, show } = useToast();

  const resting = !!w.restEndsAt;
  const now = useNow(true, 500);
  const remaining = resting ? Math.ceil((w.restEndsAt! - now) / 1000) : 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (!resting) { buzzed.current = false; return; }
    if (remaining <= 0 && !buzzed.current) {
      buzzed.current = true;
      try { navigator.vibrate?.([180, 80, 180]); } catch { /* unsupported */ }
    }
  }, [resting, remaining]);

  const { logged, total } = useMemo(() => {
    let l = 0, t = 0;
    for (const we of w.exercises) { if (we.skipped) continue; for (const s of we.sets) if (!s.warmup) { t++; if (s.done) l++; } }
    return { logged: l, total: t };
  }, [w]);
  const allDone = total > 0 && logged === total;
  const elapsed = w.startedAt ? Math.max(0, Math.round((now - w.startedAt) / 1000)) : 0;

  const nextOpen = (afterUid: string): string | null => {
    const i = w.exercises.findIndex(x => x.uid === afterUid);
    const rest = [...w.exercises.slice(i + 1), ...w.exercises.slice(0, i)];
    return rest.find(x => !x.skipped && x.sets.some(s => !s.done && !s.warmup))?.uid ?? null;
  };

  // the card stays open after the last set so the optional effort tap is right there
  const logSet = (we: WorkoutExercise, setId: string, weight: number, reps: number) =>
    dispatch({ type: 'LOG_SET', uid: we.uid, setId, weight, reps, now: Date.now() });

  const finish = () => {
    const finishedAt = Date.now();
    const fw: Workout = { ...w, finishedAt, restEndsAt: undefined, restTotal: undefined };
    const prs = workoutPRs(fw, state.history, profile.bodyweight);
    const after = [...state.history, fw];
    const fatigue = assessFatigue(after, today, { level: profile.level, deload: state.deload, bodyweight: profile.bodyweight });
    const available = resolveEquipment(profile, state.options?.opts.equipment);
    const next = fw.exercises.filter(we => !we.skipped && workingDone(we).length).map(we => {
      const ex = EX[we.exerciseId];
      const rx = prescribe(ex, { goal: profile.goal, level: profile.level, bodyweight: profile.bodyweight, fatigue: fatigue.level, mode: 'normal', sets: we.targetSets, history: after, available });
      const was = topWeight(workingDone(we));
      let text: string, up = false;
      if (rx.action === 'advance' && rx.advanceTo) { text = `Next: ${EX[rx.advanceTo].name}`; up = true; }
      else if (rx.weight > was) { text = `${fmtLoad(ex.id, rx.weight)} next time`; up = true; }
      else if (rx.weight < was) text = `${fmtLoad(ex.id, rx.weight)} next time`;
      else text = `Same weight, aim for ${rx.targetReps[0] ?? we.repMax} reps`;
      return { name: ex.name, text, up };
    });
    const ms = muscleSets(fw, profile.level);
    const muscles = MUSCLES.filter(m => ms[m] >= 1).sort((a, b) => ms[b] - ms[a]).map(m => ({ muscle: MUSCLE_LABEL[m], sets: Math.round(ms[m] * 2) / 2 }));
    const week = state.history.filter(h => h.finishedAt && h.date >= addDays(today, -((new Date(today + 'T12:00:00').getDay() + 6) % 7)) && h.date <= today).length + 1;
    onFinished({ workout: fw, prs, next, muscles, minutes: Math.max(1, Math.round(((fw.finishedAt ?? finishedAt) - (fw.startedAt ?? finishedAt)) / 60000)), weekDone: week, weekPlanned: profile.days.length });
    dispatch({ type: 'FINISH', now: finishedAt });
  };

  const menuEx = menu ? w.exercises.find(x => x.uid === menu) : null;
  const swapEx = swap ? w.exercises.find(x => x.uid === swap) : null;

  return (
    <div className="wk">
      <header className="wk-head">
        <div className="row">
          <button className="icon-btn" onClick={onExit} aria-label="Back to today (workout is saved)"><Icon name="back" /></button>
          <div className="grow">
            <div className="t">{w.title}</div>
            <div className="m num">{fmtTime(elapsed)} · {logged}/{total} sets</div>
          </div>
          <button className="btn" style={{ minHeight: 40, padding: '0 14px' }} onClick={() => (logged === 0 || allDone ? (logged === 0 ? setConfirm(true) : finish()) : setConfirm(true))}>{logged === 0 ? 'Cancel' : 'Finish'}</button>
        </div>
        <div className="bar"><i style={{ width: `${total ? (logged / total) * 100 : 0}%` }} /></div>
      </header>

      <div className="wk-body">
        {w.notes.length > 0 && logged === 0 && <div className="notice"><Icon name="info" size={18} /><div className="small">{w.notes[0]}</div></div>}
        {w.exercises.map((we, idx) => (
          <ExerciseCard
            key={we.uid}
            we={we}
            index={idx}
            open={openUid === we.uid}
            last={lastText(state.history, we.exerciseId, today)}
            onToggle={() => setOpenUid(openUid === we.uid ? null : we.uid)}
            onMenu={() => setMenu(we.uid)}
            onSwap={() => setSwap(we.uid)}
            onLog={(setId, weight, reps) => logSet(we, setId, weight, reps)}
            onEffort={(e) => { dispatch({ type: 'SET_EFFORT', uid: we.uid, effort: e }); const n = nextOpen(we.uid); if (e && n) setOpenUid(n); }}
            onNextAfterDone={() => { const n = nextOpen(we.uid); setOpenUid(n); }}
          />
        ))}
      </div>

      {resting ? (
        <div className={`restbar ${remaining <= 0 ? 'over' : ''}`} role="timer" aria-live="off">
          <div className="row between">
            <div><div className="tiny muted">{remaining <= 0 ? 'Rest done' : 'Rest'}</div><div className="time num">{remaining <= 0 ? 'Go!' : fmtTime(remaining)}</div></div>
            <div className="row">
              <button className="btn" onClick={() => dispatch({ type: 'REPLACE_ACTIVE', workout: { ...w, restEndsAt: (w.restEndsAt ?? now) + 30000, restTotal: (w.restTotal ?? 0) + 30 } })}>+30s</button>
              <button className="btn primary" onClick={() => dispatch({ type: 'CLEAR_REST' })}>{remaining <= 0 ? 'Next set' : 'Skip'}</button>
            </div>
          </div>
          <div className="track"><i style={{ width: `${Math.max(0, Math.min(100, (1 - remaining / Math.max(1, w.restTotal ?? 1)) * 100))}%` }} /></div>
        </div>
      ) : allDone ? (
        <div className="dock"><button className="btn primary big" onClick={finish}>Finish workout</button></div>
      ) : null}

      {menuEx && (
        <Sheet title={EX[menuEx.exerciseId].name} onClose={() => setMenu(null)}>
          <div className="col" style={{ gap: 8 }}>
            <button className="btn block" onClick={() => { setSwap(menuEx.uid); setMenu(null); }}><Icon name="swap" size={18} /> Can’t / don’t want to do this</button>
            <button className="btn block" onClick={() => { dispatch({ type: 'ADD_SET', uid: menuEx.uid }); setMenu(null); }}><Icon name="plus" size={18} /> Add a set</button>
            <button className="btn block" onClick={() => { dispatch({ type: 'REMOVE_SET', uid: menuEx.uid }); setMenu(null); }}><Icon name="minus" size={18} /> Remove a set</button>
            <button className="btn block danger" onClick={() => { dispatch({ type: 'SKIP', uid: menuEx.uid, skipped: !menuEx.skipped }); setMenu(null); }}><Icon name="skip" size={18} /> {menuEx.skipped ? 'Un-skip exercise' : 'Skip exercise'}</button>
          </div>
        </Sheet>
      )}

      {swapEx && <SwapSheet we={swapEx} onClose={() => setSwap(null)} onSwapped={(name, uid) => { show(`Swapped to ${name}`); setSwap(null); setOpenUid(uid); }} />}

      {confirm && (
        <Sheet title={logged === 0 ? 'Discard this workout?' : 'Finish now?'} sub={logged === 0 ? 'Nothing has been logged yet.' : `${plural(total - logged, 'set')} not logged — they won’t count, and the missing volume is added back into the week.`} onClose={() => setConfirm(false)}>
          <div className="col" style={{ gap: 8 }}>
            {logged > 0 && <button className="btn primary big" onClick={() => { setConfirm(false); finish(); }}>Finish workout</button>}
            {logged === 0 && <button className="btn block danger" onClick={() => { dispatch({ type: 'DISCARD' }); onExit(); }}>Discard workout</button>}
            <button className="btn block" onClick={() => setConfirm(false)}>Keep going</button>
          </div>
        </Sheet>
      )}
      {msg && <div className="toast" role="status" style={{ bottom: 150 }}>{msg}</div>}
    </div>
  );
}

function ExerciseCard({ we, index, open, last, onToggle, onMenu, onSwap, onLog, onEffort, onNextAfterDone }: {
  we: WorkoutExercise; index: number; open: boolean; last: string | null;
  onToggle: () => void; onMenu: () => void; onSwap: () => void;
  onLog: (setId: string, weight: number, reps: number) => void; onEffort: (e: Effort | undefined) => void; onNextAfterDone: () => void;
}) {
  const { dispatch } = useApp();
  const ex = EX[we.exerciseId];
  const working = we.sets.filter(s => !s.warmup);
  const doneCount = working.filter(s => s.done).length;
  const complete = doneCount === working.length && working.length > 0;
  const active = we.sets.find(s => !s.done);
  const addLoad = ex.load === 'bodyweight' && ex.canAddLoad;
  const showWeight = ex.load === 'external' || addLoad;
  const step = ex.increment || 1;
  const reasonKind = we.rxAction === 'increase' || we.rxAction === 'advance' ? 'up' : we.rxAction === 'reduce' || we.rxAction === 'reset' || we.rxAction === 'deload' ? 'down' : '';

  return (
    <section className={`ex ${open ? 'ex-open' : ''} ${complete ? 'done' : ''} ${we.skipped ? 'skipped' : ''}`} data-testid={`ex-${we.exerciseId}`}>
      <div className="ex-head">
        <button className="grow" style={{ textAlign: 'left', minHeight: 44 }} onClick={onToggle} aria-expanded={open}>
          <div className="name">{index + 1}. {ex.name}{we.origExerciseId ? <span className="swapped"> ↔</span> : null}</div>
          <div className="tgt num">
            {we.skipped ? 'Skipped' : complete ? `Done · ${doneCount} sets` : `${we.targetSets} × ${we.repMin}–${we.repMax} · ~${we.rir} in reserve`}
          </div>
        </button>
        {!complete && !we.skipped && <button className="icon-btn" onClick={onSwap} aria-label={`Swap ${ex.name}`}><Icon name="swap" /></button>}
        <button className="icon-btn" onClick={onMenu} aria-label={`More options for ${ex.name}`}><Icon name="more" /></button>
      </div>

      {open && !we.skipped && (
        <>
          <div className="ex-info">
            {ex.note && <div className="small muted">{ex.note}</div>}
            <div className="last">{last ?? 'First time doing this one'}</div>
            {we.rxReason && <div className={`why-chip ${reasonKind}`}><Icon name={reasonKind === 'up' ? 'trend' : 'info'} size={16} /><span>{we.rxReason}</span></div>}
          </div>
          <div className="sets">
            {we.sets.map((s, i) => {
              const n = we.sets.slice(0, i + 1).filter(x => !x.warmup).length;
              if (s.done) {
                return (
                  <button key={s.id} className={`set done ${s.warmup ? 'warm' : ''}`} onClick={() => dispatch({ type: 'UNDO_SET', uid: we.uid, setId: s.id })} aria-label="Undo this set">
                    <span className="i">{s.warmup ? 'W' : n}</span>
                    <span className="v num">{showWeight ? `${fmtLoad(ex.id, s.weight)} × ${s.reps}` : `${s.reps} reps`}</span>
                    <span className="chk"><Icon name="check" size={20} stroke={3} /></span>
                  </button>
                );
              }
              if (active && s.id === active.id) {
                return (
                  <div key={s.id} className="active-set" data-testid="active-set">
                    <div className="row between">
                      <span className="bold">{s.warmup ? 'Warm-up set' : `Set ${n} of ${working.length}`}</span>
                      <span className="small muted num">{s.warmup ? 'easy, ~6 reps' : `target ${s.targetReps ?? we.repMin} reps`}</span>
                    </div>
                    <div className="steppers" style={showWeight ? undefined : { gridTemplateColumns: '1fr' }}>
                      {showWeight && <Stepper label={addLoad ? 'Added kg' : 'Weight'} value={s.weight} step={step} unit="kg" onChange={v => dispatch({ type: 'EDIT_SET', uid: we.uid, setId: s.id, weight: v, reps: s.reps })} />}
                      <Stepper label="Reps" value={s.reps} step={1} decimals={0} min={0} max={100} onChange={v => dispatch({ type: 'EDIT_SET', uid: we.uid, setId: s.id, weight: s.weight, reps: v })} />
                    </div>
                    <div className="row">
                      <button className="btn primary big" onClick={() => onLog(s.id, s.weight, s.reps)}>Log set</button>
                      {s.warmup && <button className="btn" style={{ minHeight: 58 }} onClick={() => dispatch({ type: 'DROP_SET', uid: we.uid, setId: s.id })}>Skip</button>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={s.id} className={`set ${s.warmup ? 'warm' : ''}`}>
                  <span className="i">{s.warmup ? 'W' : n}</span>
                  <span className="v num muted">{showWeight ? `${fmtLoad(ex.id, s.weight)} × ${s.reps}` : `${s.reps} reps`}</span>
                </div>
              );
            })}
          </div>
          {complete && (
            <div className="effort">
              <div className="q">How did that feel? <span className="tiny">(optional — it tunes your next weights)</span></div>
              <div className="chips">
                {(['easy', 'right', 'hard'] as Effort[]).map(e => (
                  <button key={e} className="chip" aria-pressed={we.effort === e} onClick={() => onEffort(we.effort === e ? undefined : e)}>{e === 'easy' ? 'Easy' : e === 'right' ? 'Just right' : 'Hard'}</button>
                ))}
              </div>
              <button className="btn ghost block" style={{ marginTop: 6 }} onClick={onNextAfterDone}>Next exercise</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SwapSheet({ we, onClose, onSwapped }: { we: WorkoutExercise; onClose: () => void; onSwapped: (name: string, uid: string) => void }) {
  const { state, dispatch, today } = useApp();
  const w = state.active!;
  const profile = state.profile!;
  const src = EX[we.exerciseId];
  const [never, setNever] = useState(false);
  const [hurts, setHurts] = useState(false);
  const opts = state.options?.opts;
  const available = useMemo(() => resolveEquipment(profile, opts?.equipment), [profile, opts?.equipment]);
  const limits = useMemo(() => {
    const s = new Set<Joint>(profile.limits);
    for (const t of state.tempLimits) if (t.until >= today) s.add(t.area);
    for (const j of opts?.limits ?? []) s.add(j);
    return [...s];
  }, [profile.limits, state.tempLimits, opts?.limits, today]);
  const subs = useMemo(() => rankSubstitutes(we.exerciseId, {
    profile, history: state.history, available, limits, inWorkout: w.exercises.map(x => x.exerciseId), today, sets: we.targetSets,
  }, 5), [we.exerciseId, profile, state.history, available, limits, w.exercises, today, we.targetSets]);

  const pick = (id: string) => {
    const nw = swapExercise(w, we.uid, id, { profile, history: state.history, available, today });
    dispatch({ type: 'REPLACE_ACTIVE', workout: nw });
    if (never) dispatch({ type: 'AVOID', id: we.origExerciseId ?? we.exerciseId });
    onSwapped(EX[id].name, we.uid);
  };

  return (
    <Sheet title={`Swap ${src.name}`} sub="Closest movement first — same muscles, same intent." onClose={onClose}>
      {subs.length === 0 && <div className="empty">No close match with your current equipment and restrictions. Try skipping this exercise.</div>}
      {subs.map((s, i) => (
        <button key={s.exercise.id} className="sw-item" onClick={() => pick(s.exercise.id)} data-testid="sub-option">
          <div className="grow">
            <div className="nm">{s.exercise.name}</div>
            <div className="small muted">{s.why}{s.exercise.note ? ` · ${s.exercise.note}` : ''}</div>
          </div>
          <div className="small muted num" style={{ textAlign: 'right' }}>
            {s.exercise.load === 'external' ? `≈ ${kg(s.weight)} kg` : 'bodyweight'}
            {i === 0 && <div className="tiny" style={{ color: 'var(--accent)' }}>best match</div>}
          </div>
        </button>
      ))}
      <div className="section-label">Why are you swapping? (optional)</div>
      <div className="chips">
        <button className="chip" aria-pressed={never} onClick={() => setNever(v => !v)}>Never suggest it again</button>
        <button className="chip warn" aria-pressed={hurts} onClick={() => setHurts(v => !v)}>It hurts</button>
      </div>
      {hurts && (
        <>
          <p className="small muted" style={{ margin: '10px 0 8px' }}>Where? We’ll avoid movements that load it for 7 days. Not medical advice — see a professional if it persists.</p>
          <div className="chips">
            {JOINTS.map(j => <button key={j} className="chip warn" aria-pressed={limits.includes(j)} onClick={() => dispatch({ type: 'ADD_LIMIT', area: j, until: addDays(today, 7) })}>{j.replace('_', ' ')}</button>)}
          </div>
        </>
      )}
      <p className="tiny muted" style={{ marginTop: 14 }}>Progress is tracked per exercise. A new exercise starts from an estimate based on your {src.name.toLowerCase()} numbers. Volume still counts toward the same muscles this week.</p>
    </Sheet>
  );
}

export function SummaryScreen({ s, onDone }: { s: Summary; onDone: () => void }) {
  const total = s.workout.exercises.reduce((n, we) => n + workingDone(we).length, 0);
  return (
    <div className="screen no-tabs col">
      <div>
        <span className="pill accent"><Icon name="check" size={14} stroke={3} /> Workout complete</span>
        <div className="page-title" style={{ marginTop: 8 }}>Nice work.</div>
        <div className="sub num">{s.workout.title} · {plural(total, 'set')} · {s.minutes} min · session {Math.min(s.weekDone, s.weekPlanned)} of {s.weekPlanned} this week</div>
      </div>
      {s.prs.length > 0 && (
        <div className="card">
          <h3>Personal bests</h3>
          {s.prs.map(p => <div className="list-row" key={p.exerciseId}><span className="status ok"><Icon name="trophy" size={16} /></span><span className="bold">{p.label}</span></div>)}
        </div>
      )}
      <div className="card">
        <h3>Next time</h3>
        {s.next.map(n => (
          <div className="list-row" key={n.name}>
            <div className="grow bold">{n.name}</div>
            <span className={`small ${n.up ? 'bold' : 'muted'}`} style={n.up ? { color: 'var(--accent)' } : undefined}>{n.up ? '↑ ' : ''}{n.text}</span>
          </div>
        ))}
        <p className="tiny muted" style={{ marginTop: 8 }}>Weights adjust automatically from how this went — you don’t have to decide.</p>
      </div>
      {s.muscles.length > 0 && (
        <div className="card">
          <h3>Muscles trained</h3>
          <div className="chips">{s.muscles.map(m => <span key={m.muscle} className="pill num">{m.muscle} · {m.sets}</span>)}</div>
        </div>
      )}
      <div className="dock"><button className="btn primary big" onClick={onDone}>Done</button></div>
    </div>
  );
}
