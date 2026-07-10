# Fable 5 Execution Roadmap

This roadmap turns the Fable 5 audit into the build plan for making Turn Field Copilot field-ready for Los's two-week Turn operation.

The goal is not to build a company product. The goal is a private, local-first, draft-first field copilot that Los can trust while walking units with poor internet, interruptions, and real operational pressure.

## Operating Rules

- Build in small PR-ready slices.
- Keep every slice independently testable and deployable.
- Prefer one failure mode per slice.
- Preserve local-first behavior and Supabase sync overlay.
- Keep Copilot draft-first; no silent AI mutations.
- Do not add browser API keys, automatic texting, payroll, CRM workflows, or multi-user/company portal features.
- Codex may implement and stress-test slices autonomously after Los sets direction.
- Los has granted standing approval for commits, pushes, PR creation, merges, and production deploys for scoped, non-destructive code/docs slices after checks pass and the diff is reviewed.
- Supabase migrations, Supabase data cleanup, destructive changes, force-pushes, secret/env changes, and product-scope changes still require fresh explicit approval.
- Fable 5 can be used as an external reviewer or implementation agent, but Codex remains the release gate before merge/deploy.

## Build Loop

For every slice:

1. Confirm the slice, acceptance criteria, and files likely touched.
2. Implement the smallest safe change.
3. Run automated checks:
   - `npm run test:sync`
   - `npm run lint`
   - `npm run check:os`
   - `npm run build`
   - `git diff --check`
4. Add targeted browser/mobile smoke tests when UI or storage behavior changes.
5. Review the diff against the slice scope.
6. Record docs updates and remaining risks.
7. Open a PR after approval.
8. Merge/deploy after approval.
9. Smoke production.
10. Run the next real-device check when needed.

## Phase A: Immediate Data Safety

These slices protect Los from losing data or corrupting the board before real field use.

### A1. Storage And Photo Safety

Status: shipped in `7cdf90b`.

Scope:

- Preserve corrupt local cache payloads before seed fallback.
- Compress captured photos before saving them locally.
- Add user-visible compression/saved/error feedback.
- Keep photos local-only for now.

Acceptance:

- Corrupt cache is preserved under a recovery key.
- App still boots after corrupt-cache fallback.
- Test photo saves, reloads, and remains visible.
- Normal unit edits still save after a photo is added.

### A2. Draft Apply Safety

Status: shipped in `6697278`.

Scope:

- Scope unit lookup for draft application to the active project.
- Validate draft payload enums before applying.
- Prevent real-project captures from mutating demo units with the same unit number.
- Add parser/apply tests for cross-project unit numbers.

Acceptance:

- A draft for real unit `203` cannot mutate demo unit `203`.
- Invalid payload values fail the draft with a clear error.
- Existing Draft Action flow stays draft-first.

### A3. Number Input Safety

Status: shipped in `6c34eb8`.

Scope:

- Add shared numeric input behavior for setup fields.
- Fix `020` / `08` controlled-number bug.
- Use iOS-friendly numeric keyboards.
- Preserve empty editing state without forcing `0` while typing.

Acceptance:

- Typing `20` into a zero field shows `20`, not `020`.
- Typing `8` into a zero field shows `8`, not `08`.
- Setup validation still prevents impossible projects.

### A4. Report Date Safety

Status: shipped in `72ddd4a`.

Scope:

- Use the selected report date, never fallback to today for a past empty day.
- Prevent placeholder report text from being exported as real content.
- Keep current text export while preparing for later print/PDF preview.

Acceptance:

- Opening a past date with no daily log does not silently generate today's report.
- Report copy clearly distinguishes missing data from real progress.

### A5. Issue Status Safety

Status: shipped in `9f5169e`.

Scope:

- Stop issue creation from automatically clobbering unit overall status.
- Add explicit "blocks unit" behavior if needed.
- Keep issue creation simple and fast.

Acceptance:

- Creating a non-blocking issue does not mark a ready unit blocked.
- Blocking status requires explicit user intent.
- Resolving an issue does not silently guess a unit status.

