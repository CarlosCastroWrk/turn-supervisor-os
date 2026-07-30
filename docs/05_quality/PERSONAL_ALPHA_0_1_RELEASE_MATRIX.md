# Personal Alpha 0.1 Release Matrix

Date: 2026-07-29

Release branch: `release/personal-alpha-0.1`

Base: `58632938ca029cbcad83b55d09c84b7d4feff04b`

This matrix covers Los's personal, non-production Alpha only. Paper remains
authoritative. The Alpha does not perform payroll, official PDS submission,
property approval, autonomous mutation, AI/OCR/Whisper processing, or Track D
write behavior. All automated evidence uses synthetic data.

## Release composition

- Phase 1 reliability: accepted.
- Track A Project Setup / Property Contacts / Start Day: accepted.
- Track B enhanced Crew Detail / Additional Scope: excluded because its fresh
  actual-host review did not establish a successful end-to-end assignment.
- Assignment fallback: accepted Phase 1 released-only Paint/Clean assignment
  workflow, exposed as **Assign Crews**.
- Track C Property Walk: accepted.
- Track D: quarantined.

## P0 contract map

| Gate | P0 invariant | Primary automated evidence | Result |
| --- | --- | --- | --- |
| A. Auth and ownership | Email/password auth, durable session, sign out, owner-scoped records, no client secret | `launch-setup-auth`, `cache-ownership`, bundle inspection, approved synthetic-account smoke when credentials are available | **PASS — automated contract.** Physical Login / session persistence / Sign Out remains a deployment smoke requirement. |
| B. Project retention | Activated local project survives remote omission, reload, and sync | `sync-pull`, `project-boundary`, field-activation browser | **PASS.** Remote omission retention and reload behavior are covered in the 382-test deterministic suite and field-activation browser gate. |
| C. Start Day | Persistence precedes success; failure has no receipt; one active session | `storage-persistence`, Track A deterministic/browser, field-activation browser | **PASS.** Atomic persistence, retry, double confirmation, native schedule editing, and reopen are covered. |
| D. Release and assignment | Unreleased work cannot be assigned; compatible released Paint/Clean persists once | Track C contract, field-activation deterministic/browser, fallback actual-host smoke | **PASS — fallback.** The accepted released-only Paint/Clean assignment is exposed as **Assign Crews**. Enhanced Track B is excluded. |
| E. Inspection and callback | Crew report, Los inspection, callback, reassignment, and property acceptance remain distinct | Track C deterministic/browser and canonical projection tests | **PASS.** Callback history and authority boundaries remain separate and additive. |
| F. Walk | Eligible work only; saved Property Contact is available; exact trade/section outcomes and draft notes survive navigation and reload; no official approval inferred | Track C walk browser and actual-host field-activation browser | **PASS.** The actual host starts an eligible Walk from a saved Project Setup contact, restores the exact note and End Walk review stage after reload, and keeps Paint/Clean plus Common/A–E trade/section specific. Paper remains authoritative. |
| G. Backup and recovery | Export/restore works; failures preserve prior records and remain understandable | backup, restore-safety, production-recovery browser with local synthetic data | **PASS.** Valid backup/restore succeeds; corrupt and cancelled restore attempts leave prior records unchanged. |
| H. Core routing | Unit, assignment, and walk routes restore; Back/Forward works; one dialog/shell owner | routing, field-activation browser, single-Capture and shell browser gates | **PASS.** Durable nested routes, Back/Forward, one main region, one sheet owner, and one Capture owner are covered. |

## Device and release checks

| Check | Evidence | Result |
| --- | --- | --- |
| iPhone 390 px | Actual integrated host plus critical browser workflow | **PASS.** One main region, zero stacked dialogs, no horizontal overflow, safe Assign Crews fallback, and exact Plus-trigger focus restoration. |
| iPad landscape | Actual integrated host and Track C browser screenshots | **PASS.** No horizontal overflow or off-screen interactive controls. |
| Mac | Actual integrated host and Track C browser screenshots | **PASS.** No horizontal overflow or off-screen interactive controls. |
| Lint | `npm run lint` | **PASS.** |
| Deterministic suite | `npm run test:sync` | **PASS — 382/382.** |
| Production build | `VITE_ALPHA_GIT_SHA=personal-alpha-candidate npm run build` | **PASS.** A non-blocking large-chunk warning remains. |
| Diff hygiene | `git diff --check` | **PASS before candidate seal; rerun after the final documentation edit.** |
| Fresh release review | P0-only independent reviewer | Required against the sealed candidate before push or deployment. |

## Deployment authentication boundary

The existing Vercel project currently exposes `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, and `VITE_ENABLE_SYNC` to **Production only**. They are
not configured for Preview. No environment variables were copied, changed, or
printed during candidate verification, and no server-side secret was found in
the client bundle scan. A non-production Alpha deployment must not claim that
live authentication is accepted until Los completes the physical Login,
session-persistence, and Sign Out smoke test.

## Known non-blocking Alpha limitations

- Enhanced Crew Detail assignment and Advanced Additional Scope are unavailable.
- Advanced import/image parsing is not included.
- AI, Kimi, Turn Chat, OCR, Whisper, model routing, advanced analytics, and crew
  or management portals are not included.
- Physical iPhone Safari/PWA acceptance remains required after deployment.
- Simultaneous same-record edits still require field discipline and backups.
