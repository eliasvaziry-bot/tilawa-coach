// Builds src/content/lesson-index.json: the small part of every lesson the app needs at start-up (map, Today, gating).
// Full lessons load lazily when opened (review M-12). `--check` fails if the committed index is stale (CI).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Lesson } from '../src/content/schema.ts';

const ROOT = resolve(import.meta.dirname, '..');
const dir = join(ROOT, 'src/content/lessons');
export function buildIndex(): string {
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => Lesson.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
    .sort((a, b) => a.stage - b.stage || a.order - b.order)
    .map((l) => ({ id: l.id, stage: l.stage, order: l.order, title: l.title, minutes: l.minutes, prerequisites: l.prerequisites, setup: l.stage === 0 && l.drills.length > 0 && l.drills.every((d) => d.kind === 'setup') }));
  return JSON.stringify(rows, null, 1) + '\n';
}
const out = join(ROOT, 'src/content/lesson-index.json');
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== buildIndex()) {
    console.error('src/content/lesson-index.json is stale: run node scripts/lesson-index.ts');
    process.exit(1);
  }
  console.log('lesson index ok');
} else {
  writeFileSync(out, buildIndex());
  console.log('wrote src/content/lesson-index.json');
}
