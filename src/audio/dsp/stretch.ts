// WSOLA time-stretch, resampling and pitch shift (own implementation — no licence questions).
// Used to transpose a reference into the learner's key, and for pitch-keeping slow-down of Web Audio buffers.

/** Linear-interpolation resample by `factor` (> 1 = read faster → shorter, higher). */
export function resample(x: Float32Array, factor: number): Float32Array {
  const n = Math.max(1, Math.floor(x.length / factor));
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * factor;
    const k = Math.floor(p);
    const f = p - k;
    y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f;
  }
  return y;
}

/** Resample to a target rate with a simple anti-alias low-pass (box average) when downsampling. */
export function resampleTo(x: Float32Array, fromSr: number, toSr: number): Float32Array {
  if (fromSr === toSr) return x.slice();
  const factor = fromSr / toSr;
  if (factor > 1) {
    const k = Math.max(1, Math.round(factor));
    const lp = new Float32Array(x.length);
    let acc = 0;
    for (let i = 0; i < x.length; i++) {
      acc += x[i]!;
      if (i >= k) acc -= x[i - k]!;
      lp[i] = acc / Math.min(i + 1, k);
    }
    return resample(lp, factor);
  }
  return resample(x, factor);
}

/**
 * WSOLA: change duration by 1/rate without changing pitch. rate 0.75 → 33% longer (slower).
 * Frame 40 ms, 50% overlap, ±10 ms similarity search.
 */
export function wsolaStretch(x: Float32Array, rate: number, sr: number): Float32Array {
  if (Math.abs(rate - 1) < 1e-6) return x.slice();
  const N = Math.max(64, Math.round(sr * 0.04) & ~1);
  const hopOut = N / 2;
  const hopIn = hopOut * rate;
  const tol = Math.round(sr * 0.01);
  const outLen = Math.floor(x.length / rate);
  const y = new Float32Array(outLen + N);
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  let prevPos = 0;
  for (let k = 0; k * hopOut < outLen; k++) {
    const nominal = Math.round(k * hopIn);
    let pos = nominal;
    if (k > 0) {
      // natural continuation of the previous frame
      const nat = prevPos + hopOut;
      let best = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const p = nominal + d;
        if (p < 0 || p + hopOut >= x.length || nat + hopOut >= x.length) continue;
        let c = 0;
        for (let i = 0; i < hopOut; i += 2) c += x[p + i]! * x[nat + i]!;
        if (c > best) {
          best = c;
          pos = p;
        }
      }
    }
    pos = Math.max(0, Math.min(pos, x.length - 1));
    const o = k * hopOut;
    for (let i = 0; i < N && pos + i < x.length; i++) {
      y[o + i]! += x[pos + i]! * win[i]!;
      norm[o + i]! += win[i]!;
    }
    prevPos = pos;
  }
  for (let i = 0; i < y.length; i++) if (norm[i]! > 1e-3) y[i]! /= norm[i]!;
  return y.subarray(0, outLen);
}

/** Shift pitch by `semitones` keeping duration: stretch, then resample. */
export function pitchShift(x: Float32Array, semitones: number, sr: number): Float32Array {
  if (semitones === 0) return x.slice();
  const factor = 2 ** (semitones / 12);
  const stretched = wsolaStretch(x, 1 / factor, sr);
  const y = resample(stretched, factor);
  // trim/pad to the original length
  const out = new Float32Array(x.length);
  out.set(y.subarray(0, Math.min(y.length, x.length)));
  return out;
}

/** Semitones needed to move a reference median pitch into the learner's comfortable range (nearest octave fold). */
export function semitonesToKey(refHz: number, targetHz: number): number {
  const st = 12 * Math.log2(targetHz / refHz);
  return Math.round(st);
}
