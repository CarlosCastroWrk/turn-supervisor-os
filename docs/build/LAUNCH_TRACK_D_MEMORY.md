# Launch Track D — Operational Memory And Repository Foundation

## Status

Feature-local, synthetic-data foundation on `codex/launch-track-d-memory`, based on `51a0edd4179a44400839ca171a9bda9ed648a497`.

It is not wired into the application shell, persistent `AppData`, local storage, sync, Supabase, AI execution, or deployment. It performs no official paper, property, approval, payroll, or production action.

## Foundation Delivered

`src/features/operational-memory/` provides typed contracts and in-memory repositories for:

- operational events;
- Activity and Unit-history projections;
- approved knowledge;
- preserved source documents;
- AI threads and raw messages;
- proposals;
- AI runs; and
- usage/cost records.

All records carry explicit `accountId` and `projectId` scope. Direct access to a known record through the wrong account or project throws `OperationalScopeError`. Empty or missing scope fails closed.

Operational events are the only new records projected into Activity and Unit history. AI messages, proposals, AI runs, and usage records remain separate. Raw chat wording is never promoted into operational truth.

The event model covers:

- notes and editable voice transcripts;
- assignment and crew reports;
- Los inspections;
- callbacks and blockers;
- property walks;
- source imports;
- confirmed, edited, and rejected proposals;
- Undo; and
- personal paper-reconciliation reminders.

## AppData Boundary

`createAppDataOperationalReadSource(scope, appData)` is the only Track D path from existing `AppData` into the new read foundation.

It:

- requires an explicit account and active-project scope;
- fails instead of selecting a fixture when source identity is missing or ambiguous;
- reuses the accepted `jul28-turnboard` adapter for Unit identity and location;
- labels existing whole-Unit statuses as legacy personal summaries, not section-level truth;
- exposes existing issues, assignments, Activity, and approved project Memory as sourced personal records;
- ignores raw Copilot conversations as operational truth; and
- never mutates `AppData`.

The accepted adapter from commits `46d9eb5` and `723fdb0` remains identity-only. It intentionally does not promote whole-Unit status, assignment, issue, note, photo, or Activity values into Paint/Clean section truth.

## Approved Read Tools

Track D implements the complete approved read-tool surface:

- `get_property_summary`
- `search_units`
- `get_unit`
- `get_unit_history`
- `get_needs_me`
- `get_daily_progress`
- `get_callbacks`
- `get_ready_for_walk`
- `get_crew_assignments`
- `get_approved_knowledge`

Every tool is bound to one injected account/project scope and rejects a mismatched request scope.

`get_daily_progress` counts explicit operational events deterministically. It returns `goal: null` because the configured daily-goal model belongs to Track B and is not present in current `AppData`.

`get_ready_for_walk` returns only Units with an explicit personal `walk-pending` event. It does not infer readiness from a legacy `Ready` string, crew report, Los inspection, property acceptance, paper state, or payroll state.

## Context Assembly And Grounding

`assembleOperationalContext` builds a bounded bundle of:

- sourced property facts;
- sourced Unit identity and history;
- approved knowledge; and
- optional conversation messages in a separate `operationalTruth: false` collection.

Every operational fact requires a source reference. Referenced source documents, operational events, and approved-knowledge records must resolve inside the same account/project repositories or assembly fails with `OperationalGroundingError`.

Uploaded or pasted source content remains marked `untrustedInput: true`. This track provides no model prompt, write tool, automatic proposal application, or database credential.

## Integration Notes

The integration agent should:

1. Derive `accountId` from the authenticated server/session boundary, never from free-form model or UI input.
2. Bind `projectId` to the verified active personal project before constructing the AppData adapter.
3. Choose a local durable repository adapter before relying on new records across reloads; the Track D repositories are intentionally in-memory only.
4. Feed Activity UI and Unit history from the same operational-event repository.
5. Let Track B provide daily-goal configuration while preserving Track D deterministic counts.
6. Let Track C consume read tools and grounded context, but keep proposal confirmation and operational writes in deterministic application code.
7. Preserve the explicit failure state when AppData coverage is missing. Do not substitute `jul28SyntheticTurnBoardRepository` in a personal-record path.
8. Keep package scripts, shared application wiring, persistent state, Supabase initialization, schemas, migrations, and deployment configuration integration-owned.
9. Add both focused test files to the integration branch's standard deterministic test manifest before merging; Track D leaves `package.json` untouched by design.

## Verification Commands

Focused Track D tests:

```bash
node --experimental-strip-types --import ./tests/register-ts-loader.mjs --test tests/jul28-repository-adapter.test.ts tests/operational-memory.test.ts
```

Repository gates:

```bash
npm run lint
npm run build
git diff --check
```

## Known Limitations

- New repositories are process-memory only; no reload persistence is claimed.
- Existing `AppData` has no embedded account ID. The authenticated integration boundary must inject it.
- Existing `AppData` does not contain authoritative section applicability, authorization, access, assignment episodes, crew completion, Los inspection, property walk, paper review, or payroll facts.
- Daily-goal targets are not implemented in Track D.
- No UI, AI provider, model, write tool, remote schema, migration, sync table, or production configuration is included.
- Only synthetic test records were used.
