import { defineConfig } from '@playwright/test';

const viewport = { width: 390, height: 844 };
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173/tilawa-coach/', trace: 'off', viewport, deviceScaleFactor: 2 },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/tilawa-coach/', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        permissions: ['microphone'],
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
      },
    },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /(screens|shaping)\.spec\.ts/ },
  ],
});
