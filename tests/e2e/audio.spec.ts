import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// M2 DoD: latency calibration repeatable within 20 ms on desktop Chrome. Headless Chrome has no real speaker→mic
// path, so the clicks are looped back into the mic analysis input through a DelayNode of a known length
// (?loopback=87). This exercises the real pipeline: scheduling, worklet capture + timestamps, onsets, matching.
const silentWav = resolve('tests/fixtures/generated/silence.wav');
mkdirSync('tests/fixtures/generated', { recursive: true });
{
  const sr = 48000;
  const n = sr * 2;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  writeFileSync(silentWav, b);
}
test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${silentWav}`, '--autoplay-policy=no-user-gesture-required'] },
});

test('loudspeaker calibration measures a known 87 ms loop and repeats within 20 ms', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'fake microphone flags are Chromium-only');
  test.setTimeout(90_000);
  await page.goto('./?fakemic=1&loopback=87#/audio');
  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await expect(page.getByRole('heading', { name: '4 · Latency calibration' })).toBeVisible();
  const start = page.locator('.card', { hasText: '4 · Latency calibration' }).getByRole('button', { name: /^(Start|Run again)$/ });
  for (let i = 0; i < 3; i++) {
    await start.click();
    await expect(start).toHaveText('Run again', { timeout: 20_000 });
  }
  const runsText = (await page.locator('.card', { hasText: '4 · Latency calibration' }).locator('p.small', { hasText: 'Runs:' }).textContent()) ?? '';
  const ms = [...runsText.matchAll(/(\d+) ms \(±/g)].map((m) => Number(m[1]));
  console.log(`calibration runs: ${ms.join(', ')} ms`);
  expect(ms).toHaveLength(3);
  for (const v of ms) expect(Math.abs(v - 87)).toBeLessThanOrEqual(25); // + worklet block quantisation
  expect(Math.max(...ms) - Math.min(...ms)).toBeLessThanOrEqual(20);
});

test('live pitch shows a note for a sung tone (worklet YIN)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'fake microphone flags are Chromium-only');
  await page.goto('./?fakemic=1#/audio');
  await page.getByRole('button', { name: 'Allow microphone' }).click();
  await expect(page.getByText('synthetic test microphone')).toBeVisible();
  // feed a 220 Hz tone into the analysis input through the test hook
  await page.evaluate(async () => {
    const w = window as unknown as { __tcAudio: { ctx: () => AudioContext; loop: (n: AudioNode) => () => void } };
    const c = w.__tcAudio.ctx();
    const o = c.createOscillator();
    o.frequency.value = 220;
    const g = c.createGain();
    g.gain.value = 0.3;
    o.connect(g);
    w.__tcAudio.loop(g);
    o.start();
  });
  await expect(page.getByText(/Now: A3 · 2[12]\d Hz/)).toBeVisible({ timeout: 10_000 });
});
