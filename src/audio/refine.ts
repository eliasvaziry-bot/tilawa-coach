// Runtime timing refinement for ayat whose pauses were not measured at build time: decode the same EveryAyah
// file (CORS is allowed), find pauses, and snap word boundaries onto them (same algorithm as the build).
import type { Ayah, WordTiming } from '../data/quranData.ts';
import { recitedWords } from '../data/quranData.ts';
import { letterCount } from '../data/quranText.ts';
import { snapToPauses } from '../data/sanitise.ts';
import { findSilences, frameDb } from './dsp/energy.ts';
import { ayahBuffer, type VoiceId } from './everyayah.ts';

const refined = new Map<string, WordTiming[]>();
const pending = new Map<string, Promise<WordTiming[] | null>>();
const key = (voice: string, a: Ayah) => `${voice}:${a.surah}:${a.ayah}`;

export function getRefined(voice: VoiceId, a: Ayah): WordTiming[] | undefined {
  return refined.get(key(voice, a));
}

export function refineAyah(voice: VoiceId, a: Ayah, timings: WordTiming[]): Promise<WordTiming[] | null> {
  const k = key(voice, a);
  const done = refined.get(k);
  if (done) return Promise.resolve(done);
  let p = pending.get(k);
  if (!p) {
    p = (async () => {
      try {
        const buf = await ayahBuffer(voice, a.surah, a.ayah);
        const x = buf.getChannelData(0);
        const db = frameDb(x, buf.sampleRate, 10, 20);
        const { silences } = findSilences(db, 10, 220, { floorMarginDb: 6, rangeDb: 45 });
        const words = recitedWords(a);
        const out = snapToPauses(
          timings,
          silences.map((q) => ({ s: q.startMs, e: q.endMs })),
          words.map((w) => letterCount(w.text)),
          words.map((w, i) => w.marksAfter.length > 0 || i === words.length - 1),
          Math.round(buf.duration * 1000),
        ).words;
        refined.set(k, out);
        return out;
      } catch {
        return null; // keep the shipped timings
      } finally {
        pending.delete(k);
      }
    })();
    pending.set(k, p);
  }
  return p;
}
