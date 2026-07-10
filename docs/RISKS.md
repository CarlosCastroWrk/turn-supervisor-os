# Risks

## Active Phase 1 Risks

| Risk | Severity | Status | Mitigation |
| --- | --- | --- | --- |
| Real-device sync may fail or require manual pull | High | Guarded | Baseline sync now settles on Los's Mac, iPhone, and iPad. Pull reads now paginate, `Pull cloud` no longer uploads, `Upload needed` appears when local changes remain, and upload flows check cloud before pushing. Offline/reconnect QA still must pass before real field data. |
| Simultaneous same-row edits may still overwrite by timestamp | High | Guarded | Pull-before-push and deterministic equal-time winners stop cycling, but true field-level conflict review does not exist. Avoid editing the same Unit on multiple devices at once and keep JSON backups before serious use. |
| Offline edits may not merge as expected | High | Open | Test airplane mode edits before Turn. Keep JSON backups before serious use. |
| Demo data could contaminate Real Turn reports, Capture history, Copilot answers, or exports | High | Guarded | The deployed Active Project Boundary uses project-proven drafts, fail-closed approval, current-Turn human-readable exports, explicit-project report selectors, and local-only handling for Demo/unverifiable Copilot rows. Physical-device sentinel checks remain pending. |
| Delete/reset/restore behavior can be misunderstood | High | Guarded | Keep reset warnings explicit. Restore waits for auth state and requires sign-out; review/export recovered data before signing in again because newer cloud rows can later merge back. Do not reset real data without backup. |
| Cross-device photo sync is not yet verified on Los's physical devices | Medium | Guarded | Real Turn files now upload to Los's private Supabase Storage folder and lazy-download on another signed-in device. Run the one-photo Mac/iPhone/iPad acceptance check before relying on it; JSON backup remains the recovery path. |
| Cloud photo objects are not deleted automatically | Medium | Open | Photo upload is additive and retryable. Avoid treating soft-removed metadata as secure erasure; object cleanup must wait for the delete/tombstone design and explicit production-data approval. |
| Installed iPhone/iPad PWA behavior differs from desktop browser emulation | Medium | Guarded | Persistent Chromium restart, offline deep links, shell cache, icon metadata, and rotation policy pass automated tests. Los still must verify Home Screen icon, portrait/landscape rotation, and a fully closed airplane-mode restart on physical devices. |
| Outdoor and assistive-technology behavior differs from browser automation | Medium | Guarded | Automated checks now cover 44px targets, contrast, labels, landmarks, progress semantics, route focus, and the Voice dialog keyboard trap. Los still must verify bright-light legibility and iOS VoiceOver on physical devices. |
| An old Undo could overwrite a newer Unit edit | High | Guarded | Unit Undo tokens are bound to the exact post-update timestamp. Undo refuses to run if that Unit changed again, and a successful Undo is a new timestamped activity event rather than history deletion. |
| A trade-completion shortcut could clear a harder Unit blocker | High | Closed | Shared paint/clean/maintenance transition helpers preserve access, hold, maintenance, rework, punch-list, and advanced inspection/ready states as appropriate. Repeated status taps are ignored without activity or sync churn. |
| `localStorage` can fill up with large photo payloads | Medium | Closed | Normal compressed photo files now live in IndexedDB, legacy payloads migrate after confirmed writes, and only a capped emergency fallback can embed a small photo in the main app record. |
| Raw Activity history could grow until local storage and every sync become slow | Medium | Guarded | G1 keeps the active Turn and required provenance first within a 10,000-entry local window and bounds Supabase Activity pulls to the same newest-row limit. Old raw detail can roll off, but saved Daily Logs, report drafts, operational records, and cloud rows are not deleted. |
| Corrupt local cache can hide field data | Medium | Guarded | Corrupt cache payloads are preserved under a recovery key before the app falls back to seed data. JSON backups remain the recovery path Los can use directly. |
| Editable report drafts do not sync across devices | Medium | Closed | Los approved the `report_drafts` migration; report drafts now have a Supabase table, owner-scoped RLS, Realtime publication, and sync mapping. Same-row conflict review remains covered by the broader sync conflict risk. |
| Stale, duplicate, Demo, or another Turn's Memory could influence current output | High | Guarded | Deployed E4 only consumes approved Memory for the active non-archived project plus explicit global personal/safety rules, validates live source records, suppresses duplicate candidate facts/double approval, and leaves legacy unscoped operational Memory inactive. Cross-device acceptance remains pending. |
| Reports may be treated as official company records | Medium | Open | Keep copy personal and factual. Do not use company branding or invented numbers. |
| Restore-from-JSON could replace the wrong or corrupted local device state | Medium | Guarded | Backup-first and replacement confirmations remain. Restore validates collections, required fields, duplicate IDs, photo payloads, project availability, and record counts, and production blocks replacement while sync is signed in. Physical photo-complete restore and unusually large-file behavior still need device acceptance. |
| A wrong or very large CSV could duplicate Units, overwrite field work, exhaust local storage, or overload sync | High | Guarded | Import is Real Turn-only, preview-first, additive, status-blind, capped at 2 MB/5,000 rows, and durably committed before UI success. Existing/duplicate/invalid Units are skipped, exports neutralize spreadsheet formulas, and sync uses retryable 500-row batches. Physical iPhone/iPad file-picker acceptance and the lack of automatic import Undo remain open. |
| A bulk Unit action could update hidden Units, regress blocked work, or overwrite a newer device edit | High | Guarded | Selection is limited to the active filtered Turn and clears when filters change. Every batch previews update/skip counts, caps at 500, excludes bulk Ready/resets, rechecks Unit timestamps and transition protection, persists before success, and names runtime-skipped Units. Physical iPhone/iPad filtered-batch acceptance and the lack of automatic bulk Undo remain open. |
| Parser coverage may miss real field phrasing | Medium | Guarded | A deterministic parser eval suite now covers punctuation-free unit boundaries, blockers, crew moves, conflicting updates, Ready safety, negation, and project-scoped Memory candidates. Continue adding training-derived phrases before Turn. |
| Legacy Copilot rows may have no verifiable Turn | Medium | Guarded | Ambiguous legacy drafts/follow-ups remain local, hidden from current-Turn history/exports, and cannot mutate the board. They remain present in the full-device JSON backup; recapture any still-relevant field update in the correct Turn. |
| Sync status lacks enough field diagnostics | Medium | Closed | The diagnostics slice adds visible trigger, table, event, row count, queued state, and last error, and Los confirmed production devices settle on `Synced`. |
| Users may assume every action can be undone | Low | Guarded | Only high-frequency Unit quick-status toasts expose Undo. Destructive and compound actions keep explicit confirmations or review-first flows. |
| Same-day Daily Logs created offline could violate the cloud project/date uniqueness rule | High | Guarded | Production uses deterministic new IDs, tuple-aware local save, legacy cloud-ID reconciliation, all six reconnect-order tests, and a 5,000-log performance gate. Physical-device acceptance remains pending. |
| AI usage estimates could drift from the provider invoice | Medium | Guarded | Every receipt stores returned token counts and a versioned price table, the UI labels values as estimates, and authoritative balance/organization usage stays on OpenAI Billing. Recheck pricing before Turn and whenever models or provider rates change. |
| The in-app AI budget could be mistaken for a hard spending cap | Medium | Guarded | The panel explicitly calls the value a Turn budget estimate. Keep OpenAI project limits and auto-recharge settings as the actual enforcement controls. |
| AI usage receipts could fail to sync before the H2 schema exists | High | Gated | Do not merge/deploy the sync mapping until the reviewed `ai_usage_events`/`ai_budget_usd` migration is explicitly approved and applied. Production AI stays disabled through that release. |
| Vercel CLI was outdated locally | Low | Closed | Upgraded to `55.0.0` on 2026-07-09 after Los approved. |
| Supabase CLI is behind the current release | Low | Open | Version `2.98.2` successfully performs the H2 dry-run and linked lint; `2.109.1` is available. Upgrade separately rather than changing release tooling inside the metering slice. |

## Product Scope Risks

| Risk | Severity | Status | Mitigation |
| --- | --- | --- | --- |
| Overbuilding before training clarifies real workflow | High | Open | Do not build Phase 2+ features until Phase 1 is stable and Los has field feedback. |
| Turning the app into unofficial company software too early | High | Open | Keep this as Los's private field copilot until after Turn and explicit leadership approval. |
| AI mutating records without confirmation | High | Guarded | Keep Draft Actions as the approval boundary. |
| Provider secrets leaking into browser code | High | Guarded | No OpenAI/Anthropic keys in Vite client code. Server-side API only if/when added. |
| Tenant or private information entering notes/photos | High | Policy | Do not capture tenant PII, faces, or private documents. |
| Exported JSON backup can contain every project and work photos | High | Guarded | The recovery export is labeled `Full Device JSON Backup`; its copy states that all projects and available local photo files are included and must be kept private. |

## Review Triggers

Review this file when:

- A real-device sync test fails.
- New data model fields are added.
- AI/provider routes are introduced.
- Photos move from local-only to Supabase Storage.
- Any reset/delete/import feature changes.
- Los starts entering real field data.
