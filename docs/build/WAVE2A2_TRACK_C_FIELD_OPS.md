# Wave 2A.2 Track C — Field Operations Feature

Status: isolated Track C candidate
Authority: Los's personal Turn OS record only
Host integration: not performed

## Outcome

This feature-local slice provides:

- compact TurnBoard Unit projections for iPhone, iPad, and Mac;
- structurally applicable Common/A–E detail only;
- independent Paint and Clean work panels and actions;
- confirmed-event Crew list/detail projections;
- conflict-aware bulk assignment proposal, review, and explicit confirmation;
- deterministic Start Walk and End Walk;
- exact trade/section property-walk outcomes;
- manual personal `PDS Approved paper mirror` after recorded property acceptance.

It does not modify the authoritative paper TurnBoard, submit an official form,
calculate payroll, store a legal signature, or present a whole-Unit completion
state.

## Field-truth boundary

The implementation preserves these as separate facts:

1. structurally applicable;
2. released;
3. assigned;
4. working;
5. crew-reported complete;
6. Los inspected/passed;
7. callback or reinspection;
8. property accepted;
9. personal digital paper mirror;
10. authoritative paper review;
11. payroll.

Black/not-applicable structure is represented by absence from a Unit's
`applicableSections`; it is never rendered as active scope. Unreleased,
source-uncertain, assignment-conflicting, access-blocked, maintenance-blocked,
and occupied/restricted scope remain distinct.

No paper mark is used as an application state. The UI uses configurable
terminology and semantic events, so Inspire-specific marks are not generalized
to Moon Tower.

## Feature API

The public feature surface is exported from:

`src/features/wave2a2-track-c/index.ts`

Primary integration:

```ts
<TrackCFieldOps
  initialState={trackCState}
  onStateChange={(nextState, reason) => {
    // Future integration adapter owns persistence.
  }}
  onCrewEditRequested={(crewId) => {
    // Future host route/modal seam.
  }}
  onCrewContactRequested={(crewId) => {
    // Future permission-aware contact seam.
  }}
/>
```

Pure contracts are also exported for host-owned integration:

- `projectTrackCWork`
- `searchTrackCCompactUnits`
- `projectTrackCCrewDetail`
- `createTrackCBulkAssignmentProposal`
- `confirmTrackCBulkAssignmentProposal`
- `projectTrackCWalkCandidates`
- `startTrackCWalk`
- `endTrackCWalk`
- `recordTrackCPersonalPdsMirror`

## Integration seams

The integration agent must provide adapters for:

1. property roster and structurally applicable sections;
2. confirmed daily release/source facts;
3. crew roster;
4. confirmed personal event history;
5. persistence and sync;
6. primary routing and shell placement;
7. crew Edit/Contact destinations;
8. official Turn Sign-Off Form access owned by Track D;
9. paper reconciliation flow.

The Track C component is intentionally initialized from a bounded
`TrackCState`. It emits the next feature state and a reason string; it does not
read or write shared `AppData`, storage, Supabase, or service-worker state.

## Bulk assignment safety

Bulk assignment is a two-step personal proposal:

1. review one compatible Paint/Clean crew against selected Unit sections;
2. explicitly confirm eligible personal assignment records.

Review warns and blocks:

- unreleased sections;
- duplicate active crews;
- access conflicts;
- occupied/restricted scope;
- maintenance blockers;
- uncertain/conflicting source evidence;
- crew/trade mismatch.

Confirmation reprojects every proposal item from the current state. If an item
became eligible or ineligible after review—such as a newer assignment, access
restriction, or source conflict—the entire confirmation is rejected and Los
must review again. This closes the stale-proposal/time-of-check-to-time-of-use
gap. The focused contract also proves atomic rejection when a later item in a
multi-item proposal becomes stale; no earlier item is partially assigned.

## Walk safety

Walk candidates require all of:

- confirmed release;
- confirmed responsible crew;
- Los pass;
- pending property walk;
- clear access;
- confirmed source;
- no assignment conflict;
- no callback;
- not already property accepted.

Each exact Unit/section/trade receives one outcome:

- Accepted
- Correction requested
- Not walked
- Deferred

Correction opens a callback and preserves the responsible crew. Acceptance only
makes the exact item eligible for a second, explicit personal paper-mirror
action. Neither action changes paper or payroll.

An active Walk's unsubmitted outcome choices are owned by the Track C shell, so
switching among Track C tabs does not discard Accepted/Correction/Not
walked/Deferred selections. Personal paper-mirror confirmation uses one modal
dialog owner with initial focus, Escape/cancel handling, and focus return.

## Preview and focused verification

Feature preview:

`src/features/wave2a2-track-c/preview.html`

Focused contracts:

```sh
node --experimental-strip-types --import ./tests/register-ts-loader.mjs \
  --test tests/wave2a2-track-c-contract.mjs
```

Responsive browser gate:

```sh
node --experimental-strip-types --import ./tests/register-ts-loader.mjs \
  tests/wave2a2-track-c-browser.mjs
```

The browser gate covers iPhone widths 320, 390, and 430, iPad landscape, and
Mac. It checks 44px targets, 16px text inputs, horizontal overflow, compact-row
density, Unit detail applicability, Crew detail-before-edit, assignment review,
active-Walk outcome preservation, and the accessible Walk/personal-mirror flow.

The contract gate includes a 500-Unit projection/search benchmark, stale
bulk-proposal cases, and atomic multi-item stale rejection.

## Known limitations

- Synthetic data is used only by the isolated preview and tests.
- No host persistence or offline adapter is wired in this track.
- Crew Edit and Contact are callbacks, not host routes.
- Property acceptance is a personal observation, not an official approval or
  legal signature.
- Official forms remain Track D responsibility.
- Paper reconciliation remains authoritative and requires host integration.
- Exact Moon Tower paper semantics remain evidence-gated and are not encoded.
