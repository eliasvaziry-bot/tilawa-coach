# TESTING

Measured numbers only. Each line says what was measured, on what, and its caveat. Updated 2026-11-22.

## Checker validation sets (B10) — reported separately, never mixed
| Set | Status | Numbers |
|---|---|---|
| 1. Synthetic (DSP-modified audio / generated signals) | DSP building blocks only; the Tier 1 checker is M5 | see "DSP unit tests" below — these are NOT checker accuracy |
| 2. Real speech (QuranMB.v2) | **not run**: the dataset is gated on Hugging Face (HTTP 401 without a login, D-009) | none |
| 3. My own clips | **not built** (M5 "Build my test set") | none |

No accuracy claim about the tajweed checker exists anywhere yet.

## Word timings vs Minshawi's audio (M1 DoD)
| Measure | Result | Caveat |
|---|---|---|
| Raw quran-align (sanitised) vs pauses measured in the audio, Al-Fatiha + Juz Amma + specials (586 ayat, 158 inner pauses ≥ 220 ms, or ≥ 100 ms beside a pause/sakt mark) | **85.4%** of pauses have a word boundary within 100 ms; median 50 ms, p90 360 ms; 46 words lit across a pause | — |
| Same, after snapping boundaries onto those pauses (what ships for those 586 ayat) | 98.7%; 1 word lit across a pause | **circular**: scored on the same pauses used for snapping. It shows that words no longer stay lit through measured pauses, nothing more. |
| Independent sample: `scripts/sync-check.ts` (own 150 ms detector, 74 ayat = the above specials + 40 random ayat) | **83.8%** (31/37 silences), p90 210 ms, 10 words lit across a silence | The random ayat outside the measured set use raw timings (long ayat are not refined at runtime). Some "silences" are stop closures inside words (e.g. 103:3, 113:4), which no word boundary should match. |
| Within continuous speech | not measurable here | quran-align's README reports a mean < 73 ms against ElMohafez. |
| App highlighting lag (e2e, Chromium): every highlight change happened while the audio position was inside that word's timing | max 0 ms over 10 changes | measures the app against its own timing data, not against the audio. |

## Tajweed annotations
| Measure | Result |
|---|---|
| Rebuilt cpfair annotations, plausibility (letters in each range) | 0 implausible of 60,059 (+ 784 basmala copies) |
| Agreement with Quran.com's tajweed markup (see `data/derived/tajweed-disputes.json`) | ≈ 99% of compared annotations agree; disputes listed in TEACHER_REVIEW.md |
| Independence of that second source | **not established** (D-012) |
| Our own rule engine (`src/data/ruleEngine.ts`, shares no code or data with cpfair) vs cpfair, location by location (`scripts/engine-compare.ts`) | 18 rule families, **97.6–100%** agreement over 60,169 locations; 163 disagreements, all in TEACHER_REVIEW.md section D2 (D-018). Caveat: measured after correcting the engine on these same ayat, and both methods read the same script signs — consistency, not proof of correctness |
| Text: Tanzil vs Quran.com `text_uthmani` after the documented normalisation (`data/derived/text-crosscheck.json`) | see the file; every difference is listed by position and code points, none "fixed" |

