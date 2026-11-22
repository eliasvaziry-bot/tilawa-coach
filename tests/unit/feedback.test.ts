import { describe, expect, it } from 'vitest';
import { computeFeedback } from '../../src/cr/feedback.ts';
import { concat, noise, silence, vowel } from './signals.ts';

// A synthetic "call" (three syllables with a melody) and responses with known timing/length/melody.
const call = concat(vowel(200, 400), silence(60), vowel(240, 400), silence(60), vowel(210, 500));
const base = { noiseFloorDb: -90, latencyMs: 0 };

describe('call-and-response feedback', () => {
  it('a perfect echo 100 ms after the cue: on time, good length, close melody, high score', () => {
    const resp = concat(silence(400), call, silence(800));
    const fb = computeFeedback({ ...base, call, response: resp, responseStartMs: -300 });
    expect(fb.heard).toBe(true);
    expect(Math.abs(fb.entryMs! - 100)).toBeLessThanOrEqual(30);
    expect(fb.entry).toBe('on time');
    expect(Math.abs(fb.durRatio! - 1)).toBeLessThan(0.08);
    expect(fb.melody).toBe('close');
    expect(fb.score).toBeGreaterThanOrEqual(85);
  });
  it('late and too short', () => {
    const half = call.subarray(0, Math.round(call.length * 0.45));
    const fb = computeFeedback({ ...base, call, response: concat(silence(1300), half, silence(500)), responseStartMs: 0 });
    expect(fb.entry).toBe('late');
    expect(fb.length).toBe('too short');
  });
  it('latency compensation moves the entry', () => {
    const resp = concat(silence(500), call, silence(500));
    const a = computeFeedback({ ...base, call, response: resp, responseStartMs: 0 });
    const b = computeFeedback({ ...base, call, response: resp, responseStartMs: 0, latencyMs: 180 });
    expect(a.entryMs! - b.entryMs!).toBe(180);
  });
  it('a flat monotone answer is not "close" in melody', () => {
    const flat = vowel(200, 1420);
    const fb = computeFeedback({ ...base, call, response: concat(silence(300), flat, silence(500)), responseStartMs: -200 });
    expect(fb.melody).not.toBe('close');
  });
  it('silence is "not heard"', () => {
    const fb = computeFeedback({ ...base, call, response: noise(2000, 0.0005), responseStartMs: 0 });
    expect(fb.heard).toBe(false);
  });
});
