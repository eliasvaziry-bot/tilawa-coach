// QF-SYNTHETIC: cross-check logic on synthetic inputs built from our own shipped Tanzil text (no Quran Foundation data).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareAyah, normaliseForTextCompare, parseTagged, skeleton, textDiff, CLASS_MAP } from '../../src/data/crosscheck.ts';
import { RULES, type RuleName } from '../../src/data/rules.ts';
import { BASMALA_WORDS, displayWords } from '../../src/data/quranText.ts';

const s112 = JSON.parse(readFileSync('public/data/quran/s112.json', 'utf8')) as { ayat: { t: string; tj: number[] }[] };
const ann = (tj: number[]) => {
  const out: { rule: RuleName; start: number; end: number }[] = [];
  for (let k = 0; k < tj.length; k += 4) out.push({ rule: RULES[tj[k]!]!.id, start: tj[k + 1]!, end: tj[k + 2]! });
  return out;
};
/** Build a fake "Quran.com" tagged line from our own text: wrap our own annotation ranges in tags (synthetic). */
function fakeTagged(text: string, anns: { cls: string; start: number; end: number }[]): string {
  let out = '';
  let i = 0;
  for (const a of [...anns].sort((x, y) => x.start - y.start)) {
    if (a.start < i) continue;
    out += text.slice(i, a.start) + `<tajweed class=${a.cls}>` + text.slice(a.start, a.end) + '</tajweed>';
    i = a.end;
  }
  return out + text.slice(i) + ' <span class=end>١</span>';
}
const clsFor = (rule: string) => Object.entries(CLASS_MAP).find(([, v]) => v.includes(rule as RuleName))![0];

describe('Quran.com markup parsing and alignment (synthetic)', () => {
  it('parses tags into plain text + ranges and drops the ayah-number span', () => {
    const p = parseTagged('ab<tajweed class=ham_wasl>c</tajweed>d <span class=end>١</span>');
    expect(p.text).toBe('abcd');
    expect(p.ranges).toEqual([{ cls: 'ham_wasl', start: 2, end: 3 }]);
  });
  it('skeleton keeps base letters and maps marks to their base', () => {
    const w = displayWords(s112.ayat[1]!.t)[0]!.text;
    const sk = skeleton(w);
    expect(sk.chars.length).toBeLessThan([...w].length);
    expect(sk.owner.length).toBe([...w].length);
  });
  it('agrees with itself: tags made from our own annotations confirm all of them', () => {
    const a = s112.ayat[1]!; // 112:2 (no basmala prefix)
    const ours = ann(a.tj);
    const tagged = fakeTagged(a.t, ours.map((o) => ({ cls: clsFor(o.rule), start: o.start, end: o.end })));
    const c = compareAyah(a.t, ours, tagged, 0);
    expect(c.oursOnly).toEqual([]);
    expect(c.qfOnly).toEqual([]);
    expect(c.confirmed).toBe(ours.length);
  });
  it('flags a rule missing from the other source, and one the other source adds', () => {
    const a = s112.ayat[0]!; // 112:1 with Tanzil's basmala prefix
    const words = displayWords(a.t);
    const prefixEnd = words[BASMALA_WORDS]!.start;
    const ours = ann(a.tj).filter((o) => o.start >= prefixEnd);
    expect(ours.length).toBeGreaterThan(1);
    const theirs = ours.slice(1).map((o) => ({ cls: clsFor(o.rule), start: o.start - prefixEnd, end: o.end - prefixEnd }));
    const tail = a.t.slice(prefixEnd);
    theirs.push({ cls: 'ghunnah', start: 0, end: 1 }); // something we do not have
    const c = compareAyah(a.t, ann(a.tj), fakeTagged(tail, theirs), prefixEnd);
    expect(c.oursOnly.map((x) => x.rule)).toEqual([ours[0]!.rule]);
    expect(c.qfOnly.map((x) => x.cls)).toContain('ghunnah');
  });
});

describe('text cross-check (documented normalisation)', () => {
  it('identical after normalisation when only pause marks / sukun form differ', () => {
    const t = s112.ayat[1]!.t;
    const variant = t.replace(/ْ/gu, 'ۡ');
    expect(textDiff(normaliseForTextCompare(t), normaliseForTextCompare(variant))).toEqual([]);
  });
  it('reports a real letter difference with its position', () => {
    const t = normaliseForTextCompare(s112.ayat[1]!.t);
    const changed = t.slice(0, 3) + 'X' + t.slice(4);
    const d = textDiff(t, changed);
    expect(d).toHaveLength(1);
    expect(d[0]!.at).toBe(3);
    expect(d[0]!.theirs).toBe('X');
  });
});
