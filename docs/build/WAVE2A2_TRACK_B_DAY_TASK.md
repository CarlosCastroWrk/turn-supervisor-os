# Wave 2A.2 Track B — Day Session and Today’s Task

Status: isolated feature complete; host integration intentionally not started.

## Purpose

Track B adds a feature-local, personal Day Session foundation for Los. It separates the
property’s structural roster from the work the property explicitly releases for a given
day, then derives a precise Today’s Task from confirmed release evidence.

This feature does not update paper, property, approval, payroll, or other official records.
The official paper TurnBoard remains authoritative.

## Feature API

The public API is exported from:

`src/features/wave2a2-track-b/index.ts`

It includes:

- `PropertyRoster`, `DailyReleaseBatch`, `DaySession`, event, Today’s Task, and queue types
- release validation and deterministic Today’s Task projection
- Start Day, End Day, progress, queue, recovery, and correction functions
- `DayTaskWorkspace`, `StartDayFlow`, and `EndDayFlow`
- bounded synthetic fixtures for a 500-Unit roster and 40-Unit daily release

The API is additive and owns no shared `AppData`, storage, sync, route, or schema contract.

## Roster and Release Boundary

### PropertyRoster

The roster describes structural knowledge:

- every known Unit
- Unit number
- Building and floor
- Unit type
- applicable sections
- Paint/Clean structural availability

Roster membership is not work authorization.

### DailyReleaseBatch

A daily release describes property-confirmed work:

- property and date
- contact/source and original source reference
- released Unit/section/trade records
- restrictions and uncertainties
- confirmation status
- confirmer and confirmation timestamp

Only a batch with `confirmationStatus: "confirmed"`, `confirmedBy`, and `confirmedAt`
may enter Today’s Task. Draft, rejected, wrong-date, and wrong-property batches do not.
Confirmed release entries that conflict with the roster fail loudly rather than inventing
Units, sections, or trade availability.

An active Today’s Task is projected from exactly `DaySession.releaseBatchIds`. The
projection rejects the entire selection when any selected ID is missing, duplicated,
unconfirmed, on the wrong property/date, duplicated in the supplied release records, or
does not match a previously recorded task. One valid release cannot hide one invalid
selected release. A recorded Today’s Task must also preserve each section’s exact
`releaseBatchId`; changing section-level release lineage is rejected even when the visible
Unit, section, and trade scope is unchanged.

Keys/access remain separate from release authorization.

## Day Session

Supported states:

- `not-started`
- `active`
- `ending`
- `closed`
- `reopened`

Only one active, ending, or reopened Day Session is allowed for a property/account.

### Start Day

The deterministic 10-step flow is:

1. Confirm property.
2. Confirm date.
3. Confirm property contact, exact working-hours wording, and exact walkthrough-schedule
   wording.
4. Confirm Start Day key/access observation.
5. Confirm today’s released work and record an assignment-evidence/review note. This
   documents Los’s review; it does not edit or create an assignment.
6. Confirm active Paint crews.
7. Confirm active Clean crews.
8. Add an optional morning note.
9. Review the exact wording and the derived goal.
10. Explicitly confirm Start Day.

No release means Start Day cannot silently create Today’s Task. A missing or partial key
observation produces an access warning but does not rewrite release authorization.

The Start Day review persists and displays:

- the assignment-evidence/review note
- exact working-hours wording
- exact walkthrough-schedule wording
- the optional morning note, or an explicit empty state
- the selected Paint and Clean crew names rather than count-only summaries
- a derived goal with scope `today-confirmed-release`, metric `sections`, milestone
  `los-inspected`, and a target equal to the physical-section count in the exact selected
  release set

Start Day rejects a manually supplied or stale goal whose target does not match that exact
Today’s Task.

### End Day

End Day produces a deterministic **section-trade-grain** operational summary for:

- released today
- assigned
- working
- crew reported complete
- inspected
- callbacks open
- callbacks resolved
- ready to walk
- property accepted
- waiting

Every operational count above represents a released `Unit + physical section + trade`
record. It is not a Unit count and is not the physical-section progress metric. Unresolved
identifiers and warning copy use the same section-trade grain.

