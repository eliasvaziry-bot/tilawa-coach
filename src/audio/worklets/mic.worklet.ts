// AudioWorklet: all mic DSP off the main thread (B4). Captures PCM (with context-time stamps), reports levels,
// and runs YIN pitch on a 16 kHz decimated copy every 20 ms.
import { yin, DEFAULT_YIN } from '../dsp/pitch.ts';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const PITCH_SR = 16000;
const WIN = 640; // 40 ms at 16 kHz
const HOP = 320; // 20 ms

class MicProcessor extends AudioWorkletProcessor {
  private recording = false;
  private pitchOn = true;
  private chunk: Float32Array = new Float32Array(4096);
  private fill = 0;
  private chunkT0 = 0;
  private lvlSum = 0;
  private lvlPeak = 0;
  private lvlN = 0;
  private lvlBlocks = 0;
  private dec = Math.max(1, Math.round(sampleRate / PITCH_SR));
  private decAcc = 0;
  private decCount = 0;
  private ring = new Float32Array(WIN);
  private ringPos = 0;
  private sinceHop = 0;
  private frame = new Float32Array(WIN);
  private scratch = { d: new Float32Array(WIN), c: new Float32Array(WIN) };

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ record?: boolean; pitch?: boolean }>) => {
      if (e.data.record !== undefined) {
        if (!e.data.record && this.fill) this.flush();
        this.recording = e.data.record;
        this.fill = 0;
      }
      if (e.data.pitch !== undefined) this.pitchOn = e.data.pitch;
    };
  }

  private flush(): void {
    const out = this.chunk.slice(0, this.fill);
    this.port.postMessage({ type: 'pcm', t0: this.chunkT0, sr: sampleRate, data: out }, [out.buffer]);
    this.fill = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const blockT0 = currentTime;
    // capture
    if (this.recording) {
      for (let i = 0; i < ch.length; i++) {
        if (this.fill === 0) this.chunkT0 = blockT0 + i / sampleRate;
        this.chunk[this.fill++] = ch[i]!;
        if (this.fill === this.chunk.length) this.flush();
      }
    }
    // levels (~50 ms)
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]!);
      this.lvlSum += a * a;
      if (a > this.lvlPeak) this.lvlPeak = a;
    }
    this.lvlN += ch.length;
    if (++this.lvlBlocks >= Math.round((0.05 * sampleRate) / ch.length)) {
      this.port.postMessage({ type: 'level', t: blockT0, rmsDb: 10 * Math.log10(this.lvlSum / this.lvlN + 1e-12), peak: this.lvlPeak });
      this.lvlSum = 0;
      this.lvlPeak = 0;
      this.lvlN = 0;
      this.lvlBlocks = 0;
    }
    // pitch on a decimated copy
    if (this.pitchOn) {
      for (let i = 0; i < ch.length; i++) {
        this.decAcc += ch[i]!;
        if (++this.decCount === this.dec) {
          this.ring[this.ringPos] = this.decAcc / this.dec;
          this.ringPos = (this.ringPos + 1) % WIN;
          this.decAcc = 0;
          this.decCount = 0;
          if (++this.sinceHop >= HOP) {
            this.sinceHop = 0;
            for (let k = 0; k < WIN; k++) this.frame[k] = this.ring[(this.ringPos + k) % WIN]!;
            const p = yin(this.frame, PITCH_SR, DEFAULT_YIN, this.scratch);
            this.port.postMessage({ type: 'pitch', t: blockT0 + i / sampleRate, hz: p.hz, clarity: p.clarity });
          }
        }
      }
    }
    return true;
  }
}

registerProcessor('tc-mic', MicProcessor);
