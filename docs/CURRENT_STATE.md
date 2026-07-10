# Current State

## Status

PDS / Turn Field Copilot is in Phase 1 Stabilize.

The app exists as a private, local-first React + TypeScript + Vite PWA for Los to use during a two-week student housing Turn operation. It is a personal field copilot/notebook, not official Property Doctor Services software, not company software, not a CRM, and not a multi-user portal.

Latest shipped release train:

```text
E4 Project-Scoped Memory through G8 Production Recovery Gate, C6 Capture Workspace V2, and the dormant H1 Protected Model Route
```

Production:

```text
https://turn-supervisor-os.vercel.app
H1 dormant route verified at dpl_HTAnc2reXfF9TWVeyg3XiKjsZCz4
```

Current unshipped slice:

```text
H2 Cost-Aware Model Orchestration and AI Usage Meter
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
- Local-first persistence with operational records in browser `localStorage` under `turn-supervisor-os:v0.1` and compressed photo files in IndexedDB
- Coalesced AppData persistence that writes the latest rapid-edit state at most once per 500 ms window, flushes immediately when the app backgrounds/closes, and cancels pending writes before device reset
- Bounded raw Activity history that prioritizes the active Turn, retains up to 10,000 entries in local hot state, and limits Supabase Activity pulls to the same newest-row window without deleting cloud rows; Daily Logs and report drafts remain separate
- Session-backed commit-on-blur text fields for Project setup, Unit notes, Issue resolution, Crew observations, Assignment notes, training answers, and Memory edits; interrupted drafts restore only while the underlying record value is unchanged
- Session-backed commit-on-blur numeric fields for existing Project estimates and Unit bed/bath counts; multi-digit edits remain local until blur or Enter and commit as one operational change
- Preview-first Real Turn CSV Unit import with flexible Unit/Building/Floor/Beds/Bathrooms/Common Area/Notes headers, explicit skipped-row details, a 2 MB file limit, a 5,000-row limit, and a downloadable header-only template
- Additive CSV apply safety that never overwrites an existing Unit, ignores imported status columns, starts every imported Unit as Not Started, validates again at commit time, and durably writes the full import before showing success
- Preview-first bulk Unit updates from the filtered Units board: select shown or all current matches, choose one explicit paint/clean/repair/inspection transition, review update/skip counts, and confirm up to 500 Units
- Bulk update safety that stays inside the active Turn, excludes bulk Ready and free-form resets, skips protected/unchanged/missing Units, rejects a changed project, refuses post-preview stale Unit timestamps, persists before UI success, and names skipped Units in feedback
- Vercel production deployment at `https://turn-supervisor-os.vercel.app`
- Version-controlled production security headers with same-origin scripts, explicit Supabase HTTPS/WebSocket access, photo and PWA blob allowances, camera/microphone self-permission, clickjacking protection, MIME-sniffing protection, and a restrictive referrer policy
- Repeatable unsigned production recovery gate that downloads the daily report plus every current-Turn export, verifies project boundaries, captures/compresses/reloads a local photo, includes it in the private full-device backup, rejects invalid/corrupt backups without mutation, exercises cancel, applies a valid restore, and verifies reload persistence
- Local-field-date export filenames so late-night Central work does not receive the next UTC day's backup/CSV/Markdown filename
- Private GitHub repo at `CarlosCastroWrk/turn-supervisor-os`
- Dashboard, setup, units, unit detail, issues, crews, assignments, daily log, reports, training questions, and export views
- Clickable dashboard stat cards that navigate to filtered unit lists
- Needs Attention and Smart Suggestion dashboard cards that navigate to the relevant unit, issue, assignment, or daily log view
- Units page scan upgrades with needs-attention sorting, counted status filter chips, larger tappable unit cards, compact quick status actions, and visible blocker/crew/last-activity context
- Issue flow simplification with default owner/date capture, no priority/date fields in the field form, Active issue filtering, and two-step soft remove from the normal board
- Responsive app frame with a page-attached desktop/sidebar layout, persisted collapsed sidebar state, compact tablet Capture behavior, and mobile bottom-nav spacing
- Field-accessibility hardening with 44px touch targets, high-contrast focus rings, a keyboard skip link, active-page navigation semantics, announced progress values, motion-safe scrolling, stronger secondary text contrast, and a focus-contained Voice Capture dialog
- Nonblocking field feedback with accessible success/error toasts, explicit Issue-board outcomes, guarded Undo for high-frequency Unit quick-status taps, no-op suppression, and blocker-preserving trade transitions
- Lightweight URL hash routing for top-level views, unit detail links, issue-focused links, dashboard deep links, reload, and browser back behavior
- Copilot with Quick Capture, Draft Actions, Ask the OS, Briefings, Memory Inbox, and deterministic smart suggestions
- Project-scoped Memory behavior that scopes captured candidates and approved memories to the active project, keeps explicit personal/safety rules global, requires approval, rejects duplicate facts, and drops archived/missing-source records from active use
- Setup-based Supervisor Memory review with editable candidates, approve/reject controls, active/inactive controls, source/scope visibility, last-used timestamps, and an explicit path for assigning legacy unscoped records
- Typed Memory consumption for current-project Crew facts, Daily Log lessons, Ask OS supporting records, and briefing/report preferences without bypassing Draft Action or Daily Log confirmation
- Local mock/rule-based agent provider with Zod validation and no API key requirement
- Optional protected model-assisted Capture provider behind `VITE_ENABLE_AI`, with a server-only OpenAI key, Los-only Supabase authentication, structured outputs, pending Draft Actions, and deterministic fallback
- Bounded same-origin `/api/agent/capture` Vercel Function with request limits, rate limiting, redacted errors, no-store responses, and no direct operational mutation
- Cost-aware one-call Capture routing that uses `gpt-5.4-nano` for focused extraction and `gpt-5.4-mini` for complex, attachment-heavy, ambiguous, or higher-consequence notes; `gpt-5.5` remains an explicit override and is never selected automatically
- Local-first AI usage receipts with model, token counts, routing reason, and estimated per-call cost, plus a Setup budget panel for estimated used, remaining, average call cost, and recent calls
- PWA manifest and service worker with 192/512 PNG install icons, a dedicated maskable icon, an iOS touch icon, unrestricted orientation, atomic app-shell install/update behavior, a four-second navigation timeout, cached offline deep-link startup, and a static-only cache allowlist that excludes future app-data endpoints
- Supabase cloud project `jgplalexkmjzldczouih`
- Supabase schema, RLS, private `photos`/`audio` buckets, email/password login enabled, and global public signup disabled
- Supabase sync client behind `VITE_ENABLE_SYNC`, including sign-in UI, first-run upload/pull, manual sync controls, and Realtime subscriptions for synced tables
- Sync change fingerprinting that normalizes timestamp formats and JSON object key order to avoid false local-change loops after pulling Supabase rows
- Deterministic equal-timestamp sync resolution that prevents same-row copies from re-uploading over each other indefinitely and preserves resolved Draft Action lifecycle states over stale pending copies
- Sync diagnostics that quiet background Realtime checks and expose last trigger, table, event, row counts, queued state, and last error in the sync panel
- Sync pull hardening that reads Supabase rows in ordered pages, keeps `Pull cloud` pull-only, shows `Upload needed` when a pull leaves unsent local changes, and checks cloud before local upload flows push changed rows
- Retryable 500-row Supabase upload batches that checkpoint each successful batch so a later retry sends only unfinished changed rows
- Demo sync boundary that skips demo-scoped project rows on upload while preserving local Demo Mode practice data on fresh cloud pulls
- Storage/photo safety that preserves corrupt local cache payloads, compresses photos, stores normal photo files outside the main app record in IndexedDB, and migrates legacy embedded photos only after durable writes succeed
- Private Supabase Storage photo sync for Real Turn records: row metadata uploads first, available local files upload into Los's authenticated folder, successful `storage_path` values sync back to `photo_notes`, and other devices lazy-download/cache thumbnails
- Photo sync diagnostics for uploaded files, retryable pending files, files unavailable on the current device, and the latest photo error
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
- Daily Log identity safety that gives every new project/date one deterministic ID, collapses local tuple duplicates, and updates an existing legacy cloud row instead of inserting a conflicting second row
- Issue status safety that stops issue creation from changing unit status unless Los explicitly marks it blocking
- Project archive safety that hides duplicate/test Real Turn projects without deleting their units, issues, notes, or cloud rows
- Demo Mode vs Real Turn Mode, with Start Real Turn creating a separate active project after backup
- Project-scoped crew contacts so demo crews do not pollute real Turn mode
- Global bottom-right Capture button with organized/collapsible sidebar on larger screens
- Global Field Copilot workspace that opens in place, accepts typed notes, photos, camera input, and bounded readable files, then keeps every proposed mutation in a compact review-first timeline
- Persistent Capture composer with camera, attachment, voice/dictation, clear, and review controls across desktop, iPad landscape, and iPhone
- Explicit photo staging that compresses locally, suggests a Unit only when one active-project target is unambiguous, and still requires confirmation before save
- Capture focus safety that keeps the workspace outside the inert app background, traps focus, closes nested voice mode first, restores focus on dismissal, and closes cleanly when opening an applied target
- Voice-mode Capture UI with a mobile/iPad sheet, browser speech-recognition support where available, installed iPhone/iPad PWA keyboard-dictation fallback, no-transcript timeout fallback, short-pause restart handling, and no auto-opening keyboard on sheet open
- Focused Capture field workflow that hides Ask/Memory modes from the visible Capture page, collapses older draft history, keeps raw JSON draft editing advanced-only, and shows where an approved draft was applied
- Draft Action status tabs for Pending, Applied, Rejected, Failed, and All inside the collapsed draft-history review
- Active-Turn Draft Action provenance that hides other-Turn history, refuses ambiguous/cross-project approvals, and prevents same-number Demo/Real Unit collisions
- Export/backup tools for photo-complete JSON, CSV, reports, Copilot/Memory Markdown, and Follow-Ups CSV
- Spreadsheet-safe CSV exports that neutralize cells beginning with formula-trigger characters before download
- Current-Turn human-readable exports for Units, Issues, Daily Logs, Copilot/Memory, and Follow-Ups; the separately labeled full-device JSON backup intentionally keeps every project
- Full-device JSON restore validation that rejects malformed collections, unsafe records, duplicate IDs, invalid photo payloads, empty projects, and pathological record counts before replacing local state
- Restore guard that waits for Supabase auth state and requires sign-out before local replacement so active sync cannot immediately merge over the restored copy
- A repeatable field-scale gate that creates 300 units through Setup, renders 100 units at a time across desktop/iPad/iPhone layouts, and validates Capture, Reports, export, backup restore, 1,000 units, 100 blockers, 500 ready units, 10,000 activity events, a durable 5,000-unit CSV import, and previewed/durable 300-Unit bulk updates
- A disposable three-device sync regression that preserves disjoint 12-hour offline edits, tests every reconnect order for same-row updates, rejects duplicate rows, and verifies equal-timestamp conflicts settle without repeated uploads

