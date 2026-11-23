# ARCHITECTURE

Offline-first PWA, no backend. Vite 8 + TypeScript (strict) + Preact 10 + @preact/signals, vite-plugin-pwa
(Workbox), IndexedDB via `idb`. Hash routing (works on GitHub Pages without rewrites).

```
data/source/        pinned inputs (SOURCES.json, verbatim Tanzil text + metadata, quran-align overrides)
data/derived/       committed build reports (annotation stats, timing repair logs, sync check, disputes)
scripts/            build-time fetching + verification (Node 24 runs the .ts files directly)
  fetch-sources.ts    download + checksum every pinned input into .cache/ (gitignored)
  build-quran-data.ts rebuild tajweed, remap + sanitise timings, write public/data/quran/*.json
  sync-check.ts       audio-vs-timing check (silences in EveryAyah audio vs word boundaries)
  repo-guard.ts       blocks audio/models/QF data/personal data from git
  content-lint.ts     lesson schema + provenance + bank-size + MCQ balance checks
  engine-compare.ts   our independent rule engine vs cpfair, location by location → data/derived/engine-compare.json
                      (the data build flags cpfair-only places ENGINE_DISPUTED)
  teacher-review.ts   writes TEACHER_REVIEW.md (disputes, engine disagreements, model-knowledge lesson items)
public/data/quran/  index.json + s001…s114.json (lazy-loaded per surah, SHA-256 in index.json)
public/data/trans/  translations (build-time only, gitignored)
src/
  data/       quranText (tokenise, normalise, letterCount), rules (tajweed catalogue + flags), sanitise (timings:
              sanitiser, LIS order repair, pause snapping), syncMetrics, crosscheck (pure two-source logic),
              ruleEngine (independent Hafs rules from their definitions, no shared code with cpfair),
              quranData (lazy, checksum-verified, version-stamped loaders), db (IndexedDB), backup
  audio/      context (iOS session), everyayah (buffers, sample-accurate segments), mushafPlayer (<audio> + highlight),
              refine (runtime pause snapping), mic (getUserMedia, worklet capture, MediaRecorder), calibration,
              metronome, worklets/mic.worklet (capture + YIN at 16 kHz), dsp/ (energy, pitch, onsets, stretch, dtw)
  cr/         plan (phrases, modes), engine (call → cue → response → feedback; hands-free), feedback (timing,
              length, melody DTW), kidsSplit (pure split + sanitiser), kids (runtime-only QF loader, ≤7-day cache)
  content/    schema (zod, provenance), lessons/*.json, lesson-index.json (start-up index, built by
              scripts/lesson-index.ts), lessons.ts (index + lazy loadLesson), generate (data-generated MCQs incl.
              contrast sets, seeded RNG, Fisher–Yates, test-only partition), quiz (practice / mastery / review sets),
              gating (which lessons are open), remnote, review.json (teacher approvals)
  srs/        progress (mastery rule, the light helpers the first screen needs), schedule (idempotent test / retest /
              review transitions, FSRS via ts-fsrs — loaded with lessons only), game (XP, levels, badges), 7/21/60-day
              review ladder, streak + weekly freeze, progress %)
  career/     model (on-device store), pack (AES-GCM pack crypto), text (date finder, templates), screens
  ui/         app shell, state (router, settings), pwa, ics, tajweedPaint (Highlight API + overlay fallback),
              components/ (AyahText, Quiz, Placement ladder, SayDrill, YouTubeLesson, AudioSetup, PlayerBar, …),
              screens/
  styles/     tokens (light/dark), Arabic typography, tajweed colours, sheet, tabs
tests/unit, tests/e2e (Playwright: Chromium with fake mic, WebKit for shaping), tests/fixtures (generated WAVs gitignored)
```

## Data flow
1. `fetch-sources` → `.cache/` (checksummed). 2. `build-quran-data` → per-surah JSON (text verbatim; `tj` =
flat [rule, start, end, flags] code-point ranges into the line; `mm`/`mj` = flat [startMs, endMs, flags] per word,
basmala words excluded; `b` = number of basmala words prefixed by Tanzil). 3. The app lazy-loads a surah,
tokenises the verbatim line (`displayWords`), slices tajweed ranges per word, and plays EveryAyah audio with
`requestAnimationFrame` highlighting from the word timings.

## Storage (on device only)
IndexedDB stores: settings, progress/SRS cards, recordings (Blob), calibrations, career (profile, tracker,
drafts), caches with timestamps (Quran Foundation data purged after 7 days). Backup/Restore = one JSON (+ optional
audio) file via the share sheet.

## Private data
`private/` (gitignored) holds the owner's career context, tailored opportunity list, pathways, profile seed and the pack
passphrase. `scripts/build-career-pack.ts` encrypts them into `public/data/career/pack.enc.json` (ciphertext only).

## Deploy
GitHub Actions: `ci.yml` (guard, typecheck, lint, tests, content lint, build) on every push; `deploy.yml` runs after CI
succeeds on main (workflow_run) and builds
(fetching pinned sources, including build-time translations) and publishes to GitHub Pages with base path
`/tilawa-coach/`. `qf-crosscheck.yml` runs only when shipped text/annotation files change. `feeds.yml` (daily) fetches
YouTube RSS → JSON and runs the deploy itself (GITHUB_TOKEN pushes don't trigger workflows).
