# Build Queue

Tasks move through this queue after the current Phase 1 goal is understood.

## P0: Must Clear Before Real Field Reliance

- [ ] Confirm deployed sync fingerprinting fix settles on `Synced` across Mac/iPhone/iPad.
- [ ] If sync still cycles, add sync status diagnostics showing trigger reason, table activity, upload count, and last error.
- [ ] Run Mac/iPhone/iPad production sync QA from `docs/TESTING.md`.
- [ ] Run offline/reconnect QA from `docs/TESTING.md`.
- [ ] Run export/backup QA from `docs/TESTING.md`.
- [ ] Confirm Demo Mode records do not contaminate Real Turn reports, Copilot answers, or exports.

## P1: Should Fix During Training

- [ ] Run field test on iPhone Safari or installed PWA.
- [ ] Run field test on iPad Safari or installed PWA.
- [ ] Verify or repeat the handoff-reported 200-300 unit Start Real Turn stress test before marking complete.
- [ ] Add formal automated Copilot parser tests.
- [ ] Improve unit/issue scanning for one-handed field use.

## P2: Can Wait Until After Turn Starts If Phase 1 Is Stable

- [ ] Add better photo compression/storage.
- [ ] Add CSV unit import.
- [ ] Add bulk unit update workflow.
- [ ] Add server-side AI provider only if a safe backend route is introduced.

## Blocked

- Field workflow details are blocked until training clarifies real Turn process.

## Done

- [x] Create project operating-system scaffold.
- [x] Intake master prompt.
- [x] Select React + TypeScript + Vite.
- [x] Implement local-first v0.1 app.
- [x] Add PWA manifest and basic service worker.
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
