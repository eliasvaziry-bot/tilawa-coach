// Regression guard for the independent rule engine (D-018): agreement with the rebuilt cpfair data must stay high, and
// data/derived/engine-compare.json (which drives the ENGINE_DISPUTED flags) must be current. Ayat are loaded from the
// shipped data, never typed (non-negotiable 1).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { annotate } from '../../src/data/ruleEngine.ts';
import { displayWords } from '../../src/data/quranText.ts';
import { engineDiff } from '../../scripts/lib/engine-diff.ts';

const index = JSON.parse(readFileSync('public/data/quran/index.json', 'utf8')) as { surahs: { file: string }[] };
const ayah = (s: number, a: number) => (JSON.parse(readFileSync(`public/data/quran/${index.surahs[s - 1]!.file}`, 'utf8')) as { ayat: { t: string }[] }).ayat[a - 1]!.t;
const rulesIn = (s: number, a: number) => annotate(ayah(s, a)).map((e) => e.rule);

describe('independent rule engine', () => {
  it('agrees with cpfair on ≥ 97% of locations for every rule family, and the saved comparison is current', () => {
    const { perRule, disputes } = engineDiff(process.cwd());
    expect(perRule.length).toBeGreaterThanOrEqual(18);
    for (const r of perRule) expect(r.agreePct, r.rule).toBeGreaterThanOrEqual(97);
    const saved = JSON.parse(readFileSync('data/derived/engine-compare.json', 'utf8')) as { disputeCount: number };
    expect(disputes.length, 'stale: run node scripts/engine-compare.ts, then the data build').toBe(saved.disputeCount);
  }, 120_000);
  it('marks hamzat al-wasl mid-ayah but not at the start of an ayah', () => {
    const en = annotate(ayah(1, 2));
    expect(en.some((e) => e.rule === 'hamzat_wasl' && e.start === 0)).toBe(false);
    expect(en.some((e) => e.rule === 'hamzat_wasl' && e.start > 0)).toBe(true);
  });
  it('letter names: no idgham after the name of noon (68:1), no qalqalah on the name of qaf (42:2)', () => {
    expect(rulesIn(68, 1)).not.toContain('idghaam_ghunnah');
    expect(rulesIn(42, 2)).not.toContain('qalqalah');
  });
  it('tanween before hamzat al-wasl takes no noon rule (2:180); a small noon is a noon sakinah (21:88)', () => {
    expect(rulesIn(2, 180)).not.toContain('idghaam_no_ghunnah');
    expect(rulesIn(21, 88)).toContain('ikhfa');
  });
  it('the upright zero is silent when joining but pronounced at the ayah end (33:10)', () => {
    const t = ayah(33, 10);
    const last = displayWords(t).at(-1)!;
    expect(annotate(t).some((e) => e.rule === 'silent' && e.start >= last.start)).toBe(false);
  });
});
