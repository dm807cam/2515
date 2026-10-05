import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { initialState, reducer, type Action, type AppState } from './state';
import { loadState, saveState, type LoadResult } from './persist';
import { todayKey } from '../engine/dates';
import { planSession, type PlanResult } from '../engine/planner';

interface Ctx {
  state: AppState;
  dispatch: (a: Action) => void;
  today: string;
  loadError: LoadResult['error'];
  saveFailed: boolean;
}

const AppCtx = createContext<Ctx | null>(null);

/** `?date=YYYY-MM-DD` lets testers walk through a week without waiting */
function dateOverride(): string | null {
  try {
    const d = new URLSearchParams(window.location.search).get('date');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  } catch { return null; }
}

export function AppProvider({ children, preload }: { children: ReactNode; preload?: AppState }) {
  const first = useRef<LoadResult | null>(null);
  if (!first.current) first.current = preload ? { state: preload } : loadState();
  const [state, dispatch] = useReducer(reducer, first.current.state ?? initialState);
  const [saveFailed, setSaveFailed] = useState(false);
  const override = useMemo(dateOverride, []);
  const [today, setToday] = useState(override ?? todayKey());

  useEffect(() => { setSaveFailed(!saveState(state)); }, [state]);

  // roll the date over if the app stays open past midnight / returns from background
  useEffect(() => {
    if (override) return;
    const tick = () => setToday(todayKey());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [override]);

  const value = useMemo(() => ({ state, dispatch, today, loadError: first.current?.error, saveFailed }), [state, today, saveFailed]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider missing');
  return c;
}

/** today's generated workout — derived, never stored, so it can't go stale */
export function usePlan(): PlanResult | null {
  const { state, today } = useApp();
  const { profile, history, options, deload, tempLimits } = state;
  return useMemo(() => {
    if (!profile) return null;
    const opts = options && options.date === today ? options.opts : {};
    return planSession({ profile, history, today, options: opts, deload, tempLimits });
  }, [profile, history, options, deload, tempLimits, today]);
}

export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}

export function useToast(): { msg: string | null; show: (m: string) => void } {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return { msg, show };
}
