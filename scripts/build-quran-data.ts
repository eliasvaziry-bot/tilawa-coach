// Builds the shipped, per-surah Quran data from pinned sources (run scripts/fetch-sources.ts first).
//   text      : Tanzil Uthmani v1.1 with pause marks + sajdah signs, kept byte-for-byte (verbatim)
//   tajweed   : cpfair/quran-tajweed decision trees RE-RUN on the current Tanzil text (CC BY 4.0)
//   timings   : cpfair/quran-align Minshawi murattal + mujawwad (CC BY 4.0), remapped + sanitised
//   metadata  : Tanzil quran-data.xml (CC BY)
// Outputs: public/data/quran/index.json, public/data/quran/sNNN.json, data/derived/*.json (reports),
//          public/data/trans/<id>/sNNN.json (translations: build-time only, gitignored)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BASMALA_WORDS, PAUSE_MARKS, SAJDAH_SIGN, displayWords, hasBasmalaPrefix } from '../src/data/quranText.ts';
import { TF, remapSegments, sanitiseSegments, snapToPauses, type Repair } from '../src/data/sanitise.ts';
import { lcsMap, lcsMapFilled, subsequenceMap } from './lib/align.ts';
import { evaluateSync, summarise, type SyncEval } from '../src/data/syncMetrics.ts';
import { RULES, ANN_FLAGS, type RuleName } from '../src/data/rules.ts';

const ROOT = resolve(import.meta.dirname, '..');
const C = (p: string) => join(ROOT, '.cache', p);
const OUT = join(ROOT, 'public/data/quran');
const DERIVED = join(ROOT, 'data/derived');
mkdirSync(OUT, { recursive: true });
mkdirSync(DERIVED, { recursive: true });
mkdirSync(C('build'), { recursive: true });

const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const key = (s: number, a: number) => `${s}:${a}`;

