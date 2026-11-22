// Call-and-response engine (B9): CALL → CUE (pulse + click) → RESPONSE (recorded) → FEEDBACK → retry or next.
// All timing on the AudioContext clock; the response recording is stamped on the same clock, so entry timing is
// measured against the cue and compensated with the calibrated latency.
import { signal } from '@preact/signals';
import type { Ayah, WordTiming } from '../data/quranData.ts';
import { audioCtx, resumeAudio, setAudioSession } from '../audio/context.ts';
import { ayahBuffer, playSegment, type VoiceId } from '../audio/everyayah.ts';
import { scheduleClick } from '../audio/metronome.ts';
import { connectLoopback, onLevel, openMic, startRecording, stopRecording } from '../audio/mic.ts';
import { resampleTo, wsolaStretch } from '../audio/dsp/stretch.ts';
import { frameDb, percentile } from '../audio/dsp/energy.ts';
import { getRefined } from '../audio/refine.ts';
import { computeFeedback, type CrFeedback } from './feedback.ts';
import { planKids, planSteps, type CrMode, type CrStep } from './plan.ts';
import { kidsBuffer, loadKids } from './kids.ts';
import { settings } from '../ui/state.ts';
import { markPractisedToday } from '../srs/progress.ts';

export type Phase = 'idle' | 'loading' | 'call' | 'cue' | 'response' | 'feedback' | 'done';
export interface CrState {
  mode: CrMode;
  steps: CrStep[];
  index: number;
  phase: Phase;
  feedback: CrFeedback | null;
  history: { step: number; feedback: CrFeedback }[];
  callWord: number | null; // display-word index sounding during the call
  error: string | null;
}
export const cr = signal<CrState>({ mode: 'echo', steps: [], index: 0, phase: 'idle', feedback: null, history: [], callWord: null, error: null });
export const lastTake = signal<{ call: AudioBuffer; response: AudioBuffer } | null>(null);

const set = (p: Partial<CrState>) => (cr.value = { ...cr.value, ...p });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let token = 0; // cancels a running session
let waitNext: ((go: 'next' | 'retry') => void) | null = null;

function timingsOf(a: Ayah, voice: VoiceId): WordTiming[] {
  const raw = voice === 'mujawwad' ? a.mujawwad : a.murattal;
  return getRefined(voice, a) ?? raw;
}
const testFlag = (name: string) => typeof location !== 'undefined' && new RegExp(`[?&]${name}=1`).test(location.search);

function speak(text: string): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 1.05;
    u.onend = () => res();
    u.onerror = () => res();
    speechSynthesis.speak(u);
    setTimeout(res, 2500);
  });
}

