// Nuraniah Qaida teacher video via the official YouTube IFrame Player API on youtube-nocookie.com (B5 player rules):
// playsinline, the player stays visible ≥200×200 with its controls, nothing overlays it, playback only from a tap,
// default referrer policy. "Mark segments" lets the owner tap-map lines/drills (we never invent timestamps).
import { useEffect, useRef, useState } from 'preact/hooks';
import { kvGet, kvSet } from '../../data/db.ts';
import { say } from '../state.ts';

interface YTPlayer {
  getCurrentTime(): number;
  seekTo(s: number, allow: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}
let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise)
    apiPromise = new Promise((res, rej) => {
      window.onYouTubeIframeAPIReady = () => res();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => rej(new Error('YouTube player could not load (offline?)'));
      document.head.appendChild(s);
    });
  return apiPromise;
}

export interface Segment {
  label: string;
  start: number;
  end: number;
}
export const marksKey = (videoId: string) => `yt-marks:${videoId}`;

export function YouTubeLesson({ videoId, title }: { videoId: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [marks, setMarks] = useState<Segment[]>([]);
  const [marking, setMarking] = useState(false);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => void kvGet<Segment[]>(marksKey(videoId), []).then(setMarks), [videoId]);
  const start = async () => {
    try {
      await loadApi();
      if (!host.current || player.current) return;
      setStarted(true); // the button disappears before the player exists: nothing ever overlays the player
      player.current = new window.YT!.Player(host.current, {
        host: 'https://www.youtube-nocookie.com',
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => setReady(true) },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => () => player.current?.destroy(), []);
  const save = (m: Segment[]) => {
    setMarks(m);
    void kvSet(marksKey(videoId), m);
  };
  const playSeg = (s: Segment) => {
    const p = player.current;
    if (!p) return;
    p.seekTo(s.start, true);
    p.playVideo();
    const stopAt = s.end;
    const t = setInterval(() => {
      if (p.getCurrentTime() >= stopAt) {
        p.pauseVideo();
        clearInterval(t);
      }
    }, 100);
  };
  return (
    <div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', minHeight: 200, background: '#000', borderRadius: 10, overflow: 'hidden' }}>
        <div ref={host} style={{ position: 'absolute', inset: 0 }} />
        {!started ? (
          <button class="btn primary" style={{ position: 'absolute', inset: 0, margin: 'auto', width: 220, height: 56 }} onClick={() => void start()}>
            Load the teacher video
          </button>
        ) : null}
      </div>
      <p class="small muted" style={{ margin: '6px 0' }}>
        {title} — YouTube, played in the official player. Your tap starts each play.
      </p>
      {err ? <p class="notice warn small">{err}</p> : null}
      {ready ? (
        <div class="stack">
          {marks.length ? (
            <div class="tabs">
              {marks.map((m, i) => (
                <button key={i} class="btn small" onClick={() => playSeg(m)}>
                  ▶ {m.label}
                </button>
              ))}
            </div>
          ) : (
            <p class="small muted">No segments marked yet — the whole video plays. Use "Mark segments" to cut it into letters/drills.</p>
          )}
          <button class="btn small ghost" onClick={() => setMarking(!marking)}>
            {marking ? 'Done marking' : 'Mark segments'}
          </button>
          {marking ? (
            <div class="row">
              <input aria-label="Segment label" placeholder="label, e.g. ب" value={label} onInput={(e) => setLabel(e.currentTarget.value)} style={{ minHeight: 44, flex: 1 }} />
              {pendingStart === null ? (
                <button class="btn small" onClick={() => setPendingStart(player.current!.getCurrentTime())}>
                  Mark start
                </button>
              ) : (
                <button
                  class="btn small primary"
                  onClick={() => {
                    const end = player.current!.getCurrentTime();
                    if (end <= pendingStart + 0.2) return say('End must be after the start.');
                    save([...marks, { label: label || `part ${marks.length + 1}`, start: +pendingStart.toFixed(2), end: +end.toFixed(2) }]);
                    setPendingStart(null);
                    setLabel('');
                  }}
                >
                  Mark end
                </button>
              )}
              {marks.length ? (
                <button class="btn small ghost" onClick={() => save(marks.slice(0, -1))}>
                  Undo last
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
