// Dynamic time warping for pitch contours (cents relative to tonic). Unvoiced frames (NaN) are skipped first.

export interface DtwResult {
  /** mean absolute cents difference along the best path */
  meanCents: number;
  path: [number, number][];
}

export function dtw(a: number[], b: number[], band = 0.25): DtwResult | null {
  const A = a.filter((x) => Number.isFinite(x));
  const B = b.filter((x) => Number.isFinite(x));
  const n = A.length;
  const m = B.length;
  if (n < 2 || m < 2) return null;
  const w = Math.max(Math.abs(n - m), Math.ceil(Math.max(n, m) * band));
  const INF = 1e18;
  const D = new Float64Array((n + 1) * (m + 1)).fill(INF);
  const idx = (i: number, j: number) => i * (m + 1) + j;
  D[0] = 0;
  for (let i = 1; i <= n; i++) {
    const jc = Math.round((i * m) / n);
    for (let j = Math.max(1, jc - w); j <= Math.min(m, jc + w); j++) {
      const cost = Math.abs(A[i - 1]! - B[j - 1]!);
      D[idx(i, j)] = cost + Math.min(D[idx(i - 1, j)]!, D[idx(i, j - 1)]!, D[idx(i - 1, j - 1)]!);
    }
  }
  if (D[idx(n, m)]! >= INF) return null;
  const path: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const d = D[idx(i - 1, j - 1)]!;
    const u = D[idx(i - 1, j)]!;
    const l = D[idx(i, j - 1)]!;
    if (d <= u && d <= l) {
      i--;
      j--;
    } else if (u < l) i--;
    else j--;
  }
  path.reverse();
  return { meanCents: D[idx(n, m)]! / path.length, path };
}

/** Remove the overall offset (key difference) before comparing shapes: median-centre both contours. */
export function centre(c: number[]): number[] {
  const v = c.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!v.length) return c;
  const med = v[Math.floor(v.length / 2)]!;
  return c.map((x) => (Number.isFinite(x) ? x - med : x));
}
