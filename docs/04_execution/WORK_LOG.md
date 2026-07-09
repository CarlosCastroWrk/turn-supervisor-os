# Work Log

## 2026-07-04

- Created project operating-system scaffold.
- Left runtime stack undecided pending master prompt.
- Implemented Turn Supervisor OS v0.1 as a React + TypeScript + Vite app.
- Added localStorage persistence, seed data, PWA manifest, service worker, exports, dashboard, setup, units, unit detail, issues, crews, assignments, daily log, reports, training questions, and export views.
- Added draft-first Copilot with local deterministic parser, Draft Actions Inbox, Memory Inbox, Ask the OS, Briefings/Reports, smart suggestions, Zod validation, and no browser API key path.
- Reviewed Fable 5 audit report; verified existing fixes, tightened Unit Detail Ready confirmation to include inspection, made secondary navigation reachable on mobile, and added explicit Copilot/Memory Markdown plus Follow-Ups CSV exports.

## 2026-07-05

- Accepted the product direction shift from a small operations system toward a personal Turn Field Copilot.
- Added Phase 1 stabilization: Demo Mode vs Real Turn Mode, Start Real Turn setup, backup-before-reset copy, dashboard mode labeling, and project-scoped crew contacts.
- Added and applied a Supabase migration for project mode and crew project scope before deploying the stabilization slice.

## 2026-07-06

- Aligned operating docs around the Turn Field Copilot framing and Phase 1 Stabilize gate.
- Added roadmap, testing checklist, risk register, decision log, and Fable 5 review prompt for real-device QA and external review.

## 2026-07-07

- Shipped global bottom-right Capture, organized/collapsible sidebar, and Draft Action status clarity.
- Shipped sync change fingerprinting fix so equivalent Supabase timestamp and JSON shapes do not trigger repeated false uploads.
- Upgraded local Vercel CLI to `54.21.1` after Los explicitly approved.
- Adopted pull requests for normal non-emergency slices; direct `main` commits are reserved for urgent approved hotfixes.
- Started sync status diagnostics after Los reported continued green/blue sync cycling on real devices.
- Added quiet background Realtime checks so idle devices should stay visually `Synced` while still pulling cloud changes.
- Added visible Sync details for trigger, table, event, row counts, queued state, and last error.
- Reviewed the Fable 5 full product/UX/code audit and started the P0 storage/photo safety slice.
- Converted the Fable 5 audit into a dedicated execution roadmap, updated the build queue, and defined the slice-by-slice release loop.
- Updated repo policy after Los granted standing release authorization for scoped, non-destructive code/docs slices after checks pass.
- Preserved corrupt local cache payloads before seed fallback.
- Added client-side photo compression before saving captured photos into local app state.
- Started A2 Draft Apply Safety after shipping storage/photo safety.
- Added active-project scoping for draft unit-number lookup and assignment unit matching.
- Added enum validation for draft unit status and issue payloads, plus regression tests for duplicate unit numbers and invalid payloads.
- Current gate remains real-device Mac/iPhone/iPad sync confirmation before entering real field data.

## 2026-07-08

