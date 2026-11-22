// Learn: stage map with mastery (#/learn) and the lesson player (#/learn/<id>):
// Big idea → Properly → Picture → Listen → Practise → Check → YOUR TASK NOW, progress % after every step.
import { useEffect, useState } from 'preact/hooks';
import { LESSONS, LESSON_BY_ID, STAGES, STEP_NAMES, lessonSurahs, loadAllLessons, loadLesson } from '../../content/lessons.ts';
import type { Fact, Lesson } from '../../content/schema.ts';
import { isSetupLesson, masterySet, practiceSet, reviewSet, type QuizItem } from '../../content/quiz.ts';
import { lessonOpen, prereqDone } from '../../content/gating.ts';
import { loadSurah, type Ayah } from '../../data/quranData.ts';
import { afterMasteryTest, afterReview, emptyProgress, isMastered, lessonPct, loadProgress, markPractisedToday, masteryPassed, progress, retestDue, reviewDueNow, updateProgress, weightedPct, type LessonProgress } from '../../srs/progress.ts';
import { route, say, settings, updateSettings, type SetupCheck } from '../state.ts';
import { ReviewBadge } from '../components/ReviewBadge.tsx';
import { QuranSnippet } from '../components/QuranSnippet.tsx';
import { Quiz, type QuizResult } from '../components/Quiz.tsx';
import { Celebrate, type CelebrateInfo } from '../components/Celebrate.tsx';
import { awardXp, XP_FOR } from '../../srs/game.ts';
import { YouTubeLesson } from '../components/YouTubeLesson.tsx';
import { MicCard, NoiseCard, RecordTestCard, LatencyCard, RangeCard } from '../components/AudioSetup.tsx';
import { SayDrill } from '../components/SayDrill.tsx';
import { FastTrackCard, PlacementCard } from '../components/Placement.tsx';
import { remnoteText } from '../../content/remnote.ts';
import { shareOrDownload } from '../../data/backup.ts';
import { mushafPlayer } from '../../audio/mushafPlayer.ts';

// Nuraniah playlist feed (refreshed daily by the feeds workflow; titles/ids only)
type FeedItem = { id: string; title: string; position?: number };
let feedPromise: Promise<FeedItem[]> | null = null;
const loadNuraniah = () =>
  (feedPromise ??= fetch(`${import.meta.env.BASE_URL}data/feeds/nuraniah.json`)
    .then((r) => (r.ok ? (r.json() as Promise<{ items: FeedItem[] }>) : { items: [] }))
    .then((j) => j.items)
    .catch(() => []));
const nuraniahVideo = (items: FeedItem[], lesson: number) => items.find((v) => new RegExp(`الدرس ${lesson} `).test(v.title) || new RegExp(`Lesson ${lesson} -`).test(v.title));

function FactText({ f }: { f: Fact }) {
  return (
    <p>
      {f.extra ? <span class="chip" style={{ marginRight: 6 }}>extra</span> : null}
      {f.text} {f.provenance.kind === 'model-knowledge' ? <ReviewBadge /> : null}
      {f.provenance.kind === 'reference' ? (
        <a class="small" href={f.provenance.url} target="_blank" rel="noopener">
          [source]
        </a>
      ) : null}
    </p>
  );
}

