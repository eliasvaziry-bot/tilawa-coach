// Kids-repeat spike: verify the call/response split automatically on real audio (BRIEF B5 "with kids").
// Quran Foundation data and audio are used TRANSIENTLY: timings in memory, audio in a temp folder that is deleted
// after each surah. Only our own pass/fail numbers are written: data/derived/kids-split-check.json.
// Usage: node scripts/kids-split-check.ts [--surahs 1,78-114]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decodeTo16kWav, readWav } from './lib/wav.ts';
import { medianPitch, pitchTrack } from '../src/audio/dsp/pitch.ts';
import { checkPair, splitVerse, type QfTimestamp } from '../src/cr/kidsSplit.ts';

const ROOT = resolve(import.meta.dirname, '..');
const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1]! : d;
};
const surahs: number[] = [];
for (const part of arg('surahs', '1,78-114').split(',')) {
  const [a, b] = part.split('-').map(Number) as [number, number | undefined];
  for (let s = a; s <= (b ?? a); s++) surahs.push(s);
}
const UA = { 'User-Agent': 'tilawa-coach-check/0.1 (personal non-commercial study app)' };
const results: { v: string; pass: boolean; counts: boolean; pitch: boolean | null; dur: boolean; callHz: number; respHz: number; ratio: number }[] = [];
let repairs = 0;
let chunked = 0;
const failures: string[] = [];

for (const s of surahs) {
  const r = await fetch(`https://api.quran.com/api/v4/chapter_recitations/168/${s}?segments=true`, { headers: UA });
  if (!r.ok) {
    failures.push(`${s}: API HTTP ${r.status}`);
    continue;
  }
  const af = ((await r.json()) as { audio_file: { audio_url: string; timestamps: QfTimestamp[] } }).audio_file;
  const dir = mkdtempSync(join(tmpdir(), 'tc-kids-'));
  try {
    const mp3 = join(dir, 'a.mp3');
    const ar = await fetch(af.audio_url, { headers: UA });
    if (!ar.ok) throw new Error(`audio HTTP ${ar.status}`);
    writeFileSync(mp3, Buffer.from(await ar.arrayBuffer()));
    const wav = join(dir, 'a.wav');
    decodeTo16kWav(mp3, wav);
    const { sr, x } = readWav(wav);
    const med = (s0: number, e0: number) => {
      const seg = x.subarray(Math.round((s0 / 1000) * sr), Math.round((e0 / 1000) * sr));
      const tr = pitchTrack(seg, sr, 10, 40, { minHz: 70, maxHz: 900, threshold: 0.2 });
      return medianPitch(tr.hz, tr.clarity, 0.6);
    };
    for (const ts of af.timestamps) {
      const sp = splitVerse(ts);
      if (!sp) {
        results.push({ v: ts.verse_key, pass: false, counts: false, pitch: null, dur: false, callHz: 0, respHz: 0, ratio: 0 });
        failures.push(`${ts.verse_key}: no restart found`);
        continue;
      }
      repairs += sp.repairs.length;
      if (sp.pairs.length > 1) chunked++;
      let ok = true;
      let cHz = 0;
      let rHz = 0;
      let ratio = 0;
      const why: string[] = [];
      for (const p of sp.pairs) {
        const callHz = med(p.call.s, p.call.e);
        const respHz = med(p.response.s, p.response.e);
        const c = checkPair(p, callHz, respHz);
        cHz = cHz || callHz;
        rHz = rHz || respHz;
        ratio = +((p.response.e - p.response.s) / Math.max(1, p.call.e - p.call.s)).toFixed(2);
        if (!c.pass) {
          ok = false;
          why.push(`pair ${p.call.from}-${p.call.to}: counts ${c.countsMatch} pitch ${Math.round(callHz)}→${Math.round(respHz)} Hz dur ×${ratio}`);
        }
      }
      if (sp.repairs.some((r) => r.startsWith('unparsed'))) {
        ok = false;
        why.push('unparsed tail');
      }
      results.push({ v: ts.verse_key, pass: ok, counts: !why.some((w) => w.includes('counts false')), pitch: true, dur: true, callHz: Math.round(cHz), respHz: Math.round(rHz), ratio });
      if (!ok) failures.push(`${ts.verse_key} (${sp.pairs.length} pair${sp.pairs.length > 1 ? 's' : ''}): ${why.join('; ')}`);
    }
  } catch (e) {
    failures.push(`${s}: ${String(e)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true }); // no Quran Foundation audio kept
  }
  await new Promise((res) => setTimeout(res, 800));
}
const passed = results.filter((r) => r.pass).length;
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  method: 'Parse sheikh/children pairs (call runs until positions restart; the response must repeat exactly the same positions; long verses alternate in chunks); a verse passes when every pair has = same word count AND children ≥ 3 semitones higher (median voiced pitch, measured) AND response/call duration 0.5–2.5×. QF data used transiently; audio deleted after analysis.',
  surahs: arg('surahs', '1,78-114'),
  ayat: results.length,
  passed,
  passRate: results.length ? +((passed / results.length) * 100).toFixed(1) : 0,
  acceptance: '≥ 98% of ayat (BRIEF B5)',
  sanitiserRepairs: repairs,
  chunkedVerses: chunked,
  failures: failures.slice(0, 80),
};
writeFileSync(join(ROOT, 'data/derived/kids-split-check.json'), JSON.stringify({ summary, perAyah: results.map((r) => [r.v, r.pass ? 1 : 0, r.callHz, r.respHz, r.ratio]) }) + '\n');
console.log(JSON.stringify(summary, null, 1));
