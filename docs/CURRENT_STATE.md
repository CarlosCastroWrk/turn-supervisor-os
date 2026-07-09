# Current State

## Status

PDS / Turn Field Copilot is in Phase 1 Stabilize.

The app exists as a private, local-first React + TypeScript + Vite PWA for Los to use during a two-week student housing Turn operation. It is a personal field copilot/notebook, not official Property Doctor Services software, not company software, not a CRM, and not a multi-user portal.

Latest shipped release train:

```text
A2 Draft Apply Safety through E2 Report Preview/Print, E1 Daily Activity Snapshot, and P0 sync/report safety slices
```

Production:

```text
https://turn-supervisor-os.vercel.app
```

## Current Goal

Make Real Turn Mode safe to trust on Mac, iPhone, and iPad before Los enters real field data.

The core product loop is:

1. Capture
2. Confirm
3. Update Board
4. Follow Up
5. Report
6. Learn

Every near-term change should serve that loop.

## What Exists

- React + TypeScript + Vite runtime
- Mobile-first PWA shell with bottom navigation
- Local persistence via browser `localStorage` under `turn-supervisor-os:v0.1`
- Vercel production deployment at `https://turn-supervisor-os.vercel.app`
- Private GitHub repo at `CarlosCastroWrk/turn-supervisor-os`
- Dashboard, setup, units, unit detail, issues, crews, assignments, daily log, reports, training questions, and export views
- Clickable dashboard stat cards that navigate to filtered unit lists
- Needs Attention and Smart Suggestion dashboard cards that navigate to the relevant unit, issue, assignment, or daily log view
- Units page scan upgrades with needs-attention sorting, counted status filter chips, larger tappable unit cards, compact quick status actions, and visible blocker/crew/last-activity context
- Issue flow simplification with default owner/date capture, no priority/date fields in the field form, Active issue filtering, and two-step soft remove from the normal board
- Responsive app frame with a page-attached desktop/sidebar layout, persisted collapsed sidebar state, compact tablet Capture behavior, and mobile bottom-nav spacing
- Lightweight URL hash routing for top-level views, unit detail links, issue-focused links, dashboard deep links, reload, and browser back behavior
- Copilot with Quick Capture, Draft Actions, Ask the OS, Briefings, Memory Inbox, and deterministic smart suggestions
- Local mock/rule-based agent provider with Zod validation and no API key requirement
- PWA manifest and service worker
- Supabase cloud project `jgplalexkmjzldczouih`
- Supabase schema, RLS, private `photos`/`audio` buckets, email/password login enabled, and global public signup disabled
- Supabase sync client behind `VITE_ENABLE_SYNC`, including sign-in UI, first-run upload/pull, manual sync controls, and Realtime subscriptions for synced tables
- Sync change fingerprinting that normalizes timestamp formats and JSON object key order to avoid false local-change loops after pulling Supabase rows
- Sync diagnostics that quiet background Realtime checks and expose last trigger, table, event, row counts, queued state, and last error in the sync panel
- Sync pull hardening that reads Supabase rows in ordered pages, keeps `Pull cloud` pull-only, shows `Upload needed` when a pull leaves unsent local changes, and checks cloud before local upload flows push changed rows
- Demo sync boundary that skips demo-scoped project rows on upload while preserving local Demo Mode practice data on fresh cloud pulls
- Storage/photo safety that preserves corrupt local cache payloads and compresses photos before saving them locally
- Draft apply safety that scopes draft unit lookup to the active project and validates draft payload enums before mutation
- Draft batch safety that scopes bulk approval/rejection to visible drafts, flags stale pending drafts, and opens applied unit targets
- Parser eval coverage for punctuation-free field notes and deterministic draft targets
- Unit-boundary parser behavior that splits punctuation-free captures by unit, parses simple crew movement, and requires confirmation for conflicting same-unit drafts
- Parser Ready safety that prevents parser-generated Ready drafts from bypassing or inventing trade/inspection completion and treats negated completion notes as raw notes instead of Ready updates
- Number input safety that fixes setup/count-field leading-zero editing behavior
- Report date safety that makes selected-date reports explicit and labels missing Daily Log reports as draft/missing-data
- Editable in-app report document with a restrained field-report layout, custom title/summary/section text, selected-date activity snapshot, current-state progress labeling, generated-section thaw behavior, per-section reset, AppData/JSON-backup persistence, print styling for Save as PDF/share as PDF, and preserved copy/download text fallbacks
- Supabase `report_drafts` sync support for edited report titles, summaries, and section text after the approved report-drafts migration
- Daily Log auto-draft that fills empty log sections from selected-date activity, blockers, issues, assignments, and current board signals while requiring Los to review and save
- Issue status safety that stops issue creation from changing unit status unless Los explicitly marks it blocking
- Project archive safety that hides duplicate/test Real Turn projects without deleting their units, issues, notes, or cloud rows
- Demo Mode vs Real Turn Mode, with Start Real Turn creating a separate active project after backup
- Project-scoped crew contacts so demo crews do not pollute real Turn mode
- Global bottom-right Capture button with organized/collapsible sidebar on larger screens
- Voice-mode Capture UI with a mobile/iPad sheet, browser speech-recognition support where available, installed iPhone/iPad PWA keyboard-dictation fallback, no-transcript timeout fallback, short-pause restart handling, and no auto-opening keyboard on sheet open
- Focused Capture field workflow that hides Ask/Memory modes from the visible Capture page, collapses older draft history, keeps raw JSON draft editing advanced-only, and shows where an approved draft was applied
- Draft Action status tabs for Pending, Applied, Rejected, Failed, and All inside the collapsed draft-history review
- Export/backup tools for JSON, CSV, reports, Copilot/Memory Markdown, and Follow-Ups CSV

