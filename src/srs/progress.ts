// Mastery, progress %, spaced repetition and streaks (BRIEF B1, B8). Pure functions + a small persisted store.
import { signal } from '@preact/signals';
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import { kvGet, kvSet } from '../data/db.ts';

export interface LessonProgress {
  id: string;
  stepsDone: number;
  stepsTotal: number;
  checksPassed: boolean;
  /** best mastery-test result */
  mastery: { correct: number; total: number; at: number } | null;
  /** passed automatic retest ≥ 3 days after mastery */
  retestPassedAt: number | null;
  seenQuestions: string[];
  reviewDue: number | null; // next scheduled review (ms)
  card: Card | null; // FSRS card for the lesson
  /** mastery-test and review items → when last used (ms); a test never repeats them for REUSE_AFTER_DAYS (B-1) */
  masteryUsed?: Record<string, number>;
  /** spaced reviews passed since mastery (drives the 7 / 21 / 60-day ladder) */
  reviewsDone?: number;
  /** setup lessons (Stage 0): when all their device checks and the quiz were done (M-5) */
  setupDone?: number | null;
  /** placed by the placement ladder: unlocked, not mastered (M-7) */
  placed?: boolean;
}
export interface StreakState {
  days: string[]; // YYYY-MM-DD practised
  freezes: string[]; // dates a weekly freeze was used
}

export const MASTERY_MIN_QUESTIONS = 20;
export const MASTERY_THRESHOLD = 0.95;
export const RETEST_AFTER_DAYS = 3;
export const REVIEW_DAYS = [7, 21, 60];

export function masteryPassed(m: LessonProgress['mastery']): boolean {
  return !!m && m.total >= MASTERY_MIN_QUESTIONS && m.correct / m.total >= MASTERY_THRESHOLD;
}
/** B1: mastered only when every check is passed, ≥95% on ≥20 held-out questions, and a retest 3+ days later.
 *  A setup lesson (Stage 0) is complete when its device checks and quiz are done (D-015). */
export function isMastered(p: LessonProgress | undefined): boolean {
  if (p?.setupDone) return true;
  return !!p && p.checksPassed && masteryPassed(p.mastery) && p.retestPassedAt !== null && p.mastery !== null && p.retestPassedAt - p.mastery.at >= RETEST_AFTER_DAYS * 86400000;
}
/** A spaced review is due (only for mastered, non-setup lessons). */
export function reviewDueNow(p: LessonProgress | undefined, now = Date.now()): boolean {
  return !!p && !p.setupDone && isMastered(p) && p.reviewDue !== null && p.reviewDue <= now;
}
/** What a finished mastery test or retest changes. Idempotent: a second call with the same result changes nothing,
 *  so a double tap on Finish cannot reset the clock (m-6). */
export function afterMasteryTest(cur: LessonProgress | undefined, r: { correct: number; total: number }, now: number): Partial<LessonProgress> {
  const passed = r.total >= MASTERY_MIN_QUESTIONS && r.correct / r.total >= MASTERY_THRESHOLD;
  if (isMastered(cur)) return {};
  if (retestDue(cur, now)) {
    if (!passed) return {};
    const card = review(cur!.card, 'good', new Date(now));
    return { retestPassedAt: now, checksPassed: true, card, reviewsDone: 0, reviewDue: nextReview(card, 0, now) };
  }
  if (masteryPassed(cur?.mastery ?? null)) return {}; // passed; the retest is not due yet
  const better = !cur?.mastery || passed || r.correct / r.total > cur.mastery.correct / cur.mastery.total;
  return { ...(better ? { mastery: { correct: r.correct, total: r.total, at: now } } : {}), checksPassed: !!cur?.checksPassed || passed };
}
/** What a finished spaced review changes: FSRS grade, the next date on the 7/21/60-day ladder, or tomorrow if failed. */
export function afterReview(cur: LessonProgress, r: { correct: number; total: number }, now: number): Partial<LessonProgress> {
  const passed = r.total > 0 && r.correct / r.total >= 0.9;
  const card = review(cur.card, passed ? 'good' : 'again', new Date(now));
  const reviewsDone = (cur.reviewsDone ?? 0) + (passed ? 1 : 0);
  return { card, reviewsDone, reviewDue: passed ? nextReview(card, reviewsDone, cur.retestPassedAt ?? now) : now + 86400000 };
}
export function retestDue(p: LessonProgress | undefined, now = Date.now()): boolean {
  return !!p && masteryPassed(p.mastery) && p.retestPassedAt === null && now - p.mastery!.at >= RETEST_AFTER_DAYS * 86400000;
}
export function lessonPct(p: LessonProgress | undefined): number {
  if (!p || !p.stepsTotal) return 0;
  return Math.round((Math.min(p.stepsDone, p.stepsTotal) / p.stepsTotal) * 100);
}
/** Stage/overall % = mastered lessons weighted by estimated minutes. */
export function weightedPct(lessons: { id: string; minutes: number }[], progress: Record<string, LessonProgress>): number {
  const total = lessons.reduce((a, l) => a + l.minutes, 0);
  if (!total) return 0;
  const done = lessons.filter((l) => isMastered(progress[l.id])).reduce((a, l) => a + l.minutes, 0);
  return Math.round((done / total) * 100);
}

