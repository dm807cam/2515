import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './store/context';
import { Onboarding } from './ui/Onboarding';
import { Today } from './ui/Today';
import { Week } from './ui/Week';
import { Progress } from './ui/Progress';
import { Settings } from './ui/Settings';
import { SummaryScreen, WorkoutScreen, type Summary } from './ui/Workout';
import { Icon } from './ui/primitives';

type Tab = 'today' | 'week' | 'progress';

function Shell() {
  const { state, dispatch, loadError, saveFailed } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [inWorkout, setInWorkout] = useState(() => !!state.active && !!state.active.startedAt && Date.now() - state.active.startedAt < 6 * 3600e3);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => { if (!state.active) setInWorkout(false); }, [state.active]);
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  if (!state.profile) {
    return (
      <>
        {loadError === 'corrupt' && <div className="notice warn" style={{ margin: 16 }}>Saved data couldn’t be read, so you’re starting fresh. A copy of the old data was kept on this device.</div>}
        {loadError === 'unavailable' && <div className="notice warn" style={{ margin: 16 }}>Storage is unavailable (private browsing?). Your data won’t be saved after you close the app.</div>}
        <Onboarding onDone={profile => dispatch({ type: 'ONBOARD', profile })} />
      </>
    );
  }

  if (summary) return <SummaryScreen s={summary} onDone={() => { setSummary(null); setTab('today'); }} />;

  if (inWorkout && state.active) {
    return <WorkoutScreen onExit={() => setInWorkout(false)} onFinished={s => { setSummary(s); setInWorkout(false); }} />;
  }

  return (
    <>
      {saveFailed && <div className="notice danger" role="alert" style={{ margin: '12px 16px 0' }}><Icon name="alert" size={20} /><div className="small">Couldn’t save to this device (storage full or blocked). Export a backup from Settings.</div></div>}
      {tab === 'today' && (
        <Today
          onStart={w => {
            if (!state.active && w) dispatch({ type: 'START', workout: w, now: Date.now() });
            setInWorkout(true);
          }}
          onOpenSettings={() => setSettings(true)}
        />
      )}
      {tab === 'week' && <Week />}
      {tab === 'progress' && <Progress />}
      <nav className="tabbar" aria-label="Main">
        {([['today', 'Today', 'today'], ['week', 'Week', 'week'], ['progress', 'Progress', 'chart']] as [Tab, string, string][]).map(([id, label, icon]) => (
          <button key={id} className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon name={icon} /><span>{label}</span></button>
        ))}
      </nav>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </>
  );

}

export default function App() {
  return (
    <AppProvider>
      <div className="app">
        <Shell />
      </div>
    </AppProvider>
  );
}
