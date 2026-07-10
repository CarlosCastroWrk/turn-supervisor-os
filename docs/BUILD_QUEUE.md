# Build Queue

Detailed roadmap: [docs/04_execution/FABLE5_EXECUTION_ROADMAP.md](04_execution/FABLE5_EXECUTION_ROADMAP.md)

## Active Slice

- [x] G1 Bounded Activity History implementation.
  - [x] Keep at most 10,000 raw Activity entries in the local hot cache, prioritizing the active Turn.
  - [x] Prioritize the active Turn plus legacy Draft/Follow-Up/training provenance when trimming.
  - [x] Bound Supabase Activity pulls to the same newest 10,000-row window without deleting cloud rows.
  - [x] Keep Daily Logs, report drafts, operational records, photos, drafts, and Memory outside this retention cap.
  - [x] Disclose the retention behavior in Export / Backup.
  - [x] Verify 10,037-entry trimming, active-Turn priority, 10,003-row cloud pulls, 10,000-entry live updates, desktop/iPhone layout, and console health.
- [x] P0 Daily Log Identity And Restore Safety release.
  - [x] Give every new project/date Daily Log one deterministic ID across devices.
  - [x] Collapse duplicate local project/date logs and preserve an existing legacy cloud row ID during pull-before-upload.
  - [x] Verify all six Mac/iPhone/iPad reconnect orders converge to one Daily Log.
  - [x] Wait for Supabase auth state and require sign-out before local JSON restore.
  - [x] Verify save/reload/update at iPhone size, 5,000-log reconciliation, overflow, and console health.
  - [x] Merge, deploy, and run focused production smoke checks.
- [x] P0 Active Project Boundary release.
  - [x] Stamp new Capture drafts, agent runs, conversations, and generic follow-ups with active-Turn provenance.
  - [x] Hide other-Turn draft history and fail cross-project or unverifiable Draft approvals closed.
  - [x] Scope Daily Log, Copilot/Memory, Follow-Up, Unit, and Issue human-readable exports to the selected Turn.
  - [x] Make report builders honor the requested project instead of ambient active-project state.
  - [x] Keep Demo and unverifiable drafts/follow-ups local during Supabase sync.
  - [x] Verify identical Demo/Real unit numbers, conflicting links, backup round-trip, and 10,000-draft performance.
  - [x] Merge after E4, deploy, and run production smoke checks.
- [ ] B3 Offline/Reconnect Trust remains the next real-device gate.
  - [x] Simulate disjoint Mac/iPhone/iPad edits after twelve offline hours and verify convergence without duplicate Units, Issues, or activity rows.
  - [x] Verify newest-row convergence across all six three-device reconnect orders.
  - [x] Stop equal-timestamp conflicts from re-uploading indefinitely and document the whole-row writer rule.
  - [x] Document whole-row last-write-wins and clock-skew risks.
  - [ ] Run Mac/iPhone/iPad airplane-mode edit test.
  - [ ] Capture any stale overwrite findings from the physical-device run.
- [x] E1 Daily Activity Snapshot.
  - [x] Start recording a source-grounded daily summary from activity logs.
  - [x] Distinguish current state from historical day state.
  - [x] Prepare stronger report preview data.
- [x] Current code slice is P0 Report Thaw / Backup + Supabase Report Draft Sync.
  - [x] Keep untouched report sections regenerated as the day changes.
  - [x] Move editable report drafts into AppData so reports export with JSON backups.
  - [x] Add dirty/reset behavior per report section.
  - [x] Add approved `report_drafts` Supabase table migration and sync mapping.
- [x] E3 Daily Log Auto-Draft.
  - [x] Draft Daily Log sections from selected-date activity and field captures.
  - [x] Keep auto-drafted content editable and review-first.
  - [x] Avoid treating generated text as confirmed field truth until Los saves it.
- [x] F1 IndexedDB Photo Store.
  - [x] Move normal compressed photo files out of the main `localStorage` app record.
  - [x] Migrate legacy embedded photos only after each IndexedDB write succeeds.
  - [x] Keep JSON backups photo-complete for files available on the current device.
  - [x] Verify reload, fallback, backup, and a 202-photo browser stress case.
- [x] F2 Supabase Storage Photo Sync implementation.
  - [x] Upload Real Turn photo files to Los's private Storage folder after record rows are safe.
  - [x] Persist `storage_path` only after the private file upload succeeds.
  - [x] Lazy-download and cache cloud thumbnails on another device.
  - [x] Keep upload failures retryable and visible in Sync details.
  - [ ] Verify one work-safe photo across Mac, iPhone, and iPad.