## What Real Turn Mode Currently Does

- Shows whether the active project is Demo Mode or Real Turn Mode
- Lets Los export a JSON backup before creating a real project
- Creates a separate real project with property, location, dates, supervisor, project manager, buildings, floors, units, beds, common areas, and notes
- Switches the active board to the new real project
- Keeps demo data available separately for practice
- Filters active project views so Real Turn records and Demo records are separated in normal use
- Scopes crew contacts to the active project
- Lets Los preview and add Units from a CSV in Setup without changing existing Units or trusting imported status values

## Physical Acceptance Reported By Los

On July 10, 2026, Los reported hands-on passes across the production PWA for:

- Mac, iPhone, and iPad sync settling and cross-device visibility
- offline edits surviving reconnect
- cross-device photo sync
- camera and microphone permission behavior
- basic iOS VoiceOver use
- bright-light readability

These are user-reported physical checks, not automated claims. Capture Workspace V2 still needs one focused production pass after deployment because its modal composer is new.

## What Does Not Exist Yet

- True conflict review for simultaneous same-row edits across devices
- Delete propagation / tombstones for synced rows
- Cloud object deletion/cleanup when a photo record is removed
- Physical iPhone/iPad Home Screen verification of the new icon, rotation, and fully closed offline restart
- Physical iPhone/iPad verification of CSV file selection, preview, confirm, reload persistence, and Capture-button spacing
- General undo for issues, drafts, setup, imports, or destructive actions; G2 Undo is intentionally limited to timestamp-guarded Unit quick-status changes
- Bulk Ready, arbitrary mass status resets, and automatic bulk Undo; those operations remain intentionally outside the guarded batch workflow
- Multi-user mode
- A broad browser regression suite beyond the targeted field-scale, photo, PWA, accessibility, and release smoke harnesses
- Production-enabled model-assisted Capture; billing is funded and local synthetic model checks pass, but the production route remains dormant until the metering schema is applied and Los separately approves the required Vercel environment changes
- Official OpenAI credit-balance reconciliation inside the app; the in-app meter tracks estimated TurnOS call cost from returned token usage and a Los-entered budget, not the provider's authoritative billing balance
- Durable recorded-audio transcription pipeline
- Image understanding for staged Capture photos or files
- Company product features

