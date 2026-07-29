# Wave 2A.2.1 Track A Host Integration Contract

## Boundary

Track A is an integration-ready package, not a wired application flow. The
later single integration agent owns `LaunchIntegratedApp`, routing, global
`AppData`, durable local persistence, and final runtime proof. This Track A
repair does not change any of those shared surfaces.

The paper TurnBoard remains authoritative. Track A does not calculate payroll,
record official approval, accept property work, mutate paper, submit a form, or
write remote/Supabase data.

## Required host wiring

### 1. Five-step project setup

Mount `ProjectSetupFlow` as a controlled component and retain all of these host
values until activation is durably acknowledged:

- `currentStep`
- `draft`
- `activationErrors`
- overwrite confirmation state

The host must implement the component callbacks for step changes, draft
changes, contact add/remove, and activation. It must not infer activation from
the component button alone.

### 2. Preparation and persistence acknowledgement

Use this exact sequence:

1. Adapt the latest host snapshot with `adaptAppDataForTrackA`.
2. Call `prepareProjectActivation(latestSnapshot, draft)`.
3. If preparation fails, keep the source snapshot and draft mounted and show
   the returned validation errors.
4. If preparation succeeds, call
   `persistPreparedProjectActivation(prepared, persistenceCallback)`.
5. The persistence callback returns `true` only after the candidate `AppData`
   is durably saved. A `false` return or throw is a failed activation.
6. On persistence failure, do not install the candidate in global state, do
   not navigate, do not show a success receipt, and do not publish Activity.
   Retry from `result.retry.sourceData` and `result.retry.draft`.
7. Only a result with `ok: true`, `stage: "persisted"`, and
   `receipt.acknowledgement: "durable-save-succeeded"` permits the host to
   install `result.data`, navigate, and show activation success.

The host must preserve `propertyContacts` and each project's
`fieldConfiguration` through local save, reload, export, and restore. This
slice adds no remote table or sync behavior.

### 3. Eight-step live Start Day

Mount one live Start Day flow using `START_DAY_EIGHT_STEP_CONTRACT` in this
visible order:

1. Confirm project and day
2. Confirm property contact
3. Confirm keys and access
4. Review today's confirmed release
5. Confirm active Paint and Clean crews
6. Review hours and walkthrough defaults
7. Add an optional morning note
8. Review and Start Day

Resolve configured values with `resolveStartDayValues`. Preserve each wrapped
value and its `source` through the live flow. Pass the unwrapped values into
the accepted Day Session/Start Day model without changing their source:

- `saved-project-default`
- `today-only-override`

Today-only overrides must not silently rewrite the saved project
configuration.

### 4. Today destination and canonical projection

Add one host-owned Today route/destination that mounts `TodayTaskDetail`.
Provide:

- one `CanonicalFieldProjection` from
  `buildCanonicalFieldProjectionFromAppData`;
- the resolved Start Day values with provenance;
- queue navigation for Working, Waiting, Callbacks, and Ready for property
  walk;
- navigation back to the eight-step Start Day review.

Use the same canonical projection for Today counts, progress, crew current
work, Units touched, and Activity. Do not recompute competing counts in the
host.

### 5. Profile and Privacy scroll ownership

Mount each real Profile and Privacy detail body inside its own
`ProfilePrivacyScrollRegion`. The shared shell must provide height containment
without adding a second vertical scroll owner around that detail region.
Verify each route can scroll independently and retains the correct
`data-detail-scroll-owner`.

### 6. Activity

After durable activation succeeds, the persisted `project-activated`
`FieldEvent` may be projected through `adaptDurableFieldEventsToActivity`.
Before durable acknowledgement, the prepared event must not appear as
Activity or as an activation receipt.

## Integration acceptance proof

The later integration agent must prove the live host path, not only the
package harness:

- complete and navigate all five controlled setup steps;
- force durable-save failure and show no success while the draft remains
  retryable;
- retry successfully, reload, and retain project configuration and contacts;
- complete all eight Start Day steps;
- open the Today task destination and each queue;
- show mixed saved-default/today-only provenance truthfully;
- render counts and Activity from one canonical projection;
- independently scroll Profile and Privacy;
- show the activation Activity event only after persistence acknowledgement;
- retain the paper-authoritative, no-payroll, and no-official-approval copy.
