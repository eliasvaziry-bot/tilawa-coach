// Synthetic test signals with known answers (B13). Deterministic (seeded noise).
export const SR = 16000;

export function silence(ms: number, sr = SR): Float32Array {
  return new Float32Array(Math.round((sr * ms) / 1000));
}
export function sine(hz: number, ms: number, sr = SR, amp = 0.5): Float32Array {
  const n = Math.round((sr * ms) / 1000);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = amp * Math.sin((2 * Math.PI * hz * i) / sr);
  return y;
}
/** Voice-like tone: f0 with decaying harmonics and 10 ms fades. */
export function vowel(hz: number, ms: number, sr = SR, amp = 0.4): Float32Array {
  const n = Math.round((sr * ms) / 1000);
  const y = new Float32Array(n);
  const fade = Math.round(sr * 0.01);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin((2 * Math.PI * hz * h * i) / sr) / h;
    const g = Math.min(1, i / fade, (n - 1 - i) / fade);
    y[i] = amp * 0.6 * v * g;
  }
  return y;
}
let seed = 12345;
export function noise(ms: number, amp: number, sr = SR): Float32Array {
  const n = Math.round((sr * ms) / 1000);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    y[i] = amp * ((seed / 2147483648) * 2 - 1);
  }
  return y;
}
export function concat(...parts: Float32Array[]): Float32Array {
  const y = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    y.set(p, o);
    o += p.length;
  }
  return y;
}
/** Clicks (2 ms decaying bursts) at the given times, over a quiet noise bed. */
export function clicks(timesMs: number[], totalMs: number, sr = SR, bed = 0.002): Float32Array {
  const y = noise(totalMs, bed, sr);
  for (const t of timesMs) {
    const s = Math.round((sr * t) / 1000);
    for (let i = 0; i < Math.round(sr * 0.004) && s + i < y.length; i++) y[s + i]! += 0.8 * Math.exp(-i / (sr * 0.0008)) * (i % 2 ? -1 : 1);
  }
  return y;
}