### A6. Backup Restore Safety

Status: implemented and deployed.

Scope:

- Validate current and supported legacy JSON backups before replacing local state.
- Reject malformed collections, incomplete runtime records, duplicate IDs, invalid embedded photos, empty project sets, and pathological record counts.
- Keep backup-first and exact replacement-count confirmations.
- Label the recovery export as a full-device private backup rather than an active-project export.

Acceptance:

- A corrupted backup cannot replace the current project or units.
- A valid backup restores after confirmation and survives reload.
- A 10,000-activity backup validates without field-visible delay.

### A7. Coalesced Local Persistence

Status: implemented and deployed.

Scope:

- Keep the latest AppData state in memory while rapid edits are in progress.
- Persist at most once per 500 ms window instead of serializing the full app record on every keystroke.
- Flush pending data immediately on `visibilitychange`/`pagehide` and component cleanup.
- Cancel pending writes before device reset so old state cannot be restored accidentally.

Acceptance:

- A 1,000-unit / 10,000-event state shows at least a 50% full-storage-write reduction during throttled rapid typing.
- The newest pending value survives an immediate background/close signal.
- Reset cannot be followed by a stale queued write.
- Commit-on-blur activity-log cleanup remains a separate follow-up slice.

### A8. Commit-On-Blur Field Drafts

Status: implemented and deployed.

Scope:

- Keep existing-record text edits local to the focused field instead of mutating AppData per character.
- Store a lightweight session draft keyed by entity and field for interruption recovery.
- Commit once on blur or Enter for single-line inputs.
- Reject stale session drafts when the authoritative record value changed underneath them.
- Clear only Turn Field Copilot session drafts during confirmed device reset or backup restore.
- Remove the fake Setup `Saved Automatically` action that created an empty activity event.

Acceptance:

- A 26-character large-state edit creates zero AppData activity while focused and exactly one activity event on commit.
- The committed value reaches localStorage in one bounded write.
- A same-session reload restores an interrupted draft without treating it as saved field truth.
- Project, Unit, Issue, Crew, Assignment, training, and Memory text editors use the shared behavior.

### A9. Numeric Commit-On-Blur Fields

Status: implemented and deployed.

Scope:

- Keep existing-record Project estimate and Unit bed/bath edits local to the focused number field.
- Reuse the session-draft safety boundary so an interrupted multi-digit edit can be recovered only while its authoritative value remains unchanged.
- Canonicalize and commit once on blur or Enter without creating an activity event for an unchanged value.
- Preserve transient Setup and quick-creation number behavior when the user moves directly from a field to its submit button.

Acceptance:

- A multi-digit existing-record edit creates zero AppData activity while focused and exactly one activity event and one full-state write on commit.
- Enter commits the canonical number and clears its session draft.
- The rendered Setup flow still creates the expected 300-unit project after multi-field numeric entry.
- Existing leading-zero, blank-draft, minimum, maximum, and pasted-number safety tests remain green.

## Phase B: Real Turn Cleanup And Sync Boundaries

These slices clean up test noise and reduce resurrection/duplication risks.

### B1. Project Archive

Status: implemented in the B1 Project Archive release slice.

Scope:

- Add soft archive for duplicate/test Real Turn projects.
- Hide archived projects from normal switchers/views.
- Require backup warning before archive.
- Do not true-delete records yet.

Acceptance:

- Los can archive duplicate test projects safely.
- Archived projects do not pollute normal Real Turn mode.
- Archive syncs as a normal field update.

### B2. Demo Sync Boundary

Status: implemented in the B2 Demo Sync Boundary release slice.

Scope:

- Prevent demo seed records from being uploaded as real working cloud data.
- Keep Demo Mode usable locally.
- Plan one-time cloud cleanup separately with explicit approval.

Acceptance:

- Fresh devices still have demo practice data locally.
- Real Turn sync does not re-upload demo data as active cloud work.
- No production data cleanup runs without separate approval.

