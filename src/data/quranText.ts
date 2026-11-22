// Pure helpers shared by the build scripts, the app and the tests. No DOM, no I/O.
// The Quran text itself is never generated here: these functions only read Tanzil lines.

/** Waqf (pause) marks as Tanzil encodes them in the Uthmani text (each is its own space-separated token). */
export const PAUSE_MARKS: Readonly<Record<string, string>> = {
  'ۖ': 'sili', // ۖ  continuing is better (al-wasl awla)
  'ۗ': 'qili', // ۗ  stopping is better (al-waqf awla)
  'ۘ': 'lazim', // ۘ  (small high meem initial form) obligatory stop
  'ۙ': 'la', // ۙ  do not stop
  'ۚ': 'jaiz', // ۚ  permissible stop
  'ۛ': 'muanaqa', // ۛ  embraced stop (stop at one of the pair)
  'ۜ': 'sakt', // ۜ  small high seen used as a mark (sakt / seen)
};
export const SAJDAH_SIGN = '۩'; // ۩
export const RUB_EL_HIZB = '۞'; // ۞
export const BASMALA_WORDS = 4;

const MARK_ONLY = /^[ۖ-ۜ۞۩]+$/u;

export interface Token {
  text: string;
  start: number; // UTF-16 offset into the line (=== code point offset for this text: no astral chars)
  end: number; // exclusive
  isMark: boolean;
}

/** Split a Tanzil ayah line on single spaces, keeping offsets. Marks (pause/sajdah/rub) are flagged. */
export function tokenizeLine(text: string): Token[] {
  const out: Token[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === ' ') {
      if (i > start) {
        const t = text.slice(start, i);
        out.push({ text: t, start, end: i, isMark: MARK_ONLY.test(t) });
      }
      start = i + 1;
    }
  }
  return out;
}

/** Tanzil prefixes the basmala to ayah 1 of every surah except 1 and 9. */
export function hasBasmalaPrefix(surah: number, ayah: number): boolean {
  return ayah === 1 && surah !== 1 && surah !== 9;
}

export interface DisplayWord {
  index: number; // index among the ayah's real words (basmala words included, marks excluded)
  text: string;
  start: number;
  end: number;
  marksAfter: string; // pause/sajdah marks that follow this word
  marksBefore?: string; // marks that start the line before any word (e.g. ۞ if that option were ever enabled)
}

export function displayWords(text: string): DisplayWord[] {
  const words: DisplayWord[] = [];
  let leading = '';
  for (const t of tokenizeLine(text)) {
    if (t.isMark) {
      const last = words[words.length - 1];
      if (last) last.marksAfter += t.text;
      else leading += t.text; // never drop a mark
      continue;
    }
    words.push({ index: words.length, text: t.text, start: t.start, end: t.end, marksAfter: '', ...(leading && !words.length ? { marksBefore: leading } : {}) });
  }
  return words;
}

/** Arabic normalisation for tolerant typed answers (B1): strips harakat, Quranic marks, tatweel; unifies alif/ya/hamza forms. */
export function normaliseArabic(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu, '')
    .replace(/[آأإٱٲٳ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/[ؤ]/gu, 'و')
    .replace(/[ئ]/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Letters that take time to say: base letters + dagger alif; harakat and tatweel excluded. */
export function letterCount(word: string): number {
  let n = 0;
  for (const ch of word) if ((ch === 'ٰ' || !/\p{Mn}/u.test(ch)) && ch !== 'ـ') n++;
  return n;
}
