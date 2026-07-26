# Field Truth Model

## Status

**Provisional pattern-candidate model.** It is a software hypothesis for synthetic testing, not a confirmed Moon Tower workflow, official TurnBoard translation, approval rule, or payroll model.

## Source Separation

The candidate must label and preserve the difference among:

- universal PDS training guidance;
- Inspire on 22nd observations;
- Moon Tower-confirmed facts;
- Los's personal record;
- synthetic product fixtures;
- unresolved assumptions.

No Inspire mark, color, approval, or payroll meaning becomes Moon Tower truth without accountable Moon Tower evidence.

## Candidate Grain

```text
Property
└── Unit
    ├── Common
    ├── A
    ├── B
    ├── C
    ├── D
    └── E
        ├── Paint
        └── Clean
            └── Assignment episode
```

Sections are configurable by Unit type. A section can be structurally not applicable without being complete, restricted, or authorized.

## Independent Tracks

### Authorization

- `not-released`
- `released`
- `uncertain`
- `assignment-conflict`

### Access

- `accessible`
- `occupied-or-restricted`
- `access-blocked`
- `maintenance-blocked`

### Crew execution

- `unassigned`
- `assigned`
- `working`
- `crew-reported-complete`
- `cancelled`

### Los quality control

- `inspection-pending`
- `los-passed`
- `callback-required`
- `reinspection-pending`
- `passed-after-callback`

### Property walk

- `walk-not-ready`
- `walk-pending`
- `property-accepted`
- `property-rejected`

### Personal reconciliation

- `needs-paper-review`
- `paper-reviewed`

These are candidate internal facts. Official paper marks, actors, evidence, and payroll effects remain outside the model until confirmed.

## Candidate Records

- `Unit`: property-scoped identity, type, building/floor, and applicable sections.
- `UnitSection`: Common/A-E applicability and restriction facts.
- `TradeScope`: Paint or Clean for the July 28 Moon Tower candidate.
- `AssignmentEpisode`: initial assignment, added scope, reassignment, callback, cancellation, or supersession.
- `Blocker`: access, maintenance, assignment conflict, owner, next action, and resolution.
- `Inspection`: Los's personal inspection result and source wording.
- `PropertyWalk`: a manually recorded candidate fact; never inferred.
- `PaperReview`: Los's reminder that personal notes were checked against the authoritative paper process.
- `EvidenceReference`: permitted note/file/photo metadata only; no sensitive contents by default.

No Supabase schema change is authorized. A track may implement an additive feature-flagged local adapter using synthetic fixtures.

## Consequential Candidate State

`PDS Approved` may appear only in the isolated candidate as a manual, explicitly confirmed property-walk acceptance label. It:

- is never inferred;
- is not payroll approval;
- does not reconcile paper automatically;
- must remain visibly provisional/property-configurable until Moon Tower confirms the term and authority;
- must not be written to existing operational records by default.

## Synthetic Scenarios

| Scenario | Required truth behavior |
| --- | --- |
| Unit 602 added scope | Added work is a new assignment episode, not an original crew miss. |
| Unit 603C crew report | Crew-complete stays inspection-pending while resident access blocks Los. |
| Unit 604C conflict | Assignment evidence and physical occupancy conflict; authorization stays unresolved. |
| Unit 1305B partial completion | Paint and Clean can pass while another required floor section keeps the Unit incomplete. |
| Duplicate assignment | Two active crew claims are surfaced for review; neither silently wins. |

## Invariants

- Paint and Clean remain independent.
- Whole-Unit status is a projection, not a manually selected generic `Done` value.
- Callbacks normally retain the responsible original crew unless Los explicitly reassigns them.
- Original assignment evidence and later changes remain historically visible.
- Manual updates must work without voice or AI.
- Paper remains authoritative.
