# Wave 2A.2 Local Field State

## Purpose

Wave 2A.2 adds a small local-only operational layer to Los's personal Turn OS.
It complements the authoritative paper board. It does not create an official
PDS record, client approval system, payroll system, or remote workflow.

This contract separates structural knowledge, daily authorization, personal
coordination, work evidence, inspection, property walk outcomes, and paper
reconciliation.

## State layers

| Layer | Question answered | Source |
|---|---|---|
| Property roster | What Units and sections structurally exist? | Reviewed roster source |
| Daily release | What section-trade scope did the property release today? | Confirmed release batch |
| Access | Can Los or a crew physically enter now? | Key/access observation |
| Assignment | Which Paint or Clean crew is personally recorded as responsible? | Los-confirmed assignment |
| Crew report | What did the responsible crew report? | Crew report recorded by Los |
| Los inspection | What did Los personally inspect? | Los-confirmed inspection event |
| Callback | What correction/reinspection remains? | Los-confirmed callback event |
| Property walk | What did the property contact accept, defer, or return? | Walk-session outcome |
| Paper review | What has Los personally reconciled to the authoritative board? | Explicit paper-review event |
| Payroll | Out of scope | Never derived by Turn OS |

No layer may silently imply a later layer.

## Additive local collections

All records are scoped to a project/property. Account ownership continues to use
the existing local cache owner. These collections remain local-only in Wave
2A.2 and are preserved through the existing local save and JSON backup paths.
They are not added to Supabase.

### DaySession

Required fields:

- `id`
- `projectId`
- `date`
- `startedAt`
- `startedBy`
- `propertyContact`
- `keyStatus`: `yes`, `no`, or `partial-issue`
- `releaseBatchIds`
- `activePaintCrewIds`
- `activeCleanCrewIds`
- `morningNote`
- `status`: `not-started`, `active`, `ending`, `closed`, or `reopened`
- optional `endedAt`
- optional `endKeyStatus`
- optional `paperReviewConfirmedAt`
- optional `propertyCheckInNote`
- optional `endNote`
- `createdAt`
- `updatedAt`

Invariant: at most one `active`, `ending`, or `reopened` Day Session may exist
for one project/account until an explicit recovery decision resolves it.

### DailyReleaseBatch

Required fields:

- `id`
- `projectId`
- `date`
- `propertyContact`
- `sourceType`: `camera`, `photos`, `file`, `paste`, or `manual`
- `sourceLabel`
- optional local source reference
- `status`: `draft`, `confirmed`, or `superseded`
- `items`
- `uncertainties`
- optional `confirmedBy`
- optional `confirmedAt`
- `createdAt`
- `updatedAt`

Each release item contains:

- `id`
- `unitId`
- `trade`: `paint` or `clean`
- `section`: `common`, `A`, `B`, `C`, `D`, or `E`
- optional restriction
- original source line or excerpt

Invariant: only items in a confirmed release batch are assignable.

### TodayTask

TodayTask is a personal prioritization record, not an official assignment.

Required fields:

- `id`
- `projectId`
- `daySessionId`
- `date`
- optional `unitId`
- optional `trade`
- optional `section`
- `kind`
- `title`
- `slot`: `current`, `next`, `backup`, or `queue`
- `status`: `planned`, `in-progress`, `completed`, or `deferred`
- `createdAt`
- `updatedAt`

### FieldEvent

Required fields:

- `id`
- `projectId`
- optional `daySessionId`
- optional `unitId`
- optional `section`
- optional `trade`
- `actorType`
- `actorId`
- optional `reportedBy`
- optional `occurredAt`
- `recordedAt`
- `recordedBy`
- `sourceType`
- optional `sourceId`
- `eventType`
- `summary`
- `boundary`: `personal-record`, `property-reported`, `paper-mirror`, or
  `official-external-reference`
- optional `reversesEventId`

Invariant: `recordedAt` is always the time Los recorded the event. It is never
presented as the actual work time unless `occurredAt` is separately known.

### WalkSession

Required fields:

- `id`
- `projectId`
- `daySessionId`
- `propertyContact`
- `startedAt`
- `startedBy`
- `selectedItemIds`
- `outcomes`
- `status`: `active` or `closed`
- optional `endedAt`
- optional `note`
- `createdAt`
- `updatedAt`

Each selected item identifies one Unit, trade, and section that was Los-passed,
not blocked, not already property accepted, and still pending property walk.

Each outcome is one of:

- `accepted`
- `correction-requested`
- `not-walked`
- `deferred`

`accepted` records a personal property-walk outcome. It does not create an
official signature, submit a form, change payroll, or reconcile paper.

`correction-requested` creates callback/reinspection work and preserves the
responsible crew.

## Derived projections

Do not persist totals that can be derived from confirmed records:

- Working
- Waiting
- Crew reported complete
- Needs Los inspection
- Sections inspected
- Callbacks open/resolved
- Ready to walk
- Property accepted
- Crew current-assignment counts
- Crew history/statistics
- Progress percentage
- End Day summary

Derivation avoids stale counters and hidden scoring.

Recommended progress projection:

- Scope: confirmed release items for the active Day Session
- Metric: sections
- Milestone: Los inspected
- Actual: unique released section-trade items with a current Los-pass event
- Target: unique confirmed released section-trade items

## Consequential transition guards

- Roster presence cannot create release authorization.
- Key or access possession cannot create release authorization.
- Release cannot create assignment.
- Assignment cannot create working or crew completion.
- Crew completion cannot create Los inspection.
- Los inspection cannot create property acceptance.
- Property acceptance cannot create a personal PDS Approved mirror without a
  separate explicit confirmation.
- A personal PDS Approved mirror cannot create paper reconciliation, payroll,
  payment, or official form submission.
- Callback does not imply paid added scope.
- Undo creates a reversing event; it does not erase history.

## Persistence and migration

- Add collections with empty-array defaults.
- Preserve every existing collection and record.
- Keep the existing storage key.
- Add strict backup validation for every new record.
- Preserve new local-only collections across local/remote merge by spreading
  existing local AppData; do not add remote table configuration.
- Do not write Supabase migrations.
- Do not convert existing Unit statuses, assignments, notes, photos, or Activity
  into field events automatically.
- Demo/synthetic records may be created only through explicit Demo actions or
  tests, never as fallback for unavailable real data.

## Moon Tower boundary

This contract does not define the meaning of a slash, X, circle, weekly color,
PDS Approved grain, bedroom direction, or payroll event for Moon Tower.
Inspire observations may be shown as labeled source evidence only. Paper remains
authoritative.
