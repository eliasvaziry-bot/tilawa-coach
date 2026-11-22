// Location-by-location comparison of the shipped (rebuilt cpfair) annotations with our independent rule engine
// (src/data/ruleEngine.ts). Matching: same rule, ranges overlapping within ±1 letter. Used by scripts/engine-compare.ts
// (which saves data/derived/engine-compare.json) and by the unit test that checks the saved file is current.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { annotate } from '../../src/data/ruleEngine.ts';
import { RULES } from '../../src/data/rules.ts';
import { BASMALA_WORDS, displayWords, hasBasmalaPrefix } from '../../src/data/quranText.ts';

/** surah, ayah, side, rule, start, end (code-point offsets into the Tanzil line) */
export type Dispute = [number, number, 'cpfair-only' | 'engine-only', string, number, number];
export interface RuleRow {
  rule: string;
  both: number;
  cpfairOnly: number;
  engineOnly: number;
  agreePct: number;
}

const near = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start <= b.end + 1 && b.start <= a.end + 1;
const wordAt = (t: string, i: number) => {
  const e = t.indexOf(' ', i);
  return t.slice(t.lastIndexOf(' ', i) + 1, e < 0 ? t.length : e);
};
/** The Name of Allah, with any prefix or the question hamza (10:59): cpfair does not colour its article lam (a display
 *  convention). */
const nameOfAllah = (w: string) => /[ٱا]لله$/u.test(w.replace(/\p{Mn}/gu, ''));

export function engineDiff(root: string): { perRule: RuleRow[]; disputes: Dispute[] } {
  const index = JSON.parse(readFileSync(join(root, 'public/data/quran/index.json'), 'utf8')) as { surahs: { file: string }[] };
  const per: Record<string, { both: number; cpfairOnly: number; engineOnly: number }> = {};
  const disputes: Dispute[] = [];
  for (let s = 1; s <= 114; s++) {
    const d = JSON.parse(readFileSync(join(root, 'public/data/quran', index.surahs[s - 1]!.file), 'utf8')) as { ayat: { t: string; tj: number[] }[] };
    d.ayat.forEach((a, i) => {
      const ay = i + 1;
      const prefixEnd = hasBasmalaPrefix(s, ay) ? displayWords(a.t)[BASMALA_WORDS]!.start : 0;
      const cp: { rule: string; start: number; end: number; used: boolean }[] = [];
      for (let k = 0; k < a.tj.length; k += 4) if (a.tj[k + 1]! >= prefixEnd) cp.push({ rule: RULES[a.tj[k]!]!.id, start: a.tj[k + 1]!, end: a.tj[k + 2]!, used: false });
      const en = annotate(a.t, { prefixEnd }).filter((e) => !(e.rule === 'lam_shamsiyyah' && a.t[e.end] === 'ل' && nameOfAllah(wordAt(a.t, e.start))));
      for (const e of en) {
        const m = cp.find((c) => !c.used && c.rule === e.rule && near(c, e));
        const st = (per[e.rule] ??= { both: 0, cpfairOnly: 0, engineOnly: 0 });
        if (m) {
          m.used = true;
          st.both++;
        } else {
          st.engineOnly++;
          disputes.push([s, ay, 'engine-only', e.rule, e.start, e.end]);
        }
      }
      for (const c of cp)
        if (!c.used) {
          (per[c.rule] ??= { both: 0, cpfairOnly: 0, engineOnly: 0 }).cpfairOnly++;
          disputes.push([s, ay, 'cpfair-only', c.rule, c.start, c.end]);
        }
    });
  }
  const perRule = Object.entries(per)
    .map(([rule, v]) => ({ rule, ...v, agreePct: +((v.both / Math.max(1, v.both + v.cpfairOnly + v.engineOnly)) * 100).toFixed(1) }))
    .sort((a, b) => b.both + b.cpfairOnly - (a.both + a.cpfairOnly));
  return { perRule, disputes };
}
