// YIN pitch detection (de Cheveigné & Kawahara 2002) + helpers. Pure functions: used by the pitch worklet, the
// offline analysers and the unit tests. Runs at 16 kHz to keep it cheap enough for an iPhone audio thread.

export interface PitchFrame {
  hz: number; // 0 = unvoiced / no clear pitch
  clarity: number; // 0..1 (1 - CMNDF minimum): how periodic the frame is
}

export interface YinOptions {
  minHz: number;
  maxHz: number;
  threshold: number;
}
export const DEFAULT_YIN: YinOptions = { minHz: 60, maxHz: 1100, threshold: 0.15 };

export function yin(buf: Float32Array, sr: number, opts: YinOptions = DEFAULT_YIN, scratch?: { d: Float32Array; c: Float32Array }): PitchFrame {
  const maxTau = Math.min(Math.floor(sr / opts.minHz), Math.floor(buf.length / 2) - 1);
  const minTau = Math.max(2, Math.floor(sr / opts.maxHz));
  if (maxTau <= minTau + 2) return { hz: 0, clarity: 0 };
  const W = buf.length - maxTau;
  const d = scratch && scratch.d.length > maxTau ? scratch.d : new Float32Array(maxTau + 1);
  const c = scratch && scratch.c.length > maxTau ? scratch.c : new Float32Array(maxTau + 1);
  // energy gate: silence has no pitch
  let e = 0;
  for (let i = 0; i < W; i++) e += buf[i]! * buf[i]!;
  if (e / W < 1e-7) return { hz: 0, clarity: 0 };
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i]! - buf[i + tau]!;
      s += diff * diff;
    }
    d[tau] = s;
  }
  c[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau]!;
    c[tau] = running > 0 ? (d[tau]! * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (c[t]! < opts.threshold) {
      while (t + 1 <= maxTau && c[t + 1]! < c[t]!) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (c[t]! < c[best]!) best = t;
    return { hz: 0, clarity: Math.max(0, 1 - c[best]!) };
  }
  const x0 = c[tau - 1] ?? c[tau]!;
  const x2 = tau + 1 <= maxTau ? c[tau + 1]! : c[tau]!;
  const denom = 2 * (2 * c[tau]! - x2 - x0);
  const shift = denom !== 0 ? (x2 - x0) / denom : 0;
  const t = tau + Math.max(-1, Math.min(1, shift));
  return { hz: sr / t, clarity: Math.max(0, Math.min(1, 1 - c[tau]!)) };
}

/** Pitch track over a whole signal (offline analysis). Frames every hopMs, window winMs. */
export function pitchTrack(x: Float32Array, sr: number, hopMs = 10, winMs = 50, opts: YinOptions = DEFAULT_YIN): { t: Float32Array; hz: Float32Array; clarity: Float32Array } {
  const hop = Math.max(1, Math.round((sr * hopMs) / 1000));
  const win = Math.round((sr * winMs) / 1000);
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const t = new Float32Array(n);
  const hz = new Float32Array(n);
  const clarity = new Float32Array(n);
  const scratch = { d: new Float32Array(win), c: new Float32Array(win) };
  for (let f = 0; f < n; f++) {
    const p = yin(x.subarray(f * hop, f * hop + win), sr, opts, scratch);
    t[f] = ((f * hop + win / 2) / sr) * 1000;
    hz[f] = p.hz;
    clarity[f] = p.clarity;
  }
  return { t, hz, clarity };
}

/** Integer decimation towards `target` Hz and the TRUE rate that results (14,700 Hz at 44.1 kHz, not 16,000):
 *  pitch must be computed with the true rate or it reads ~9% sharp on 44.1 kHz devices. */
export function decimation(sampleRate: number, target = 16000): { factor: number; rate: number } {
  const factor = Math.max(1, Math.round(sampleRate / target));
  return { factor, rate: sampleRate / factor };
}

export const hzToCents = (hz: number, refHz: number): number => 1200 * Math.log2(hz / refHz);
export const centsToHz = (cents: number, refHz: number): number => refHz * 2 ** (cents / 1200);
export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / 440);
const NOTE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteName(hz: number): string {
  const m = Math.round(hzToMidi(hz));
  return `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Median of voiced frames above a clarity threshold (robust "what note is this"). */
export function medianPitch(hz: ArrayLike<number>, clarity: ArrayLike<number>, minClarity = 0.8): number {
  const v: number[] = [];
  for (let i = 0; i < hz.length; i++) if (hz[i]! > 0 && clarity[i]! >= minClarity) v.push(hz[i]!);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)]!;
}
