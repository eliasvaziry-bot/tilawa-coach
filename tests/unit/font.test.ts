// Font test (B13): every code point used in the shipped Quran text has a glyph in Amiri Quran (no empty boxes).
// Reads the TrueType cmap directly (formats 4 and 12). Visual confirmation: Playwright screenshots in test-results/.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function cmapCoverage(buf: Buffer): Set<number> {
  const numTables = buf.readUInt16BE(4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') cmapOff = buf.readUInt32BE(rec + 8);
  }
  if (cmapOff < 0) throw new Error('no cmap');
  const cps = new Set<number>();
  const n = buf.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < n; i++) {
    const sub = cmapOff + buf.readUInt32BE(cmapOff + 4 + i * 8 + 4);
    const format = buf.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = buf.readUInt16BE(ends + s * 2);
        const start = buf.readUInt16BE(starts + s * 2);
        const delta = buf.readInt16BE(deltas + s * 2);
        const ro = buf.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g: number;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const gi = buf.readUInt16BE(ranges + s * 2 + ro + (c - start) * 2);
            g = gi === 0 ? 0 : (gi + delta) & 0xffff;
          }
          if (g !== 0) cps.add(c);
        }
      }
    } else if (format === 12) {
      const groups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const o = sub + 16 + g * 12;
        const a = buf.readUInt32BE(o);
        const b = buf.readUInt32BE(o + 4);
        for (let c = a; c <= b; c++) cps.add(c);
      }
    }
  }
  return cps;
}

describe('Amiri Quran covers the shipped text', () => {
  it('has a glyph for every code point in the Tanzil text', () => {
    const cps = cmapCoverage(readFileSync('public/fonts/AmiriQuran.ttf'));
    const text = readFileSync('data/source/tanzil/quran-uthmani.txt', 'utf8')
      .split('\n')
      .filter((l) => /^\d+\|\d+\|/.test(l))
      .map((l) => l.split('|')[2])
      .join('');
    const used = new Set([...text].map((c) => c.codePointAt(0)!));
    const missing = [...used].filter((c) => c !== 0x20 && !cps.has(c)).map((c) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`);
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(40);
  });
  it('has the ayah-end sign and Arabic-Indic digits used by the reader', () => {
    const cps = cmapCoverage(readFileSync('public/fonts/AmiriQuran.ttf'));
    for (const c of [0x06dd, 0x0660, 0x0669]) expect(cps.has(c)).toBe(true);
  });
});
