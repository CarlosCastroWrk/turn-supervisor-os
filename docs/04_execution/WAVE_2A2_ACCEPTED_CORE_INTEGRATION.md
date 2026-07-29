# Wave 2A.2 Accepted-Core Integration

## Candidate boundary

This record covers the host integration of the accepted Wave 2A.2 core only.
It remains Los's personal, local-first field companion. Official paper remains
authoritative. Nothing in this candidate performs payroll, official approval,
property acceptance, paper-board mutation, form submission, or automatic
messaging.

- Base: `20acfab750c53c889edf981ca5a944dff1f388db`
- Host-integration starting HEAD:
  `4e89edd9ab3024f04509c99d612d2c483c3722f7`
- Foundation accepted source HEAD:
  `234496ad1a388820afb9986810ce3a9b52b1cf58`
- Track A accepted source HEAD:
  `0acb3fc941ae3de76d926c8c959ba60a469c5476`
- Track B accepted source HEAD:
  `6dccf0bb6d9b346c9dfa761b9daef0c84a87f985`
- Track C accepted source HEAD:
  `9bbda7b91530d12a3f8a50a61cde87079e7949f6`

The accepted changes are represented in the candidate by these cherry-picked
commit ranges:

- Foundation: `234a622f` through `846c10b1`
- Track A: `c32ef2de` through `3e0adc15`
- Track B: `04a520b5` through `a25fd1bb`
- Track C: `0180a0d8` through `4e89edd9`

## Root architecture

`LaunchIntegratedApp` is the one active host. It mounts:

- the accepted Track A unified shell and System/Light/Dark theme;
- the accepted Track B Day Session and Today's Task workspace on Home;
- the accepted Track C field-operations workspace on TurnBoard;
- the existing Wave 2A.1 Capture, Plus, personal Note, Photo, Activity,
  Assignments/Import, Unit detail, backup, restore, and legacy tool routes.

One host-owned overlay boundary contains the existing Capture, Plus, and
Activity-detail owners. Track C keeps its one focused confirmation dialog and
reports that state to the host so the shared shell becomes inert.

The integration adapter projects accepted Foundation collections into the
Track B and Track C models and maps explicit confirmed changes back to:

- `daySessions`
- `dailyReleaseBatches`
- `fieldEvents`
- `walkSessions`

No schema or migration was added. Property roster, daily release, key/access,
crew assignment, crew-reported completion, Los inspection, callback,
property acceptance, and personal paper mirror remain separate.

## Manual Release fallback

The host-only fallback allows Los to manually review and select Paint/Clean
scope from Units and Common/A-E sections already present in the personal
roster. It:

- requires the property contact;
- requires explicit confirmation against the property's current release;
- rejects scope absent from the known roster;
- creates one confirmed local batch only after review;
- guards rapid double-confirm in the UI and de-duplicates the same batch ID at
  the host persistence boundary;
- makes no parsing, OCR, image-reading, or AI claim.

The existing Wave 2A.1 Assignments/Import route remains available and its
records are not replaced or migrated.

## Official external links

The approved Change Order, Backup Safety Submission Box, and Turn Sign-Off
destinations are visible under More. Each requires an explicit tap and opens
the external browser. Turn OS does not prefill, submit, validate, log, or store
form contents.

## Track D quarantine

The following rejected commits are excluded and are not ancestors of this
candidate:

- `05400b70edc2171192e90950a55da36e923e382b`
- `1c8f96d71cf6f14d9c23afe250f5ba0cc6b3e9ae`
- `0340218b7838bbda6f2af6a028985e2eebb8c721`
- `ecaa6006b966c04473d415f6d74cf1608fdbb9c1`

No Track D module, route, parser, direct Note/Photo saver, receipt matcher,
source-preservation implementation, write receipt, or test is used. No
AI/OCR/Whisper/Kimi/model-provider work began.

## Known limitations

- The release fallback is manual and roster-only; it cannot extract a paper,
  photo, PDF, spreadsheet, or pasted assignment source.
- The existing Assignments/Import route is preserved as-is and is not evidence
  of the rejected Track D integrity upgrade.
- Personal PDS Approved mirroring remains manual, non-official, non-payroll,
  property-walk dependent, and a reminder to reconcile paper.
- External PDS links are navigation only.
- Physical iPhone Safari/PWA acceptance remains required after automated gates.
- No production deployment, remote migration, real PDS data, or external-system
  write is authorized by this integration.
