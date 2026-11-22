// Content tests on the SHIPPED data (B13): word counts vs timings for all 114 surahs, checksums, annotation ranges,
// the four sakt places, the special Hafs words found by pattern, and the verbatim Tanzil text.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASMALA_WORDS, displayWords, hasBasmalaPrefix, normaliseArabic, tokenizeLine } from '../../src/data/quranText.ts';
import { RULES } from '../../src/data/rules.ts';

const index = JSON.parse(readFileSync('public/data/quran/index.json', 'utf8')) as {
  surahs: { n: number; ayas: number; file: string; sha256: string }[];
  text: { sha256: string };
};
const surahs = index.surahs.map((m) => ({ meta: m, raw: readFileSync(`public/data/quran/${m.file}`, 'utf8') }));
const data = surahs.map((x) => JSON.parse(x.raw) as { s: number; ayat: { t: string; tj: number[]; mm: number[]; mj: number[]; b?: number }[] });

describe('shipped Quran data', () => {
  it('has 114 surahs / 6236 ayat and every file matches its SHA-256', () => {
    expect(surahs).toHaveLength(114);
    expect(data.reduce((a, d) => a + d.ayat.length, 0)).toBe(6236);
    for (const { meta, raw } of surahs) expect(createHash('sha256').update(raw).digest('hex')).toBe(meta.sha256);
  });

  it('text is byte-identical to the committed Tanzil file (never changed)', () => {
    const src = readFileSync('data/source/tanzil/quran-uthmani.txt');
    expect(createHash('sha256').update(src).digest('hex')).toBe(index.text.sha256);
    const lines = new Map<string, string>();
    for (const l of src.toString('utf8').split('\n')) {
      const p = l.split('|');
      if (p.length === 3) lines.set(`${p[0]}:${p[1]}`, p[2]!);
    }
    for (const d of data) d.ayat.forEach((a, i) => expect(a.t).toBe(lines.get(`${d.s}:${i + 1}`)));
  });

  it('per-ayah word counts match the murattal and mujawwad timings across all 114 surahs', () => {
    let words = 0;
    for (const d of data)
      d.ayat.forEach((a, i) => {
        const n = displayWords(a.t).length - (hasBasmalaPrefix(d.s, i + 1) ? BASMALA_WORDS : 0);
        words += n;
        expect(a.mm.length / 3, `${d.s}:${i + 1} murattal`).toBe(n);
        expect(a.mj.length / 3, `${d.s}:${i + 1} mujawwad`).toBe(n);
        for (let k = 0; k < a.mm.length; k += 3) {
          expect(a.mm[k + 1]!).toBeGreaterThan(a.mm[k]!);
          if (k >= 3) expect(a.mm[k]!).toBeGreaterThanOrEqual(a.mm[k - 2]!);
        }
      });
    expect(words).toBe(77433);
  });

  it('annotation ranges are inside the ayah and refer to known rules', () => {
    for (const d of data)
      for (const a of d.ayat)
        for (let k = 0; k < a.tj.length; k += 4) {
          expect(RULES[a.tj[k]!]).toBeDefined();
          expect(a.tj[k + 1]!).toBeGreaterThanOrEqual(0);
          expect(a.tj[k + 2]!).toBeLessThanOrEqual(a.t.length);
          expect(a.tj[k + 2]!).toBeGreaterThan(a.tj[k + 1]!);
        }
  });

  it('qalqalah ranges contain one of ق ط ب ج د (B5 plausibility)', () => {
    const q = RULES.findIndex((r) => r.id === 'qalqalah');
    let n = 0;
    for (const d of data)
      for (const a of d.ayat)
        for (let k = 0; k < a.tj.length; k += 4)
          if (a.tj[k] === q) {
            n++;
            expect(/[قطبجد]/u.test(a.t.slice(a.tj[k + 1]!, a.tj[k + 2]!))).toBe(true);
          }
    expect(n).toBeGreaterThan(3000);
  });

  it('the four obligatory sakt places carry the sakt mark in the text (dataset)', () => {
    const hasSakt = (s: number, a: number) => tokenizeLine(data[s - 1]!.ayat[a - 1]!.t).some((t) => t.isMark && t.text.includes('ۜ'));
    for (const [s, a] of [[18, 1], [36, 52], [75, 27], [83, 14]] as const) expect(hasSakt(s, a), `${s}:${a}`).toBe(true);
  });

  it('finds the hamzat-istifham + hamzat-wasl words by pattern (ءَآل…), not by remembered verse numbers', () => {
    const hits: string[] = [];
    for (const d of data)
      d.ayat.forEach((a, i) => {
        // hamza + fatha + alif + maddah + lam: the istifham hamza before the hamzat-wasl of "al-"
        for (const w of displayWords(a.t)) if (/^\u0621\u064E\u0627\u0653\u0644/u.test(w.text)) hits.push(`${d.s}:${i + 1}`);
      });
    // Found in the shipped text on 2026-11-21 (dataset): 6:143, 6:144, 10:51, 10:59, 10:91, 27:59.
    expect(hits).toEqual(['6:143', '6:144', '10:51', '10:59', '10:91', '27:59']);
  });
});

describe('normaliseArabic (typo-tolerant answers)', () => {
  it('ignores harakat, small marks and alif forms (word loaded from the shipped data, not typed)', () => {
    const w = displayWords(data[0]!.ayat[1]!.t)[0]!.text; // 1:2 first word
    const bare = [...w].filter((c) => !/\p{Mn}/u.test(c)).join('').replace('\u0671', '\u0627');
    expect(normaliseArabic(w)).toBe(normaliseArabic(bare));
    expect(normaliseArabic('  بَ   تَ ')).toBe('ب ت');
  });
});

describe('typed Quran text guard (non-negotiable 1)', () => {
  it('no source file contains two consecutive Tanzil words typed by hand', () => {
    const pairs = new Set<string>();
    for (const d of data)
      for (const a of d.ayat) {
        const w = displayWords(a.t).map((x) => x.text);
        for (let i = 0; i + 1 < w.length; i++) pairs.add(`${w[i]} ${w[i + 1]}`);
      }
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${dir}/${e.name}`);
        else if (/\.(tsx?|json)$/.test(e.name) && !dir.includes('career/data')) files.push(`${dir}/${e.name}`);
      }
    };
    walk('src');
    walk('tests');
    const offenders: string[] = [];
    for (const f of files) {
      const txt = readFileSync(f, 'utf8');
      // eslint-disable-next-line no-misleading-character-class
      const arabicRuns = txt.match(/[؀-ۿݐ-ݿ][؀-ۿݐ-ݿ‌‍ ]+[؀-ۿ]/gu) ?? [];
      for (const run of arabicRuns) {
        const w = run.split(/\s+/);
        for (let i = 0; i + 1 < w.length; i++) if (pairs.has(`${w[i]} ${w[i + 1]}`)) offenders.push(`${f}: ${w[i]} ${w[i + 1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