## Children's track split (B5, acceptance ≥ 98%)
Automatic checks (same words, children ≥ 3 semitones higher, durations plausible) on Al-Fatiha + Juz Amma:
**565 / 571 ayat pass (98.9%)**; 20 verses alternate in chunks; 37 sanitiser repairs. Listening spot-check (#/spot-check): not yet done by the owner.

## Audio core (M2)
| Test | Result |
|---|---|
| DSP unit tests on synthetic signals (18): pitch within 1% for 98–523 Hz; a 0.8 s "madd" measured within 20 ms; clicks within 3 ms; closure-then-burst found; known 123 ms latency recovered within 3 ms; WSOLA ×1.33 keeps pitch; +3 semitone shift within 1.5%; DTW | all pass |
| Latency calibration repeatability (Chromium, clicks looped back through a known 87 ms delay) | 87, 87, 87 ms — spread 0 ms (DoD: ≤ 20 ms) |
| Live pitch from the AudioWorklet (220 Hz test tone) | shows A3 |
| Real phone mic / speaker latency | **not measured** — needs the owner's iPhone |

## Call-and-response (M3)
Hands-free Echo session over all of Al-Fatiha with a test "echo bot": 10/10 steps heard, auto-advanced to the end (≈1.7 min).
This proves the loop works; it says nothing about how well a human will be judged.

## Rendering, PWA, privacy
- Letter joining preserved with the fallback colouring: Al-Fatiha + all 37 Juz Amma surahs × Chromium + WebKit = **76/76**.
- Every code point in the Tanzil text has a glyph in Amiri Quran (cmap test).
- Chrome installability: no errors; icons 192/512/maskable/apple-touch served.
- Repo guard: no audio, models, datasets, QF data or personal terms tracked; career data public only as ciphertext.
- Screens at 390×844 and 430×932, light/dark: no horizontal overflow on the tested pages.

## Learning engine (M4, after the second review)
- Unit: 90 tests (11 files), incl. no vowel question offers a mark that is also on the letter; contrast answers
  balanced and of the right class; practice never shows test-only items; a learner who practised 10 times can still
  take a failed test, a passed test and a retest; idempotent mastery/retest; the 7/21/60-day review ladder.
- Content lint simulates that learner for all 36 lessons (every test finds ≥ 20 unused items) and rejects constant-answer
  generators and "press Check" tasks. It **warns** that in most lessons the right option is often the longest
  (not yet rebalanced).
- E2E (Chromium): placement ladder → practice → mastery → retest 3+ days later → spaced review (fake clock); a running
  test locks the step tabs; a Stage 1 lesson's quiz works offline without listening questions. 92 e2e tests in all.

## Performance (speed pass, 23 Nov 2026)
Measured with `node scripts/perf.ts` (after `npm run build`): median of 3 cold starts with no service worker, at
390×844. Chromium uses Lighthouse's mobile profile applied through DevTools (4× CPU slowdown, "Slow 4G": 562 ms latency,
1.47 Mbps down); WebKit cannot be throttled, so its numbers are unthrottled. Lab metrics are read in the page (paint
timing, largest-contentful-paint, long tasks); Lighthouse itself was not run (it needs a download).

| | Before (223fa9e) | After |
|---|---|---|
| Chromium: first screen (Today's greeting drawn) | 1,886 ms | 1,908 ms |
| Chromium: first / largest contentful paint | 1,956 / 2,168 ms | 1,972 / 2,184 ms |
| Chromium: load event | 2,179 ms | 1,881 ms |
| Chromium: total blocking time; long tasks | 0 ms; 1 (60 ms, before first paint) | 0 ms; 1 (55 ms) |
| Chromium: bytes / requests until settled | 275 KB / 13 | 180 KB / 12 |
| WebKit: first screen | 120 ms | 117 ms |
| WebKit: bytes / requests until settled | 276 KB / 14 | 43 KB / 10 |
| Start-up script | 76.7 KB (26.9 KB gzip) | 52.7 KB (19.4 KB gzip) |
| Lesson tapped through (open, 4 steps, Check, start a quiz), 4× CPU | 0 long tasks | 0 long tasks |
| Lesson path scrolled for 2 s, 4× CPU | 60 fps, 0 long tasks | 60 fps, 0 long tasks |

- What changed: the Quran font (134 KB) is prefetched instead of preloaded; the career pack is checked with a HEAD
  request when locked and its update check waits 5 s when unlocked (it was an 87 KB download at every start); the
  service worker registers 3 s after load, so the 1.3 MB offline cache no longer competes with a first visit; the FSRS
  scheduler moved out of the start-up script (`src/srs/schedule.ts`, lessons only).
- Honest reading: on Slow 4G the first screen is bound by network round trips (about three of 562 ms), so less data
  did not move it; the gains are less data and less contention on every start. Bytes are as served by `vite preview`
  (uncompressed); GitHub Pages sends them gzipped.
- Smoothness: every animation runs on transform/opacity only (the ring and word-highlight transitions were removed),
  and none runs with reduced motion.
- Operable: the screen e2e test now fails if any control on 11 screens (Today, Learn, a lesson, Practice, the surah
  list, three surahs, Credits, Settings…) is under 44 px, or if anything is hidden behind the tab bar — Chromium and
  WebKit, 390 and 430 px, light and dark. Form controls use 16 px text (no iOS zoom); checkbox rows are 44 px; lesson
  step buttons sit in a sticky bar within thumb reach; the page leaves room for the recitation player bar.
- Surah 2 (6,121 words) shows text in ~0.4 s at 4× CPU throttle (measured by the independent reviewer).
- Not yet measured: a full Lighthouse / axe accessibility audit, checker latency and memory.

## How to run
`npm run ci` (guard, typecheck, lint, unit tests, content lint, build) · `npx playwright test` (e2e; Chromium + WebKit) ·
`node scripts/sync-check.ts` · `node scripts/kids-split-check.ts` · `node scripts/qf-crosscheck.ts` (transient QF use).
