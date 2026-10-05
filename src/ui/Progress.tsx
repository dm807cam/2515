import { useMemo, useState } from 'react';
import { useApp } from '../store/context';
import { buildDashboard } from '../engine/stats';
import { diagnose } from '../engine/insights';
import { MUSCLE_LABEL } from '../engine/exercises';
import { Icon, Sparkline, kg, fmtDay } from './primitives';

export function Progress() {
  const { state, today } = useApp();
  const profile = state.profile!;
  const d = useMemo(() => buildDashboard(profile, state.history, today), [profile, state.history, today]);
  const [why, setWhy] = useState(false);
  const insights = useMemo(() => (why ? diagnose(profile, state.history, today, state.deload) : []), [why, profile, state.history, today, state.deload]);

  if (!d.hasData) {
    return (
      <div className="screen col">
        <div className="page-title">Progress</div>
        <div className="card empty">
          <div className="em">📈</div>
          <div className="bold" style={{ color: 'var(--text)' }}>Finish your first workout</div>
          <p className="small" style={{ marginTop: 6 }}>Consistency, your 2/5/15 check and strength trends show up here — most of it becomes meaningful after 2–3 weeks.</p>
        </div>
      </div>
    );
  }

  const c = d.consistency;
  const maxPlanned = Math.max(1, ...c.weeks.map(w => w.planned));
  const rate = d.progress.filter(p => p.total > 0);
  const lastRate = rate[rate.length - 1];

  return (
    <div className="screen col">
      <div>
        <div className="page-title">Progress</div>
        <div className="sub">Am I consistent, progressing, and inside my limits?</div>
      </div>

      <div className="card">
        <h3>Consistency</h3>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="big-num num">{c.thisWeek.done}<span className="muted" style={{ fontSize: 22 }}>/{c.thisWeek.planned}</span></div>
            <div className="small muted">sessions this week</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="bold num">{c.streak} {c.streak === 1 ? 'week' : 'weeks'} in a row</div>
            <div className="small muted">{c.adherence !== null ? `${c.adherence}% of planned sessions` : 'building your baseline'}</div>
          </div>
        </div>
        <div className="weeks" style={{ marginTop: 16 }} aria-label="Sessions per week">
          {c.weeks.map((w, i) => (
            <div className="w" key={w.weekStart}>
              <div className={`b ${i === c.weeks.length - 1 ? 'cur' : ''}`}><i style={{ height: `${(Math.min(w.done, w.planned) / maxPlanned) * 100}%` }} /></div>
              <span className="tiny muted num">{w.done}/{w.planned}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>The 2 · 5 · 15 check</h3>

        <div className="bold" style={{ marginBottom: 2 }}>2 — Frequency <span className="muted small" style={{ fontWeight: 400 }}>each muscle ~2× a week</span></div>
        {d.frequency.map(f => (
          <div className="list-row" key={f.id} style={{ padding: '9px 0' }}>
            <span className={`status ${f.status}`}>{f.status === 'ok' ? <Icon name="check" size={16} stroke={3} /> : f.status === 'pending' ? <Icon name="clock" size={15} /> : <Icon name="alert" size={15} />}</span>
            <div className="grow"><span className="bold">{f.label}</span></div>
            <span className="small muted num">{f.hits}× this week{f.weeksTotal ? ` · ${f.weeksMet}/${f.weeksTotal} wks` : ''}</span>
          </div>
        ))}
        {d.frequency.some(f => f.status === 'attention') && <p className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>{d.frequency.filter(f => f.status === 'attention').map(f => f.label).join(', ')} needs attention — the next session will prioritise it.</p>}

        <div className="section-label" style={{ marginTop: 16 }}>5 — Hard sets</div>
        <div className="row">
          <span className={`status ${d.hardSets.status === 'ok' ? 'ok' : 'warn'}`}>{d.hardSets.status === 'ok' ? <Icon name="check" size={16} stroke={3} /> : <Icon name="alert" size={15} />}</span>
          <div className="small">
            {d.hardSets.status === 'ok'
              ? <>Every muscle stays within ~{d.hardSets.cap} hard sets per session{d.hardSets.peak ? <> (peak: {MUSCLE_LABEL[d.hardSets.peak.muscle].toLowerCase()} {Math.round(d.hardSets.peak.sets * 2) / 2})</> : null}.</>
              : <>{d.hardSets.over.filter(o => o.count >= 2).map(o => `${MUSCLE_LABEL[o.muscle]} (${o.count}×)`).join(', ')} went over {d.hardSets.cap} sets in a session. Past that, extra sets mostly add fatigue.</>}
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 16 }}>15 — Workout size</div>
        <div className="row">
          <span className={`status ${d.workload.status === 'ok' ? 'ok' : 'warn'}`}>{d.workload.status === 'ok' ? <Icon name="check" size={16} stroke={3} /> : <Icon name="alert" size={15} />}</span>
          <div className="small">
            Averaging <b className="num">{d.workload.avgSets}</b> working sets per session; {d.workload.within}/{d.workload.sessions} within 15
            {d.workload.overRepSets >= 3 ? `. ${d.workload.overRepSets} sets on heavy lifts went past 15 reps — the weight is probably too light.` : '.'}
            {d.effectiveShare !== null && d.effectiveShare < 100 && <span className="muted"> {d.effectiveShare}% of sets were hard enough to count.</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Strength & performance</h3>
        {d.lifts.length === 0 && <p className="small muted">Repeat an exercise twice to see its trend.</p>}
        {d.lifts.slice(0, 5).map(l => {
          const delta = l.latest - l.first;
          const pct = l.first ? (delta / l.first) * 100 : 0;
          const cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
          return (
            <div className="lift" key={l.exerciseId}>
              <div className="row between">
                <div className="bold">{l.name}</div>
                <span className={`delta num ${cls}`}>{delta >= 0 ? '+' : ''}{kg(Math.round(delta * 10) / 10)} {l.unit === 'kg' ? 'kg e1RM' : 'reps'}</span>
              </div>
              <div className="row between" style={{ marginTop: 6 }}>
                <div className="small muted num">{kg(l.first)} → {kg(l.latest)}{l.unit === 'kg' ? ' kg est. max' : ' reps'}<br />Best: {l.unit === 'kg' ? `${kg(l.bestWeight)} kg × ${l.repPR}` : `${l.repPR} reps`}</div>
                <Sparkline values={l.series.map(s => s.value)} />
              </div>
            </div>
          );
        })}
        {lastRate && (
          <>
            <div className="section-label">Repeated exercises that improved</div>
            <div className="weeks" style={{ height: 56 }}>
              {d.progress.map((p, i) => (
                <div className="w" key={p.weekStart}>
                  <div className={`b ${i === d.progress.length - 1 ? 'cur' : ''}`}><i style={{ height: `${p.total ? (p.improved / p.total) * 100 : 0}%` }} /></div>
                  <span className="tiny muted num">{p.total ? `${p.improved}/${p.total}` : '–'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!why ? (
        <button className="btn block" onClick={() => setWhy(true)}><Icon name="target" size={18} /> Why am I (not) progressing?</button>
      ) : (
        <div className="col">
          <div className="section-label" style={{ margin: '4px 0 0' }}>What the data says</div>
          {insights.length === 0 && <div className="card small muted">Log a few more sessions and patterns will show up here.</div>}
          {insights.map(i => (
            <div key={i.id} className={`notice ${i.tone === 'warn' ? 'warn' : i.tone === 'good' ? 'good' : ''}`}>
              <Icon name={i.tone === 'good' ? 'check' : i.tone === 'warn' ? 'alert' : 'info'} size={20} />
              <div><div className="bold">{i.title}</div><div className="small" style={{ marginTop: 2 }}>{i.body}</div></div>
            </div>
          ))}
          <p className="tiny muted">Based on your last few weeks. General training guidance, not medical advice. Data through {fmtDay(today, { day: 'numeric', month: 'short' })}.</p>
        </div>
      )}
    </div>
  );
}