- [x] G3 PWA Install And Offline Startup implementation.
  - [x] Add 192/512 PNG install icons, a maskable icon, and a 180px iOS touch icon.
  - [x] Remove the portrait-only manifest lock so iPad can rotate.
  - [x] Fall back to the cached shell after a four-second navigation timeout.
  - [x] Reject incomplete shell installs and avoid refetching assets for the unchanged build.
  - [x] Verify persistent-browser offline cold start, deep-link reload, cached assets, mobile/tablet overflow, and console health.
  - [ ] Verify Home Screen icon, rotation, and fully closed offline restart on physical iPhone/iPad.
- [x] G4 Accessibility And Field Contrast implementation.
  - [x] Enforce 44px minimum targets across field controls and status actions.
  - [x] Add strong focus visibility, skip navigation, active-page semantics, progressbar values, and route titles.
  - [x] Trap and restore focus in Voice Capture and honor reduced-motion preferences.
  - [x] Verify labels, target sizes, contrast, keyboard flow, mobile overflow, and console health in rendered browser QA.
  - [ ] Verify outdoor legibility and iOS VoiceOver behavior on physical iPhone/iPad.
- [x] G2 Undo And Toast System implementation.
  - [x] Replace routine validation/copy/backup errors with nonblocking accessible feedback.
  - [x] Keep reset, restore, archive/start, unsaved-change, Ready-override, and storage-failure confirmations blocking.
  - [x] Add guarded Undo for Unit quick-status actions on the Units and Unit Detail views.
  - [x] Refuse stale Undo after a later Unit edit and record successful Undo as a newer activity event.
  - [x] Ignore repeated no-op taps and prevent paint/clean/repair quick actions from clearing harder Unit blockers.
  - [x] Explain Issue create/status/remove outcomes without deleting issue history.
- [x] E4 Project-Scoped Memory release.
  - [x] Scope new candidates and approved memories to the active Turn.
  - [x] Consume only approved, current-project, live-source typed Memory.
  - [x] Move Memory review into Setup without adding another field screen.
  - [x] Keep legacy unscoped operational Memory inactive until Los assigns it.
  - [x] Keep Demo/unscoped Memory local and preserve it during cloud pulls.
  - [x] Add duplicate-candidate and double-approval protection.
  - [x] Verify Capture, Setup review, Daily Log lessons, Crew facts, project switching, mobile/iPad layout, and offline restart.
  - [x] Apply `20260709195302_add_memory_project_scope.sql` after fresh explicit approval.
  - [x] Merge, deploy, and run focused production sync smoke checks.

## P0: Must Clear Before Real Field Reliance

- [ ] Run offline/reconnect QA from `docs/TESTING.md`.
- [ ] Run export/backup QA from `docs/TESTING.md`.
- [x] Guard Real Turn reports, Copilot answers, Capture history, sync uploads, and human-readable exports against Demo/other-Turn contamination. Production release remains in the active boundary slice.
- [x] Reject corrupted or structurally unsafe JSON backups before replacing local device state.
- [x] Stop parser-created Ready drafts from bypassing Ready safety, inventing trade completion, and block negated completion notes from becoming Ready updates.
- [x] Stop stale unit detail routes from editing the wrong fallback unit.
- [x] Paginate Supabase pull reads, make `Pull cloud` pull-only, and make upload flows pull before push to reduce stale cloud clobber risk.
- [x] Stop editable reports from freezing untouched generated sections and include report drafts in AppData JSON backups.
- [x] Sync editable report drafts through Supabase after Los approved the report-drafts migration.
- [x] Coalesce full AppData browser writes so rapid large-state edits persist the latest state at bounded intervals and flush on background/close.
- [x] Move keystroke-bound existing-record text fields to session-backed commit-on-blur behavior so typing creates one operational activity entry instead of one per character.
- [x] Move existing-record Project estimate and Unit bed/bath number fields to session-backed commit-on-blur behavior without breaking multi-field Setup creation.
- [x] Prevent same-day Daily Logs created offline on multiple devices from violating the Supabase project/date uniqueness boundary.
- [x] Block local JSON restore until sync auth is resolved and signed out.
- [x] C1 Dictation Parser Eval Suite.
- [x] C2 Unit-Boundary Parser for punctuation-free field notes.
- [x] C3 Draft Batch Safety: visible/current batch approval only.

## P1: Should Fix During Training

