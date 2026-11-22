// Translations are build-time only (Tanzil terms: non-commercial use; kept out of git — DECISIONS D-007).
// Reads .cache/tanzil-meta/<id>.txt (pinned by fetch-sources) → public/data/trans/<id>/sNNN.json (gitignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const index = JSON.parse(readFileSync(join(ROOT, 'public/data/quran/index.json'), 'utf8')) as { surahs: { n: number; ayas: number }[] };
let built = 0;
for (const id of ['en.qarai', 'en.shakir']) {
  const p = join(ROOT, '.cache/tanzil-meta', `${id}.txt`);
  if (!existsSync(p)) {
    console.warn(`translation ${id} not fetched (run fetch-sources); skipped`);
    continue;
  }
  const tr = new Map<string, string>();
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const parts = line.split('|');
    if (parts.length >= 3) tr.set(`${parts[0]}:${parts[1]}`, parts.slice(2).join('|').trim());
  }
  const dir = join(ROOT, 'public/data/trans', id);
  mkdirSync(dir, { recursive: true });
  // every file carries its source and terms (review m-13)
  const notice = `${id} translation from Tanzil (tanzil.net/trans), used under Tanzil's terms: non-commercial use, with this credit.`;
  for (const s of index.surahs) writeFileSync(join(dir, `s${String(s.n).padStart(3, '0')}.json`), JSON.stringify({ notice, ayat: Array.from({ length: s.ayas }, (_, i) => tr.get(`${s.n}:${i + 1}`) ?? '') }));
  built++;
}
console.log(`translations built: ${built}`);
