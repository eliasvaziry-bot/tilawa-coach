// RemNote export (B1): "Question == Answer", one card per line, no blank lines, no headings, lean set.
import type { Lesson } from './schema.ts';

export function remnoteText(lessons: Lesson[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const l of lessons)
    for (const line of l.remnote) {
      const t = line.replace(/\s*\n\s*/g, ' ').trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        lines.push(t);
      }
    }
  return lines.join('\n');
}