- Shipped A2 Draft Apply Safety in `6697278`.
- Started A3 Number Input Safety on `codex/number-input-safety`.
- Added shared integer input behavior for setup/count fields so zero-valued fields can be typed into without creating leading-zero drafts.
- Added regression tests for `020`, `08`, blank drafts, and pasted numeric text.
- Shipped A3 Number Input Safety in `6c34eb8`.
- Started A4 Report Date Safety on `codex/report-date-safety`.
- Made daily reports use the selected report date explicitly and label missing-log reports as draft/missing-data.
- Added regression tests so past empty report dates cannot fall back to today's report.
- Shipped A4 Report Date Safety in `72ddd4a`.
- Started A5 Issue Status Safety on `codex/issue-status-safety`.
- Added explicit `Blocks this unit` controls so issue creation is issue-only unless Los chooses to change the linked unit status.
- Added regression tests for non-blocking issue creation, explicit blocking, and issue resolution not changing unit status.
- Shipped A5 Issue Status Safety in `9f5169e`.
- Marked B1 Project Archive as blocked until Los explicitly approves Supabase migration/sync-schema work.
- Started B1 Project Archive on `codex/project-archive` after Los approved the Supabase migration/sync-schema portion.
- Added project soft archive/restore behavior for Real Turn projects without deleting local or cloud records.
- Added Supabase `projects.archived_at` schema support and sync timestamp fingerprinting for archive state.
- Added regression tests for archive active-project fallback, restore behavior, reload normalization, and timestamp fingerprint stability.
- Started B2 Demo Sync Boundary on `codex/demo-sync-boundary`.
- Added a sync boundary helper that skips demo-scoped projects, units, buildings, floors, crews, assignments, issues, photo notes, daily logs, activity logs, and linked draft/follow-up/memory rows during upload.
- Preserved local Demo Mode practice records when a fresh device pulls real cloud records.
- Added regression tests for demo upload filtering and fresh-device demo preservation.
- Started C1 Dictation Parser Eval Suite on `codex/dictation-parser-evals` while B3 Offline/Reconnect Trust remains a physical-device gate.
- Added parser regression tests for Los's punctuation-free field notes: `104 done 105 in progress 312 sink leak`, `204 paint done but cleaning blocked keys missing`, and `Jose moved from 203 to 205`.
- Added unit phrase segmentation, generic done/in-progress unit drafts, sink/leak issue scoping, and named crew movement assignment parsing.
- Completed C2 Unit-Boundary Parser by flagging competing same-unit status drafts, blocking apply until explicit confirmation, and adding a visible `Confirm & Approve` path in Capture.
- Completed C3 Draft Batch Safety with capture batch ids, visible-only bulk approve/reject, stale pending draft flags, and `Open Unit` links on applied unit drafts.
- Completed D1 Clickable Dashboard Stats by making unit status cards navigate to filtered Units views, removing Common Areas from the primary stat row, and removing unreliable bed count from the Units stat.
- Completed D2 Needs Attention Feed by replacing passive dashboard issue cards with clickable attention items and making smart suggestions navigate to related units, issues, assignments, or daily log.
- Completed D3 Units Scan Upgrade by sorting unit cards by needs-attention rank, adding counted status chips, making the main card body tappable, surfacing blocker/crew/last-activity context, and keeping the 100-at-a-time render guard.
- Completed D4 Issue Flow Simplification by removing priority/date from the field issue form, defaulting owner/date capture, adding Active issue filtering, and making accidental issue removal a confirmed soft close instead of a delete.
- Completed D5 Sidebar And Responsive Frame by attaching the desktop sidebar to the page frame, persisting collapsed sidebar state, compacting Capture on iPad landscape, and verifying desktop/iPad/phone rendered layouts without horizontal overflow.
- Completed D6 Hash Routing and deep links by adding local hash routes for top-level views, unit details, filtered unit lists, focused issues, reload persistence, and browser back behavior.
- Completed C4 Voice Reliability by adding clearer Capture speech availability states, iPhone/iPad keyboard dictation fallback, browser pause restart handling, and targeted voice capture tests.
- Added a C4 follow-up voice-mode sheet so iPhone/iPad voice capture opens as a focused recording/dictation surface instead of zooming directly into the messy-note textarea.
- Completed E2 Report Preview And Print/PDF by adding an in-app report preview, print styling for Save as PDF/share as PDF, preserved copy/download text fallbacks, and mobile layout cleanup around the global Capture button.
- Polished the E2 report preview into a cleaner field handoff with a stronger header, summary readout, numbered/subtitled sections, styled progress cards, and print/mobile rendered checks.
- Toned the report preview back down after Los said the first polish pass had too much visual styling; removed the badge, color strip, colored metric accents, and numbered section cards while keeping the useful summary and subtitles.
- Simplified the report into an editable document draft so Los can change the title, summary, and section text before copying, downloading, or printing/saving as PDF.
- Completed E1 Daily Activity Snapshot by adding selected-date operational activity bullets to Reports, labeling progress metrics as current board state, preserving old edited report drafts when new generated sections appear, and making Download Text use the edited report.
- Completed P0 Parser And Stale Unit Safety by removing parser-granted Ready confirmation and inferred trade completion, treating negated completion captures as raw notes, preventing parser-created Ready drafts from bypassing work-complete checks, and stopping stale unit detail routes from opening the first unit.
- Completed P0 Sync Trust / Pull Pagination by reading Supabase tables in ordered pages, making `Pull cloud` pull-only, showing `Upload needed` when local changes remain after pull, checking cloud before local upload flows push changed rows, adding sync-pull regression tests, and documenting that true same-row conflict review remains open.
- Completed P0 Report Thaw / Backup by moving editable report drafts into AppData, adding generated-vs-edited section dirty tracking, adding per-section reset, preserving legacy report drafts, and covering report thaw plus backup inclusion with tests.
- Started P0 Report Draft Supabase Sync after Los explicitly approved the report-drafts migration.
- Added the `report_drafts` Supabase table with owner-scoped RLS, authenticated grants, client-timestamp preserving trigger behavior, and Realtime publication.
- Wired report drafts into the Supabase sync table map and demo sync boundary so real report edits sync across devices while demo report drafts stay local.
- Opened draft PR #30 for P0 Report Draft Supabase Sync after local verification, but did not merge or deploy because `supabase db push` and linked schema lint are blocked by missing/stale Supabase Postgres password auth.
- Applied the approved `report_drafts` Supabase migration after Los provided the database password through local Keychain; post-push dry-run, migration list, and schema lint all passed.
- Completed E3 Daily Log Auto-Draft by adding a review-first Daily Log action that drafts empty sections from selected-date activity, blockers, issues, assignments, and current board signals without saving until Los confirms.
