// Pure cross-check logic (no network): Quran.com tagged tajweed text vs our annotations, and Quran.com text vs the
// Tanzil text, letter by letter after a documented normalisation. Used by scripts/qf-crosscheck.ts and unit tests
// (with small synthetic inputs — no Quran Foundation data is ever stored in the repo).
import type { RuleName } from './rules.ts';
import { lcsMap } from '../../scripts/lib/align.ts';

/** CLASS-MAPPING TABLE (by meaning). Many-to-many for madd; ambiguous pairs listed in AMBIGUOUS. */
export const CLASS_MAP: Record<string, RuleName[]> = {
  ham_wasl: ['hamzat_wasl'],
  laam_shamsiyah: ['lam_shamsiyyah'],
  slnt: ['silent'],
  madda_normal: ['madd_2'],
  madda_permissible: ['madd_246', 'madd_munfasil'],
  madda_obligatory: ['madd_muttasil', 'madd_munfasil'],
  madda_necessary: ['madd_6'],
  qalaqah: ['qalqalah'],
  ikhafa: ['ikhfa'],
  ikhafa_shafawi: ['ikhfa_shafawi'],
  iqlab: ['iqlab'],
  idgham_ghunnah: ['idghaam_ghunnah'],
  idgham_wo_ghunnah: ['idghaam_no_ghunnah'],
  idgham_shafawi: ['idghaam_shafawi'],
  idgham_mutajanisayn: ['idghaam_mutajanisayn'],
  idgham_mutaqaribayn: ['idghaam_mutaqaribayn'],
  ghunnah: ['ghunnah'],
};
export const AMBIGUOUS = [
  'Madd position: cpfair colours the madd letter (or dagger alif); Quran.com often colours the letter before it — matched within ±1 letter.',
  'madd_munfasil ↔ madda_permissible / madda_obligatory: Quran.com colours munfasil as "permissible" in some places; Hafs via ash-Shatibiyyah reads it 4–5.',
  "madd_246 (cpfair: 'arid lis-sukun + leen) ↔ madda_permissible.",
];
const IGNORE = new Set(['end', 'custom-alef-maksora']);

