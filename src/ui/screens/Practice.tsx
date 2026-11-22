import { useEffect, useState } from 'preact/hooks';
import { loadIndex, loadSurah, type Ayah, type QuranIndex } from '../../data/quranData.ts';
import { cr, next, playSideBySide, playTake, retry, startSession, stopSession } from '../../cr/engine.ts';
import type { CrMode } from '../../cr/plan.ts';
import { AyahText } from '../components/AyahText.tsx';
import { settings, updateSettings } from '../state.ts';
import { micInfo } from '../../audio/mic.ts';
import { KIDS_CREDIT } from '../../cr/kids.ts';

const MODES: { id: CrMode; name: string; what: string }[] = [
  { id: 'echo', name: 'Echo', what: 'He recites a phrase, you repeat it.' },
  { id: 'buildup', name: 'Build-up', what: 'Last word first, then add words until the whole phrase (back-chaining).' },
  { id: 'ladder', name: 'Tempo ladder', what: 'Each phrase at 75%, 85%, then full speed (pitch kept).' },
  { id: 'ghost', name: 'Ghost', what: 'You recite with Minshawi playing quietly underneath (use headphones).' },
];

function Feedback() {
  const fb = cr.value.feedback;
  if (!fb) return null;
  return (
    <div class="card" aria-live="polite">
      <h2>How that went</h2>
      {!fb.heard ? (
        <p>{fb.inputMessage === 'Good level.' ? 'I did not hear a response.' : fb.inputMessage}</p>
      ) : (
        <>
          <p class="small muted" style={{ marginTop: 0 }}>
            Tajweed checks arrive in M5 and will be shown first; melody always comes second to correctness. Confidence: <b>{fb.confidence}</b>.
          </p>
          <table class="simple">
            <tbody>
              <tr>
                <th>Entry</th>
                <td>
                  {fb.entry}
                  {fb.entryMs !== null ? ` (${fb.entryMs > 0 ? '+' : ''}${fb.entryMs} ms)` : ''}
                </td>
              </tr>
              <tr>
                <th>Length</th>
                <td>
                  {fb.length}
                  {fb.durRatio !== null ? ` (${Math.round(fb.durRatio * 100)}% of his)` : ''}
                </td>
              </tr>
              <tr>
                <th>Melody shape</th>
                <td>
                  {fb.melody}
                  {fb.melodyCents !== null ? ` (avg ${fb.melodyCents} cents apart)` : ''}
                </td>
              </tr>
              <tr>
                <th>Score</th>
                <td>{fb.score}/100 (timing 30 · length 30 · melody 40)</td>
              </tr>
            </tbody>
          </table>
          {fb.input !== 'ok' ? <p class="notice warn small">{fb.inputMessage}</p> : null}
          {Object.keys(settings.value.latencyMs).length === 0 ? <p class="small muted">Entry timing is not latency-compensated yet: calibrate in the Audio lab.</p> : null}
        </>
      )}
      <div class="row" style={{ marginTop: 8 }}>
        <button class="btn" onClick={() => void playTake('response')}>My take</button>
        <button class="btn" onClick={() => void playSideBySide()}>Side by side</button>
      </div>
    </div>
  );
}

