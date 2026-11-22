// Segment sanitiser for word timings (quran-align) and the runtime-only "with kids" segments.
// Every repair is logged. Nothing is silently invented: interpolated words are flagged so the UI can say
// "timing estimated" for them.

/** Timing flags (bitmask) stored per word. */
export const TF = {
  INTERPOLATED: 1, // no segment for this word: time estimated from neighbours / gap
  SPLIT: 2, // one segment covered several words: split by letter count
  CLAMPED: 4, // start/end moved to remove an overlap or keep order
  DURATION_FIXED: 8, // zero/negative duration repaired
  REMAPPED: 16, // segment index remapped through an explicit word map
  SNAPPED: 32, // boundary moved onto a pause measured in the audio
} as const;

export interface WordTime {
  s: number;
  e: number;
  f: number;
}

export interface Repair {
  word: number | null;
  kind: 'dropped' | 'duration' | 'overlap' | 'split' | 'interpolated' | 'order' | 'absorbed' | 'remapped';
  detail: string;
}

/** A segment expressed in display-word space: [firstWord, endWordExclusive, startMs, endMs]. */
export type WordSeg = [number, number, number, number];

export interface SanitiseResult {
  words: WordTime[]; // one entry per word, always filled (flags say how reliable)
  repairs: Repair[];
  repeats: boolean; // true if the reciter repeated words (a word occurs in >1 segment)
  timeline: [number, number, number][]; // [word, s, e] in time order (includes repeats)
}

const MIN_WORD_MS = 80;

function splitSpan(s: number, e: number, lens: number[]): [number, number][] {
  const total = lens.reduce((a, b) => a + Math.max(1, b), 0);
  const out: [number, number][] = [];
  let acc = s;
  for (let i = 0; i < lens.length; i++) {
    const share = ((e - s) * Math.max(1, lens[i]!)) / total;
    const next = i === lens.length - 1 ? e : Math.round(acc + share);
    out.push([Math.round(acc), next]);
    acc = next;
  }
  return out;
}

/**
 * @param segs segments already mapped to word indices
 * @param wordLens letter counts per word (used to split / interpolate proportionally)
 * @param audioMs optional duration of the ayah file (lets trailing missing words be placed)
 */
