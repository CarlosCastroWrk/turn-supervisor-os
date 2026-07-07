# Handoff

## Current Status

PDS / Turn Field Copilot is in Phase 1 Stabilize.

Production is live at:

```text
https://turn-supervisor-os.vercel.app
```

Latest shipped app commit:

```text
822aa8e Fix sync change fingerprinting
```

## Current Goal

Make Turn Field Copilot safe enough for Los's real two-week Turn operation before relying on it with real field data.

## Current Immediate Task

Verify the latest deployed sync fix on real devices:

1. Open or hard-refresh the PWA on Mac, iPhone, and iPad.
2. Tap `Sync now` once.
3. Wait 60-90 seconds.
4. Confirm whether each device settles on `Synced` or keeps cycling.

If sync still cycles, the next PR should be `sync status diagnostics`.

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

- Real-device sync still needs final confirmation after the sync fingerprinting fix.
- Delete propagation/tombstones are not implemented.
- Photo binary sync through Supabase Storage is not implemented.
- Restore-from-JSON UI is not implemented.
- Parser tests are still thin.