export default function PracticeScreen() {
  const [index, setIndex] = useState<QuranIndex | null>(null);
  const [surah, setSurah] = useState(1);
  const [ayat, setAyat] = useState<Ayah[] | null>(null);
  const [mode, setMode] = useState<CrMode>('echo');
  const [source, setSource] = useState<'murattal' | 'kids'>('murattal');
  const [withClass, setWithClass] = useState(false);
  const s = settings.value;
  const st = cr.value;
  useEffect(() => void loadIndex().then(setIndex), []);
  useEffect(() => void loadSurah(surah).then(setAyat), [surah]);
  const running = st.phase !== 'idle' && st.phase !== 'done';
  const step = st.steps[st.index];
  const pct = st.steps.length ? Math.round((Math.min(st.index, st.steps.length) / st.steps.length) * 100) : 0;

  if (running || st.phase === 'done') {
    return (
      <div class={s.handsFree ? 'handsfree' : ''}>
        <div class="card">
          <div class="row">
            <div class="grow">
              <b>{MODES.find((m) => m.id === st.mode)?.name}</b> · step {Math.min(st.index + 1, st.steps.length)} of {st.steps.length}
            </div>
            <span class={`pulse${st.phase === 'cue' ? ' on' : st.phase === 'response' ? ' turn' : ''}`} aria-hidden="true" />
          </div>
          <div class="progress" style={{ marginTop: 8 }} aria-label={`Session ${pct}% done`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p class="small muted" style={{ margin: '6px 0 0' }}>Session {pct}%</p>
        </div>
        {st.phase === 'done' ? (
          <div class="card">
            <h2>Session complete</h2>
            <p>
              {st.history.filter((h) => h.feedback.heard).length} of {st.steps.length} steps heard · average score{' '}
              {Math.round(st.history.reduce((a, h) => a + h.feedback.score, 0) / Math.max(1, st.history.length))}/100.
            </p>
            <div class="task-now">
              <b>YOUR TASK NOW:</b> do the same set once more tomorrow, or try Build-up on the ayah with your lowest score.
            </div>
            <button class="btn primary" style={{ marginTop: 10 }} onClick={() => stopSession()}>
              Done
            </button>
          </div>
        ) : step ? (
          <div class="card">
            <div class="small muted">{step.label}</div>
            <AyahText ayah={step.ayah} tajweed={s.tajweed} now={st.callWord} range={step.words} />
            <div class="task-now" style={{ marginTop: 8 }}>
              <b>YOUR TASK NOW:</b>{' '}
              {st.phase === 'call' || st.phase === 'loading' ? 'listen to Sheikh al-Minshawi.' : st.phase === 'cue' || st.phase === 'response' ? 'your turn — recite it now.' : s.handsFree ? 'next one is coming…' : 'tap Again or Next.'}
            </div>
          </div>
        ) : null}
        {st.phase === 'feedback' ? <Feedback /> : null}
        {st.phase !== 'done' ? (
          <div class="row">
            {!s.handsFree && st.phase === 'feedback' ? (
              <>
                <button class="btn" onClick={retry}>
                  Again
                </button>
                <button class="btn primary" onClick={next}>
                  Next
                </button>
              </>
            ) : null}
            <button class="btn ghost" onClick={stopSession}>
              Stop
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div class="card">
        <h2>Call and response</h2>
        <p class="small muted" style={{ marginTop: 0 }}>Sheikh al-Minshawi recites; you answer after the click.</p>
        <div class="task-now">
          <b>YOUR TASK NOW:</b> {micInfo.value || s.onboarded ? 'pick Echo on Al-Fatiha and press Start.' : 'first set up your microphone in the Audio lab, then come back.'}
        </div>
        <label class="field">
          <span class="small muted">Surah</span>
          <select value={surah} onChange={(e) => setSurah(Number(e.currentTarget.value))}>
            {(index?.surahs ?? []).map((m) => (
              <option key={m.n} value={m.n}>
                {m.n}. {m.tname} ({m.ayas})
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="small muted">Who calls</span>
          <select value={source} onChange={(e) => setSource(e.currentTarget.value as 'murattal' | 'kids')}>
            <option value="murattal">Sheikh al-Minshawi — murattal (exact reference, works offline with packs)</option>
            <option value="kids">Sheikh al-Minshawi with children — you take the children's turn (online)</option>
          </select>
        </label>
        {source === 'kids' ? (
          <>
            <label class="row small">
              <input type="checkbox" checked={withClass} onChange={(e) => setWithClass(e.currentTarget.checked)} /> Answer with the class (children quietly with you)
            </label>
            <p class="small muted">{KIDS_CREDIT} Timings are kept at most 7 days.</p>
          </>
        ) : null}
        <div role="radiogroup" aria-label="Mode" class="stack" style={source === 'kids' ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
          {MODES.map((m) => (
            <label key={m.id} class="row" style={{ alignItems: 'flex-start' }}>
              <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} style={{ marginTop: 6 }} />
              <span>
                <b>{m.name}</b> — <span class="small">{m.what}</span>
              </span>
            </label>
          ))}
        </div>
        <label class="row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={s.handsFree} onChange={(e) => updateSettings({ handsFree: e.currentTarget.checked })} /> Hands-free (phone on a stand: auto-advance, spoken prompts)
        </label>
        <button class="btn primary block" style={{ marginTop: 12 }} disabled={!ayat} onClick={() => ayat && startSession(source === 'kids' ? 'echo' : mode, surah === 1 || ayat.length <= 12 ? ayat : ayat.slice(0, 5), { source, withClass })}>
          Start
        </button>
        {ayat && ayat.length > 12 && surah !== 1 ? <p class="small muted">Long surah: the session uses the first 5 ayat.</p> : null}
        {st.error ? <p class="notice warn small">{st.error}</p> : null}
      </div>
      <p class="small muted">Your takes stay in memory on this phone and are not uploaded anywhere.</p>
    </>
  );
}
