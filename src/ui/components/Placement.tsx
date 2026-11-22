// Placement ladder (BRIEF Stage 0; review M-7): 4 levels — letters → letters with harakat → joined words → a short ayah
// aloud (self-rated against Sheikh al-Minshawi until the M5 checker exists). Start at level 1; 4 of 5 right climbs a
// level; two fails at one level stop the ladder and learning starts there. Lessons below that point are "placed":
// open, but not mastered. With the Persian/Urdu fast-track on, the sound-pair lessons (s1-12…s1-16) are never skipped.
import { useEffect, useState } from 'preact/hooks';
import { LESSONS } from '../../content/lessons.ts';
import { generate, LETTER_NAMES } from '../../content/generate.ts';
import type { Generator } from '../../content/schema.ts';
import type { QuizItem } from '../../content/quiz.ts';
import { loadSurah, type Ayah } from '../../data/quranData.ts';
import { ayahBuffer, playSegment } from '../../audio/everyayah.ts';
import { resumeAudio } from '../../audio/context.ts';
import { progress, updateProgress } from '../../srs/progress.ts';
import { settings, updateSettings, say } from '../state.ts';
import { Quiz } from './Quiz.tsx';
import { QuranSnippet } from './QuranSnippet.tsx';
import { SayDrill } from './SayDrill.tsx';

const SURAHS = [1, 103, 108, 112, 113, 114];
const LEVEL_NAMES = ['', 'letters', 'letters with harakat', 'joined words', 'a short ayah aloud'];
const AYAT: [number, number][] = [
  [112, 1],
  [108, 1],
];
/** Where learning starts when the ladder stops at `level` (5 = every level passed); earlier Stage 1 lessons are placed. */
const START_AT: Record<number, string> = { 1: 's1-01', 2: 's1-18', 3: 's1-22', 4: 's1-29', 5: '' };
const FAST_TRACK_KEEP = ['s1-12', 's1-13', 's1-14', 's1-15', 's1-16'];

export function placedIds(level: number, fastTrack: boolean): string[] {
  const stage1 = LESSONS.filter((l) => l.stage === 1).sort((a, b) => a.order - b.order);
  const start = START_AT[level];
  const stop = start ? stage1.findIndex((l) => l.id.startsWith(start)) : stage1.length;
  return stage1
    .slice(0, Math.max(0, stop))
    .map((l) => l.id)
    .filter((id) => !(fastTrack && FAST_TRACK_KEEP.some((k) => id.startsWith(k))));
}

function levelItems(level: number, surahs: Map<number, Ayah[]>, seed: number, online: boolean): QuizItem[] {
  const letters = Object.keys(LETTER_NAMES);
  const g: Generator = level === 1 ? { kind: 'letter-id', letters } : level === 2 ? { kind: 'harakah-id', surahs: SURAHS } : online ? { kind: 'word-audio', surahs: SURAHS } : { kind: 'letter-in-word', letters, surahs: SURAHS };
  return generate(g, surahs, 5, seed).map((q) => ({ ...q, handWritten: false }));
}

export function FastTrackCard() {
  const s = settings.value;
  return (
    <label class="row small">
      <input type="checkbox" checked={s.fastTrack} onChange={(e) => updateSettings({ fastTrack: e.currentTarget.checked })} /> I already read Persian/Urdu script (fast-track)
    </label>
  );
}

export function PlacementCard() {
  const s = settings.value;
  const [surahs, setSurahs] = useState<Map<number, Ayah[]> | null>(null);
  const [at, setAt] = useState<{ level: number; fails: number } | null>(null);
  const [items, setItems] = useState<QuizItem[] | null>(null);
  useEffect(() => {
    void Promise.all(SURAHS.map(async (n) => [n, await loadSurah(n)] as const))
      .then((e) => setSurahs(new Map(e)))
      .catch(() => say('The placement ladder needs Quran data: connect to the internet once and reopen this lesson.'));
  }, []);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const go = (level: number, fails: number) => {
    setAt({ level, fails });
    setItems(level <= 3 && surahs ? levelItems(level, surahs, (Date.now() + level * 977 + fails) & 0xffff, online) : null);
  };
  const finish = async (level: number) => {
    const ids = placedIds(level, s.fastTrack);
    for (const l of LESSONS.filter((x) => x.stage === 1)) {
      const placed = ids.includes(l.id);
      if (!!progress.value[l.id]?.placed !== placed) await updateProgress(l.id, { placed });
    }
    updateSettings({ placement: { level, at: Date.now() } });
    setAt(null);
    setItems(null);
    say(level >= 5 ? 'Placement: all four levels passed.' : `Placement: start learning at level ${level} (${LEVEL_NAMES[level]}).`);
  };
  const result = (passed: boolean) => {
    if (!at) return;
    if (passed) {
      if (at.level === 4) void finish(5);
      else go(at.level + 1, 0);
    } else if (at.fails + 1 >= 2) void finish(at.level);
    else go(at.level, at.fails + 1);
  };
  if (at && at.level <= 3 && items)
    return <Quiz key={`${at.level}-${at.fails}`} items={items} title={`Placement · level ${at.level} (${LEVEL_NAMES[at.level]}) · try ${at.fails + 1} of 2`} onDone={(r) => result(r.total >= 3 && r.correct >= r.total - 1)} />;
  if (at && at.level === 4) {
    const [su, ay] = AYAT[at.fails % AYAT.length]!;
    return (
      <div class="card">
        <b>Placement · level 4 (a short ayah aloud) · try {at.fails + 1} of 2</b>
        <QuranSnippet surah={su} ayah={ay} />
        <button
          class="btn"
          onClick={async () => {
            try {
              await resumeAudio();
              const b = await ayahBuffer('murattal', su, ay);
              playSegment(b, 0, b.duration * 1000);
            } catch {
              say('The recording could not play (offline?). Read the ayah and rate yourself anyway.');
            }
          }}
        >
          ▶ Sheikh al-Minshawi
        </button>
        <SayDrill prompt="Now recite it aloud" times={1} seconds={6} />
        <p class="small">Compare your recording with his, honestly:</p>
        <div class="stack">
          <button class="btn block" onClick={() => result(true)}>
            Every letter and vowel was right
          </button>
          <button class="btn block" onClick={() => result(false)}>
            One or two slips
          </button>
          <button class="btn block" onClick={() => result(false)}>
            Many mistakes, or I could not read it
          </button>
        </div>
      </div>
    );
  }
  const p = s.placement;
  const startId = p && p.level < 5 ? START_AT[p.level] : '';
  const start = startId ? LESSONS.find((l) => l.id.startsWith(startId)) : undefined;
  return (
    <div class="card">
      <h2>Placement ladder</h2>
      <p class="small">
        4 levels: letters → letters with harakat → joined words → a short ayah aloud. Get 4 of 5 right to climb; two fails at one level stop the ladder, and you start learning there.
        {s.fastTrack ? ' Fast-track is on: the sound-pair lessons (Stage 1, lessons 12–16) stay on your path whatever the ladder says.' : ''}
      </p>
      {p ? (
        <p class="small">
          <b>Result:</b> {p.level >= 5 ? 'all four levels passed: Stage 1 is placed.' : `stopped at level ${p.level} (${LEVEL_NAMES[p.level]}).`}{' '}
          {start ? <a href={`#/learn/${start.id}`}>Start here: {start.title}</a> : null}
        </p>
      ) : null}
      <button class="btn primary" disabled={!surahs} onClick={() => go(1, 0)}>
        {p ? 'Redo the ladder' : 'Start at level 1'}
      </button>
    </div>
  );
}
