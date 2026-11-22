// Call-and-response planning: phrases come from the pause marks in the text (and long stretches are split at the
// longest gap in Minshawi's timing), then each mode turns phrases into steps.
import type { Ayah, WordTiming } from '../data/quranData.ts';
import { recitedWords } from '../data/quranData.ts';

export type CrMode = 'echo' | 'buildup' | 'ladder' | 'ghost';

export interface CrStep {
  ayah: Ayah;
  /** recited-word range [from, to) (basmala prefix excluded) */
  words: [number, number];
  /** playback speed of the call (pitch kept) */
  rate: number;
  label: string;
  /** "with children" track: absolute ms spans in the surah file (sheikh's call / children's response) */
  kids?: { url: string; call: [number, number][]; resp: [number, number][] };
}

const MAX_WORDS = 7;
const MAX_MS = 5500;

/** Phrases [from, to) of one ayah. */
export function phrases(a: Ayah, timings: WordTiming[]): [number, number][] {
  const words = recitedWords(a);
  const out: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) if (words[i]!.marksAfter || i === words.length - 1) {
    out.push([start, i + 1]);
    start = i + 1;
  }
  // split long phrases at the longest internal gap between words
  const split = (r: [number, number]): [number, number][] => {
    const [f, t] = r;
    const dur = (timings[t - 1]?.e ?? 0) - (timings[f]?.s ?? 0);
    if (t - f <= MAX_WORDS && dur <= MAX_MS) return [r];
    let best = f + Math.floor((t - f) / 2);
    let gap = -1;
    for (let k = f + 2; k <= t - 2; k++) {
      const g = (timings[k]?.s ?? 0) - (timings[k - 1]?.e ?? 0);
      if (g > gap) {
        gap = g;
        best = k;
      }
    }
    return [...split([f, best]), ...split([best, t])];
  };
  return out.flatMap(split);
}

export function planSteps(mode: CrMode, ayat: Ayah[], timingsOf: (a: Ayah) => WordTiming[]): CrStep[] {
  const steps: CrStep[] = [];
  for (const a of ayat) {
    const tm = timingsOf(a);
    const ph = phrases(a, tm);
    const n = recitedWords(a).length;
    const tag = `${a.surah}:${a.ayah}`;
    if (mode === 'echo') ph.forEach(([f, t], i) => steps.push({ ayah: a, words: [f, t], rate: 1, label: `${tag}${ph.length > 1 ? ` · part ${i + 1}/${ph.length}` : ''}` }));
    else if (mode === 'ladder') for (const [f, t] of ph) for (const r of [0.75, 0.85, 1]) steps.push({ ayah: a, words: [f, t], rate: r, label: `${tag} · ${r === 1 ? 'full speed' : `${Math.round(r * 100)}% speed`}` });
    else if (mode === 'ghost') steps.push({ ayah: a, words: [0, n], rate: 1, label: `${tag} · with Minshawi underneath` });
    else {
      // BUILD-UP, back-chained: last word → … → whole phrase, then the whole ayah
      for (const [f, t] of ph) {
        const len = t - f;
        const chunk = Math.max(1, Math.ceil(len / 4));
        for (let k = t - 1; k > f; k -= chunk) steps.push({ ayah: a, words: [k, t], rate: 1, label: `${tag} · build-up` });
        steps.push({ ayah: a, words: [f, t], rate: 1, label: `${tag} · phrase` });
      }
      if (ph.length > 1) steps.push({ ayah: a, words: [0, n], rate: 1, label: `${tag} · whole ayah` });
    }
  }
  return steps;
}

/** One step per sheikh/children pair (the call is the sheikh's line; your turn replaces the children). */
export function planKids(ayat: Ayah[], url: string, splits: { verseKey: string; pairs: { call: { spans: [number, number][]; from: number; to: number }; response: { spans: [number, number][] } }[] }[]): CrStep[] {
  const byKey = new Map(splits.map((x) => [x.verseKey, x]));
  const out: CrStep[] = [];
  for (const a of ayat) {
    const sp = byKey.get(`${a.surah}:${a.ayah}`);
    if (!sp) continue;
    const n = recitedWords(a).length;
    sp.pairs.forEach((p, i) => {
      const words: [number, number] = p.call.to <= n ? [p.call.from - 1, p.call.to] : [0, n];
      out.push({ ayah: a, words, rate: 1, label: `${a.surah}:${a.ayah} · with children${sp.pairs.length > 1 ? ` · part ${i + 1}/${sp.pairs.length}` : ''}`, kids: { url, call: p.call.spans, resp: p.response.spans } });
    });
  }
  return out;
}
