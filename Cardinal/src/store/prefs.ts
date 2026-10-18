import { create } from 'zustand';
import { DEFAULT_PREFS, mergePrefs, type Prefs } from '../model/prefs';
import { getBackend } from './backend';

interface PrefsState {
  prefs: Prefs;
  loaded: boolean;
  load(): Promise<void>;
  set(fn: (p: Prefs) => void): void;
  reset(): void;
}

const LS_KEY = 'cardinal.prefs';
let saveTimer: number | undefined;

function persist(p: Prefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {}
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    getBackend().put('settings', 'preferences', p).catch(() => {});
  }, 400);
}

function initial(): Prefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return mergePrefs(JSON.parse(raw));
  } catch {}
  return structuredClone(DEFAULT_PREFS);
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: initial(),
  loaded: false,
  async load() {
    try {
      const saved = await getBackend().get('settings', 'preferences');
      if (saved) set({ prefs: mergePrefs(saved) });
    } catch {}
    set({ loaded: true });
  },
  set(fn) {
    const next = structuredClone(get().prefs);
    fn(next);
    set({ prefs: next });
    persist(next);
  },
  reset() {
    const next = structuredClone(DEFAULT_PREFS);
    set({ prefs: next });
    persist(next);
  },
}));
