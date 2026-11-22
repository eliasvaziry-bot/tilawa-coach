// DSP unit tests on synthetic signals with known answers (BRIEF B13): a 0.8 s sine as a madd, clicks at known
// times, a closure-then-burst, latency maths, levels, transposition, DTW.
import { describe, expect, it } from 'vitest';
import { SR, clicks, concat, noise, silence, sine, vowel } from './signals.ts';
import { DEFAULT_YIN, decimation, medianPitch, pitchTrack, yin, hzToCents, noteName } from '../../src/audio/dsp/pitch.ts';
import { activeRegions, detectOnsets, estimateLatency, judgeInput, levels, matchOffsets } from '../../src/audio/dsp/onsets.ts';
import { frameDb, findSilences } from '../../src/audio/dsp/energy.ts';
import { pitchShift, resampleTo, wsolaStretch } from '../../src/audio/dsp/stretch.ts';
import { centre, dtw } from '../../src/audio/dsp/dtw.ts';

describe('pitch (YIN)', () => {
  for (const hz of [98, 147, 220, 330, 523]) {
    it(`finds ${hz} Hz within 1%`, () => {
      const p = yin(vowel(hz, 60).subarray(0, 800), SR, DEFAULT_YIN);
      expect(Math.abs(p.hz - hz) / hz).toBeLessThan(0.01);
      expect(p.clarity).toBeGreaterThan(0.8);
    });
  }
  it('reports no pitch for silence and low clarity for noise', () => {
    expect(yin(silence(50), SR).hz).toBe(0);
    expect(yin(noise(50, 0.3), SR).clarity).toBeLessThan(0.6);
  });
  it('tracks a 0.8 s "madd" vowel: duration and median pitch', () => {
    const x = concat(silence(300), vowel(196, 800), silence(300));
    const tr = pitchTrack(x, SR, 10, 40);
    const voiced = [...tr.hz].filter((h, i) => h > 0 && tr.clarity[i]! > 0.8).length * 10;
    expect(Math.abs(voiced - 800)).toBeLessThanOrEqual(60);
    expect(Math.abs(medianPitch(tr.hz, tr.clarity) - 196)).toBeLessThan(2);
    expect(noteName(196)).toBe('G3');
    expect(Math.round(hzToCents(392, 196))).toBe(1200);
  });
});

describe('energy, VAD and silences', () => {
  it('measures the 0.8 s madd within 20 ms from the energy envelope', () => {
    const x = concat(silence(400), noise(50, 0.001), vowel(220, 800), silence(400));
    const db = frameDb(x, SR, 10, 20);
    const r = activeRegions(db, 10, -35);
    expect(r).toHaveLength(1);
    expect(Math.abs(r[0]!.e - r[0]!.s - 800)).toBeLessThanOrEqual(20);
  });
  it('finds a 300 ms pause between two words', () => {
    const x = concat(vowel(200, 500), silence(300), vowel(200, 500));
    const { silences } = findSilences(frameDb(x, SR), 10, 200, { floorMarginDb: 6, rangeDb: 45 });
    const inner = silences.filter((s) => s.startMs > 100 && s.endMs < 1200);
    expect(inner).toHaveLength(1);
    expect(Math.abs(inner[0]!.startMs - 500)).toBeLessThanOrEqual(20);
    expect(Math.abs(inner[0]!.endMs - 800)).toBeLessThanOrEqual(20);
  });
});

describe('onsets', () => {
  it('finds clicks at known times within 3 ms', () => {
    const times = [250, 750, 1250, 1750, 2250, 2750];
    const det = detectOnsets(clicks(times, 3000), SR);
    expect(det).toHaveLength(times.length);
    det.forEach((d, i) => expect(Math.abs(d - times[i]!)).toBeLessThanOrEqual(3));
  });
  it('closure-then-burst (qalqalah shape): finds the burst after the silent closure', () => {
    // vowel → 70 ms closure (silence) → 12 ms burst → short echo vowel
    const burst = noise(12, 0.6);
    const x = concat(vowel(180, 300), silence(70), burst, vowel(180, 90, SR, 0.15), silence(200));
    const det = detectOnsets(x, SR, { riseDb: 15, floorDb: -40 });
    expect(det.some((d) => Math.abs(d - 370) <= 5)).toBe(true);
  });
  it('estimates a known round-trip latency (123 ms) robustly, ignoring an outlier', () => {
    const sched = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
    const rec = clicks([...sched.map((t) => t + 123), 2200], 4500);
    const offs = matchOffsets(sched, detectOnsets(rec, SR));
    const est = estimateLatency(offs)!;
    expect(Math.abs(est.ms - 123)).toBeLessThanOrEqual(3);
    expect(est.spreadMs).toBeLessThanOrEqual(3);
  });
  it('clap-along: human jitter averages out; first two claps are settling', () => {
    const sched = Array.from({ length: 10 }, (_, i) => 400 + i * 667);
    const jitter = [300, -200, 12, -18, 25, -9, 14, -22, 8, 0];
    const rec = clicks(sched.map((t, i) => t + 180 + jitter[i]!), 7600);
    const est = estimateLatency(matchOffsets(sched, detectOnsets(rec, SR), 600), 2)!;
    expect(Math.abs(est.ms - 180)).toBeLessThanOrEqual(15);
  });
});

