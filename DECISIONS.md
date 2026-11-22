# DECISIONS

Each entry: what was decided, why, and what would change it. Newest at the bottom.

## D-001 — "Combine these two": one PWA, two spaces (2026-11-21)
The owner pasted the Tilawa Coach master brief plus a second request (an all-in-one platform for school email,
opportunities, applications and email drafts) and said "combine these two and get to work".
**Decision:** one installable PWA. The Tilawa Coach brief (BRIEF.md) stays the master spec and keeps the name.
A **Career Desk** space is added (CAREER_BRIEF.md). The Today screen shows both. Career milestones C1–C3 slot in
after M3 and never above the M1–M5 core. Personal career details stay in `private/` (gitignored) and on-device.
**Change if:** the owner wants a different umbrella name or a separate app.

## D-002 — Where this session runs (2026-11-21)
This session runs locally in the Claude desktop app on the owner's Mac, not in a Claude Code cloud environment.
Found: no GitHub CLI, no Node, no existing Tilawa project on disk (Spotlight search for BRIEF.md / "tilawa").
**Decision:** first run (no BRIEF.md existed). Node v24.22.3 LTS downloaded from nodejs.org (SHA-256 verified
against SHASUMS256.txt) into the session's temporary folder — nothing installed system-wide. Local git repo.
**Not done (held for the owner):** creating a GitHub repository, pushing, opening a PR, enabling Pages. Those
publish to the owner's account and need the owner (and `gh` or a token, which this machine doesn't have).
README.md → "Go live" has the exact steps. All network hosts in B5 were reachable (see D-010).

## D-003 — Git identity (2026-11-21)
No global git identity was set. **Decision:** repo-local identity `Tilawa Coach build <build@tilawa-coach.invalid>`
so no personal e-mail address enters a public history. The owner can set their own before pushing.

## D-004 — Tanzil download options (2026-11-21)
Options used: Quran type **Uthmani**, format **Text (with aya numbers)** (`outType=txt-2`), **pause marks ON**
(`marks=true`), **sajdah signs ON** (`sajdah=true`); rub-el-hizb, special lam-alef and **sequential tanween are OFF**.
**Trap found:** Tanzil treats any value, even `=false`, as ON. A first download with `rub=false&laa=false&stanween=false`
silently turned all three on (4,807 small-low-meem instead of 99; 199 ۞). Those parameters are now omitted.
Text: Tanzil Quran Text (Uthmani, Version 1.1, Feb 2021), 6,236 ayat, SHA-256 `18c719bb…46fb1`, kept verbatim
in `data/source/tanzil/quran-uthmani.txt` with its copyright block.

## D-005 — Rebuilding the cpfair tajweed annotations (2026-11-21)
- The classifier globs `output/rule_trees/*.json` but the repo keeps the trees in `rule_trees/`; the build copies
  them (the code is not modified). Classifier code has no licence file, so it is run at build time only and never
  copied into this repo; the data it produces is CC BY 4.0 per its README.
- Rule ids are taken from what the classifier emits: `idghaam_mutajanisayn`, `idghaam_mutaqaribayn` (the README and
  BRIEF spell them `…mutajaanisain`, `…mutaqaaribain`; same rules).
- **Pause marks break cross-word rules.** Running the trees on the shipped text (with pause marks as separate
  tokens) loses 406 idgham-with-ghunnah, 257 ikhfa, 173 munfasil (and others) — every one next to a pause mark,
  because the trees were built on text without marks. **Decision:** run the trees on Tanzil v1.1 *without* marks
  (verified to be an exact subsequence of the shipped text), map offsets onto the shipped text, and flag:
  - `WASL_ONLY` (925): applies when you continue past the pause mark (not when you stop);
  - ~~`WAQF_ONLY` (2)~~ **removed after review**: the idea was backwards — e.g. the shadda/ghunnah on نَّحْنُ (20:132)
    exists only when joining (it is the idgham of the tanween before it). Marked-text-only rules are not shipped;
  - `FROM_2017` (34): in cpfair's 2017 release but missed by the rebuild because Tanzil re-encoded small yeh
    (U+06E6 → U+06E7) — kept, mapped through a substitution-aware alignment;
  - `REBUILD_ONLY` (1).
  The 2017 release, re-mapped, is otherwise reproduced exactly (counts identical per rule).
