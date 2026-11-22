// Today (B8): pick 5 / 10 / 20 / 30 minutes → due reviews → one new step → one call-and-response set → one
// recitation check. The 5-minute "busy day" plan keeps the streak; one streak freeze per week.
import { useEffect, useState } from 'preact/hooks';
import { settings } from '../state.ts';
import { CareerTodayCard } from '../../career/CareerTodayCard.tsx';
import { LESSONS, STEP_NAMES } from '../../content/lessons.ts';
import { loadProgress, masteryPassed, progress, retestDue, reviewDueNow, streak, streakLength, weightedPct, dayKey } from '../../srs/progress.ts';
import { lessonOpen } from '../../content/gating.ts';
import { kvGet, kvSet } from '../../data/db.ts';
import { BADGES, earnedBadges, goalFor, levelOf, loadXp, xpOn, xpState } from '../../srs/game.ts';

/** Daily goal ring: today's XP against the goal for the minutes picked. */
function GoalRing({ xp, goal }: { xp: number; goal: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, xp / goal);
  return (
    <svg class="ring" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`Daily goal: ${xp} of ${goal} XP`}>
      <circle class="bg" cx="32" cy="32" r={r} />
      <circle class="fg" cx="32" cy="32" r={r} stroke-dasharray={c} stroke-dashoffset={c * (1 - f)} transform="rotate(-90 32 32)" />
      <text x="32" y="36" text-anchor="middle">
        {f >= 1 ? '✓' : `${xp}/${goal}`}
      </text>
    </svg>
  );
}

interface PlanItem {
  label: string;
  why: string;
  href: string;
  minutes: number;
}

export function planFor(minutes: number, now = Date.now()): PlanItem[] {
  const p = progress.value;
  const items: PlanItem[] = [];
  // due retests and spaced reviews open straight on the lesson's Check step, where the quiz is (M-4)
  const reviews = LESSONS.filter((l) => retestDue(p[l.id], now) || reviewDueNow(p[l.id], now));
  for (const l of reviews.slice(0, minutes >= 20 ? 3 : 1)) items.push({ label: `${retestDue(p[l.id], now) ? 'Retest' : 'Review'}: ${l.title}`, why: retestDue(p[l.id], now) ? '3-day retest (needed for mastery)' : 'spaced review (about 7, 21 and 60 days after mastery)', href: `#/learn/${l.id}?step=check`, minutes: 4 });
  const next = LESSONS.find((l) => {
    const lp = p[l.id];
    const passed = l.setup ? !!lp?.setupDone : masteryPassed(lp?.mastery ?? null) || !!lp?.placed;
    return !passed && lessonOpen(l, p);
  });
  if (next && (minutes > 5 || !items.length)) {
    const step = Math.min(p[next.id]?.stepsDone ?? 0, STEP_NAMES.length - 1);
    items.push({ label: `New: ${next.title} — ${STEP_NAMES[step]}`, why: `stage ${next.stage}, lesson ${next.order}`, href: `#/learn/${next.id}`, minutes: 5 });
  }
  if (minutes >= 20) items.push({ label: 'Call and response: Al-Fatiha (Echo)', why: 'one C&R set with Sheikh al-Minshawi', href: '#/practice', minutes: 6 });
  if (minutes >= 30) items.push({ label: 'Recitation check: one ayah, self-rated against Minshawi', why: 'automatic tajweed checks arrive in M5', href: '#/mushaf/1', minutes: 6 });
  if (minutes >= 30 && next) items.push({ label: `Continue: ${next.title}`, why: 'a second step if you still have time', href: `#/learn/${next.id}`, minutes: 5 });
  return items;
}