// ---------- FSRS ----------
const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));
export function review(card: Card | null, grade: 'again' | 'hard' | 'good' | 'easy', now = new Date()): Card {
  const c = card ?? createEmptyCard(now);
  const g: Grade = grade === 'again' ? Rating.Again : grade === 'hard' ? Rating.Hard : grade === 'good' ? Rating.Good : Rating.Easy;
  return scheduler.next(c, now, g).card;
}
/** After mastery the brief asks for reviews at roughly 7, 21 and 60 days: take the later of FSRS and that ladder. */
export function nextReview(card: Card, reviewsDone: number, masteredAt: number): number {
  const ladder = masteredAt + (REVIEW_DAYS[Math.min(reviewsDone, REVIEW_DAYS.length - 1)]! * 86400000);
  return Math.max(new Date(card.due).getTime(), ladder);
}

// ---------- streak (one freeze per week) ----------
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function streakLength(s: StreakState, today = new Date()): number {
  const has = new Set([...s.days, ...s.freezes]);
  let n = 0;
  const d = new Date(today);
  if (!has.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet: count up to yesterday
  while (has.has(dayKey(d))) {
    if (s.days.includes(dayKey(d))) n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
/** Use the weekly freeze automatically for a single missed day (if none used in the last 7 days). */
export function applyFreeze(s: StreakState, today = new Date()): StreakState {
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const yk = dayKey(y);
  const before = new Date(y);
  before.setDate(before.getDate() - 1);
  if (s.days.includes(yk) || s.freezes.includes(yk) || !s.days.includes(dayKey(before))) return s;
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (s.freezes.some((f) => f >= dayKey(weekAgo))) return s;
  return { ...s, freezes: [...s.freezes, yk] };
}

// ---------- persisted store ----------
export const progress = signal<Record<string, LessonProgress>>({});
export const streak = signal<StreakState>({ days: [], freezes: [] });
let loaded = false;
export async function loadProgress(): Promise<void> {
  if (loaded) return;
  loaded = true;
  progress.value = await kvGet<Record<string, LessonProgress>>('progress', {});
  streak.value = applyFreeze(await kvGet<StreakState>('streak', { days: [], freezes: [] }));
}
export function emptyProgress(id: string, stepsTotal: number): LessonProgress {
  return { id, stepsDone: 0, stepsTotal, checksPassed: false, mastery: null, retestPassedAt: null, seenQuestions: [], reviewDue: null, card: null };
}
export async function updateProgress(id: string, patch: Partial<LessonProgress>, stepsTotal = 7): Promise<void> {
  const cur = progress.value[id] ?? emptyProgress(id, stepsTotal);
  progress.value = { ...progress.value, [id]: { ...cur, ...patch } };
  await kvSet('progress', progress.value);
}
export async function markPractisedToday(): Promise<void> {
  const k = dayKey();
  if (streak.value.days.includes(k)) return;
  streak.value = { ...streak.value, days: [...streak.value.days, k] };
  await kvSet('streak', streak.value);
}
