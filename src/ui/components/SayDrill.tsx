// Say → record → play back (Stage 0–1 drills and the placement ladder). No automatic check until M5.
import { useState } from 'preact/hooks';
import { openMic, startRecording, stopRecording } from '../../audio/mic.ts';
import { resumeAudio } from '../../audio/context.ts';
import { levels } from '../../audio/dsp/onsets.ts';
import { say } from '../state.ts';

export function SayDrill({ prompt, times, seconds = 2.5 }: { prompt: string; times: number; seconds?: number }) {
  const [take, setTake] = useState<{ pcm: Float32Array; sr: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div class="opp">
      <p style={{ margin: '0 0 6px' }}>
        {prompt} <span class="muted small">(× {times}; record the last one)</span>
      </p>
      <div class="row">
        <button
          class="btn small primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await openMic();
              await startRecording();
              await new Promise((r) => setTimeout(r, seconds * 1000));
              const r = await stopRecording();
              setTake({ pcm: r.pcm, sr: r.sr });
              const lv = levels(r.pcm);
              setMsg(lv.rmsDb < -45 ? 'Too quiet — try again a little closer.' : lv.clippedPct > 0.05 ? 'Too loud (clipping) — move back a little.' : 'Recorded. Listen and compare with the teacher.');
            } catch (e) {
              say(`Microphone: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? `Recording ${seconds} s…` : 'Record'}
        </button>
        <button
          class="btn small"
          disabled={!take}
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
          Play mine
        </button>
      </div>
      {msg ? <p class="small">{msg}</p> : null}
    </div>
  );
}