export function TodayScreen() {
  const s = settings.value;
  const [mins, setMins] = useState<number>(10);
  useEffect(() => {
    void loadProgress();
    void loadXp();
    void kvGet<number>('todayMinutes', 10).then(setMins);
  }, []);
  const plan = planFor(mins);
  const st = streak.value;
  const days = streakLength(st);
  const doneToday = st.days.includes(dayKey());
  const overall = weightedPct(LESSONS, progress.value);
  const xp = xpState.value;
  const lv = levelOf(xp.total);
  const goal = goalFor(mins);
  const earned = earnedBadges(progress.value, st, xp, LESSONS, !!s.placement);
  const first = plan[0];
  // until the microphone is set up that is the first task, but due retests/reviews stay listed below it
  const needsSetup = !s.onboarded && !progress.value[LESSONS[0]?.id ?? '']?.setupDone;
  const listed = needsSetup ? plan : plan.slice(1);
  return (
    <>
      <div class="card">
        <h2>Salam, Elias</h2>
        <div class="game" style={{ marginTop: 4 }}>
          <GoalRing xp={xpOn(xp)} goal={goal} />
          <div class="stat">
            <b>🔥 {days}</b>
            <span class="small muted">
              day streak{doneToday ? ' · today ✓' : ''}
            </span>
          </div>
          <div class="stat grow">
            <b>Level {lv.level}</b>
            <div class="progress" style={{ margin: '4px 0' }} role="progressbar" aria-label={`Level ${lv.level}`} aria-valuemin={0} aria-valuemax={lv.need} aria-valuenow={lv.into}>
              <span style={{ width: `${Math.round((lv.into / lv.need) * 100)}%` }} />
            </div>
            <span class="small muted">
              {xp.total} XP · {lv.need - lv.into} to level {lv.level + 1}
            </span>
          </div>
        </div>
        <p class="small muted" style={{ margin: '6px 0 0' }}>
          Daily goal {goal} XP (from the minutes below) · overall progress {overall}%
        </p>
        <div class="tabs" role="radiogroup" aria-label="Minutes today" style={{ marginTop: 8 }}>
          {[5, 10, 20, 30].map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mins === m}
              class={`btn small${mins === m ? ' primary' : ''}`}
              onClick={() => {
                setMins(m);
                void kvSet('todayMinutes', m);
              }}
            >
              {m} min{m === 5 ? ' (busy day)' : ''}
            </button>
          ))}
        </div>
        {needsSetup ? (
          <div class="task-now" style={{ marginTop: 8 }}>
            <b>YOUR TASK NOW:</b> set up your microphone (Stage 0, lesson 1) — 6 minutes.
            <div style={{ marginTop: 8 }}>
              <a class="btn primary" href={`#/learn/${LESSONS[0]?.id ?? ''}`}>
                Start setup
              </a>
            </div>
          </div>
        ) : first ? (
          <div class="task-now" style={{ marginTop: 8 }}>
            <b>YOUR TASK NOW:</b> {first.label}.
            <div style={{ marginTop: 8 }}>
              <a class="btn primary" href={first.href}>
                Start
              </a>
            </div>
          </div>
        ) : null}
        {listed.length ? (
          <ol class="small" style={{ paddingLeft: 20, marginBottom: 0 }}>
            {listed.map((it) => (
              <li key={it.label}>
                <a href={it.href}>{it.label}</a> <span class="muted">· {it.why} · ~{it.minutes} min</span>
              </li>
            ))}
          </ol>
        ) : null}
        <p class="small muted" style={{ marginBottom: 0 }}>
          <a href="#/mushaf/1">Listen to Al-Fatiha</a> any time. One streak freeze per week covers a missed day.
        </p>
      </div>
      <div class="card">
        <h2>
          Badges <span class="small muted">{earned.length} of {BADGES.length}</span>
        </h2>
        <div class="badges">
          {BADGES.map((b) => {
            const got = earned.includes(b.id);
            return (
              <div key={b.id} class={`badge${got ? '' : ' locked'}`}>
                <span class="ico" aria-hidden="true">
                  {b.icon}
                </span>
                <b>{b.title}</b>
                <br />
                <span class="muted">{got ? 'earned' : b.how}</span>
              </div>
            );
          })}
        </div>
      </div>
      <CareerTodayCard />
    </>
  );
}
