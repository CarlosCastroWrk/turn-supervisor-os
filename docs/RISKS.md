# Risks

## Active Phase 1 Risks

| Risk | Severity | Status | Mitigation |
| --- | --- | --- | --- |
| Real-device sync may fail or require manual pull | High | Guarded | Baseline sync now settles on Los's Mac, iPhone, and iPad. Pull reads now paginate, `Pull cloud` no longer uploads, `Upload needed` appears when local changes remain, and upload flows check cloud before pushing. Offline/reconnect QA still must pass before real field data. |
| Simultaneous same-row edits may still overwrite by timestamp | High | Open | Pull-before-push reduces stale device clobbers, but true conflict review does not exist yet. Avoid editing the same unit/log on multiple devices at once. Keep JSON backups before serious use. |
| Offline edits may not merge as expected | High | Open | Test airplane mode edits before Turn. Keep JSON backups before serious use. |
| Demo data could contaminate Real Turn reports or Copilot answers | High | Open | Test Real Turn views, exports, reports, and Copilot answers with obvious demo vs real labels. |
| Delete/reset behavior can be misunderstood | High | Open | Keep reset warnings explicit. Do not reset real data without backup. Document that cloud records can pull back after local reset. |
| Photo image data is local-only | Medium | Open | Avoid relying on cross-device photos until Supabase Storage upload is implemented. Export backups if photos matter. |
| `localStorage` can fill up with large photo payloads | Medium | Guarded | Captured photos are compressed before saving, but photos still belong in IndexedDB/Supabase Storage before heavy field use. |
| Corrupt local cache can hide field data | Medium | Guarded | Corrupt cache payloads are preserved under a recovery key before the app falls back to seed data. JSON backups remain the recovery path Los can use directly. |
| Editable report drafts do not sync across devices | Medium | Closed | Los approved the `report_drafts` migration; report drafts now have a Supabase table, owner-scoped RLS, Realtime publication, and sync mapping. Same-row conflict review remains covered by the broader sync conflict risk. |
| Reports may be treated as official company records | Medium | Open | Keep copy personal and factual. Do not use company branding or invented numbers. |
| No restore-from-JSON flow in-app | Medium | Open | Backups are still useful for recovery evidence, but restore requires manual/developer help today. |
| Parser has no formal eval suite | Medium | Open | Add realistic field-note parser tests after device sync is no longer blocking. |
| Sync status lacks enough field diagnostics | Medium | Closed | The diagnostics slice adds visible trigger, table, event, row count, queued state, and last error, and Los confirmed production devices settle on `Synced`. |
| Vercel CLI was outdated locally | Low | Closed | Upgraded to `54.21.1` on 2026-07-07 after Los approved. |

## Product Scope Risks

| Risk | Severity | Status | Mitigation |
| --- | --- | --- | --- |
| Overbuilding before training clarifies real workflow | High | Open | Do not build Phase 2+ features until Phase 1 is stable and Los has field feedback. |
| Turning the app into unofficial company software too early | High | Open | Keep this as Los's private field copilot until after Turn and explicit leadership approval. |
| AI mutating records without confirmation | High | Guarded | Keep Draft Actions as the approval boundary. |
| Provider secrets leaking into browser code | High | Guarded | No OpenAI/Anthropic keys in Vite client code. Server-side API only if/when added. |
| Tenant or private information entering notes/photos | High | Policy | Do not capture tenant PII, faces, or private documents. |

## Review Triggers

Review this file when:

- A real-device sync test fails.
- New data model fields are added.
- AI/provider routes are introduced.
- Photos move from local-only to Supabase Storage.
- Any reset/delete/import feature changes.
- Los starts entering real field data.
