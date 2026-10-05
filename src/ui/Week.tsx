import { useMemo } from 'react';
import { useApp } from '../store/context';
import { computeWeek, TEMPLATES } from '../engine/weekly';
import { addDays } from '../engine/dates';
import { FREQ_GROUPS } from '../engine/stats';
import { muscleSets, workingSetCount } from '../engine/rules';
import { Icon, fmtDay } from './primitives';

export function Week() {
  const { state, today } = useApp();
  const profile = state.profile!;
  const week = useMemo(() => computeWeek(profile, state.history, today), [profile, state.history, today]);
  const upcoming = useMemo(() => {
    const m = new Map<string, string>();
    const pending = [...week.remaining];
    for (const d of week.days) {
      if (d.date >= today && d.scheduled && !d.workout && pending.length) m.set(d.date, TEMPLATES[pending.shift()!].name);
    }
    return m;
  }, [week, today]);

  const groups = FREQ_GROUPS.map(g => {
    const target = g.muscles.reduce((a, m) => a + week.targets[m], 0);
    let done = 0, hits = 0;
    for (const w of week.workouts) {
      const ms = muscleSets(w, profile.level);
      const s = g.muscles.reduce((a, m) => a + ms[m], 0);
      done += s;
      if (s >= g.threshold) hits++;
    }
    return { ...g, target, done, hits };
  });

  return (
    <div className="screen col">
      <div>
        <div className="page-title">This week</div>
        <div className="sub">{fmtDay(week.weekStart, { day: 'numeric', month: 'short' })} – {fmtDay(addDays(week.weekStart, 6), { day: 'numeric', month: 'short' })} · {week.workouts.length} of {week.freq} sessions</div>
      </div>

      {week.missedCount > 0 && (
        <div className="notice warn">
          <Icon name="info" size={20} />
          <div className="small">{week.missedCount === 1 ? 'A session was' : `${week.missedCount} sessions were`} missed. Nothing is pretended: the sessions that remain pick up the slack so each muscle still gets trained about twice.</div>
        </div>
      )}

      <div className="card flush">
        {week.days.map(d => {
          const label = fmtDay(d.date, { weekday: 'short', day: 'numeric' });
          const isToday = d.date === today;
          let body: JSX.Element, tag: JSX.Element | null = null;
          if (d.workout) {
            body = <><div className="bold">{d.workout.title}</div><div className="small muted num">{workingSetCount(d.workout)} sets{!d.scheduled ? ' · extra session' : ''}</div></>;
            tag = <span className="status ok"><Icon name="check" size={16} stroke={3} /></span>;
          } else if (d.status === 'missed') {
            body = <><div className="bold">Missed</div><div className="small muted">Re-planned into the rest of the week</div></>;
            tag = <span className="status warn"><Icon name="alert" size={16} /></span>;
          } else if (d.status === 'madeup') {
            body = <><div className="bold">Made up</div><div className="small muted">Covered by another day</div></>;
            tag = <span className="status ok"><Icon name="check" size={16} stroke={3} /></span>;
          } else if (d.scheduled) {
            body = <><div className="bold">{upcoming.get(d.date) ?? 'Training day'}</div><div className="small muted">{isToday ? 'Today' : 'Planned'}</div></>;
          } else body = <div className="muted">Rest</div>;
          return (
            <div key={d.date} className="list-row" style={{ padding: '12px 16px', background: isToday ? 'var(--surface2)' : undefined }}>
              <div style={{ width: 54 }} className="small muted num">{label}</div>
              <div className="grow">{body}</div>
              {tag}
            </div>
          );
        })}
      </div>

      <p className="tiny muted" style={{ margin: '-4px 4px 0' }}>Each session is built on the day, from what the week still needs — so a missed or shortened day never leaves a gap.</p>

      <div className="card">
        <h3>Weekly balance</h3>
        {groups.map(g => {
          const pct = g.target ? Math.min(100, (g.done / g.target) * 100) : 0;
          return (
            <div key={g.id} style={{ padding: '8px 0' }}>
              <div className="row between small"><span className="bold">{g.label}</span><span className="muted num">{Math.round(g.done * 10) / 10} / {Math.round(g.target * 10) / 10} sets · {g.hits}×</span></div>
              <div className="hbar" style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
        <p className="tiny muted" style={{ marginTop: 8 }}>Sets are counted per muscle, with compound lifts crediting the smaller muscles they also work (e.g. bench → triceps at half value).</p>
      </div>
    </div>
  );
}
