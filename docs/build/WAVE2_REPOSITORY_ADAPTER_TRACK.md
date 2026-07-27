# Wave 2 Repository Adapter — Track C

## Status

Isolated read-only foundation on `codex/wave2-repository-adapter`. It is not wired into the application, persistence, sync, Supabase, UI, fixtures, or production.

The accepted feature files and regressions from commits `46d9eb5` and `723fdb0` are ported into Launch Track D without changing the newer Wave 1R host. Track D intentionally does not port the package-script edit because package ownership remains with the integration agent.

## Exact Mapping

The adapter scopes itself to `AppData.activeProjectId` and maps only fields that already have a direct personal-record source:

| AppData source | Wave 1 adapter output | Rule |
| --- | --- | --- |
| `Project.id` | repository `projectId` and Unit source metadata | Exact active-project match only |
| `Project.mode` | `projectMode` and explicit Demo/Real personal-record label | Never relabeled as a Wave 1 synthetic fixture |
| `Unit.id` | `Jul28UnitRecord.id` | Missing or duplicate IDs fail the whole repository |
| `Unit.projectId` | active-project boundary | Other-project Units are excluded |
| `Unit.unitNumber` | `Jul28UnitRecord.unitNumber` | Blank or normalized duplicate numbers fail the whole repository |
| `Unit.bedCount` | descriptive `unitTypeLabel` only | Does not infer Common/A–E applicability |
| exact globally unique, project-scoped `Building.name` | `buildingLabel` | Missing, cross-project, or duplicate IDs become explicit unknown coverage |
| exact globally unique matching `Floor.name` | `floorLabel` | Missing, cross-project duplicate, or building-mismatched IDs become explicit unknown coverage |

The adapter emits the locked Common/A–E display order but emits **zero** `Jul28SectionTradeRecord` values. Existing `AppData` does not authoritatively provide section-level applicability, release, access, assignment episode, crew report, Los inspection, property walk, paper review, full-Paint, provenance, or additive history facts.

Whole-Unit statuses, assigned crew IDs, assignments, issues, photos, activity, and notes are intentionally not promoted into the field-truth model. The existing Wave 1 coverage validator therefore reports all 12 Paint/Clean section keys missing and calculates no readiness or completion.

## Source And Authority Boundary

- Existing Wave 1 fixtures remain `synthetic-jul28-pattern-candidate`.
- This adapter is `personal-turn-os-app-data` with `sourceKind: personal-record`.
- Demo Mode and Real Turn Mode receive distinct personal-record labels.
- The adapter has no synthetic fallback.
- The adapter does not write any official paper, property, approval, payroll, persistence, or sync state.

The adapter snapshot is deeply read-only at the type level and frozen at runtime, including Unit scalars, section order, section records, nested record facts, source metadata, and coverage arrays. The existing Wave 1 `Jul28TurnBoardRepository` still exposes mutable `Jul28UnitRecord` values and accepts only the synthetic source literal. Track C names that existing read boundary but does not claim the immutable adapter implements it. Application wiring requires an integration-owned shared-boundary decision; Track C does not make that change.

Run the ported adapter regression directly from Track D:

```bash
node --experimental-strip-types --import ./tests/register-ts-loader.mjs --test tests/jul28-repository-adapter.test.ts
```

The integration agent may add a package script later. Track D does not modify `package.json` or the lockfile.

## Future Mutation Contract

`mutationContract.ts` declares types only for explicitly Los-confirmed personal-record actions:

- assign crew;
- crew-reported completion;
- Los inspection;
- callback;
- property walk observation;
- blocker; and
- note.

Every future command must carry raw source text, a source label, Los confirmation, and a boundary declaring no official-paper, property-system, approval, or payroll effect. No implementation or wiring exists in this track.
