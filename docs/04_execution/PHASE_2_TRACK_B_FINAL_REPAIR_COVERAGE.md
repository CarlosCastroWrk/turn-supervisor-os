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
