// Minshawi audio from EveryAyah (streamed; never committed). EveryAyah sends CORS `*` and Range support
// (measured 2026-11-21, DECISIONS D-010), so buffers can be decoded for precise word playback and analysis.
import { audioCtx } from './context.ts';

export const VOICES = {
  murattal: { folder: 'Minshawy_Murattal_128kbps', label: 'al-Minshawi · murattal' },
  mujawwad: { folder: 'Minshawy_Mujawwad_192kbps', label: 'al-Minshawi · mujawwad' },
  teacher: { folder: 'Minshawy_Teacher_128kbps', label: 'al-Minshawi · teacher' },
} as const;
export type VoiceId = keyof typeof VOICES;

export const AUDIO_PACK_CACHE = 'audio-packs-v1';
const pad3 = (n: number) => String(n).padStart(3, '0');

export function ayahUrl(voice: VoiceId, surah: number, ayah: number): string {
  return `https://everyayah.com/data/${VOICES[voice].folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

const MAX_BUFFERS = 24;
const buffers = new Map<string, Promise<AudioBuffer>>();

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  // offline packs first (Cache Storage), then network
  try {
    if ('caches' in window) {
      const c = await caches.open(AUDIO_PACK_CACHE);
      const hit = await c.match(url);
      if (hit) return await hit.arrayBuffer();
    }
  } catch {
    /* ignore */
  }
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`audio HTTP ${r.status}`);
  return r.arrayBuffer();
}

/** Decoded ayah audio (small LRU). */
export function ayahBuffer(voice: VoiceId, surah: number, ayah: number): Promise<AudioBuffer> {
  const url = ayahUrl(voice, surah, ayah);
  let p = buffers.get(url);
  if (p) {
    buffers.delete(url);
    buffers.set(url, p);
    return p;
  }
  p = fetchBytes(url).then((b) => audioCtx().decodeAudioData(b));
  p.catch(() => buffers.delete(url));
  buffers.set(url, p);
  while (buffers.size > MAX_BUFFERS) buffers.delete(buffers.keys().next().value!);
  return p;
}

export interface SegmentHandle {
  stop(): void;
  ended: Promise<void>;
  startedAt: number; // AudioContext time when sound starts
}

/** Play [startMs, endMs) of a buffer with 6 ms fades (no clicks). Sample-accurate. */
export function playSegment(buf: AudioBuffer, startMs: number, endMs: number, opts: { gain?: number; rate?: number; when?: number; dest?: AudioNode } = {}): SegmentHandle {
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = opts.rate ?? 1;
  const g = c.createGain();
  const when = opts.when ?? c.currentTime + 0.02;
  const dur = Math.max(0.02, (endMs - startMs) / 1000);
  const real = dur / (opts.rate ?? 1);
  const peak = opts.gain ?? 1;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.006);
  g.gain.setValueAtTime(peak, when + Math.max(0.006, real - 0.006));
  g.gain.linearRampToValueAtTime(0, when + real);
  src.connect(g).connect(opts.dest ?? c.destination);
  src.start(when, Math.max(0, startMs / 1000), dur);
  const ended = new Promise<void>((res) => (src.onended = () => res()));
  return {
    stop: () => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    },
    ended,
    startedAt: when,
  };
}
