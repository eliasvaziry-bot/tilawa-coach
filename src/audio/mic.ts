// Microphone: getUserMedia with processing OFF for analysis (fallback: ON), PCM capture through the worklet
// (context-time stamped, so recordings line up with scheduled cues), MediaRecorder for a compressed copy
// (iOS records audio/mp4), live level + pitch signals, Bluetooth warning.
import { signal } from '@preact/signals';
import micWorkletUrl from './worklets/mic.worklet.ts?worker&url';
import { audioCtx, resumeAudio, setAudioSession } from './context.ts';

export interface PitchPoint {
  t: number; // context time (s)
  hz: number;
  clarity: number;
}
export const micLevel = signal<{ rmsDb: number; peak: number } | null>(null);
export const micPitch = signal<PitchPoint | null>(null);
export const micInfo = signal<{ label: string; bluetooth: boolean; processingOff: boolean; sampleRate: number } | null>(null);
export const micError = signal<string | null>(null);

const BT = /airpods|bluetooth|headset|hands-?free|beats|buds|bose|sony wh|jabra/i;

interface Mic {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  sink: GainNode;
}
let mic: Mic | null = null;
let workletLoaded = false;
const pitchListeners = new Set<(p: PitchPoint) => void>();
const levelListeners = new Set<(l: { t: number; rmsDb: number; peak: number }) => void>();
let pcmSink: ((t0: number, data: Float32Array) => void) | null = null;

export function onPitch(fn: (p: PitchPoint) => void): () => void {
  pitchListeners.add(fn);
  return () => pitchListeners.delete(fn);
}
export function onLevel(fn: (l: { t: number; rmsDb: number; peak: number }) => void): () => void {
  levelListeners.add(fn);
  return () => levelListeners.delete(fn);
}

export async function openMic(): Promise<Mic> {
  if (mic) return mic;
  const ctx = await resumeAudio();
  setAudioSession('play-and-record');
  let stream: MediaStream;
  let processingOff = true;
  // Test-only synthetic microphone (?fakemic=1): a silent stream from the AudioContext, so e2e tests can drive the
  // pipeline through the loopback hook where the OS blocks fake capture devices (macOS headless).
  const fake = typeof location !== 'undefined' && /[?&]fakemic=1/.test(location.search);
  if (fake) {
    const dst = ctx.createMediaStreamDestination();
    const silent = ctx.createGain();
    silent.gain.value = 0;
    silent.connect(dst);
    stream = dst.stream;
  } else if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone (needs HTTPS and a modern browser).');
  else try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      micError.value = 'Microphone permission was refused. On iPhone: Settings → Safari → Microphone → Allow (or the aA menu → Website Settings).';
      throw e;
    }
    processingOff = false;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  if (fake) processingOff = true;
  if (!workletLoaded) {
    await ctx.audioWorklet.addModule(micWorkletUrl);
    workletLoaded = true;
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'tc-mic', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
  const sink = ctx.createGain();
  sink.gain.value = 0; // keep the graph pulling without monitoring the mic
  source.connect(node).connect(sink).connect(ctx.destination);
  node.port.onmessage = (e: MessageEvent<{ type: string; t?: number; t0?: number; rmsDb?: number; peak?: number; hz?: number; clarity?: number; data?: Float32Array }>) => {
    const m = e.data;
    if (m.type === 'pitch') {
      const p = { t: m.t!, hz: m.hz!, clarity: m.clarity! };
      micPitch.value = p;
      pitchListeners.forEach((f) => f(p));
    } else if (m.type === 'level') {
      micLevel.value = { rmsDb: m.rmsDb!, peak: m.peak! };
      levelListeners.forEach((f) => f({ t: m.t!, rmsDb: m.rmsDb!, peak: m.peak! }));
    } else if (m.type === 'pcm') pcmSink?.(m.t0!, m.data!);
  };
  const track = stream.getAudioTracks()[0];
  const label = fake ? 'synthetic test microphone' : track?.label || 'microphone';
  micInfo.value = { label, bluetooth: BT.test(label), processingOff, sampleRate: ctx.sampleRate };
  micError.value = null;
  mic = { stream, source, node, sink };
  return mic;
}

/** Test-only loopback: feed another node into the mic analysis input (e2e calibration with a known delay). */
export function connectLoopback(src: AudioNode): () => void {
  if (!mic) throw new Error('mic not open');
  const node = mic.node;
  src.connect(node);
  return () => src.disconnect(node);
}

export function closeMic(): void {
  if (!mic) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  mic.source.disconnect();
  mic.node.disconnect();
  mic = null;
  micLevel.value = null;
  micPitch.value = null;
  setAudioSession('playback');
}

export interface Recording {
  pcm: Float32Array; // context sample rate
  sr: number;
  t0: number; // context time of pcm[0]
  blob: Blob | null; // compressed copy (MediaRecorder), when supported
  mime: string;
  durationMs: number;
}

let media: MediaRecorder | null = null;
let mediaChunks: Blob[] = [];
let parts: { t0: number; data: Float32Array }[] = [];

export async function startRecording(): Promise<void> {
  const m = await openMic();
  parts = [];
  pcmSink = (t0, data) => parts.push({ t0, data });
  m.node.port.postMessage({ record: true });
  mediaChunks = [];
  try {
    media = new MediaRecorder(m.stream);
    media.ondataavailable = (e) => e.data.size && mediaChunks.push(e.data);
    media.start();
  } catch {
    media = null;
  }
}

export async function stopRecording(): Promise<Recording> {
  const m = mic;
  if (!m) throw new Error('not recording');
  m.node.port.postMessage({ record: false });
  // let the final chunk arrive
  await new Promise((r) => setTimeout(r, 120));
  pcmSink = null;
  const sr = audioCtx().sampleRate;
  const total = parts.reduce((a, p) => a + p.data.length, 0);
  const pcm = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    pcm.set(p.data, o);
    o += p.data.length;
  }
  let blob: Blob | null = null;
  let mime = '';
  if (media && media.state !== 'inactive') {
    const done = new Promise<void>((r) => (media!.onstop = () => r()));
    media.stop();
    await done;
    mime = media.mimeType || 'audio/mp4';
    blob = new Blob(mediaChunks, { type: mime });
  }
  media = null;
  return { pcm, sr, t0: parts[0]?.t0 ?? 0, blob, mime, durationMs: Math.round((pcm.length / sr) * 1000) };
}

/** Resample to 16 kHz mono with OfflineAudioContext (for models / storage). */
export async function to16k(pcm: Float32Array, sr: number): Promise<Float32Array> {
  if (sr === 16000) return pcm;
  const len = Math.ceil((pcm.length * 16000) / sr);
  const off = new OfflineAudioContext(1, len, 16000);
  const b = off.createBuffer(1, pcm.length, sr);
  b.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
  const src = off.createBufferSource();
  src.buffer = b;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Detect likely Bluetooth output/input (labels need mic permission first). */
export async function bluetoothLikely(): Promise<boolean> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.some((d) => BT.test(d.label));
  } catch {
    return false;
  }
}
