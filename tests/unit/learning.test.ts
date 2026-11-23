// Learning-engine fixes from the M4 review (B-1, M-1, M-2, M-4, M-5, m-6). Ayat come from the shipped data.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeAyah, type Ayah, type RawAyah } from '../../src/data/quranData.ts';
import { generate, lettersOf, masteryOnly } from '../../src/content/generate.ts';
import { DAY, masterySet, practiceSet, REUSE_AFTER_DAYS } from '../../src/content/quiz.ts';
import { Lesson } from '../../src/content/schema.ts';
import { emptyProgress, isMastered, reviewDueNow, type LessonProgress } from '../../src/srs/progress.ts';
import { afterMasteryTest, afterReview } from '../../src/srs/schedule.ts';

const index = JSON.parse(readFileSync('public/data/quran/index.json', 'utf8')) as { surahs: { file: string }[] };
const load = (list: number[]) => new Map(list.map((n) => [n, (JSON.parse(readFileSync(`public/data/quran/${index.surahs[n - 1]!.file}`, 'utf8')) as { ayat: RawAyah[] }).ayat.map((a, i) => decodeAyah(n, i + 1, a))] as [number, Ayah[]]));
const JA = [1, ...Array.from({ length: 37 }, (_, i) => 78 + i)];
const surahs = load(JA);
const NAMES: Record<string, string> = { 'َ': 'fatha', 'ُ': 'damma', 'ِ': 'kasra', 'ْ': 'sukun', 'ّ': 'shadda', 'ً': 'tanwin fath', 'ٌ': 'tanwin damm', 'ٍ': 'tanwin kasr' };

describe('generators (M-1, M-2)', () => {
  it('harakah-id: no wrong option names a mark that is also on the highlighted letter', () => {
    const items = generate({ kind: 'harakah-id', surahs: JA }, surahs, 1500, 3);
    expect(items.length).toBeGreaterThan(1000);
    for (const q of items) {
      const [a, b] = q.arabic!.highlight!;
      const marks = [...q.arabic!.text.slice(a + 1, b)];
      expect(marks.length).toBe(1);
      q.options.forEach((o, k) => {
        if (k !== q.answer) for (const m of marks) expect(o.startsWith(NAMES[m]!), `${q.id}: ${o}`).toBe(false);
      });
    }
  });
  it('contrast sets: answers are balanced and each answer is really of its class', () => {
    for (const set of ['wasl-qat', 'sun-moon', 'long-vowel', 'small-sign'] as const) {
      const items = generate({ kind: 'contrast', set, surahs: JA }, surahs, 120, 11);
      expect(items.length, set).toBeGreaterThanOrEqual(100);
      const counts = new Map<string, number>();
      for (const q of items) counts.set(q.options[q.answer]!, (counts.get(q.options[q.answer]!) ?? 0) + 1);
      expect(Math.max(...counts.values()) / items.length, set).toBeLessThan(0.65);
      if (set === 'wasl-qat')
        for (const q of items) {
          const w = q.options[q.answer]!;
          expect(/hamzat al-wasl/.test(q.q) ? w[0] === 'ٱ' : 'أإ'.includes(w[0]!), `${q.id} ${w}`).toBe(true);
        }
    }
  });
  it('shadda contrast asks about the shadda; small signs never key a small waw/ya with maddah (n-1, n-2)', () => {
    const sh = generate({ kind: 'contrast', set: 'shadda', surahs: JA }, surahs, 80, 4);
    expect(sh.filter((q) => q.options[q.answer]!.startsWith('A shadda')).length).toBeGreaterThan(10);
    for (const q of generate({ kind: 'contrast', set: 'small-sign', surahs: JA }, surahs, 200, 6)) {
      const [a, b] = q.arabic!.highlight!;
      const part = q.arabic!.text.slice(a, b);
      if (/[\u06E5\u06E6]/.test(part) && part.includes('\u0653')) throw new Error(`${q.id}: small waw/ya with maddah`);
    }
  });
  it('a test never shows the same visible question twice (n-3)', () => {
    const items = generate({ kind: 'letter-in-word', letters: ['ض', 'ص'], surahs: JA }, surahs, 150, 9);
    const vis = items.map((q) => `${q.arabic!.text}|${q.arabic!.highlight!.join(',')}`);
    expect(new Set(vis).size).toBe(vis.length);
  });
  it('letter-in-word never highlights a letter inside a ligature (m-7)', () => {
    for (const q of generate({ kind: 'letter-in-word', letters: ['ل', 'ا', 'ه'], surahs: JA }, surahs, 400, 5)) {
      const ls = lettersOf(q.arabic!.text);
      const k = ls.findIndex((l) => l.at === q.arabic!.highlight![0]);
      expect(ls[k]!.ch === 'ل' && 'اأإآٱ'.includes(ls[k + 1]?.ch ?? '')).toBe(false);
    }
  });
});