describe('input checks', () => {
  it('flags clipping, too quiet and noisy rooms', () => {
    const floor = levels(noise(500, 0.001)).rmsDb;
    expect(judgeInput(levels(concat(sine(200, 200, SR, 1.2))), floor).verdict).toBe('clipping');
    expect(judgeInput(levels(sine(200, 500, SR, 0.002)), floor).verdict).toBe('too-quiet');
    expect(judgeInput(levels(sine(200, 500, SR, 0.3)), levels(noise(500, 0.05)).rmsDb).verdict).toBe('noisy');
    expect(judgeInput(levels(sine(200, 500, SR, 0.3)), floor).verdict).toBe('ok');
  });
});

describe('time-stretch and transposition', () => {
  it('WSOLA slows down by 1/0.75 keeping the pitch', () => {
    const x = vowel(220, 1000);
    const y = wsolaStretch(x, 0.75, SR);
    expect(Math.abs(y.length / x.length - 1 / 0.75)).toBeLessThan(0.01);
    const tr = pitchTrack(y, SR, 10, 40);
    expect(Math.abs(medianPitch(tr.hz, tr.clarity) - 220)).toBeLessThan(3);
  });
  it('transposes +3 semitones keeping the duration', () => {
    const x = vowel(220, 1000);
    const y = pitchShift(x, 3, SR);
    expect(y.length).toBe(x.length);
    const tr = pitchTrack(y.subarray(1600, y.length - 1600), SR, 10, 40);
    const want = 220 * 2 ** (3 / 12);
    expect(Math.abs(medianPitch(tr.hz, tr.clarity, 0.7) - want) / want).toBeLessThan(0.015);
  });
  it('resamples 48 kHz → 16 kHz preserving the pitch', () => {
    const x = vowel(250, 500, 48000);
    const y = resampleTo(x, 48000, 16000);
    expect(Math.abs(y.length - 8000)).toBeLessThanOrEqual(2);
    const tr = pitchTrack(y, 16000, 10, 40);
    expect(Math.abs(medianPitch(tr.hz, tr.clarity) - 250)).toBeLessThan(3);
  });
});

describe('DTW contour comparison', () => {
  it('is 0 for the same contour and small for a time-warped copy; key offset removed by centring', () => {
    const a = Array.from({ length: 60 }, (_, i) => 200 * Math.sin(i / 8));
    const warped = Array.from({ length: 80 }, (_, i) => 200 * Math.sin((i * 60) / 80 / 8) + 300);
    expect(dtw(a, a)!.meanCents).toBe(0);
    expect(dtw(centre(a), centre(warped))!.meanCents).toBeLessThan(15);
    expect(dtw(a, a.map((x) => -x))!.meanCents).toBeGreaterThan(80);
  });
});

describe('pitch after decimation (the live pitch worklet)', () => {
  // the worklet averages blocks of `factor` samples, then runs YIN on the result
  const measure = (sr: number, hz: number, rateForYin?: number) => {
    const { factor, rate } = decimation(sr);
    const n = Math.round(sr * 0.2);
    const dec: number[] = [];
    for (let i = 0; i + factor <= n; i += factor) {
      let s = 0;
      for (let k = 0; k < factor; k++) s += Math.sin((2 * Math.PI * hz * (i + k)) / sr);
      dec.push(s / factor);
    }
    return yin(Float32Array.from(dec.slice(0, 800)), rateForYin ?? rate).hz;
  };
  it('reads 220 Hz as 220 Hz at 48 kHz and at 44.1 kHz', () => {
    expect(decimation(44100)).toEqual({ factor: 3, rate: 14700 });
    for (const sr of [48000, 44100, 96000]) expect(Math.abs(measure(sr, 220) - 220), `${sr} Hz`).toBeLessThan(3);
  });
  it('would read ~9% sharp at 44.1 kHz if YIN were told 16 kHz (the bug CI caught)', () => {
    expect(measure(44100, 220, 16000)).toBeGreaterThan(235);
  });
});
