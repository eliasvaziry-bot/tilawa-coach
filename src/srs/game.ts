// Game layer: XP, levels, a daily XP goal, combos and badges. Motivation only: it never changes the mastery rules
// (≥ 95% on ≥ 20 new questions + a retest 3+ days later), and nothing is ever taken away for a mistake.
import { signal } from '@preact/signals';
import { kvGet, kvSet } from '../data/db.ts';
import { dayKey, isMastered, masteryPassed, streakLength, type LessonProgress, type StreakState } from './progress.ts';

export interface XpState {
  total: number;
  byDay: Record<string, number>;
  /** counts of things badges need that progress does not keep (perfect practices, passed reviews) */
  events: Record<string, number>;
  /** badges already celebrated, so each one is announced once */
  seenBadges: string[];
}
const EMPTY: XpState = { total: 0, byDay: {}, events: {}, seenBadges: [] };

export const XP_FOR = { step: 5, correct: 1, perfect: 5, mastery: 20, retest: 30, review: 10, placementLevel: 5, setup: 10 } as const;
export type XpReason = keyof typeof XP_FOR;

/** Level n starts at 25·n·(n−1) XP: 0, 50, 150, 300, 500, 750 … — quick at first, then steadier. */
export function levelOf(total: number): { level: number; into: number; need: number } {
  let n = 1;
  while (25 * (n + 1) * n <= total) n++;
  const base = 25 * n * (n - 1);
  return { level: n, into: total - base, need: 25 * (n + 1) * n - base };
}

/** Daily XP goal from the minutes picked on Today. */
export function goalFor(minutes: number): number {
  return ({ 5: 10, 10: 20, 20: 40, 30: 60 } as Record<number, number>)[minutes] ?? 20;
}

export interface Badge {
  id: string;
  icon: string;
  title: string;
  how: string;
}
export const BADGES: Badge[] = [
  { id: 'first-step', icon: '👣', title: 'First step', how: 'Finish your first lesson step' },
  { id: 'mic-ready', icon: '🎙️', title: 'Microphone ready', how: 'Complete Stage 0, lesson 1' },
  { id: 'placed', icon: '🧭', title: 'Found your level', how: 'Finish the placement ladder' },
  { id: 'perfect', icon: '🎯', title: 'Perfect practice', how: 'Get every answer right in a practice quiz' },
  { id: 'streak-3', icon: '🔥', title: '3-day streak', how: 'Practise 3 days in a row' },
  { id: 'streak-7', icon: '🔥', title: 'One week', how: 'Practise 7 days in a row' },
  { id: 'first-mastery', icon: '🏅', title: 'Mastered', how: 'Master a lesson: a test, then a retest 3+ days later' },
  { id: 'reviewer', icon: '🔁', title: 'Keeps it fresh', how: 'Pass a spaced review' },
  { id: 'stage-0', icon: '✅', title: 'All set up', how: 'Complete Stage 0' },
  { id: 'xp-100', icon: '⚡', title: '100 XP', how: 'Earn 100 XP' },
  { id: 'letters', icon: '✍️', title: 'All the letters', how: 'Master Stage 1, lessons 1–17' },
  { id: 'fatiha', icon: '📖', title: 'Al-Fatiha reader', how: 'Master the Al-Fatiha reading lesson' },
  { id: 'streak-30', icon: '🌙', title: 'One month', how: 'Practise 30 days in a row' },
  { id: 'xp-1000', icon: '🏆', title: '1,000 XP', how: 'Earn 1,000 XP' },
  { id: 'stage-1', icon: '🌟', title: 'Reader', how: 'Master all of Stage 1' },
];

/** Which badges are earned now (computed from progress, so nothing can get out of step). */
export function earnedBadges(p: Record<string, LessonProgress>, streak: StreakState, xp: XpState, lessons: { id: string; stage: number; order: number }[], placementDone: boolean, today = new Date()): string[] {
  const days = streakLength(streak, today);
  const done = (pred: (l: { id: string; stage: number; order: number }) => boolean) => {
    const ls = lessons.filter(pred);
    return ls.length > 0 && ls.every((l) => isMastered(p[l.id]));
  };
  const out: string[] = [];
  const add = (id: string, ok: boolean) => ok && out.push(id);
  add('first-step', Object.values(p).some((x) => x.stepsDone > 0));
  add('mic-ready', !!p['s0-01-microphone']?.setupDone);
  add('placed', placementDone);
  add('perfect', (xp.events.perfect ?? 0) > 0);
  add('streak-3', days >= 3);
  add('streak-7', days >= 7);
  add('first-mastery', Object.values(p).some((x) => !x.setupDone && isMastered(x)));
  add('reviewer', (xp.events.review ?? 0) > 0);
  add('stage-0', done((l) => l.stage === 0));
  add('xp-100', xp.total >= 100);
  add('letters', done((l) => l.stage === 1 && l.order <= 17));
  add('fatiha', isMastered(p['s1-29-read-al-fatiha']));
  add('streak-30', days >= 30);
  add('xp-1000', xp.total >= 1000);
  add('stage-1', done((l) => l.stage === 1));
  return out;
}

// ---------- persisted store ----------
export const xpState = signal<XpState>(EMPTY);
/** the last XP gain, for the small "+n XP" flash */
export const lastGain = signal<{ amount: number; at: number } | null>(null);
/** true once the saved XP has loaded: nothing is computed or written from the empty default before that */
export const xpReady = signal(false);
let loaded: Promise<void> | null = null;
export function loadXp(): Promise<void> {
  return (loaded ??= kvGet<XpState>('xp', EMPTY).then((s) => {
    xpState.value = { ...EMPTY, ...s };
    xpReady.value = true;
  }));
}
export async function awardXp(reason: XpReason, times = 1): Promise<number> {
  await loadXp();
  const amount = XP_FOR[reason] * times;
  if (amount <= 0) return 0;
  const k = dayKey();
  const s = xpState.value;
  const events = reason === 'perfect' || reason === 'review' ? { ...s.events, [reason]: (s.events[reason] ?? 0) + 1 } : s.events;
  xpState.value = { ...s, total: s.total + amount, byDay: { ...s.byDay, [k]: (s.byDay[k] ?? 0) + amount }, events };
  lastGain.value = { amount, at: Date.now() };
  await kvSet('xp', xpState.value);
  return amount;
}
export const xpOn = (s: XpState, d = new Date()): number => s.byDay[dayKey(d)] ?? 0;
export async function markBadgesSeen(ids: string[]): Promise<void> {
  await loadXp();
  const s = xpState.value;
  const add = ids.filter((id) => !s.seenBadges.includes(id));
  if (!add.length) return;
  xpState.value = { ...s, seenBadges: [...s.seenBadges, ...add] };
  await kvSet('xp', xpState.value);
}
/** For tests and for the stage map: has any mastery test been passed in a lesson? */
export const testPassed = (p: LessonProgress | undefined): boolean => masteryPassed(p?.mastery ?? null);
