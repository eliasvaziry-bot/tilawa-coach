// Quiz runtime (B1/B8): one question at a time, strict marking, 4 options with the correct one in a random position,
// practice sets vs held-out mastery tests (≥ 20 unseen items).
import type { Ayah } from '../data/quranData.ts';
import { normaliseArabic } from '../data/quranText.ts';
import { generate, hashStr, masteryOnly, mix, rng, shuffle, type GenQuestion } from './generate.ts';
import type { Lesson, Question } from './schema.ts';

export interface QuizItem extends GenQuestion {
  handWritten: boolean;
}

export function arrangeHandWritten(q: Question, r: () => number): QuizItem {
  const pos = Math.floor(r() * 4);
  const order = shuffle([0, 1, 2, 3].filter((i) => i !== q.answer), r);
  order.splice(pos, 0, q.answer);
  return { id: q.id, q: q.q, options: order.map((i) => q.options[i]!), explain: order.map((i) => q.explain[i]!), answer: pos, provenance: q.provenance, handWritten: true };
}

export function isSetupLesson(l: Lesson): boolean {
  return l.stage === 0 && l.drills.length > 0 && l.drills.every((d) => d.kind === 'setup');
}

export const DAY = 86400000;
/** A mastery item may come back in a later test once it has not been used for this long (B-1). */
export const REUSE_AFTER_DAYS = 14;
export interface SetOptions {
  /** drop "Listen…" items (offline, or audio failed) */
  noAudio?: boolean;
}

/** Generated items from ALL of a lesson's generators, interleaved round-robin and then shuffled (seeded), so a slice
 *  of the pool never comes from the first generator only. `keep` filters ids (practice vs mastery partition). */
function genPool(l: Lesson, surahs: Map<number, Ayah[]>, n: number, seed: number, keep: (id: string) => boolean, o: SetOptions = {}): QuizItem[] {
  const want = Math.ceil(n / Math.max(1, l.generators.length)) + 4;
  const per = l.generators
    .filter((g) => !(o.noAudio && g.kind === 'word-audio'))
    .map((g, i) => generate(g, surahs, want * 6, mix(seed, 100 + i)).filter((x) => keep(x.id)).slice(0, want).map((x) => ({ ...x, handWritten: false })));
  const out: QuizItem[] = [];
  for (let k = 0; per.some((p) => k < p.length); k++) for (const p of per) if (k < p.length) out.push(p[k]!);
  const r = rng(mix(seed, 7));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The same seed must not give two lessons the same answer positions: mix the lesson id into every seed. */
const lessonSeed = (l: Lesson, seed: number) => mix(seed, hashStr(l.id));

/** Practice set: hand-written (not held out) first, then generated items outside the mastery partition; shuffled. */
export function practiceSet(l: Lesson, surahs: Map<number, Ayah[]>, seed0: number, o: SetOptions = {}): QuizItem[] {
  const seed = lessonSeed(l, seed0);
  const r = rng(mix(seed, 1));
  const n = l.check.quiz.practice;
  const hw = l.questions.filter((q) => !q.heldOut).map((q) => arrangeHandWritten(q, r));
  const items = [...hw, ...genPool(l, surahs, Math.max(0, n - hw.length), mix(seed, 2), (id) => !masteryOnly(id), o)].slice(0, Math.max(n, hw.length));
  return shuffle(items, r);
}

/** Mastery test / retest: held-out hand-written items, the mastery-only generated items, then generated practice items
 *  this learner has never been shown — all unused in earlier tests (or not for REUSE_AFTER_DAYS). Never-used items come
 *  first. At least `mastery` (≥ 20) items, or fewer if the pool is short (the caller then refuses to start). */
export function masterySet(l: Lesson, surahs: Map<number, Ayah[]>, seed0: number, used: Record<string, number>, now = Date.now(), o: SetOptions = {}, seen: ReadonlySet<string> = new Set()): QuizItem[] {
  const seed = lessonSeed(l, seed0);
  const r = rng(mix(seed, 3));
  const n = Math.max(20, l.check.quiz.mastery);
  const fresh = (id: string) => used[id] === undefined || now - used[id] >= REUSE_AFTER_DAYS * DAY;
  const hw = l.questions.filter((q) => q.heldOut && fresh(q.id)).map((q) => arrangeHandWritten(q, r));
  const gen = genPool(l, surahs, n * 3, mix(seed, 4), (id) => fresh(id) && (masteryOnly(id) || !seen.has(id)), o);
  const all = [...hw, ...gen.filter((x) => masteryOnly(x.id)), ...gen.filter((x) => !masteryOnly(x.id))];
  const items = [...all.filter((x) => used[x.id] === undefined), ...all.filter((x) => used[x.id] !== undefined)].slice(0, n);
  return shuffle(items, r);
}

/** Spaced review (B1: about 7, 21 and 60 days after mastery): 10 items from the whole lesson, least recently used first. */
export function reviewSet(l: Lesson, surahs: Map<number, Ayah[]>, seed0: number, used: Record<string, number>, o: SetOptions = {}): QuizItem[] {
  const seed = lessonSeed(l, seed0);
  const r = rng(mix(seed, 5));
  const hw = l.questions.map((q) => arrangeHandWritten(q, r));
  const gen = genPool(l, surahs, 30, mix(seed, 6), () => true, o);
  const items = [...hw, ...gen].sort((a, b) => (used[a.id] ?? 0) - (used[b.id] ?? 0)).slice(0, 10);
  return shuffle(items, r);
}

/** Typed answers: tolerant of harakat, alif forms and spacing (B1). */
export function typedCorrect(given: string, accepted: string[]): boolean {
  const g = normaliseArabic(given).toLowerCase();
  return accepted.some((a) => normaliseArabic(a).toLowerCase() === g);
}
