// Builds public/data/career/pack.enc.json (ciphertext only) from the gitignored private/career/ files.
// Validates provenance first (every opportunity/pathway fact has a source opened on a date).
// Usage: node scripts/build-career-pack.ts   (no-op with a warning when private/ is absent, e.g. in CI)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encryptPack } from '../src/career/pack.ts';

const ROOT = resolve(import.meta.dirname, '..');
const P = (f: string) => join(ROOT, 'private/career', f);
if (!existsSync(P('PASSPHRASE.txt')) || !existsSync(P('opportunities.json'))) {
  console.warn('private/career not present: career pack not rebuilt (the committed ciphertext is kept).');
  process.exit(0);
}
const read = <T>(f: string, d: T): T => (existsSync(P(f)) ? (JSON.parse(readFileSync(P(f), 'utf8')) as T) : d);
type Opp = { id: string; source?: { url?: string; accessed?: string }; verified?: string; deadline?: string };
const pub = read<{ generated: string; items: Opp[] }>('opportunities.json', { generated: '', items: [] });
const priv = read<{ items: Opp[] }>('opportunities.private.json', { items: [] });
const pathways = read<{ items: { id: string; facts: { sourceUrl: string }[] }[] }>('pathways.json', { items: [] });
const profile = read<Record<string, unknown>>('profile.private.json', {});

const problems: string[] = [];
const ids = new Set<string>();
for (const o of [...pub.items, ...priv.items]) {
  if (ids.has(o.id)) problems.push(`duplicate id ${o.id}`);
  ids.add(o.id);
  if (!o.source?.url || !o.source.accessed) problems.push(`${o.id}: missing source url / accessed date`);
  if (!o.verified) problems.push(`${o.id}: missing verified level`);
  if (o.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(o.deadline)) problems.push(`${o.id}: bad deadline ${o.deadline}`);
}
for (const p of pathways.items) for (const f of p.facts) if (!/^https?:\/\//.test(f.sourceUrl)) problems.push(`pathway ${p.id}: fact without a source URL`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
const pack = {
  generated: pub.generated,
  opportunities: [...priv.items.map((o) => ({ ...o, private: true })), ...pub.items],
  pathways: pathways.items,
  profile,
};
const pass = readFileSync(P('PASSPHRASE.txt'), 'utf8').trim();
const enc = await encryptPack(pack, pass);
mkdirSync(join(ROOT, 'public/data/career'), { recursive: true });
writeFileSync(join(ROOT, 'public/data/career/pack.enc.json'), JSON.stringify(enc) + '\n');
console.log(`career pack: ${pack.opportunities.length} opportunities, ${pack.pathways.length} pathways → public/data/career/pack.enc.json (encrypted)`);
