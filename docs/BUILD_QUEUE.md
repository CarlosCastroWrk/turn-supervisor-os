# Build Queue

Detailed roadmap: [docs/04_execution/FABLE5_EXECUTION_ROADMAP.md](04_execution/FABLE5_EXECUTION_ROADMAP.md)

## Active Slice

- [ ] B3 Offline/Reconnect Trust remains the next real-device gate.
  - [ ] Run Mac/iPhone/iPad airplane-mode edit test.
  - [ ] Document whole-row last-write-wins risk and capture any stale overwrite findings.
- [ ] Current code slice is C4 Voice Reliability.
  - [ ] Make dictation fallback states clearer on iPhone/iPad.
  - [ ] Confirm Capture stays usable when browser speech recognition is unavailable.
  - [ ] Keep capture draft-first and deterministic.

## P0: Must Clear Before Real Field Reliance

- [ ] Run offline/reconnect QA from `docs/TESTING.md`.
- [ ] Run export/backup QA from `docs/TESTING.md`.
- [ ] Confirm Demo Mode records do not contaminate Real Turn reports, Copilot answers, or exports.
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
- [ ] C4 Voice Reliability.
- [ ] E2 Report Preview And Print/PDF.
- [ ] Run field test on iPhone Safari or installed PWA.
- [ ] Run field test on iPad Safari or installed PWA.
- [ ] Verify or repeat the previously reported 200-300 unit Start Real Turn stress test.

## P2: Can Wait Until After Turn Starts If P0/P1 Are Stable

- [ ] E1 Daily Activity Snapshot.
- [ ] E3 Daily Log Auto-Draft.
- [ ] E4 Memory Consumption and project scoping.
- [ ] F1 IndexedDB Photo Store.
- [ ] F2 Supabase Storage Photo Sync.
- [ ] G1 Activity Log Pruning And Pull Pagination.
- [ ] G2 Undo And Toast System.
- [ ] G3 PWA Install And Offline Startup.
- [ ] G4 Accessibility And Field Contrast.
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
- [x] Upgrade Vercel CLI to `54.21.1`.
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
