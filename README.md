# Tilawa Coach

A personal, offline-first recitation coach (Quran reading → tajweed → beautiful recitation → latmiya → shoor) with
Sheikh Muhammad Siddiq al-Minshawi as the reference voice — plus a private **Career Desk** in the same app.
Non-commercial; no ads, no tracking. Specs: [BRIEF.md](BRIEF.md) (master brief) and [CAREER_BRIEF.md](CAREER_BRIEF.md).

## 1. Live
**Live since 22 Nov 2026:** `https://<your-username>.github.io/tilawa-coach/` — every push to `main` runs CI, and the
deploy publishes it only if CI passes. The steps below are kept for reference (they are how it went live).

1. Create an **empty public** GitHub repository named `tilawa-coach` (no README/licence).
2. From this folder, push `main`. Its history is one clean commit with no personal data; the older history stays on a
   local branch, `private-history`, which a local hook refuses to push (D-013):
   ```
   git remote add origin https://github.com/<your-username>/tilawa-coach.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Wait for the **CI** workflow to pass; **Deploy to GitHub Pages** runs after it. Your link:
   `https://<your-username>.github.io/tilawa-coach/`
5. On your iPhone open the link in **Safari → Share → Add to Home Screen** (Safari can clear data for sites that are not on
   the Home Screen). Allow the microphone when the app asks.
6. Scheduled workflows (daily YouTube feeds) run only on the default branch. GitHub pauses them after 60 days without
   activity in a public repo: **Actions → Channel feeds → Enable workflow** to restart.
7. Two Nuraniah lesson videos are missing from the playlist feed (lessons **16** and **17**): paste their YouTube links
   into FEEDBACK.md.
8. Cloud sessions only: if a host is blocked, add it under environment → Network access → Custom (tick the package-manager
   list): `tanzil.net everyayah.com api.quran.com download.quranicaudio.com audio.qurancdn.com verses.quran.com
   www.youtube.com huggingface.co *.hf.co cdn.playwright.dev`.

**Career Desk:** your opportunity list is published only encrypted. Unlock it once on the phone with the passphrase given
to you in the chat (also saved on your Mac in `private/career/PASSPHRASE.txt`, never committed).

## 2. Your 10-minute iPhone check
1. **Install:** Safari → Share → Add to Home Screen; open it from the icon.
2. **Mic test:** More → Audio lab → Allow microphone → Measure noise → Record 3 s → Play back.
3. **Latency:** Audio lab → 4 · Latency calibration → Phone speaker → Start (run it 2–3 times; note the spread).
4. **Al-Fatiha:** Mushaf → Al-Fatiha → Play. Does the highlight follow Minshawi? Tap a word: do you hear just that word?
5. **Call and response:** Practice → Echo → Al-Fatiha → Start (try Hands-free too).
6. **Madd check:** *not built yet* (M5) — skip.
7. **Offline:** turn on Airplane mode, reopen the app: the Mushaf text and lessons should load. Audio needs offline packs
   (*not built yet*, M9) — playback will say you are offline.
8. **Backup/restore:** Settings → Back up now → save to Files; then Restore… from that file.
9. **Diagnostics:** More → Diagnostics → Check hosts → **Copy report**.
10. Paste the report (and anything odd) into **FEEDBACK.md**.

## 3. Your first session (5 minutes)
Today → pick **10 min** → **Start setup** (Stage 0, lesson 1: microphone) → do the 7 steps (big idea → … → your task) →
Stage 0, lesson 5 → Practise → **placement ladder** (it opens the lessons you already know) → the lesson it suggests:
read, listen to the Nuraniah teacher video, record yourself, take the practice quiz → Mushaf → Al-Fatiha → Play and follow the highlight → Career → unlock your pack → **Track** one deadline.

## 4. Status (session 1)
**Works:** Mushaf reader (verbatim Tanzil text, tajweed colours with legend and colour-blind mode, tap-a-word, continuous
playback with word highlighting, translations hidden until tapped); audio core (recorder, latency calibration, noise/level
checks, live pitch, metronome + tap tempo, slowed playback keeping pitch, A–B loop, transposition into your key);
call-and-response (Echo, Build-up, Tempo ladder, Ghost, hands-free, children's track); learning engine (lesson player,
strict quizzes, ≥20-question mastery tests, 3-day retest, spaced review, streak with weekly freeze, Today planner,
progress %, RemNote export, teacher-review export); Career Desk (encrypted opportunity list, tracker, application packs,
email drafter, pay pathways, paste-an-email deadline finder); Diagnostics; backup/restore; calendar reminder.
**Also works:** Stage 0–1 lessons (36, waiting for a teacher's check), placement ladder with the Persian/Urdu
fast-track, 3-day retests and spaced reviews (about 7, 21 and 60 days), Stage 0–1 lessons offline.
**Game layer (motivation only; the mastery rules are unchanged):** XP for steps, right answers and passed tests, a
daily XP goal ring, levels, 15 badges, a winding lesson path, green / red answer panels with Continue, combos, short
celebrations and optional game sounds (Settings → Game sounds). Nothing is taken away for a mistake.
**Partial:** makhraj "diagrams" are text tables and there is no "my teacher's recording" slot yet; reading-speed results
are not stored; in many hand-written questions the right option is still the longest; runtime timing refinement only for
short ayat.
**Not done:** Tier 1 checks + Stage 2 (M5), Tier 2 word checking (M6), Stages 3–5 (M7–M8), offline audio packs (M9).
**Checker accuracy:** none claimed — no checker exists yet. Synthetic: DSP tests only; real speech: not run (dataset
gated); my clips: not built. Details: [TESTING.md](TESTING.md).

## 5. Waiting for a teacher
[TEACHER_REVIEW.md](TEACHER_REVIEW.md) lists every model-knowledge item and every disputed rule location (counts at the
top of that file), with checkboxes. In the app: Settings → **Export for my teacher**. Children's-track split: 565/571
ayat pass the automatic checks (98.9%); your 5-minute listening spot-check is at `#/spot-check`.

## 5b. Privacy check
The repo contains no recordings, clips, reports or personal details: the repo guard (CI + pre-commit) blocks audio,
models, datasets, Quran Foundation data, e-mail addresses, home paths and a private term list; career data is public only
as ciphertext; reviewer notes and screenshots stay local.

## 6. Continue
> Continue building Tilawa Coach. Read BRIEF.md, PROGRESS.md, NEXT_SESSION.md and FEEDBACK.md, then follow the session protocol in BRIEF.md and keep working autonomously.

---
Developers: `npm ci`, `npm run dev`, `npm run ci`, `npx playwright test`. Data: `node scripts/fetch-sources.ts` then
`node scripts/build-quran-data.ts`. Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Decisions: [DECISIONS.md](DECISIONS.md).