export function sanitiseSegments(segs: WordSeg[], wordLens: number[], audioMs?: number): SanitiseResult {
  const n = wordLens.length;
  const repairs: Repair[] = [];
  const list: WordSeg[] = [];

  // 1. drop invalid index ranges
  for (const sg of segs) {
    const [a, b, s, e] = sg;
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(s) && Number.isFinite(e)) || a < 0 || b > n || a >= b) {
      repairs.push({ word: null, kind: 'dropped', detail: `invalid segment ${JSON.stringify(sg)} for ${n} words` });
      continue;
    }
    list.push([a, b, s, e]);
  }

  // 2. sort by time, repair durations and overlaps
  list.sort((x, y) => x[2] - y[2] || x[0] - y[0]);
  const flagsBySeg: number[] = list.map(() => 0);
  for (let i = 0; i < list.length; i++) {
    const sg = list[i]!;
    const nextStart = i + 1 < list.length ? list[i + 1]![2] : Number.POSITIVE_INFINITY;
    if (sg[3] <= sg[2]) {
      const want = sg[2] + MIN_WORD_MS * (sg[1] - sg[0]);
      const fixed = Math.min(want, nextStart > sg[2] ? nextStart : want);
      repairs.push({ word: sg[0], kind: 'duration', detail: `segment ${sg[2]}-${sg[3]} ms → ${sg[2]}-${fixed} ms` });
      sg[3] = fixed;
      flagsBySeg[i]! |= TF.DURATION_FIXED;
    }
    if (i > 0) {
      const prev = list[i - 1]!;
      if (sg[2] < prev[3]) {
        repairs.push({ word: prev[0], kind: 'overlap', detail: `end ${prev[3]} → ${sg[2]} ms (next segment starts earlier)` });
        prev[3] = Math.max(prev[2] + 1, sg[2]);
        flagsBySeg[i - 1]! |= TF.CLAMPED;
      }
    }
  }

  // 3. timeline: split multi-word segments per word
  const timeline: [number, number, number][] = [];
  const firstSpan: (WordTime | null)[] = Array.from({ length: n }, () => null);
  const seen = new Uint8Array(n);
  let repeats = false;
  list.forEach((sg, i) => {
    const [a, b, s, e] = sg;
    const parts = b - a > 1 ? splitSpan(s, e, wordLens.slice(a, b)) : [[s, e] as [number, number]];
    if (b - a > 1) repairs.push({ word: a, kind: 'split', detail: `one segment covered words ${a}..${b - 1}: split by letter count` });
    for (let w = a; w < b; w++) {
      const [ps, pe] = parts[w - a]!;
      timeline.push([w, ps, pe]);
      if (seen[w]) {
        repeats = true;
        continue;
      }
      seen[w] = 1;
      firstSpan[w] = { s: ps, e: pe, f: flagsBySeg[i]! | (b - a > 1 ? TF.SPLIT : 0) };
    }
  });

  // 4. enforce monotonic word order: keep the longest run of words whose starts increase (LIS) and re-estimate
  //    only the outliers (one late outlier must not discard every word after it)
  {
    const idx = firstSpan.map((sp, w) => (sp ? w : -1)).filter((w) => w >= 0);
    const tails: number[] = [];
    const prev = new Map<number, number>();
    const at: number[] = [];
    for (const w of idx) {
      const s0 = firstSpan[w]!.s;
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (firstSpan[tails[mid]!]!.s <= s0) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) prev.set(w, tails[lo - 1]!);
      tails[lo] = w;
      at[lo] = w;
    }
    const keep = new Set<number>();
    let k: number | undefined = tails[tails.length - 1];
    while (k !== undefined) {
      keep.add(k);
      k = prev.get(k);
    }
    for (const w of idx)
      if (!keep.has(w)) {
        repairs.push({ word: w, kind: 'order', detail: `starts at ${firstSpan[w]!.s} ms, out of order: re-estimated` });
        firstSpan[w] = null;
      }
  }

  // 5. fill missing words
  const msPerLetter = (() => {
    const r: number[] = [];
    firstSpan.forEach((sp, w) => {
      if (sp && !(sp.f & TF.SPLIT)) r.push((sp.e - sp.s) / Math.max(1, wordLens[w]!));
    });
    r.sort((x, y) => x - y);
    return r.length ? r[Math.floor(r.length / 2)]! : 90;
  })();
  let w = 0;
  while (w < n) {
    if (firstSpan[w]) {
      w++;
      continue;
    }
    let j = w;
    while (j < n && !firstSpan[j]) j++;
    const run = wordLens.slice(w, j);
    const prevW = w - 1 >= 0 ? w - 1 : -1;
    const prev = prevW >= 0 ? firstSpan[prevW]! : null;
    const next = j < n ? firstSpan[j]! : null;
    const gapStart = prev ? prev.e : next ? Math.max(0, next.s - Math.round(msPerLetter * run.reduce((a, b) => a + b, 0))) : 0;
    const gapEnd = next ? next.s : audioMs !== undefined ? Math.max(gapStart, audioMs) : gapStart;
    const need = MIN_WORD_MS * run.length;
    if (gapEnd - gapStart >= need) {
      const parts = splitSpan(gapStart, gapEnd, run);
      for (let k = w; k < j; k++) {
        const [ps, pe] = parts[k - w]!;
        firstSpan[k] = { s: ps, e: pe, f: TF.INTERPOLATED };
        timeline.push([k, ps, pe]);
      }
      repairs.push({ word: w, kind: 'interpolated', detail: `words ${w}..${j - 1} placed in the ${gapStart}-${gapEnd} ms gap` });
    } else {
      // the neighbour probably absorbed these words: share its span by letter count
      const usePrev = prev && (!next || prev.e - prev.s >= next.e - next.s);
      if (usePrev && prev) {
        const end = Math.max(prev.e, gapEnd);
        const parts = splitSpan(prev.s, end, [wordLens[prevW]!, ...run]);
        firstSpan[prevW] = { s: parts[0]![0], e: parts[0]![1], f: prev.f | TF.CLAMPED };
        for (let k = w; k < j; k++) firstSpan[k] = { s: parts[k - w + 1]![0], e: parts[k - w + 1]![1], f: TF.INTERPOLATED };
        repairs.push({ word: w, kind: 'absorbed', detail: `words ${w}..${j - 1} shared word ${prevW}'s span ${prev.s}-${end} ms` });
      } else if (next) {
        const start = Math.min(next.s, gapStart);
        const parts = splitSpan(start, next.e, [...run, wordLens[j]!]);
        for (let k = w; k < j; k++) firstSpan[k] = { s: parts[k - w]![0], e: parts[k - w]![1], f: TF.INTERPOLATED };
        firstSpan[j] = { s: parts[run.length]![0], e: parts[run.length]![1], f: next.f | TF.CLAMPED };
        repairs.push({ word: w, kind: 'absorbed', detail: `words ${w}..${j - 1} shared word ${j}'s span ${start}-${next.e} ms` });
      } else {
        // nothing timed at all
        const parts = splitSpan(0, Math.max(audioMs ?? 0, need), run);
        for (let k = w; k < j; k++) firstSpan[k] = { s: parts[k - w]![0], e: parts[k - w]![1], f: TF.INTERPOLATED };
        repairs.push({ word: w, kind: 'interpolated', detail: `no timings in this ayah: words spread over ${audioMs ?? need} ms` });
      }
      // rebuild timeline entries for touched words
      for (let k = Math.max(0, w - 1); k <= Math.min(n - 1, j); k++) {
        const sp = firstSpan[k]!;
        const idx = timeline.findIndex((t) => t[0] === k);
        if (idx >= 0) timeline[idx] = [k, sp.s, sp.e];
        else timeline.push([k, sp.s, sp.e]);
      }
    }
    w = j;
  }

  // 6. final ordering guarantee on first spans
  const words = firstSpan as WordTime[];
  for (let k = 1; k < n; k++) {
    const a = words[k - 1]!;
    const b = words[k]!;
    if (b.s < a.s + MIN_WORD_MS) {
      // no room for word a before b starts: share the two spans by letter count
      const end = Math.max(a.e, b.e, a.s + 2 * MIN_WORD_MS);
      const [pa, pb] = splitSpan(a.s, end, [wordLens[k - 1]!, wordLens[k]!]);
      a.e = pa![1];
      b.s = pb![0];
      b.e = pb![1];
      a.f |= TF.CLAMPED;
      b.f |= TF.CLAMPED;
      repairs.push({ word: k - 1, kind: 'overlap', detail: `words ${k - 1} and ${k} started together: shared ${a.s}-${end} ms` });
    } else if (b.s < a.e) {
      a.e = b.s;
      a.f |= TF.CLAMPED;
    }
    if (b.e <= b.s) {
      b.e = b.s + 1;
      b.f |= TF.DURATION_FIXED;
    }
  }
  timeline.sort((x, y) => x[1] - y[1] || x[0] - y[0]);
  for (let k = 1; k < timeline.length; k++) {
    if (timeline[k]![1] < timeline[k - 1]![2]) timeline[k - 1]![2] = Math.max(timeline[k - 1]![1] + 1, timeline[k]![1]);
  }
  return { words, repairs, repeats, timeline };
}

