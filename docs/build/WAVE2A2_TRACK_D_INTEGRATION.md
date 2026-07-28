# Wave 2A.2 Track D Integration Contract

Status: feature-local bounded repair complete; shared-shell integration not performed
Base: `20acfab750c53c889edf981ca5a944dff1f388db`
Owner: Track D — intake, visible Activity, operational tools

## Boundary

Track D exports reusable React surfaces and pure projections from:

`src/features/wave2a2-track-d/index.ts`

It does not import, mutate, persist, sync, or migrate `AppData`. The integration
owner supplies current records through props and receives explicit user-confirmed
requests through callbacks. This preserves these distinctions:

- Property roster is not today's released work.
- Released is not assigned.
- Crew reported complete is not Los inspected.
- Los inspected is not property accepted.
- Digital reconciliation is not payroll.
- Official paper remains authoritative.

No shared shell, route, schema, migration, sync, service worker, global style, or
existing Track A/B/C file is changed by this slice.

Feature-local read-only adapters are available for the current repository model:

- `selectTrackDUnitOptions(data)`
- `selectTrackDProfileSummary(data)`
- `projectTrackDActivityFromAppData(data, explicitContextByActivityId)`

The Activity adapter uses active-project records and direct Unit/photo links. It
does not infer actor, source, category, authority, work status, inspection, or
acceptance. Those remain explicit integration inputs.

## Source-first Import

Export: `SourceFirstImport`

Source priority is fixed:

1. Take Photo
2. Choose Photos
3. Choose File
4. Paste Text
5. Enter Manually

The host supplies:

- an explicit attachment-permission label and `canAttach` decision;
- `existingUnitNumbers`
- optional starting import kind
- `onConfirm(confirmedImport)`

`onConfirm` fires only after Los:

1. attaches or enters a source;
2. reviews the editable vertical preview;
3. resolves duplicate/existing/missing Unit conflicts;
4. checks the explicit review statement; and
5. presses **Confirm reviewed intake**.

The callback includes:

- import kind (`property-roster` or `daily-release`);
- original source metadata;
- the original in-session `File` objects where applicable;
- optional transcription method (`paste` or `manual`) when an attachment was
  transcribed without extraction;
- only non-excluded reviewed rows; and
- confirmation time.

Conflict validation is import-kind aware:

- property-roster imports reject Units already present in the supplied roster;
- daily-release imports accept known roster Units and reject unknown Units;
- duplicate source rows and missing Unit numbers remain explicit in both flows.

### Required host behavior

The integration owner must durably preserve the original source attachment or an
approved source reference before treating confirmation as successful. If source
storage fails, reject the callback promise. The Track D screen will retain the
reviewed source and display a failure.

Camera, Photos, and File remain disabled when `canAttach` is false. Paste Text
and Enter Manually remain separate source options; the host still owns its
broader personal-data policy.

CSV and pasted text use deterministic parsing only. Unlabeled or unsupported
values become visible uncertainties. Image and PDF sources show:

> Source attached — extraction not yet available.

They do not create rows. The user may then Paste Text or Enter Manually. No OCR,
image extraction, AI, release, assignment, approval, or payroll state is
introduced.

When Paste Text or Enter Manually follows an attached image/PDF, Track D keeps
the original source reference and the exact original `File` objects. The typed
text is labeled as transcription rather than extraction. Paint and Clean scope
remain independently editable during review. After the host resolves a
successful `onConfirm`, the reviewed intake locks against duplicate submission;
Los must choose **Start a new intake** before another confirmation.

## Direct Note

Export: `DirectNoteFlow`

The flow starts blank. An unsaved note can be restored only through the explicit
**Resume** action supplied by `resumableNote`. Save sends exact wording, optional
Unit context, and recorded time to `onSave`.

The host must:

- perform the durable local save;
- append the resulting confirmed personal Activity record;
- link Unit history when a Unit is supplied;
- link the current day-session timeline when one exists; and
- return `{ recordId, message: "Note saved" }`.

The component then exposes **View** and **Undo** callbacks. It never opens legacy
Capture, Drafts, Apply, or Daily Log.

## Direct Photo

Export: `DirectPhotoFlow`

Camera and Photos use native file inputs. The flow keeps the chosen file in
memory, shows a local preview, accepts optional Property/Unit/Paint-or-Clean/
section/caption context, and calls `onSave` only after **Save photo**.

`initialFile?: File` is the bounded Plus integration seam. When the shared
Central Plus Camera/Photos owner has already returned an image, pass that exact
`File` while mounting the flow and Track D opens directly in preview. Camera and
Photos picker buttons remain available as fallback. `initialFile` is initial
mount input; remount/key the flow for a later distinct picker handoff.

The host must:

- supply explicit `canSelect`, `canSave`, and human-readable permission state;
- enforce the recorded photo/storage permission boundary;
- durably store photo bytes through the existing approved photo pipeline;
- append confirmed Activity and applicable Unit/day-session references;
- reject the promise when bytes or metadata cannot be saved; and
- return `{ recordId, message: "Photo saved" }`.

The component performs no cloud-AI upload or image analysis.