- Plausibility check (each range must contain expected letters, one letter of context allowed): 0 failures after
  adding the small high noon (U+06E8) used for the hidden noon in 21:88 (the README mentions that case).
- The Quran.com `uthmani_tajweed` cross-check ran (separate workflow; transient). Disagreements get `DISPUTED`
  and go to TEACHER_REVIEW.md. Its independence is NOT established — see D-012.

## D-006 — quran-align word indices (2026-11-21)
Measured from the data, not assumed:
- Indices count the words of the **2016/17 Tanzil text without pause marks, with the basmala excluded** (ayah 1 of
  surahs 2–114 except 9 starts at index 0 = first word after the basmala). Word counts match in 6,230/6,236 ayat for
  murattal.
- Tanzil v1.1 split `بَعْدَمَا` into `بَعْدَ مَا` in 2:181, 8:6, 13:37 → handled by a word-level alignment map.
- The recogniser sometimes counted the muqatta'at `الٓر` / `الٓمٓر` as several words (10:1, 14:1, 15:1 murattal;
  13:1 mujawwad) despite the README saying they appear as one word. These get explicit per-ayah maps
  (`data/source/quran-align-overrides.json`) decided from audio evidence (scripts/sync-check.ts); until then the
  build assumes the extra indices belong to word 0 and flags the ayah.
- Segment sanitiser: splits multi-word segments by letter count, repairs zero/negative durations, removes overlaps,
  re-estimates out-of-order words, interpolates missing words; every repair is logged in
  `data/derived/timing-repairs.<reciter>.json`. Murattal: 99.9% of words directly timed; mujawwad 97.6%
  (Minshawi repeats phrases in mujawwad; repeats are kept as a separate timeline).

## D-007 — Translations not committed (2026-11-21)
Tanzil translations are "for non-commercial purposes only". This app is non-commercial, so showing them is fine,
but committing them to a public repo is redistribution with unclear permission. **Decision (conservative):** fetch
at build time (pinned SHA-256), write to `public/data/trans/` (gitignored), ship only in the built site. Qarai and
Shakir are included (two, so no link-back requirement is triggered; Credits links to tanzil.net/trans anyway).

## D-008 — Stack versions (2026-11-21)
Vite 8.3.8, Preact **10.29.8** (Preact 11 exists; 10 chosen for maturity), @preact/signals 2.11, TypeScript **6.0.3**
(TypeScript 7 exists but typescript-eslint 8.73 supports `<6.1`), Vitest 5.1, vite-plugin-pwa 2.0 (Workbox 7.4),
idb 8, ts-fsrs 6, zod 4, Playwright 1.65. Build scripts are TypeScript run directly by Node 24 (type stripping).

## D-009 — QuranMB.v2 is gated (2026-11-21)
`huggingface.co/api/datasets/IqraEval/Iqra_QuranMB_v2` returns **401** without a login. Using it needs an account
and accepting its terms — not done (brief: no new accounts). Real-speech validation (B10 set 2) is deferred until
the owner decides; TESTING.md says so.

## D-010 — Host reachability and CORS, measured 2026-11-21 (curl with an Origin header)
| Host | Reachable | CORS | Range |
|---|---|---|---|
| everyayah.com (all Minshawi folders) | yes | `*` | bytes |
| api.quran.com | yes | `*` | – |
| download.quranicaudio.com (kids_repeat) | yes | `*` | bytes |
| audio.qurancdn.com (word audio) | yes | `*` | bytes |
| tanzil.net | yes | none | – |
| raw.githubusercontent.com / api.github.com | yes | `*` | bytes |
| huggingface.co model page | yes | none (page) | – |
| youtube.com RSS feeds | yes | none | – |
| youtube-nocookie.com embed | yes | – | – |
| registry.npmjs.org, nodejs.org, cdn.playwright.dev, storage.googleapis.com | yes | – | – |
Consequences: EveryAyah sends CORS + Range → offline packs and Web Audio analysis of Minshawi audio are possible;
the kids-repeat track can be fetched and analysed in the browser (runtime-only, ≤7-day cache). Tanzil and YouTube
feeds have no CORS → fetched at build time / in an Action, never from the browser. No host needs allow-listing.

