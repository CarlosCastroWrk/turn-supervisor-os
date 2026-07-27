# Wave 2 Repository Adapter — Track C

## Status

Isolated read-only foundation on `codex/wave2-repository-adapter`. It is not wired into the application, persistence, sync, Supabase, UI, fixtures, or production.

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
| exact project-scoped `Building.name` | `buildingLabel` | Missing, cross-project, or duplicate links become explicit unknown coverage |
| exact matching `Floor.name` | `floorLabel` | Missing, duplicate, or building-mismatched links become explicit unknown coverage |

The adapter emits the locked Common/A–E display order but emits **zero** `Jul28SectionTradeRecord` values. Existing `AppData` does not authoritatively provide section-level applicability, release, access, assignment episode, crew report, Los inspection, property walk, paper review, full-Paint, provenance, or additive history facts.

Whole-Unit statuses, assigned crew IDs, assignments, issues, photos, activity, and notes are intentionally not promoted into the field-truth model. The existing Wave 1 coverage validator therefore reports all 12 Paint/Clean section keys missing and calculates no readiness or completion.

## Source And Authority Boundary

- Existing Wave 1 fixtures remain `synthetic-jul28-pattern-candidate`.
- This adapter is `personal-turn-os-app-data` with `sourceKind: personal-record`.
- Demo Mode and Real Turn Mode receive distinct personal-record labels.
- The adapter has no synthetic fallback.
- The adapter does not write any official paper, property, approval, payroll, persistence, or sync state.

The Wave 1 `Jul28TurnBoardRepository.source` type currently accepts only the synthetic literal. Track C therefore reuses its `listUnits`/`getUnit` read boundary and keeps the personal source discriminator local. Application wiring requires an integration-owned widening of the shared source type; Track C does not make that change.

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