## Activity

Exports:

- `ActivitySurface`
- `projectLegacyActivityRecord`
- `filterTrackDActivity`

Activity requires explicit:

- recorded date/time;
- actor;
- optional Unit;
- optional Paint/Clean and section;
- action;
- source;
- personal-record or official-reference boundary;
- category; and
- summary.

Unknown actor or source stays `Not recorded`. A record with
`state: "proposal"` is excluded. Legacy `DraftAction` Activity defaults to
proposal unless the integration host explicitly supplies `confirmed: true`;
ordinary legacy Activity remains recorded by default. Visible cards render
Action, Source, and personal/official Boundary as separate labeled facts. The UI
labels time as the time Turn OS recorded the item and does not invent an
occurrence time.

Every visible item calls `onOpenRecord(recordId)`. The host must route that ID to
the exact underlying record.

## Official PDS Forms

Export: `TrackDOfficialFormsSurface`

The only destinations are:

- Change Order Approval — `https://pds.jotform.com/251384128606962`
- Backup Safety Submission Box — `https://pds.jotform.com/231955109224959`
- Turn Sign-Off Form — `https://pds.jotform.com/251946815029968`

They open externally with `noopener noreferrer`. Track D does not prefill,
submit, sign, store QR codes, expose W-9/paycard links, or scrape completed
forms.

## More, Profile, and Privacy

Exports:

- `TrackDMoreSurface`
- `TrackDProfileSurface`
- `TrackDPrivacySurface`

`TrackDMoreSurface` requires an explicit `availability` map. A destination not
marked available is visibly disabled and does not call navigation. This prevents
unwired rows from pretending to work.

Privacy expects independent records for:

- Development mode
- Local storage
- Synced storage
- AI processing permission
- Photo permission
- Contact/phone permission

Missing values render `Not recorded`; Track D never infers permission from
browser capability or app mode.

## Reports and Proof

Export: `TrackDReportsAndProof`

All counts are derived from supplied record-ID arrays. Every project summary
card calls:

`onOpenRecords(metricId, exactRecordIds)`

Optional crew summaries call:

`onOpenCrewRecords(crewId, category, exactRecordIds)`

The surface does not estimate, synthesize, or aggregate unlinked operational
truth. It does not claim time saved or calculate payroll.

An explicitly supplied empty array is a verified zero and remains tappable with
an empty exact-record list. An omitted dataset is unavailable, disabled, and
renders `Not connected` by default or the host-supplied status such as
`Not recorded`; it is never converted into a false zero.

## Styling and accessibility

Track D owns only feature-local styles.

- Namespace: `w2a2d-*`
- consumes Track A `--turn-color-*` semantic tokens, with bounded matching
  light/dark fallbacks for isolated rendering
- WCAG AA fallback contrast for normal primary, secondary, accent, status, and
  destructive text pairs
- 44-pixel minimum filter, receipt, and critical interactive targets
- 16-pixel form controls to avoid iPhone input zoom
- light, dark, system, and reduced-motion behavior
- safe-area bottom padding
- focus-visible treatment
- a focus-trapped, focus-restoring optional sheet primitive
- no horizontal import table
- import rows use `content-visibility` for 400–500-row review
- wrap-safe layouts at 320-pixel width
- `TrackDPage` is a non-landmark container so it can render inside the shared
  shell's single `<main>` without nested-main semantics

## Feature-local verification surface

`src/features/wave2a2-track-d/preview.html` is a synthetic, non-registered
browser fixture. `tests/wave2a2-track-d-browser.mjs` starts it directly through
Vite and verifies:

- 320, 390, and 430-pixel iPhone widths, iPad landscape, and Mac;
- light and dark token consumption, AA contrast, and no horizontal overflow;
- exactly one outer `<main>` and no nested `<main>`;
- image/PDF attachment → Paste Text provenance retention;
- editable Paint/Clean review and one-shot durable confirmation locking;
- Central Plus preselected-photo preview with fallback pickers;
- DraftAction proposal exclusion plus explicit Action/Source/Boundary labels;
- report missing-versus-explicit-zero rendering; and
- exact 44-pixel Activity filter, record, receipt, and other marked critical
  targets.

This test is intentionally invoked directly. `package.json`, the shared test
manifest, and a registered app route remain reserved integration seams.

## Integration sequence

The shared integration owner should:

1. import Track D only from its feature index;
2. build explicit AppData adapters outside this folder;
3. connect source persistence and existing photo durability first;
4. replace the legacy Import route with `SourceFirstImport`;
5. connect Plus → Note and Plus → Camera/Photos directly;
6. project confirmed Activity into `ActivitySurface`;
7. replace More/Profile/Privacy/Reports surfaces;
8. expose Official PDS Forms under More → Work;
9. route every report and Activity click to exact records; and
10. rerun full physical iPhone Safari/PWA acceptance.

For Camera/Photos, the shared Plus owner should pass its selected `File` through
`initialFile`; it should not invoke Track D's fallback picker a second time.

Do not merge Track D by copying its local models into shared persisted types.
The local types are view/input contracts, not a schema proposal.
