// Content linter (BRIEF B7), run in CI. Checks every lesson in src/content/lessons/:
//  schema · ids/order/prerequisites · YOUR TASK NOW + memory hook · provenance (references must be listed in
//  sources with an opened date) · bank sizes (≥12 practice; ≥20-item mastery pool with ≥6 hand-written held-out;
//  setup lessons excepted) · distinct options · examples really contain their tajweed rule (annotation data) ·
//  even MCQ answer positions over 1,000 generated questions. Also checks the Career Desk data provenance.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Lesson, type Lesson as LessonT } from '../src/content/schema.ts';
import { decodeAyah, type Ayah, type RawAyah } from '../src/data/quranData.ts';
import { DAY, masterySet, practiceSet, isSetupLesson } from '../src/content/quiz.ts';
import { generate } from '../src/content/generate.ts';
import { recitedWords } from '../src/data/quranData.ts';

const ROOT = resolve(import.meta.dirname, '..');
const problems: string[] = [];
const warn: string[] = [];

// ---------- Quran data (for generators and example checks) ----------
const index = JSON.parse(readFileSync(join(ROOT, 'public/data/quran/index.json'), 'utf8')) as { surahs: { file: string }[] };
const surahs = new Map<number, Ayah[]>();
const loadSurah = (n: number) => {
  if (!surahs.has(n)) {
    const d = JSON.parse(readFileSync(join(ROOT, 'public/data/quran', index.surahs[n - 1]!.file), 'utf8')) as { ayat: RawAyah[] };
    surahs.set(n, d.ayat.map((a, i) => decodeAyah(n, i + 1, a)));
  }
  return surahs.get(n)!;
};