describe('mastery pool (B-1)', () => {
  const L = Lesson.parse(JSON.parse(readFileSync('src/content/lessons/s1-07-ta-za-heavy.json', 'utf8')));
  const all = load([...new Set([...JA, ...Array.from({ length: 11 }, (_, i) => 67 + i)])]);
  it('practice never shows a mastery-only item', () => {
    for (let s = 1; s < 30; s++) for (const q of practiceSet(L, all, s)) if (!q.handWritten) expect(masteryOnly(q.id)).toBe(false);
  });
  it('a learner who practised 10 times can still take a failed test, a passed test and a retest', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 10; k++) for (const q of practiceSet(L, all, 200 + k)) seen.add(q.id);
    const used: Record<string, number> = {};
    for (const [k, day] of [0, 0, 3].entries()) {
      const set = masterySet(L, all, 300 + k, used, day * DAY, {}, seen);
      expect(set.length).toBeGreaterThanOrEqual(20);
      expect(set.some((q) => used[q.id] !== undefined)).toBe(false);
      for (const q of set) used[q.id] = day * DAY;
    }
  });
  it(`items come back after ${REUSE_AFTER_DAYS} days, never before`, () => {
    const used: Record<string, number> = {};
    const first = masterySet(L, all, 1, used, 0);
    for (const q of first) used[q.id] = 0;
    expect(masterySet(L, all, 2, used, 3 * DAY).some((q) => used[q.id] !== undefined)).toBe(false);
    const late = masterySet(L, all, 2, Object.fromEntries(Object.keys(used).map((k) => [k, 0])), (REUSE_AFTER_DAYS + 1) * DAY);
    expect(late.length).toBeGreaterThanOrEqual(20);
  });
});

describe('mastery, review and setup transitions (M-4, M-5, m-6)', () => {
  const r20 = { correct: 20, total: 20 };
  const apply = (p: LessonProgress, patch: Partial<LessonProgress>) => ({ ...p, ...patch });
  it('a double Finish after a passed retest changes nothing', () => {
    let p = emptyProgress('x', 7);
    p = apply(p, afterMasteryTest(p, r20, 0));
    expect(afterMasteryTest(p, r20, 1000)).toEqual({}); // second tap on the first test
    p = apply(p, afterMasteryTest(p, r20, 4 * DAY)); // retest
    expect(isMastered(p)).toBe(true);
    expect(afterMasteryTest(p, r20, 4 * DAY + 50)).toEqual({}); // second tap on the retest
  });
  it('spaced review: due 7 days after mastery, then about 21 and 60; a failed review comes back tomorrow', () => {
    let p = emptyProgress('x', 7);
    p = apply(p, afterMasteryTest(p, r20, 0));
    p = apply(p, afterMasteryTest(p, r20, 3 * DAY));
    expect(reviewDueNow(p, 3 * DAY + 6 * DAY)).toBe(false);
    expect(reviewDueNow(p, 3 * DAY + 7 * DAY + 1)).toBe(true);
    const failed = apply(p, afterReview(p, { correct: 5, total: 10 }, 10 * DAY + 1));
    expect(failed.reviewDue).toBe(11 * DAY + 1);
    p = apply(p, afterReview(p, { correct: 10, total: 10 }, 10 * DAY + 1));
    expect(p.reviewDue!).toBeGreaterThanOrEqual(3 * DAY + 21 * DAY);
    expect(reviewDueNow(p, 12 * DAY)).toBe(false);
  });
  it('a setup lesson counts as complete once its checks are done', () => {
    expect(isMastered({ ...emptyProgress('s0', 7), setupDone: 1 })).toBe(true);
    expect(reviewDueNow({ ...emptyProgress('s0', 7), setupDone: 1, reviewDue: 0 }, 5)).toBe(false);
  });
});
