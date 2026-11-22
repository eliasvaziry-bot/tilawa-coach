import { useState } from 'preact/hooks';
import { mushafPlayer, nowAyah, playerError, playerState } from '../../audio/mushafPlayer.ts';
import { IconPause, IconPlay, IconStop } from './icons.tsx';
import { settings, updateSettings } from '../state.ts';

const RATES = [0.5, 0.6, 0.75, 0.9, 1];

export function PlayerBar() {
  const [loop, setLoop] = useState<{ a: number; b?: number } | null>(null);
  const st = playerState.value;
  const now = nowAyah.value;
  if (st === 'idle' || !now) return null;
  const rate = settings.value.rate;
  const loopLabel = !loop ? 'A–B' : loop.b === undefined ? `A=${loop.a} · set B` : `${loop.a}–${loop.b} ↻`;
  return (
    <div class="playerbar" role="region" aria-label="Recitation player">
      {st === 'playing' || st === 'loading' ? (
        <button class="iconbtn" aria-label="Pause" onClick={() => mushafPlayer.pause()}>
          <IconPause />
        </button>
      ) : (
        <button class="iconbtn" aria-label="Play" onClick={() => void mushafPlayer.resume()}>
          <IconPlay />
        </button>
      )}
      <div class="grow">
        <div>
          <b>{now.basmala ? 'Basmala' : `${now.surah}:${now.ayah}`}</b> · al-Minshawi {st === 'loading' ? '· loading…' : ''}
        </div>
        {playerError.value ? <div class="small" style={{ color: 'var(--err)' }}>{playerError.value}</div> : null}
      </div>
      <button
        class="btn small"
        aria-label={`A–B loop: ${loopLabel}`}
        onClick={() => {
          if (!loop) setLoop({ a: now.ayah });
          else if (loop.b === undefined) {
            const a = Math.min(loop.a, now.ayah);
            const b = Math.max(loop.a, now.ayah);
            setLoop({ a, b });
            mushafPlayer.setLoop(a, b);
          } else {
            setLoop(null);
            mushafPlayer.loopRange = null;
          }
        }}
      >
        {loopLabel}
      </button>
      <button
        class="btn small"
        aria-label={`Speed ${rate}×, tap to change`}
        onClick={() => {
          const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
          updateSettings({ rate: next });
          mushafPlayer.setRate(next);
        }}
      >
        {rate}×
      </button>
      <button
        class="iconbtn"
        aria-label="Stop"
        onClick={() => {
          setLoop(null);
          mushafPlayer.stop();
        }}
      >
        <IconStop />
      </button>
    </div>
  );
}