export const TF_SNAPPED = TF.SNAPPED;

export interface Pause {
  s: number;
  e: number;
}

/**
 * quran-align segments tile the audio with no gaps, so a pause (waqf/breath) is absorbed into a neighbouring word
 * and that word would light up early (or stay lit through the silence). Move boundaries onto the measured pauses.
 * Which side a pause belongs to: a pause mark in the text decides first (pause after the word with the mark);
 * otherwise the option that keeps letter-rate closest to the ayah median wins.
 * @param markAfter markAfter[i] = the text has a pause mark (or the ayah ends) after word i
 */
export function snapToPauses(words: WordTime[], pauses: Pause[], wordLens: number[], markAfter: boolean[], durMs?: number): { words: WordTime[]; moved: number } {
  const out = words.map((w) => ({ ...w }));
  const n = out.length;
  if (!n) return { words: out, moved: 0 };
  let moved = 0;
  const rates = out.map((w, i) => (w.e - w.s) / Math.max(1, wordLens[i]!)).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)] ?? 100;
  const cost = (i: number, s: number, e: number) => Math.abs(Math.log(Math.max(1, (e - s) / Math.max(1, wordLens[i]!)) / median));
  const MIN = 80;
  for (const p of pauses) {
    const mid = (p.s + p.e) / 2;
    // leading silence of the file
    if (p.s <= 30 && out[0]!.s < p.e - 30 && out[0]!.e - p.e >= MIN) {
      out[0]!.s = p.e;
      out[0]!.f |= TF_SNAPPED;
      moved++;
      continue;
    }
    // trailing silence of the file
    if (durMs !== undefined && p.e >= durMs - 30) {
      const last = out[n - 1]!;
      if (last.e > p.s + 30 && p.s - last.s >= MIN) {
        last.e = p.s;
        last.f |= TF_SNAPPED;
        moved++;
      }
      continue;
    }
    const k = out.findIndex((w) => w.s < mid && w.e > mid);
    if (k < 0) continue;
    const w = out[k]!;
    // option A: pause is BEFORE word k (word k starts at p.e; word k-1 may extend to p.s)
    // option B: pause is AFTER word k (word k ends at p.s; word k+1 may start at p.e)
    const canA = w.e - p.e >= MIN;
    const canB = p.s - w.s >= MIN;
    if (!canA && !canB) continue;
    let pickA: boolean;
    const markBefore = k > 0 && markAfter[k - 1];
    const markHere = markAfter[k];
    if (canA && markBefore && !markHere) pickA = true;
    else if (canB && markHere && !markBefore) pickA = false;
    else if (canA && canB) {
      const prev = k > 0 ? out[k - 1]! : null;
      const next = k + 1 < n ? out[k + 1]! : null;
      const a = cost(k, p.e, w.e) + (prev ? cost(k - 1, prev.s, Math.max(prev.e, p.s)) : 0);
      const b = cost(k, w.s, p.s) + (next ? cost(k + 1, Math.min(next.s, p.e), next.e) : 0);
      pickA = a <= b;
    } else pickA = canA;
    if (pickA) {
      const prev = k > 0 ? out[k - 1]! : null;
      if (prev && prev.e < p.s) {
        prev.e = p.s;
        prev.f |= TF_SNAPPED;
      }
      w.s = p.e;
    } else {
      const next = k + 1 < n ? out[k + 1]! : null;
      if (next && next.s > p.e) {
        next.s = p.e;
        next.f |= TF_SNAPPED;
      }
      w.e = p.s;
    }
    w.f |= TF_SNAPPED;
    moved++;
  }
  return { words: out, moved };
}

