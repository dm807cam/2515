import { useMemo, useState } from 'react';
import { useApp, usePlan } from '../store/context';
import { EX } from '../engine/exercises';
import { addDays, DAY_LETTERS, parseKey, weekday } from '../engine/dates';
import { PRESET_LABEL } from '../engine/planner';
import { TEMPLATES, computeWeek } from '../engine/weekly';
import { deloadUntil } from '../engine/fatigue';
import { JOINTS, type EquipmentPreset, type Joint, type PlanOptions, type Workout } from '../engine/types';
import { Icon, Sheet, fmtDay, plural } from './primitives';
import { equipmentLabel } from '../engine/substitute';
import { workingSetCount } from '../engine/rules';

export function WeekStrip() {
  const { state, today } = useApp();
  const week = useMemo(() => computeWeek(state.profile!, state.history, today), [state.profile, state.history, today]);
  return (
    <div className="strip" aria-label="This week">
      {week.days.map(d => {
        const cls = [d.status === 'done' || d.status === 'extra' ? 'done' : d.status, d.scheduled ? 'sched' : '', d.date === today ? 'today' : ''].join(' ');
        return (
          <div key={d.date} className={`day ${cls}`}>
            <span className="d">{DAY_LETTERS[d.weekday]}</span>
            <span className="dot">{d.status === 'done' || d.status === 'extra' ? <Icon name="check" size={16} stroke={3} /> : d.status === 'madeup' ? <Icon name="check" size={16} stroke={3} /> : parseKey(d.date).getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Today({ onStart, onOpenSettings }: { onStart: (w?: Workout) => void; onOpenSettings: () => void }) {
  const { state, dispatch, today } = useApp();
  const plan = usePlan()!;
  const [changing, setChanging] = useState(false);
  const profile = state.profile!;
  const curWeek = useMemo(() => computeWeek(profile, state.history, today), [profile, state.history, today]);
  const doneToday = state.history.filter(w => w.date === today && w.finishedAt).slice(-1)[0];
  const scheduledToday = curWeek.days.find(d => d.date === today)?.scheduled ?? false;
  const trainAnyway = state.options?.date === today && !!state.options.opts.trainAnyway;
  const missedPending = curWeek.missedCount > 0 && !scheduledToday;
  const activeLimits = state.tempLimits.filter(t => t.until >= today);

  const nextDay = useMemo(() => {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today, i);
      if (profile.days.includes(weekday(d))) return d;
    }
    return null;
  }, [profile.days, today]);
  const nextTemplate = nextDay && nextDay <= addDays(curWeek.weekStart, 6) && curWeek.remaining.length ? curWeek.remaining[0] : curWeek.templates[0];

  const header = (
    <div className="row between" style={{ marginBottom: 14 }}>
      <div>
        <div className="page-title">Today</div>
        <div className="sub">{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <button className="icon-btn boxed" onClick={onOpenSettings} aria-label="Settings"><Icon name="gear" /></button>
    </div>
  );

  const banners = (
    <>
      {plan.fatigue.recommendDeload && (
        <div className="notice warn" role="status">
          <Icon name="alert" size={20} />
          <div>
            <div className="bold">A lighter week could help</div>
            <div className="small">{plan.fatigue.reasons.slice(0, 2).join('. ')}. About 40% fewer sets at lighter weights usually brings performance back.</div>
            <div className="actions">
              <button className="btn primary" onClick={() => dispatch({ type: 'ACCEPT_DELOAD', until: deloadUntil(today) })}>Take a lighter week</button>
              <button className="btn" onClick={() => dispatch({ type: 'DISMISS_DELOAD', until: addDays(today, 7) })}>Not now</button>
            </div>
          </div>
        </div>
      )}
      {state.deload.until && state.deload.until >= today && (
        <div className="notice good" role="status">
          <Icon name="leaf" size={20} />
          <div className="grow"><div className="bold">Recovery week until {fmtDay(state.deload.until, { weekday: 'short', day: 'numeric' })}</div>
            <div className="small">Fewer sets, lighter weights, further from failure.</div></div>
          <button className="btn" style={{ minHeight: 40 }} onClick={() => dispatch({ type: 'END_DELOAD', today })}>End</button>
        </div>
      )}
      {activeLimits.length > 0 && (
        <div className="notice warn" role="status">
          <Icon name="info" size={20} />
          <div className="grow small">Avoiding {activeLimits.map(l => l.area.replace('_', ' ')).join(', ')} movements until {fmtDay(activeLimits[0].until, { day: 'numeric', month: 'short' })}. If it persists, see a qualified professional.</div>
          <button className="btn" style={{ minHeight: 40 }} onClick={() => activeLimits.forEach(l => dispatch({ type: 'REMOVE_LIMIT', area: l.area }))}>Clear</button>
        </div>
      )}
    </>
  );

  // ── workout in progress ──
  if (state.active) {
    const a = state.active;
    const done = a.exercises.reduce((n, we) => n + we.sets.filter(s => s.done && !s.warmup).length, 0);
    const total = a.exercises.reduce((n, we) => n + (we.skipped ? 0 : we.sets.filter(s => !s.warmup).length), 0);
    return (
      <div className="screen col">
        {header}<WeekStrip />
        <div className="card hero">
          <span className="pill accent">In progress</span>
          <div className="title" style={{ marginTop: 8 }}>{a.title}</div>
          <div className="sub num">{done} of {total} sets logged</div>
          <div className="bar" style={{ margin: '14px 0' }}><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
          <button className="btn primary big" onClick={() => onStart()}>Resume workout</button>
        </div>
      </div>
    );
  }

  // ── done today ──
  if (doneToday && !trainAnyway) {
    return (
      <div className="screen col">
        {header}<WeekStrip />
        <div className="card hero">
          <span className="pill accent"><Icon name="check" size={14} stroke={3} /> Done for today</span>
          <div className="title" style={{ marginTop: 8 }}>{doneToday.title}</div>
          <div className="sub num">{workingSetCount(doneToday)} sets{doneToday.startedAt && doneToday.finishedAt ? ` · ${Math.max(1, Math.round((doneToday.finishedAt - doneToday.startedAt) / 60000))} min` : ''}</div>
        </div>
        {banners}
        <NextUp date={nextDay} name={nextTemplate ? TEMPLATES[nextTemplate].name : ''} weekDone={curWeek.complete} />
        <button className="btn block" onClick={() => dispatch({ type: 'SET_OPTIONS', date: today, opts: { trainAnyway: true } })}>Train again anyway</button>
      </div>
    );
  }

  // ── rest day ──
  if (!scheduledToday && !trainAnyway) {
    return (
      <div className="screen col">
        {header}<WeekStrip />
        {banners}
        <div className="card hero">
          <span className="pill">Rest day</span>
          <div className="title" style={{ marginTop: 8 }}>{missedPending ? 'A session was missed' : curWeek.complete ? 'Week complete' : 'Recover'}</div>
          <p className="sub" style={{ marginTop: 4 }}>
            {missedPending
              ? 'You can make it up today — the plan re-balances so the week still covers every muscle twice. Or leave it; the next sessions adapt either way.'
              : curWeek.complete ? 'You hit every planned session this week.' : 'Rest is when the progress happens.'}
          </p>
          <div className="spacer" />
          {missedPending
            ? <button className="btn primary big" onClick={() => dispatch({ type: 'SET_OPTIONS', date: today, opts: { trainAnyway: true } })}>Make it up today</button>
            : <button className="btn block" onClick={() => dispatch({ type: 'SET_OPTIONS', date: today, opts: { trainAnyway: true } })}>Train anyway</button>}
        </div>
        <NextUp date={nextDay} name={nextTemplate ? TEMPLATES[nextTemplate].name : ''} weekDone={curWeek.complete} />
      </div>
    );
  }

  // ── training day ──
  const w = plan.workout;
  const opts = state.options?.date === today ? state.options.opts : {};
  const customised = Object.keys(opts).filter(k => k !== 'trainAnyway').length > 0;
  const empty = w.exercises.length === 0;
  const firstEver = state.history.length === 0;

  return (
    <div className="screen col">
      {header}<WeekStrip />
      {banners}
      <div className="card hero" data-testid="plan-card">
        <div className="row between">
          <div className="title">{w.title}</div>
        </div>
        <div className="meta">
          <span className="pill"><Icon name="clock" size={14} /> ~{w.plannedMinutes} min</span>
          <span className="pill num">{plural(w.plannedSets, 'set')}</span>
          {w.mode === 'deload' && <span className="pill accent">Recovery week</span>}
          {w.mode === 'trim' && <span className="pill info">Lighter</span>}
          {customised && <span className="pill info">Adjusted</span>}
        </div>
        <p className="small" style={{ marginTop: 12, color: 'var(--text)' }}>{w.explanation}</p>
        {w.notes.slice(0, 3).map((n, i) => <p key={i} className="small muted" style={{ marginTop: 6 }}>• {n}</p>)}
        <div className="xlist">
          {w.exercises.map(we => {
            const ex = EX[we.exerciseId];
            return (
              <div className="xrow" key={we.uid}>
                <span className="n">{ex.name}{ex.note ? <div className="tiny muted" style={{ fontWeight: 400 }}>{ex.note}</div> : null}</span>
                <span className="s num">{we.targetSets} × {we.repMin}–{we.repMax}</span>
              </div>
            );
          })}
        </div>
        {firstEver && !empty && <p className="tiny muted" style={{ marginTop: 10 }}>First time: weights are estimates. Adjust on your first set and the app calibrates from there.</p>}
        <div className="spacer" />
        <button className="btn primary big" disabled={empty} onClick={() => onStart(w)}>Start workout</button>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn block" onClick={() => setChanging(true)}><Icon name="repeat" size={18} /> Change workout</button>
          {customised && <button className="btn ghost" onClick={() => dispatch({ type: 'SET_OPTIONS', date: today, opts: { trainAnyway: opts.trainAnyway } })}>Reset</button>}
        </div>
      </div>
      {changing && <ChangeSheet onClose={() => setChanging(false)} />}
    </div>
  );
}

function NextUp({ date, name, weekDone }: { date: string | null; name: string; weekDone: boolean }) {
  if (!date) return null;
  return (
    <div className="card row between">
      <div><div className="small muted">{weekDone ? 'Next week starts with' : 'Next session'}</div><div className="bold">{name}</div></div>
      <span className="pill">{fmtDay(date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
    </div>
  );
}

const PRESETS: EquipmentPreset[] = ['none', 'dumbbells', 'machines', 'home', 'travel'];

export function ChangeSheet({ onClose }: { onClose: () => void }) {
  const { state, dispatch, today } = useApp();
  const plan = usePlan()!;
  const profile = state.profile!;
  const opts: PlanOptions = state.options?.date === today ? state.options.opts : {};
  const set = (patch: Partial<PlanOptions>) => dispatch({ type: 'SET_OPTIONS', date: today, opts: { ...opts, ...patch } });
  const timeChoices = [10, 15, 20, 30, 45].filter(m => m < profile.minutes).slice(-3);
  const painOn = (j: Joint) => state.tempLimits.some(t => t.area === j && t.until >= today) || (opts.limits ?? []).includes(j);
  const w = plan.workout;

  return (
    <Sheet title="Change today’s workout" sub="The week re-balances automatically — skipped sets roll into later sessions." onClose={onClose}>
      <div className="card" style={{ background: 'var(--surface2)' }} aria-live="polite" data-testid="preview">
        <div className="row between"><span className="bold">{w.title}</span><span className="small muted num">~{w.plannedMinutes} min · {plural(w.plannedSets, 'set')}</span></div>
        <div className="small muted" style={{ marginTop: 4 }}>{w.exercises.length ? w.exercises.map(we => EX[we.exerciseId].name).slice(0, 4).join(' · ') + (w.exercises.length > 4 ? ' …' : '') : 'No suitable exercises — try another option.'}</div>
        {w.exercises.length > 0 && w.exercises.slice(0, 1).map(we => <div key={we.uid} className="tiny muted" style={{ marginTop: 4 }}>{equipmentLabel(EX[we.exerciseId])}</div>)}
      </div>

      <div className="section-label">How much time?</div>
      <div className="chips">
        {timeChoices.map(m => <button key={m} className="chip" aria-pressed={opts.minutes === m} onClick={() => set({ minutes: opts.minutes === m ? undefined : m })}>{m} min</button>)}
      </div>

      <div className="section-label">What do you have?</div>
      <div className="chips">
        {PRESETS.map(p => <button key={p} className="chip" aria-pressed={opts.equipment === p} onClick={() => set({ equipment: opts.equipment === p ? undefined : p })}>{PRESET_LABEL[p]}</button>)}
      </div>

      <div className="section-label">How do you feel?</div>
      <div className="chips">
        <button className="chip" aria-pressed={!!opts.tired} onClick={() => set({ tired: !opts.tired })}>Feeling tired</button>
        <button className="chip" onClick={() => set({ exclude: [...(opts.exclude ?? []), ...w.exercises.map(we => we.exerciseId)] })}><Icon name="repeat" size={16} /> Different exercises</button>
      </div>

      <div className="section-label">Something hurts?</div>
      <div className="chips">
        {JOINTS.map(j => (
          <button key={j} className="chip warn" aria-pressed={painOn(j)} onClick={() => dispatch(painOn(j) ? { type: 'REMOVE_LIMIT', area: j } : { type: 'ADD_LIMIT', area: j, until: addDays(today, 7) })}>{j.replace('_', ' ')}</button>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>We skip movements that load that area for 7 days. This isn’t medical advice — if pain persists, see a qualified professional.</p>

      <div className="spacer" />
      <button className="btn primary big" onClick={onClose}>Done</button>
    </Sheet>
  );
}
