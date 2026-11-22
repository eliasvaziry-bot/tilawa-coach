// M1 sync check: are the word timings in sync with the audio? (BRIEF B14 M1 DoD, ~100 ms)
// We cannot listen, so we measure: every real silence inside an EveryAyah ayah file should sit on a word boundary,
// and no word should be "sounding" across the middle of a silence. Audio is cached in .cache/ only (never committed);
// only the derived numbers are written to data/derived/sync-check.json.
// Usage: node scripts/sync-check.ts [--voice murattal|mujawwad] [--random 40] [--ayat 1:1,10:1]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeTo16kWav, readWav } from './lib/wav.ts';
import { findSilences, frameDb, type Silence } from '../src/audio/dsp/energy.ts';

const ROOT = resolve(import.meta.dirname, '..');
const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const voice = arg('voice', 'murattal');
const folder = voice === 'mujawwad' ? 'Minshawy_Mujawwad_192kbps' : 'Minshawy_Murattal_128kbps';
const field = voice === 'mujawwad' ? 'mj' : 'mm';
const AUDIO = join(ROOT, '.cache/audio', folder);
mkdirSync(AUDIO, { recursive: true });
const pad3 = (n: number) => String(n).padStart(3, '0');

const index = JSON.parse(readFileSync(join(ROOT, 'public/data/quran/index.json'), 'utf8')) as { surahs: { n: number; ayas: number; file: string }[] };
const surahCache = new Map<number, { ayat: { t: string; mm: number[]; mj: number[]; b?: number }[] }>();
const surah = (n: number) => {
  if (!surahCache.has(n)) surahCache.set(n, JSON.parse(readFileSync(join(ROOT, 'public/data/quran', index.surahs[n - 1]!.file), 'utf8')));
  return surahCache.get(n)!;
};

// --- choose ayat: Al-Fatiha, three short surahs of Juz Amma, the muqatta'at edge cases, plus a seeded random sample
const chosen: [number, number][] = [];
const add = (s: number, a: number) => {
  if (!chosen.some(([x, y]) => x === s && y === a)) chosen.push([s, a]);
};
const explicit = arg('ayat', '');
if (explicit) for (const k of explicit.split(',')) add(Number(k.split(':')[0]), Number(k.split(':')[1]));
else {
  for (let a = 1; a <= 7; a++) add(1, a);
  for (const s of [112, 113, 114, 108, 103]) for (let a = 1; a <= index.surahs[s - 1]!.ayas; a++) add(s, a);
  for (const k of ['10:1', '14:1', '15:1', '13:1', '2:1', '2:255', '18:1', '36:52', '75:27', '83:14']) add(Number(k.split(':')[0]), Number(k.split(':')[1]));
  let seed = 20261121;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const total = Number(arg('random', '40'));
  while (chosen.length < 7 + 3 + 5 + 3 + 6 + 10 + total) {
    const s = 1 + Math.floor(rnd() * 114);
    const ayas = index.surahs[s - 1]!.ayas;
    const a = 1 + Math.floor(rnd() * ayas);
    // keep downloads modest: skip very long ayat
    if (surah(s).ayat[a - 1]!.t.split(' ').length <= 40) add(s, a);
  }
}

