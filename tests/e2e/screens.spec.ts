import { test, expect } from '@playwright/test';

// Screenshots for the B13 screen checklist at 390×844 and 430×932, light and dark.
const PAGES = [
  ['today', '#/today'],
  ['learn', '#/learn'],
  ['lesson', '#/learn/s1-01-ba-family'],
  ['mushaf-1', '#/mushaf/1'],
  ['mushaf-2', '#/mushaf/2'],
  ['mushaf-112', '#/mushaf/112'],
  ['credits', '#/credits'],
  ['settings', '#/settings'],
] as const;

for (const size of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`screens ${size.width}x${size.height} ${scheme}`, async ({ page, browserName }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [name, hash] of PAGES) {
        await page.goto(`./${hash}`);
        await page.waitForLoadState('networkidle');
        if (name.startsWith('mushaf')) await expect(page.locator('.quran').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        // nothing may overflow horizontally (B13)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${name} horizontal overflow`).toBeLessThanOrEqual(1);
        await page.screenshot({ path: `test-results/screens/${browserName}-${size.width}-${scheme}-${name}.png`, fullPage: false });
      }
    });
  }
}
