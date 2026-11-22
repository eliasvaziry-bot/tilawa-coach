// Derived audio data from EveryAyah Minshawi files (audio stays in .cache/, never committed):
//   pauses (≥ 220 ms silences) + duration per ayah  → data/derived/pauses/<folder>.json
// Polite: one file at a time with a small delay; cached between runs. Grows incrementally (merge with existing).
// Usage: node scripts/analyse-audio.ts [--voice murattal|mujawwad] [--surahs 1,78-114] [--ayat 2:255,18:1]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeTo16kWav, readWav } from './lib/wav.ts';
import { findSilences, frameDb } from '../src/audio/dsp/energy.ts';

const ROOT = resolve(import.meta.dirname, '..');
const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const voice = arg('voice', 'murattal');
const folder = voice === 'mujawwad' ? 'Minshawy_Mujawwad_192kbps' : 'Minshawy_Murattal_128kbps';
const AUDIO = join(ROOT, '.cache/audio', folder);
const OUTDIR = join(ROOT, 'data/derived/pauses');
mkdirSync(AUDIO, { recursive: true });
mkdirSync(OUTDIR, { recursive: true });
const outFile = join(OUTDIR, `${folder}.json`);
const pad3 = (n: number) => String(n).padStart(3, '0');

export const PAUSE_MIN_MS = 100; // stored; the build uses ≥ 220 ms, or ≥ 100 ms next to a pause/sakt mark
export const PAUSE_OPTS = { floorMarginDb: 6, rangeDb: 45 };

const index = JSON.parse(readFileSync(join(ROOT, 'public/data/quran/index.json'), 'utf8')) as { surahs: { n: number; ayas: number }[] };
const want: [number, number][] = [];
for (const part of arg('surahs', '1,78-114').split(',').filter(Boolean)) {
  const [a, b] = part.split('-').map(Number) as [number, number | undefined];
  for (let s = a; s <= (b ?? a); s++) for (let y = 1; y <= index.surahs[s - 1]!.ayas; y++) want.push([s, y]);
}
for (const k of arg('ayat', '').split(',').filter(Boolean)) want.push([Number(k.split(':')[0]), Number(k.split(':')[1])]);

type Entry = { d: number; p: [number, number][] };
const data: Record<string, Entry> = existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf8')) as { ayat: Record<string, Entry> }).ayat : {};
let fetched = 0;
for (const [s, a] of want) {
  const key = `${s}:${a}`;
  if (data[key]) continue;
  const mp3 = join(AUDIO, `${pad3(s)}${pad3(a)}.mp3`);
  if (!existsSync(mp3)) {
    const r = await fetch(`https://everyayah.com/data/${folder}/${pad3(s)}${pad3(a)}.mp3`, { headers: { 'User-Agent': 'tilawa-coach-build/0.1 (personal study app; derived timing data)' } });
    if (!r.ok) {
      console.warn(`skip ${key}: HTTP ${r.status}`);
      continue;
    }
    writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    fetched++;
    await new Promise((res) => setTimeout(res, 120));
  }
  const wav = mp3.replace(/\.mp3$/, '.16k.wav');
  decodeTo16kWav(mp3, wav);
  const { sr, x } = readWav(wav);
  const db = frameDb(x, sr, 10, 20);
  const { silences } = findSilences(db, 10, PAUSE_MIN_MS, PAUSE_OPTS);
  data[key] = { d: Math.round((x.length / sr) * 1000), p: silences.map((q) => [q.startMs, q.endMs]) };
}
const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => {
  const [s1, a1] = a.split(':').map(Number) as [number, number];
  const [s2, a2] = b.split(':').map(Number) as [number, number];
  return s1 - s2 || a1 - a2;
}));
writeFileSync(
  outFile,
  JSON.stringify({ source: `EveryAyah ${folder} (audio not stored)`, method: `16 kHz mono, 10 ms RMS frames, pause = ≥${PAUSE_MIN_MS} ms below max(noise floor + ${PAUSE_OPTS.floorMarginDb} dB, loud − ${PAUSE_OPTS.rangeDb} dB)`, measured: true, ayat: sorted }).replace(/\],"/g, '],\n"') + '\n',
);
console.log(`${Object.keys(sorted).length} ayat analysed (${fetched} downloaded this run) → ${outFile.replace(ROOT + '/', '')}`);
