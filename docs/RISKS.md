# Risks

## Active Phase 1 Risks

| Risk | Severity | Status | Mitigation |
| --- | --- | --- | --- |
| Real-device sync may fail or require manual pull | High | Guarded | Baseline sync now settles on Los's Mac, iPhone, and iPad. Pull reads now paginate, `Pull cloud` no longer uploads, `Upload needed` appears when local changes remain, and upload flows check cloud before pushing. Offline/reconnect QA still must pass before real field data. |
| Simultaneous same-row edits may still overwrite by timestamp | High | Open | Pull-before-push reduces stale device clobbers, but true conflict review does not exist yet. Avoid editing the same unit/log on multiple devices at once. Keep JSON backups before serious use. |
| Offline edits may not merge as expected | High | Open | Test airplane mode edits before Turn. Keep JSON backups before serious use. |
| Demo data could contaminate Real Turn reports or Copilot answers | High | Open | Test Real Turn views, exports, reports, and Copilot answers with obvious demo vs real labels. |
| Delete/reset behavior can be misunderstood | High | Open | Keep reset warnings explicit. Do not reset real data without backup. Document that cloud records can pull back after local reset. |
| Cross-device photo sync is not yet verified on Los's physical devices | Medium | Guarded | Real Turn files now upload to Los's private Supabase Storage folder and lazy-download on another signed-in device. Run the one-photo Mac/iPhone/iPad acceptance check before relying on it; JSON backup remains the recovery path. |
| Cloud photo objects are not deleted automatically | Medium | Open | Photo upload is additive and retryable. Avoid treating soft-removed metadata as secure erasure; object cleanup must wait for the delete/tombstone design and explicit production-data approval. |
| Installed iPhone/iPad PWA behavior differs from desktop browser emulation | Medium | Guarded | Persistent Chromium restart, offline deep links, shell cache, icon metadata, and rotation policy pass automated tests. Los still must verify Home Screen icon, portrait/landscape rotation, and a fully closed airplane-mode restart on physical devices. |
| Outdoor and assistive-technology behavior differs from browser automation | Medium | Guarded | Automated checks now cover 44px targets, contrast, labels, landmarks, progress semantics, route focus, and the Voice dialog keyboard trap. Los still must verify bright-light legibility and iOS VoiceOver on physical devices. |
| An old Undo could overwrite a newer Unit edit | High | Guarded | Unit Undo tokens are bound to the exact post-update timestamp. Undo refuses to run if that Unit changed again, and a successful Undo is a new timestamped activity event rather than history deletion. |
| A trade-completion shortcut could clear a harder Unit blocker | High | Closed | Shared paint/clean/maintenance transition helpers preserve access, hold, maintenance, rework, punch-list, and advanced inspection/ready states as appropriate. Repeated status taps are ignored without activity or sync churn. |
| `localStorage` can fill up with large photo payloads | Medium | Closed | Normal compressed photo files now live in IndexedDB, legacy payloads migrate after confirmed writes, and only a capped emergency fallback can embed a small photo in the main app record. |
| Corrupt local cache can hide field data | Medium | Guarded | Corrupt cache payloads are preserved under a recovery key before the app falls back to seed data. JSON backups remain the recovery path Los can use directly. |
| Editable report drafts do not sync across devices | Medium | Closed | Los approved the `report_drafts` migration; report drafts now have a Supabase table, owner-scoped RLS, Realtime publication, and sync mapping. Same-row conflict review remains covered by the broader sync conflict risk. |
| Reports may be treated as official company records | Medium | Open | Keep copy personal and factual. Do not use company branding or invented numbers. |
| Restore-from-JSON could replace the wrong or corrupted local device state | Medium | Guarded | Backup-first and replacement confirmations remain. Restore now validates every persisted collection, required runtime fields, duplicate IDs, photo payloads, project availability, and record count before changing state. Physical photo-complete restore and unusually large-file behavior still need device acceptance. |
| Parser has no formal eval suite | Medium | Open | Add realistic field-note parser tests after device sync is no longer blocking. |
| Sync status lacks enough field diagnostics | Medium | Closed | The diagnostics slice adds visible trigger, table, event, row count, queued state, and last error, and Los confirmed production devices settle on `Synced`. |
| Users may assume every action can be undone | Low | Guarded | Only high-frequency Unit quick-status toasts expose Undo. Destructive and compound actions keep explicit confirmations or review-first flows. |
| Vercel CLI was outdated locally | Low | Closed | Upgraded to `54.21.1` on 2026-07-07 after Los approved. |

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