/** Map quran-align word indices to display-word indices with an explicit table (qa index → word indices). */
export function remapSegments(
  segs: [number, number, number, number][],
  qaToWords: (qa: number) => number[] | undefined,
): { segs: WordSeg[]; repairs: Repair[] } {
  const out: WordSeg[] = [];
  const repairs: Repair[] = [];
  for (const [a, b, s, e] of segs) {
    const ws: number[] = [];
    for (let q = a; q < b; q++) {
      const m = qaToWords(q);
      if (m) ws.push(...m);
    }
    if (!ws.length) {
      repairs.push({ word: null, kind: 'dropped', detail: `segment [${a},${b}) maps to no word` });
      continue;
    }
    const lo = Math.min(...ws);
    const hi = Math.max(...ws) + 1;
    if (lo !== a || hi !== b) repairs.push({ word: lo, kind: 'remapped', detail: `qa [${a},${b}) → words [${lo},${hi})` });
    const last = out[out.length - 1];
    // Two consecutive segments that land on the same word(s) (e.g. a muqatta'at word the recogniser split
    // into letters) are one utterance: merge them instead of treating the second as a repeat.
    if (last && last[0] === lo && last[1] === hi && s >= last[2]) {
      last[3] = Math.max(last[3], e);
      repairs.push({ word: lo, kind: 'remapped', detail: `merged consecutive segments for words [${lo},${hi})` });
      continue;
    }
    out.push([lo, hi, s, e]);
  }
  return { segs: out, repairs };
}