function StageMap() {
  const p = progress.value;
  // the lesson to do next: the first open one not yet passed (setup done / mastery test passed) and not placed
  const nextId = LESSONS.find((l) => lessonOpen(l, p) && !p[l.id]?.placed && !(l.setup ? p[l.id]?.setupDone : masteryPassed(p[l.id]?.mastery ?? null)))?.id;
  const overall = weightedPct(LESSONS, p);
  return (
    <>
      <div class="card">
        <h2>Your path</h2>
        <p class="small muted" style={{ marginTop: 0 }}>Overall {overall}% (mastered lessons, weighted by minutes).</p>
        <div class="progress">
          <span style={{ width: `${overall}%` }} />
        </div>
        <div class="row" style={{ marginTop: 10 }}>
          <button class="btn small" onClick={async () => void shareOrDownload('tilawa-remnote.txt', 'text/plain', remnoteText((await loadAllLessons()).filter((l) => p[l.id]?.stepsDone)))}>
            Export to RemNote
          </button>
          <a class="btn small ghost" href="#/settings">Teacher review</a>
        </div>
      </div>
      {STAGES.map((st) => {
        const ls = LESSONS.filter((l) => l.stage === st.n);
        const pct = weightedPct(ls, p);
        return (
          <div class="card" key={st.n}>
            <div class="row">
              <h2 class="grow" style={{ margin: 0 }}>
                Stage {st.n} · {st.title}
              </h2>
              <span class="small muted">{ls.length ? `${pct}%` : st.planned}</span>
            </div>
            {ls.length ? (
              <ol class="path">
                {ls.map((l, i) => {
                  const lp = p[l.id];
                  const open = lessonOpen(l, p);
                  const Row = open ? 'a' : 'div'; // locked lessons are plain text, not links without a target (m-8)
                  const status = isMastered(lp) ? 'mastered' : retestDue(lp) ? 'retest due' : masteryPassed(lp?.mastery ?? null) ? 'retest in 3 days' : lp?.placed ? 'placed (open)' : lp?.stepsDone ? `${lessonPct(lp)}%` : open ? 'new' : 'locked';
                  const kind = isMastered(lp) ? 'done' : !open ? 'locked' : lp?.placed && !lp.stepsDone ? 'placed' : lp?.stepsDone || lp?.mastery ? 'started' : 'open';
                  const next = l.id === nextId;
                  return (
                    <li key={l.id} style={{ '--x': `${[0, 24, 48, 24][i % 4]}px` } as Record<string, string>}>
                      <Row class="node-link" href={open ? `#/learn/${l.id}` : undefined}>
                        <span class={`stone ${kind}${next ? ' next' : ''}`} style={kind === 'started' ? ({ '--pct': `${lessonPct(lp)}%` } as Record<string, string>) : undefined} aria-hidden="true">
                          {kind === 'done' ? '★' : kind === 'locked' ? '🔒' : l.order}
                        </span>
                        <span class="node-label">
                          <b>{l.title}</b>
                          <br />
                          <span class="small muted">
                            {l.minutes} min · {status}
                            {next ? ' · up next' : ''}
                          </span>
                        </span>
                      </Row>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p class="small muted">Coming later: {st.planned}.</p>
            )}
          </div>
        );
      })}
    </>
  );
}



const SETUP_LABEL: Record<string, string> = {
  mic: 'Microphone allowed',
  noise: 'Background noise measured',
  record: 'A clean test recording',
  latency: 'Latency calibrated',
  range: 'Voice range measured (low and high)',
  placement: 'Placement ladder finished',
};
/** One concrete action for each step (B1: every step ends with YOUR TASK NOW) — a lesson may override steps 1–6. */
function stepTask(l: Lesson, step: number, cur: LessonProgress | undefined, setup: boolean): string {
  const own = l.stepTasks?.[step];
  if (own) return own;
  switch (step) {
    case 0:
      return 'Read the big idea aloud once, then press "Done — next step".';
    case 1:
      return 'Read each point, and say every Arabic example aloud once.';
    case 2:
      return l.visual.kind === 'letters' || l.visual.kind === 'letter-forms' ? 'Point at each one in the picture and say its name (or what it means) aloud.' : l.visual.kind === 'makhraj' ? 'For each letter, touch the place where it is made and say the letter.' : 'Look at the picture and say in one sentence what it shows.';
    case 3:
      return l.listen.length ? 'Play the listening example and repeat each sound right after it.' : 'Open the example ayah in the Mushaf and follow the highlighted words.';
    case 4: {
      const d = l.drills[0];
      if (!d) return "Say this lesson's letters aloud three times.";
      if (d.kind === 'say') return `${d.prompt.replace(/[.!]$/, '')} — ${d.times} times; record the last one with Record, then press Play mine and compare.`;
      if (d.kind === 'setup') return 'Complete every card on this step.';
      if (d.kind === 'echo') return `Open Practice and do one Echo round on ${d.ref}.`;
      if (d.kind === 'minimal-pair') return `Say ${d.pair[0]} and ${d.pair[1]} one after the other five times, keeping them clearly different.`;
      return 'Do the drills on this step.';
    }
    case 5:
      if (setup) return 'Finish the checks listed above, then take the practice quiz.';
      if (isMastered(cur)) return reviewDueNow(cur) ? 'Take the review quiz.' : 'Nothing due: this lesson is mastered.';
      if (retestDue(cur)) return 'Take the retest now.';
      if (masteryPassed(cur?.mastery ?? null)) return 'Come back for the retest in 3 days; take a practice quiz meanwhile.';
      return 'Take the practice quiz; when every answer is right, take the mastery test.';
    default:
      return l.taskNow;
  }
}

function Player({ lesson }: { lesson: Lesson }) {
  const p = progress.value[lesson.id];
  const s = settings.value;
  const total = STEP_NAMES.length;
  const [step, setStep] = useState(route.value.query.get('step') === 'check' ? 5 : Math.min(p?.stepsDone ?? 0, total - 1));
  const [surahs, setSurahs] = useState<Map<number, Ayah[]> | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<{ items: QuizItem[]; kind: 'practice' | 'mastery' | 'review' } | null>(null);
  const [celebrate, setCelebrate] = useState<CelebrateInfo | null>(null);
  const [nuraniah, setNuraniah] = useState<FeedItem[]>([]);
  useEffect(() => void loadNuraniah().then(setNuraniah), []);
  useEffect(() => {
    const list = lessonSurahs(lesson);
    void Promise.allSettled(list.map((n) => loadSurah(n))).then((rs) => {
      const ok = new Map<number, Ayah[]>();
      const failed: number[] = [];
      rs.forEach((x, i) => (x.status === 'fulfilled' ? ok.set(list[i]!, x.value) : failed.push(list[i]!)));
      setSurahs(ok);
      // M-9: say why questions are missing instead of silently disabling the buttons
      setLoadNote(failed.length ? `Some questions use Quran data that is not on this phone yet (surah ${failed.slice(0, 6).join(', ')}${failed.length > 6 ? ' …' : ''}). Connect to the internet once and reopen this lesson.` : null);
    });
  }, [lesson.id]);
  const done = p?.stepsDone ?? 0;
  const stagePct = weightedPct(LESSONS.filter((l) => l.stage === lesson.stage), progress.value);
  const overall = weightedPct(LESSONS, progress.value);
  const open = lessonOpen(lesson, progress.value);
  const lockedBy = lesson.prerequisites
    .filter((x) => !prereqDone(x, progress.value))
    .map((x) => `“${LESSON_BY_ID.get(x)?.title ?? x}”`)
    .join(' and ');
  const setup = isSetupLesson(lesson);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const quizTaken = !!(p?.seenQuestions?.length || p?.checksPassed || p?.mastery || p?.setupDone);
  const complete = async (i: number) => {
    const first = i + 1 > done;
    if (first) {
      await updateProgress(lesson.id, { stepsDone: i + 1, stepsTotal: total }, total);
      void awardXp('step');
    }
    await markPractisedToday();
    if (first && i === total - 1)
      setCelebrate({
        title: 'All seven steps done — أحسنت',
        lines: [`+${XP_FOR.step} XP`, setup ? 'Finish the setup checks (step 6) to complete it.' : isMastered(progress.value[lesson.id]) ? 'This lesson is mastered.' : 'Next: the mastery test on step 6, then a retest 3 days later.'],
      });
    setStep(Math.min(total - 1, i + 1));
    window.scrollTo({ top: 0 });
  };
  // ---------- setup lessons (M-5): complete when their device checks, the quiz and all steps are done ----------
  const needs = setup ? lesson.drills.flatMap((d) => (d.kind === 'setup' && d.component !== 'fast-track' ? [d.component] : [])) : [];
  const checkOk = (c: string) => (c === 'placement' ? !!s.placement : !!s.setupChecks?.[c as SetupCheck]);
  const hasQuiz = lesson.questions.length > 0 || lesson.generators.length > 0;
  useEffect(() => {
    if (!setup || p?.setupDone) return;
    if (needs.every(checkOk) && (!hasQuiz || p?.checksPassed) && done >= total) {
      void updateProgress(lesson.id, { setupDone: Date.now() }, total);
      if (needs.includes('mic')) updateSettings({ onboarded: true });
      void awardXp('setup');
      setCelebrate({ title: 'Setup complete — أحسنت', lines: [`+${XP_FOR.setup} XP`, 'This lesson is done.'], confetti: true });
    }
  }, [s.setupChecks, s.placement, p?.checksPassed, done]);
  // ---------- quizzes: every answer is recorded at once (M-3) ----------
  const onAnswer = (id: string, ok: boolean) => {
    if (ok) void awardXp('correct');
    const cur = progress.value[lesson.id];
    if (quiz?.kind === 'practice') void updateProgress(lesson.id, { seenQuestions: [...new Set([...(cur?.seenQuestions ?? []), id])] }, total);
    else void updateProgress(lesson.id, { masteryUsed: { ...(cur?.masteryUsed ?? {}), [id]: Date.now() } }, total);
  };
  const onQuizDone = async (r: QuizResult) => {
    const cur = progress.value[lesson.id] ?? emptyProgress(lesson.id, total);
    const now = Date.now();
    const score = `${r.correct} / ${r.total} correct`;
    const run = r.bestCombo >= 3 ? [`Best run: ${r.bestCombo} right in a row 🔥`] : [];
    let xp = r.correct * XP_FOR.correct; // already awarded answer by answer
    let info: CelebrateInfo;
    if (quiz?.kind === 'mastery') {
      const wasRetest = retestDue(cur, now);
      if (r.total < 20) info = { title: 'This test does not count', lines: [`${r.skipped} question(s) could not play. Try again when you are online.`] };
      else {
        const patch = afterMasteryTest(cur, r, now);
        await updateProgress(lesson.id, patch, total);
        const after = { ...cur, ...patch };
        if (wasRetest && isMastered(after)) {
          xp += await awardXp('retest');
          info = { title: 'Lesson mastered! 🏅', lines: [score, `+${xp} XP`, ...run, 'First review in about 7 days.'], confetti: true };
        } else if (wasRetest) info = { title: 'Retest: not yet', lines: [score, 'It needs 95% (19 of 20): practise, then take the retest again.', `+${xp} XP`] };
        else if (patch.mastery && masteryPassed(after.mastery)) {
          xp += await awardXp('mastery');
          info = { title: 'Mastery test passed — أحسنت', lines: [score, `+${xp} XP`, ...run, 'The retest unlocks in 3 days.'], confetti: r.correct === r.total };
        } else info = { title: 'Not yet — keep going', lines: [score, 'Mastery needs 95% (19 of 20). Practise and try again.', `+${xp} XP`] };
      }
    } else if (quiz?.kind === 'review') {
      const patch = afterReview(cur, r, now);
      await updateProgress(lesson.id, patch, total);
      const passed = r.total > 0 && r.correct / r.total >= 0.9;
      if (passed) xp += await awardXp('review');
      info = passed
        ? { title: 'Review passed — أحسنت', lines: [score, `+${xp} XP`, ...run, `Next review: ${new Date(patch.reviewDue!).toLocaleDateString()}`] }
        : { title: 'Review: not yet', lines: [score, 'It comes back tomorrow.', `+${xp} XP`] };
    } else {
      await updateProgress(lesson.id, { checksPassed: cur.checksPassed || (setup && r.total > 0 && r.correct === r.total) }, total);
      const perfect = r.total > 0 && r.correct === r.total;
      if (perfect) xp += await awardXp('perfect');
      info = { title: perfect ? 'Perfect! أحسنت' : r.correct / Math.max(1, r.total) >= 0.8 ? 'Well done — أحسنت' : 'Good effort — keep going', lines: [score, `+${xp} XP`, ...run], confetti: perfect };
    }
    await markPractisedToday();
    setQuiz(null);
    setCelebrate(info);
  };
  const onQuit = () => {
    if (quiz?.kind !== 'practice') say('Test stopped. The questions you saw will not come back in a test for 14 days.');
    setQuiz(null);
  };

  const body = () => {
    switch (step) {
      case 0:
        return (
          <>
            <FactText f={lesson.bigIdea} />
            <p class="small muted">
              <b>Memory hook:</b> {lesson.memoryHook.text}
            </p>
          </>
        );
      case 1:
        return (
          <>
            {lesson.proper.map((f, i) => (
              <FactText key={i} f={f} />
            ))}
            {lesson.extras.map((f, i) => (
              <FactText key={`x${i}`} f={f} />
            ))}
          </>
        );
      case 2: {
        const v = lesson.visual;
        if (v.kind === 'letters' || v.kind === 'letter-forms')
          return (
            <>
              {/* with a caption the items run left to right, so each label sits under its own sign (n-5) */}
              <div class="row" style={{ justifyContent: 'center', gap: 18 }} lang="ar" dir={v.kind === 'letters' && v.caption ? 'ltr' : 'rtl'}>
              {v.letters.map((L) => (
                <span key={L} class="quran" style={{ fontSize: 'calc(var(--quran-size) * 1.8)', lineHeight: 1.6 }}>
                  {L}
                </span>
              ))}
              </div>
              {v.kind === 'letters' && v.caption ? <p class="small" style={{ textAlign: 'center' }}>{v.caption}</p> : null}
            </>
          );
        if (v.kind === 'arrows')
          return (
            <p style={{ fontWeight: 600 }}>
              {v.steps.join(' → ')} {v.provenance.kind === 'model-knowledge' ? <ReviewBadge /> : null}
            </p>
          );
        if (v.kind === 'makhraj')
          return (
            <table class="simple">
              <tbody>
                {v.points.map((pt, i) => (
                  <tr key={i}>
                    <td lang="ar" style={{ fontFamily: 'var(--quran-font)', fontSize: 26 }}>
                      {pt.letter}
                    </td>
                    <td>
                      <b>{pt.region}</b> — {pt.detail} {v.provenance.kind === 'model-knowledge' ? <ReviewBadge /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        return <p class="muted">See the examples in the next step.</p>;
      }
      case 3:
        return (
          <>
            {lesson.listen.map((li, i) => {
              if (li.source === 'nuraniah') {
                const v = nuraniahVideo(nuraniah, li.lesson);
                return v ? (
                  <div key={i}>
                    <YouTubeLesson videoId={v.id} title={`Nuraniah Qaida — lesson ${li.lesson} (teacher reading)`} />
                    {li.note ? <p class="small muted">{li.note}</p> : null}
                  </div>
                ) : (
                  <p key={i} class="notice small">
                    Nuraniah lesson {li.lesson} is not in the playlist feed yet (paste its link in FEEDBACK.md).
                  </p>
                );
              }
              const [s, a] = li.ref.split(':').map(Number) as [number, number];
              return (
                <div key={i} class="opp">
                  <QuranSnippet surah={s} ayah={a} words={li.source === 'minshawi-words' ? li.words : undefined} tajweed />
                  <button class="btn small" onClick={async () => void mushafPlayer.playFrom([(await loadSurah(s))[a - 1]!], 0)}>
                    ▶ Minshawi {li.ref}
                  </button>
                </div>
              );
            })}
            {lesson.examples.length ? <h3>Examples from the Quran text</h3> : null}
            {lesson.examples.map((ex, i) => {
              const [s, a] = ex.ref.split(':').map(Number) as [number, number];
              return (
                <div key={i} class="opp">
                  <div class="small muted">{ex.ref}</div>
                  <QuranSnippet surah={s} ayah={a} words={ex.words} tajweed />
                  {ex.note ? <FactText f={ex.note} /> : null}
                </div>
              );
            })}
            {!lesson.listen.length && !lesson.examples.length ? <p class="muted">Nothing to listen to in this lesson.</p> : null}
          </>
        );
      case 4:
        return (
          <>
            {lesson.drills.map((d, i) => {
              if (d.kind === 'say') return <SayDrill key={i} prompt={d.prompt} times={d.times} />;
              if (d.kind === 'minimal-pair')
                return (
                  <div key={i} class="opp">
                    <p lang="ar" dir="rtl" class="quran" style={{ textAlign: 'center', fontSize: 'calc(var(--quran-size) * 1.5)', margin: 0 }}>
                      {d.pair[0]} · {d.pair[1]}
                    </p>
                    <FactText f={d.tip} />
                    <SayDrill prompt={`Say ${d.pair[0]} then ${d.pair[1]}, clearly different`} times={3} />
                  </div>
                );
              if (d.kind === 'echo')
                return (
                  <div key={i} class="opp">
                    <p>Call and response on {d.ref}.</p>
                    <a class="btn small primary" href="#/practice">
                      Open Practice
                    </a>
                  </div>
                );
              const C = { mic: MicCard, noise: NoiseCard, record: RecordTestCard, latency: LatencyCard, range: RangeCard, placement: PlacementCard, 'fast-track': FastTrackCard }[d.component];
              return C ? <C key={i} /> : <p key={i} class="small muted">({d.component} — see Settings)</p>;
            })}
            {!lesson.drills.length ? <p class="muted">No drills here.</p> : null}
          </>
        );
      case 5: {
        if (quiz)
          return (
            <Quiz
              items={quiz.items}
              title={quiz.kind === 'mastery' ? (retestDue(p) ? 'Retest (questions new to your tests)' : 'Mastery test (questions new to your tests)') : quiz.kind === 'review' ? 'Spaced review' : 'Practice'}
              onDone={(r) => void onQuizDone(r)}
              onAnswer={onAnswer}
              onQuit={onQuit}
              xpPerCorrect={XP_FOR.correct}
            />
          );
        const cur = progress.value[lesson.id];
        const seen = new Set(cur?.seenQuestions ?? []);
        const opts = { noAudio: offline };
        return (
          <>
            {setup ? (
              <ul class="small">
                {needs.map((c) => (
                  <li key={c}>
                    {SETUP_LABEL[c] ?? c}: {checkOk(c) ? '✓ done' : 'not yet (see the Practise step)'}
                  </li>
                ))}
                {hasQuiz ? <li>Practice quiz with every answer right: {cur?.checksPassed ? '✓ done' : 'not yet'}</li> : null}
                <li>All seven steps marked done: {done >= total ? '✓' : `${done}/${total}`}</li>
                <li>Lesson complete: {cur?.setupDone ? '✓' : 'not yet'}</li>
              </ul>
            ) : (
              <>
                <p class="small">
                  Mastery = at least 95% on a {Math.max(20, lesson.check.quiz.mastery)}-question test of questions you have not had in a test before + a retest 3 or more days later. Then short reviews at about 7, 21 and 60 days keep it fresh.
                </p>
                <p class="small">
                  Your status:{' '}
                  {isMastered(cur)
                    ? reviewDueNow(cur)
                      ? 'mastered — a review is due now'
                      : `mastered${cur?.reviewDue ? ` · next review ${new Date(cur.reviewDue).toLocaleDateString()}` : ''}`
                    : masteryPassed(cur?.mastery ?? null)
                      ? retestDue(cur)
                        ? 'retest due now'
                        : `retest unlocks on ${new Date(cur!.mastery!.at + 3 * 86400000).toLocaleDateString()}`
                      : cur?.mastery
                        ? `best test ${cur.mastery.correct}/${cur.mastery.total}`
                        : 'not tested yet'}
                </p>
              </>
            )}
            {loadNote ? <p class="notice small">{loadNote}</p> : null}
            {!open ? <p class="notice small">The mastery test opens after you finish {lockedBy}.</p> : null}
            {offline ? <p class="small muted">Offline: listening questions are left out until you are back online.</p> : null}
            <div class="row">
              <button class="btn primary" disabled={!surahs} onClick={() => surahs && setQuiz({ kind: 'practice', items: practiceSet(lesson, surahs, Date.now() & 0xffff, opts) })}>
                Practice quiz
              </button>
              {!setup && reviewDueNow(cur) ? (
                <button class="btn primary" disabled={!surahs} onClick={() => surahs && setQuiz({ kind: 'review', items: reviewSet(lesson, surahs, Date.now() & 0xffff, cur?.masteryUsed ?? {}, opts) })}>
                  Review quiz (10)
                </button>
              ) : null}
              {!setup ? (
                <button
                  class="btn"
                  disabled={!surahs || !open || isMastered(cur) || (masteryPassed(cur?.mastery ?? null) && !retestDue(cur))}
                  onClick={() => {
                    if (!surahs) return;
                    // listening questions stay in practice: one recording that cannot play must not void a test (n-6)
                    const items = masterySet(lesson, surahs, (Date.now() >> 3) & 0xffff, cur?.masteryUsed ?? {}, Date.now(), { noAudio: true }, seen);
                    if (items.length < 20) return say(offline ? 'Not enough questions are available offline. Connect to the internet and try again.' : `Only ${items.length} questions you have not had in a test are ready. Used questions come back after 14 days.`);
                    setQuiz({ kind: 'mastery', items });
                  }}
                >
                  {retestDue(cur) ? 'Retest' : 'Mastery test'}
                </button>
              ) : null}
            </div>
          </>
        );
      }
      default:
        return (
          <>
            <div class="task-now">
              <b>YOUR TASK NOW:</b> {lesson.taskNow}
            </div>
            <div class="row" style={{ marginTop: 10 }}>
              <button class="btn small" onClick={() => void shareOrDownload(`${lesson.id}-remnote.txt`, 'text/plain', remnoteText([lesson]))}>
                RemNote cards
              </button>
              <a class="btn small ghost" href="#/learn">
                Back to the map
              </a>
            </div>
          </>
        );
    }
  };

  return (
    <>
      <div class="card">
        <div class="small muted">
          Stage {lesson.stage} · lesson {lesson.order} · about {lesson.minutes} min {lesson.reviewStatus === 'unreviewed' ? '' : '· teacher-approved'}
        </div>
        <h2 style={{ margin: '4px 0' }}>{lesson.title}</h2>
        {!open ? <p class="notice small">Locked: finish {lockedBy} first. You can read this lesson now; its mastery test opens later.</p> : null}
        <div
          class="tabs"
          role="tablist"
          aria-label="Lesson steps"
          onKeyDown={(e) => {
            if ((quiz && quiz.kind !== 'practice') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
            const n = (step + (e.key === 'ArrowRight' ? 1 : total - 1)) % total;
            setStep(n);
            document.getElementById(`step-tab-${n}`)?.focus();
          }}
        >
          {STEP_NAMES.map((n, i) => (
            <button
              key={n}
              id={`step-tab-${i}`}
              role="tab"
              aria-selected={step === i}
              aria-controls="lesson-panel"
              tabIndex={step === i ? 0 : -1}
              disabled={!!quiz && quiz.kind !== 'practice' && step !== i}
              title={quiz && quiz.kind !== 'practice' && step !== i ? 'Finish or stop the test first' : undefined}
              class={`btn small${step === i ? ' primary' : ''}`}
              onClick={() => {
                setStep(i);
                setCelebrate(null);
              }}
            >
              {i + 1}. {n}
            </button>
          ))}
        </div>
        <p class="small muted" style={{ margin: '4px 0 0' }}>
          Lesson {lessonPct(progress.value[lesson.id])}% · Stage {lesson.stage} {stagePct}% · Overall {overall}%
        </p>
      </div>
      <div class="card" id="lesson-panel" role="tabpanel" aria-labelledby={`step-tab-${step}`}>
        <h3 style={{ marginTop: 0 }}>{STEP_NAMES[step]}</h3>
        {celebrate ? <Celebrate info={celebrate} onClose={() => setCelebrate(null)} /> : body()}
        {step < total - 1 && !quiz && !celebrate ? (
          <div class="task-now" style={{ marginTop: 12 }}>
            <b>YOUR TASK NOW:</b> {stepTask(lesson, step, p, setup)}
          </div>
        ) : null}
        {step < total - 1 && !quiz && !celebrate ? (
          <button class="btn primary block" style={{ marginTop: 12 }} disabled={step === 5 && !quizTaken} onClick={() => void complete(step)}>
            Done — next step
          </button>
        ) : null}
        {step === 5 && !quiz && !quizTaken ? <p class="small muted">Take a practice quiz first: this step counts as done after one.</p> : null}
        {step > 0 && !quiz && !celebrate ? (
          <button
            class="btn block"
            style={{ marginTop: 8 }}
            onClick={() => {
              setStep(step - 1);
              window.scrollTo({ top: 0 });
            }}
          >
            ‹ Previous step
          </button>
        ) : null}
        {step === total - 1 && !celebrate ? (
          <button class="btn block" style={{ marginTop: 12 }} onClick={() => void complete(step)}>
            Mark lesson steps complete
          </button>
        ) : null}
      </div>
    </>
  );
}

export default function LearnScreen() {
  useEffect(() => void loadProgress(), []);
  const id = route.value.parts[1];
  const [lesson, setLesson] = useState<Lesson | null | 'missing'>(null);
  useEffect(() => {
    setLesson(null);
    if (id) void loadLesson(id).then(setLesson, () => setLesson('missing'));
  }, [id]);
  if (id && lesson === 'missing') return <p class="notice">Lesson not found.</p>;
  if (id && lesson && lesson !== 'missing' && lesson.id === id) return <Player key={lesson.id} lesson={lesson} />;
  if (id) return <p class="muted">Loading the lesson…</p>;
  return <StageMap />;
}