## What Real Turn Mode Currently Does

- Shows whether the active project is Demo Mode or Real Turn Mode
- Lets Los export a JSON backup before creating a real project
- Creates a separate real project with property, location, dates, supervisor, project manager, buildings, floors, units, beds, common areas, and notes
- Switches the active board to the new real project
- Keeps demo data available separately for practice
- Filters active project views so Real Turn records and Demo records are separated in normal use
- Scopes crew contacts to the active project

## What Does Not Exist Yet

- Full offline/reconnect sync QA across Los's Mac, iPhone, and iPad
- True conflict review for simultaneous same-row edits across devices
- Delete propagation / tombstones for synced rows
- Photo binary sync through Supabase Storage
- Restore-from-JSON import flow in the app
- Multi-user mode
- Automated browser regression suite
- Server-side AI provider route
- Durable recorded-audio transcription pipeline
- Company product features

## Active Assumptions

- This remains Los's personal field copilot until real field validation and explicit leadership approval.
- Seed data is sample-only and should not appear in Real Turn reports, Copilot answers, or testing conclusions.
- Real field records should live in Real Turn Mode.
- `localStorage` is still the hot/offline cache even when Supabase sync is enabled.
- A fresh device with no local cache should pull cloud records before uploading its seed data.
- Compressed photo payloads remain local-only until the Supabase Storage/IndexedDB photo slice.
- Copilot output must remain draft-first; important mutations require explicit approval.
- Memory candidates must be approved before use.
- Static Vite browser code must not contain provider secrets. Any real OpenAI/Anthropic path requires a server-side API layer.

## Current Testing Priority

Real-device Phase 1 QA:

1. Mac signs in and confirms synced.
2. iPhone signs in and confirms synced.
3. iPad signs in and confirms synced.
4. Real Turn project created/updated on one device appears on the others.
5. Unit, issue, daily log, follow-up, and setup updates sync without duplicates or stale overwrites.
6. Offline updates survive airplane mode and sync after reconnect.
7. Demo data stays separate from Real Turn data.
8. Export/backup works before any destructive reset.

Current immediate field check:

1. Open production on iPhone.
2. Turn on airplane mode.
3. Update 2-3 obvious QA units/issues.
4. Confirm the changes remain visible locally.
5. Turn airplane mode off.
6. Confirm Mac and iPad receive the updates after reconnect.

## GitHub Workflow

Normal non-emergency work now uses pull requests. See [docs/06_release/GITHUB_PR_WORKFLOW.md](06_release/GITHUB_PR_WORKFLOW.md).

Direct commits to `main` are reserved for urgent field hotfixes with explicit approval.

## Next Action

Run the B3 real-device offline/reconnect check before entering real field data:

1. Open production on iPhone.
2. Turn on airplane mode.
3. Update 2-3 obvious QA units/issues.
4. Confirm the changes remain visible locally.
5. Turn airplane mode off.
6. Confirm Mac and iPad receive the updates after reconnect.

While that physical-device check is pending, the next code slice should come from the highest remaining field risk: either real-device offline/reconnect trust, photo durability, or memory consumption depending on what Los sees in training.
