import { test, expect } from '@playwright/test';

// Lighthouse no longer has a PWA category, so ask Chrome directly (B4): manifest + icons + service worker.
test('installable PWA: no installability errors, service worker controls the page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP installability check is Chromium-only');
  await page.goto('./#/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker controls the page after a reload').toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: { errorId: string }[] };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
  const manifest = (await cdp.send('Page.getAppManifest')) as { url: string; errors: unknown[] };
  expect(manifest.errors).toEqual([]);
  for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) {
    const r = await page.request.get(`./${icon}`);
    expect(r.status(), icon).toBe(200);
  }
});