## D-011 — Branching (2026-11-21)
This repo was created in this session (no existing branch to protect), so the desktop app's "propose a branch"
question was not used. Work is committed on `main` locally; when the owner creates the GitHub repo, `main` is pushed
and later sessions work on branches + PRs as the brief describes.

## D-012 — Is Quran.com's tajweed a second *independent* source? Not established (2026-11-22)
The independent reviewer noticed exact agreement on rare classes (idgham mutajanisayn 58/58, mutaqaribayn 13/13,
iqlab 562/562) and 0 disagreements on several large classes — a sign of a shared origin. Quran.com documents no source
for its tajweed markup (searched; nothing found). The other open annotation set found (Mushaf-Learning/quran-tajweed,
README opened 2026-11-22) states "Primary annotations: cpfair/quran-tajweed". **Decision:** call Quran.com "a second
source (independence not proven)" everywhere; keep marking disagreements; non-negotiable 3 is therefore only partly met.
**Next:** an independent rule engine of our own (rules implemented from definitions over the Tanzil text) as the second
source, with disagreements to the teacher (NEXT_SESSION).

## D-013 — Career data is personal: encrypted pack (2026-11-22)
Review blocker B2: the tailored opportunity list, notes and templates revealed year, subject, graduation year and
interests in a public repo. **Decision:** the tailored data lives only in `private/career/` (gitignored) and ships as
`public/data/career/pack.enc.json` — AES-256-GCM, key from a passphrase via PBKDF2-SHA256 (310,000 iterations). The
owner unlocks it once on the phone; the decrypted pack stays in IndexedDB. Email templates are neutral and filled from
the on-device profile. Earlier local commits still contain the old files → **squash the local history before the
first push** (nothing has been pushed; no force-push to a shared branch is involved).
**Done 22 Nov 2026:** the old branch was renamed `private-history` (local only, kept intact) and `main` was restarted as
one clean commit. `.git/hooks/pre-push` refuses any push that contains the old root commits, and the repo guard fails if
HEAD ever contains them again. Nothing had been pushed, so no shared history was rewritten. The owner can delete the
old branch (`git branch -D private-history`) once it is no longer needed.

## D-014 — EveryAyah terms (2026-11-22)
everyayah.com's home page and /data/ index (opened 2026-11-22) state no licence or terms for the audio. Conservative
use: stream at runtime; offline packs only on the owner's device (CORS allows it); never redistributed or committed;
credit EveryAyah and the reciter. EveryAyah's own timing files are not used.

## D-015 — Mastery gating (2026-11-22)
The mastery rule needs a retest 3+ days later; gating the next lesson on full mastery would stall learning for 3 days
per lesson. **Decision:** the next lesson unlocks when the mastery test is passed (≥95% on ≥20 unseen questions);
full mastery (with the retest) is what counts for stage/overall % and spaced review. Setup lessons (Stage 0, all
drills are setup) count as passed when their checks are done.

## D-016 — Test-only hooks (2026-11-22)
macOS headless Chrome hangs on getUserMedia even with fake-device flags, so e2e tests use URL flags that change nothing
for normal use: `?fakemic=1` (synthetic silent mic), `?loopback=<ms>` (clicks fed back through a known delay),
`?crbot=1` (an "echo bot" answers each call), `?tjfallback=1` (force the colouring fallback), `?quizbot=1` (marks the
right quiz option, so the learner path — placement, practice, mastery, retest, review — can be tested end to end; it
works only on a local test server, never on the published site). Real-mic paths are
covered on Linux CI (fake devices work there) and by the owner's iPhone check.

## D-017 — Sync claims, stated honestly (2026-11-22)
"98.7% within 100 ms after snapping" is measured on the same pauses used for snapping, so it only shows that no word
stays lit through a measured pause. Raw quran-align vs measured pauses: 85.4% (158 pauses, Al-Fatiha + Juz Amma).
The app's own highlighting adds no lag beyond its timing data (e2e). Within continuous speech, accuracy is
quran-align's own (its README: mean < 73 ms vs ElMohafez). TESTING.md carries the numbers.

