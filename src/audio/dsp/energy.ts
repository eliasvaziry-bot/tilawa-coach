// Frame energy + silence detection (shared by the build-time sync check, the app's VAD and tests).

/** RMS level in dBFS per frame. */
export function frameDb(x: Float32Array, sr: number, hopMs = 10, winMs = 20): Float32Array {
  const hop = Math.max(1, Math.round((sr * hopMs) / 1000));
  const win = Math.max(hop, Math.round((sr * winMs) / 1000));
  const n = Math.max(0, Math.floor((x.length - win) / hop) + 1);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < win; i++) {
      const v = x[o + i]!;
      s += v * v;
    }
    out[f] = 10 * Math.log10(s / win + 1e-12);
  }
  return out;
}

/** How loud the speaking part of a take is: the 90th percentile of 50 ms frame levels, so pauses before and after
 *  you speak do not make a loud take look quiet. */
export function speakingLevelDb(x: Float32Array, sr: number): number {
  const db = frameDb(x, sr, 25, 50);
  return db.length ? percentile(db, 90) : -120;
}

export function percentile(a: ArrayLike<number>, p: number): number {
  const s = Array.from(a).sort((x, y) => x - y);
  if (!s.length) return NaN;
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i]!;
}

export interface Silence {
  startMs: number;
  endMs: number;
}

/**
 * Silent stretches ≥ minMs. Threshold adapts to the recording: max(noise floor + floorMarginDb, loud level − rangeDb).
 * Leading/trailing silence is included; callers decide whether to ignore it.
 */
export function findSilences(db: Float32Array, hopMs = 10, minMs = 150, opts: { floorMarginDb?: number; rangeDb?: number } = {}): { silences: Silence[]; thresholdDb: number } {
  const floor = percentile(db, 5);
  const loud = percentile(db, 95);
  const thr = Math.max(floor + (opts.floorMarginDb ?? 10), loud - (opts.rangeDb ?? 38));
  const silences: Silence[] = [];
  let start = -1;
  for (let f = 0; f <= db.length; f++) {
    const quiet = f < db.length && db[f]! < thr;
    if (quiet && start < 0) start = f;
    if (!quiet && start >= 0) {
      if ((f - start) * hopMs >= minMs) silences.push({ startMs: start * hopMs, endMs: f * hopMs });
      start = -1;
    }
  }
  return { silences, thresholdDb: thr };
}
