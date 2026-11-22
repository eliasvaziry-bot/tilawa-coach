// Which lessons are open (shared by the stage map, the lesson player and Today; m-5).
import { LESSON_BY_ID } from './lessons.ts';
import { masteryPassed, type LessonProgress } from '../srs/progress.ts';

type P = Record<string, LessonProgress>;
/** Done enough to open the next lesson: mastery test passed, setup completed, or placed past by the ladder. */
export function prereqDone(id: string, p: P): boolean {
  const l = LESSON_BY_ID.get(id);
  return masteryPassed(p[id]?.mastery ?? null) || !!p[id]?.setupDone || !!p[id]?.placed || (!!l && l.setup && !!p[id]?.checksPassed);
}
export function lessonOpen(l: { id: string; prerequisites: string[] }, p: P): boolean {
  return !!p[l.id]?.placed || l.prerequisites.every((x) => prereqDone(x, p));
}
