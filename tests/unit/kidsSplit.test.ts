// Runtime-only QF data is never committed: these are tiny hand-made mocks shaped like the API (B13).
import { describe, expect, it } from 'vitest';
import { checkSplit, splitVerse } from '../../src/cr/kidsSplit.ts';

describe('kids-repeat split + sanitiser', () => {
  it('splits at the position restart and drops the end marker', () => {
    const sp = splitVerse({ verse_key: '9:1', timestamp_from: 0, timestamp_to: 5475, segments: [[1, 0, 400], [2, 400, 830], [3, 830, 1600], [4, 1600, 2370], [1, 2370, 3410], [2, 3410, 3840], [3, 3840, 4520], [4, 4520, 5200], [5, 5200]] })!;
    expect(sp.call).toMatchObject({ s: 0, e: 2370, words: 4 });
    expect(sp.response).toMatchObject({ s: 2370, e: 5200, words: 4 });
    expect(sp.repairs).toEqual([]);
  });
  it('repairs a first start of 0, a start 1 ms early and a missing end', () => {
    const sp = splitVerse({ verse_key: '9:2', timestamp_from: 5475, timestamp_to: 10118, segments: [[1, 0, 6673], [2, 6672, 7734], [1, 7734, 9000], [2, 9000, Number.NaN], [3, 9893]] })!;
    expect(sp.call.s).toBe(5475);
    expect(sp.repairs.length).toBeGreaterThanOrEqual(2);
    expect(sp.call.spans[1]![0]).toBe(6673);
    expect(sp.response.e).toBe(10118);
  });
  it('parses chunked verses: sheikh 1-2, children 1-2, sheikh 3-4, children 3-4', () => {
    const sp = splitVerse({ verse_key: '9:5', timestamp_from: 0, timestamp_to: 8000, segments: [[1, 0, 900], [2, 900, 1800], [1, 1800, 2700], [2, 2700, 3600], [3, 3600, 4500], [4, 4500, 5400], [3, 5400, 6300], [4, 6300, 7200], [5, 7200]] })!;
    expect(sp.pairs).toHaveLength(2);
    expect(sp.pairs[1]!.call).toMatchObject({ from: 3, to: 4, s: 3600, e: 5400 });
    expect(sp.pairs[1]!.response).toMatchObject({ from: 3, to: 4, s: 5400, e: 7200 });
  });
  it('returns null when there is no restart (not a call/response verse)', () => {
    expect(splitVerse({ verse_key: '9:3', timestamp_from: 0, timestamp_to: 3000, segments: [[1, 0, 1000], [2, 1000, 2000], [3, 2000]] })).toBeNull();
  });
  it('automatic checks: counts, higher children pitch, plausible durations', () => {
    const sp = splitVerse({ verse_key: '9:4', timestamp_from: 0, timestamp_to: 4000, segments: [[1, 0, 900], [2, 900, 1800], [1, 1800, 2900], [2, 2900, 3900], [3, 3900]] })!;
    expect(checkSplit(sp, 150, 300).pass).toBe(true);
    expect(checkSplit(sp, 150, 160).pass).toBe(false); // children not clearly higher
    expect(checkSplit(sp, 0, 300).pitchHigher).toBeNull();
  });
});
