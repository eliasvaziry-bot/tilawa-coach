// Decode audio to 16 kHz mono PCM for build-time analysis (afconvert on macOS, ffmpeg elsewhere).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export function decodeTo16kWav(input: string, output: string): void {
  if (existsSync(output)) return;
  try {
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', input, output], { stdio: 'ignore' });
    return;
  } catch {
    /* not macOS */
  }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output], { stdio: 'ignore' });
}

/** Minimal RIFF/WAVE reader (PCM 16-bit). Returns samples in [-1, 1] and the sample rate. */
export function readWav(path: string): { sr: number; x: Float32Array } {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not WAVE`);
  let off = 12;
  let sr = 16000;
  let ch = 1;
  let bits = 16;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      ch = b.readUInt16LE(body + 2);
      sr = b.readUInt32LE(body + 4);
      bits = b.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('only 16-bit PCM');
      const n = Math.floor(Math.min(size, b.length - body) / 2 / ch);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = b.readInt16LE(body + i * 2 * ch) / 32768;
      return { sr, x };
    }
    off = body + size + (size & 1);
  }
  throw new Error(`${path}: no data chunk`);
}