async function fetchAudio(s: number, a: number): Promise<string> {
  const p = join(AUDIO, `${pad3(s)}${pad3(a)}.mp3`);
  if (existsSync(p)) return p;
  const r = await fetch(`https://everyayah.com/data/${folder}/${pad3(s)}${pad3(a)}.mp3`, { headers: { 'User-Agent': 'tilawa-coach-build/0.1 (personal study app; sync check)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${s}:${a}`);
  writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  await new Promise((res) => setTimeout(res, 150)); // polite pacing
  return p;
}

interface WordT {
  s: number;
  e: number;
}
export function evaluate(words: WordT[], sil: Silence[], durMs: number) {
  const inner = sil.filter((x) => x.startMs > 120 && x.endMs < durMs - 120);
  const errors: number[] = [];
  let spans = 0;
  const fails: string[] = [];
  for (const x of inner) {
    const mid = (x.startMs + x.endMs) / 2;
    const covering = words.find((w) => w.s < mid - 60 && w.e > mid + 60);
    if (covering) spans++;
    // distance from the silence to the nearest word boundary (0 if a boundary falls inside the silence)
    let best = Infinity;
    for (let i = 0; i < words.length; i++) {
      for (const b of [words[i]!.e, words[i]!.s]) {
        const d = b >= x.startMs && b <= x.endMs ? 0 : Math.min(Math.abs(b - x.startMs), Math.abs(b - x.endMs));
        best = Math.min(best, d);
      }
    }
    errors.push(best);
    if (best > 100 || covering) fails.push(`silence ${x.startMs}-${x.endMs}ms: nearest boundary ${best === Infinity ? '∞' : best}ms${covering ? ', a word spans it' : ''}`);
  }
  const lead = sil.find((x) => x.startMs <= 30);
  const leadErr = lead && words[0] ? Math.max(0, lead.endMs - 100 - words[0].s) : 0;
  return { inner: inner.length, errors, spans, fails, leadErr };
}

const results: Record<string, unknown>[] = [];
const allErr: number[] = [];
let silencesTotal = 0;
let silencesOk = 0;
let spansTotal = 0;
for (const [s, a] of chosen) {
  let mp3: string;
  try {
    mp3 = await fetchAudio(s, a);
  } catch (e) {
    results.push({ ayah: `${s}:${a}`, error: String(e) });
    continue;
  }
  const wav = mp3.replace(/\.mp3$/, '.16k.wav');
  decodeTo16kWav(mp3, wav);
  const { sr, x } = readWav(wav);
  const durMs = Math.round((x.length / sr) * 1000);
  const db = frameDb(x, sr, 10, 20);
  const { silences, thresholdDb } = findSilences(db, 10, 150);
  const raw = surah(s).ayat[a - 1]!;
  const arr = raw[field as 'mm' | 'mj'];
  const words: WordT[] = [];
  for (let i = 0; i + 2 < arr.length; i += 3) words.push({ s: arr[i]!, e: arr[i + 1]! });
  const ev = evaluate(words, silences, durMs);
  silencesTotal += ev.inner;
  silencesOk += ev.errors.filter((e) => e <= 100).length;
  spansTotal += ev.spans;
  allErr.push(...ev.errors);
  results.push({ ayah: `${s}:${a}`, durMs, words: words.length, lastWordEnd: words.at(-1)?.e ?? 0, innerSilences: ev.inner, maxErrMs: ev.errors.length ? Math.max(...ev.errors) : 0, wordsSpanningSilence: ev.spans, leadingErrMs: ev.leadErr, thresholdDb: +thresholdDb.toFixed(1), fails: ev.fails });
}
allErr.sort((x, y) => x - y);
const q = (p: number) => (allErr.length ? allErr[Math.min(allErr.length - 1, Math.floor(p * allErr.length))]! : 0);
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  voice,
  method: 'EveryAyah audio decoded to 16 kHz; 10 ms RMS frames; silence = ≥150 ms below max(noise floor + 10 dB, loud − 38 dB). Each inner silence must have a word boundary within 100 ms and no word may span its middle.',
  ayatChecked: results.filter((r) => !r.error).length,
  innerSilences: silencesTotal,
  silencesWithBoundaryWithin100ms: silencesOk,
  pct: silencesTotal ? +((silencesOk / silencesTotal) * 100).toFixed(1) : null,
  medianBoundaryErrMs: q(0.5),
  p90BoundaryErrMs: q(0.9),
  wordsSpanningASilence: spansTotal,
  ayatWithLastWordEndingAfterAudio: results.filter((r) => typeof r.lastWordEnd === 'number' && (r.lastWordEnd as number) > (r.durMs as number) + 50).map((r) => r.ayah),
};
writeFileSync(join(ROOT, `data/derived/sync-check.${voice}.json`), JSON.stringify({ summary, results }, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
for (const r of results) if ((r.fails as string[] | undefined)?.length) console.log(r.ayah, (r.fails as string[]).join(' | '));
