// Small, dependency-free sequence alignment helpers for build scripts.

/**
 * Longest-common-subsequence alignment. Returns map[i] = index in b aligned to a[i], or -1.
 * O(n*m) memory/time; fine for single ayat (< ~1500 symbols).
 */
export function lcsMap<T>(a: readonly T[], b: readonly T[]): Int32Array {
  const n = a.length;
  const m = b.length;
  const map = new Int32Array(n).fill(-1);
  if (!n || !m) return map;
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      map[i] = j;
      i++;
      j++;
    } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) i++;
    else j++;
  }
  return map;
}

/**
 * Like lcsMap, but unmatched symbols inside a gap are mapped too: 1:1 when the gap has the same length on
 * both sides (a substitution, e.g. U+06E6 → U+06E7 re-encoding), otherwise to the gap's first position.
 * Returns the map and how many symbols were mapped through a gap (so callers can flag them).
 */
export function lcsMapFilled<T>(a: readonly T[], b: readonly T[]): { map: Int32Array; filled: Uint8Array } {
  const map = lcsMap(a, b);
  const filled = new Uint8Array(a.length);
  let i = 0;
  while (i < a.length) {
    if (map[i]! >= 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < a.length && map[j]! < 0) j++;
    const lo = i > 0 ? map[i - 1]! + 1 : 0;
    const hi = j < a.length ? map[j]! : b.length;
    const gapA = j - i;
    const gapB = hi - lo;
    for (let k = i; k < j; k++) {
      if (gapB <= 0) continue;
      map[k] = gapA === gapB ? lo + (k - i) : Math.min(hi - 1, lo + Math.floor(((k - i) * gapB) / gapA));
      filled[k] = 1;
    }
    i = j;
  }
  return { map, filled };
}

/** If `small` is a subsequence of `big` (greedy), return the index map small→big; otherwise null. */
export function subsequenceMap(small: string, big: string): Int32Array | null {
  const map = new Int32Array(small.length + 1);
  let j = 0;
  for (let i = 0; i < small.length; i++) {
    while (j < big.length && big[j] !== small[i]) j++;
    if (j >= big.length) return null;
    map[i] = j++;
  }
  map[small.length] = big.length;
  return map;
}
