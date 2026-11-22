// One shared AudioContext, resumed from a user gesture (iOS requirement), plus iOS audio-session handling.

let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}

/** Call from a click/tap handler before any playback or recording. */
export async function resumeAudio(): Promise<AudioContext> {
  const c = audioCtx();
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      /* resumed later on the next gesture */
    }
  }
  return c;
}

type SessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
interface AudioSessionLike {
  type: SessionType;
}

/** Safari 16.4+ exposes navigator.audioSession. Feature-detected; a no-op elsewhere. */
export function setAudioSession(type: SessionType): boolean {
  const as = (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;
  if (!as || !('type' in as)) return false;
  try {
    as.type = type;
    return true;
  } catch {
    return false;
  }
}
export function audioSessionSupported(): boolean {
  return 'audioSession' in navigator;
}

/** Best-effort output latency estimate in ms (base + output), used when no calibration exists. */
export function estimatedOutputLatencyMs(): number {
  const c = audioCtx();
  const base = c.baseLatency ?? 0;
  const out = (c as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
  return Math.round((base + out) * 1000);
}
