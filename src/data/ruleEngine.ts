// Independent tajweed rule engine (D-012): the Hafs rules applied from their definitions to the Tanzil Uthmani
// text, using only the orthography's own signs (sukun, shadda, maddah, dagger alif, small waw/ya, the silent-letter
// zero, the iqlab small meem). It shares NO code or data with cpfair/quran-tajweed, so where the two agree we have two
// independent methods; where they disagree a teacher decides. The rule definitions here are model-knowledge.
// Reading assumed: wasl (continuous) within the ayah; the ayah end is a stop.
import type { RuleName } from './rules.ts';

export interface EngineAnn {
  rule: RuleName;
  start: number;
  end: number;
}

const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const HARAKAT = new Set([FATHA, DAMMA, KASRA]);
const FATHATAN = 'ً';
const TANWEEN = new Set([FATHATAN, 'ٌ', 'ٍ']);
const SUKUN = 'ْ';
const SHADDA = 'ّ';
const MADDAH = 'ٓ';
const HAMZA_ABOVE = 'ٔ';
const DAGGER = 'ٰ';
const SMALL_WAW = 'ۥ';
const SMALL_YA = 'ۦ';
const SMALL_HIGH_YA = 'ۧ';
const SILENT_ZERO = new Set(['۟', '۠']);
const IQLAB_MEEM = new Set(['ۢ', 'ۭ']);
const WASLA = 'ٱ';
const PAUSE = /^[ۖ-ۜ۞۩]+$/u;
const HAMZA_LETTERS = new Set(['ء', 'أ', 'إ', 'ؤ', 'ئ', 'آ']);
const SUN = new Set([...'تثدذرزسشصضطظلن']);
const IKHFA = new Set([...'تثجدذزسشصضطظفقك']);
const IDGHAM_GHUNNAH = new Set([...'ينمو']);
const QALQALAH = new Set([...'قطبجد']);
const MUTAJANISAYN = new Set(['تط', 'طت', 'دت', 'تد', 'ثذ', 'ذظ', 'بم']);
const MUTAQARIBAYN = new Set(['لر', 'قك']);
const SMALL_BASES = new Set([DAGGER, SMALL_WAW, SMALL_YA, SMALL_HIGH_YA]);
const SMALL_NOON = '\u06E8'; // small high noon: a noon written small (21:88)
const RECT_ZERO = '\u06E0'; // upright rectangular zero: silent when joining, pronounced when stopping

interface Letter {
  base: string;
  marks: string; // combining marks after the base (excluding the next small base letter)
  start: number;
  end: number;
  word: number;
  first: boolean; // first letter of its word
  last: boolean; // last letter of its word
}

function letters(text: string): Letter[] {
  const out: Letter[] = [];
  const tokens: { s: number; e: number }[] = [];
  for (let k = 0, s = 0; k <= text.length; k++) {
    if (k === text.length || text[k] === ' ') {
      if (k > s && !PAUSE.test(text.slice(s, k))) tokens.push({ s, e: k });
      s = k + 1;
    }
  }
  let word = -1;
  for (const t of tokens) {
    word++;
    const startIdx = out.length;
    for (let i = t.s; i < t.e; ) {
      const base = text[i]!;
      let j = i + 1;
      // combining marks belong to this letter; small letters (dagger alif, small waw/ya) are letters of their own
      while (j < t.e && /[\p{Mn}ۥۦ]/u.test(text[j]!) && !SMALL_BASES.has(text[j]!)) j++;
      // a bare tatweel is decoration; a tatweel carrying marks (hamza seat, tanween seat) is a letter
      const marks = text.slice(i + 1, j);
      // a small high noon on a tatweel is a noon written small (21:88): it counts as a noon sakinah
      if (base !== '\u0640' || j > i + 1) out.push({ base: base === '\u0640' && marks.includes(SMALL_NOON) ? 'ن' : base, marks, start: i, end: j, word, first: false, last: false });
      i = j;
    }
    if (out.length > startIdx) {
      out[startIdx]!.first = true;
      out[out.length - 1]!.last = true;
    }
  }
  return out;
}

const has = (l: Letter, c: string) => l.marks.includes(c);
const vowelled = (l: Letter) => [...l.marks].some((c) => HARAKAT.has(c) || TANWEEN.has(c));
const silentLetter = (l: Letter) => [...l.marks].some((c) => SILENT_ZERO.has(c));
const tanween = (l: Letter) => [...l.marks].some((c) => TANWEEN.has(c));
/** sakin = written with sukun, or bare (no vowel, no shadda) — Uthmani writes noon/meem bare before idgham/ikhfa */
const sakin = (l: Letter) => has(l, SUKUN) || (!vowelled(l) && !has(l, SHADDA) && !SMALL_BASES.has(l.base));
const isHamza = (x: Letter) => HAMZA_LETTERS.has(x.base) || has(x, HAMZA_ABOVE);