### B3. Offline/Reconnect Trust

Status: deterministic convergence coverage is implemented; Los reported the physical Mac/iPhone/iPad offline/reconnect baseline passing on July 10, 2026.

Scope:

- Run Mac/iPhone/iPad airplane-mode edit test.
- Document device writer rule if whole-row last-write-wins remains.
- Capture any sync conflicts or stale overwrites as follow-up slices.
- Pull cloud data in pages so large activity histories and fresh-device restores do not silently truncate at 1000 rows.
- Pull and merge cloud state before upload flows push local changes.
- Keep `Pull cloud` as a pull-only recovery action.
- Show a clear pending-upload state when pull-only recovery leaves local changes unsent.
- Resolve exact-timestamp row conflicts identically on every device so background sync cannot alternate between two tied copies.

Acceptance:

- 2-3 offline QA edits survive reconnect and appear on other devices.
- Sync status remains understandable.
- No duplicates appear.
- Fresh-device pulls can retrieve more than 1000 rows per table.
- `Pull cloud` does not upload local rows.
- The sync pill does not claim `Synced` when local changes still need upload after pull.
- Upload flows do not blindly overwrite newer cloud rows without first checking cloud state.
- Disjoint twelve-hour offline edits converge without duplicate rows in a disposable three-device cloud simulation.
- Every reconnect order selects the newest same-row edit, and tied rows settle without later re-uploads.

### B4. Active Project Boundary

Status: implemented and deployed after E4.

Scope:

- Stamp new Capture and local Copilot history with the active Turn.
- Resolve legacy draft/follow-up provenance from linked records and activity batches.
- Hide other-Turn draft history and refuse ambiguous or cross-Turn approvals.
- Keep Demo and unverifiable Copilot rows local during sync.
- Scope human-readable exports and report builders to an explicit project while preserving full-device recovery backups.

Acceptance:

- A Demo draft for Unit 203 cannot mutate Real Turn Unit 203.
- Human-readable Real Turn exports contain no Demo sentinel records.
- Full-device JSON backups still contain every project for recovery.
- Project-boundary selection remains bounded across 10,000 Draft Actions.

## Phase C: Capture Trust

These slices make the core Copilot loop reliable enough for walking.

### C1. Dictation Parser Eval Suite

Status: implemented in the C1 Dictation Parser Eval Suite release slice.

Scope:

- Add realistic punctuation-free field-note fixtures.
- Include Los's examples:
  - `104 done 105 in progress 312 sink leak`
  - `204 paint done but cleaning blocked keys missing`
  - `Jose moved from 203 to 205`
- Test draft count, target unit, type, and payload.

Acceptance:

- Parser tests cover the known failing cases and pass with the current parser fixes.
- Regression suite can be run locally.

### C2. Unit-Boundary Parser

Status: implemented in the C2 Unit-Boundary Parser release slice.

Scope:

- Split capture text by unit mentions, not only punctuation.
- Scope issue/status patterns to the unit segment.
- Add generic done/in-progress/moving patterns.
- Detect conflicting drafts for the same unit and require confirmation.

Acceptance:

- Los's example produces three drafts, not duplicate/wrong drafts.
- Capture remains deterministic and local.

### C3. Draft Batch Safety

Status: implemented in the C3 Draft Batch Safety release slice.

Scope:

- Group drafts by capture batch.
- Scope Approve All to visible/current batch.
- Flag stale drafts older than today.
- Applied drafts should link to what changed.

Acceptance:

- Approve All cannot silently apply old hidden drafts.
- Los can see where an applied draft went.

### C4. Voice Reliability

Status: implemented in the C4 Voice Reliability release slice.

Scope:

- Improve browser speech-recognition restart behavior where supported.
- Keep iPhone/iPad keyboard dictation fallback.
- Explain speech-recognition privacy clearly.

Acceptance:

- Capture does not stop unexpectedly after a short pause when the browser allows restart.
- Keyboard dictation remains usable.

### C5. Capture Field-Speed Cleanup

