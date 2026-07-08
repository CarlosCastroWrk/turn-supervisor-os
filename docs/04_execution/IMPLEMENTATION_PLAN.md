# Implementation Plan

## Current Mission

Make Turn Field Copilot safe enough for Los's real two-week student housing Turn operation before real field data is entered.

The active execution roadmap is [FABLE5_EXECUTION_ROADMAP.md](FABLE5_EXECUTION_ROADMAP.md).

## Current Status

- Baseline sync settles on Los's Mac, iPhone, and iPad.
- Sync diagnostics are deployed.
- The next real-device gate is offline/reconnect QA.
- A2 Draft Apply Safety is shipped in `6697278`.
- A3 Number Input Safety is shipped in `6c34eb8`.
- A4 Report Date Safety is shipped in `72ddd4a`.
- The current implementation branch is `codex/issue-status-safety`.

## Current Slice

### A5. Issue Status Safety

Purpose:

- Stop ordinary issue creation from silently changing unit board status. Status-changing issue behavior must require explicit intent from Los.

Scope:

- Add an explicit `Blocks this unit` control to issue creation flows.
- Default issue creation to issue-only.
- Only update linked unit overall status when `Blocks this unit` is selected.
- Keep issue resolution from silently guessing unit readiness.
- Add regression tests for non-blocking, blocking, and resolved issue flows.

Out of scope:

- True delete/tombstones.
- Full issue/archive workflow redesign.
- Conflict review UI.
- Automatic status derivation after issue resolution.

Acceptance:

- Creating a non-blocking issue does not change the linked unit status.
- Blocking status requires Los to check `Blocks this unit`.
- Resolving an issue does not silently mark a unit ready or alter its status.
- Existing issue creation remains fast on iPhone/iPad.

## Slice Protocol

Every slice follows this order:

1. Confirm the slice from [FABLE5_EXECUTION_ROADMAP.md](FABLE5_EXECUTION_ROADMAP.md).
2. Inspect current source, docs, and `git status`.
3. Implement the smallest safe change.
4. Run required checks.
5. Run targeted browser/mobile smoke tests.
6. Review `git diff --check`, `git diff --stat`, and the actual diff.
7. Update docs only for facts that changed.
8. Commit, push, and open a PR under the standing release authorization when the slice is scoped and non-destructive.
9. Merge and deploy under the standing release authorization when checks pass and the PR diff stays within scope.
10. Smoke production.
11. Move to the next slice.

## Required Checks

Run these for every code slice:

```bash
npm run test:sync
npm run lint
npm run check:os
npm run build
git diff --check
```

Run this before production deploy or any sync-sensitive PR:

```bash
vercel env run -e production -- npm run build
```

Run Supabase checks only when a slice touches schema, RLS, Storage policies, or remote data:

```bash
supabase migration list --linked
supabase db push --dry-run --linked
supabase db lint --linked --fail-on error
```

## Stress Checks By Slice Type

Storage/photo:

- Add a generated test photo in browser.
- Confirm compression feedback.
- Reload and confirm thumbnail/caption persist.
- Inject corrupt localStorage and confirm recovery key preservation.

Sync/offline:

- Reopen Mac/iPhone/iPad.
- Tap `Sync now` once.
- Run airplane-mode edits on one device.
- Confirm reconnect propagation.
- Check Sync details if anything cycles.

Parser/Capture:

- Run parser fixture tests.
- Test punctuation-free dictated notes.
- Confirm draft count, target entity, and payload.
- Confirm approve/reject/applied/failed states.

Dashboard/navigation:

- Verify desktop, iPad, and iPhone widths.
- Confirm no horizontal overflow.
- Confirm every visible card that looks clickable has a destination.
- Confirm back/reload behavior if routing changes.

Reports:

- Generate current-day report.
- Generate past-date report.
- Confirm no placeholder text is treated as real data.
- Preview/print output if print/PDF changes.

## Current Ordered Slice Train

1. A1 Storage And Photo Safety
2. A2 Draft Apply Safety
3. A3 Number Input Safety
4. A4 Report Date Safety
5. A5 Issue Status Safety
6. B1 Project Archive
7. B2 Demo Sync Boundary
8. B3 Offline/Reconnect Trust
9. C1 Dictation Parser Eval Suite
10. C2 Unit-Boundary Parser
11. C3 Draft Batch Safety
12. D1 Clickable Dashboard Stats
13. D2 Needs Attention Feed
14. D3 Units Scan Upgrade
15. E2 Report Preview And Print PDF
16. D5 Sidebar And Responsive Frame
17. F1 IndexedDB Photo Store
18. F2 Supabase Storage Photo Sync

This order can change if testing finds a higher-risk failure.

## Fable 5 Usage

Use Fable 5 when:

- A slice benefits from external UX/product review.
- A proposed diff needs a second design/code audit.
- The next slice has ambiguous product behavior.

Do not let Fable 5 merge, deploy, or run production data cleanup without the same release gate.

Recommended Fable prompt shape:

```text
Audit this slice only: [slice name].
Do not expand scope.
Review product fit, UX, code risk, mobile behavior, sync/offline risk, and missing tests.
Return blocking issues first, then recommended follow-up.
```

## Approval And Release Boundary

Codex may continue implementation and testing slice-by-slice after Los sets the direction.

Los has granted standing approval for normal scoped, non-destructive code/docs slices. Codex may proceed without asking each time for:

- Commit
- Push
- Pull request creation
- Merge
- Production deploy

Fresh explicit approval is still required for:

- Supabase migration
- Supabase data cleanup
- Any destructive/reset/delete operation
- Force-push
- Secret or environment variable changes
- Product-scope changes into CRM/company/multi-user software

If Los changes that boundary again, update `AGENTS.md` first so every future agent follows the same rule.
