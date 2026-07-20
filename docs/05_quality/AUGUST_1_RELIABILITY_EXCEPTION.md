# August 1 Reliability Exception — Persistence And Photos

Date: July 20, 2026

Status: implemented and verified locally in isolated worktree `codex/august1-reliability-ab`; not committed, merged, pushed, or deployed.

## Narrow Authorization

Los authorized only:

1. Propagating delayed AppData write failure and retaining the latest pending value.
2. A persistent visible unsaved warning with retry and backup guidance.
3. Honest, recoverable photo failure behavior without creating new embedded base64 payloads.
4. Tests and minimal documentation directly required for those behaviors.

The broader implementation gate remains blocked. Ready, workflow/provenance, Moon Tower, TurnBoard, approval, payroll, cache ownership, sync-conflict, environment, schema, migration, and production behavior were not changed.

## Verified Persistence Contract

- A delayed write clears its pending value only after `localStorage` confirms success.
- A failed delayed write retains the latest full AppData value for retry.
- A later successful write clears the persistent failed/unsaved state.
- The app shows an app-wide warning while durable saving is failed.
- The warning provides `Retry save` when a queued value is available and always provides a path to `Data & backup`.
- Immediate CSV/bulk persistence remains fail-closed. A failed immediate transaction is not silently queued or applied later.

## Verified Photo Failure Behavior

- New photo capture no longer creates an embedded base64 fallback when IndexedDB fails.
- Legacy `imageData` backup reading, restoration, and IndexedDB migration remain supported.
- A photo is called saved only after both the IndexedDB file and AppData metadata record are durable.
- Failed Unit-detail photos remain staged in memory with Retry and Remove actions.
- Failed Capture photos remain visible on their review card with Retry and Remove actions.
- A failed Capture photo does not block reviewed non-photo Draft Actions from being applied.
- If metadata persistence fails after the blob is written, the app attempts to delete the unreferenced blob and reports when cleanup could not be confirmed.

## Verification Receipt

- `npm run lint` — passed.
- Targeted storage/photo tests — 11/11 passed.
- `npm run test:sync` — 231/231 passed.
- `npm run build` — passed.
- New local persistence/photo failure-injection browser gate — passed.
- `npm run test:cache-guard-browser` — passed.
- `npm run test:capture-workspace` — passed.
- `npm run test:board-first` — passed on desktop, iPad, and iPhone viewports.
- Production-recovery flow — passed against the isolated local build using the already-repaired selector harness from the protected primary checkout.

No model smoke, production credentials, production data, Supabase migration, Vercel setting, or deployment was used.

## Remaining Limitations

- An unsaved AppData value and a failed staged photo are recoverable while the app remains open; a forced browser/tab termination can still discard in-memory pending work.
- IndexedDB cleanup is best effort. If IndexedDB itself is unavailable during cleanup, an unreferenced local blob may remain until device data is reset or a later cleanup capability is approved.
- Physical iPhone/iPad Safari and installed-PWA failure injection is unverified.
- Multi-device concurrent writing and official field use remain outside this exception.
- The clean `f506bc5` recovery harness still has the known stale `Save Note` selector. This slice did not absorb that unrelated primary-worktree change.