Notes/photos are labeled separately as an **event count**. Their count includes only events
whose `propertyId` and `daySessionId` both match the Day Session being closed.

Unresolved released section-trades remain unresolved. Los can close his personal Day Session
after an explicit review, with a clear unresolved-work warning.

`keyStatus` preserves the Start Day key/access observation. End Day uses the separate optional
`endKeyStatus`; closing or reopening a Day Session never overwrites the opening observation.
The optional property check-in and end note are stored separately.

## Event and Timestamp Contract

Personal Day Session events include:

- `eventId`
- `propertyId`
- `daySessionId`
- optional Unit, section, and trade context
- actor, recorder, source, and event metadata
- optional `occurredAt`
- required `recordedAt`
- `personalOfficialBoundary: "personal-record-only"`
- optional reversal reference

`recordedAt` means when Turn OS recorded the event. It does not claim when field work actually
occurred. `occurredAt` remains optional and must come from a separately supported observation.

## Exact Progress and Home Filters

Progress uses one scope, metric, and milestone:

- Scope: today’s confirmed release
- Metric: physical sections
- Milestone: inspected by Los
- Actual: inspected released sections
- Target: all released sections

The synthetic 40-Unit release contains 112 physical sections. Its preview reports:

`48 of 112 released sections inspected by Los` (`43%`)

This physical-section progress metric intentionally differs from End Day’s operational
section-trade counts. A physical section with both Paint and Clean remains one progress
section but contributes two records to an End Day section-trade count.

Home filters are exact:

- **Working** — a released section with at least one trade in `working`
- **Waiting** — a released section with at least one explicit waiting reason
- **Callbacks** — a released section with `callback-required` or `reinspection-pending`
- **Ready to walk** — no waiting/open callback, every released trade passed Los’s inspection,
  and every released trade has the explicit property-walk state `pending`

Zero records produce a real empty state. No filter falls back to roster Units.

## Restore, Rollover, and Correction

- An active same-date session restores as the active day.
- An unclosed prior-date session requires an explicit choice:
  - Resume
  - Review and close
  - Reopen as correction
- A closed session may be reopened only through the correction function.
- No path silently creates another day.
- Opening `keyStatus` and optional `endKeyStatus` survive recovery unchanged.

## Synthetic Preview

Preview entry:

`/src/features/wave2a2-track-b/preview.html`

Scenarios:

- `?scenario=not-started`
- `?scenario=active`
- `?scenario=no-release`
- `?scenario=rollover`

The preview is visibly labeled synthetic and contains no real property or production data.
It exercises a 500-Unit roster and 40-Unit/112-section release.

## Integration Seams

The future integration owner must provide:

- property/account/date context
- persisted roster and confirmed release batches
- current Day Session and linked events
- Track C crew-assignment and walk destinations
- Track D source-first release import destination
- host persistence for Start Day, End Day, and recovery results
- Track A shared theme-token wiring and route transitions

`DayTaskWorkspace` exposes explicit external-action callbacks and receipt copy. It does not
pretend those host routes or persistence contracts exist.

## Explicit Non-Goals

Track B does not include:

- host `App.tsx` or primary-route integration
- shared `AppData`, storage, sync, schema, migration, Supabase, or service-worker changes
- AI, OCR, Whisper, Kimi, or fixture fallback as real data
- official work mutation, approval, payroll, or automatic messaging
- Unit/section assignment editing
- property walk mutation
- a whole-Unit Done state

## Focused Verification

Deterministic contracts:

```sh
node --experimental-strip-types --import ./tests/register-ts-loader.mjs \
  --test tests/wave2a2-track-b-contract.mjs
```

Feature-local browser preview:

```sh
node --experimental-strip-types --import ./tests/register-ts-loader.mjs \
  tests/wave2a2-track-b-browser.mjs
```

The browser gate covers 320/390/430px iPhone viewports, iPad landscape, Mac, no horizontal
page overflow, 44px critical targets, 16px text inputs, Start Day, End Day, exact queues,
no-release behavior, date rollover, synthetic render/interaction timing, and computed
actual-style Light-theme contrast of at least 4.5:1 for the primary CTA and warning copy.
