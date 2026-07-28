# Wave 2A.2 Integration Ledger

## Release boundary

Wave 2A.2 is a non-AI, non-production release candidate for Los's personal Turn
OS. It must make the existing product operationally coherent without becoming an
official PDS, property, approval, payroll, or messaging system.

Paper remains authoritative.

Explicitly excluded:

- Kimi, Turn Chat intelligence, OCR, image extraction, Whisper, or any model
  provider
- Production deployment or production data
- Remote database migrations
- Payroll, payment eligibility, official signatures, or official-system
  automation
- Automatic messages, form submission, property acceptance, or paper-board
  mutation

## Verified baseline

- Source worktree:
  `/Users/los/Documents/PDS-wave2a1-native-interaction`
- Source branch: `codex/wave2a1-native-interaction`
- Accepted commit: `20acfab750c53c889edf981ca5a944dff1f388db`
- Protected Preview:
  `https://turn-supervisor-5111f8kr6-carloscastrowrk.vercel.app`
- Preview deployment: `dpl_CJFJ6ytS6WfeE4Nfigi9zE2xMxMv`
- Preview state: protected, non-production, READY
- Baseline verification:
  - lint passed
  - deterministic suite passed: 331/331
  - production build passed
  - Wave 2A.1 integrated browser gate passed
  - Wave 2A.1 Track C and Track D browser gates passed

The source worktree contains one pre-existing user-owned untracked file:
`tests/turn-command-bar-browser 2.mjs`. It is not part of the accepted commit and
must not be deleted, edited, or absorbed.

## Worktrees and ownership

| Track | Branch | Worktree | Owned work |
|---|---|---|---|
| Integration | `codex/wave2a2-operational-cohesion` | `/Users/los/Documents/PDS-wave2a2-operational-cohesion` | Shared wiring, AppData integration, migrations, routing, global guards, final Preview |
| A | `codex/wave2a2-track-a-theme-shell` | `/Users/los/Documents/PDS-wave2a2-track-a` | Theme, shell, navigation, scroll, route cohesion |
| B | `codex/wave2a2-track-b-day-task` | `/Users/los/Documents/PDS-wave2a2-track-b` | Day Session, daily release, Today's Task, progress, event contracts |
| C | `codex/wave2a2-track-c-field-ops` | `/Users/los/Documents/PDS-wave2a2-track-c` | TurnBoard, crews, assignment, walk SOP, paper mirror |
| D | `codex/wave2a2-track-d-intake-activity` | `/Users/los/Documents/PDS-wave2a2-track-d` | Import, direct notes/photos, Activity, forms, More, reports, route audit |

## Field-truth invariants

The following states must remain independently represented:

1. Property roster
2. Property release authorization
3. Access or key possession
4. Crew assignment
5. Working
6. Crew-reported completion
7. Los inspection
8. Callback or reinspection
9. Property walk acceptance
10. Personal paper-board reconciliation
11. Payroll processing, which is out of scope

No whole-Unit `Done` action may collapse those layers.

Inspire evidence may inform labels and examples, but no Inspire paper mark,
weekly color, bedroom direction, or approval grain may be hard-coded as Moon
Tower truth.

## Baseline audit findings

1. The active app uses multiple independent light/dark token families.
2. `src/styles.css` is light-only at the root and includes legacy route styles.
3. Search and Notifications render outside the main shell.
4. Unit filters, Unit personal detail, Issues, Review, Assignments, Daily Log,
   Training, Sync diagnostics, and Backup still mount legacy views.
5. Import Work opens the old assignment-oriented form.
6. The current Plus sheet visually exposes too much of the underlying page.
7. Several retained styles contain controls below 44px and mobile input text
   below 16px.
8. Theme color is currently hard-coded in `index.html`.
9. The AppData source adapter intentionally exposes only Unit identity because
   section-level field truth is not persisted yet.
10. Capture has one overlay owner and legacy `#/copilot` normalization; that
    safeguard must remain.

## Integration waves

| Wave | Contents | Status |
|---|---|---|
| A | Theme, shell, routes, scroll, direct note/photo, More/Profile/Privacy, official forms | In progress |
| B | Day Session, roster/release split, Today's Task, progress, event metadata | Pending |
| C | TurnBoard, Common/A-E, crews, bulk assignment, walk SOP, paper mirror | Pending |
| D | Roster/release import, source attachment, reports, final audit | Pending |

Each implementation track requires a fresh independent read-only review with one
of these dispositions before integration:

- `ACCEPT`
- `ACCEPT WITH BOUNDED REPAIR`
- `REJECT`

## Hard stops

Stop before:

- any destructive or remote migration
- production deployment or production data access
- any credential, API key, AI/model, OCR, or Whisper integration
- payroll, payment, official signature, or official form automation
- a shared-file collision between active tracks
- data loss that cannot be recovered through the existing backup path
- a high-severity security finding introduced by this wave

## Current state

The integration branch is based on the accepted commit. Track A and Track D are
the first parallel implementation pair. Track B and Track C do not start until
Wave A has been reviewed, integrated, and verified.
