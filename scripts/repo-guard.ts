// REPO GUARD (BRIEF non-negotiables 5 + 6). Fails if the repo would publish:
//  - audio / video / model / dataset / archive files
//  - Quran Foundation (Quran.com) API data (only tiny synthetic mocks are allowed, in tests/fixtures/qf-mocks/)
//  - personal data (private/, recordings, e-mail addresses, absolute home paths, and any term listed in the
//    local-only private/guard-terms.txt — that file is gitignored so the list itself is never published)
//  - very large files
// Usage: node scripts/repo-guard.ts            (checks tracked files: CI)
//        node scripts/repo-guard.ts --staged   (checks the staged snapshot: pre-commit hook)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const staged = process.argv.includes('--staged');
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 26 }).toString('utf8');

const files = (staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR') : git('ls-files'))
  .split('\n')
  .filter(Boolean);
const read = (f: string): Buffer => (staged ? execFileSync('git', ['show', `:${f}`], { cwd: ROOT, maxBuffer: 1 << 28 }) : readFileSync(join(ROOT, f)));

const BLOCKED_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|caf|aiff?|webm|mp4|m4v|mov|mkv|onnx|ort|pt|pth|ckpt|safetensors|tflite|gguf|bin|parquet|arrow|feather|npz|npy|h5|zip|tar|tgz|gz|xz|7z|rar)$/i;
const BLOCKED_PATH = /^(private|recordings|my-clips|reports\/personal|\.cache|vendor|data-raw)\/|\.private\.|\.local\./;
const MAX_BYTES = 6 * 1024 * 1024;
const TEXT_EXT = /\.(json|txt|md|ts|tsx|js|mjs|cjs|html|css|xml|yml|yaml|csv|svg|webmanifest)$/i;
// Field names that only appear in Quran.com / Quran Foundation API payloads.
const QF_SIGNATURES = [/"verse_key"\s*:/, /"text_uthmani(_tajweed)?"\s*:/, /"timestamp_from"\s*:/, /"audio_files"\s*:/, /"verse_timings"\s*:/, /<tajweed class=/, /"chapter_id"\s*:\s*\d+/];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_ALLOW = [/noreply@anthropic\.com/i, /@tilawa-coach\.invalid$/i, /@users\.noreply\.github\.com$/i, /^git@github\.com$/i, /@example\.(com|org)$/i];
const HOME_PATH = /\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|C:\\Users\\/;

const localTermsFile = join(ROOT, 'private/guard-terms.txt');
const localTerms = existsSync(localTermsFile)
  ? readFileSync(localTermsFile, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : [];

const problems: string[] = [];
for (const f of files) {
  if (BLOCKED_EXT.test(f)) problems.push(`${f}: audio/model/dataset/archive files are never committed`);
  if (BLOCKED_PATH.test(f)) problems.push(`${f}: private or cache path`);
  let buf: Buffer;
  try {
    buf = read(f);
  } catch {
    continue; // deleted in working tree
  }
  if (buf.length > MAX_BYTES) problems.push(`${f}: ${(buf.length / 1048576).toFixed(1)} MB is too large for the repo`);
  if (!TEXT_EXT.test(f) || f === 'scripts/repo-guard.ts') continue;
  const text = buf.toString('utf8');
  // small test files that declare QF-SYNTHETIC build fake markup from our own Tanzil text (no Quran Foundation data)
  const isMock = f.startsWith('tests/fixtures/qf-mocks/') || (f.startsWith('tests/') && text.includes('QF-SYNTHETIC') && buf.length < 16384);
  if (QF_SIGNATURES.some((re) => re.test(text))) {
    if (!isMock) problems.push(`${f}: looks like Quran Foundation API data (runtime-only, never committed)`);
    else if (!text.includes('QF-SYNTHETIC') && (!text.includes('"_synthetic": true') || buf.length > 8192)) problems.push(`${f}: QF mocks must be small and marked "_synthetic": true`);
  }
  // package-lock.json carries third-party package metadata (maintainer addresses in deprecation notes), not ours
  if (f !== 'package-lock.json') for (const m of text.match(EMAIL) ?? []) if (!EMAIL_ALLOW.some((re) => re.test(m))) problems.push(`${f}: e-mail address "${m}"`);
  if (HOME_PATH.test(text)) problems.push(`${f}: absolute home-directory path (leaks a username)`);
  for (const term of localTerms) if (text.toLowerCase().includes(term.toLowerCase())) problems.push(`${f}: contains a private term from private/guard-terms.txt`);
}

if (!staged && !existsSync(statSync(ROOT).isDirectory() ? join(ROOT, '.gitignore') : '')) problems.push('.gitignore missing');
// M-10: the pre-publication history holds personal files and must never be published. On the owner's Mac,
// .git/private-history-roots lists its root commits: HEAD must never descend from them again (D-013).
const rootsFile = join(ROOT, '.git/private-history-roots');
if (existsSync(rootsFile))
  for (const r of readFileSync(rootsFile, 'utf8').split(/\s+/).filter(Boolean)) {
    let inHead = false;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', r, 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
      inHead = true;
    } catch {
      // not an ancestor (or no HEAD yet): fine
    }
    if (inHead) problems.push(`HEAD contains the private pre-publication history (root ${r.slice(0, 8)}): see DECISIONS D-013`);
  }

if (problems.length) {
  console.error(`REPO GUARD: ${problems.length} problem(s)\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log(`repo guard ok (${files.length} ${staged ? 'staged' : 'tracked'} files${localTerms.length ? `, ${localTerms.length} private terms` : ''})`);