function latencyMs(): number {
  const v = Object.values(settings.value.latencyMs);
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export interface CrOptions {
  source: 'murattal' | 'kids';
  /** kids track: let the children answer quietly with you ("answer with the class") */
  withClass: boolean;
}
let options: CrOptions = { source: 'murattal', withClass: false };

export function startSession(mode: CrMode, ayat: Ayah[], opts: Partial<CrOptions> = {}): void {
  options = { ...options, ...opts };
  const voice: VoiceId = settings.value.voice === 'mujawwad' ? 'mujawwad' : 'murattal';
  token++;
  const my = token;
  set({ mode, steps: [], index: 0, phase: 'loading', feedback: null, history: [], callWord: null, error: null });
  void (async () => {
    try {
      let steps: CrStep[];
      if (options.source === 'kids') {
        const k = await loadKids(ayat[0]!.surah);
        steps = planKids(ayat, k.audioUrl, k.splits);
        if (!steps.length) throw new Error('No children-track timings for this surah.');
      } else steps = planSteps(mode, ayat, (a) => timingsOf(a, voice));
      if (my !== token) return;
      set({ steps });
      await run(my, voice);
    } catch (e) {
      set({ phase: 'idle', error: e instanceof Error ? e.message : String(e) });
    }
  })();
}
export function stopSession(): void {
  token++;
  waitNext?.('next');
  set({ phase: 'idle', callWord: null });
  setAudioSession('playback');
}
export function next(): void {
  waitNext?.('next');
}
export function retry(): void {
  waitNext?.('retry');
}

async function run(my: number, voice: VoiceId): Promise<void> {
  try {
    await openMic();
    const ctx = await resumeAudio();
    const handsFree = settings.value.handsFree;
    let retries = 0;
    let first = true;
    while (my === token && cr.value.index < cr.value.steps.length) {
      const step = cr.value.steps[cr.value.index]!;
      set({ phase: 'loading', feedback: null });
      const buf = step.kids ? await kidsBuffer(step.kids.url) : await ayahBuffer(voice, step.ayah.surah, step.ayah.ayah);
      if (my !== token) return;
      // word timings for highlighting: murattal timings, or the sheikh's word spans on the children track
      // kids track: place the sheikh's word spans at their word indices so highlighting follows him
      let tm: WordTiming[];
      let [f, t] = step.words;
      if (step.kids) {
        const k = step.kids;
        if (k.call.length === t - f) {
          tm = [];
          k.call.forEach(([s0, e0], i) => (tm[f + i] = { s: s0, e: e0, f: 0 }));
        } else {
          tm = [{ s: k.call[0]![0], e: k.call[k.call.length - 1]![1], f: 0 }];
          [f, t] = [0, 1];
        }
      } else tm = timingsOf(step.ayah, voice);
      const segS = Math.max(0, tm[f]!.s - 40);
      const segE = Math.min(buf.duration * 1000, tm[t - 1]!.e + 80);
      // call audio (time-stretched for the tempo ladder: pitch kept)
      const sr = buf.sampleRate;
      const raw = buf.getChannelData(0).subarray(Math.round((segS / 1000) * sr), Math.round((segE / 1000) * sr));
      const callPcm = step.rate === 1 ? raw.slice() : wsolaStretch(raw, step.rate, sr);
      const callBuf = ctx.createBuffer(1, callPcm.length, sr);
      callBuf.copyToChannel(callPcm as Float32Array<ArrayBuffer>, 0);
      const callMs = (callPcm.length / sr) * 1000;

      // CALL with word highlighting
      setAudioSession('play-and-record');
      set({ phase: 'call' });
      const h = playSegment(callBuf, 0, callMs);
      const t0 = h.startedAt;
      let raf = 0;
      const hl = () => {
        const ms = (ctx.currentTime - t0) * 1000 * step.rate + segS;
        let w: number | null = null;
        for (let k = f; k < t; k++) if (ms >= tm[k]!.s && ms < tm[k]!.e + 60) w = k + step.ayah.basmalaWords;
        if (cr.value.callWord !== w) set({ callWord: w });
        raf = requestAnimationFrame(hl);
      };
      raf = requestAnimationFrame(hl);
      await h.ended;
      cancelAnimationFrame(raf);
      set({ callWord: null });
      if (my !== token) return;

      // CUE + RESPONSE (recording starts before the cue so early entries are caught)
      if (handsFree && first) await speak('Your turn after the click.');
      first = false;
      await startRecording();
      const cueAt = audioCtx().currentTime + 0.45;
      scheduleClick(cueAt, true, 0.5);
      setTimeout(() => my === token && set({ phase: 'cue' }), 450);
      setTimeout(() => my === token && set({ phase: 'response' }), 650);
      // ghost: Minshawi quietly underneath while you recite
      if (cr.value.mode === 'ghost' && !step.kids) playSegment(callBuf, 0, callMs, { gain: 0.15, when: cueAt });
      // children's track: they answer quietly with you if "answer with the class" is on
      if (step.kids && options.withClass) {
        const rs = step.kids.resp[0]![0];
        const re = step.kids.resp[step.kids.resp.length - 1]![1];
        playSegment(buf, rs, re, { gain: 0.3, when: cueAt });
      }
      // test-only echo bot: "recite" the call back into the mic input
      if (testFlag('crbot')) {
        const g = ctx.createGain();
        const unhook = connectLoopback(g);
        playSegment(callBuf, 0, callMs, { when: cueAt + 0.1, dest: g });
        setTimeout(unhook, callMs + 1500);
      }
      const maxMs = Math.max(1800, callMs * 1.6 + 1200);
      let heardAt = 0;
      let quietSince = 0;
      const off = onLevel((l) => {
        if (l.rmsDb > -38) {
          heardAt = heardAt || performance.now();
          quietSince = 0;
        } else if (heardAt && !quietSince) quietSince = performance.now();
      });
      const startWait = performance.now();
      while (my === token && performance.now() - startWait < maxMs) {
        await sleep(60);
        if (heardAt && quietSince && performance.now() - quietSince > 900 && performance.now() - startWait > 900) break;
      }
      off();
      const rec = await stopRecording();
      if (my !== token) return;

      // FEEDBACK
      const response16 = resampleTo(rec.pcm, rec.sr, 16000);
      const call16 = resampleTo(callPcm, sr, 16000);
      const floor = percentile(frameDb(response16, 16000, 10, 20), 10);
      const fb = computeFeedback({ call: call16, response: response16, responseStartMs: (rec.t0 - cueAt) * 1000, noiseFloorDb: floor, latencyMs: latencyMs() });
      const respBuf = ctx.createBuffer(1, Math.max(1, rec.pcm.length), rec.sr);
      respBuf.copyToChannel(rec.pcm as Float32Array<ArrayBuffer>, 0);
      lastTake.value = { call: callBuf, response: respBuf };
      set({ phase: 'feedback', feedback: fb, history: [...cr.value.history, { step: cr.value.index, feedback: fb }] });

      let go: 'next' | 'retry';
      if (handsFree) {
        if (!fb.heard && retries < 2) {
          retries++;
          await speak('I did not hear you. Again.');
          go = 'retry';
        } else {
          await sleep(1400);
          go = 'next';
        }
      } else go = await new Promise<'next' | 'retry'>((r) => (waitNext = r));
      waitNext = null;
      if (my !== token) return;
      if (go === 'next') {
        retries = 0;
        set({ index: cr.value.index + 1 });
      }
    }
    if (my === token) {
      set({ phase: 'done' });
      void markPractisedToday();
      if (handsFree) await speak('Session complete.');
      setAudioSession('playback');
    }
  } catch (e) {
    set({ phase: 'idle', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Side-by-side playback: Minshawi on the left, you on the right. */
export async function playSideBySide(): Promise<void> {
  const t = lastTake.value;
  if (!t) return;
  const ctx = await resumeAudio();
  const when = ctx.currentTime + 0.05;
  for (const [b, pan] of [[t.call, -0.8], [t.response, 0.8]] as const) {
    const s = ctx.createBufferSource();
    s.buffer = b;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(p).connect(ctx.destination);
    s.start(when);
  }
}
export async function playTake(which: 'call' | 'response'): Promise<void> {
  const t = lastTake.value;
  if (!t) return;
  const ctx = await resumeAudio();
  const s = ctx.createBufferSource();
  s.buffer = which === 'call' ? t.call : t.response;
  s.connect(ctx.destination);
  s.start();
}

// read-only test hook (e2e inspects per-step feedback)
if (typeof window !== 'undefined') (window as unknown as { __tcCr: () => CrState }).__tcCr = () => cr.value;