// ---------- lessons ----------
const dir = join(ROOT, 'src/content/lessons');
const lessons: LessonT[] = [];
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? process.argv[onlyArg + 1]!.split(',') : null;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && (!ONLY || ONLY.some((p) => x.startsWith(p)))).sort()) {
  const raw = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown;
  const r = Lesson.safeParse(raw);
  if (!r.success) {
    problems.push(`${f}: schema — ${r.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    continue;
  }
  const L = r.data;
  if (`${L.id}.json` !== f) problems.push(`${f}: id "${L.id}" must match the file name`);
  lessons.push(L);
}
const ids = new Set(lessons.map((l) => l.id));
const orders = new Set<string>();
for (const L of lessons) {
  const ok = `${L.stage}:${L.order}`;
  if (orders.has(ok)) problems.push(`${L.id}: duplicate order ${ok}`);
  orders.add(ok);
  for (const p of L.prerequisites) if (!ids.has(p) && !ONLY) problems.push(`${L.id}: unknown prerequisite ${p}`);
  // tasks must name something the app really has (M-6): there is no recording "Check" button until M5
  for (const t of [L.taskNow, ...(L.stepTasks ?? [])]) if (/press\s+check/i.test(t)) problems.push(`${L.id}: task says "press Check", a button that does not exist: "${t.slice(0, 60)}…"`);
  // provenance: every reference must be listed in sources
  const refs: string[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') {
      const o = n as Record<string, unknown> & { provenance?: { kind: string; url?: string } };
      if (o.provenance?.kind === 'reference' && o.provenance.url) refs.push(o.provenance.url);
      Object.values(o).forEach(walk);
    }
  };
  walk(L);
  for (const u of refs) if (!L.sources.some((s) => s.url === u)) problems.push(`${L.id}: reference ${u} is not listed in sources (cite only sources you opened)`);
  // questions
  for (const q of L.questions) if (new Set(q.options).size !== 4) problems.push(`${L.id}/${q.id}: options must be 4 distinct answers`);
  const qids = new Set<string>();
  for (const q of L.questions) {
    if (qids.has(q.id)) problems.push(`${L.id}: duplicate question id ${q.id}`);
    qids.add(q.id);
  }
  // examples: refs exist; rules really present in the word range
  for (const ex of L.examples) {
    const [s, a] = ex.ref.split(':').map(Number) as [number, number];
    const ay = loadSurah(s)[a - 1];
    if (!ay) {
      problems.push(`${L.id}: example ${ex.ref} does not exist`);
      continue;
    }
    const words = recitedWords(ay);
    const [from, to] = ex.words ?? [0, words.length];
    if (to > words.length) problems.push(`${L.id}: example ${ex.ref} word range ${from}-${to} beyond ${words.length} words`);
    if (ex.rule) {
      const ws = words[from]?.start ?? 0;
      const we = words[Math.min(to, words.length) - 1]?.end ?? 0;
      if (!ay.annotations.some((x) => x.rule.id === ex.rule && x.start < we && x.end > ws)) problems.push(`${L.id}: example ${ex.ref} words ${from}-${to} has no ${ex.rule} in the annotation data`);
    }
  }
  for (const g of L.generators) if ('surahs' in g) g.surahs.forEach(loadSurah);
  // bank sizes
  if (!isSetupLesson(L)) {
    const practice = practiceSet(L, surahs, 1);
    const heldOut = L.questions.filter((q) => q.heldOut).length;
    if (practice.length < 12) problems.push(`${L.id}: only ${practice.length} practice questions (need ≥ 12)`);
    if (heldOut < 6) problems.push(`${L.id}: ${heldOut} hand-written held-out questions (need ≥ 6)`);
    // B-1: simulate a learner — 10 practice quizzes, a failed test, a passed test, a retest 3 days later and a spare
    // retest: every test must still find ≥ 20 items it has not used (practice never touches the mastery partition)
    const used: Record<string, number> = {};
    const seen = new Set<string>();
    for (let k = 0; k < 10; k++) for (const q of practiceSet(L, surahs, 50 + k)) seen.add(q.id);
    [0, 0, 3, 4].forEach((day, k) => {
      const set = masterySet(L, surahs, 90 + k, used, day * DAY, { noAudio: true }, seen);
      if (set.length < 20) problems.push(`${L.id}: mastery test ${k + 1} (day ${day}) finds only ${set.length} unused items (need ≥ 20)`);
      for (const q of set) used[q.id] = day * DAY;
    });
    // m-10: test-wise learners pick the longest option; warn when the right answer is usually the longest
    const longest = L.questions.filter((q) => {
      const len = q.options.map((o) => o.length);
      return len[q.answer]! > Math.max(...len.filter((_, k) => k !== q.answer));
    }).length;
    if (L.questions.length >= 8 && longest / L.questions.length > 0.5) warn.push(`${L.id}: the right option is the longest in ${longest} of ${L.questions.length} hand-written questions`);
    // M-2: a generator whose answer never changes teaches nothing
    L.generators.forEach((g, gi) => {
      const items = generate(g, surahs, 40, 7 + gi); // about what a quiz draws
      if (items.length < 20) return;
      const counts = new Map<string, number>();
      for (const q of items) counts.set(q.options[q.answer]!, (counts.get(q.options[q.answer]!) ?? 0) + 1);
      const top = Math.max(...counts.values()) / items.length;
      if (top > 0.75 && g.kind !== 'word-audio') problems.push(`${L.id}: generator ${gi + 1} (${g.kind}) gives the same answer ${Math.round(top * 100)}% of the time`);
    });
  }
}

// ---------- answer-position balance over 1,000 generated questions (B13) ----------
// One question per (seed, lesson) so the 1,000 draws are independent (reusing a few practice sets is too noisy).
const pos = [0, 0, 0, 0];
let made = 0;
const quizLessons = lessons.filter((l) => !isSetupLesson(l));
for (let seed = 1; quizLessons.length && made < 1000; seed++) {
  for (const L of quizLessons) {
    const set = practiceSet(L, surahs, seed);
    const item = set[seed % set.length];
    if (!item) continue;
    pos[item.answer]!++;
    if (++made >= 1000) break;
  }
}
if (made >= 1000) {
  const skew = pos.map((p) => Math.abs(p / made - 0.25));
  if (skew.some((x) => x > 0.04)) problems.push(`MCQ answer positions are uneven over ${made} questions: ${pos.join('/')}`);
}

// ---------- the same seed must not give different lessons the same answer positions ----------
{
  const patterns = new Map<string, string[]>();
  for (const L of quizLessons) {
    const p = practiceSet(L, surahs, 1).slice(0, 8).map((q) => q.answer).join('');
    if (p.length === 8) (patterns.get(p) ?? patterns.set(p, []).get(p)!).push(L.id);
  }
  for (const [p, ids] of patterns) if (ids.length >= 3) problems.push(`answer positions ${p} repeat across lessons ${ids.join(', ')} for the same seed`);
}

// ---------- career data: only ciphertext is public (private/career/ is validated by build-career-pack.ts) ----------
const packPath = join(ROOT, 'public/data/career/pack.enc.json');
const packRaw = readFileSync(packPath, 'utf8');
const packJ = JSON.parse(packRaw) as Record<string, unknown>;
if (packJ.v !== 1 || typeof packJ.ct !== 'string' || /https?:|deadline/i.test(packRaw)) problems.push('career pack must be the encrypted form only');

const mk = lessons.reduce((a, l) => a + JSON.stringify(l).split('"model-knowledge"').length - 1, 0);
if (warn.length) console.warn(warn.join('\n'));
if (problems.length) {
  console.error(`CONTENT LINT: ${problems.length} problem(s)\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log(`content lint ok: ${lessons.length} lessons (${lessons.filter(isSetupLesson).length} setup), ${mk} model-knowledge items, answer positions ${pos.join('/')} over ${made}, encrypted career pack ok`);