/** Alif / alif maqsura written after tanween fath carry no sound (هُدًى, فِرَٰشًا). */
const tanweenSeat = (ls: Letter[], k: number) => {
  const l = ls[k]!;
  const p = ls[k - 1];
  return (l.base === 'ا' || l.base === 'ى') && !vowelled(l) && !has(l, MADDAH) && p !== undefined && p.word === l.word && has(p, FATHATAN);
};
const unspoken = (ls: Letter[], k: number) => silentLetter(ls[k]!) || tanweenSeat(ls, k);

/** The next PRONOUNCED letter (skips silent letters, tanween seats and alif wasla in wasl). */
function nextSpoken(ls: Letter[], i: number): Letter | undefined {
  for (let k = i + 1; k < ls.length; k++) {
    const l = ls[k]!;
    if (unspoken(ls, k) || l.base === WASLA) continue;
    if (l.base === 'ا' && !vowelled(l) && !has(l, MADDAH) && l.first) continue;
    return l;
  }
  return undefined;
}
function prevSpoken(ls: Letter[], i: number): Letter | undefined {
  for (let k = i - 1; k >= 0; k--) if (!unspoken(ls, k)) return ls[k];
  return undefined;
}

export function annotate(text: string, opts: { prefixEnd?: number } = {}): EngineAnn[] {
  const ls = letters(text).filter((l) => l.start >= (opts.prefixEnd ?? 0));
  const out: EngineAnn[] = [];
  const add = (rule: RuleName, l: Letter) => out.push({ rule, start: l.start, end: l.end });
  const lastWord = ls.length ? ls[ls.length - 1]!.word : -1;
  // the upright zero means silent when joining (أَنَا۠) but pronounced when stopping: the ayah end is a stop (33:10)
  for (const l of ls) if (l.word === lastWord && l.marks.includes(RECT_ZERO)) l.marks = l.marks.replace(RECT_ZERO, '');

  ls.forEach((l, i) => {
    const prev = ls[i - 1];
    const nx = nextSpoken(ls, i);
    // hamzat al-wasl: silent when joined from the word before (not at the start of the ayah)
    if (l.base === WASLA && i > 0) add('hamzat_wasl', l);
    // silent letters (small rounded/rectangular zero)
    if (silentLetter(l)) add('silent', l);
    // waw written but read as the dagger alif after it (ٱلصَّلَوٰةَ): the waw is silent
    if (l.base === 'و' && !vowelled(l) && !has(l, SUKUN) && ls[i + 1]?.base === DAGGER && ls[i + 1]!.word === l.word) add('silent', l);
    // lam of the article before a sun letter: bare lam inside a word, followed by the sun letter with shadda
    if (l.base === 'ل' && !l.last && !vowelled(l) && !has(l, SUKUN) && !has(l, SHADDA) && nx && has(nx, SHADDA) && SUN.has(nx.base) && prev && (prev.base === WASLA || prev.base === 'ا' || prev.base === 'ل')) add('lam_shamsiyyah', l);
    // ghunnah on noon/meem with shadda — unless the shadda comes from an idgham of the previous word's noon sakinah,
    // tanween or meem sakinah (then the ghunnah belongs to that idgham)
    const ps = prevSpoken(ls, i);
    const fromIdgham = (i === 0 && l.first) || (l.first && ps !== undefined && ps.word !== l.word && (tanween(ps) || ((ps.base === 'ن' || ps.base === 'م') && sakin(ps) && !has(ps, SUKUN))));
    if ((l.base === 'ن' || l.base === 'م') && has(l, SHADDA) && !fromIdgham) add('ghunnah', l);
    // noon sakinah (written bare before idgham/ikhfa) and tanween
    // a letter name with maddah (68:1) is not a noon sakinah: Hafs reads it with izhar
    const isNoonSakin = l.base === 'ن' && sakin(l) && !has(l, SUKUN) && !has(l, MADDAH);
    // tanween before hamzat al-wasl (2:180): the noon is read with a kasra so two sakin letters do not meet → no noon
    // rule applies
    let nw = i + 1;
    while (nw < ls.length && ls[nw]!.word === l.word) nw++;
    const beforeWasl = ls[nw]?.base === WASLA && (nx === undefined || nx.word !== l.word);
    if ((isNoonSakin || tanween(l)) && nx && !beforeWasl) {
      const across = nx.word !== l.word;
      if ([...l.marks].some((c) => IQLAB_MEEM.has(c)) || nx.base === 'ب') add('iqlab', l);
      else if (IDGHAM_GHUNNAH.has(nx.base) && (across || tanween(l))) add('idghaam_ghunnah', l);
      else if ((nx.base === 'ل' || nx.base === 'ر') && across) add('idghaam_no_ghunnah', l);
      else if (IKHFA.has(nx.base)) add('ikhfa', l);
    }
    // meem sakinah
    if (l.base === 'م' && sakin(l) && !has(l, SHADDA) && nx) {
      if (nx.base === 'ب') add('ikhfa_shafawi', l);
      else if (nx.base === 'م' && has(nx, SHADDA)) add('idghaam_shafawi', l);
    }
    // two different letters merging: bare sakin letter followed by a letter with shadda (the article lam excluded)
    if (nx && !has(l, SUKUN) && sakin(l) && has(nx, SHADDA) && l.base !== nx.base && l.base !== 'ن' && l.base !== 'م' && !(l.base === 'ل' && !l.last)) {
      const pair = l.base + nx.base;
      if (MUTAJANISAYN.has(pair)) add('idghaam_mutajanisayn', l);
      else if (MUTAQARIBAYN.has(pair)) add('idghaam_mutaqaribayn', l);
    }
    // qalqalah: ق ط ب ج د with sukun, or as the final letter of the ayah (stopping) — not a letter name with maddah,
    // whose last sound is another letter (42:2: the name of ق ends in ف)
    if (QALQALAH.has(l.base) && (has(l, SUKUN) || (l.word === lastWord && l.last && !has(l, MADDAH)))) add('qalqalah', l);
    // madd letters
    // the vowel before a madd letter sits on the previous PRONOUNCED letter (وَجِا۟ىٓءَ: the silent alif is skipped);
    // a small letter carrying a vowel, sukun, shadda or hamza is a consonant (يُحْـِۧىَ, فَٱدَّٰرَْٰٔتُمْ), not a madd
    const pv = ps !== undefined && ps.word === l.word ? ps : undefined;
    const maddLetter =
      (SMALL_BASES.has(l.base) && !vowelled(l) && !has(l, SUKUN) && !has(l, SHADDA) && !has(l, HAMZA_ABOVE)) ||
      (l.base === 'ا' && pv !== undefined && has(pv, FATHA) && !vowelled(l) && !silentLetter(l)) ||
      (l.base === 'و' && pv !== undefined && has(pv, DAMMA) && !vowelled(l) && !has(l, SUKUN) && !has(l, SHADDA) && !silentLetter(l)) ||
      ((l.base === 'ي' || l.base === 'ى') && pv !== undefined && has(pv, KASRA) && !vowelled(l) && !has(l, SUKUN) && !has(l, SHADDA) && !silentLetter(l));
    if (maddLetter) {
      // the next pronounced letter in the same word (قَالُوٓا۟: the silent alif does not count)
      let nextInWord: Letter | undefined;
      for (let k = i + 1; k < ls.length && ls[k]!.word === l.word; k++)
        if (!silentLetter(ls[k]!)) {
          nextInWord = ls[k];
          break;
        }
      const atAyahEnd = l.word === lastWord && nextInWord !== undefined && nextInWord.last;
      // يَٰٓأَيُّهَا / هَٰٓأَنتُمْ: the vocative يا and the attention ها are separate words in meaning → munfasil
      const particle = l.base === DAGGER && prev !== undefined && prev.first && (prev.base === 'ي' || prev.base === 'ه') && has(prev, FATHA);
      if (has(l, MADDAH)) {
        if (nextInWord && isHamza(nextInWord) && !particle) add('madd_muttasil', l);
        else if ((nextInWord && isHamza(nextInWord) && particle) || (!nextInWord && nx && isHamza(nx))) add('madd_munfasil', l);
        // necessary madd: a sakin or doubled letter follows in the word (ٱلضَّآلِّينَ, ءَآلْـَٔـٰنَ)
        else if (nextInWord && (has(nextInWord, SHADDA) || sakin(nextInWord))) add('madd_6', l);
        // otherwise (a maddah on the last letter of the ayah) it only matters when joining to the next ayah: with the
        // stop assumed here it is a natural madd, not coloured
      } else if (atAyahEnd) add('madd_246', l);
      // display convention shared with tajweed-mushaf colouring: the 2-count madd is coloured on the small letters, but not
      // on a word-final ىٰ (عَلَىٰ, مُوسَىٰ); a mid-word ىٰ (هَدَىٰكُمْ) is coloured
      else if (SMALL_BASES.has(l.base) && !(l.base === DAGGER && prev?.base === '\u0649' && l.last) && !(l.last && nx && sakin(nx) && !nx.first) && !(l.last && l.word === lastWord && (l.base === SMALL_WAW || l.base === SMALL_YA))) add('madd_2', l);
    }
    // muqatta'at: a consonant carrying the maddah sign (letter names like لٓ مٓ) → necessary madd, 6 counts
    if (has(l, MADDAH) && !maddLetter && !HAMZA_LETTERS.has(l.base) && l.base !== 'ا') add('madd_6', l);
    // leen before the final letter of the ayah (stopping): و/ي with sukun after fatha
    if ((l.base === 'و' || l.base === 'ي') && has(l, SUKUN) && prev && has(prev, FATHA) && l.word === lastWord && ls[i + 1]?.last && ls[i + 1]!.word === l.word) add('madd_246', l);
  });
  return out;
}
