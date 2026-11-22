// Compares the shipped (rebuilt cpfair) annotations with our independent rule engine (src/data/ruleEngine.ts) and saves
// data/derived/engine-compare.json: agreement per rule + every disagreement. The data build reads it to flag
// cpfair-only locations (ENGINE_DISPUTED); teacher-review.ts lists all of them.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { engineDiff } from './lib/engine-diff.ts';

const ROOT = resolve(import.meta.dirname, '..');
const { perRule: rows, disputes } = engineDiff(ROOT);
writeFileSync(
  join(ROOT, 'data/derived/engine-compare.json'),
  JSON.stringify({ note: 'Independent rule engine vs rebuilt cpfair (wasl reading within the ayah; the ayah end is a stop). Engine rules are model-knowledge; disagreements go to the teacher.', perRule: rows, disputeCount: disputes.length, disputes }).replace(/\],\[/g, '],\n[') + '\n',
);
for (const r of rows) console.log(`${r.rule.padEnd(22)} both ${String(r.both).padStart(6)}  cpfair-only ${String(r.cpfairOnly).padStart(5)}  engine-only ${String(r.engineOnly).padStart(5)}  agree ${r.agreePct}%`);
