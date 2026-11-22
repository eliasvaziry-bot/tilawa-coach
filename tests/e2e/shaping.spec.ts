import { test, expect } from '@playwright/test';

// Tajweed colouring must not break letter joining (B4). The Highlight-API path never splits a word, so it cannot
// break shaping; the fallback path overlays a clipped full copy of each word (never splitting it). If joining broke,
// letters would take isolated forms and the word's width would change. Compare every word's width: plain vs fallback.
const SURAHS = [1, ...Array.from({ length: 37 }, (_, i) => 78 + i)]; // Al-Fatiha + all of Juz Amma (78–114)

for (const n of SURAHS) {
  test(`joining preserved with fallback colouring: surah ${n}`, async ({ page }) => {
    const widths = async (hash: string) => {
      await page.goto(`./?${hash.includes('fb') ? 'tjfallback=1' : ''}#/mushaf/${n}`);
      await expect(page.locator('.quran').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.w')].map((el) => [el.textContent ?? '', el.getBoundingClientRect().width] as [string, number]));
    };
    // plain: tajweed off
    await page.goto('./#/settings');
    await page.evaluate(async () => {
      const req = indexedDB.open('tilawa-coach', 1);
      await new Promise((r) => (req.onsuccess = r));
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ tajweed: false }, 'settings');
      await new Promise((r) => (tx.oncomplete = r));
    });
    const plain = await widths('plain');
    await page.evaluate(async () => {
      const req = indexedDB.open('tilawa-coach', 1);
      await new Promise((r) => (req.onsuccess = r));
      const tx = req.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ tajweed: true }, 'settings');
      await new Promise((r) => (tx.oncomplete = r));
    });
    const coloured = await widths('fb');
    expect(coloured.length).toBe(plain.length);
    const bad: string[] = [];
    plain.forEach(([, w], i) => {
      const c = coloured[i]![1];
      if (Math.abs(c - w) > Math.max(1.5, w * 0.03)) bad.push(`word ${i}: ${w.toFixed(1)} → ${c.toFixed(1)}px`);
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });
}
