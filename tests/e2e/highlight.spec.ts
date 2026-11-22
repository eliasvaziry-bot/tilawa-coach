import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// M1 DoD: highlighting follows Minshawi's audio within ~100 ms. Measures the app's own lag: when the highlighted
// word changes, the audio position must be inside that word's timing (allowing one frame + 100 ms).
test('Al-Fatiha highlighting follows the audio', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'audio autoplay is only enabled for the Chromium project');
  const data = JSON.parse(readFileSync('public/data/quran/s001.json', 'utf8')) as { ayat: { mm: number[] }[] };
  await page.goto('./#/mushaf/1');
  await expect(page.locator('.quran').first()).toBeVisible();
  // record every highlight change together with the audio position at that moment
  await page.evaluate(() => {
    const w = window as unknown as { __log: [number, number, number, number][]; __tc: { playerTimeMs: () => number } };
    w.__log = [];
    new MutationObserver(() => {
      const el = document.querySelector('.w.now') as HTMLElement | null;
      if (!el) return;
      const ayah = Number(el.closest('section.ayah')?.id.slice(1));
      w.__log.push([performance.now(), w.__tc.playerTimeMs(), ayah, Number(el.dataset.w)]);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __tc: { playerState: () => string } }).__tc.playerState() === 'playing', null, { timeout: 30_000 });
  await page.waitForTimeout(14_000);
  const log = (await page.evaluate(() => (window as unknown as { __log: [number, number, number, number][] }).__log)) as [number, number, number, number][];
  expect(log.length, 'highlight changed at least 6 times').toBeGreaterThanOrEqual(6);
  const errs: number[] = [];
  for (const [, t, ayah, word] of log) {
    const mm = data.ayat[ayah - 1]!.mm;
    const s = mm[word * 3]!;
    const e = mm[word * 3 + 1]!;
    // distance from the audio position to the word's [s, e] span (0 when inside)
    errs.push(t < s ? s - t : t > e ? t - e : 0);
  }
  errs.sort((a, b) => a - b);
  const p95 = errs[Math.floor(errs.length * 0.95)] ?? 0;
  console.log(`highlight changes: ${log.length}; max ${errs.at(-1)} ms; p95 ${p95} ms`);
  expect(errs.at(-1)!).toBeLessThanOrEqual(100);
});
