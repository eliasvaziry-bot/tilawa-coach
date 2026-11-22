// Continuous ayah playback (HTMLAudioElement: streams, works with the lock screen, keeps pitch when slowed)
// with word highlighting driven by requestAnimationFrame + the quran-align word timings.
import { signal } from '@preact/signals';
import { loadSurah, type Ayah, type WordTiming } from '../data/quranData.ts';
import { ayahBuffer, ayahUrl, playSegment, type SegmentHandle, type VoiceId } from './everyayah.ts';
import { resumeAudio, setAudioSession } from './context.ts';
import { getRefined, refineAyah } from './refine.ts';

export interface NowWord {
  surah: number;
  ayah: number;
  /** index into Ayah.words (display words, basmala words included) */
  word: number;
}
export const nowWord = signal<NowWord | null>(null);
export const nowAyah = signal<{ surah: number; ayah: number; basmala: boolean } | null>(null);
export const playerState = signal<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
export const playerError = signal<string | null>(null);

/** Index of the word whose [s, e) contains t (ms), else the last word started before t, else -1. */
export function wordAt(timings: WordTiming[], t: number): number {
  let lo = 0;
  let hi = timings.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid]!.s <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best < 0) return -1;
  // inside a silence after the word ended (> 250 ms): show nothing rather than a stale word
  const w = timings[best]!;
  if (t > w.e + 250 && (best === timings.length - 1 || t < timings[best + 1]!.s)) return -1;
  return best;
}

interface QueueItem {
  ayah: Ayah;
  basmala: boolean; // play 1:1 (basmala) and highlight the prefixed basmala words
}

class MushafPlayer {
  private audio: HTMLAudioElement | null = null;
  private queue: QueueItem[] = [];
  private pos = 0;
  private raf = 0;
  private fatiha: Ayah[] | null = null;
  voice: VoiceId = 'murattal';
  rate = 1;
  repeatEach = 1;
  private repeatLeft = 0;
  latencyMs = 0;
  loopRange: { from: number; to: number } | null = null; // queue indices for A–B loop (inclusive)
  private segment: SegmentHandle | null = null;

  private el(): HTMLAudioElement {
    if (!this.audio) {
      const a = new Audio();
      a.crossOrigin = 'anonymous'; // EveryAyah sends CORS headers (verified), so this is safe
      a.preload = 'auto';
      a.addEventListener('ended', () => this.next());
      a.addEventListener('playing', () => (playerState.value = 'playing'));
      a.addEventListener('waiting', () => (playerState.value = 'loading'));
      a.addEventListener('error', () => {
        playerState.value = 'error';
        playerError.value = navigator.onLine ? 'Audio failed to load.' : 'You are offline. Download an offline pack in Settings to listen offline.';
      });
      this.audio = a;
    }
    return this.audio;
  }

  async playFrom(ayat: Ayah[], startIndex: number): Promise<void> {
    await resumeAudio();
    setAudioSession('playback');
    this.stopSegment();
    if (!this.fatiha) this.fatiha = await loadSurah(1);
    this.queue = ayat.map((a) => ({ ayah: a, basmala: false }));
    // EveryAyah per-ayah files do not contain the basmala; play 1:1 before ayah 1 of surahs other than 1 and 9.
    const first = ayat[startIndex];
    if (first && first.basmalaWords > 0) this.queue.splice(startIndex, 0, { ayah: first, basmala: true });
    this.pos = startIndex;
    this.repeatLeft = this.repeatEach;
    this.loopRange = null;
    playerError.value = null;
    this.load();
  }

  private currentSrc(item: QueueItem): { url: string; timings: WordTiming[]; offset: number } {
    if (item.basmala) return { url: ayahUrl(this.voice, 1, 1), timings: this.timingsOf(this.fatiha![0]!), offset: 0 };
    return { url: ayahUrl(this.voice, item.ayah.surah, item.ayah.ayah), timings: this.timingsOf(item.ayah), offset: item.ayah.basmalaWords };
  }
  private timingsOf(a: Ayah, voice: VoiceId = this.voice): WordTiming[] {
    const raw = voice === 'mujawwad' ? a.mujawwad : a.murattal;
    const measured = voice === 'mujawwad' ? a.pausesMeasured.mujawwad : a.pausesMeasured.murattal;
    if (measured) return raw;
    // runtime refinement downloads the file a second time: only worth it for short ayat (< ~20 s)
    if ((raw[raw.length - 1]?.e ?? 0) > 20000) return raw;
    const v = voice === 'mujawwad' ? 'mujawwad' : 'murattal';
    const r = getRefined(v, a);
    if (r) return r;
    void refineAyah(v, a, raw); // ready in a moment; until then the shipped timings are used
    return raw;
  }