/** Parse Quran.com tagged text → plain text + ranges. */
export function parseTagged(html: string): { text: string; ranges: { cls: string; start: number; end: number }[] } {
  let text = '';
  const ranges: { cls: string; start: number; end: number }[] = [];
  const re = /<(tajweed|span) class=["']?([a-z_-]+)["']?>(.*?)<\/\1>|<[^>]+>|([^<]+)/gsu;
  for (const m of html.matchAll(re)) {
    if (m[4] !== undefined) text += m[4];
    else if (m[2] !== undefined) {
      if (m[2] === 'end') continue; // ayah number
      const start = text.length;
      text += (m[3] ?? '').replace(/<[^>]+>/g, '');
      if (!IGNORE.has(m[2])) ranges.push({ cls: m[2], start, end: text.length });
    }
  }
  return { text: text.replace(/\s+$/u, ''), ranges };
}

/** Base-letter skeleton used only for aligning the two encodings. owner[i] = skeleton index of char i's base letter. */
const BASE_NORMAL: Record<string, string> = { 'ٱ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ى': 'ي', 'ی': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه', 'ک': 'ك' };
export function skeleton(t: string): { chars: string[]; owner: number[] } {
  const chars: string[] = [];
  const owner: number[] = [];
  for (const ch of t) {
    // eslint-disable-next-line no-misleading-character-class -- deliberately lists combining marks
    const isMark = /[\p{Mn}ـۥۦۧ]/u.test(ch) || /[ۖ-ۭ]/u.test(ch);
    if (!isMark) chars.push(BASE_NORMAL[ch] ?? ch);
    owner.push(Math.max(0, chars.length - 1));
  }
  return { chars, owner };
}

export interface AyahCompare {
  oursOnly: { rule: RuleName; start: number; end: number }[];
  qfOnly: { cls: string; at: number }[];
  confirmed: number;
  qfConfirmed: number;
  weak: boolean;
}

/** Compare our annotations for one ayah with Quran.com's tagged text. prefixEnd = start of the first word after Tanzil's basmala prefix (0 if none). */
export function compareAyah(ourText: string, ours: { rule: RuleName; start: number; end: number }[], qfTagged: string, prefixEnd: number): AyahCompare {
  const qf = parseTagged(qfTagged);
  const S1 = skeleton(ourText);
  const S2 = skeleton(qf.text);
  const firstBase = prefixEnd ? S1.owner[prefixEnd]! : 0;
  const mTail = lcsMap(S2.chars, S1.chars.slice(firstBase));
  const m = Int32Array.from(mTail, (x) => (x >= 0 ? x + firstBase : -1));
  const matched = [...m].filter((x) => x >= 0).length;
  const setOurs = (st: number, en: number) => new Set(S1.owner.slice(st, en));
  const setQf = (st: number, en: number) => new Set(S2.owner.slice(st, en).map((b) => m[b]!).filter((x) => x >= 0));
  const meets = (x: Set<number>, y: Set<number>, slack: number) => [...x].some((i) => y.has(i) || (slack > 0 && (y.has(i - 1) || y.has(i + 1))));
  const slackFor = (rule: RuleName) => (rule.startsWith('madd') ? 1 : 0);
  const O = ours.filter((o) => o.start >= prefixEnd).map((o) => ({ ...o, set: setOurs(o.start, o.end) }));
  const Q = qf.ranges.map((r) => ({ cls: r.cls, set: setQf(r.start, r.end) }));
  const out: AyahCompare = { oursOnly: [], qfOnly: [], confirmed: 0, qfConfirmed: 0, weak: matched < Math.min(S1.chars.length - firstBase, S2.chars.length) * 0.9 };
  for (const o of O) {
    if (Q.some((q) => (CLASS_MAP[q.cls] ?? []).includes(o.rule) && meets(q.set, o.set, slackFor(o.rule)))) out.confirmed++;
    else out.oursOnly.push({ rule: o.rule, start: o.start, end: o.end });
  }
  for (const q of Q) {
    if (O.some((o) => (CLASS_MAP[q.cls] ?? []).includes(o.rule) && meets(q.set, o.set, slackFor(o.rule)))) out.qfConfirmed++;
    else if (q.set.size) out.qfOnly.push({ cls: q.cls, at: S1.owner.indexOf(Math.min(...q.set)) });
  }
  return out;
}

// ---------- text cross-check (B3) ----------
/**
 * Documented normalisation for comparing two Uthmani encodings: NFC; drop pause marks, sajdah/rub signs and tatweel;
 * treat sukun U+0652 ≡ U+06E1 (Madani "head of khah" sukun); spaces normalised. Everything else is compared as-is, so
 * any remaining difference is a real letter/mark difference to investigate (never "fixed").
 */
export function normaliseForTextCompare(t: string): string {
  return t
    .normalize('NFC')
    .replace(/[ۖ-ۜ۞۩ـ]/gu, '')
    .replace(/ۡ/gu, 'ْ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface TextDiff {
  /** our character offset (in the normalised text) */
  at: number;
  ours: string; // our chars (may be empty = Quran.com has an extra char)
  theirs: string; // their chars (may be empty = we have an extra char)
}

/** Character-level differences between our (normalised) text and theirs; offsets refer to our normalised text. */
export function textDiff(ours: string, theirs: string): TextDiff[] {
  const a = [...ours];
  const b = [...theirs];
  const m = lcsMap(a, b);
  const out: TextDiff[] = [];
  let j = 0;
  let i = 0;
  while (i < a.length) {
    if (m[i]! >= 0) {
      if (m[i]! > j) out.push({ at: i, ours: '', theirs: b.slice(j, m[i]!).join('') });
      j = m[i]! + 1;
      i++;
      continue;
    }
    const s = i;
    while (i < a.length && m[i]! < 0) i++;
    const nextJ = i < a.length ? m[i]! : b.length;
    out.push({ at: s, ours: a.slice(s, i).join(''), theirs: b.slice(j, nextJ).join('') });
    j = nextJ;
  }
  if (j < b.length) out.push({ at: a.length, ours: '', theirs: b.slice(j).join('') });
  return out;
}

export const cpName = (s: string) => [...s].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ') || '∅';
