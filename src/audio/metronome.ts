// Sample-accurate clicks on the AudioContext clock (look-ahead scheduler) + tap tempo + latm patterns.
import { signal } from '@preact/signals';
import { audioCtx, resumeAudio } from './context.ts';

/** A short click (filtered noise burst); accent = higher, louder. */
export function scheduleClick(when: number, accent = false, gain = 0.6, dest?: AudioNode): void {
  const c = audioCtx();
  const len = Math.round(c.sampleRate * 0.012);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.0025));
  const src = c.createBufferSource();
  src.buffer = b;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = accent ? 3200 : 2200;
  f.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = accent ? gain : gain * 0.7;
  src.connect(f).connect(g).connect(dest ?? c.destination);
  src.start(when);
}

export type Pattern = 'single' | 'double' | 'shoor';
/** Beat subdivisions per pattern (fractions of a beat). Latm patterns are refined from tap-mapping in M8. */
export const PATTERNS: Record<Pattern, number[]> = { single: [0], double: [0, 0.5], shoor: [0, 0.25, 0.5, 0.75] };

export const metronomeOn = signal(false);
export const beatNow = signal(0);

class Metronome {
  bpm = 80;
  beatsPerBar = 4;
  pattern: Pattern = 'single';
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private beat = 0;
  private onBeat: ((beat: number, when: number) => void) | null = null;

  async start(onBeat?: (beat: number, when: number) => void): Promise<void> {
    const c = await resumeAudio();
    this.stop();
    this.onBeat = onBeat ?? null;
    this.next = c.currentTime + 0.1;
    this.beat = 0;
    metronomeOn.value = true;
    this.timer = setInterval(() => this.pump(), 25);
  }
  private pump(): void {
    const c = audioCtx();
    const spb = 60 / this.bpm;
    while (this.next < c.currentTime + 0.12) {
      for (const sub of PATTERNS[this.pattern]) scheduleClick(this.next + sub * spb, sub === 0 && this.beat % this.beatsPerBar === 0);
      const b = this.beat;
      const when = this.next;
      setTimeout(() => {
        beatNow.value = b;
        this.onBeat?.(b, when);
      }, Math.max(0, (when - c.currentTime) * 1000));
      this.next += spb;
      this.beat++;
    }
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    metronomeOn.value = false;
  }
}
export const metronome = new Metronome();

/** Tap tempo: median interval of the last taps → BPM (null until 3 taps). */
export function tapTempo(taps: number[]): number | null {
  const t = taps.slice(-8);
  if (t.length < 3) return null;
  const iv = t.slice(1).map((x, i) => x - t[i]!).sort((a, b) => a - b);
  const med = iv[Math.floor(iv.length / 2)]!;
  return med > 0 ? Math.round(60000 / med) : null;
}