Status: implemented in the C5 Capture Field-Speed Cleanup release slice.

Scope:

- Make the global Capture button open a focused capture flow, not a multi-mode console.
- Hide Ask/Memory from the visible Capture page until those belong in Settings/Profile.
- Keep older Draft Actions recoverable but collapsed by default.
- Hide raw JSON draft editing behind an advanced control.
- Show where an approved draft went.
- Compare draft staleness against Los's local field date.

Acceptance:

- After capturing `unit 103 is done`, the current draft card is the main thing Los sees.
- Older/stale drafts do not dominate the default Capture view.
- Applied drafts clearly offer a path to open the affected unit/target.

### C6. Capture Workspace V2

Status: implemented in PR #60 and deployed as `dpl_Fm5Pv6bH8jSPcYEg6xzfSc7jZP8Y`; one focused physical-device acceptance pass remains.

Scope:

- Open one global Field Copilot workspace without routing away from the current board.
- Accept typed updates, camera photos, image attachments, and bounded readable field-note files in one composer.
- Present parser output as a compact conversation and review timeline.
- Keep photos and every operational mutation behind explicit Unit targeting and approval.
- Keep voice capture honest across browser speech, iPhone/iPad keyboard dictation, and typed fallback.
- Preserve modal focus, Escape layers, background inertness, and target navigation.

Acceptance:

- Capture opens from every primary field screen and the composer accepts input on Mac, iPad, and iPhone.
- One message can create multiple separately reviewable Draft Actions.
- A staged photo is compressed, saved locally first, and never silently assigned to an ambiguous Unit.
- Approve and Reject change only the reviewed records.
- Opening a result closes Capture and lands on the correct record.
- Desktop, iPad landscape, and 390-pixel iPhone layouts have no horizontal overflow or blocked controls.
- Provider calls remain out of this release; deterministic Capture still works fully offline.

## Phase D: Field Command Center UX

These slices turn the app from display-first into action-first.

### D1. Clickable Dashboard Stats

Status: implemented in the D1 Clickable Dashboard Stats release slice.

Scope:

- Make Units, Ready, In Progress, Blocked, and Inspection cards clickable.
- Link to filtered Units views.
- Drop Common Areas from primary dashboard stats.
- Remove unreliable bed count from the Units stat until per-unit beds are intentional.
- Make buckets mutually understandable.

Acceptance:

- Clicking a dashboard stat lands on the matching filtered unit list.
- Card counts match filtered results.

### D2. Needs Attention Feed

Status: implemented in the D2 Needs Attention Feed release slice.

Scope:

- Replace dead dashboard issue/suggestion sections with one action feed.
- Deep-link issue rows, blocked units, missing daily log, and stale items.
- Keep feed source-grounded.

Acceptance:

- Every feed row opens the underlying unit, issue, daily log, or workflow.
- No decorative dead cards remain in the main dashboard attention area.

### D3. Units Scan Upgrade

Scope:

- Sort by needs attention first.
- Add status filter chips with counts.
- Show blocker reason, crew, issue count, and last activity.
- Make full unit card tappable.

Acceptance:

- Los can find blocked/in-progress/inspection units quickly on phone and iPad.
- Unit cards do not rely on tiny tap zones.

### D4. Issue Flow Simplification

Scope:

- Default date and owner.
- Remove priority from the field form for now.
- Keep category and unit selection.
- Add simple resolve/delete or archive with undo/confirmation strategy.

Acceptance:

- Adding an issue is faster and less form-heavy.
- Accidental issues can be removed from normal view safely.

### D5. Sidebar And Responsive Frame

Scope:

- Make Mac sidebar part of the full page frame, not a floating detached card.
- Keep Capture bottom-right.
- Persist collapsed state.
- Fix iPad breakpoint/orientation behavior.

Acceptance:

- Mac, iPad landscape, iPad portrait, and iPhone all have intentional navigation.
- No horizontal overflow.

### D6. Hash Routing

Scope:

- Add lightweight routing for views and detail records.
- Make unit and issue detail paths addressable.
- Preserve back-button/reload behavior.