- [x] D1 Clickable Dashboard Stats.
- [x] D2 Needs Attention Feed with deep links.
- [x] D3 Units Scan Upgrade.
- [x] D4 Issue Flow Simplification.
- [x] D5 Sidebar And Responsive Frame.
- [x] D6 Hash Routing and deep links.
- [x] C4 Voice Reliability.
- [x] C5 Capture Field-Speed Cleanup.
- [x] E2 Report Preview And Print/PDF.
- [ ] Run field test on iPhone Safari or installed PWA.
- [ ] Run field test on iPad Safari or installed PWA.
- [x] Verify or repeat the previously reported 200-300 unit Start Real Turn stress test.
  - [x] Create 300 units through the rendered Setup flow and preserve Demo data separately.
  - [x] Verify 100-at-a-time Unit rendering, search, Capture access, and no horizontal overflow at desktop, iPad, and iPhone sizes.
  - [x] Verify a 1,000-unit / 10,000-event state under 4x CPU throttling, including Reports and local backup validation.

## P2: Can Wait Until After Turn Starts If P0/P1 Are Stable

- [x] E1 Daily Activity Snapshot.
- [x] E3 Daily Log Auto-Draft.
- [x] E4 Memory Consumption and project scoping. Migration, release, and production smoke checks are complete.
- [x] F1 IndexedDB Photo Store.
- [x] F2 Supabase Storage Photo Sync. Real-device photo acceptance remains in the active gate.
- [x] G1 Bounded Activity History. Local state and Supabase pulls retain the latest 10,000 raw entries; cloud rows are not deleted.
- [x] G2 Undo And Toast System. Guarded Undo is intentionally limited to Unit quick-status changes.
- [x] G3 PWA Install And Offline Startup. Physical iPhone/iPad acceptance remains in the active gate.
- [x] G4 Accessibility And Field Contrast. Physical outdoor/VoiceOver acceptance remains open.
- [ ] Add CSV unit import.
- [ ] Add bulk unit update workflow.

## P3: Future

- [ ] Server-side AI route with no browser API keys.
- [ ] Structured model outputs with supporting record IDs.
- [ ] Model-assisted summaries with local deterministic fallback.
- [ ] Conflict review UI.
- [ ] True delete tombstones.
- [ ] Field-level merge/server timestamps.
- [ ] Possible company product only after field validation and leadership approval.

## Blocked

- Real Property Doctor Services workflow details remain partially blocked until training clarifies what Los actually supervises day to day.
- Supabase one-time cleanup for duplicate/demo cloud records requires explicit approval before any data-changing command.

## Done

