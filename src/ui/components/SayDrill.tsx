// Say → record → play back (Stage 0–1 drills and the placement ladder). No automatic check until M5.
// Tap Record, say it, tap Stop (it stops by itself after a while). A live meter shows the microphone is hearing you.
import { useEffect, useRef, useState } from 'preact/hooks';
import { startRecording, stopRecording } from '../../audio/mic.ts';
import { resumeAudio } from '../../audio/context.ts';
import { levels, isNoSignal, NO_SIGNAL_MESSAGE } from '../../audio/dsp/onsets.ts';
import { speakingLevelDb } from '../../audio/dsp/energy.ts';
import { say } from '../state.ts';
import { LevelMeter } from './AudioSetup.tsx';

export function SayDrill({ prompt, times, seconds = 2.5 }: { prompt: string; times: number; seconds?: number }) {
  const [take, setTake] = useState<{ pcm: Float32Array; sr: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const maxSeconds = Math.max(10, Math.round(seconds * 4));
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const stop = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    try {
      const r = await stopRecording();
      setTake({ pcm: r.pcm, sr: r.sr });
      const lv = levels(r.pcm);
      const speaking = speakingLevelDb(r.pcm, r.sr);
      setMsg(
        isNoSignal(lv)
          ? NO_SIGNAL_MESSAGE
          : lv.clippedPct > 0.05
            ? 'Too loud (clipping): hold the phone a little further away. Listen back:'
            : speaking < -50
              ? 'Recorded, but quiet: hold the phone about a hand-width from your mouth next time. Listen back:'
              : 'Recorded. Press Play mine and compare with the teacher.',
      );
    } catch (e) {
      say(`Microphone: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRecording(false);
    }
  };
  return (
    <div class="opp">
      <p style={{ margin: '0 0 6px' }}>
        {prompt} <span class="muted small">(× {times}; record the last one)</span>
      </p>
      <div class="row">
        <button
          class="btn small primary"
          onClick={async () => {
            if (recording) return void stop();
            try {
              await startRecording();
              setRecording(true);
              setMsg(null);
              timer.current = window.setTimeout(() => void stop(), maxSeconds * 1000);
            } catch (e) {
              say(`Microphone: ${e instanceof Error ? e.message : String(e)}`);
            }
          }}
        >
          {recording ? '■ Stop' : '● Record'}
        </button>
        <button
          class="btn small"
          disabled={!take || recording}
          onClick={async () => {
            if (!take) return;
            const c = await resumeAudio();
            const b = c.createBuffer(1, take.pcm.length, take.sr);
            b.copyToChannel(take.pcm as Float32Array<ArrayBuffer>, 0);
            const s = c.createBufferSource();
            s.buffer = b;
            s.connect(c.destination);
            s.start();
          }}
        >
          ▶ Play mine
        </button>
      </div>
      {recording ? (
        <div style={{ marginTop: 8 }}>
          <LevelMeter />
          <p class="small muted" style={{ margin: '4px 0 0' }}>
            Recording: say it now, then tap Stop. The bar moves when the microphone hears you.
          </p>
        </div>
      ) : null}
      {msg ? <p class="small">{msg}</p> : null}
    </div>
  );
}
