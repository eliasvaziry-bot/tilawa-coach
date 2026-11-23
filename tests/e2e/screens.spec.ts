import { test, expect } from '@playwright/test';

// Screenshots for the B13 screen checklist at 390×844 and 430×932, light and dark.
const PAGES = [
  ['today', '#/today'],
  ['learn', '#/learn'],
  ['practice', '#/practice'],
  ['surah-list', '#/mushaf'],
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
        // operable on a phone: every control at least 44 px (inline links in running text excepted), and nothing in
        // the page hidden behind the bottom tab bar once scrolled to the end
        const problems = await page.evaluate(() => {
          const out: string[] = [];
          const vis = (e: Element) => {
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.classList.contains('sr-only');
          };
          for (const e of document.querySelectorAll('button, a.btn, [role=tab], [role=radio], select, input:not([type=hidden])')) {
            if (!vis(e) || e.closest('.bottomnav')) continue;
            const box = (e.matches('input[type=checkbox], input[type=radio]') ? (e.closest('label') ?? e) : e).getBoundingClientRect();
            if (box.height < 43.5 || box.width < 43.5) out.push(`${e.tagName} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
          }
          window.scrollTo(0, document.documentElement.scrollHeight);
          const navTop = document.querySelector('.bottomnav')!.getBoundingClientRect().top;
          const items = [...document.querySelectorAll('main button, main a, main input, main select')].filter(vis);
          const last = items[items.length - 1];
          if (last && last.getBoundingClientRect().bottom > navTop + 1) out.push(`hidden behind the tab bar: "${(last.textContent || '').trim().slice(0, 24)}"`);
          window.scrollTo(0, 0);
          return out;
        });
        expect(problems, `${name}: small or hidden controls`).toEqual([]);
        await page.screenshot({ path: `test-results/screens/${browserName}-${size.width}-${scheme}-${name}.png`, fullPage: false });
      }
    });
  }
}