Acceptance:

- Reloading a unit detail does not lose location.
- Dashboard deep links can target units/issues directly.

## Phase E: Reports And Daily Memory

These slices make the report useful for Tony and make the app remember the day.

### E1. Daily Activity Snapshot

Scope:

- Start recording a source-grounded daily summary from activity logs.
- Distinguish current state from historical day state.
- Prepare report preview data.

Acceptance:

- Past reports do not silently show today's state under an old date.

### E2. Report Preview And Print PDF

Status: implemented in the E2 Report Preview And Print/PDF release slice.

Scope:

- Build an in-app report preview.
- Add print stylesheet for Save as PDF/share as PDF.
- Keep copy-to-text export.

Acceptance:

- Report is readable before export.
- PDF output has title, sections, bullets, blockers, and tomorrow priorities.

### P0 Report Thaw / Backup

Status: implemented in the P0 Report Thaw / Backup and Report Draft Supabase Sync release slices.

Scope:

- Keep generated report sections updating until Los edits that section.
- Preserve edited title, summary, and section bodies without freezing untouched sections.
- Move report drafts into AppData so JSON backup includes report edits.
- Add per-section reset behavior.
- Sync editable report drafts through Supabase after explicit migration approval.

Acceptance:

- Opening a report in the morning does not permanently freeze empty generated sections.
- Edited sections remain under Los's control.
- JSON backup includes report draft edits.
- Supabase report-draft sync uses owner-scoped RLS, Realtime, and demo-boundary protection.

### E3. Daily Log Auto-Draft

Status: implemented in the E3 Daily Log Auto-Draft release slice.

Scope:

- Pre-fill daily log sections from that day's activity.
- Keep editable human confirmation.
- Tie missing daily log suggestion to the report/log flow.

Acceptance:

- Los does not need to retype facts already captured during the day.
- Auto-drafted text fills empty sections only and does not become saved field truth until Los presses Save Daily Log.

### E4. Memory Consumption

Status: implemented, migrated, merged, and deployed after explicit approval.

Scope:

- Project-scope memories.
- Use typed memories for report preference and crew facts.
- Drop source-removed memories from active use after archive/delete.
- Review, edit, approve, reject, and deactivate Memory from Setup rather than adding another primary field screen.
- Keep unscoped legacy operational Memory inactive until Los deliberately assigns it to the current Turn.
- Prevent duplicate candidate facts and repeated approval from creating duplicate saved memories.

Acceptance:

- Memory affects only grounded, relevant outputs.
- Deleted/archived records do not keep driving current recommendations.
- Demo and another Real Turn's Memory do not appear in the active project or Daily Log history.
- Auto-drafted lessons remain unsaved until Los presses Save Daily Log.

### P0. Daily Log Identity And Restore Safety

Status: implemented, merged, deployed, and production-smoke verified.

Scope:

- Use one deterministic Daily Log ID for each project/date on every device.
- Reconcile legacy random IDs by project/date while preserving the existing cloud row identity.
- Collapse local duplicates before save and keep newest whole-row content authoritative.
- Require Supabase auth resolution and sign-out before local JSON restore.
- Keep restore local-only; do not add a force-overwrite-cloud action.

Acceptance:

- Mac, iPhone, and iPad cannot create separate cloud rows for the same project/date.
- Every three-device reconnect order settles on one row and the newest timestamped content.
- Existing legacy cloud Daily Logs update in place instead of violating the database uniqueness boundary.
- Signed-in restore is blocked with a visible sign-out instruction.
- A restored local copy can be reviewed/exported before any later cloud merge.

## Phase F: Photo Durability

These slices finish the photo architecture after compression reduces the immediate risk.

### F1. IndexedDB Photo Store

Status: implemented in the F1 IndexedDB Photo Store release slice.

Scope:

- Move photo binary payloads out of the main `localStorage` app blob.
- Keep metadata in app state.
- Preserve local-first/offline behavior.

Acceptance:

