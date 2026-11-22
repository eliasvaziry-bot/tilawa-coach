// Tajweed colouring without splitting words into spans: the CSS Custom Highlight API paints code-point
// ranges of a word's single text node, so the browser shapes (joins) every word exactly as plain text.
// Fallback for browsers without it: a clipped, coloured full copy of the word on top (see AyahText paintOverlays).
import type { Annotation } from '../data/quranData.ts';
import type { DisplayWord } from '../data/quranText.ts';

const forceFallback = typeof location !== 'undefined' && /[?&]tjfallback=1/.test(location.search + location.hash);
export const highlightSupported = (): boolean => !forceFallback && typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/** Highlight name for a rule colour token, e.g. '--tj-madd2' → 'tj-madd2'. */
export const keyFor = (colourToken: string): string => colourToken.replace(/^--/, '');

export interface Piece {
  /** offsets relative to the word */
  start: number;
  end: number;
  key: string;
  ann: Annotation;
}

/** Clip annotations (line offsets) to one word (word offsets). */
export function piecesForWord(word: DisplayWord, anns: readonly Annotation[]): Piece[] {
  const out: Piece[] = [];
  for (const a of anns) {
    const s = Math.max(a.start, word.start);
    const e = Math.min(a.end, word.end);
    if (e > s) out.push({ start: s - word.start, end: e - word.start, key: keyFor(a.rule.colour), ann: a });
  }
  return out.sort((x, y) => x.start - y.start || y.end - x.end);
}

type Owner = object;
const registry = new Map<Owner, { key: string; range: Range }[]>();
let scheduled = false;

function flush(): void {
  scheduled = false;
  if (!highlightSupported()) return;
  const byKey = new Map<string, Range[]>();
  for (const list of registry.values()) for (const { key, range } of list) (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(range);
  for (const k of [...CSS.highlights.keys()]) if (String(k).startsWith('tj-') && k !== 'tj-focus') CSS.highlights.delete(k);
  for (const [k, ranges] of byKey) CSS.highlights.set(k, new Highlight(...ranges));
}

export function setOwnerRanges(owner: Owner, items: { key: string; range: Range }[]): void {
  if (items.length) registry.set(owner, items);
  else registry.delete(owner);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}
export function clearOwner(owner: Owner): void {
  setOwnerRanges(owner, []);
}

/** A focus highlight (e.g. rule finder / lesson example): one range at a time. */
export function setFocusRange(range: Range | null): void {
  if (!highlightSupported()) return;
  if (range) CSS.highlights.set('tj-focus', new Highlight(range));
  else CSS.highlights.delete('tj-focus');
}

/** Extend a cut so it never separates a base letter from its combining marks (fallback rendering). */
export function clusterBoundary(text: string, i: number): number {
  while (i > 0 && i < text.length && /\p{Mn}/u.test(text[i]!) && text[i] !== 'ٰ') i++;
  return Math.min(i, text.length);
}
