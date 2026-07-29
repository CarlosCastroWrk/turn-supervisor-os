# Wave 2A.2.1 Phase 1 Reliability Coverage

Date: 2026-07-29
Candidate base: `c55004569821fa42eca3f39ababfa4f802a7b22d`
Scope: local-project retention, atomic Start Day, release-gated assignment, one canonical operational projection, and durable nested routes.

This is a personal Turn OS reliability record. It does not authorize official PDS, property, approval, payroll, AI, OCR, or Track D behavior. All verification uses synthetic data.

## Contract-to-evidence map

| Contract | Implementation evidence | Deterministic coverage | Browser or integration coverage | Failure evidence |
| --- | --- | --- | --- | --- |
| A. Retain the configured local project during remote reconciliation | `appendRequiredProjectRows` in `src/lib/supabase/sync.ts` keeps the active/configured project and its project-scoped closure when it is absent remotely. Identity matching is normalized and ambiguous competing IDs fail closed. | `tests/sync-pull.test.ts` covers empty remote pull, active session retention, unrelated remote rows, active configured-project retention, and ambiguous duplicate identity. Existing cache-owner tests cover account boundaries. | Existing reload, backup/restore, and activation browser gates verify that retained local data remains readable after reopen. | Remote absence is treated as absence, not deletion. Ambiguous same-property identities throw instead of replacing the local project. The current product has no explicit project tombstone contract, so no deletion is inferred. |
| B. Start Day is atomic and truthful | `commitAppDataUpdateNow` and `commitDataNow` persist the complete AppData candidate before exposing React success. `StartDayFlow` waits for that result, keeps its review on failure, and guards duplicate confirmation. | `tests/storage-persistence.test.ts` proves failure leaves the original AppData untouched, retry succeeds once, rapid duplicate confirmation creates no duplicate session/event, and thrown persistence errors fail closed. | `tests/wave2a21-field-activation-browser.mjs` injects one real storage failure, verifies no session or Start Day Activity exists, preserves the review, retries, double-clicks the retry, and reloads the one durable active session. | A failed write displays retry/edit/cancel and explicit “nothing was started” copy. No success receipt or active Day Session appears before persistence succeeds. |
| C. Assignment candidates require released work | `projectTrackCAssignmentEligibility` is the shared live eligibility rule. Candidate lists and bulk-all-released execution use the same rule and recheck before mutation. | `tests/wave2a2-track-c-contract.mjs` covers released scope, roster-only scope, missing assignment source, blocked access, unsupported section/trade, existing conflicting responsibility, duplicates, stale confirmation, and rapid duplicate confirmation. | Existing Track C and integrated browser gates cover assignment entry, confirmation, conflict display, and route behavior. | Ineligible rows stay excluded or return precise cautions. Final confirmation rechecks live eligibility, so a changed release or conflict cannot be saved from a stale review. |
| D. One canonical operational projection | `projectWave2A21TrackA` emits exact section-trade work records and derives queues, counts, Today’s Task, released work, walk candidates, conflicts, crew work, and Activity from that shared projection. `canonicalFieldConsumers.ts` adapts the same records to Home, Search, Notifications, Reports, and Activity. | `tests/wave2a21-track-a.test.ts` verifies exact cross-consumer parity and waiting/callback/working/ready-to-walk classification. | Integrated activation and route browser gates verify the native consumer surfaces against one activated personal project. Existing synthetic fixture gates remain the second project shape. | Activated projects no longer fall back to synthetic operational fixtures. Untouched roster-only rows are omitted; unknown or blocked work carries precise waiting reasons instead of optimistic status. |
| E. Nested field routes are durable | `src/lib/routing.ts` owns Unit, crew, assignment, walk, active-walk, queue, and Today’s Task URLs. `TrackCFieldOps` receives controlled route state from the host instead of owning a competing local route. | `tests/routing.test.ts` covers encoded IDs, route round-trips, reload-safe parsing, and explicit navigation destinations. | `tests/wave2a21-field-activation-browser.mjs` covers direct Unit, crew, assignment, walk, filtered queue, stale Unit, reload, and browser Back/Forward. Existing Track C browser coverage exercises active-walk lifecycle; the host maps its active ID to `#/walk/:id`. | Invalid or stale Unit IDs render a safe unavailable state without changing the URL. Route changes remain explicit; transient sheets keep their existing single-owner close behavior. |

## Required regression gates

- Full deterministic suite, including storage, sync, backup/restore, cache ownership, Day Session, Track C, routing, and canonical projection tests.
- Production build and lint.
- Integrated field-activation browser gate plus relevant cache, shell, Capture, and field-operation browser gates.
- `git diff --check` and final diff review.
- Fresh independent read-only review of the committed Phase 1 repair.

## Explicitly excluded

- Phase 2 workflow replacement or visual redesign.
- Track D import/write logic.
- AI, Kimi, Turn Chat, OCR, Whisper, or model integration.
- Remote schema changes, migrations, production data, Preview, or production deployment.
- Official paper, property-approval, payroll, or autonomous operational behavior.
