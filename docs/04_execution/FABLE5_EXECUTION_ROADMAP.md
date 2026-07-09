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

Scope:

- Run Mac/iPhone/iPad airplane-mode edit test.
- Document device writer rule if whole-row last-write-wins remains.
- Capture any sync conflicts or stale overwrites as follow-up slices.
- Pull cloud data in pages so large activity histories and fresh-device restores do not silently truncate at 1000 rows.
- Pull and merge cloud state before upload flows push local changes.
- Keep `Pull cloud` as a pull-only recovery action.
- Show a clear pending-upload state when pull-only recovery leaves local changes unsent.

Acceptance:

- 2-3 offline QA edits survive reconnect and appear on other devices.
- Sync status remains understandable.
- No duplicates appear.
- Fresh-device pulls can retrieve more than 1000 rows per table.
- `Pull cloud` does not upload local rows.
- The sync pill does not claim `Synced` when local changes still need upload after pull.
- Upload flows do not blindly overwrite newer cloud rows without first checking cloud state.

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

Scope:

- Project-scope memories.
- Use typed memories for report preference and crew facts.
- Drop source-removed memories from active use after archive/delete.

Acceptance:

- Memory affects only grounded, relevant outputs.
- Deleted/archived records do not keep driving current recommendations.

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

Status: implemented in the F2 release slice; physical-device acceptance remains open.

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

Scope:

- Avoid Supabase 1000-row pull caps.
- Keep activity history useful without unbounded sync cost.

### G2. Undo And Toast System

Scope:

- Replace blocking alerts/confirms for common field actions.
- Add aria-live feedback.

### G3. PWA Install And Offline Startup

Status: implemented in the G3 release slice; physical iPhone/iPad Home Screen acceptance remains open.

Scope:

- Add PNG icons for iOS install.
- Revisit manifest orientation.
- Add service-worker navigation timeout behavior for flaky networks.

### G4. Accessibility And Field Contrast

Status: implemented in the G4 release slice; physical outdoor and iOS VoiceOver acceptance remains open.

Scope:

- Strengthen focus rings, touch targets, progressbar semantics, and outdoor legibility.
- Add skip navigation, active-page semantics, descriptive repeated-action names, focus-safe modal behavior, and reduced-motion support.

Acceptance:

- Visible controls meet a 44px minimum target in rendered mobile and desktop audits.
- Automated scans find no unnamed controls, unlabeled fields, measured contrast failures, horizontal overflow, or console errors on the tested core views.
- Voice Capture traps keyboard focus, closes on Escape, and restores focus to its trigger.
- Physical bright-light and iOS VoiceOver checks remain part of the Phase 1 device gate.

## Phase H: Later Intelligence

Only after the field-safe deterministic version is trusted.

- Server-side AI route with no browser API keys.
- Structured outputs with supporting record IDs.
- Model-assisted summaries with local deterministic fallback.
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

This order can change if real-device testing finds a higher-risk failure.