## Active Assumptions

- This remains Los's personal field copilot until real field validation and explicit leadership approval.
- Seed data is sample-only and should not appear in Real Turn reports, Copilot answers, or testing conclusions.
- Real field records should live in Real Turn Mode.
- `localStorage` is still the hot/offline cache for operational records even when Supabase sync is enabled; normal photo bytes live in IndexedDB.
- Raw Activity detail is a bounded performance cache: the active Turn is prioritized within the latest 10,000 retained entries. Saved Daily Logs, report drafts, operational records, and cloud rows are not deleted by this policy.
- A fresh device with no local cache should pull cloud records before uploading its seed data.
- Compressed photos save locally first. When Los is signed in and online, available Real Turn photo files upload to private Supabase Storage; other devices fetch them only when a thumbnail is needed.
- Demo Mode photos remain local and are excluded from cloud upload.
- Offline startup can use the cached app shell and local records; Supabase and uncached cloud photos still require connectivity.
- Copilot output must remain draft-first; important mutations require explicit approval.
- Memory candidates must be approved before use.
- Approved project memories apply only to the active non-archived Turn. Only explicit personal supervisor preferences and built-in safety rules may remain global across Turns.
- Legacy unscoped operational memories and candidates remain inactive/local until Los assigns them to the current Turn; Demo-scoped Memory stays local.
- JSON restore is a signed-out local recovery workflow. Los should review/export recovered data before signing in again because a later sync can still merge newer cloud rows.
- Static Vite browser code must not contain provider secrets. Any real OpenAI/Anthropic path requires a server-side API layer.
- The AI budget is a visibility tool, not a hard provider spending limit. OpenAI project limits and the provider Billing page remain authoritative.

