// Scheduling after tests and reviews (FSRS via ts-fsrs, plus the 7 / 21 / 60-day ladder). Only lessons need it, so it
// stays out of the start-up bundle (progress.ts keeps the light helpers the first screen uses).
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import { isMastered, masteryPassed, MASTERY_MIN_QUESTIONS, MASTERY_THRESHOLD, REVIEW_DAYS, retestDue, type LessonProgress } from './progress.ts';

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

