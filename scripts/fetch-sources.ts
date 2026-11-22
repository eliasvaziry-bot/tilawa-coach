// Downloads every pinned build input from data/source/SOURCES.json into .cache/ and verifies checksums.
// Usage: node scripts/fetch-sources.ts [--accept-new]
// Polite: sequential downloads, a clear User-Agent, cached between runs.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache');
const ACCEPT_NEW = process.argv.includes('--accept-new');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > 0 ? new Set(process.argv[onlyIdx + 1]!.split(',')) : null;
const UA = 'tilawa-coach-build/0.1 (personal non-commercial study app)';

interface Source {
  id: string;
  url?: string;
  git?: string;
  commit?: string;
  sha256?: string;
  cache: string;
  commitCopy?: string;
  extract?: Record<string, string | null>;
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'data/source/SOURCES.json'), 'utf8')) as { sources: Source[] };

const sha256 = (buf: Buffer | string): string => createHash('sha256').update(buf).digest('hex');
const sha256File = (p: string): string => sha256(readFileSync(p));

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

let failures = 0;
function check(id: string, path: string, expected: string | null | undefined): void {
  if (!expected) return;
  const got = sha256File(path);
  if (got !== expected) {
    const msg = `[${id}] checksum mismatch for ${path}\n  expected ${expected}\n  got      ${got}`;
    if (ACCEPT_NEW) console.warn(`${msg}\n  (--accept-new: update SOURCES.json and log the change in DECISIONS.md)`);
    else {
      console.error(`${msg}\n  The upstream file changed. Investigate the diff before accepting (never "fix" Quran text).`);
      failures++;
    }
  }
}

for (const s of manifest.sources) {
  if (ONLY && !ONLY.has(s.id)) continue;
  const dest = join(CACHE, s.cache);
  if (s.git) {
    if (!existsSync(join(dest, '.git'))) {
      mkdirSync(dirname(dest), { recursive: true });
      execFileSync('git', ['clone', '-q', s.git, dest], { stdio: 'inherit' });
    }
    execFileSync('git', ['-C', dest, 'fetch', '-q', '--depth', '50', 'origin'], { stdio: 'inherit' });
    execFileSync('git', ['-C', dest, 'checkout', '-q', s.commit!], { stdio: 'inherit' });
    console.log(`[${s.id}] git ${s.commit!.slice(0, 7)} ok`);
    continue;
  }
  if (s.extract) {
    mkdirSync(dest, { recursive: true });
    const need = Object.keys(s.extract).filter((f) => !existsSync(join(dest, f)));
    if (need.length) {
      const zip = join(CACHE, `${s.id}.zip`);
      writeFileSync(zip, await download(s.url!));
      execFileSync('unzip', ['-q', '-o', zip, ...need, '-d', dest], { stdio: 'inherit' });
    }
    for (const [f, h] of Object.entries(s.extract)) check(s.id, join(dest, f), h);
    console.log(`[${s.id}] ${Object.keys(s.extract).length} files ok`);
    continue;
  }
  if (!existsSync(dest)) {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, await download(s.url!));
    console.log(`[${s.id}] downloaded`);
  }
  check(s.id, dest, s.sha256);
  if (s.commitCopy) {
    const out = join(ROOT, s.commitCopy);
    mkdirSync(dirname(out), { recursive: true });
    if (!existsSync(out) || sha256File(out) !== sha256File(dest)) copyFileSync(dest, out);
  }
  console.log(`[${s.id}] ok`);
}

if (failures) {
  console.error(`${failures} checksum failure(s).`);
  process.exit(1);
}
