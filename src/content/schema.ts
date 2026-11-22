// Lesson format (BRIEF B7): one JSON file per lesson in src/content/lessons/, validated here and by the content
// linter in CI. Every teaching fact carries provenance: dataset (file+field) / reference (a source actually opened,
// with URL + date) / model-knowledge (listed in TEACHER_REVIEW.md, shown with a "not yet teacher-checked" badge).
// Quran words are NEVER typed in lessons: examples point at ayat/word ranges in the shipped Tanzil data.
import { z } from 'zod';

export const Provenance = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dataset'), source: z.string().min(3) }),
  z.object({ kind: z.literal('reference'), title: z.string().min(3), url: z.string().url(), opened: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ kind: z.literal('model-knowledge') }),
  /** instructions about using the app (not a teaching fact): no review badge */
  z.object({ kind: z.literal('app') }),
]);
export type Provenance = z.infer<typeof Provenance>;

/** A piece of teaching text with its provenance. `extra` = nice-to-know facts/analogies (B1). */
export const Fact = z.object({ text: z.string().min(1), provenance: Provenance, extra: z.boolean().optional() });
export type Fact = z.infer<typeof Fact>;

const AyahRef = z.string().regex(/^\d{1,3}:\d{1,3}$/);
export const Example = z.object({
  ref: AyahRef,
  /** recited-word range [from, to) (basmala prefix excluded) */
  words: z.tuple([z.number().int().min(0), z.number().int().min(1)]).optional(),
  /** if set, the linter checks the annotation data really has this rule inside the word range */
  rule: z.string().optional(),
  note: Fact.optional(),
});

export const Visual = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('letters'), letters: z.array(z.string().min(1).max(3)).min(1), caption: z.string().optional() }),
  z.object({ kind: z.literal('makhraj'), points: z.array(z.object({ letter: z.string(), region: z.enum(['jawf', 'halq', 'lisan', 'shafatan', 'khayshum']), detail: z.string() })), provenance: Provenance }),
  z.object({ kind: z.literal('arrows'), steps: z.array(z.string()).min(2), provenance: Provenance }),
  z.object({ kind: z.literal('letter-forms'), letters: z.array(z.string().min(1).max(2)).min(1) }),
  z.object({ kind: z.literal('tajweed-legend') }),
  z.object({ kind: z.literal('pitch-graph') }),
  z.object({ kind: z.literal('none') }),
]);

export const Listen = z.discriminatedUnion('source', [
  z.object({ source: z.literal('minshawi-ayah'), ref: AyahRef }),
  z.object({ source: z.literal('minshawi-words'), ref: AyahRef, words: z.tuple([z.number().int().min(0), z.number().int().min(1)]) }),
  /** Nuraniah Qaida teacher video (YouTube, tap to play). segment only after the owner has marked it. */
  z.object({ source: z.literal('nuraniah'), lesson: z.number().int().min(1).max(17), note: z.string().optional() }),
]);

export const Drill = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('say'), prompt: z.string(), target: z.string().max(12).optional(), times: z.number().int().min(1).max(10).default(3), record: z.boolean().default(true) }),
  z.object({ kind: z.literal('minimal-pair'), pair: z.tuple([z.string().max(3), z.string().max(3)]), tip: Fact }),
  z.object({ kind: z.literal('echo'), ref: AyahRef, words: z.tuple([z.number().int().min(0), z.number().int().min(1)]).optional() }),
  z.object({ kind: z.literal('setup'), component: z.enum(['mic', 'noise', 'record', 'latency', 'range', 'fast-track', 'placement']) }),
]);

export const Question = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  q: z.string().min(5),
  /** exactly 4 options; options[answer] is correct. Shown shuffled (the correct one lands in a random position). */
  options: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
  answer: z.number().int().min(0).max(3),
  /** why each option is right/wrong (B7: every distractor plausible + explained) */
  explain: z.tuple([z.string().min(3), z.string().min(3), z.string().min(3), z.string().min(3)]),
  provenance: Provenance,
  /** held-out questions are only used in mastery tests */
  heldOut: z.boolean().default(false),
});
export type Question = z.infer<typeof Question>;

export const Generator = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('letter-id'), letters: z.array(z.string().max(2)).min(2) }),
  z.object({ kind: z.literal('letter-in-word'), letters: z.array(z.string().max(2)).min(1), surahs: z.array(z.number().int().min(1).max(114)).min(1) }),
  z.object({ kind: z.literal('harakah-id'), surahs: z.array(z.number().int().min(1).max(114)).min(1) }),
  z.object({ kind: z.literal('rule-id'), rules: z.array(z.string()).min(1), surahs: z.array(z.number().int().min(1).max(114)).min(1) }),
  z.object({ kind: z.literal('madd-count'), surahs: z.array(z.number().int().min(1).max(114)).min(1) }),
  z.object({ kind: z.literal('word-audio'), surahs: z.array(z.number().int().min(1).max(114)).min(1) }),
  /** the lesson's key distinction, found in the text (wasl/qat', sun/moon lam, long/short vowel, small signs) */
  z.object({ kind: z.literal('contrast'), set: z.enum(['wasl-qat', 'sun-moon', 'long-vowel', 'small-sign', 'shadda']), surahs: z.array(z.number().int().min(1).max(114)).min(1) }),
]);
export type Generator = z.infer<typeof Generator>;

export const Lesson = z.object({
  id: z.string().regex(/^s[0-5]-\d{2}-[a-z0-9-]+$/),
  stage: z.number().int().min(0).max(5),
  order: z.number().int().min(1),
  title: z.string().min(3),
  minutes: z.number().min(3).max(40),
  prerequisites: z.array(z.string()).default([]),
  bigIdea: Fact, // simple explanation first
  proper: z.array(Fact).min(1), // the proper, detailed version
  visual: Visual,
  memoryHook: Fact,
  extras: z.array(Fact).default([]),
  examples: z.array(Example).default([]),
  letters: z.array(z.string().max(2)).default([]),
  listen: z.array(Listen).default([]),
  drills: z.array(Drill).default([]),
  cr: z.array(z.object({ ref: AyahRef, mode: z.enum(['echo', 'buildup', 'ladder', 'ghost']) })).default([]),
  check: z.object({
    quiz: z.object({ practice: z.number().int().min(4).default(12), mastery: z.number().int().min(20).default(20) }),
    selfRate: z.boolean().default(false),
    recitation: z.object({ ref: AyahRef, checks: z.array(z.enum(['madd', 'ghunnah', 'qalqalah', 'waqf', 'tempo'])) }).optional(),
  }),
  questions: z.array(Question).default([]),
  generators: z.array(Generator).default([]),
  remnote: z.array(z.string().regex(/^.+ == .+$/)).min(1),
  sources: z.array(z.object({ title: z.string(), url: z.string().url(), opened: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).default([]),
  reviewStatus: z.enum(['unreviewed', 'teacher-approved']).default('unreviewed'),
  taskNow: z.string().min(10),
  /** optional one-line task for steps 1–6 (step 7 is taskNow); the player builds a concrete default when absent */
  stepTasks: z.array(z.string().min(10)).length(6).optional(),
});
export type Lesson = z.infer<typeof Lesson>;
