// Data-generated questions (B7): verifiable against the data and effectively unlimited, so mastery tests always
// use unseen items. Seeded RNG → reproducible; the correct option lands in a uniformly random position.
import type { Ayah } from '../data/quranData.ts';
import { recitedWords } from '../data/quranData.ts';
import type { DisplayWord } from '../data/quranText.ts';
import { RULES, RULE_BY_ID, type RuleName } from '../data/rules.ts';
import type { Generator, Provenance } from './schema.ts';

export interface GenQuestion {
  id: string; // stable for a given seed: used to track "seen"
  q: string;
  /** optional Arabic shown big above the question (a letter or a word loaded from data) */
  arabic?: { text: string; highlight?: [number, number] };
  /** optional audio: Minshawi word (surah, ayah, recited word index) */
  audio?: { surah: number; ayah: number; word: number };
  options: string[]; // 4, already shuffled
  answer: number; // index into options
  explain: string[]; // per option
  provenance: Provenance;
}

/** Independent sub-seed for (seed, purpose): avoids overlapping streams such as rng(seed + 1) vs rng(seed') . */
export function mix(seed: number, k: number): number {
  let h = Math.imul((seed >>> 0) ^ Math.imul(k + 1, 0x27d4eb2d), 0x165667b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca77) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** FNV-1a: a stable 32-bit number for a string (used to give every lesson its own random stream). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function rng(seed: number): () => number {
  // scramble small seeds (xorshift's first outputs from tiny seeds are tiny → biased positions), then warm up
  let s = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 8; i++) next();
  return next;
}
const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
/** Unbiased Fisher–Yates shuffle (a comparator like sort(() => r() - 0.5) is NOT uniform). Returns a new array. */
export function shuffle<T>(a: readonly T[], r: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Place the correct option uniformly at random among 4 (B1: random position). */
export function arrange(correct: string, distractors: string[], explainCorrect: string, explainWrong: (d: string) => string, r: () => number): { options: string[]; answer: number; explain: string[] } {
  const d = distractors.slice(0, 3);
  const pos = Math.floor(r() * 4);
  const options: string[] = [];
  const explain: string[] = [];
  let k = 0;
  for (let i = 0; i < 4; i++) {
    if (i === pos) {
      options.push(correct);
      explain.push(explainCorrect);
    } else {
      options.push(d[k]!);
      explain.push(explainWrong(d[k]!));
      k++;
    }
  }
  return { options, answer: pos, explain };
}

// Letter names (model-knowledge, standard): used only as answer labels.
export const LETTER_NAMES: Record<string, string> = {
  'ا': 'alif', 'ب': 'ba', 'ت': 'ta', 'ث': 'tha', 'ج': 'jim', 'ح': 'ḥa', 'خ': 'kha', 'د': 'dal', 'ذ': 'dhal', 'ر': 'ra', 'ز': 'zay', 'س': 'sin', 'ش': 'shin',
  'ص': 'ṣad', 'ض': 'ḍad', 'ط': 'ṭa', 'ظ': 'ẓa', 'ع': 'ʿayn', 'غ': 'ghayn', 'ف': 'fa', 'ق': 'qaf', 'ك': 'kaf', 'ل': 'lam', 'م': 'mim', 'ن': 'nun', 'ه': 'ha', 'و': 'waw', 'ي': 'ya', 'ء': 'hamza',
};
/** Look-alike groups (shape families) → plausible distractors. */
const FAMILIES = ['ب ت ث ن ي', 'ج ح خ', 'د ذ', 'ر ز', 'س ش', 'ص ض', 'ط ظ', 'ع غ', 'ف ق', 'ك ل', 'م ه', 'و ء ا'].map((f) => f.split(' '));
const SOUND_ALIKE = ['ت ط', 'ث س ص', 'ذ ز ض ظ', 'ح ه', 'ع ء', 'ق ك غ', 'د ض', 'خ غ', 'ذ د', 'ث ت', 'ح خ', 'ر ل'].map((f) => f.split(' '));
const ALL = Object.keys(LETTER_NAMES);

function letterDistractors(letter: string, r: () => number): string[] {
  const near = new Set<string>();
  for (const f of [...FAMILIES, ...SOUND_ALIKE]) if (f.includes(letter)) f.forEach((x) => x !== letter && near.add(x));
  const pool = [...near];
  while (pool.length < 3) {
    const x = pick(r, ALL);
    if (x !== letter && !pool.includes(x)) pool.push(x);
  }
  // shuffle and take 3
  return shuffle(pool, r).slice(0, 3);
}

const HARAKAT: Record<string, string> = { 'َ': 'fatha (a)', 'ُ': 'damma (u)', 'ِ': 'kasra (i)', 'ْ': 'sukun (no vowel)', 'ّ': 'shadda (doubled)', 'ً': 'tanwin fath (-an)', 'ٌ': 'tanwin damm (-un)', 'ٍ': 'tanwin kasr (-in)' };

// ---------- word anatomy (marks stay with their letter; small waw/ya are letters) ----------
const MARK = /\p{Mn}/u;
const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const SUKUN = 'ْ';
const SHADDA = 'ّ';
const MADDAH = 'ٓ';
const DAGGER = 'ٰ';
const SMALL_WAW = 'ۥ';
const SMALL_YA = 'ۦ';
const SMALL_HIGH_YA = 'ۧ';
interface Letter {
  ch: string;
  marks: string;
  at: number;
  end: number;
}
export function lettersOf(text: string): Letter[] {
  const out: Letter[] = [];
  for (let i = 0; i < text.length; ) {
    let j = i + 1;
    while (j < text.length && MARK.test(text[j]!)) j++;
    out.push({ ch: text[i]!, marks: text.slice(i + 1, j), at: i, end: j });
    i = j;
  }
  return out;
}
const bare = (l: Letter | undefined) => !!l && l.marks === '';
const plain = (s: string) => s.replace(/\p{Mn}/gu, '');
const ALIFS = 'اأإآٱ';

/** Is this letter drawn inside a ligature (lam-alif, the Name of Allah)? Its highlight would be a sliver (m-7). */
function inLigature(word: string, ls: Letter[], k: number): boolean {
  const c = ls[k]!;
  if (c.ch === 'ل' && ALIFS.includes(ls[k + 1]?.ch ?? '')) return true;
  if (ALIFS.includes(c.ch) && ls[k - 1]?.ch === 'ل') return true;
  return (c.ch === 'ل' || c.ch === 'ه') && plain(word).includes('لله');
}

// ---------- contrast sets (M-2): the lesson's key distinction, found in the text ----------
type Odd = 'wasl-qat' | 'sun-moon';
type Classify = 'long-vowel' | 'small-sign' | 'shadda';
function hamzaStart(w: string): 'wasl' | 'qat' | null {
  return w[0] === 'ٱ' ? 'wasl' : w[0] === 'أ' || w[0] === 'إ' ? 'qat' : null;
}
function articleLam(w: string): 'sun' | 'moon' | null {
  if (plain(w).includes('لله')) return null; // the Name of Allah has its own rule
  const ls = lettersOf(w);
  const k = ls.findIndex((l, i) => i <= 1 && l.ch === 'ٱ' && ls[i + 1]?.ch === 'ل');
  if (k < 0 || (k === 1 && !ls[0]!.marks)) return null;
  const lam = ls[k + 1]!;
  const next = ls[k + 2];
  if (!next) return null;
  if (lam.marks === SUKUN) return 'moon';
  if (bare(lam) && next.marks.includes(SHADDA)) return 'sun';
  return null;
}
function longVowels(w: string): { cls: string; span: [number, number] }[] {
  const ls = lettersOf(w);
  const out: { cls: string; span: [number, number] }[] = [];
  ls.forEach((c, k) => {
    const p = ls[k - 1];
    const n = ls[k + 1];
    if (p && bare(c) && !p.marks.includes(DAGGER) && !p.marks.includes(MADDAH)) {
      if (c.ch === 'ا' && p.marks.includes(FATHA)) out.push({ cls: 'aa', span: [p.at, c.end] });
      else if ((c.ch === 'ي' || c.ch === 'ى') && p.marks.includes(KASRA)) out.push({ cls: 'ii', span: [p.at, c.end] });
      else if (c.ch === 'و' && p.marks.includes(DAMMA)) out.push({ cls: 'uu', span: [p.at, c.end] });
    }
    if (n && c.ch !== 'ٱ' && [FATHA, KASRA, DAMMA].includes(c.marks) && !(bare(n) && 'اويى'.includes(n.ch)) && n.ch !== SMALL_WAW && n.ch !== SMALL_YA)
      out.push({ cls: 'short', span: [c.at, c.end] });
  });
  return out;
}
function smallSigns(w: string): { cls: string; span: [number, number] }[] {
  const ls = lettersOf(w);
  const out: { cls: string; span: [number, number] }[] = [];
  ls.forEach((c, k) => {
    const flags = [c.marks.includes(DAGGER), c.marks.includes(MADDAH), c.marks.includes(SMALL_HIGH_YA)];
    // a small waw/ya carrying a maddah would make two answers true (n-1): skip it
    if (flags.filter(Boolean).length === 1 && c.ch !== SMALL_WAW && c.ch !== SMALL_YA) out.push({ cls: flags[0] ? 'dagger' : flags[1] ? 'maddah' : 'sya', span: [c.at, c.end] });
    const p = ls[k - 1];
    if (p && (c.ch === SMALL_WAW || c.ch === SMALL_YA) && !c.marks.includes(MADDAH) && !p.marks.includes(DAGGER) && !p.marks.includes(MADDAH))
      out.push({ cls: c.ch === SMALL_WAW ? 'swaw' : 'sya', span: [p.at, c.end] });
  });
  return out;
}
/** What is on a letter: a shadda (with its vowel), one short vowel, a sukun, or tanween (n-2: the shadda lesson). */
function markClasses(w: string): { cls: string; span: [number, number] }[] {
  const ls = lettersOf(w);
  const out: { cls: string; span: [number, number] }[] = [];
  const V = [FATHA, KASRA, DAMMA];
  ls.forEach((c, k) => {
    if (inLigature(w, ls, k) || c.ch === 'ٱ') return;
    const m = c.marks;
    const span: [number, number] = [c.at, c.end];
    if (m.length === 2 && m.includes(SHADDA) && V.some((v) => m.includes(v))) out.push({ cls: 'shadda', span });
    else if (m === SUKUN) out.push({ cls: 'sukun', span });
    else if (V.includes(m)) out.push({ cls: 'short', span });
    else if (['\u064B', '\u064C', '\u064D'].includes(m)) out.push({ cls: 'tanween', span });
  });
  return out;
}
const ODD: Record<Odd, { classes: [string, string]; of: (w: string) => string | null; q: Record<string, string>; why: Record<string, string> }> = {
  'wasl-qat': {
    classes: ['wasl', 'qat'],
    of: hamzaStart,
    q: { wasl: 'Which word starts with hamzat al-wasl (ٱ: not said when you join it to the word before)?', qat: "Which word starts with hamzat al-qat' (أ or إ: always said)?" },
    why: { wasl: 'it starts with ٱ, hamzat al-wasl, which you drop when joining.', qat: "it starts with a hamza on the alif (أ or إ), hamzat al-qat', which is always said." },
  },
  'sun-moon': {
    classes: ['sun', 'moon'],
    of: articleLam,
    q: { sun: 'In which word is the lam of "al-" silent (a sun letter with shadda follows it)?', moon: 'In which word is the lam of "al-" said (it has a sukun; a moon letter follows)?' },
    why: { sun: 'the lam has no sukun and the next letter has a shadda: a sun letter, so the lam is silent.', moon: 'the lam has a sukun: a moon letter follows, so the lam is said.' },
  },
};
const CLASSIFY: Record<Classify, { find: (w: string) => { cls: string; span: [number, number] }[]; q: string; label: Record<string, string>; spot: Record<string, string> }> = {
  'long-vowel': {
    find: longVowels,
    q: 'What do you read on the highlighted part?',
    label: { aa: 'A long "aa"', ii: 'A long "ii"', uu: 'A long "uu"', short: 'A short vowel only' },
    spot: { aa: 'a long "aa" is a plain alif right after a fatha.', ii: 'a long "ii" is a plain ya right after a kasra.', uu: 'a long "uu" is a plain waw right after a damma.', short: 'a short vowel has no madd letter after it.' },
  },
  shadda: {
    find: markClasses,
    q: 'What is on the highlighted letter?',
    label: { shadda: 'A shadda: say the letter twice (doubled)', short: 'One short vowel', sukun: 'A sukun: the letter has no vowel', tanween: 'Tanween: a short vowel, then an "n" sound' },
    spot: { shadda: 'a shadda is the small "w" shape; the letter is doubled.', short: 'one short vowel is a single stroke or small waw.', sukun: 'a sukun is a small circle: no vowel.', tanween: 'tanween is a doubled vowel mark: add an "n".' },
  },
  'small-sign': {
    find: smallSigns,
    q: 'Which sign is on the highlighted part?',
    label: { dagger: 'Small alif: read a long "aa"', swaw: 'Small waw: read a long "uu"', sya: 'Small ya: read a long "ii"', maddah: 'Maddah: stretch longer than 2 counts' },
    spot: { dagger: 'the small alif sits above the letter.', swaw: 'the small waw comes after the letter (often after هُ).', sya: 'the small ya comes after the letter (often after هِ).', maddah: 'the maddah is a wavy line above the madd letter.' },
  },
};

/** A quarter of the generated items are kept for mastery tests only and never shown in practice (B-1). */
export const masteryOnly = (id: string): boolean => hashStr(`m:${id}`) % 4 === 0;

interface Hit {
  ay: Ayah;
  w: DisplayWord;
}
/** Generate `n` questions for a lesson generator over loaded surahs. */
export function generate(g: Generator, surahs: Map<number, Ayah[]>, n: number, seed: number): GenQuestion[] {
  const r = rng(seed);
  const out: GenQuestion[] = [];
  const seen = new Set<string>();
  const ayatOf = (list: number[]) => list.flatMap((s) => surahs.get(s) ?? []);
  const src = (ay: Ayah, w?: DisplayWord) => `Tanzil text ${ay.surah}:${ay.ayah}${w ? ` word ${w.index}` : ''}`;
  // precomputed candidates (so every class / letter can be drawn uniformly)
  const words: (Hit & { last: boolean })[] = 'surahs' in g ? ayatOf(g.surahs).flatMap((ay) => recitedWords(ay).map((w, i, ws) => ({ ay, w, last: i === ws.length - 1 }))) : [];
  const byClass = new Map<string, Hit[]>();
  const spans = new Map<string, (Hit & { span: [number, number] })[]>();
  const letterHits = new Map<string, (Hit & { at: number; end: number })[]>();
  if (g.kind === 'contrast') {
    for (const h of words) {
      if (g.set === 'wasl-qat' || g.set === 'sun-moon') {
        const c = ODD[g.set].of(h.w.text);
        if (c) (byClass.get(c) ?? byClass.set(c, []).get(c)!).push(h);
      } else
        for (const f of CLASSIFY[g.set].find(h.w.text)) {
          // at the ayah end (a stop) a maddah only matters when joining on, and a small waw/ya is dropped (n-1)
          if (g.set === 'small-sign' && h.last && f.span[1] >= h.w.text.length && f.cls !== 'dagger') continue;
          (spans.get(f.cls) ?? spans.set(f.cls, []).get(f.cls)!).push({ ...h, span: f.span });
        }
    }
  }
  const ruleHits = new Map<string, { ay: Ayah; ann: Ayah['annotations'][number] }[]>();
  if (g.kind === 'rule-id' || g.kind === 'madd-count') {
    for (const ay of ayatOf(g.surahs))
      for (const ann of ay.annotations)
        if (!(ann.flags & 8) && ann.start >= (ay.words[ay.basmalaWords]?.start ?? 0)) (ruleHits.get(ann.rule.id) ?? ruleHits.set(ann.rule.id, []).get(ann.rule.id)!).push({ ay, ann });
  }
  if (g.kind === 'letter-in-word') {
    for (const h of words) {
      const ls = lettersOf(h.w.text);
      ls.forEach((l, k) => {
        if (!g.letters.includes(l.ch) || inLigature(h.w.text, ls, k)) return;
        (letterHits.get(l.ch) ?? letterHits.set(l.ch, []).get(l.ch)!).push({ ...h, at: l.at, end: l.end });
      });
    }
  }
  for (let guard = 0; out.length < n && guard < n * 50; guard++) {
    let q: GenQuestion | null = null;
    if (g.kind === 'letter-id') {
      const L = pick(r, g.letters);
      const a = arrange(LETTER_NAMES[L] ?? L, letterDistractors(L, r).map((x) => LETTER_NAMES[x] ?? x), `Yes — this is ${LETTER_NAMES[L]}.`, (d) => `No: that is ${d}, a different letter (look at the dots and the shape).`, r);
      // the same letter at another answer position is the same question (B-1)
      q = { id: `letter-id-${L}`, q: 'Which letter is this?', arabic: { text: L }, ...a, provenance: { kind: 'model-knowledge' } };
    } else if (g.kind === 'letter-in-word') {
      const avail = g.letters.filter((x) => letterHits.get(x)?.length);
      if (!avail.length) break;
      const L = pick(r, avail); // the letter first, so every letter of the lesson is asked equally often
      const h = pick(r, letterHits.get(L)!);
      const a = arrange(LETTER_NAMES[L] ?? L, letterDistractors(L, r).map((x) => LETTER_NAMES[x] ?? x), `Yes — the highlighted letter is ${LETTER_NAMES[L]}.`, (d) => `No: ${d} looks or sounds similar, but the dots/shape differ.`, r);
      q = { id: `liw-${h.ay.surah}-${h.ay.ayah}-${h.w.index}-${h.at}`, q: 'Which letter is highlighted in this word?', arabic: { text: h.w.text, highlight: [h.at, h.end] }, ...a, provenance: { kind: 'dataset', source: src(h.ay, h.w) } };
    } else if (g.kind === 'harakah-id') {
      const ay = pick(r, ayatOf(g.surahs));
      const w = pick(r, recitedWords(ay));
      const idx: number[] = [];
      // only letters that carry exactly ONE mark, so no other option can also be on the letter (M-1), and none drawn
      // inside a ligature, where the highlight would be a sliver (m-7)
      const ls = lettersOf(w.text);
      ls.forEach((l, k) => {
        if (l.marks.length === 1 && HARAKAT[l.marks] && !inLigature(w.text, ls, k)) idx.push(l.at + 1);
      });
      if (!idx.length) continue;
      const i = pick(r, idx);
      const correct = HARAKAT[w.text[i]!]!;
      const others = Object.values(HARAKAT).filter((x) => x !== correct);
      const a = arrange(correct, shuffle(others, r).slice(0, 3), `Yes — the mark is ${correct}.`, (d) => `No: ${d} is a different mark.`, r);
      q = { id: `har-${ay.surah}-${ay.ayah}-${w.index}-${i}`, q: 'Which mark is on the highlighted letter?', arabic: { text: w.text, highlight: [i - 1, i + 1] }, ...a, provenance: { kind: 'dataset', source: src(ay) } };
    } else if (g.kind === 'rule-id' || g.kind === 'madd-count') {
      const wanted = g.kind === 'madd-count' ? (RULES.filter((x) => x.counts).map((x) => x.id) as string[]) : g.rules;
      const avail = wanted.filter((x) => ruleHits.get(x)?.length);
      if (!avail.length) break;
      const { ay, ann } = pick(r, ruleHits.get(pick(r, avail))!); // the rule first: answers stay balanced (M-2)
      const w = ay.words.find((x) => ann.start >= x.start && ann.start < x.end);
      if (!w) continue;
      const hl: [number, number] = [ann.start - w.start, Math.min(w.text.length, ann.end - w.start)];
      if (g.kind === 'rule-id') {
        const correct = ann.rule.en;
        // distractors: the lesson's own rules first (taught), then the same group, then the rest
        const taught = RULES.filter((x) => x.en !== correct && wanted.includes(x.id)).map((x) => x.en);
        const sameGroup = RULES.filter((x) => x.en !== correct && x.group === ann.rule.group).map((x) => x.en);
        const other = RULES.filter((x) => x.en !== correct && x.group !== ann.rule.group).map((x) => x.en);
        const d = [...new Set([...shuffle(taught, r), ...shuffle(sameGroup, r), ...shuffle(other, r)])].slice(0, 3);
        const a = arrange(correct, d, `Yes — ${ann.rule.en}: ${ann.rule.gloss}`, (x) => `No: ${x} is ${RULES.find((y) => y.en === x)?.gloss.toLowerCase() ?? 'a different rule'}`, r);
        q = { id: `rule-${ay.surah}-${ay.ayah}-${ann.start}`, q: 'Which tajweed rule is highlighted?', arabic: { text: w.text, highlight: hl }, ...a, provenance: { kind: 'dataset', source: `cpfair/quran-tajweed (rebuilt) ${ay.surah}:${ay.ayah} [${ann.start},${ann.end})` } };
      } else {
        const counts = RULE_BY_ID[ann.rule.id as RuleName].counts!;
        const pool = ['2', '4–5', '6', '2/4/6'].filter((x) => x !== counts);
        const a = arrange(`${counts} counts`, pool.map((x) => `${x} counts`), `Yes — ${ann.rule.en}: ${counts} counts.`, (x) => `No: ${x} belongs to another kind of madd/ghunnah.`, r);
        q = { id: `madd-${ay.surah}-${ay.ayah}-${ann.start}`, q: 'How many counts for the highlighted part?', arabic: { text: w.text, highlight: hl }, ...a, provenance: { kind: 'dataset', source: `cpfair/quran-tajweed (rebuilt) ${ay.surah}:${ay.ayah}; counts from src/data/rules.ts` } };
      }
    } else if (g.kind === 'contrast' && (g.set === 'wasl-qat' || g.set === 'sun-moon')) {
      const spec = ODD[g.set];
      const [A, B] = spec.classes;
      const want = r() < 0.5 ? A : B;
      const other = want === A ? B : A;
      const pool = byClass.get(want) ?? [];
      const opp = byClass.get(other) ?? [];
      if (!pool.length || opp.length < 3) break;
      const t = pick(r, pool);
      const ds: string[] = [];
      for (let k = 0; ds.length < 3 && k < 60; k++) {
        const x = pick(r, opp).w.text;
        if (x !== t.w.text && !ds.includes(x)) ds.push(x);
      }
      if (ds.length < 3) continue;
      const a = arrange(t.w.text, ds, `Yes: ${spec.why[want]}`, () => `No: ${spec.why[other]}`, r);
      q = { id: `cx-${g.set}-${want}-${t.ay.surah}-${t.ay.ayah}-${t.w.index}`, q: spec.q[want]!, ...a, provenance: { kind: 'dataset', source: src(t.ay, t.w) } };
    } else if (g.kind === 'contrast') {
      const spec = CLASSIFY[g.set as Classify];
      const classes = Object.keys(spec.label).filter((c) => spans.get(c)?.length);
      if (classes.length < 2) break;
      const cls = pick(r, classes); // the class first: every answer is equally likely (M-2)
      const h = pick(r, spans.get(cls)!);
      const others = Object.keys(spec.label).filter((c) => c !== cls);
      const a = arrange(spec.label[cls]!, shuffle(others, r).map((c) => spec.label[c]!), `Yes: ${spec.spot[cls]}`, (x) => `No: ${spec.spot[Object.keys(spec.label).find((c) => spec.label[c] === x)!]}`, r);
      q = { id: `cx-${g.set}-${h.ay.surah}-${h.ay.ayah}-${h.w.index}-${h.span[0]}`, q: spec.q, arabic: { text: h.w.text, highlight: h.span }, ...a, provenance: { kind: 'dataset', source: src(h.ay, h.w) } };
    } else if (g.kind === 'word-audio') {
      const ay = pick(r, ayatOf(g.surahs));
      const ws = recitedWords(ay);
      if (ws.length < 4) continue;
      const wi = Math.floor(r() * ws.length);
      const uniq = [...new Set(ws.filter((_, i) => i !== wi).map((x) => x.text))].filter((x) => x !== ws[wi]!.text);
      if (uniq.length < 3) continue;
      const a = arrange(ws[wi]!.text, shuffle(uniq, r).slice(0, 3), 'Yes — that is the word he recited.', () => 'No: that word is in the same ayah, but he recited a different one.', r);
      q = { id: `wa-${ay.surah}-${ay.ayah}-${wi}`, q: 'Listen. Which word did Sheikh al-Minshawi recite?', audio: { surah: ay.surah, ayah: ay.ayah, word: wi }, ...a, provenance: { kind: 'dataset', source: `Tanzil text + quran-align timings ${ay.surah}:${ay.ayah}` } };
    }
    // the same visible question (same word + highlight) from another ayah counts as a repeat (n-3)
    const vis = !q ? '' : q.audio ? q.id : q.arabic ? `${q.q}|${q.arabic.text}|${q.arabic.highlight?.join(',') ?? ''}` : `${q.q}|${[...q.options].sort().join('|')}`;
    if (q && !seen.has(q.id) && !seen.has(vis)) {
      seen.add(q.id);
      seen.add(vis);
      out.push(q);
    }
  }
  return out;
}