  private load(): void {
    const item = this.queue[this.pos];
    if (!item) return this.stop();
    const a = this.el();
    const { url } = this.currentSrc(item);
    playerState.value = 'loading';
    nowAyah.value = { surah: item.ayah.surah, ayah: item.ayah.ayah, basmala: item.basmala };
    a.src = url;
    a.playbackRate = this.rate;
    a.preservesPitch = true;
    (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
    void a.play().catch((e: unknown) => {
      playerState.value = 'error';
      playerError.value = e instanceof Error ? e.message : String(e);
    });
    this.updateMediaSession(item);
    this.prefetchNext();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  private prefetchNext(): void {
    const n = this.queue[this.pos + 1];
    if (!n || n.basmala) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = ayahUrl(this.voice, n.ayah.surah, n.ayah.ayah);
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    setTimeout(() => link.remove(), 30000);
  }

  private tick = (): void => {
    const item = this.queue[this.pos];
    const a = this.audio;
    if (!item || !a) return;
    const { timings, offset } = this.currentSrc(item);
    const t = a.currentTime * 1000 - this.latencyMs;
    const w = wordAt(timings, t);
    const cur = nowWord.value;
    const nw = w < 0 ? null : { surah: item.ayah.surah, ayah: item.ayah.ayah, word: w + offset };
    if (item.basmala && nw) nw.word = w; // basmala words are the first 4 display words of ayah 1
    if (!(cur === nw || (cur && nw && cur.surah === nw.surah && cur.ayah === nw.ayah && cur.word === nw.word))) nowWord.value = nw;
    if (!a.paused) this.raf = requestAnimationFrame(this.tick);
  };

  private next(): void {
    const item = this.queue[this.pos];
    if (item && !item.basmala && this.repeatLeft > 1) {
      this.repeatLeft--;
      return this.load();
    }
    if (this.loopRange && this.pos >= this.loopRange.to) {
      this.pos = this.loopRange.from;
      this.repeatLeft = this.repeatEach;
      return this.load();
    }
    this.pos++;
    this.repeatLeft = this.repeatEach;
    if (this.pos >= this.queue.length) return this.stop();
    this.load();
  }

  pause(): void {
    this.audio?.pause();
    playerState.value = 'paused';
  }
  async resume(): Promise<void> {
    await resumeAudio();
    if (!this.audio) return;
    await this.audio.play();
    this.raf = requestAnimationFrame(this.tick);
  }
  stop(): void {
    cancelAnimationFrame(this.raf);
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.stopSegment();
    nowWord.value = null;
    nowAyah.value = null;
    playerState.value = 'idle';
  }
  setRate(r: number): void {
    this.rate = r;
    if (this.audio) this.audio.playbackRate = r;
  }
  /** A–B loop between two ayah numbers of the current queue (inclusive). */
  setLoop(fromAyah: number, toAyah: number): void {
    const from = this.queue.findIndex((q) => !q.basmala && q.ayah.ayah === fromAyah);
    const to = this.queue.findIndex((q) => !q.basmala && q.ayah.ayah === toAyah);
    this.loopRange = from >= 0 && to >= from ? { from, to } : null;
  }
  get currentTimeMs(): number {
    return (this.audio?.currentTime ?? 0) * 1000;
  }

  private stopSegment(): void {
    this.segment?.stop();
    this.segment = null;
  }

  /** Tap-a-word: precise playback of one word (Web Audio, sample-accurate). */
  async playWord(ayah: Ayah, displayIndex: number, voice: VoiceId = this.voice): Promise<void> {
    await resumeAudio();
    setAudioSession('playback');
    this.audio?.pause();
    this.stopSegment();
    let surah = ayah.surah;
    let ay = ayah.ayah;
    let idx = displayIndex - ayah.basmalaWords;
    let timings = this.timingsOf(ayah, voice);
    if (idx < 0) {
      // a basmala word: Minshawi's 1:1
      if (!this.fatiha) this.fatiha = await loadSurah(1);
      surah = 1;
      ay = 1;
      idx = displayIndex;
      timings = this.timingsOf(this.fatiha[0]!, voice);
    }
    const t = timings[idx];
    if (!t) return;
    const buf = await ayahBuffer(voice, surah, ay);
    nowWord.value = { surah: ayah.surah, ayah: ayah.ayah, word: displayIndex };
    this.segment = playSegment(buf, Math.max(0, t.s - 15), t.e + 25);
    await this.segment.ended;
    if (nowWord.value?.word === displayIndex) nowWord.value = null;
  }

  private updateMediaSession(item: QueueItem): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.basmala ? 'Basmala' : `${item.ayah.surah}:${item.ayah.ayah}`,
        artist: 'Sheikh Muhammad Siddiq al-Minshawi',
        album: 'Tilawa Coach',
      });
      navigator.mediaSession.setActionHandler('play', () => void this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    } catch {
      /* ignore */
    }
  }
}

export const mushafPlayer = new MushafPlayer();
