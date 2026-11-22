# PLAN

Milestones from BRIEF.md B14 (priority order) plus the Career Desk milestones from CAREER_BRIEF.md.
Each milestone needs: its DoD met, tests green, the independent reviewer's sign-off, and the 12-point self-check
recorded in PROGRESS.md.

| # | Milestone | Definition of done |
|---|---|---|
| M1 | Skeleton, data, Mushaf reader | Deploy pipeline (workflow ready; live once the owner creates the repo + merges); repo guard in CI; Tanzil text, rebuilt cpfair annotations and quran-align Minshawi timings loaded and verified; tajweed colours + legend (+ colour-blind mode); tap-a-word in Minshawi's voice (EveryAyah); ayah playback with word highlighting; Credits with every attribution. Works at phone size in local preview; Al-Fatiha and Juz Amma join correctly (Chromium + WebKit screenshots); highlighting in sync within ~100 ms (automatic check against silences in the audio); Credits done. |
| M2 | Audio core | Recorder (PCM via AudioWorklet + MediaRecorder), latency calibration (loudspeaker clicks + clap-along), level/noise checks, pitch (YIN in worklet), onsets, metronome, slowed playback (preservesPitch), A–B loop, transposition. DSP unit tests on synthetic signals pass; calibration repeatable within 20 ms on desktop Chrome (fake-mic loopback test). |
| M3 | Call-and-response | Echo, Build-up, Tempo ladder, Ghost on Minshawi audio; cue (pulse + click); feedback (entry timing, duration, pitch-contour DTW); hands-free mode; kids-repeat spike (runtime-only QF, sanitised split, automatic verification, spot-check page). DoD: a full Al-Fatiha session works hands-free (e2e with fake mic). |
| C1 | Career: opportunities | Sourced opportunity list, tracker board, deadline countdowns, .ics export. |
| C2 | Career: packs + drafts | On-device profile, answer bank, application packs, email drafter (mailto/copy). |
| M4 | Stages 0–1 | Nuraniah feed + lesson mapping + "mark lesson segments"; data-generated quizzes; ≥20-question held-out mastery tests; FSRS; Today screen; progress %; mastery gating; RemNote export; Backup/Restore; teacher-review export. |
| M5 | Tier 1 checks + Stage 2 | Madd/ghunnah/qalqalah/waqf/tempo checks with confidence; Stage 2 lessons; rule finder; recitation reports; synthetic + "my clips" validation sets. |
| C3 | Career: inbox helper | Paste-an-email triage, weekly refresh routine (owner opt-in), connector guide. |
| M6 | Tier 2 | FastConformer spike → phone/desktop decision → CTC alignment + GOP; QuranMB.v2 eval (if licence/access allows); exam mode; share with teacher. |
| M7 | Stage 3 + maqam trainer | |
| M8 | Stages 4–5 | Channel feeds, practice player (YouTube rules), tap-mapping, Style Lab, Answer/Lead + crowd, latm detection, majlis simulator. |
| M9 | Diagnostics, offline packs, polish, QA, docs | |
| M10 | Extras | Hifz helper, sabk library/composer, laptop deep check, Indo-Pak view. |

Session 1 target (BRIEF): M1–M3 working and tested in local preview, M4 started. Career C1–C2 MVP alongside.
