import { STATE_VERSION, initialState, type AppState } from './state';

export const STORAGE_KEY = 'minimum-effective:v1';

export interface LoadResult { state: AppState; error?: 'corrupt' | 'newer' | 'unavailable' }

function validShape(x: unknown): x is AppState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return typeof s.v === 'number' && Array.isArray(s.history) && 'profile' in s && 'deload' in s && Array.isArray(s.tempLimits);
}

export function loadState(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): LoadResult {
  if (!storage) return { state: initialState, error: 'unavailable' };
  let raw: string | null = null;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { state: initialState, error: 'unavailable' }; }
  if (!raw) return { state: initialState };
  try {
    const parsed = JSON.parse(raw);
    if (!validShape(parsed)) throw new Error('shape');
    if (parsed.v > STATE_VERSION) return { state: initialState, error: 'newer' };
    return { state: { ...initialState, ...parsed, v: STATE_VERSION } };
  } catch {
    // keep the unreadable blob so nothing is silently destroyed
    try { storage.setItem(`${STORAGE_KEY}:corrupt`, raw); } catch { /* ignore */ }
    return { state: initialState, error: 'corrupt' };
  }
}

export function saveState(state: AppState, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch { return null; }
}
