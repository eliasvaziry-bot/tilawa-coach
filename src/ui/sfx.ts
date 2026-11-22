// Small game sounds made on the fly (no audio files): two rising notes for a right answer, a soft low pair for a
// wrong one, three notes when a quiz is finished. Quiet, and off with Settings → Game sounds.
import { audioCtx } from '../audio/context.ts';
import { settings } from './state.ts';

type Kind = 'correct' | 'wrong' | 'done';
const NOTES: Record<Kind, number[]> = { correct: [660, 880], wrong: [247, 208], done: [523, 659, 784] };

export function sfx(kind: Kind): void {
  if (!settings.value.gameSounds) return;
  try {
    const c = audioCtx();
    if (c.state !== 'running') void c.resume();
    const t0 = c.currentTime + 0.01;
    NOTES[kind].forEach((hz, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = kind === 'wrong' ? 'triangle' : 'sine';
      o.frequency.value = hz;
      const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
  } catch {
    // sounds are optional
  }
}
