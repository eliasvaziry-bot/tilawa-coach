// Runtime-only "Minshawi with children" track (Quran Foundation): fetched when needed, timings cached ≤ 7 days in
// IndexedDB (purged at start-up), audio decoded in memory only. Credit: Quran Foundation + the reciter.
import { cacheGet, cachePut, QF_MAX_AGE_MS } from '../data/db.ts';
import { audioCtx } from '../audio/context.ts';
import { splitVerse, type KidsSplit, type QfTimestamp } from './kidsSplit.ts';

export const KIDS_CREDIT = 'Minshawi with children: audio and timings from the Quran Foundation (Quran.com / QuranicAudio), personal non-commercial use.';
const MAX_BYTES = 30 * 1024 * 1024; // phone memory guard for decoding a whole surah

interface KidsData {
  audioUrl: string;
  splits: KidsSplit[];
}

export async function loadKids(surah: number): Promise<KidsData> {
  const key = `qf:kids:168:${surah}`;
  const hit = await cacheGet<{ audioUrl: string; timestamps: QfTimestamp[] }>(key, QF_MAX_AGE_MS);
  let raw = hit;
  if (!raw) {
    const r = await fetch(`https://api.quran.com/api/v4/chapter_recitations/168/${surah}?segments=true`);
    if (!r.ok) throw new Error(`Quran.com: HTTP ${r.status}`);
    const af = ((await r.json()) as { audio_file: { audio_url: string; timestamps: QfTimestamp[] } }).audio_file;
    raw = { audioUrl: af.audio_url, timestamps: af.timestamps };
    await cachePut(key, raw, 'qf');
  }
  return { audioUrl: raw.audioUrl, splits: raw.timestamps.map(splitVerse).filter((x): x is KidsSplit => !!x) };
}

const buffers = new Map<string, Promise<AudioBuffer>>();
export function kidsBuffer(url: string): Promise<AudioBuffer> {
  let p = buffers.get(url);
  if (!p) {
    p = (async () => {
      const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
      const len = Number(head?.headers.get('content-length') ?? 0);
      if (len > MAX_BYTES) throw new Error('This surah is too long to load on a phone with the children track — use the murattal track.');
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) throw new Error(`audio HTTP ${r.status}`);
      return audioCtx().decodeAudioData(await r.arrayBuffer());
    })();
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
    while (buffers.size > 2) buffers.delete(buffers.keys().next().value!);
  }
  return p;
}
