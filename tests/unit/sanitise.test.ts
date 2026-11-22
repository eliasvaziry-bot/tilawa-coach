import { describe, expect, it } from 'vitest';
import { TF, remapSegments, sanitiseSegments, snapToPauses, type WordSeg } from '../../src/data/sanitise.ts';

const lens = (n: number, v = 4) => Array.from({ length: n }, () => v);

describe('sanitiseSegments', () => {
  it('passes clean segments through untouched', () => {
    const segs: WordSeg[] = [
      [0, 1, 100, 400],
      [1, 2, 410, 800],
    ];
    const r = sanitiseSegments(segs, lens(2));
    expect(r.words).toEqual([
      { s: 100, e: 400, f: 0 },
      { s: 410, e: 800, f: 0 },
    ]);
    expect(r.repairs).toEqual([]);
  });

  it('repairs zero and negative durations', () => {
    const r = sanitiseSegments([[0, 1, 100, 100], [1, 2, 500, 450]], lens(2));
    expect(r.words[0]!.e).toBeGreaterThan(r.words[0]!.s);
    expect(r.words[1]!.e).toBeGreaterThan(r.words[1]!.s);
    expect(r.words[0]!.f & TF.DURATION_FIXED).toBeTruthy();
    expect(r.repairs.filter((x) => x.kind === 'duration')).toHaveLength(2);
  });

  it('removes overlaps so times are monotonic', () => {
    const r = sanitiseSegments([[0, 1, 0, 600], [1, 2, 500, 900]], lens(2));
    expect(r.words[0]!.e).toBeLessThanOrEqual(r.words[1]!.s);
    expect(r.repairs.some((x) => x.kind === 'overlap')).toBe(true);
  });

  it('splits a multi-word segment by letter count', () => {
    const r = sanitiseSegments([[0, 2, 0, 900]], [2, 7]);
    expect(r.words[0]).toMatchObject({ s: 0, e: 200 });
    expect(r.words[1]).toMatchObject({ s: 200, e: 900 });
    expect(r.words.every((w) => w.f & TF.SPLIT)).toBe(true);
  });

  it('interpolates a missing middle word into its gap (flagged)', () => {
    const r = sanitiseSegments([[0, 1, 0, 300], [2, 3, 800, 1100]], lens(3));
    expect(r.words[1]).toMatchObject({ s: 300, e: 800 });
    expect(r.words[1]!.f & TF.INTERPOLATED).toBeTruthy();
  });

  it('shares the previous span when trailing words are missing (absorbed)', () => {
    // like 46:14: the last segment swallowed the last words
    const r = sanitiseSegments([[0, 1, 0, 400], [1, 2, 410, 4000]], [4, 4, 4, 4]);
    expect(r.words).toHaveLength(4);
    expect(r.words[3]!.e).toBe(4000);
    expect(r.words.slice(2).every((w) => w.f & TF.INTERPOLATED)).toBe(true);
    for (let i = 1; i < 4; i++) expect(r.words[i]!.s).toBeGreaterThanOrEqual(r.words[i - 1]!.e);
  });

  it('uses the audio duration for trailing missing words when there is room', () => {
    const r = sanitiseSegments([[0, 1, 0, 400]], [4, 4], 1200);
    expect(r.words[1]).toMatchObject({ s: 400, e: 1200 });
  });

  it('re-estimates a word that starts before the previous one (non-monotonic)', () => {
    const r = sanitiseSegments([[0, 1, 0, 300], [2, 3, 900, 1200], [1, 2, 100, 250]], lens(3));
    expect(r.words[1]!.s).toBeGreaterThanOrEqual(r.words[0]!.e);
    expect(r.words[2]!.s).toBeGreaterThanOrEqual(r.words[1]!.e);
  });

  it('keeps repeats on a separate timeline', () => {
    const r = sanitiseSegments([[0, 1, 0, 300], [1, 2, 300, 600], [0, 2, 700, 1300]], lens(2));
    expect(r.repeats).toBe(true);
    expect(r.timeline.length).toBe(4);
    expect(r.words[0]).toMatchObject({ s: 0, e: 300 });
  });

  it('drops invalid index ranges', () => {
    const r = sanitiseSegments([[0, 5, 0, 300], [1, 1, 300, 400], [0, 1, 0, 300]], lens(2));
    expect(r.repairs.filter((x) => x.kind === 'dropped')).toHaveLength(2);
    expect(r.words).toHaveLength(2);
  });
});

describe('remapSegments', () => {
  it('maps through an explicit table and merges consecutive pieces of one word', () => {
    // muqatta'at expanded into letters: qa 0..2 → word 0
    const map = [[0], [0], [0], [1], [2]];
    const r = remapSegments([[0, 1, 0, 2000], [2, 3, 2010, 5000], [3, 4, 5010, 6000], [4, 5, 6010, 7000]], (q) => map[q]);
    expect(r.segs).toEqual([
      [0, 1, 0, 5000],
      [1, 2, 5010, 6000],
      [2, 3, 6010, 7000],
    ]);
  });
  it('maps one old word to two new words (بعدما → بعد ما)', () => {
    const r = remapSegments([[0, 1, 0, 400], [1, 2, 410, 900]], (q) => (q === 0 ? [0] : [1, 2]));
    expect(r.segs[1]).toEqual([1, 3, 410, 900]);
  });
});

describe('snapToPauses', () => {
  const w = (s: number, e: number) => ({ s, e, f: 0 });
  it('moves the start of a word that swallowed a pause after a pause mark', () => {
    // word 0 has a pause mark after it; the pause (5260–5620) sits inside word 1
    const out = snapToPauses([w(0, 2740), w(2750, 6240), w(6250, 7280)], [{ s: 5260, e: 5620 }], [3, 4, 5], [true, false, true]);
    expect(out.words[0]!.e).toBe(5260);
    expect(out.words[1]!.s).toBe(5620);
    expect(out.words[1]!.f & TF.SNAPPED).toBeTruthy();
  });
  it('trims a word that holds through a pause after it', () => {
    const out = snapToPauses([w(0, 500), w(510, 2000), w(2010, 2600)], [{ s: 1100, e: 1900 }], [4, 4, 4], [false, true, true]);
    expect(out.words[1]!.e).toBe(1100);
    expect(out.words[2]!.s).toBe(1900);
  });
  it('handles leading and trailing silence of the file', () => {
    const out = snapToPauses([w(0, 900), w(910, 2000)], [{ s: 0, e: 400 }, { s: 1700, e: 2050 }], [4, 4], [false, true], 2050);
    expect(out.words[0]!.s).toBe(400);
    expect(out.words[1]!.e).toBe(1700);
  });
  it('never produces words shorter than 80 ms', () => {
    const out = snapToPauses([w(0, 300), w(300, 400)], [{ s: 250, e: 390 }], [3, 3], [false, true]);
    for (const x of out.words) expect(x.e - x.s).toBeGreaterThanOrEqual(80);
  });
});
