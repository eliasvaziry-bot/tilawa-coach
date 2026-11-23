import { render } from 'preact';
import './styles/app.css';
import { App } from './ui/app.tsx';
import { loadSettings } from './ui/state.ts';
import { initPwa, requestPersistence } from './ui/pwa.ts';
import { purgeExpiredQf } from './data/db.ts';
import { mushafPlayer, nowWord, playerState } from './audio/mushafPlayer.ts';
import { audioCtx } from './audio/context.ts';
import { connectLoopback } from './audio/mic.ts';

// Read-only hooks for automated tests and the Diagnostics screen (no personal data).
(window as unknown as { __tc: unknown }).__tc = {
  playerTimeMs: () => mushafPlayer.currentTimeMs,
  nowWord: () => nowWord.value,
  playerState: () => playerState.value,
};
// Test-only audio hooks (used by e2e with a fake microphone; harmless otherwise).
(window as unknown as { __tcAudio: unknown }).__tcAudio = { ctx: audioCtx, loop: connectLoopback };

async function start(): Promise<void> {
  await loadSettings();
  render(<App />, document.getElementById('app')!);
  // the offline cache (about 1.3 MB) starts downloading only after the page has loaded and settled, so it never
  // competes with the first screen on a slow connection
  const registerLater = () => setTimeout(() => void initPwa(), 3000);
  if (document.readyState === 'complete') registerLater();
  else window.addEventListener('load', registerLater, { once: true });
  void purgeExpiredQf(); // Quran Foundation data: never kept longer than 7 days
  // persistence must follow a user gesture on some browsers
  window.addEventListener('pointerdown', () => void requestPersistence(), { once: true });
}
void start();
