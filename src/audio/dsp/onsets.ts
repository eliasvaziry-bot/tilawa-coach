// Onsets (clicks, claps, chest-beats, word starts), levels and latency maths. Pure functions.

export interface Levels {
  rmsDb: number;
  peak: number;
  clipped: number; // samples at or above 0.99
  clippedPct: number;
}
export function levels(x: Float32Array): Levels {
  let s = 0;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]!);
    s += a * a;
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
  }
  return { rmsDb: 10 * Math.log10(s / Math.max(1, x.length) + 1e-12), peak, clipped, clippedPct: (clipped / Math.max(1, x.length)) * 100 };
}

export type InputVerdict = 'ok' | 'too-quiet' | 'clipping' | 'noisy' | 'no-signal';
/** Shown when a take is digital silence: the phone delivered no sound at all, so "come closer" would be wrong. */
export const NO_SIGNAL_MESSAGE =
  'No sound reached the app: the microphone gave silence. Close other apps that use the microphone and tap Record again. Still silent? iPhone Settings → Safari → Microphone → Allow, then reopen the app.';
/** Digital silence (or nothing recorded): a technical fault, never "too quiet". */
export const isNoSignal = (l: Levels): boolean => l.peak < 1e-4;
/** Judge an input take against the noise floor measured just before it (B4: measured before each check). */
export function judgeInput(take: Levels, noiseFloorDb: number): { verdict: InputVerdict; snrDb: number; message: string } {
  const snrDb = take.rmsDb - noiseFloorDb;
  if (isNoSignal(take)) return { verdict: 'no-signal', snrDb, message: NO_SIGNAL_MESSAGE };
  if (take.clippedPct > 0.05) return { verdict: 'clipping', snrDb, message: 'Too loud: the microphone is clipping. Move the phone a little further away.' };
  if (noiseFloorDb > -45) return { verdict: 'noisy', snrDb, message: 'The room is noisy. Results may be unreliable — find a quieter spot or use wired headphones with a mic.' };
  if (snrDb < 15 || take.rmsDb < -45) return { verdict: 'too-quiet', snrDb, message: 'Too quiet: come closer to the microphone or recite a little louder.' };
  return { verdict: 'ok', snrDb, message: 'Good level.' };
}

/**
 * Transient onsets (ms). Short-frame energy envelope; an onset is a rise of `riseDb` above the minimum of the last
 * `lookbackMs`, above `floorDb`, then refined to the first sample above 30% of the local peak.
 */
export function detectOnsets(x: Float32Array, sr: number, opts: { riseDb?: number; floorDb?: number; refractoryMs?: number; lookbackMs?: number } = {}): number[] {
  const riseDb = opts.riseDb ?? 15;
  const floorDb = opts.floorDb ?? -45;
  const refractory = opts.refractoryMs ?? 80;
  const hop = Math.max(1, Math.round(sr * 0.002)); // 2 ms
  const win = hop * 2;
  const n = Math.max(0, Math.floor((x.length - win) / hop));
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = 0; i < win; i++) s += x[f * hop + i]! ** 2;
    env[f] = 10 * Math.log10(s / win + 1e-12);
  }
  const look = Math.max(1, Math.round((opts.lookbackMs ?? 30) / 2));
  const out: number[] = [];
  let last = -Infinity;
  for (let f = look; f < n; f++) {
    let mn = Infinity;
    for (let k = f - look; k < f; k++) mn = Math.min(mn, env[k]!);
    if (env[f]! > floorDb && env[f]! - mn >= riseDb && (f * hop * 1000) / sr - last >= refractory) {
      // refine: first sample within this frame region reaching 30% of the local peak
      const a = Math.max(0, (f - 2) * hop);
      const b = Math.min(x.length, (f + 6) * hop);
      let pk = 0;
      for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(x[i]!));
      let at = f * hop;
      for (let i = a; i < b; i++)
        if (Math.abs(x[i]!) >= pk * 0.3) {
          at = i;
          break;
        }
      const ms = (at / sr) * 1000;
      out.push(ms);
      last = ms;
    }
  }
  return out;
}

/** Match each expected time to the nearest detected onset (within `maxMs`); returns per-expected offsets (ms). */
export function matchOffsets(expected: number[], detected: number[], maxMs = 400): (number | null)[] {
  return expected.map((t) => {
    let best: number | null = null;
    for (const d of detected) if (d >= t - 50 && d - t <= maxMs && (best === null || Math.abs(d - t) < Math.abs(best))) best = d - t;
    return best;
  });
}

export interface LatencyEstimate {
  ms: number; // median offset
  spreadMs: number; // median absolute deviation
  used: number;
  of: number;
}
/** Robust latency from per-click offsets: drop the first `skip` (settling), reject outliers > 3·MAD (min 25 ms). */
export function estimateLatency(offsets: (number | null)[], skip = 0): LatencyEstimate | null {
  const v = offsets.slice(skip).filter((x): x is number => x !== null);
  if (v.length < 3) return null;
  const med = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q);
    return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  };
  const m = med(v);
  const mad = med(v.map((x) => Math.abs(x - m)));
  const keep = v.filter((x) => Math.abs(x - m) <= Math.max(25, 3 * mad));
  if (keep.length < 3) return null;
  const mm = med(keep);
  return { ms: Math.round(mm), spreadMs: Math.round(med(keep.map((x) => Math.abs(x - mm)))), used: keep.length, of: offsets.length };
}

/** Voiced/active stretches from an energy envelope (VAD), merging gaps shorter than `bridgeMs`. */
export function activeRegions(db: Float32Array, hopMs: number, thresholdDb: number, minMs = 60, bridgeMs = 80): { s: number; e: number }[] {
  const out: { s: number; e: number }[] = [];
  let st = -1;
  for (let f = 0; f <= db.length; f++) {
    const on = f < db.length && db[f]! >= thresholdDb;
    if (on && st < 0) st = f;
    if (!on && st >= 0) {
      const s = st * hopMs;
      const e = f * hopMs;
      const prev = out[out.length - 1];
      if (prev && s - prev.e < bridgeMs) prev.e = e;
      else out.push({ s, e });
      st = -1;
    }
  }
  return out.filter((r) => r.e - r.s >= minMs);
}
