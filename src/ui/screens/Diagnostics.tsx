// Diagnostics (B12): device/audio/storage/service-worker facts, CORS + offline-playback checks per audio host,
// and "Copy report" / "Report a problem" (a JSON bundle to paste into FEEDBACK.md). No personal data included.
import { useEffect, useState } from 'preact/hooks';
import { audioCtx, audioSessionSupported, estimatedOutputLatencyMs } from '../../audio/context.ts';
import { micInfo } from '../../audio/mic.ts';
import { AUDIO_PACK_CACHE } from '../../audio/everyayah.ts';
import { swStatus, isStandalone } from '../pwa.ts';
import { route, settings, say } from '../state.ts';
import { shareOrDownload } from '../../data/backup.ts';

const HOSTS: { name: string; url: string; note: string }[] = [
  { name: 'EveryAyah (Minshawi murattal)', url: 'https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3', note: 'reference audio; offline packs need CORS' },
  { name: 'Quran.com API (children timings)', url: 'https://api.quran.com/api/v4/chapter_recitations/168/112?segments=true', note: 'runtime only, ≤ 7-day cache' },
  { name: 'QuranicAudio CDN (children audio)', url: 'https://download.quranicaudio.com/qdc/siddiq_minshawi/kids_repeat/112.mp3', note: 'runtime only' },
  { name: 'Quran.com word audio', url: 'https://audio.qurancdn.com/wbw/001_001_001.mp3', note: 'fallback only' },
];

type HostResult = { name: string; status: 'ok' | 'no-cors' | 'offline' | 'error'; ms: number; detail: string };

async function checkHost(url: string): Promise<{ status: HostResult['status']; ms: number; detail: string }> {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { mode: 'cors', headers: url.endsWith('.mp3') ? { Range: 'bytes=0-1023' } : undefined, cache: 'no-store' });
    const ms = Math.round(performance.now() - t0);
    return { status: r.ok || r.status === 206 ? 'ok' : 'error', ms, detail: `HTTP ${r.status}${r.status === 206 ? ' (range OK)' : ''}` };
  } catch {
    const ms = Math.round(performance.now() - t0);
    if (!navigator.onLine) return { status: 'offline', ms, detail: 'offline' };
    try {
      await fetch(url, { mode: 'no-cors' });
      return { status: 'no-cors', ms, detail: 'reachable but no CORS: plays online only, cannot be analysed or kept offline' };
    } catch {
      return { status: 'error', ms, detail: 'unreachable' };
    }
  }
}

async function collect(): Promise<Record<string, unknown>> {
  const c = audioCtx();
  let storage: Record<string, unknown>;
  try {
    const est = await navigator.storage?.estimate?.();
    storage = { persisted: await navigator.storage?.persisted?.(), usageMB: est?.usage ? +(est.usage / 1048576).toFixed(1) : null, quotaMB: est?.quota ? Math.round(est.quota / 1048576) : null };
  } catch {
    storage = { error: 'unavailable' };
  }
  let offlineAyat = 0;
  try {
    offlineAyat = (await (await caches.open(AUDIO_PACK_CACHE)).keys()).length;
  } catch {
    /* none */
  }
  const s = settings.value;
  return {
    app: { version: '0.1.0', standalone: isStandalone(), serviceWorker: swStatus.value, online: navigator.onLine, route: location.hash },
    browser: { userAgent: navigator.userAgent, language: navigator.language, viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}` },
    audio: {
      sampleRate: c.sampleRate,
      state: c.state,
      estimatedOutputLatencyMs: estimatedOutputLatencyMs(),
      audioWorklet: 'audioWorklet' in c,
      audioSession: audioSessionSupported(),
      mic: micInfo.value ? { processingOff: micInfo.value.processingOff, bluetoothLikely: micInfo.value.bluetooth, sampleRate: micInfo.value.sampleRate } : 'not opened',
      calibrations: s.latencyMs,
      mediaRecorder: typeof MediaRecorder !== 'undefined' ? ['audio/mp4', 'audio/webm'].filter((t) => MediaRecorder.isTypeSupported?.(t)) : 'none',
      preservesPitch: 'preservesPitch' in HTMLMediaElement.prototype,
    },
    compute: { webgpu: 'gpu' in navigator, wasm: typeof WebAssembly === 'object', crossOriginIsolated: self.crossOriginIsolated === true, wasmThreads: self.crossOriginIsolated ? navigator.hardwareConcurrency : 1, cores: navigator.hardwareConcurrency },
    display: { highlightApi: typeof CSS !== 'undefined' && 'highlights' in CSS, theme: s.theme, quranSize: s.quranSize, colourBlind: s.colourBlind },
    storage: { ...storage, offlineAyat },
    checker: { tier1: 'M5 (not built)', models: 'M6 (not built)', myTestSet: 'M5 (not built)' },
  };
}

export default function DiagnosticsScreen() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [hosts, setHosts] = useState<HostResult[]>([]);
  const [note, setNote] = useState('');
  const [steps, setSteps] = useState('');
  useEffect(() => void collect().then(setReport), []);
  const runHosts = async () => {
    setHosts([]);
    const out: HostResult[] = [];
    for (const h of HOSTS) {
      out.push({ name: h.name, ...(await checkHost(h.url)) });
      setHosts([...out]);
    }
  };
  const full = () => ({ ...report, hosts, generated: new Date().toISOString() });
  const copy = async (obj: unknown, what: string) => {
    const text = JSON.stringify(obj, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied. Paste it into FEEDBACK.md.`);
    } catch {
      await shareOrDownload('tilawa-report.json', 'application/json', text);
    }
  };
  return (
    <>
      <div class="task-now" style={{ marginBottom: 14 }}>
        <b>YOUR TASK NOW:</b> press Copy report and paste it into FEEDBACK.md (or a note to yourself).
      </div>
      <div class="card">
        <h2>Device report</h2>
        <p class="small muted">Contains no recordings, names or career notes.</p>
        {report ? <pre class="draft small" style={{ maxHeight: 320, overflow: 'auto' }}>{JSON.stringify(report, null, 1)}</pre> : <p class="muted">Collecting…</p>}
        <div class="row">
          <button class="btn primary" disabled={!report} onClick={() => void copy(full(), 'Report')}>
            Copy report
          </button>
        </div>
      </div>
      <div class="card">
        <h2>Audio hosts: CORS and offline</h2>
        <p class="small">CORS lets the app analyse audio and keep offline packs. Without it, audio still plays online.</p>
        <button class="btn" onClick={() => void runHosts()}>
          Check hosts
        </button>
        {hosts.length ? (
          <table class="simple" style={{ marginTop: 8 }}>
            <tbody>
              {hosts.map((h) => (
                <tr key={h.name}>
                  <td>{h.name}</td>
                  <td style={{ color: h.status === 'ok' ? 'var(--ok)' : 'var(--warn)' }}>{h.status}</td>
                  <td class="small">
                    {h.detail} · {h.ms} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div class="card">
        <h2>Report a problem</h2>
        <label class="field">
          <span>What happened?</span>
          <textarea value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="e.g. highlighting lagged on 2:255 with AirPods" />
        </label>
        <label class="field">
          <span>Steps (optional)</span>
          <textarea value={steps} onInput={(e) => setSteps(e.currentTarget.value)} placeholder="1. Opened Mushaf 2  2. Played from 255 …" />
        </label>
        <button class="btn primary" disabled={!note.trim()} onClick={() => void copy({ screen: route.value.parts.join('/') || 'diagnostics', steps, note, diagnostics: full() }, 'Problem report')}>
          Copy problem report
        </button>
      </div>
    </>
  );
}
