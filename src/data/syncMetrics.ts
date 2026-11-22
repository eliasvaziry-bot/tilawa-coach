// How well do word timings agree with pauses measured in the audio? (M1 DoD: ~100 ms)

export interface Span {
  s: number;
  e: number;
}

export interface SyncEval {
  inner: number; // pauses strictly inside the file
  errors: number[]; // per inner pause: distance (ms) from the pause to the nearest word boundary (0 = boundary inside)
  spans: number; // inner pauses whose middle is covered by a word (that word would be lit during silence)
  leadErrMs: number; // first word starting before the leading silence ends
  fails: string[];
}

export function evaluateSync(words: Span[], pauses: Span[], durMs: number, tolMs = 100): SyncEval {
  const inner = pauses.filter((x) => x.s > 30 && x.e < durMs - 30);
  const errors: number[] = [];
  const fails: string[] = [];
  let spans = 0;
  for (const x of inner) {
    const mid = (x.s + x.e) / 2;
    const covering = words.some((w) => w.s < mid - 60 && w.e > mid + 60);
    if (covering) spans++;
    let best = Infinity;
    for (const w of words) {
      for (const b of [w.s, w.e]) {
        const d = b >= x.s && b <= x.e ? 0 : Math.min(Math.abs(b - x.s), Math.abs(b - x.e));
        if (d < best) best = d;
      }
    }
    errors.push(best);
    if (best > tolMs || covering) fails.push(`pause ${x.s}-${x.e}ms: nearest boundary ${best === Infinity ? '∞' : best}ms${covering ? ', a word spans it' : ''}`);
  }
  const lead = pauses.find((x) => x.s <= 30);
  const leadErrMs = lead && words[0] ? Math.max(0, lead.e - 100 - words[0].s) : 0;
  return { inner: inner.length, errors, spans, leadErrMs, fails };
}

export function summarise(evals: SyncEval[], tolMs = 100) {
  const all = evals.flatMap((e) => e.errors).sort((a, b) => a - b);
  const q = (p: number) => (all.length ? all[Math.min(all.length - 1, Math.floor(p * all.length))]! : 0);
  const ok = all.filter((e) => e <= tolMs).length;
  return {
    innerPauses: all.length,
    withinTolerance: ok,
    pct: all.length ? +((ok / all.length) * 100).toFixed(1) : null,
    medianErrMs: q(0.5),
    p90ErrMs: q(0.9),
    wordsSpanningAPause: evals.reduce((a, e) => a + e.spans, 0),
    leadingErrors: evals.filter((e) => e.leadErrMs > 0).length,
  };
}
