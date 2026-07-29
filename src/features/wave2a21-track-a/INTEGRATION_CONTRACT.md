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

### 1. Five-step Project Setup

Mount `ProjectSetupFlow` as a controlled component and retain all of these host
values until activation is durably acknowledged:

- `currentStep`
- `draft`
- `activationErrors`
- overwrite confirmation state

The visible groups must remain exactly:

1. Property
2. Contacts and schedule
3. Property roster
4. Crews and permissions
5. Review and activate

Map existing accepted roster records into `ProjectRosterUnitOption`. The roster
review is not a Daily Release and must not release work. Pass the browser
camera-permission state as observed by the host; the component must not invent
or request permission. Advanced image/file import remains unavailable.

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
`fieldConfiguration` through local save, reload, export, and restore. Structured
time controls write the accepted
`defaultWorkingHoursWording`/`defaultWalkthroughScheduleWording` fields; this
slice adds no new persisted field, remote table, or sync behavior.

### 3. Four-screen Fast Start Day

Mount `FastStartDayFlow` using `FAST_START_DAY_STEPS` in this
visible order:

1. Day and access
2. Daily Release
3. Crews and defaults
4. Review and Start Day

The flow reuses the saved property, active Property Contacts, time defaults,
and active Paint/Clean crews. A contact, crew, or schedule change inside Start
Day is today-only and must not silently rewrite Project Setup.

For durable route restoration, the host may control the visible screen with:

```ts
currentStep?: number
onStepChange?: (step: number) => void
```

Derive `currentStep` from host route state and update that route from
`onStepChange`. Without those props, the component retains compatible internal
four-screen navigation. The controlled step changes only the visible decision
screen; it does not persist or confirm Start Day.

Keys use only `Received`, `Not received`, and `Partial / issue`. Key status is
access information, not work authorization.

`onStartDay` is the only write boundary. The host must:

1. Re-read the latest roster and active Day Session state.
2. Revalidate `submission.release` with
   `validatePreparedReleaseAgainstRoster`.
3. Reject if another Day Session is active or any accepted Phase 1 invariant
   fails.
4. Create one confirmed `DailyReleaseBatch`, one active `DaySession`, the
   required durable events, and any host-derived Today records in one candidate
   `AppData` snapshot.
5. Persist that complete candidate once.
6. Return `true` only after durable persistence succeeds.

A `false` return or throw means nothing started, nothing released, and no
Activity receipt may appear. Keep the component mounted for retry. The host
must unmount/navigate only after `true`.

### 4. Daily Release selection

`DailyReleaseSelector` starts with no Unit selected. Los must explicitly:

- select Units from the known Property roster;
- choose Paint, Clean, or Both within the enabled project trades;
- review structurally applicable Common/A–E sections;
- record only explicit section exceptions; and
- check the release confirmation.

All structurally applicable sections default into a selected Unit. An
unreleased or occupied/restricted exception removes only that section from the
personal release. An access issue remains visible as a restriction and does
not imply authorization. `createConfirmedDailyReleaseBatch` may run only after
the host revalidates the roster fingerprint.

Property roster, confirmed Daily Release, and Today’s Task are three separate
records. The selector does not create a task or mutate AppData.

### 5. Today destination and canonical projection

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

### 6. Profile and Privacy scroll ownership

Mount each real Profile and Privacy detail body inside its own
`ProfilePrivacyScrollRegion`. The shared shell must provide height containment
without adding a second vertical scroll owner around that detail region.
Verify each route can scroll independently and retains the correct
`data-detail-scroll-owner`.

### 7. Activity

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
- complete all four Fast Start Day screens;
- prove no Unit is released before explicit selection and confirmation;
- prove a stale roster prevents confirmation;
- force atomic Start Day persistence failure and show no Day Session, release,
  task, or Activity receipt;
- retry the same preserved Start Day draft successfully;
- open the Today task destination and each queue;
- show saved defaults and today-only changes truthfully;
- render counts and Activity from one canonical projection;
- independently scroll Profile and Privacy;
- show the activation Activity event only after persistence acknowledgement;
- retain the paper-authoritative, no-payroll, and no-official-approval copy.