## Current Testing Priority

The shared sync, reconnect, photo, permission, VoiceOver, and outdoor-readability baseline is reported passing. The immediate priority is the new Capture Workspace production acceptance:

1. Open Capture from Dashboard, Units, and Issues on Mac, iPhone, and iPad.
2. Confirm it opens immediately without route change or keyboard zoom.
3. Type one multi-unit note and confirm each proposed action is separate.
4. Take or attach one work-safe photo, confirm the suggested Unit, and save it.
5. Approve one action and reject one action; confirm the board reflects only the approved action.
6. Tap `Open Unit` or another applied target and confirm Capture closes on the correct record.
7. Open voice mode; confirm browser speech works where available and iPhone/iPad keyboard dictation remains clear where it does not.
8. Close voice mode and Capture; confirm focus, scrolling, sync, and the underlying page remain usable.
9. Repeat once offline, then reconnect and confirm the approved records and saved photo sync normally.
10. Separately finish the still-open physical CSV, bulk update, and Home Screen restart checks.

## GitHub Workflow

Normal non-emergency work now uses pull requests. See [docs/06_release/GITHUB_PR_WORKFLOW.md](06_release/GITHUB_PR_WORKFLOW.md).

Direct commits to `main` are reserved for urgent field hotfixes with explicit approval.

## Next Action

Finish H2 verification, then obtain fresh approval to apply `20260710133819_add_ai_usage_metering.sql`. After the schema is current, merge and deploy the metering slice with `VITE_ENABLE_AI` still off. Production model activation is a separate approval for the server-only key, Los allowlist, and feature flag, followed by one synthetic production Capture before any real field note is sent.
