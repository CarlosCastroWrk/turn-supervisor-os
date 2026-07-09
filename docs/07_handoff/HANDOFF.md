# Handoff

## Current Status

PDS / Turn Field Copilot is in Phase 1 Stabilize.

Production is live at:

```text
https://turn-supervisor-os.vercel.app
```

## Current Goal

Make Turn Field Copilot safe enough for Los's real two-week Turn operation before relying on it with real field data.

## Current Immediate Task

Release the verified E4 Project-Scoped Memory candidate, then complete the real-device offline/reconnect gate before entering real field data:

1. Obtain fresh explicit approval for `20260709195302_add_memory_project_scope.sql`.
2. Apply the additive migration, confirm migration parity/schema lint, merge the E4 PR, and deploy production.
3. Run the focused project-scoped Memory check on two devices.
4. Open production on iPhone, turn on airplane mode, update 2-3 obvious QA units/issues, and confirm they remain visible locally.
5. Turn airplane mode off and confirm Mac and iPad receive the updates after reconnect.

## Important Constraints

- Address the user as Los.
- Keep this a personal/local-first field copilot.
- Do not make it official Property Doctor Services software.
- Do not turn it into a CRM, company portal, or multi-user product yet.
- No browser API keys.
- No autonomous AI mutations.
- No automatic texting or payroll.
- Do not alter production data.
- Use pull requests for normal non-emergency slices.

## How To Resume

1. Read `AGENTS.md`.
2. Read `docs/START_HERE.md`.
3. Read `docs/CURRENT_STATE.md`.
4. Check `git status -sb`.
5. Confirm whether the task is docs-only, code, sync, Supabase, or deploy.
6. If non-emergency, use the PR workflow in `docs/06_release/GITHUB_PR_WORKFLOW.md`.

## Known Risks

- Real-device offline/reconnect behavior still needs final confirmation.
- Delete propagation/tombstones are not implemented.
- Supabase Storage photo sync is implemented for private Real Turn files, but the one-photo Mac/iPhone/iPad acceptance check is still pending.
- New photos save into IndexedDB first; signed-in sync uploads available files and other devices lazy-download/cache them.
- Cloud photo object deletion is not implemented.
- PWA install/offline startup is hardened and passes persistent-browser restart tests; physical iPhone/iPad Home Screen icon, rotation, and offline restart acceptance remains pending.
- Accessibility/field contrast is hardened in automated and rendered QA; physical bright-light and iOS VoiceOver acceptance remains pending.
- Routine field outcomes use accessible toasts; Unit quick-status actions support timestamp-guarded Undo, while destructive/recovery confirmations remain blocking.
- Simultaneous same-row edits still use whole-row timestamp conflict behavior.
- E4 code/local QA is complete, but production must not deploy it before the pending Memory project-scope migration is explicitly approved and applied.
- Legacy unscoped operational Memory is intentionally inactive until Los assigns it to the current Turn in Setup.
