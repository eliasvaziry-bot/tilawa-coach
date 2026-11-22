# NEXT SESSION (written 22 Nov 2026)

Start: read BRIEF.md, CAREER_BRIEF.md, PROGRESS.md, this file and FEEDBACK.md. If running on the Mac again: Node and
the Playwright browsers lived in a temporary session folder — re-download (nodejs.org v24 LTS; `npx playwright install
chromium webkit`). `private/` (career data, pack passphrase) exists only on the Mac.

## Top 10 (priority order)
1. **Owner:** the app is live (`https://<your-username>.github.io/tilawa-coach/`). Do the 10-minute iPhone check
   (README → 2) and put what you find in FEEDBACK.md; those items come first next session. Pushing from this Mac uses a
   7-day GitHub token kept in the macOS Keychain: after it expires, make a new one (repo + workflow) when git asks.
   Headless Chrome on this Mac lost audio rendering on 22 Nov (AudioContext clock stalled), so the two audio e2e tests
   only ran on GitHub that day; check they pass locally again.
2. **Teacher review** (owner + a qualified teacher): TEACHER_REVIEW.md section 0 (check first), D (Quran.com
   disputes), D2 (163 rule-engine disagreements) and E (model-knowledge lesson items); approvals go into
   `src/content/review.json`. Then draw approved engine-only findings (e.g. the alif of أَنَا۠, silent when joining).
3. **M5 Tier 1 — madd check first:** one count = half the median of the learner's own natural madds; measure how long a
   madd is held (steady voiced stretch) → "you held 3 counts, it needs 6"; Minshawi's measured holds for comparison;
   synthetic validation (DSP-shortened/lengthened madds) reported separately in TESTING.md. Then ghunnah (experimental),
   qalqalah, waqf/breath, tempo; "Build my test set"; Stage 2 lessons; rule finder; reports.
4. Rebalance option lengths in the hand-written questions (content lint warns: the right option is often the longest).
5. Makhraj diagrams and a "my teacher's recording" slot on letter cards (review m-4); store reading-speed results over
   time (m-15).
6. Measure pauses for ALL ayat in an Action (polite, cached) so long ayat never light a word through a pause.
7. Offline audio packs (EveryAyah CORS + Range; Workbox range requests), with size estimates and a storage manager.
8. Career C3: weekly opportunity refresh routine (owner opt-in) and a Microsoft 365 connector guide.
9. M6 spike: FastConformer-Quran in the browser (WebGPU/WASM single-thread), memory/latency on a phone profile.
10. Lighthouse a11y/performance on a mobile profile; time-to-interactive; CSP check against the real network log.

## Known bugs / gaps
- Long ayat outside the measured set use raw timings (words can stay lit through a pause).
- Mujawwad 13:1 word map is an unverified assumption; mujawwad timings are coarser (Minshawi repeats phrases).
- Nuraniah lessons 16 and 17 are missing from the playlist feed — owner to paste links. Lesson ↔ video mapping is by
  order only; segments must be marked by the owner.
- QuranMB.v2 (real-speech validation) is gated on Hugging Face (D-009).
- Nuraniah lesson ↔ video mapping is by order; the reviewer suspects s1-19…s1-23 point at the wrong videos (owner/teacher to check).