- [x] Create project operating-system scaffold.
- [x] Intake master prompt.
- [x] Select React + TypeScript + Vite.
- [x] Implement local-first v0.1 app.
- [x] Add localStorage persistence, seed data, PWA manifest, service worker, exports, dashboard, setup, units, unit detail, issues, crews, assignments, daily log, reports, training questions, and export views.
- [x] Add Copilot Quick Capture with draft actions.
- [x] Add Memory Inbox and approved memory.
- [x] Add Ask the OS local-data answers.
- [x] Add Briefings/Reports and smart suggestions.
- [x] Add Demo Mode vs Real Turn Mode and Start Real Turn setup flow.
- [x] Apply Supabase migration for project mode and crew project scope.
- [x] Add global bottom-right Capture entry point.
- [x] Add organized/collapsible sidebar.
- [x] Add Draft Action status tabs and clearer approve/reject feedback.
- [x] Fix sync change fingerprinting for equivalent Supabase timestamp/JSON shapes.
- [x] Upgrade Vercel CLI to `55.0.0`.
- [x] Document PR workflow for non-emergency slices.
- [x] Add sync status diagnostics showing trigger reason, table activity, upload count, queued state, and last error.
- [x] Confirm deployed sync diagnostics settle on `Synced` across Los's Mac, iPhone, and iPad.
- [x] A1 Storage And Photo Safety: preserve corrupt cache, compress photos before local save, and deploy execution roadmap.
- [x] A2 Draft Apply Safety: active-project draft lookup, enum validation, regression tests, and production deploy.
- [x] A3 Number Input Safety: shared integer input behavior, iOS numeric keyboard hints, leading-zero fix, and production deploy.
- [x] A4 Report Date Safety: selected-date reports, missing-log draft labels, placeholder removal, and production deploy.
- [x] A5 Issue Status Safety: explicit `Blocks this unit` behavior, non-blocking issue creation, status-resolution guard, and production deploy.
- [x] B1 Project Archive: soft archive for duplicate/test Real Turn projects, setup restore panel, Supabase `archived_at` sync mapping, and archive regression tests.
- [x] B2 Demo Sync Boundary: demo-scoped rows stay local on upload, fresh devices keep local demo practice data after pulling real cloud rows, and no cloud cleanup runs.
- [x] C1 Dictation Parser Eval Suite: regression tests for Los's punctuation-free field notes, unit target scoping, and crew-movement assignment parsing.
- [x] C2 Unit-Boundary Parser: punctuation-free unit segmentation, generic done/in-progress drafts, crew movement parsing, sink/leak scoping, and same-unit conflict confirmation.
- [x] C3 Draft Batch Safety: capture batch ids, visible-only bulk apply/reject, stale pending draft flags, and applied unit open target.
- [x] D1 Clickable Dashboard Stats: dashboard unit stats navigate to filtered Units views, Common Areas is removed from primary stats, and unreliable bed count is removed from the Units stat.
- [x] D2 Needs Attention Feed: dashboard attention items and smart suggestions navigate to relevant unit, issue, assignment, or daily log views.
- [x] D3 Units Scan Upgrade: Units list sorts attention first, adds counted status chips, makes card bodies tappable, and surfaces blocker, crew, issue count, and last activity context.
- [x] D4 Issue Flow Simplification: issue entry defaults owner/date, removes priority/date from the field form, uses Active issue filtering, and soft-closes accidental issues from the normal board after confirmation.
- [x] D5 Sidebar And Responsive Frame: desktop sidebar is attached to the page frame, collapsed state persists, iPad landscape uses compact Capture, and mobile/desktop rendered smokes have no horizontal overflow.
- [x] D6 Hash Routing and deep links: URL hashes preserve top-level views, unit detail routes, unit status filters, issue-focused routes, reload state, and browser back behavior.
- [x] C4 Voice Reliability: Capture explains browser speech support, opens a mobile/iPad voice sheet without auto-opening the keyboard, falls back to keyboard dictation when speech recognition is unavailable or installed iPhone/iPad PWA speech stalls, restarts after ordinary browser pauses where supported, and keeps draft-first confirmation.
- [x] C5 Capture Field-Speed Cleanup: Capture opens as a focused field workflow, Ask/Memory are removed from the visible Capture modes, older draft history is collapsed, draft JSON editing is advanced-only, applied drafts show where they went, and late-evening draft staleness uses local field date.
- [x] E2 Report Preview And Print/PDF: Reports now show an in-app review surface, print styling for Save as PDF/share as PDF, and preserved copy/download text fallbacks.
- [x] E1 Daily Activity Snapshot: Reports now include selected-date operational activity from synced activity logs, label progress metrics as current board state, preserve old edited report drafts when generated sections change, and download edited report text.
- [x] P0 Parser And Stale Unit Safety: parser-generated Ready drafts no longer carry explicit ready confirmation or inferred trade completion, negated completion notes fall back to raw-note capture, and stale unit detail links show a no-unit state instead of opening the first unit.
- [x] P0 Sync Trust / Pull Pagination: Supabase pull reads paginate past 1000 rows, `Pull cloud` is pull-only, `Upload needed` appears when local changes remain after pull, upload flows check cloud before pushing, and sync internals have regression coverage for stale-local upload prevention.
- [x] P0 Report Thaw / Backup: editable report drafts now live in AppData, JSON backups include report edits, untouched generated sections keep updating, and edited sections can be reset individually.
- [x] P0 Report Draft Supabase Sync: approved `report_drafts` migration, realtime publication, owner-scoped RLS, sync mapping, and demo-boundary coverage.
- [x] E3 Daily Log Auto-Draft: Daily Log can draft empty sections from grounded activity, blockers, issues, assignments, and current board signals while still requiring Los to review and save.
- [x] F1 IndexedDB Photo Store: compressed photo files save locally outside the main app record, migrate safely, and remain included in device-available JSON backups.
- [x] F2 Supabase Storage Photo Sync: Real Turn files upload privately, metadata paths sync after successful upload, other devices lazy-download/cache thumbnails, and failures remain retryable.
- [x] G3 PWA Install And Offline Startup: install-safe PNG icons, rotation support, atomic shell updates, bounded flaky-network fallback, and automated persistent-browser offline restart coverage.
- [x] P0 Backup Restore Safety: strict full-device backup validation, duplicate/invalid-photo protection, legacy normalization, accurate private-backup labeling, and rendered replacement/reload QA.
- [x] P0 Active Project Boundary implementation: project-proven Capture, fail-closed draft approval, current-Turn human-readable exports, explicit-project reports, and local-only ambiguous/Demo Copilot rows.
- [x] Field-Scale Regression Gate: rendered 300-unit desktop/iPad/iPhone coverage plus 1,000 units and 10,000 events under throttling.
- [x] Coalesced Persistence and text/numeric Commit-On-Blur: bounded full-state writes, lifecycle flushes, guarded draft recovery, and one-event commits.
- [x] Three-Device Sync Regression: all reconnect orders, deterministic timestamp ties, duplicate prevention, and overlapping-upload recovery.
- [x] Daily Log Identity And Restore Safety: deterministic project/date IDs, legacy cloud reconciliation, signed-out restore guard, rendered save/reload QA, and production deployment.
