// Audio setup building blocks — used by the Audio lab and by the Stage 0 setup lessons.
import { useEffect, useRef, useState } from 'preact/hooks';
import { micError, micInfo, micLevel, onPitch, openMic, startRecording, stopRecording, type Recording } from '../../audio/mic.ts';
import { calibrate, outputKey, type CalResult } from '../../audio/calibration.ts';
import { metronome, metronomeOn, tapTempo, type Pattern } from '../../audio/metronome.ts';
import { audioCtx, resumeAudio } from '../../audio/context.ts';
import { judgeInput, levels } from '../../audio/dsp/onsets.ts';
import { hzToCents, medianPitch, noteName, pitchTrack } from '../../audio/dsp/pitch.ts';
import { pitchShift, resampleTo } from '../../audio/dsp/stretch.ts';
import { ayahBuffer } from '../../audio/everyayah.ts';
import { markSetup, settings, updateSettings, say } from '../state.ts';
import { ReviewBadge } from './ReviewBadge.tsx';

export function LevelMeter() {
  const l = micLevel.value;
  const pct = l ? Math.max(0, Math.min(100, ((l.rmsDb + 60) / 60) * 100)) : 0;
  const hot = !!l && l.peak >= 0.98;
  return (
    <div class={`meter${hot ? ' hot' : ''}`} role="meter" aria-label="Microphone level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={l ? Math.round(l.rmsDb) : -60}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MicCard({ onReady }: { onReady?: () => void }) {
  const info = micInfo.value;
  return (
    <div class="card">
      <h2>1 · Microphone</h2>
      {!info ? (
        <>
          <p class="small">The app listens only while you practise. Recordings stay on this phone.</p>
          <button
            class="btn primary"
            onClick={async () => {
              try {
                await openMic();
                markSetup('mic');
                onReady?.();
              } catch (e) {
                if (!micError.value) say(`Microphone error: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          >
            Allow microphone
          </button>
          {micError.value ? <p class="notice warn small">{micError.value}</p> : null}
        </>
      ) : (
        <>
          <p class="small" style={{ marginTop: 0 }}>
            <b>{info.label}</b> · {info.sampleRate} Hz · processing {info.processingOff ? 'off (best for analysis)' : 'on (fallback)'}
          </p>
          <LevelMeter />
          {info.bluetooth ? (
            <p class="notice warn small">
              Bluetooth detected. Bluetooth adds a big delay and can switch the mic to a low-quality headset mode. For checks,
              use wired headphones (or the phone speaker) and calibrate latency for each.
            </p>
          ) : (
            <p class="small muted">Tip: wired headphones give the cleanest analysis.</p>
          )}
        </>
      )}
    </div>
  );
}

async function recordFor(ms: number): Promise<Recording> {
  await startRecording();
  await new Promise((r) => setTimeout(r, ms));
  return stopRecording();
}

export function NoiseCard() {
  const [floor, setFloor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div class="card">
      <h2>2 · Room noise</h2>
      <p class="small">Stay silent for 2 seconds.</p>
      <button
        class="btn"
        disabled={busy || !micInfo.value}
        onClick={async () => {
          setBusy(true);
          const r = await recordFor(2000);
          setFloor(levels(r.pcm).rmsDb);
          markSetup('noise');
          setBusy(false);
        }}
      >
        {busy ? 'Listening…' : 'Measure noise'}
      </button>
      {floor !== null ? (
        <p class={`small ${floor > -45 ? 'notice warn' : ''}`}>
          Noise floor {floor.toFixed(0)} dB — {floor > -45 ? 'noisy: checks will be less reliable here.' : floor > -55 ? 'fine.' : 'very quiet. Good.'}
        </p>
      ) : null}
    </div>
  );
}

export function RecordTestCard() {
  const [rec, setRec] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  return (
    <div class="card">
      <h2>3 · Test recording</h2>
      <div class="task-now">
        <b>YOUR TASK NOW:</b> press Record and say "Bismillah" once at your normal reciting volume.
      </div>
      <div class="row" style={{ marginTop: 10 }}>
        <button
          class="btn primary"
          disabled={busy || !micInfo.value}
          onClick={async () => {
            setBusy(true);
            const floor = levels((await recordFor(600)).pcm).rmsDb;
            const r = await recordFor(3000);
            setRec(r);
            const j = judgeInput(levels(r.pcm), floor);
            setVerdict(j.message);
            if (j.verdict === 'ok') markSetup('record');
            setBusy(false);
          }}
        >
          {busy ? 'Recording…' : 'Record 3 s'}
        </button>
        <button
          class="btn"
          disabled={!rec}
          onClick={async () => {
            if (!rec) return;
            const c = await resumeAudio();
            const b = c.createBuffer(1, rec.pcm.length, rec.sr);
            b.copyToChannel(rec.pcm as Float32Array<ArrayBuffer>, 0);
            const s = c.createBufferSource();
            s.buffer = b;
            s.connect(c.destination);
            s.start();
          }}
        >
          Play back
        </button>
      </div>
      {verdict ? <p class="small">{verdict}</p> : null}
    </div>
  );
}

export function LatencyCard() {
  const [route, setRoute] = useState<'speaker' | 'wired' | 'bluetooth'>('speaker');
  const [runs, setRuns] = useState<CalResult[]>([]);
  const [tick, setTick] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = route === 'speaker' ? 'speaker' : 'clap';
  const lat = settings.value.latencyMs;
  const spread = runs.length >= 2 ? Math.max(...runs.map((r) => r.ms)) - Math.min(...runs.map((r) => r.ms)) : null;
  return (
    <div class="card">
      <h2>4 · Latency calibration</h2>
      <p class="small">
        Every phone and headphone adds a delay. Measuring it lets the app judge your timing fairly. Do it once per output
        (speaker, wired, Bluetooth).
      </p>
      <div class="row" role="radiogroup" aria-label="Output">
        {(['speaker', 'wired', 'bluetooth'] as const).map((r) => (
          <button key={r} class={`btn small${route === r ? ' primary' : ''}`} role="radio" aria-checked={route === r} onClick={() => setRoute(r)}>
            {r === 'speaker' ? 'Phone speaker' : r === 'wired' ? 'Wired headphones' : 'Bluetooth'}
          </button>
        ))}
      </div>
      <div class="task-now" style={{ marginTop: 10 }}>
        <b>YOUR TASK NOW:</b> {mode === 'speaker' ? 'put the phone on a table, stay quiet, press Start. It plays 8 clicks and listens to them.' : 'press Start and clap along with the 10 clicks (headphones: the mic cannot hear the clicks, so your claps are measured).'}
      </div>
      <div class="row" style={{ marginTop: 10 }}>
        <button
          class="btn primary"
          disabled={busy || !micInfo.value}
          onClick={async () => {
            setBusy(true);
            try {
              const lb = /[?&]loopback=(\d+)/.exec(location.search)?.[1];
              const r = await calibrate(mode, (i, n) => setTick([i + 1, n]), lb ? Number(lb) : undefined);
              if (!r) say('Could not hear enough clicks. Turn the volume up, or clap more clearly, and try again.');
              else {
                const next = [...runs, r].slice(-5);
                setRuns(next);
                const sorted = next.map((x) => x.ms).sort((a, b) => a - b);
                const key = await outputKey(route);
                updateSettings({ latencyMs: { ...settings.value.latencyMs, [key]: sorted[Math.floor(sorted.length / 2)]! } });
                markSetup('latency');
              }
            } finally {
              setTick(null);
              setBusy(false);
            }
          }}
        >
          {busy ? (tick ? `Click ${tick[0]} of ${tick[1]}…` : 'Starting…') : runs.length ? 'Run again' : 'Start'}
        </button>
      </div>
      {runs.length ? (
        <p class="small">
          Runs: {runs.map((r) => `${r.ms} ms (±${r.spreadMs}, ${r.used}/${r.of})`).join(' · ')}
          {spread !== null ? (
            <>
              <br />
              Repeatability: {spread} ms between runs {spread <= 20 ? '— consistent.' : '— not consistent yet; run again in a quieter spot.'}
            </>
          ) : null}
        </p>
      ) : null}
      {Object.keys(lat).length ? (
        <p class="small muted">
          Saved:{' '}
          {Object.entries(lat)
            .map(([k, v]) => `${k.split(':')[0]} ${v} ms`)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

export function PitchGraph({ seconds = 6, tonicHz }: { seconds?: number; tonicHz: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState<string>('–');
  useEffect(() => {
    const pts: { t: number; c: number }[] = [];
    let raf = 0;
    const off = onPitch((p) => {
      if (p.hz > 0 && p.clarity > 0.75) {
        pts.push({ t: p.t, c: hzToCents(p.hz, tonicHz) });
        setNow(`${noteName(p.hz)} · ${Math.round(p.hz)} Hz`);
      }
    });
    const draw = () => {
      const cv = canvas.current;
      if (cv) {
        const ctx2 = cv.getContext('2d')!;
        const w = (cv.width = cv.clientWidth * devicePixelRatio);
        const h = (cv.height = cv.clientHeight * devicePixelRatio);
        const css = getComputedStyle(cv);
        ctx2.clearRect(0, 0, w, h);
        const tNow = audioCtx().currentTime;
        const lo = -600;
        const hi = 1500;
        const y = (c: number) => h - ((c - lo) / (hi - lo)) * h;
        ctx2.strokeStyle = css.getPropertyValue('--line') || '#ccc';
        ctx2.lineWidth = 1;
        for (let c = lo; c <= hi; c += 100) {
          ctx2.globalAlpha = c % 1200 === 0 ? 0.9 : 0.35;
          ctx2.beginPath();
          ctx2.moveTo(0, y(c));
          ctx2.lineTo(w, y(c));
          ctx2.stroke();
        }
        ctx2.globalAlpha = 1;
        ctx2.fillStyle = css.getPropertyValue('--primary') || '#0f4c4a';
        while (pts.length && pts[0]!.t < tNow - seconds) pts.shift();
        for (const p of pts) ctx2.fillRect(((p.t - (tNow - seconds)) / seconds) * w, y(p.c) - 2 * devicePixelRatio, 3 * devicePixelRatio, 4 * devicePixelRatio);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [tonicHz]);
  return (
    <div>
      <canvas ref={canvas} class="graph" aria-label="Live pitch graph" />
      <p class="small" aria-live="polite">
        Now: {now} · lines every semitone; thick lines = your tonic and its octave
      </p>
    </div>
  );
}

export function RangeCard() {
  const s = settings.value;
  const [busy, setBusy] = useState<'low' | 'high' | null>(null);
  const measure = async (which: 'low' | 'high') => {
    setBusy(which);
    const r = await recordFor(2500);
    const x = resampleTo(r.pcm, r.sr, 16000);
    const tr = pitchTrack(x, 16000, 10, 40);
    const hz = medianPitch(tr.hz, tr.clarity, 0.85);
    setBusy(null);
    if (!hz) return say('No steady note heard. Hold an "aa" for 2 seconds.');
    if (which === 'low') updateSettings({ rangeLowHz: Math.round(hz), tonicHz: s.tonicHz ?? Math.round(hz) });
    else updateSettings({ rangeHighHz: Math.round(hz) });
    if (settings.value.rangeLowHz && settings.value.rangeHighHz) markSetup('range');
  };
  return (
    <div class="card">
      <h2>5 · Your voice range <ReviewBadge /></h2>
      <p class="small">
        Hold "aa" for 2 seconds on your lowest comfortable note (your qarar), then on your highest comfortable note. Never
        strain. Your lowest note becomes your starting tonic; you can change it.
      </p>
      <div class="row">
        <button class="btn" disabled={!!busy || !micInfo.value} onClick={() => void measure('low')}>
          {busy === 'low' ? 'Listening…' : 'Lowest note'}
        </button>
        <button class="btn" disabled={!!busy || !micInfo.value} onClick={() => void measure('high')}>
          {busy === 'high' ? 'Listening…' : 'Highest note'}
        </button>
      </div>
      <p class="small">
        Low: {s.rangeLowHz ? `${noteName(s.rangeLowHz)} (${s.rangeLowHz} Hz)` : '–'} · High: {s.rangeHighHz ? `${noteName(s.rangeHighHz)} (${s.rangeHighHz} Hz)` : '–'}
        {s.rangeLowHz && s.rangeHighHz ? ` · span ${Math.round(hzToCents(s.rangeHighHz, s.rangeLowHz) / 100)} semitones` : ''}
      </p>
      {s.tonicHz ? (
        <label class="field">
          <span class="small">Tonic: {noteName(s.tonicHz)} ({s.tonicHz} Hz)</span>
          <input type="range" min={70} max={400} value={s.tonicHz} onInput={(e) => updateSettings({ tonicHz: Number(e.currentTarget.value) })} />
        </label>
      ) : null}
    </div>
  );
}

export function MetronomeCard() {
  const [bpm, setBpm] = useState(metronome.bpm);
  const [pattern, setPattern] = useState<Pattern>(metronome.pattern);
  const [taps, setTaps] = useState<number[]>([]);
  return (
    <div class="card">
      <h2>Metronome</h2>
      <label class="field">
        <span>{bpm} BPM</span>
        <input
          type="range"
          min={40}
          max={200}
          value={bpm}
          onInput={(e) => {
            const v = Number(e.currentTarget.value);
            setBpm(v);
            metronome.bpm = v;
          }}
        />
      </label>
      <div class="row">
        <select
          class="btn small"
          value={pattern}
          aria-label="Pattern"
          onChange={(e) => {
            const p = e.currentTarget.value as Pattern;
            setPattern(p);
            metronome.pattern = p;
          }}
        >
          <option value="single">Single beat</option>
          <option value="double">Double</option>
          <option value="shoor">Fast (shoor)</option>
        </select>
        <button class="btn primary" onClick={() => (metronomeOn.value ? metronome.stop() : void metronome.start())}>
          {metronomeOn.value ? 'Stop' : 'Start'}
        </button>
        <button
          class="btn"
          onClick={() => {
            const t = [...taps, performance.now()].slice(-8);
            setTaps(t);
            const b = tapTempo(t);
            if (b && b >= 40 && b <= 200) {
              setBpm(b);
              metronome.bpm = b;
            }
          }}
        >
          Tap tempo
        </button>
      </div>
    </div>
  );
}

export function TransposeCard() {
  const s = settings.value;
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div class="card">
      <h2>Hear Minshawi in your key</h2>
      <p class="small">Transposes 1:1 to your tonic (pitch shift that keeps the speed). Set your lowest note first.</p>
      <button
        class="btn"
        disabled={busy || !s.tonicHz}
        onClick={async () => {
          setBusy(true);
          try {
            const c = await resumeAudio();
            const buf = await ayahBuffer('murattal', 1, 1);
            const x = buf.getChannelData(0);
            const x16 = resampleTo(x, buf.sampleRate, 16000);
            const tr = pitchTrack(x16, 16000, 10, 40);
            const ref = medianPitch(tr.hz, tr.clarity, 0.8);
            let st = Math.round(12 * Math.log2(s.tonicHz! / ref));
            while (st > 6) st -= 12; // stay within half an octave (same melody, nearest octave)
            while (st < -6) st += 12;
            const y = pitchShift(x, st, buf.sampleRate);
            const b = c.createBuffer(1, y.length, buf.sampleRate);
            b.copyToChannel(y as Float32Array<ArrayBuffer>, 0);
            const src = c.createBufferSource();
            src.buffer = b;
            src.connect(c.destination);
            src.start();
            setInfo(`His median pitch here: ${noteName(ref)} (measured). Shifted ${st > 0 ? '+' : ''}${st} semitones.`);
          } catch (e) {
            say(`Could not transpose: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Working…' : 'Play 1:1 in my key'}
      </button>
      {info ? <p class="small">{info}</p> : null}
    </div>
  );
}