## D-018 — The independent second source: our own rule engine (2026-11-22)
`src/data/ruleEngine.ts` applies the Hafs rules from their definitions to the Tanzil text, using only the script's own
signs (sukun, shadda, maddah, small letters, the silent-letter zeros, the iqlab meem). It shares no code or data with
cpfair. Reading assumed: joined (wasl) inside the ayah, a stop at the ayah end.
Compared location by location (`scripts/engine-compare.ts`, ranges within ±1 letter): all 18 rule families agree on
97.6–100% of 60,169 locations; **163 disagreements** remain (52 only in cpfair, 111 only in the engine).
- Display conventions copied from cpfair (not disputes): the 2-count madd is coloured only on small letters and not on a
  word-final ىٰ; the article lam in the Name of Allah is not coloured.
- Engine fixes found by checking the disagreements one group at a time: tanween before hamzat al-wasl takes no noon rule
  (the noon gets a kasra); letter names with maddah (68:1, 42:2) are not noon sakinah or qalqalah; a small letter with a
  vowel, sukun or hamza is a consonant; a silent letter before a madd letter is skipped; the upright zero is pronounced
  at the ayah end; a small noon (21:88) is a noon; a maddah on the last letter of the ayah is not madd 6.
- Left for the teacher (TEACHER_REVIEW.md, section D2): هَٰٓؤُلَآءِ and يَٰٓـَٔادَمُ (cpfair: muttasil; engine: munfasil,
  counting the particle as its own word); 5:29, 28:76, 30:10 (cpfair: munfasil; engine: muttasil, hamza in the same
  word); the alif of أَنَا۠ (engine: silent when joining; cpfair: not marked); the ص read as س in 2:245 and 7:69
  (cpfair: "silent"); 17:7.
- In the app, the 52 cpfair-only locations carry ENGINE_DISPUTED ("our independent rule check disagrees here — ask a
  teacher"). Engine-only findings are listed for the teacher but not drawn.
- `tests/unit/ruleEngine.test.ts` fails if any rule family drops below 97% or if engine-compare.json is stale.
With this, non-negotiable 3 is met — as a judgement: NN3 asks for two annotation *sources*, and here the second one is
our own code. Read the 97.6–100% with two caveats (review m-11): it was measured after correcting the engine on these
same 6,236 ayat, and most rule families are read off the same orthographic signs both methods see, so agreement shows
the two methods are consistent, not that either is right. The engine's rule definitions are model-knowledge; the
teacher has the last word.

## D-019 — Learning-engine rules after the second independent review (2026-11-22)
The M4 review found that "≥ 20 unseen questions" could not be met (most letter lessons could never be mastered),
that spaced review and Stage 0 could never be completed, and that the placement ladder was missing. Decisions:
- **"Unseen" for tests:** a quarter of generated items (by a hash of the item id) are test-only and never shown in
  practice; a test may also use practice items this learner was never shown; an item used in a test does not come back
  in a test for 14 days. Letter lessons draw from Juz 29–30 so rare letters (ظ appears 18 times in Juz 30) have enough
  items. The linter simulates a learner (10 practice quizzes, a failed test, a passed test, a retest, a spare).
- **Answers are recorded as they are given**, so a test that is stopped half-way, or left, cannot be restarted with the
  same questions. Step tabs are locked while a quiz runs.
- **Spaced review:** 10 questions from the whole lesson, least recently used first; ≥ 90% → the next date on the
  7 / 21 / 60-day ladder (or FSRS's date if later); otherwise it comes back the next day.
- **Setup lessons** (Stage 0, lessons 1–3, and the placement lesson) are complete when their device checks pass (mic,
  noise, a clean recording, latency, range; or the ladder), their practice quiz is all right, and all steps are done.
  Completing lesson 1 also marks the app as set up.
- **Placement ladder:** letters → letters with harakat → joined words → a short ayah (self-rated against Sheikh
  al-Minshawi until M5). 4 of 5 right climbs; two fails at one level stop. Stopping at level 1/2/3/4 starts learning at
  Stage 1 lessons 1/18/22/29; passing all four places all of Stage 1. Placed lessons are open but not mastered
  (progress % counts mastery only). With the Persian/Urdu fast-track on, lessons 12–16 (the merged sounds) stay on the
  path.
- **Start-up cost:** lessons load lazily; only a generated index ships at start (checked in CI).
- Quiz audio always uses the murattal timings (the Mushaf voice may be mujawwad). Listening questions are practice-only:
  a recording that cannot play must not void a mastery test (re-review n-6).