// ---------- 1. texts ----------
function parseTanzil(path: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const p = line.split('|');
    if (p.length === 3) m.set(key(+p[0]!, +p[1]!), p[2]!.replace(/\r$/, ''));
  }
  return m;
}
const T = parseTanzil(C('tanzil/quran-uthmani.txt')); // shipped
const N = parseTanzil(C('tanzil/quran-uthmani-nomarks.txt'));
const O = parseTanzil(C('tanzil-2017/quran-uthmani.txt'));
if (T.size !== 6236 || N.size !== 6236 || O.size !== 6236) throw new Error(`ayah count mismatch ${T.size}/${N.size}/${O.size}`);
const shippedSha = sha256(readFileSync(C('tanzil/quran-uthmani.txt')));
// Tanzil terms: the copyright notice must be reproduced in every file derived from the text.
const TANZIL_NOTICE = readFileSync(C('tanzil/quran-uthmani.txt'), 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('#'))
  .map((l) => l.replace(/^#\s?/, ''))
  .join('\n')
  .trim();
const committedPath = join(ROOT, 'data/source/tanzil/quran-uthmani.txt');
if (!existsSync(committedPath) || sha256(readFileSync(committedPath)) !== shippedSha)
  throw new Error('data/source/tanzil/quran-uthmani.txt is missing or differs from the pinned download: run fetch-sources');

const NT = new Map<string, Int32Array>(); // char map nomarks → shipped
for (const [k, n] of N) {
  const m = subsequenceMap(n, T.get(k)!);
  if (!m) throw new Error(`nomarks text is not a subsequence of shipped text at ${k}`);
  NT.set(k, m);
}

// ---------- 2. classifier runs ----------
type Ann = { rule: string; start: number; end: number };
type AyahAnn = { surah: number; ayah: number; annotations: Ann[] };
function classify(inputRel: string): AyahAnn[] {
  const input = C(inputRel);
  const cache = C(`build/tajweed-${sha256(readFileSync(input)).slice(0, 16)}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')) as AyahAnn[];
  const vendor = C('vendor/quran-tajweed');
  // The classifier globs output/rule_trees/*.json but the repo keeps trees in rule_trees/: copy, don't edit code.
  mkdirSync(join(vendor, 'output/rule_trees'), { recursive: true });
  for (const f of readdirSync(join(vendor, 'rule_trees'))) cpSync(join(vendor, 'rule_trees', f), join(vendor, 'output/rule_trees', f));
  const out = execFileSync('python3', ['tajweed_classifier.py'], { cwd: vendor, input: readFileSync(input), maxBuffer: 1 << 28 });
  writeFileSync(cache, out);
  return JSON.parse(out.toString('utf8')) as AyahAnn[];
}
const annT = classify('tanzil/quran-uthmani.txt');
const annN = classify('tanzil/quran-uthmani-nomarks.txt');
const ann2017 = JSON.parse(readFileSync(C('vendor/quran-tajweed/output/tajweed.hafs.uthmani-pause-sajdah.json'), 'utf8')) as AyahAnn[];

// ---------- 3. merge annotation sources ----------
const ruleIndex = new Map<string, number>(RULES.map((r, i) => [r.id, i]));
const tripleKey = (r: string, s: number, e: number) => `${r}|${s}|${e}`;
const mapRange = (m: Int32Array, s: number, e: number): [number, number] | null => {
  const a = m[s];
  const b = m[e - 1];
  if (a === undefined || b === undefined || a < 0 || b < 0) return null;
  return [a, b + 1];
};
const PM = new Set([...Object.keys(PAUSE_MARKS), SAJDAH_SIGN]);
const stats = { primary: 0, waslOnly: 0, waslOnlyNotNearMark: 0, from2017: 0, from2017ViaSubstitution: 0, rebuildOnly: 0, marksOnly: 0, waqfOnlyAdded: 0, unmapped2017: 0 };
const ayahAnn = new Map<string, [number, number, number, number][]>();
const marksOnlyExamples: string[] = [];

const byKey = (arr: AyahAnn[]) => new Map(arr.map((x) => [key(x.surah, x.ayah), x.annotations]));
const AT = byKey(annT);
const AN = byKey(annN);
const A17 = byKey(ann2017);

for (const k of T.keys()) {
  const t = T.get(k)!;
  const nt = NT.get(k)!;
  // O → N char map (identity when equal), then N → T
  const o = O.get(k)!;
  const n = N.get(k)!;
  const onm = o === n ? null : lcsMapFilled([...o], [...n]);
  const on = onm ? onm.map : null;
  const setT = new Set((AT.get(k) ?? []).map((a) => tripleKey(a.rule, a.start, a.end)));
  const mappedN = new Map<string, [string, number, number]>();
  for (const a of AN.get(k) ?? []) {
    const r = mapRange(nt, a.start, a.end);
    if (r) mappedN.set(tripleKey(a.rule, r[0], r[1]), [a.rule, r[0], r[1]]);
  }
  const mapped17 = new Map<string, [string, number, number]>();
  const viaSub = new Set<string>();
  for (const a of A17.get(k) ?? []) {
    let s = a.start;
    let e = a.end;
    if (on) {
      const r = mapRange(on, s, e);
      if (!r) {
        stats.unmapped2017++;
        continue;
      }
      [s, e] = r;
    }
    const r2 = mapRange(nt, s, e);
    if (!r2) {
      stats.unmapped2017++;
      continue;
    }
    mapped17.set(tripleKey(a.rule, r2[0], r2[1]), [a.rule, r2[0], r2[1]]);
    if (onm && (onm.filled[a.start] || onm.filled[a.end - 1])) viaSub.add(tripleKey(a.rule, r2[0], r2[1]));
  }
  const out: [number, number, number, number][] = [];
  for (const [kk, [rule, s, e]] of mappedN) {
    let f = 0;
    if (!setT.has(kk)) {
      f |= ANN_FLAGS.WASL_ONLY;
      stats.waslOnly++;
      const near = t.slice(Math.max(0, s - 3), Math.min(t.length, e + 4));
      if (![...near].some((ch) => PM.has(ch))) stats.waslOnlyNotNearMark++;
    }
    if (!mapped17.has(kk)) {
      f |= ANN_FLAGS.REBUILD_ONLY;
      stats.rebuildOnly++;
    }
    stats.primary++;
    out.push([ruleIndex.get(rule)!, s, e, f]);
  }
  for (const [kk, [rule, s, e]] of mapped17) {
    if (mappedN.has(kk)) continue;
    stats.from2017++;
    if (viaSub.has(kk)) stats.from2017ViaSubstitution++;
    out.push([ruleIndex.get(rule)!, s, e, ANN_FLAGS.FROM_2017]);
  }
  for (const a of AT.get(k) ?? []) {
    if (mappedN.has(tripleKey(a.rule, a.start, a.end))) continue;
    stats.marksOnly++;
    if (marksOnlyExamples.length < 40) marksOnlyExamples.push(`${k} ${a.rule} [${a.start},${a.end}) «${t.slice(a.start, a.end)}»`);
    // Not shipped: rules found only with the pause mark present are artefacts of running the trees on marked text.
    // (An earlier "waqf-only" idea was wrong: e.g. the shadda on نَّحْنُ in 20:132 exists only when joining.)
  }
  out.sort((x, y) => x[1] - y[1] || x[2] - y[2] || x[0] - y[0]);
  ayahAnn.set(k, out);
}

// The classifier skips the basmala Tanzil prefixes to ayah 1 (surahs 2–114 except 9). Its text is 1:1, so copy 1:1's
// annotations onto the prefix through a character alignment (95:1 and 97:1 write بِّسْمِ with an extra shadda).
let basmalaCopied = 0;
{
  const fatiha1 = T.get('1:1')!;
  const ann11 = ayahAnn.get('1:1')!;
  for (let s = 2; s <= 114; s++) {
    if (s === 9) continue;
    const k = key(s, 1);
    const t = T.get(k)!;
    const prefixEnd = t.split(' ').slice(0, BASMALA_WORDS).join(' ').length;
    const m = lcsMapFilled([...fatiha1], [...t.slice(0, prefixEnd)]).map;
    const extra: [number, number, number, number][] = [];
    for (const [ri, st, en, f] of ann11) {
      const a = m[st];
      const b = m[en - 1];
      if (a === undefined || b === undefined || a < 0 || b < 0) continue;
      extra.push([ri, a, b + 1, f]);
    }
    basmalaCopied += extra.length;
    ayahAnn.set(k, [...extra, ...ayahAnn.get(k)!]);
  }
}

// ---------- 3b. two-source disputes (scripts/qf-crosscheck.ts writes our own summary; never QF data) ----------
let disputedFlagged = 0;
{
  const f = join(ROOT, 'data/derived/tajweed-disputes.json');
  if (existsSync(f)) {
    const d = JSON.parse(readFileSync(f, 'utf8')) as { disputes: [number, number, number, string, string, number, number][] };
    for (const [s, a, , rule, side, st, en] of d.disputes) {
      if (side !== 'ours-only') continue;
      const ri = ruleIndex.get(rule);
      const list = ayahAnn.get(key(s, a));
      const hit = list?.find((x) => x[0] === ri && x[1] === st && x[2] === en);
      if (hit) {
        hit[3] |= ANN_FLAGS.DISPUTED;
        disputedFlagged++;
      }
    }
  }
}

// ---------- 3c. independent rule engine disagreements (scripts/engine-compare.ts; our own code, D-012) ----------
let engineFlagged = 0;
{
  const f = join(ROOT, 'data/derived/engine-compare.json');
  if (existsSync(f)) {
    const d = JSON.parse(readFileSync(f, 'utf8')) as { disputes: [number, number, string, string, number, number][] };
    for (const [s, a, side, rule, st, en] of d.disputes) {
      if (side !== 'cpfair-only') continue;
      const ri = ruleIndex.get(rule);
      const hit = ayahAnn.get(key(s, a))?.find((x) => x[0] === ri && x[1] === st && x[2] === en);
      if (hit) {
        hit[3] |= ANN_FLAGS.ENGINE_DISPUTED;
        engineFlagged++;
      }
    }
  }
}

// ---------- 4. plausibility checks (B5: ranges must contain plausible letters) ----------
// Character classes below deliberately list combining marks (tanween, small meem, maddah…) on their own.
/* eslint-disable no-misleading-character-class */
const expect: Partial<Record<RuleName, RegExp>> = {
  qalqalah: /[قطبجد]/u,
  ghunnah: /[نم]/u,
  iqlab: /[نًٌٍۭۢ]/u,
  ikhfa: /[نًٌٍۭۢۨ]/u,
  idghaam_ghunnah: /[نًٌٍيمو]/u,
  idghaam_no_ghunnah: /[نًٌٍلر]/u,
  idghaam_shafawi: /م/u,
  ikhfa_shafawi: /م/u,
  lam_shamsiyyah: /ل/u,
  hamzat_wasl: /ٱ/u,
  madd_2: /[اويىٰۥۦۧٓ]/u,
  madd_246: /[اويىٰۥۦٓ]/u,
  madd_6: /[اويىٰۥۦٓ]/u,
  madd_muttasil: /[اويىٰۥۦٓ]/u,
  madd_munfasil: /[اويىٰۥۦٓ]/u,
};
/* eslint-enable no-misleading-character-class */
const implausible: string[] = [];
const ruleCounts: Record<string, number> = {};
for (const [k, anns] of ayahAnn) {
  const t = T.get(k)!;
  for (const [ri, s, e] of anns) {
    const rule = RULES[ri]!.id;
    ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1;
    const re = expect[rule];
    // look one letter either side: several rules span the boundary letter (e.g. idgham → next letter)
    if (re && !re.test(t.slice(Math.max(0, s - 1), Math.min(t.length, e + 1)))) implausible.push(`${k} ${rule} [${s},${e}) «${t.slice(s, e)}»`);
  }
}

// ---------- 5. timings ----------
const letterCount = (w: string) => [...w].filter((ch) => !/\p{Mn}/u.test(ch) || ch === 'ٰ').filter((ch) => ch !== 'ـ').length;
const wordsOf = (txt: string, s: number, a: number) => {
  const w = txt.split(' ');
  return hasBasmalaPrefix(s, a) ? w.slice(BASMALA_WORDS) : w;
};
interface QaEntry { surah: number; ayah: number; segments?: [number, number, number, number][] }
const overrides = JSON.parse(readFileSync(join(ROOT, 'data/source/quran-align-overrides.json'), 'utf8')) as Record<
  string,
  Record<string, { qaToWord: number[]; reason: string; evidence: string }>
>;
type TimingOut = { words: number[]; timeline?: number[]; measured?: boolean };
const timing: Record<string, Map<string, TimingOut>> = {};
const timingReport: Record<string, unknown> = {};
for (const rec of ['Minshawy_Murattal_128kbps', 'Minshawy_Mujawwad_192kbps']) {
  const qa = JSON.parse(readFileSync(C(`quran-align-data/${rec}.json`), 'utf8')) as QaEntry[];
  const repairsAll: { ayah: string; repairs: Repair[] }[] = [];
  const counts: Record<string, number> = {};
  const autoExpansions: string[] = [];
  let ayatWithRepairs = 0;
  let wordsTotal = 0;
  let wordsInterpolated = 0;
  let wordsSplit = 0;
  const res = new Map<string, TimingOut>();
  const pauseFile = join(ROOT, `data/derived/pauses/${rec}.json`);
  const pauses = existsSync(pauseFile) ? (JSON.parse(readFileSync(pauseFile, 'utf8')) as { ayat: Record<string, { d: number; p: [number, number][] }> }).ayat : {};
  let snappedAyat = 0;
  let snappedWords = 0;
  const evBefore: SyncEval[] = [];
  const evAfter: SyncEval[] = [];
  for (const e of qa) {
    const k = key(e.surah, e.ayah);
    const nWords = wordsOf(N.get(k)!, e.surah, e.ayah);
    const oWords = wordsOf(O.get(k)!, e.surah, e.ayah);
    wordsTotal += nWords.length;
    // quran-align indexes the 2016/17 Tanzil word list (O). Map O-word → N-word(s) by word-level LCS.
    const om = lcsMap(oWords, nWords);
    const oToN: number[][] = oWords.map((_, i) => (om[i]! >= 0 ? [om[i]!] : []));
    for (let i = 0; i < oWords.length; i++) {
      if (oToN[i]!.length) continue;
      let pi = i - 1;
      while (pi >= 0 && om[pi]! < 0) pi--;
      let ni = i + 1;
      while (ni < oWords.length && om[ni]! < 0) ni++;
      const lo = pi >= 0 ? om[pi]! + 1 : 0;
      const hi = ni < oWords.length ? om[ni]! : nWords.length;
      const gapO = (ni < oWords.length ? ni : oWords.length) - (pi + 1);
      const gapN = hi - lo;
      if (gapO === gapN) oToN[i] = [lo + (i - pi - 1)];
      else oToN[i] = Array.from({ length: Math.max(0, gapN) }, (_, z) => lo + z);
    }
    let qaToWord: (q: number) => number[] | undefined = (q) => oToN[q];
    const segs = e.segments ?? [];
    const qaMax = segs.length ? Math.max(...segs.map((s) => s[1])) : 0;
    const ov = overrides[rec]?.[k];
    if (ov) {
      qaToWord = (q) => (ov.qaToWord[q] !== undefined && ov.qaToWord[q]! >= 0 ? (oToN[ov.qaToWord[q]!] ?? undefined) : undefined);
    } else if (qaMax > oWords.length) {
      // the recogniser expanded a muqatta'at word into letters (README: "ا ل م instead of الم") — assume word 0
      const extra = qaMax - oWords.length;
      autoExpansions.push(`${k}: qa max ${qaMax} > ${oWords.length} words; assumed word 0 expanded by ${extra} (needs audio evidence)`);
      qaToWord = (q) => (q <= extra ? oToN[0] : oToN[q - extra]);
    }
    const remapped = remapSegments(segs, qaToWord);
    const pz = pauses[k];
    const r = sanitiseSegments(remapped.segs, nWords.map(letterCount), pz?.d);
    if (pz) {
      // marks after each recited word (display words minus the basmala prefix); the ayah end counts as a mark
      const dw = displayWords(T.get(k)!).slice(hasBasmalaPrefix(e.surah, e.ayah) ? BASMALA_WORDS : 0);
      const markAfter = dw.map((w, i) => w.marksAfter.length > 0 || i === dw.length - 1);
      // long pauses anywhere; short ones (sakt is brief) only where a word with a mark ends nearby
      const markedEnds = r.words.filter((_, i) => markAfter[i] && i < r.words.length - 1).map((w) => w.e);
      const pzs = pz.p
        .map(([ps, pe]) => ({ s: ps, e: pe }))
        .filter((q) => q.e - q.s >= 220 || markedEnds.some((e0) => Math.abs(e0 - q.s) < 400 || Math.abs(e0 - q.e) < 400));
      const snapped = snapToPauses(r.words, pzs, nWords.map(letterCount), markAfter, pz.d);
      evBefore.push(evaluateSync(r.words, pzs, pz.d));
      evAfter.push(evaluateSync(snapped.words, pzs, pz.d));
      if (snapped.moved) {
        snappedAyat++;
        snappedWords += snapped.moved;
      }
      r.words = snapped.words;
    }
    const repairs = [...remapped.repairs.filter((x) => x.detail.indexOf('merged') >= 0 || ov || qaMax > oWords.length || x.kind !== 'remapped'), ...r.repairs];
    const remappedAny = remapped.repairs.some((x) => x.kind === 'remapped');
    if (remappedAny) r.words.forEach((w) => (w.f |= TF.REMAPPED));
    for (const rp of repairs) counts[rp.kind] = (counts[rp.kind] ?? 0) + 1;
    if (repairs.length) {
      ayatWithRepairs++;
      repairsAll.push({ ayah: k, repairs });
    }
    wordsInterpolated += r.words.filter((w) => w.f & TF.INTERPOLATED).length;
    wordsSplit += r.words.filter((w) => w.f & TF.SPLIT).length;
    const out: TimingOut = { words: r.words.flatMap((w) => [w.s, w.e, w.f]), measured: !!pz };
    if (r.repeats) out.timeline = r.timeline.flatMap((t) => t);
    if (r.words.length !== nWords.length) throw new Error(`timing count mismatch ${rec} ${k}`);
    res.set(k, out);
  }
  if (res.size !== 6236) throw new Error(`${rec}: ${res.size} ayat`);
  timing[rec] = res;
  timingReport[rec] = {
    ayat: res.size,
    words: wordsTotal,
    ayatWithRepairs,
    repairsByKind: counts,
    wordsInterpolated,
    wordsSplit,
    pctWordsDirectlyTimed: +(((wordsTotal - wordsInterpolated - wordsSplit) / wordsTotal) * 100).toFixed(2),
    autoExpansions,
    overridesApplied: Object.keys(overrides[rec] ?? {}),
    pauseData: { ayatWithMeasuredPauses: Object.keys(pauses).length, ayatSnapped: snappedAyat, boundariesSnapped: snappedWords },
    syncVsMeasuredPauses: { beforeSnapping: summarise(evBefore), afterSnapping: summarise(evAfter) },
  };
  writeFileSync(join(DERIVED, `timing-repairs.${rec}.json`), JSON.stringify(repairsAll, null, 0).replace(/\},\{"ayah"/g, '},\n{"ayah"') + '\n');
}

// ---------- 6. metadata ----------
const xml = readFileSync(C('tanzil-meta/quran-data.xml'), 'utf8');
const attrs = (tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag} ([^>]*)/>`, 'g'))].map((m) => Object.fromEntries([...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]])));
const suras = attrs('sura');
const juz = attrs('juz').map((j) => [+j.sura!, +j.aya!]);
const pages = attrs('page').map((p) => [+p.sura!, +p.aya!]);
const sajdas = attrs('sajda').map((s) => ({ s: +s.sura!, a: +s.aya!, type: s.type }));
if (suras.length !== 114 || juz.length !== 30) throw new Error('metadata parse failed');

