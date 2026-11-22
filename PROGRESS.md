# PROGRESS

## Session 1 — 21–22 Nov 2026
**Milestones**
- **M1 — skeleton, data, Mushaf reader:** built and fixed after an independent review (see below). Verbatim Tanzil text
  (with Tanzil's notice in every derived file), rebuilt cpfair tajweed, quran-align Minshawi timings (explicit maps,
  sanitiser, pause snapping on 586 measured ayat), Mushaf with Highlight-API colours, legend, colour-blind mode,
  tap-a-word, highlighting, Credits. Deploy pipeline written (CI-gated); not live (no GitHub repo yet).
- **M2 — audio core:** done (DSP tests; calibration 87/87/87 ms on a known loop; live pitch worklet; metronome; WSOLA
  transposition; slowed playback; A–B loop).
- **M3 — call-and-response:** done (Echo, Build-up, Tempo ladder, Ghost; hands-free Al-Fatiha e2e; children's track
  with 98.9% automatic split pass; spot-check page).
- **Career Desk C1/C2 (+ part of C3):** done; tailored data only as an encrypted pack.
- **M4 — Stages 0–1:** engine done (schema, linter, generated and contrast questions, quizzes, mastery + 3-day retest,
  spaced review on the 7/21/60-day ladder, FSRS, streak, Today planner, progress %, placement ladder + fast-track,
  RemNote and teacher-review exports, Nuraniah player with segment marking). Content: Stage 0 (5 lessons) and Stage 1
  (31 lessons) written by two content writers; all model-knowledge items wait for the teacher.
- **Independent tajweed rule engine** (D-018): 18 rule families, 97.6–100% agreement with cpfair; 163 disagreements
  flagged or listed for the teacher.
- Diagnostics (part of M9) done.

**Second independent review (M4 + M1 re-check, 22 Nov):** not signed off at first: 1 blocker (mastery could never be
reached in most letter lessons), 12 majors (a vowel question marking right answers wrong, constant-answer questions,
mastery-test integrity, spaced review and Stage 0 never completable, YOUR TASK NOW only on the last step, no placement
ladder, offline gaps, no learner-path e2e tests, start-up bundle growing with content, README history claim) and 15
minors. Fixed: all blockers and majors (the history squash is the last step of the session) and m-1, m-2, m-3, m-5,
m-6, m-7, m-8, m-9 (partly), m-11, m-13, m-14. Open: m-4 (makhraj diagrams, teacher-recording slot), m-10 (option
lengths; the linter warns), m-12 (Nuraniah mapping, for the owner/teacher), m-15 (reading-speed history). D-019.
**Live (22 Nov):** published to GitHub Pages (`https://<your-username>.github.io/tilawa-coach/`). The first CI run on
GitHub caught a real bug the Mac could not: the live-pitch worklet told YIN 16 kHz after decimating 44.1 kHz audio to
14.7 kHz, so pitch read ~9% sharp on 44.1 kHz devices; fixed with a tested `decimation()` helper, then CI and the
deploy passed.
**Re-review (same reviewer, 22 Nov): signed off for Stages 0–1**, on condition that the history is squashed before the
first push (done: D-013). Its 7 new minor findings were fixed (n-1 small-sign keys, n-2 shadda questions, n-3 repeated
questions, n-4 test hook only on a local server, n-5 caption order, n-6 listening questions practice-only, n-7 task
wording). Gates after the fixes: typecheck, lint, 92 unit tests, content lint (learner simulation), repo guard, build,
92 e2e tests (Chromium + WebKit).

**Independent review of M1 (reviewer subagent, 22 Nov):** not signed off at first: 2 blockers, 12 majors, 17 minors.
Fixed: B1 (typecheck), B2 (personal career data → encrypted pack; history to be squashed before the first push), M2–M5,
M7, M8, M9 (text cross-check), M11, M12, most minors. Stated honestly instead of fixed: M1 (sync numbers now in
TESTING.md with caveats), M10 (second tajweed source's independence not established → D-012; since resolved by our own rule engine, D-018). Re-review pending.

## Self-check of the 12 non-negotiables (22 Nov, after fixes)
1. Quran text from Tanzil only — **holds** (byte-identical test; typed-text guard over src/ and tests/).
2. Provenance — **holds for data and lessons** (linter enforces; 679 model-knowledge lesson items listed for the teacher).
3. Two independent annotation sources — **holds, as a judgement**: our own rule engine (D-018, no shared code or
   data) agrees with cpfair on 97.6–100% of locations per rule (measured after tuning on the same ayat; both read the
   same script signs); the 163 disagreements are flagged in the app or listed for the teacher. The Quran.com
   cross-check stays as a third view (its independence is unproven, D-012).
4. Honesty — **holds**: no checker accuracy claimed; sync/agreement numbers reported with their caveats.
5. Copyright/terms — **holds**: no audio/QF data committed; translations build-time only; Tanzil notice in derived files.
6. Privacy + public repo — **holds in the working tree**; earlier local commits contain the old career files → the
   history must be squashed before the first push (planned as the last step of this session).
7. Minshawi reference voice — **holds**; Nuraniah videos for isolated letters, labelled.
8. No invented facts about the reciters — **holds** (only measured facts, labelled).
9. Learning rules — **holds**: big idea first, YOUR TASK NOW on every step, progress % after every step, strict
   4-option MCQs, mastery (≥ 95% on ≥ 20 questions new to your tests + a retest 3+ days later; the linter proves every
   lesson can reach it), spaced review. Weak spot: the right option is often the longest (linter warning; to fix).
10. iPhone first — **WebKit-tested only**; the owner's iPhone check on the live site is pending.
11. Always deployable — **holds**: live on GitHub Pages; the deploy runs only after CI passes on `main`.
12. Beauty never beats tajweed — **holds** (melody feedback labelled secondary; tajweed checks come in M5).