- Large photo sets do not cause full-state localStorage quota pressure.
- JSON backup behavior is clearly documented and includes photo files available on the current device.

### F2. Supabase Storage Photo Sync

Status: implemented in the F2 release slice; Los reported cross-device photo acceptance passing on July 10, 2026.

Scope:

- Upload compressed photos to private Supabase Storage when signed in.
- Store `storage_path` in `photo_notes`.
- Lazy-download thumbnails on other devices.

Acceptance:

- Photos can appear across Los's devices.
- No tenant/private data policy changes.

## Phase G: Performance, Accessibility, And Polish

These slices harden the app once core field use is stable.

### G1. Activity Log Pruning And Pull Pagination

Status: implemented in the G1 Bounded Activity History release slice. Pull pagination remains in place, local hot state retains at most 10,000 raw Activity entries, and Activity cloud pulls use the same newest-row bound without deleting cloud history.

Scope:

- Avoid Supabase 1000-row pull caps.
- Keep activity history useful without unbounded sync cost.

Acceptance:

- The active Turn is prioritized when the raw Activity window is full.
- Legacy Draft, Follow-Up, training, and direct Memory-source provenance is retained before ordinary inactive-project history when space is constrained.
- New actions remain in the 10,000-entry window while the oldest raw detail rolls off.
- Saved Daily Logs, report drafts, operational records, photos, Draft Actions, and Memory are not pruned.
- Supabase Activity rows are not deleted by this client-side retention policy.

### G2. Undo And Toast System

Status: implemented in the G2 release slice with guarded Unit quick-status Undo.

Scope:

- Replace blocking alerts/confirms for common field actions.
- Add aria-live feedback.
- Keep destructive, compound, and data-recovery confirmations blocking.
- Bind Unit Undo to the exact update timestamp and reject stale Undo after any later Unit edit.

Acceptance:

- Routine validation and copy/backup errors do not interrupt the field flow with browser alerts.
- Unit quick-status actions expose a reachable 10-second Undo on Units and Unit Detail.
- Successful Undo restores only the prior status patch as a newer activity event.
- Stale Undo cannot overwrite a newer local, Realtime, or manual Unit edit.
- Repeated taps create no fake activity, and trade shortcuts cannot erase harder access/maintenance/hold/rework state.
- Reset, restore, project lifecycle, unsaved-change, unsafe Ready, and storage-failure guardrails remain explicit.

### G3. PWA Install And Offline Startup

Status: implemented in the G3 release slice; physical iPhone/iPad Home Screen acceptance remains open.

Scope:

- Add PNG icons for iOS install.
- Revisit manifest orientation.
- Add service-worker navigation timeout behavior for flaky networks.

### G4. Accessibility And Field Contrast

Status: implemented in the G4 release slice; Los reported bright-light readability and basic iOS VoiceOver acceptance passing on July 10, 2026.

Scope:

- Strengthen focus rings, touch targets, progressbar semantics, and outdoor legibility.
- Add skip navigation, active-page semantics, descriptive repeated-action names, focus-safe modal behavior, and reduced-motion support.

Acceptance:

- Visible controls meet a 44px minimum target in rendered mobile and desktop audits.
- Automated scans find no unnamed controls, unlabeled fields, measured contrast failures, horizontal overflow, or console errors on the tested core views.
- Voice Capture traps keyboard focus, closes on Escape, and restores focus to its trigger.
- Physical bright-light and iOS VoiceOver checks remain part of the Phase 1 device gate.

### G5. Preview-First CSV Unit Import

Status: implemented and deployed in PR #51; physical iPhone/iPad file-picker acceptance remains open.

Scope:

- Import Real Turn Units from a flexible, documented CSV contract without overwriting existing Units.
- Preview ready, existing, duplicate, and invalid rows before applying anything.
- Ignore imported status values and start every imported Unit as Not Started.
- Bound file size, row count, headers, text, numbers, and browser-storage pressure.
- Persist the complete import before reporting success and batch large sync uploads retryably.

Acceptance:

- A malformed, duplicate, oversized, stale-project, or storage-rejected import changes no Units.
- A valid import can add up to 5,000 unique Units, survives reload, and creates missing Building/Floor records without duplicate aliases.
- Existing Unit records and statuses remain unchanged.
- Exported CSV values cannot execute as spreadsheet formulas when opened.
- Desktop/mobile automation passes without horizontal overflow or interference with global Capture.
- Physical iPhone/iPad selection, preview, confirm, reload, and Capture spacing remain part of the device gate.

### G6. Preview-First Bulk Unit Updates

Status: implemented and deployed in PR #54; physical iPhone/iPad filtered-batch acceptance remains open.

Scope:

- Select Units from the active filtered board without changing the ordinary one-Unit workflow.
- Apply one explicit paint, cleaning, repair, or inspection transition to at most 500 reviewed Units.
- Preview exact update and skip counts before applying anything.
- Revalidate active-project scope, Unit timestamps, workflow protection, and storage durability at confirmation.

Acceptance:

- Another Turn's Unit can never enter the batch even when Unit numbers match.
- A Unit changed after preview is skipped instead of overwritten.
- Blocked, later-stage, unfinished, unchanged, or missing Units fail closed when the selected transition does not qualify.
- No bulk action can mark a Unit Ready, perform an arbitrary reset, or claim automatic Undo.
- A storage quota failure leaves Units and Activity history unchanged.
- 300 Units update and survive reload, 500 is the hard transaction ceiling, and 1,000 matching Units require narrower filters.
- Desktop, iPad landscape, and iPhone render without horizontal overflow or Capture-confirm overlap.
- Physical iPhone/iPad filtered selection, preview, confirm, reload, and sync remain part of the device gate.

### G7. Production Security Headers

Status: implemented and deployed in PR #56; signed-in physical sync/photo acceptance remains part of the shared device gate.

Scope:

- Add a version-controlled Content Security Policy and baseline response headers to every production route.
- Keep scripts same-origin while allowing only the Supabase HTTPS/WebSocket connections, photo blob/data sources, manifest, worker, camera, and microphone capabilities the field app already uses.
- Block framing, object embedding, MIME sniffing, cross-origin form submission, and unused browser permissions without changing the local-first data model.

Acceptance:

- HTML, service worker, and manifest responses expose the reviewed header set in a Vercel preview and production.
- The policy explicitly allows only the existing Supabase, photo blob/data, manifest, worker, camera, and microphone sources required by the field app.
- The browser app shell, Dashboard, Capture, voice fallback, signed-out sync panel, and service-worker registration remain functional with no CSP, console, request, or overflow failures.
- The deterministic suite verifies every required directive and prevents unsafe inline/evaluated scripts from being added silently.
- `npm audit` remains at zero known vulnerabilities; no config-only dependency is accepted to provide type helpers.
- Physical signed-in sync, cross-device photo, installed-PWA, and voice checks remain open rather than being inferred from the unsigned browser smoke.

### G8. Production Recovery Gate And Local Date Safety

Status: implemented and deployed in PR #58.

Scope:

- Exercise the real production report, export, local-photo, backup, and restore UI in a fresh unsigned browser profile with disposable `QA_RECOVERY_*` data.
- Verify current-Turn human-readable files stay scoped while the private full-device backup preserves Demo and Real Turn recovery data.
- Reject invalid and structurally corrupt backups without changing local storage, cancel a valid restore once, then approve and verify it through reload.
- Keep backup, CSV, Markdown, and report filenames on Los's local field date near the UTC date boundary.

Acceptance:

- Seven expected files download and contain the reviewed project/date/count sentinels without Demo contamination in current-Turn output.
- A compressed photo lives in IndexedDB, survives reload and a normal Unit edit, enters the private JSON backup, and returns after valid restore.
- Invalid and corrupt files leave local storage byte-for-byte unchanged; cancel changes nothing; approved restore removes post-backup edits and preserves exact project/Unit/Issue counts after reload.
- Local, protected preview, and canonical production runs finish with no overflow, console, page, CSP, or request failures.
- The gate remains unsigned and cannot upload or alter Supabase data; physical signed-in restore and cross-device photo acceptance remain separate.

