// "Minshawi with children" (Quran.com chapter reciter 168): split each verse into the sheikh's CALL and the
// children's RESPONSE from the segment positions (1…N, restart at 1…N, then an "end" entry). Sanitises the known
// glitches: a first start of 0, starts 1 ms early, missing ends. Pure: used by the app and the check script.

export type QfSegment = [number, number, number?] | number[];
export interface QfTimestamp {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments: QfSegment[];
}
export interface Part {
  s: number;
  e: number;
  words: number;
  spans: [number, number][];
  /** 1-based word positions covered */
  from: number;
  to: number;
}
export interface KidsPair {
  call: Part;
  response: Part;
}
export interface KidsSplit {
  verseKey: string;
  /** usually one pair; long verses alternate in chunks: sheikh 1…k, children 1…k, sheikh k+1…n, children k+1…n */
  pairs: KidsPair[];
  /** first call / last response (whole verse) */
  call: Part;
  response: Part;
  repairs: string[];
}

const part = (g: [number, number, number][]): Part => ({ s: g[0]![1], e: g[g.length - 1]![2], words: g.length, spans: g.map((x) => [x[1], x[2]] as [number, number]), from: g[0]![0], to: g[g.length - 1]![0] });

export function splitVerse(ts: QfTimestamp): KidsSplit | null {
  const repairs: string[] = [];
  const raw = ts.segments.map((g) => [g[0]!, g[1]!, g[2]] as [number, number, number | undefined]);
  if (raw.length < 2) return null;
  // the "end" entry: the final entry with no end whose position is beyond every word position → not a word
  const tail = raw[raw.length - 1]!;
  const maxPos = Math.max(...raw.slice(0, -1).map((g) => g[0]));
  if (!Number.isFinite(tail[2]) && tail[0] > maxPos) raw.pop();
  const segs = raw as [number, number, number][];
  // glitch: missing end of a real word → next start, or the verse end
  for (let i = 0; i < segs.length; i++)
    if (!Number.isFinite(segs[i]![2]) || segs[i]![2] <= segs[i]![1]) {
      const fill = segs[i + 1]?.[1] ?? ts.timestamp_to;
      repairs.push(`missing end at position ${segs[i]![0]} → ${fill}`);
      segs[i]![2] = fill;
    }
  // glitch: a first start of 0 (or before the verse) → the verse start
  if (segs[0]![1] < ts.timestamp_from) {
    repairs.push(`first start ${segs[0]![1]} → ${ts.timestamp_from}`);
    segs[0]![1] = ts.timestamp_from;
  }
  // glitch: starts 1 ms early (overlap with the previous end) → clamp
  for (let i = 1; i < segs.length; i++)
    if (segs[i]![1] < segs[i - 1]![2]) {
      repairs.push(`start ${segs[i]![1]} < previous end ${segs[i - 1]![2]}: clamped`);
      segs[i]![1] = segs[i - 1]![2];
    }
  // parse C1 K1 C2 K2 …: a call runs until positions restart; the response repeats exactly the call's positions
  const pairs: KidsPair[] = [];
  let i = 0;
  while (i < segs.length) {
    const c0 = i;
    i++;
    while (i < segs.length && segs[i]![0] > segs[i - 1]![0]) i++;
    const call = segs.slice(c0, i);
    const resp = segs.slice(i, i + call.length);
    if (resp.length !== call.length || resp.some((g, k) => g[0] !== call[k]![0])) {
      if (!pairs.length) return null; // no clean repeat at all
      repairs.push(`unparsed tail from position ${segs[c0]![0]}`);
      break;
    }
    pairs.push({ call: part(call), response: part(resp) });
    i += resp.length;
  }
  if (!pairs.length) return null;
  return { verseKey: ts.verse_key, pairs, call: pairs[0]!.call, response: pairs[pairs.length - 1]!.response, repairs };
}

export interface SplitCheck {
  countsMatch: boolean;
  pitchHigher: boolean | null; // null = could not measure
  durationPlausible: boolean;
  pass: boolean;
}
/** Automatic verification of one call/response pair (we cannot listen): same words, children clearly higher, plausible durations. */
export function checkPair(p: KidsPair, callHz: number, respHz: number): SplitCheck {
  const countsMatch = p.call.words === p.response.words && p.call.from === p.response.from && p.call.to === p.response.to;
  const pitchHigher = callHz > 0 && respHz > 0 ? respHz >= callHz * 2 ** (3 / 12) : null;
  const ratio = (p.response.e - p.response.s) / Math.max(1, p.call.e - p.call.s);
  const durationPlausible = ratio >= 0.5 && ratio <= 2.5;
  return { countsMatch, pitchHigher, durationPlausible, pass: countsMatch && pitchHigher === true && durationPlausible };
}
/** Back-compat helper for a single-pair verse. */
export function checkSplit(sp: KidsSplit, callHz: number, respHz: number): SplitCheck {
  return checkPair(sp.pairs[0]!, callHz, respHz);
}
