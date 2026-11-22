// App-wide state: route, settings (persisted to IndexedDB), online flag.
import { effect, signal } from '@preact/signals';
import { kvGet, kvSet } from '../data/db.ts';

// ---------- routing (hash based: works on GitHub Pages without rewrites) ----------
export interface Route {
  parts: string[];
  query: URLSearchParams;
}
export function parseHash(h: string): Route {
  const raw = h.replace(/^#\/?/, '');
  const [p = '', q = ''] = raw.split('?');
  const dec = (x: string) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x; // malformed escape: keep the raw text rather than crash the app
    }
  };
  let query: URLSearchParams;
  try {
    query = new URLSearchParams(q);
  } catch {
    query = new URLSearchParams();
  }
  return { parts: p.split('/').filter(Boolean).map(dec), query };
}
export const route = signal<Route>(parseHash(typeof location === 'undefined' ? '' : location.hash));
// In-app history, so Back returns to where you came from: the installed app has no browser Back button.
const navStack: string[] = typeof location === 'undefined' ? [] : [location.hash || '#/today'];
if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    route.value = parseHash(location.hash);
    const h = location.hash;
    if (navStack.length > 1 && navStack[navStack.length - 2] === h) navStack.pop();
    else navStack.push(h);
  });
/** The screen "above" a route: a lesson → Learn, a surah → the surah list, a More page → More. null on main tabs. */
export function parentOf(r: Route): string | null {
  const [top = '', sub] = r.parts;
  if (sub && (top === 'learn' || top === 'mushaf')) return top;
  if (['settings', 'credits', 'diagnostics', 'audio', 'spot-check'].includes(top)) return 'more';
  if (top === 'more') return 'today';
  return null;
}
export function goBack(): void {
  if (navStack.length > 1) history.back();
  else go(parentOf(route.value) ?? 'today');
}
export function go(path: string): void {
  location.hash = `#/${path.replace(/^\//, '')}`;
}

// ---------- settings ----------
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  quranSize: number;
  tajweed: boolean;
  colourBlind: boolean;
  translation: '' | 'en.qarai' | 'en.shakir';
  voice: 'murattal' | 'mujawwad';
  rate: number;
  fastTrack: boolean; // Persian/Urdu reader fast-track
  handsFree: boolean;
  latencyMs: Record<string, number>; // per output device label
  harakahMs: number | null; // calibrated count length
  tonicHz: number | null;
  rangeLowHz: number | null;
  rangeHighHz: number | null;
  onboarded: boolean;
  /** Stage 0 device checks that passed (when), so setup lessons can complete (M-5) */
  setupChecks: Partial<Record<SetupCheck, number>>;
  /** result of the placement ladder (M-7): the level it stopped at, 1–4 (5 = all passed) */
  placement: { level: number; at: number } | null;
}
export type SetupCheck = 'mic' | 'noise' | 'record' | 'latency' | 'range';
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  quranSize: 34,
  tajweed: true,
  colourBlind: false,
  translation: '',
  voice: 'murattal',
  rate: 1,
  fastTrack: false,
  handsFree: false,
  latencyMs: {},
  harakahMs: null,
  tonicHz: null,
  rangeLowHz: null,
  rangeHighHz: null,
  onboarded: false,
  setupChecks: {},
  placement: null,
};
export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
let loaded = false;
export async function loadSettings(): Promise<void> {
  const s = await kvGet<Partial<Settings>>('settings', {});
  loaded = true; // before the assignment, so the effect below applies the saved theme/size/colour-blind mode
  settings.value = { ...DEFAULT_SETTINGS, ...s };
}
export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}
/** Record that a Stage 0 device check passed (first time only). */
export function markSetup(k: SetupCheck): void {
  if (!settings.value.setupChecks?.[k]) updateSettings({ setupChecks: { ...settings.value.setupChecks, [k]: Date.now() } });
}
effect(() => {
  const s = settings.value;
  if (!loaded) return;
  void kvSet('settings', s);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.theme);
    root.style.setProperty('--quran-size', `${s.quranSize}px`);
    root.classList.toggle('cb', s.colourBlind);
  }
});

// ---------- connectivity ----------
export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (online.value = true));
  window.addEventListener('offline', () => (online.value = false));
}

/** Short-lived toast message. */
export const toast = signal<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function say(msg: string, ms = 3500): void {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), ms);
}