// ---------- 7. write per-surah files ----------
const index: Record<string, unknown>[] = [];
for (let s = 1; s <= 114; s++) {
  const meta = suras[s - 1]!;
  const ayas = +meta.ayas!;
  const ayat = [];
  for (let a = 1; a <= ayas; a++) {
    const k = key(s, a);
    const t = T.get(k)!;
    const words = displayWords(t);
    const bsm = hasBasmalaPrefix(s, a) ? BASMALA_WORDS : 0;
    const nWords = words.length - bsm;
    const mm = timing.Minshawy_Murattal_128kbps!.get(k)!;
    const mj = timing.Minshawy_Mujawwad_192kbps!.get(k)!;
    if (mm.words.length / 3 !== nWords || mj.words.length / 3 !== nWords) throw new Error(`word/timing mismatch at ${k}`);
    const entry: Record<string, unknown> = { t, tj: ayahAnn.get(k)!.flat(), mm: mm.words, mj: mj.words };
    if (bsm) entry.b = bsm;
    if (mm.measured) entry.mp = 1; // murattal boundaries already checked against measured pauses
    if (mj.measured) entry.jp = 1;
    if (mm.timeline) entry.mmT = mm.timeline;
    if (mj.timeline) entry.mjT = mj.timeline;
    ayat.push(entry);
  }
  const body = JSON.stringify({ v: 1, s, copyright: TANZIL_NOTICE, ayat });
  const file = `s${String(s).padStart(3, '0')}.json`;
  writeFileSync(join(OUT, file), body);
  index.push({
    n: s,
    name: meta.name,
    tname: meta.tname,
    ename: meta.ename,
    type: meta.type,
    order: +meta.order!,
    ayas,
    file,
    bytes: Buffer.byteLength(body),
    sha256: sha256(body),
  });
}
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify(
    {
      v: 1,
      text: { source: 'Tanzil Quran Text (Uthmani, Version 1.1)', sha256: shippedSha, options: 'marks=true, sajdah=true (pause marks + sajdah signs), txt-2' },
      copyright: TANZIL_NOTICE,
      metadataCopyright: 'Tanzil Quran metadata (C) 2008-2009 Tanzil.info, licence cc-by, https://tanzil.net',
      rules: RULES.map((r) => r.id),
      annFlags: ANN_FLAGS,
      timingFlags: TF,
      surahs: index,
      juz,
      pages,
      sajdas,
    },
    null,
    1,
  ),
);

// ---------- 8. translations: scripts/build-translations.ts (build-time only; gitignored output) ----------
execFileSync(process.execPath, [join(ROOT, 'scripts/build-translations.ts')], { stdio: 'inherit' });

// ---------- 9. report ----------
const sakt = [...T].filter(([, t]) => / ۜ( |$)/u.test(t)).map(([k]) => k);
const report = {
  generated: new Date().toISOString().slice(0, 10),
  text: { ayat: T.size, sha256: shippedSha, ayatDifferingFrom2017: [...O].filter(([k, o]) => o !== N.get(k)).length, saktMarkTokens: sakt },
  annotations: { ruleCounts, ...stats, basmalaCopied, disputedFlagged, engineFlagged, implausibleCount: implausible.length, implausible: implausible.slice(0, 200), marksOnlyExamples },
  timings: timingReport,
};
writeFileSync(join(DERIVED, 'build-report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ ruleCounts, stats, implausible: implausible.length, timings: timingReport, sakt }, null, 1));
