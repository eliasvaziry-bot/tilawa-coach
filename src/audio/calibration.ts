// Latency calibration per output device (B6 Stage 0, B4):
//  - loudspeaker: play clicks, record them through the mic → round-trip latency (output + input)
//  - headphones (the mic can't hear the clicks): clap along with 10 clicks; the first 2 are settling
// Offsets are measured on the AudioContext clock: capture chunks carry context-time stamps.
import { audioCtx, resumeAudio } from './context.ts';
import { scheduleClick } from './metronome.ts';
import { connectLoopback, startRecording, stopRecording, openMic } from './mic.ts';
import { detectOnsets, estimateLatency, matchOffsets, type LatencyEstimate } from './dsp/onsets.ts';
import { resampleTo } from './dsp/stretch.ts';

export type CalMode = 'speaker' | 'clap';

export interface CalResult extends LatencyEstimate {
  mode: CalMode;
  offsets: (number | null)[];
}

/** @param loopbackMs test only: route the clicks back into the mic input through a DelayNode of this length. */
export async function calibrate(mode: CalMode, onTick?: (i: number, n: number) => void, loopbackMs?: number): Promise<CalResult | null> {
  await openMic();
  const c = await resumeAudio();
  let dest: AudioNode | undefined;
  let unhook: (() => void) | null = null;
  if (loopbackMs !== undefined) {
    const d = c.createDelay(1);
    d.delayTime.value = loopbackMs / 1000;
    unhook = connectLoopback(d);
    dest = d;
  }
  const n = mode === 'speaker' ? 8 : 10;
  const period = mode === 'speaker' ? 0.5 : 0.667; // clap-along at 90 BPM
  await startRecording();
  const first = c.currentTime + 0.6;
  const sched: number[] = [];
  for (let i = 0; i < n; i++) {
    const when = first + i * period;
    sched.push(when);
    scheduleClick(when, i === 0, mode === 'speaker' ? 0.9 : 0.6, dest);
    setTimeout(() => onTick?.(i, n), Math.max(0, (when - c.currentTime) * 1000));
  }
  await new Promise((r) => setTimeout(r, (first - c.currentTime + n * period + 0.7) * 1000));
  const rec = await stopRecording();
  unhook?.();
  const x = resampleTo(rec.pcm, rec.sr, 16000);
  const onsets = detectOnsets(x, 16000, { riseDb: mode === 'speaker' ? 12 : 14, floorDb: -50, refractoryMs: mode === 'speaker' ? 150 : 200 });
  // onset (ms in recording) → context time
  const detectedCtxMs = onsets.map((ms) => (rec.t0 + ms / 1000) * 1000);
  const offsets = matchOffsets(
    sched.map((s) => s * 1000),
    detectedCtxMs,
    mode === 'speaker' ? 500 : 600,
  );
  const est = estimateLatency(offsets, mode === 'clap' ? 2 : 0);
  return est ? { ...est, mode, offsets } : null;
}

/** Key for storing calibrations per output device: the chosen route + the detected label when the browser exposes it. */
export async function outputKey(route: 'speaker' | 'wired' | 'bluetooth'): Promise<string> {
  let label = '';
  try {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
    label = outs.find((d) => d.deviceId === 'default')?.label ?? outs[0]?.label ?? '';
  } catch {
    /* Safari does not list outputs */
  }
  return `${route}${label ? `:${label}` : ''}`;
}

export function ctxTimeNowMs(): number {
  return audioCtx().currentTime * 1000;
}
