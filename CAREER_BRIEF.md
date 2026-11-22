# CAREER DESK — companion brief (public, sanitised)

Session 1 (21 Nov 2026): the owner asked to **combine** the Tilawa Coach master brief (BRIEF.md) with a second
request: *one all-in-one platform that can handle school email, look for opportunities, fill in applications
and draft emails for those opportunities.* This file records that second request in a form that is safe for a
**public** repo. The owner's personal details (university, course, age, job, history) live only in
`private/CAREER_CONTEXT.md` (gitignored) and, on the phone, only in IndexedDB.

BRIEF.md stays the master spec. Its 12 non-negotiables apply to this module too where relevant
(privacy + public repo, honesty, provenance, calm design, iPhone first, always deployable).

## What the Career Desk does (and does not do)

| Request | What the platform does | What it will NOT do (and why) |
|---|---|---|
| Handle my school email | Paste-in triage: paste an email → it pulls out deadlines/dates and actions → adds them to the tracker/calendar. Drafts replies from templates. Explains how to connect a Microsoft 365/Outlook connector to Claude so Claude can read and draft in the real inbox. | The static app cannot log in to a university mailbox: that needs an Azure app registration (an API identity — not created without the owner), a backend, and usually university admin consent. |
| Look for opportunities | A sourced opportunity list (every date links to the page it came from, with an "accessed" date), filters by track, deadline countdowns, .ics calendar export. A refresh routine (Claude scheduled task) can re-check sources weekly once the owner switches it on. | It does not scrape job boards (many forbid it). |
| Fill in applications | An **application pack** per opportunity: checklist, the owner's reusable answers (STAR stories) tailored per firm, word counts, copy-one-field-at-a-time buttons. | It never submits an application or enters personal data into a third-party form by itself. The owner presses submit. |
| Make emails | An **email drafter**: templates (networking, cold email asking for experience, follow-up, thank-you, reference request, careers-service question) → fills names/firm/role → opens the Mail app with the draft (mailto:) or copies it. | It never sends email itself. |

## Rules for this module

1. **Privacy**: profile, answers, drafts, tracker and any pasted emails are stored on the device only (IndexedDB),
   included in Backup/Restore, never committed. Personal seed data is imported from a private file.
2. **Provenance**: every date or pay figure shows its source link and accessed date; anything unverified says so.
3. **Honesty**: pay figures and deadlines change; the UI shows "last checked" and "estimate from last year's cycle"
   where relevant. Not financial or careers advice from a licensed adviser.
4. **Answer style** (the owner's preference, applies to all generated guidance): simple version first, then the
   proper version; short plain sentences; arrows for processes; a one-line memory version; outside knowledge
   labelled [extra]; current figures checked with a search; end with exactly what to do next.
5. **Calm design**, same shell as Tilawa Coach; one main action per screen.

## Milestones (slot in after M3, before M4 completes; never above M1–M5 core)

- C1 — Opportunity list (sourced JSON) + tracker (status board) + deadlines + .ics export.
- C2 — Profile + answer bank + application packs + email drafter (mailto/copy).
- C3 — Paste-an-email triage (date/action extraction) + weekly refresh routine (owner opt-in) + connector guide.
