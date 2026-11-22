// Lessons. The start-up bundle holds only a small index (lesson-index.json, built by scripts/lesson-index.ts); a full
// lesson (validated with zod) loads lazily when it is opened, so start-up cost does not grow with content (M-12).
import index from './lesson-index.json';
import review from './review.json';
import type { Lesson as LessonT } from './schema.ts';

export interface LessonMeta {
  id: string;
  stage: number;
  order: number;
  title: string;
  minutes: number;
  prerequisites: string[];
  /** a Stage 0 setup lesson (device checks; no mastery test) */
  setup: boolean;
  reviewStatus: 'unreviewed' | 'teacher-approved';
}
const approved = (review as { approved: string[] }).approved;
export const LESSONS: LessonMeta[] = (index as Omit<LessonMeta, 'reviewStatus'>[]).map((m) => ({ ...m, reviewStatus: approved.includes(m.id) ? 'teacher-approved' : 'unreviewed' }));
export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));

const loaders = import.meta.glob('./lessons/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;
const cache = new Map<string, Promise<LessonT>>();
/** Load, validate and return one full lesson (cached). */
export function loadLesson(id: string): Promise<LessonT> {
  let p = cache.get(id);
  if (!p) {
    const load = loaders[`./lessons/${id}.json`];
    if (!load) return Promise.reject(new Error(`unknown lesson ${id}`));
    p = Promise.all([load(), import('./schema.ts')]).then(([raw, { Lesson }]) => {
      const l = Lesson.parse(raw);
      return approved.includes(l.id) ? { ...l, reviewStatus: 'teacher-approved' as const } : l;
    });
    cache.set(id, p);
  }
  return p;
}
export const loadAllLessons = (): Promise<LessonT[]> => Promise.all(LESSONS.map((l) => loadLesson(l.id)));

export const STAGES = [
  { n: 0, title: 'Setup and placement', planned: '4–6 lessons', goal: 'Your phone is ready, and you know where to start.' },
  { n: 1, title: 'Reading (Qaida-style)', planned: '30–40 lessons', goal: 'You can read the letters, vowels and words of the Mushaf on your own.' },
  { n: 2, title: 'Tajweed', planned: '40–55 lessons (M5)', goal: 'You apply the tajweed rules as you recite.' },
  { n: 3, title: 'Reciting beautifully', planned: '15–20 lessons (M7)', goal: 'You recite with breath control, melody and feeling.' },
  { n: 4, title: 'Latmiya (Basim al-Karbalai)', planned: '10–16 lessons (M8)', goal: 'You recite latmiya with its rhythm and refrains.' },
  { n: 5, title: 'Shoor (al-Khaqani)', planned: '8–14 lessons (M8)', goal: 'You lead shoor with its fast pulse.' },
];

/** The 7 player steps (B8): simple → proper → visual → listen → practise → check → YOUR TASK NOW. */
export const STEP_NAMES = ['Big idea', 'Properly', 'Picture', 'Listen', 'Practise', 'Check', 'Your task'] as const;

export function lessonSurahs(l: LessonT): number[] {
  const s = new Set<number>();
  for (const g of l.generators) if ('surahs' in g) g.surahs.forEach((x) => s.add(x));
  for (const e of l.examples) s.add(Number(e.ref.split(':')[0]));
  return [...s];
}
