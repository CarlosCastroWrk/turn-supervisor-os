# Phase 2 Track B Final Repair Coverage

This note maps the final Track B launch-blocker repair to focused proof. It does
not authorize integration, deployment, or any change outside Track B.

## Assign Work host connection

- `CrewView` exposes one `Assign work` action on crew detail.
- `TrackCFieldOps` owns the transition and carries the selected crew into the
  assignment workspace.
- `#/assignments/:crewId` preserves the selected crew across reload and direct
  entry.
- Assignment eligibility remains the existing released-work validator. With no
  eligible released work, the action is disabled with the exact trade-specific
  explanation.
- Rapid confirmation remains idempotent and cannot append duplicate assignment
  events.

Proof: routing tests, Phase 2 Track B deterministic assignment tests, and the
actual-host plus focused-preview browser gate.

## Actual integrated-host assignment proof

The browser gate initializes a synthetic project through the actual host's
Setup, Release, and Start Day screens. It does not use the Track B preview or a
component harness for the successful-assignment path.

| Requirement | Host entrypoint | Durable route / boundary | Visible proof and reload check |
| --- | --- | --- | --- |
| Paint assignment | Actual host Crew Detail | `#/crews/:crewId` → `#/assignments/:crewId` → existing `fieldEvents` persistence | One released Common Paint section; one receipt, one assignment event, one canonical Activity item; Crew Detail, TurnBoard, Search, Back/Forward, and reload agree. |
| Clean assignment | Actual host Crew Detail | `#/crews/:crewId` → `#/assignments/:crewId` → existing `fieldEvents` persistence | One released Common Clean section; the same proof runs independently and does not alter the Paint result. |
| Eligible-work boundary | Actual host Crew Detail | Existing release validator | Exactly one matching released Unit is selectable per trade; no unreleased or opposite-trade work is offered. |
| Duplicate protection | Actual host proposal review | Existing confirmation idempotency boundary | Two immediate confirmation attempts produce one persisted assignment and one Activity event. |
| Empty state | Actual host Crew Detail | Existing release validator | Paint and Clean each render their exact trade-specific no-released-work message and disable Assign work. |
| Canonical views | Actual host TurnBoard, Activity, and Search | Existing projections from persisted field events | TurnBoard shows the assigned crew/state; Activity shows `Crew assignment confirmed`; Search resolves the crew after assignment. Assignment-only events intentionally create no notification. |

The gate keeps one released section per trade so an exact event count is
meaningful. Callback preservation, Additional Scope compatibility, stale and
incompatible payload rejection, and 500-Unit behavior remain covered by the
focused deterministic Track B tests; they are not simulated by the host fixture.

## Callback responsibility history

- Current responsibility remains a projection of active assignment events.
- Callback history is reconstructed separately from confirmed immutable events.
- The callback-open event snapshots the responsible crew ID and the active
  assignment event ID at that moment.
- Clearing or replacing current responsibility does not rewrite the historical
  callback record.
- Unit History and canonical Activity retain confirmed field events, and backup
  and restore preserve those source events.

Proof: adversarial callback clear/reassign test, Unit History test, canonical
Activity regression suite, and backup/restore assertion.

## Additional Scope category/trade safety

- One shared compatibility matrix controls the UI, draft creation, and final
  commit boundary.
- Full Paint and Doors are Paint; Bathtub Clean is Clean; Drywall Repair is
  trade-neutral; Other requires an explicit Paint, Clean, or trade-neutral
  choice.
- A tampered or stale incompatible record fails before the durable callback is
  invoked.

Proof: compatibility-matrix tests, final-persistence adversarial test, and the
browser form gate.
