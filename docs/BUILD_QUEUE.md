# Build Queue

Detailed roadmap: [docs/04_execution/FABLE5_EXECUTION_ROADMAP.md](04_execution/FABLE5_EXECUTION_ROADMAP.md)

## Active Slice

- [ ] A1 Storage And Photo Safety on `agent/storage-photo-safety`
  - [x] Preserve corrupt local cache payloads before seed fallback.
  - [x] Compress captured photos before saving them into local app state.
  - [x] Add photo compression success/error feedback.
  - [x] Add photo storage safety checklist.
  - [ ] Commit, push, PR, merge, deploy after Los approval.
  - [ ] Verify local photo capture on production.

## P0: Must Clear Before Real Field Reliance

- [ ] Run offline/reconnect QA from `docs/TESTING.md`.
- [ ] Run export/backup QA from `docs/TESTING.md`.
- [ ] Confirm Demo Mode records do not contaminate Real Turn reports, Copilot answers, or exports.
- [ ] A2 Draft Apply Safety: project-scope draft unit lookup and enum validation.
- [ ] A3 Number Input Safety: fix setup leading-zero bug and numeric keypad behavior.
- [ ] A4 Report Date Safety: selected-date reports and placeholder guard.
- [ ] A5 Issue Status Safety: stop issue creation from clobbering unit status.
- [ ] B1 Project Archive: safely hide duplicate/test Real Turn projects.
- [ ] B2 Demo Sync Boundary: keep demo practice data out of real cloud work.
- [ ] C1 Dictation Parser Eval Suite.
- [ ] C2 Unit-Boundary Parser for punctuation-free field notes.
- [ ] C3 Draft Batch Safety: visible/current batch approval only.

## P1: Should Fix During Training

- [ ] D1 Clickable Dashboard Stats.
- [ ] D2 Needs Attention Feed with deep links.
- [ ] D3 Units Scan Upgrade.
- [ ] D4 Issue Flow Simplification.
- [ ] D5 Sidebar And Responsive Frame.
- [ ] D6 Hash Routing and deep links.
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
