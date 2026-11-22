// One question at a time, strict marking (no second try on the same question), explanation for every option.
// Every answer is reported at once (onAnswer), so leaving a test half-way cannot bring the same questions back (M-3).
// A "Listen…" question whose recording cannot play can be skipped without counting (M-9).
// Game feel: a green / red answer panel with Continue, a combo counter for answers right in a row, small sounds.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { QuizItem } from '../../content/quiz.ts';
import { loadSurah } from '../../data/quranData.ts';
import { mushafPlayer } from '../../audio/mushafPlayer.ts';
import { sfx } from '../sfx.ts';
import { ReviewBadge } from './ReviewBadge.tsx';

// Test-only (D-016): ?quizbot=1 marks the right option so e2e tests can walk the learner path. Changes nothing else.
// It works only on a local test server, never on the published site (n-4).
const QUIZBOT = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]quizbot=1/.test(location.search);

export interface QuizResult {
  correct: number;
  /** answered questions (skipped audio questions are not counted) */
  total: number;
  seen: string[];
  skipped: number;
  /** most answers right in a row */
  bestCombo: number;
}

function ArabicWithHighlight({ text, hl }: { text: string; hl?: [number, number] }) {
  if (!hl) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, hl[0])}
      <span style={{ background: 'color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: 6 }}>{text.slice(hl[0], hl[1])}</span>
      {text.slice(hl[1])}
    </span>
  );
}

export function Quiz({
  items,
  title,
  onDone,
  onAnswer,
  onQuit,
  xpPerCorrect,
}: {
  items: QuizItem[];
  title: string;
  onDone: (r: QuizResult) => void;
  onAnswer?: (id: string, correct: boolean) => void;
  onQuit?: () => void;
  /** shown as "+n XP" on a right answer (the caller awards it) */
  xpPerCorrect?: number;
}) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [answered, setAnswered] = useState<string[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [audioFailed, setAudioFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const qRef = useRef<HTMLParagraphElement>(null);
  // keyboard / screen-reader users land on the feedback, then on the next question (m-8)
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus();
  }, [picked]);
  useEffect(() => {
    if (i > 0) qRef.current?.focus();
  }, [i]);
  const item = items[i];
  if (!item) return null;
  const last = i === items.length - 1;
  const advance = (c: number, sk: number, ans: string[]) => {
    if (!last) {
      setI(i + 1);
      setPicked(null);
      setAudioFailed(false);
      return;
    }
    if (finishing) return; // a double tap on Finish must not record twice (m-6)
    setFinishing(true);
    sfx('done');
    onDone({ correct: c, total: items.length - sk, seen: ans, skipped: sk, bestCombo });
  };
  const right = picked !== null && picked === item.answer;
  return (
    <div class="card" aria-live="polite">
      <div class="row">
        <b class="grow">{title}</b>
        {combo >= 3 ? <span class="chip combo">🔥 {combo} in a row</span> : null}
        <span class="small muted">
          {i + 1} / {items.length}
        </span>
        {onQuit ? (
          <button class="btn small ghost" onClick={onQuit}>
            Stop
          </button>
        ) : null}
      </div>
      <div class="progress" style={{ margin: '8px 0' }}>
        <span style={{ width: `${Math.round(((i + (picked !== null ? 1 : 0)) / items.length) * 100)}%` }} />
      </div>
      <p ref={qRef} tabIndex={-1} style={{ fontWeight: 650 }}>
        {item.q} {item.provenance.kind === 'model-knowledge' ? <ReviewBadge /> : null}
      </p>
      {item.arabic ? (
        <p lang="ar" dir="rtl" class="quran" style={{ textAlign: 'center', fontSize: 'calc(var(--quran-size) * 1.4)', margin: '4px 0' }}>
          <ArabicWithHighlight text={item.arabic.text} hl={item.arabic.highlight} />
        </p>
      ) : null}
      {item.audio ? (
        <button
          class="btn"
          onClick={async () => {
            try {
              const ayat = await loadSurah(item.audio!.surah);
              const a = ayat[item.audio!.ayah - 1]!;
              await mushafPlayer.playWord(a, item.audio!.word + a.basmalaWords, 'murattal');
            } catch {
              setAudioFailed(true);
            }
          }}
        >
          ▶ Play the word
        </button>
      ) : null}
      {audioFailed && picked === null ? (
        <div class="notice" style={{ marginTop: 8 }}>
          The recording could not play (are you offline?).{' '}
          <button
            class="btn small"
            onClick={() => {
              const sk = skipped + 1;
              setSkipped(sk);
              advance(correct, sk, answered);
            }}
          >
            Skip — this question will not count
          </button>
        </div>
      ) : null}
      <div class="stack" style={{ marginTop: 10 }}>
        {item.options.map((o, k) => {
          const state = picked === null ? '' : k === item.answer ? ' primary' : k === picked ? ' wrong' : '';
          const isAr = /[؀-ۿ]/.test(o) && o.length < 40;
          return (
            <button
              key={k}
              data-correct={QUIZBOT && k === item.answer ? '1' : undefined}
              class={`btn block${state}`}
              disabled={picked !== null}
              style={{ justifyContent: 'flex-start', textAlign: 'left', ...(state === ' wrong' ? { borderColor: 'var(--err)', color: 'var(--err)' } : {}) }}
              onClick={() => {
                const ok = k === item.answer;
                setPicked(k);
                if (ok) {
                  setCorrect(correct + 1);
                  setCombo(combo + 1);
                  setBestCombo(Math.max(bestCombo, combo + 1));
                } else setCombo(0);
                sfx(ok ? 'correct' : 'wrong');
                setAnswered([...answered, item.id]);
                onAnswer?.(item.id, ok);
              }}
            >
              <span lang={isAr ? 'ar' : undefined} style={isAr ? { fontFamily: 'var(--quran-font)', fontSize: 24 } : undefined}>
                {o}
              </span>
            </button>
          );
        })}
      </div>
      {picked !== null ? (
        <div class={`answer-sheet ${right ? 'ok' : 'err'}`}>
          <h3>
            {right ? 'Correct!' : 'Not quite'}
            {right && xpPerCorrect ? <span class="xp-gain"> +{xpPerCorrect} XP</span> : null}
          </h3>
          <p style={{ margin: '0 0 6px' }}>{item.explain[picked]}</p>
          {!right ? (
            <p style={{ margin: '0 0 6px' }}>
              <b>Answer:</b> {item.options[item.answer]} — {item.explain[item.answer]}
            </p>
          ) : null}
          <button ref={nextRef} class={`btn block ${right ? 'primary' : ''}`} disabled={finishing} onClick={() => advance(correct, skipped, answered)}>
            {last ? 'Finish' : 'Continue'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
