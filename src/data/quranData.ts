// Lazy loaders for the shipped per-surah Quran data (verified against SHA-256 in index.json).
import { BASMALA_WORDS, displayWords, type DisplayWord } from './quranText.ts';
import { RULES, type RuleInfo } from './rules.ts';

export interface SurahMeta {
  n: number;
  name: string;
  tname: string;
  ename: string;
  type: string;
  order: number;
  ayas: number;
  file: string;
  bytes: number;
  sha256: string;
}
export interface QuranIndex {
  v: number;
  text: { source: string; sha256: string; options: string };
  rules: string[];
  annFlags: Record<string, number>;
  timingFlags: Record<string, number>;
  surahs: SurahMeta[];
  juz: [number, number][];
  pages: [number, number][];
  sajdas: { s: number; a: number; type: string }[];
}
export interface RawAyah {
  t: string;
  tj: number[];
  mm: number[];
  mj: number[];
  b?: number;
  mmT?: number[];
  mjT?: number[];
  mp?: 1;
  jp?: 1;
}
export interface Annotation {
  rule: RuleInfo;
  start: number;
  end: number;
  flags: number;
}
export interface WordTiming {
  s: number;
  e: number;
  f: number;
}
export interface Ayah {
  surah: number;
  ayah: number;
  text: string; // verbatim Tanzil line
  words: DisplayWord[]; // including basmala words when present
  basmalaWords: number; // 0 or 4
  annotations: Annotation[];
  murattal: WordTiming[]; // aligned with words.slice(basmalaWords)
  mujawwad: WordTiming[];
  mujawwadTimeline?: [number, number, number][];
  /** true when the shipped timings were already snapped to pauses measured in the audio (build time) */
  pausesMeasured: { murattal: boolean; mujawwad: boolean };
}

const BASE = import.meta.env?.BASE_URL ?? '/';
let indexPromise: Promise<QuranIndex> | null = null;
const surahCache = new Map<number, Promise<Ayah[]>>();

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null; // SubtleCrypto needs a secure context; skip the check rather than fail
  }
}

export function loadIndex(fetcher: typeof fetch = fetch): Promise<QuranIndex> {
  if (!indexPromise) {
    indexPromise = fetcher(`${BASE}data/quran/index.json`).then((r) => {
      if (!r.ok) throw new Error(`index.json: HTTP ${r.status}`);
      return r.json() as Promise<QuranIndex>;
    });
    indexPromise.catch(() => (indexPromise = null));
  }
  return indexPromise;
}

const triples = (arr: number[]): WordTiming[] => {
  const out: WordTiming[] = [];
  for (let i = 0; i + 2 < arr.length; i += 3) out.push({ s: arr[i]!, e: arr[i + 1]!, f: arr[i + 2]! });
  return out;
};

export function decodeAyah(surah: number, ayah: number, raw: RawAyah): Ayah {
  const annotations: Annotation[] = [];
  for (let i = 0; i + 3 < raw.tj.length; i += 4) {
    const rule = RULES[raw.tj[i]!];
    if (rule) annotations.push({ rule, start: raw.tj[i + 1]!, end: raw.tj[i + 2]!, flags: raw.tj[i + 3]! });
  }
  const tl = raw.mjT;
  return {
    surah,
    ayah,
    text: raw.t,
    words: displayWords(raw.t),
    basmalaWords: raw.b ?? 0,
    annotations,
    murattal: triples(raw.mm),
    mujawwad: triples(raw.mj),
    pausesMeasured: { murattal: raw.mp === 1, mujawwad: raw.jp === 1 },
    mujawwadTimeline: tl ? Array.from({ length: tl.length / 3 }, (_, i) => [tl[i * 3]!, tl[i * 3 + 1]!, tl[i * 3 + 2]!] as [number, number, number]) : undefined,
  };
}

export function loadSurah(n: number, fetcher: typeof fetch = fetch): Promise<Ayah[]> {
  let p = surahCache.get(n);
  if (!p) {
    p = (async () => {
      const idx = await loadIndex(fetcher);
      const meta = idx.surahs[n - 1];
      if (!meta) throw new Error(`no surah ${n}`);
      // version-stamped URL: a data update can never be served from a stale cache entry
      const url = `${BASE}data/quran/${meta.file}?v=${meta.sha256.slice(0, 12)}`;
      let r = await fetcher(url);
      if (!r.ok) throw new Error(`${meta.file}: HTTP ${r.status}`);
      let buf = await r.arrayBuffer();
      let h = await sha256Hex(buf);
      if (h && h !== meta.sha256) {
        r = await fetcher(url, { cache: 'reload' });
        buf = await r.arrayBuffer();
        h = await sha256Hex(buf);
        if (h && h !== meta.sha256) throw new Error(`${meta.file}: checksum mismatch (data corrupted or out of date) — reload the app`);
      }
      const data = JSON.parse(new TextDecoder().decode(buf)) as { v: number; s: number; ayat: RawAyah[] };
      return data.ayat.map((raw, i) => decodeAyah(n, i + 1, raw));
    })();
    p.catch(() => surahCache.delete(n));
    surahCache.set(n, p);
  }
  return p;
}

export async function loadTranslation(id: string, n: number): Promise<string[] | null> {
  try {
    const r = await fetch(`${BASE}data/trans/${id}/s${String(n).padStart(3, '0')}.json`);
    if (!r.ok) return null;
    const j = (await r.json()) as string[] | { notice: string; ayat: string[] };
    return Array.isArray(j) ? j : j.ayat;
  } catch {
    return null;
  }
}

/** Words of the ayah proper (basmala prefix removed) — these align with the timings. */
export function recitedWords(a: Ayah): DisplayWord[] {
  return a.words.slice(a.basmalaWords);
}
export { BASMALA_WORDS };

export function arabicNumber(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]!);
}
