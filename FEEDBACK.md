# FEEDBACK

Paste bug reports here (in-app: Diagnostics → **Report a problem** → Copy, then paste below), plus teacher
corrections from the Teacher Review export. Each new session fixes everything here first.

Format: one `##` heading per item, newest at the bottom. Mark fixed items with ✅ and the commit.

<!-- Example:
## 2026-12-01 — highlighting lags on 2:255
```json
{ "screen": "mushaf", "steps": "...", "diagnostics": { ... }, "note": "..." }
```
-->

## 22 Nov 2026 — first use of the live app (owner)
- "It keeps saying too quiet, and I'm literally shouting." → **Fixed (likely cause):** after any playback the app had
  switched iOS to the *playback* audio session, which mutes the microphone, and a recording reused the open mic
  without switching back. Every recording now switches to record mode, resumes audio and reopens a dead mic track;
  digital silence now says "No sound reached the app" (a fault) instead of "too quiet"; loudness is judged on the
  speaking part only; recording is tap-to-start / tap-to-stop with a live level bar. **Owner: please re-test on the
  iPhone** (Learn → a Stage 1 lesson → Practise → ● Record).
- "I can't go back on certain things." → **Fixed:** a "‹ Back" button on every inner screen (the installed app has no
  browser Back), "‹ Previous step" in lessons, and step tabs stay usable during practice quizzes (only tests lock them).
