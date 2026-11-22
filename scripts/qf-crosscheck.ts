// Two-source cross-check (BRIEF B3/B5), run TRANSIENTLY (in memory only; never written to disk or committed):
//  1. tajweed: our rebuilt cpfair annotations vs Quran.com's uthmani_tajweed markup → data/derived/tajweed-disputes.json
//  2. text: Tanzil Uthmani vs Quran.com's text_uthmani, letter by letter after a documented normalisation
//     → data/derived/text-crosscheck.json (our own summary: offsets into OUR text + codepoint names, no QF text)
// Runs in .github/workflows/qf-crosscheck.yml only when the shipped text/annotations change (never on every push).
// Usage: node scripts/qf-crosscheck.ts [--surahs 1-114]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RULES, type RuleName } from '../src/data/rules.ts';
import { BASMALA_WORDS, displayWords, hasBasmalaPrefix } from '../src/data/quranText.ts';
import { AMBIGUOUS, CLASS_MAP, compareAyah, cpName, normaliseForTextCompare, textDiff } from '../src/data/crosscheck.ts';

const ROOT = resolve(import.meta.dirname, '..');
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const [from, to] = arg('surahs', '1-114').split('-').map(Number) as [number, number];
const UA = { 'User-Agent': 'tilawa-coach-crosscheck/0.1 (personal non-commercial study app)' };

async function getVerses<T>(path: string): Promise<T[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.quran.com/api/v4/${path}`, { headers: UA });
    if (r.ok) return ((await r.json()) as { verses: T[] }).verses;
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error(`${path}: failed`);
}

const index = JSON.parse(readFileSync(join(ROOT, 'public/data/quran/index.json'), 'utf8')) as { surahs: { file: string }[] };
const disputes: [number, number, number, string, string, number, number][] = [];
const oursByRule: Record<string, { confirmed: number; oursOnly: number }> = {};
const qfByClass: Record<string, { confirmed: number; qfOnly: number }> = {};
let compared = 0;
let weak = 0;
const textDiffs: [number, number, number, string, string][] = []; // surah, ayah, word, ours (codepoints), theirs
const diffKinds: Record<string, number> = {};
let textAyat = 0;
let textIdentical = 0;

for (let s = from; s <= to; s++) {
  const ours = JSON.parse(readFileSync(join(ROOT, 'public/data/quran', index.surahs[s - 1]!.file), 'utf8')) as { ayat: { t: string; tj: number[] }[] };
  const tajweed = await getVerses<{ verse_key: string; text_uthmani_tajweed: string }>(`quran/verses/uthmani_tajweed?chapter_number=${s}`);
  await new Promise((res) => setTimeout(res, 700));
  const plain = await getVerses<{ verse_key: string; text_uthmani: string }>(`quran/verses/uthmani?chapter_number=${s}`);
  await new Promise((res) => setTimeout(res, 700)); // polite: well under 2 requests per second
  const plainBy = new Map(plain.map((v) => [v.verse_key, v.text_uthmani]));
  for (const v of tajweed) {
    const a = Number(v.verse_key.split(':')[1]);
    const our = ours.ayat[a - 1];
    if (!our) continue;
    const words = displayWords(our.t);
    const prefixEnd = hasBasmalaPrefix(s, a) ? words[BASMALA_WORDS]!.start : 0;
    const wordOf = (off: number) => Math.max(0, words.findIndex((w) => off >= w.start && off < w.end));
    const ann: { rule: RuleName; start: number; end: number }[] = [];
    for (let k = 0; k < our.tj.length; k += 4) ann.push({ rule: RULES[our.tj[k]!]!.id, start: our.tj[k + 1]!, end: our.tj[k + 2]! });
    const c = compareAyah(our.t, ann, v.text_uthmani_tajweed, prefixEnd);
    compared++;
    if (c.weak) weak++;
    for (const o of ann.filter((x) => x.start >= prefixEnd)) {
      const st = (oursByRule[o.rule] ??= { confirmed: 0, oursOnly: 0 });
      if (c.oursOnly.some((x) => x.rule === o.rule && x.start === o.start && x.end === o.end)) {
        st.oursOnly++;
        disputes.push([s, a, wordOf(o.start), o.rule, 'ours-only', o.start, o.end]);
      } else st.confirmed++;
    }
    for (const q of c.qfOnly) {
      (qfByClass[q.cls] ??= { confirmed: 0, qfOnly: 0 }).qfOnly++;
      disputes.push([s, a, wordOf(Math.max(0, q.at)), q.cls, 'quran.com-only', Math.max(0, q.at), Math.max(0, q.at) + 1]);
    }
    // text: letter-level differences after the documented normalisation (investigated, never "fixed")
    const theirs = plainBy.get(v.verse_key);
    if (theirs !== undefined) {
      textAyat++;
      const oursText = normaliseForTextCompare(our.t.slice(prefixEnd));
      const diffs = textDiff(oursText, normaliseForTextCompare(theirs));
      if (!diffs.length) textIdentical++;
      const oursWords = oursText.split(' ');
      for (const d of diffs) {
        const kind = `${cpName(d.ours)} → ${cpName(d.theirs)}`;
        diffKinds[kind] = (diffKinds[kind] ?? 0) + 1;
        let acc = 0;
        let wi = 0;
        for (; wi < oursWords.length; wi++) {
          if (d.at < acc + oursWords[wi]!.length + 1) break;
          acc += oursWords[wi]!.length + 1;
        }
        textDiffs.push([s, a, wi, cpName(d.ours), cpName(d.theirs)]);
      }
    }
  }
}

writeFileSync(
  join(ROOT, 'data/derived/tajweed-disputes.json'),
  JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    note: 'Our own summary only. Locations are offsets into OUR shipped Tanzil text; no Quran.com text or markup is stored. Independence of the two sources is NOT established (DECISIONS D-012).',
    classMap: CLASS_MAP,
    ambiguous: AMBIGUOUS,
    ayatCompared: compared,
    ayatWithWeakAlignment: weak,
    oursByRule,
    quranComByClass: qfByClass,
    disputeCount: disputes.length,
    disputes,
  }).replace(/\],\[/g, '],\n[') + '\n',
);
const kinds = Object.entries(diffKinds).sort((a, b) => b[1] - a[1]);
writeFileSync(
  join(ROOT, 'data/derived/text-crosscheck.json'),
  JSON.stringify(
    {
      generated: new Date().toISOString().slice(0, 10),
      normalisation: 'NFC; drop pause marks (U+06D6–U+06DC), rub-el-hizb (U+06DE), sajdah (U+06E9) and tatweel (U+0640); sukun U+0652 ≡ U+06E1; whitespace collapsed; Tanzil basmala prefix excluded. Nothing else is equated.',
      ayatCompared: textAyat,
      ayatIdenticalAfterNormalisation: textIdentical,
      differences: textDiffs.length,
      kinds: Object.fromEntries(kinds),
      first200: textDiffs.slice(0, 200),
    },
    null,
    1,
  ) + '\n',
);
console.log(JSON.stringify({ tajweed: { compared, weak, disputes: disputes.length }, text: { textAyat, textIdentical, differences: textDiffs.length, topKinds: kinds.slice(0, 12) } }, null, 1));
