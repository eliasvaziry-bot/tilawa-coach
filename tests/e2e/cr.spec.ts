import { test, expect } from '@playwright/test';

// M3 DoD: a full Al-Fatiha session works hands-free. A test-only "echo bot" (?crbot=1) repeats each call into the
// synthetic microphone (?fakemic=1) 100 ms after the cue, so every step must be heard, on time, the right length
// and with a close melody — and the session must advance on its own to the end.
test('hands-free Echo session over all of Al-Fatiha', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'uses Chromium autoplay flags');
  test.setTimeout(300_000);
  await page.goto('./?fakemic=1&crbot=1#/practice');
  await page.getByLabel(/Hands-free/).check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible({ timeout: 280_000 });
  const summary = (await page.locator('.card', { hasText: 'Session complete' }).textContent()) ?? '';
  console.log(summary.replace(/\s+/g, ' ').slice(0, 200));
  const m = /(\d+) of (\d+) steps heard · average score (\d+)\/100/.exec(summary)!;
  expect(m).not.toBeNull();
  expect(Number(m[1])).toBe(Number(m[2]));
  expect(Number(m[2])).toBeGreaterThanOrEqual(7);
  expect(Number(m[3])).toBeGreaterThanOrEqual(70);
});