## Phase H: Later Intelligence

Only after the field-safe deterministic version is trusted.

### H1. Protected Model Route

Status: implemented and deployed dormant in PR #62; billing is funded and local synthetic model checks pass, but production use still requires the H2 schema and fresh Vercel environment approval.

- [x] Add a same-origin server route with no provider key in browser code.
- [x] Default to a configurable cost-controlled model and preserve a deterministic fallback.
- [x] Require structured output validated at the server boundary.
- [x] Include supporting record IDs and never permit direct operational mutation.
- [x] Add request limits, timeouts, redacted errors, and eval fixtures before production enablement.
- [ ] Enable live production requests only after H2 migration, environment approval, and one synthetic production check.

### H2. Cost-Aware Model Orchestration And AI Usage Meter

- [x] Use one direct model call chosen by Capture complexity and consequence.
- [x] Keep focused extraction on `gpt-5.4-nano`, complex Capture on `gpt-5.4-mini`, and `gpt-5.5` manual-only.
- [x] Record model, route reason, token usage, pricing version, and estimated per-call cost.
- [x] Add local-first, backup-safe usage history and a project-level Turn AI budget.
- [x] Show estimated used/remaining/average/recent calls without requesting an elevated OpenAI admin key.
- [x] Apply the owner-scoped Supabase metering migration after explicit approval; local and remote history now match, with linked schema lint passing.
- [ ] Deploy the dormant H2 release before separate production activation.

### H3. Grounded Multimodal Assistance

- Use approved project context, selected records, and staged images or readable files.
- Turn model suggestions into the existing Draft Action review contract.
- Keep offline Capture usable when the provider or network is unavailable.

### H4. Later Data Integrity

- Conflict review UI.
- True delete tombstones.
- Field-level merge/server timestamps.

## Current Slice Train

1. A1 Storage And Photo Safety
2. A2 Draft Apply Safety
3. A3 Number Input Safety
4. A4 Report Date Safety
5. A5 Issue Status Safety
6. B1 Project Archive
7. B2 Demo Sync Boundary
8. C1 Dictation Parser Eval Suite
9. C2 Unit-Boundary Parser
10. C3 Draft Batch Safety
11. D1 Clickable Dashboard Stats
12. D2 Needs Attention Feed
13. D3 Units Scan Upgrade
14. D4 Issue Flow Simplification
15. D5 Sidebar And Responsive Frame
16. D6 Hash Routing
17. C4 Voice Reliability
18. E2 Report Preview And Print PDF
19. E1 Daily Activity Snapshot
20. P0 Parser And Stale Unit Safety
21. P0 Sync Trust / Pull Pagination
22. P0 Report Thaw
23. P0 Report Draft Supabase Sync
24. E3 Daily Log Auto-Draft
25. C5 Capture Field-Speed Cleanup
26. F1 IndexedDB Photo Store
27. F2 Supabase Storage Photo Sync
28. G3 PWA Install And Offline Startup
29. G4 Accessibility And Field Contrast
30. G2 Undo And Toast System
31. E4 Project-Scoped Memory
32. P0 Backup Restore Safety
33. P0 Active Project Boundary
34. Field-Scale Regression Gate
35. P0 Storage Write Coalescing
36. P0 Text Commit-On-Blur
37. P0 Numeric Commit-On-Blur
38. P0 Three-Device Sync Regression
39. P0 Daily Log Identity And Restore Safety
40. G5 Preview-First CSV Unit Import
41. G6 Preview-First Bulk Unit Updates
42. G7 Production Security Headers
43. G8 Production Recovery Gate And Local Date Safety
44. C6 Capture Workspace V2
45. H1 Protected Model Route
46. H2 Cost-Aware Model Orchestration And AI Usage Meter

This order can change if real-device testing finds a higher-risk failure.
