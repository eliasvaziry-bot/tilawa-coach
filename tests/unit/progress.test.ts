import { describe, expect, it } from 'vitest';
import { applyFreeze, emptyProgress, isMastered, lessonPct, masteryPassed, retestDue, review, streakLength, weightedPct } from '../../src/srs/progress.ts';
import { remnoteText } from '../../src/content/remnote.ts';
import { arrangeHandWritten, typedCorrect } from '../../src/content/quiz.ts';
import { rng } from '../../src/content/generate.ts';

const DAY = 86400000;
describe('mastery rule (B1)', () => {
  it('needs ≥20 questions at ≥95%, all checks, and a retest ≥3 days later', () => {
    const p = { ...emptyProgress('x', 7), checksPassed: true, mastery: { correct: 19, total: 20, at: 0 }, retestPassedAt: null };
    expect(masteryPassed(p.mastery)).toBe(true);
    expect(isMastered(p)).toBe(false);
    expect(retestDue(p, 2 * DAY)).toBe(false);
    expect(retestDue(p, 3 * DAY)).toBe(true);
    expect(isMastered({ ...p, retestPassedAt: 3 * DAY })).toBe(true);
    expect(masteryPassed({ correct: 18, total: 20, at: 0 })).toBe(false);
    expect(masteryPassed({ correct: 10, total: 10, at: 0 })).toBe(false); // fewer than 20 questions
  });
  it('progress %: lesson = steps; stage/overall = mastered minutes', () => {
    expect(lessonPct({ ...emptyProgress('a', 7), stepsDone: 3 })).toBe(43);
    const prog = { a: { ...emptyProgress('a', 7), checksPassed: true, mastery: { correct: 20, total: 20, at: 0 }, retestPassedAt: 4 * DAY } };
    expect(weightedPct([{ id: 'a', minutes: 10 }, { id: 'b', minutes: 30 }], prog)).toBe(25);
  });
  it('FSRS schedules a later review after Good than after Again', () => {
    const now = new Date(2026, 10, 22);
    expect(new Date(review(null, 'good', now).due).getTime()).toBeGreaterThan(new Date(review(null, 'again', now).due).getTime());
  });
});

describe('streak with one weekly freeze', () => {
  const d = (x: string) => new Date(`${x}T12:00:00`);
  it('counts consecutive days and uses one freeze for a single gap', () => {
    const s = { days: ['2026-11-18', '2026-11-19', '2026-11-20'], freezes: [] as string[] };
    expect(streakLength(s, d('2026-11-21'))).toBe(3);
    const f = applyFreeze({ days: ['2026-11-19', '2026-11-20'], freezes: [] }, d('2026-11-22'));
    expect(f.freezes).toEqual(['2026-11-21']);
    expect(streakLength({ ...f, days: [...f.days, '2026-11-22'] }, d('2026-11-22'))).toBe(3);
    // a second gap in the same week is not frozen
    expect(applyFreeze({ days: ['2026-11-19'], freezes: ['2026-11-18'] }, d('2026-11-21')).freezes).toEqual(['2026-11-18']);
  });
});

describe('quiz runtime', () => {
  it('places the correct answer uniformly (±4%) over 4000 arrangements', () => {
    const q = { id: 'q', q: 'Which?', options: ['a', 'b', 'c', 'd'] as [string, string, string, string], answer: 2, explain: ['1xx', '2xx', '3xx', '4xx'] as [string, string, string, string], provenance: { kind: 'app' as const }, heldOut: false };
    const pos = [0, 0, 0, 0];
    for (let s = 1; s <= 4000; s++) {
      const it = arrangeHandWritten(q, rng(s));
      expect(it.options[it.answer]).toBe('c');
      expect(it.explain[it.answer]).toBe('3xx');
      pos[it.answer]!++;
    }
    for (const p of pos) expect(Math.abs(p / 4000 - 0.25)).toBeLessThan(0.04);
  });
  it('typed answers ignore harakat and spacing', () => {
    expect(typedCorrect(' بَ ', ['ب'])).toBe(true);
    expect(typedCorrect('ت', ['ب'])).toBe(false);
  });
  it('RemNote export: one card per line, no blanks, deduplicated', () => {
    const t = remnoteText([{ remnote: ['A == 1', 'B == 2'] }, { remnote: ['A == 1', 'C == 3'] }] as never);
    expect(t).toBe('A == 1\nB == 2\nC == 3');
  });
});

describe('quiz pools mix every generator', () => {
  it('a practice set draws from all of a lesson\'s generators, not just the first', async () => {
    const { readFileSync } = await import('node:fs');
    const { decodeAyah } = await import('../../src/data/quranData.ts');
    const { practiceSet } = await import('../../src/content/quiz.ts');
    const s1 = JSON.parse(readFileSync('public/data/quran/s001.json', 'utf8')) as { ayat: never[] };
    const surahs = new Map([[1, s1.ayat.map((a, i) => decodeAyah(1, i + 1, a))]]);
    const lesson = {
      id: 'test-mix',
      check: { quiz: { practice: 12, mastery: 20 } },
      questions: [],
      generators: [{ kind: 'letter-id', letters: ['ب', 'ت', 'ث'] }, { kind: 'harakah-id', surahs: [1] }],
    } as never;
    const kinds = new Set(practiceSet(lesson, surahs, 7).map((q) => q.id.split('-')[0]));
    expect(kinds.has('letter')).toBe(true);
    expect(kinds.has('har')).toBe(true);
  });
  it('the same seed gives two lessons different answer positions', async () => {
    const { readFileSync } = await import('node:fs');
    const { decodeAyah } = await import('../../src/data/quranData.ts');
    const { practiceSet } = await import('../../src/content/quiz.ts');
    const s1 = JSON.parse(readFileSync('public/data/quran/s001.json', 'utf8')) as { ayat: never[] };
    const surahs = new Map([[1, s1.ayat.map((a, i) => decodeAyah(1, i + 1, a))]]);
    const mk = (id: string) => ({ id, check: { quiz: { practice: 12, mastery: 20 } }, questions: [], generators: [{ kind: 'harakah-id', surahs: [1] }] }) as never;
    const pos = (id: string) => practiceSet(mk(id), surahs, 1).map((q) => q.answer).join('');
    expect(pos('lesson-a')).not.toBe(pos('lesson-b'));
  });
});
