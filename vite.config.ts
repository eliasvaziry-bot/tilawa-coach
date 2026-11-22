import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project site: https://<user>.github.io/tilawa-coach/  (override with BASE_PATH)
const base = process.env.BASE_PATH ?? '/tilawa-coach/';
const STAGE01_SURAHS = [1, ...Array.from({ length: 48 }, (_, i) => 67 + i)];

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['fonts/*.ttf', 'fonts/*.txt', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Tilawa Coach',
        short_name: 'Tilawa',
        description: 'Personal recitation coach (Quran, tajweed, latmiya, shoor) with a private career desk.',
        lang: 'en-GB',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4efe4',
        theme_color: '#0f4c4a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the surahs Stage 0–1 lessons use (1 and 67–114, ~400 KB) are precached so lessons work offline (M-9)
        globPatterns: ['**/*.{js,css,html,ttf,png,svg,webmanifest}', 'data/quran/index.json', ...STAGE01_SURAHS.map((n) => `data/quran/s${String(n).padStart(3, '0')}.json`)],
        // data URLs carry ?v=<sha> for cache-busting; the precached copy has its own revision
        ignoreURLParametersMatching: [/^v$/, /^utm_/, /^fbclid$/],
        navigateFallback: 'index.html',
        sourcemap: false,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // per-surah Quran data + translations: versioned by SHA in index.json, safe to cache-first
            urlPattern: ({ url }) => url.pathname.includes('/data/quran/') || url.pathname.includes('/data/trans/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'quran-data', expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/feeds/') || url.pathname.includes('/data/career/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'app-feeds', networkTimeoutSeconds: 4 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600 },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    testTimeout: 30000,
  },
});
