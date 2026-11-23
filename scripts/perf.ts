// Speed and smoothness on a phone profile, without Lighthouse (lab metrics measured in the page):
//  A. cold start in Chromium at 390×844 with DevTools "Slow 4G" + 4× CPU slowdown (Lighthouse's mobile profile):
//     first contentful paint, largest contentful paint, first screen (Today's greeting on screen), long tasks →
//     total blocking time and a time-to-interactive proxy (end of the last long task after first paint), bytes moved;
//  B. cold start in WebKit at 390×844 (no throttling available): first screen, DOMContentLoaded, load, first paint;
//  C. tapping through a lesson (Chromium, 4× CPU): long tasks when the lesson opens, on each step, and on starting a
//     practice quiz;
//  D. scrolling the lesson path (Chromium, 4× CPU): frames per second and long tasks.
// Usage: npm run build && node scripts/perf.ts [baseUrl]   (default: serves dist/ on a local port)
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, webkit, type BrowserContext, type Page } from '@playwright/test';

const RUNS = 3;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
const r0 = (x: number) => Math.round(x);

let server: ChildProcess | null = null;
async function baseUrl(): Promise<string> {
  if (process.argv[2]) return process.argv[2];
  server = spawn('npx', ['vite', 'preview', '--port', '4177', '--strictPort'], { stdio: 'ignore' });
  const url = 'http://localhost:4177/tilawa-coach/';
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

const OBSERVE = () => {
  const w = window as unknown as { __lt: [number, number][]; __lcp: number; __first: number };
  w.__lt = [];
  w.__lcp = 0;
  w.__first = 0;
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // WebKit: no long-task / LCP entries
  }
  const tick = () => {
    if (!w.__first && document.querySelector('main h2')) w.__first = performance.now();
    else if (!w.__first) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function throttle(ctx: BrowserContext, page: Page, net: boolean): Promise<void> {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (net) {
    await cdp.send('Network.enable');
    // DevTools-applied "Slow 4G" as Lighthouse uses it: 562.5 ms latency, 1474.56 kbps down, 675 kbps up
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 });
  }
}

async function coldStart(kind: 'chromium' | 'webkit', base: string) {
  const bt = kind === 'chromium' ? chromium : webkit;
  const out: Record<string, number>[] = [];
  for (let run = 0; run < RUNS; run++) {
    const b = await bt.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: kind === 'chromium', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(OBSERVE);
    if (kind === 'chromium') await throttle(ctx, page, true);
    await page.goto(`${base}#/today`, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction(() => (window as unknown as { __first: number }).__first > 0, null, { timeout: 60_000 });
    await page.waitForTimeout(kind === 'chromium' ? 6000 : 1500); // let start-up work finish
    const m = await page.evaluate(() => {
      const w = window as unknown as { __lt: [number, number][]; __lcp: number; __first: number };
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
      const after = w.__lt.filter(([s]) => s >= fcp);
      const tti = after.length ? Math.max(fcp, ...after.map(([s, d]) => s + d)) : Math.max(fcp, nav.domContentLoadedEventEnd);
      const tbt = after.reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
      const kb = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).reduce((a, r) => a + (r.transferSize || 0), nav.transferSize || 0) / 1024;
      return { fcp, lcp: w.__lcp, firstScreen: w.__first, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, tti, tbt, longTasks: w.__lt.length, maxLongTask: Math.max(0, ...w.__lt.map(([, d]) => d)), kb, requests: performance.getEntriesByType('resource').length + 1 };
    });
    out.push(m);
    await b.close();
  }
  const keys = Object.keys(out[0]!);
  return Object.fromEntries(keys.map((k) => [k, r0(median(out.map((o) => o[k]!)))]));
}

async function longTasksDuring(page: Page, act: () => Promise<void>): Promise<{ count: number; max: number; total: number }> {
  await page.evaluate(() => ((window as unknown as { __lt: [number, number][] }).__lt = []));
  await act();
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const lt = (window as unknown as { __lt: [number, number][] }).__lt;
    return { count: lt.length, max: Math.round(Math.max(0, ...lt.map(([, d]) => d))), total: Math.round(lt.reduce((a, [, d]) => a + d, 0)) };
  });
}

async function interactions(base: string) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(OBSERVE);
  await page.goto(`${base}#/today`);
  await page.getByRole('heading', { name: /Salam/ }).waitFor();
  await throttle(ctx, page, false);
  const res: Record<string, { count: number; max: number; total: number }> = {};
  res.openLesson = await longTasksDuring(page, async () => {
    await page.evaluate(() => (location.hash = '#/learn/s1-01-ba-family'));
    await page.getByRole('button', { name: 'Done — next step' }).waitFor();
  });
  for (let i = 1; i <= 4; i++)
    res[`step${i}`] = await longTasksDuring(page, async () => {
      await page.getByRole('button', { name: 'Done — next step' }).click();
      await page.getByText(`Step ${i + 1} of 7`).waitFor();
    });
  res.openCheck = await longTasksDuring(page, async () => {
    await page.getByRole('tab', { name: /Check/ }).click();
    await page.getByRole('button', { name: 'Practice quiz' }).waitFor();
  });
  res.startQuiz = await longTasksDuring(page, async () => {
    await page.getByRole('button', { name: 'Practice quiz' }).click({ timeout: 60_000 });
    await page.getByText(/^1 \/ \d+$/).waitFor({ timeout: 60_000 });
  });
  // D. scroll the lesson path for 2 s with a frame counter
  await page.evaluate(() => (location.hash = '#/learn'));
  await page.locator('ol.path').first().waitFor();
  const scroll = await page.evaluate(async () => {
    const w = window as unknown as { __lt: [number, number][] };
    w.__lt = [];
    window.scrollTo(0, 0);
    let frames = 0;
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const step = (t: number) => {
        frames++;
        window.scrollTo(0, ((t - t0) / 2000) * (document.documentElement.scrollHeight - innerHeight));
        if (t - t0 < 2000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    return { fps: Math.round(frames / ((performance.now() - t0) / 1000)), longTasks: w.__lt.length, maxLongTask: Math.round(Math.max(0, ...w.__lt.map(([, d]) => d))) };
  });
  await b.close();
  return { ...res, scroll };
}

const base = await baseUrl();
try {
  const result = { base: base.replace(/\/\/[^/]+\.github\.io\//, '//<site>/'), chromium: await coldStart('chromium', base), webkit: await coldStart('webkit', base), interactions: await interactions(base) };
  console.log(JSON.stringify(result, null, 1));
} finally {
  (server as ChildProcess | null)?.kill();
}
