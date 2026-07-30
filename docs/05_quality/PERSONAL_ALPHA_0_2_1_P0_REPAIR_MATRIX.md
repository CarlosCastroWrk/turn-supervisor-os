# Personal Alpha 0.2.1 P0 Repair Matrix

Date: 2026-07-30

Repair branch: `repair/personal-alpha-0.2.1-truth-survives-night`

Accepted Alpha 0.2 base: `5057e87f38ac36c4336aba903c02e4b900c1096b`

Implementation commit: `4766e26`

Scope: Los's personal, local-first Turn OS Alpha. The paper production/payroll
sheet remains authoritative. This repair adds no company workflow, official
approval, payroll behavior, AI, OCR, Whisper, Kimi, analytics, portal,
Supabase activation, migration, or production change. Automated scenarios use
synthetic data only.

## P0 outcome

| Approved P0 | Release invariant | Evidence | Result |
| --- | --- | --- | --- |
| P0-1 — project truth survives End Day | Confirmed released Paint/Clean section-trades and their assignment, crew report, Los inspection, callback, and property outcomes remain project truth after the originating Day closes. A new active Day controls writes, not historical visibility. | `personal-alpha-0.2.1-p0.test.ts`; canonical projection contracts; production-preview reload scenario | **PASS.** Day 1 Ready-to-Walk/accepted truth remains visible and terminal on Day 2. Accepted work is explicitly ineligible for reassignment. |
| P0-2 — midday release joins the active Day atomically | A manual release is validated against the current roster and active project's one open Day. The batch, `releaseBatchIds` link, and `daily-release-confirmed` event persist in one immediate commit. | P0 deterministic retry/no-Day tests; production-preview selection, receipt, local-storage check, and reload | **PASS.** No open Day creates no batch. Failure creates no success receipt. Retry reuses one batch ID and cannot duplicate batch, link, or event. |
| P0-3 — End Day and recovery fail closed | End Day cannot close over an active Walk, and no close receipt appears before durable storage. Fatal local-data validation mounts recovery before sync or the operational shell. | End Day contracts; production-preview active-Walk guard; 320 px dark recovery/export/restore scenario | **PASS.** The guard exposes Return to Active Walk, End Walk, and Cancel End Day. Recovery exports the exact preserved raw payload and exits only after strict validation, persistence, and readback. |

## Read and write boundaries

- Project truth reads all confirmed release batches referenced by a same-project
  Day Session, plus same-project field events ordered by `recordedAt` and stable
  event ID.
- Today’s Task remains scoped to the active Day Session's exact
  `releaseBatchIds`.
- New field events remain stamped to the one active Day Session.
- A new Walk belongs to the active Day, but may select previously released,
  still-eligible project work. An existing Walk keeps its original Day lineage.
- Orphan release batches are not projected as project truth.

This is the key repair boundary: the active Day is the write ledger page; the
project projection is the full ledger.

## Recovery classification

| Stored-data condition | Startup behavior |
| --- | --- |
| Valid data | Open the operational app normally. |
| Recoverable lifecycle/timestamp/list inconsistency | Load the records, show a visible validation warning, and avoid rewriting the original payload merely because startup normalized it. |
| Invalid JSON, record shape, duplicate stable IDs, cross-project ownership, impossible authority claim, invalid embedded photo, or unusable active project | Preserve the exact raw payload, block writes, and mount dedicated Recovery Mode before sync or operational UI. |

Recovery Mode provides:

- exact raw-payload export with capture/export timestamps, storage key, release
  SHA, app label, and validation details;
- strict JSON backup restore with signed-in sync blocking, local-owner unlink,
  direct persistence, strict readback validation, and no false success receipt;
- an explicit two-step Reset Demo action;
- light/dark/system-compatible, narrow-screen-safe presentation that does not
  render the raw payload into the page.

The app requests browser persistent storage when supported. A denied or failed
request remains honest best-effort storage and shows a backup warning.

## Release-gate hardening

- `test:supervisor-loop` now runs the previously orphaned deterministic `.mjs`
  integration, quarantine, Track A/B/C, phase-2 Walk, launch, and setup
  contracts together with the P0 repair contract.
- `test-manifest.test.ts` now covers committed `.test.ts`, `.test.mjs`, and
  `*contract.mjs` files across `test:sync` and `test:supervisor-loop`.
- `test:personal-alpha-p0-browser` targets a supplied host URL and verifies that
  the page is a production bundle rather than Vite development output.
- Strict backup validation now permits a Day 2 Walk to use eligible Day 1
  release scope while still rejecting orphan, cross-project, draft, or
  unconfirmed release items.

## Verification evidence

| Gate | Result |
| --- | --- |
| `npm run lint` | **PASS.** |
| `npm run build` | **PASS.** Vite reports the pre-existing non-blocking large-chunk warning. |
| `npm run test:supervisor-loop` | **PASS — 97/97.** |
| `npm run test:wave2a21-field-activation-browser` | **PASS.** Full synthetic Moon Tower setup, failed-save retry, 80 Paint/Clean assignments, inspection, callback/reinspection, Walk reload/close, End Day receipt, history, and backup export. |
| `PDS_BASE_URL=http://127.0.0.1:4174 npm run test:personal-alpha-p0-browser` against `vite preview` | **PASS.** 390 px light operational flow and 320 px dark recovery flow have no horizontal overflow. |
| Browser-plugin smoke against `vite preview` | **PASS.** Pre-Start-Day manual release is visibly blocked with the required wording. |
| Full `npm run test:sync` suite | **PASS — 388/388.** |
| `git diff --check` | **PASS.** |

## Production and rollback boundary

- No push, merge, deployment, remote migration, environment change, or
  production-data action was performed.
- The protected Alpha and production Vercel deployments were not changed.
- Package dependencies and lockfile contents were not changed. A clean
  lockfile install was used only inside this isolated worktree because the
  baseline dependency folder contained macOS conflict-copy type packages.
- Personal Alpha 0.2 at
  `5057e87f38ac36c4336aba903c02e4b900c1096b` remains the rollback base.

## Remaining physical acceptance

The automated repair gates do not replace physical iPhone Safari/PWA and
VoiceOver acceptance. Those checks remain required only after Los separately
authorizes a deployment candidate. This task stops at local commits.
