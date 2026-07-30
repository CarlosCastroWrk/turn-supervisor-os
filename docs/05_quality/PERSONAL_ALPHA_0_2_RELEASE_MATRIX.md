# Personal Alpha 0.2 Release Matrix

Date: 2026-07-30

Release branch: `release/personal-alpha-0.2`

Base: `3208ba961fd5146e35e67ef1dd286e2f17d11527`

Scope: Los's personal, non-production Turn OS Alpha. Paper remains
authoritative. This release performs no payroll, official PDS submission,
automatic property acceptance, AI/OCR/Whisper processing, or Track D write
behavior. All automated evidence uses synthetic data.

## Release outcome

Personal Alpha 0.2 resets the product around one supervisor loop:

Property release → Daily Release → Paint/Clean assignment → crew report → Los
inspection → callback/reinspection → Unit+Trade Ready to Walk → property walk
→ End Day → backup.

The application keeps these states separate:

- Property roster
- Daily Release
- Crew assignment
- Crew-reported completion
- Los inspection
- Callback/reinspection
- Property acceptance
- Official paper and payroll

## P0 release-blocker matrix

| P0 invariant | Primary evidence | Result |
| --- | --- | --- |
| Confirmed project, Unit, release, assignment, callback, Walk, Day, note, photo, and Activity records survive normal reopen/sync boundaries | 388-test deterministic suite; actual-host 50-step browser scenario; backup validation | **PASS.** Active Walk draft state, exact notes, assignment records, callbacks, accepted Walk outcomes, Day closure, and backup survive the exercised persistence boundaries. |
| Start Day never reports success before durable persistence | Start Day failure/retry contract and actual-host injected storage failure | **PASS.** The synthetic failed write creates no Day Session, release batch, or success Activity; the unchanged review retries successfully. |
| Unreleased work cannot be assigned | Field-activation contracts, assignment proposal validation, actual-host bulk assignment | **PASS.** Only the confirmed 10-Unit Paint/Clean release is eligible. |
| One physical Unit is not split into bedroom Unit records | Setup exact-Unit parser, activation checks, Unit-type derivation | **PASS.** Units 101–110 remain ten Units with Common/A/B/C derived for each 3BR Unit. |
| Crew completion, Los inspection, property acceptance, official paper, and payroll remain distinct | Canonical projection, Unit Detail, Walk tests, backup validation | **PASS.** Crew report produces Needs Inspection; section passes/callbacks precede Walk; property acceptance is recorded only through a closed Walk; no official or payroll mutation exists. |
| Ready to Walk cannot become true for partial Unit+Trade scope | Readiness formula tests and actual-host Unit 101 callback/reinspection path | **PASS.** An open callback blocks readiness. Paint becomes ready only after Common/A/B/C pass; Clean remains independent. |
| Activated personal project cannot mix with seeded/demo records | Setup activation, project-scope projections, reload checks | **PASS.** Moon Tower is active after reload and sample West Campus records do not appear in the personal flow. |
| Backup/export/restore remains valid | Backup/restore deterministic tests and actual-host JSON download | **PASS.** Alpha 0.2 records validate, export, and restore without relaxing failure checks. |
| The complete supervisor loop is executable | Actual-host 50-step synthetic scenario | **PASS.** Setup through backup completed with the exact required state transitions. |

## P1 supervisor-loop matrix

| P1 requirement | Evidence | Result |
| --- | --- | --- |
| Setup progress survives leaving, returning, and reload | Five-step Setup browser scenario and draft-store tests | **PASS.** Step 4 and ten drafted Units restore exactly. |
| Bulk Daily Release | Fast Start Day exact-unit flow | **PASS.** Units 101–110 release Paint and Clean as 80 section-trade targets only after review. |
| Bulk Paint and Clean assignment | Actual-host Assign Crews flow | **PASS.** Jose Paint and Los Clean each receive ten compatible Units; 80 unique assignment events persist once. |
| Unit Detail is compact and actionable | iPhone 320/390/430 screenshots and browser assertions | **PASS.** Trade-level crew ownership appears once, Common/A–E uses a compact accessible grid, bottom navigation is hidden, and there is no horizontal overflow. |
| Crew completion and inspection | Actual-host Unit 101 flow | **PASS.** Four Paint sections move to Needs Inspection, then Common/B/C pass while A becomes a callback. |
| Callback and reinspection | Actual-host Unit 101 flow | **PASS.** Original responsibility and history remain; correction-ready precedes reinspection; resolution is retained. |
| Ready-to-Walk discovery | Projection and Walk eligibility tests | **PASS.** Unit 101 Paint appears as one complete Unit+Trade package; individual sections are not separate Walk items. |
| Property Walk | Actual-host Walk start/reload/end flow | **PASS.** Joseph is selected, the active Walk restores after reload, four section outcomes close atomically, and Paint alone becomes Property Accepted. |
| Navigation and scrolling | route, shell, Back/Forward, active-tab, Plus focus, and detail-route browser gates | **PASS.** Root state restores, detail routes open at the correct position, focused workflows hide root tabs, and Search/Notifications retain one main landmark. |
| No primary workflow enters old Field Copilot | Plus, routing, and single-Capture gates | **PASS.** Primary Plus exposes Note, Blocker, and Add Release Batch; legacy Capture remains safely normalized but is not part of the supervisor loop. |
| Primary content remains visible and scrollable | iPhone 320/390/430, iPad landscape, Mac, profile/privacy, safe-area, and overflow checks | **PASS.** No tested primary surface requires horizontal panning or sits behind the bottom navigation. |

## Exact actual-host scenario

The required 50-step scenario passed in the real integrated host with synthetic
Moon Tower data:

- Setup: Joseph and Paige as Property Contacts; Jose Paint and Los Clean as
  crews; Units 101–110 as 3BR Units with Common/A/B/C.
- Draft recovery: Setup was closed, reopened, and reloaded before activation
  without losing the roster.
- Activation: Moon Tower became the active personal project without seeded
  sample events.
- Start Day: Joseph, keys received, Units 101–110 released for Paint and Clean.
- Failure proof: one forced persistence failure produced no false receipt or
  partial Day/release records; retry and double-confirm created one Day Session.
- Assignment: 40 Paint and 40 Clean section assignments persisted as 80 unique
  events.
- Unit 101 Paint: four crew-complete events; Common/B/C Los-pass; callback A;
  correction-ready; A reinspection pass.
- Readiness: Paint became Ready to Walk only after all four released sections
  passed; Clean remained assigned and independent.
- Walk: Unit 101 Paint appeared once as a complete package; Joseph accepted it;
  end-review wording survived reload; one closed Walk persisted four accepted
  section outcomes.
- End Day: one closed Day Session persisted.
- Recovery: Activity, Unit history, Walk, Day, and Moon Tower identity survived
  reload.
- Export: a full-device JSON backup downloaded successfully.

Observed final event counts:

- Assignment confirmed: 80
- Crew reported complete: 4
- Los passed: 3
- Callback opened: 1
- Correction reported ready: 1
- Callback resolved by reinspection: 1
- Accepted closed-Walk outcomes: 4
- Closed Walk Sessions: 1
- Closed Day Sessions: 1

## Synthetic timing evidence

These are deterministic headless-browser timings, not claims about Los's
physical completion speed. They detect regressions and establish that the
workflow has no long-running application step.

| Automated phase | Elapsed |
| --- | ---: |
| Setup, leave/reopen, reload, and activation | 2.18 s |
| Start Day including one failed-save proof and retry | 1.05 s |
| Bulk Paint and Clean assignment for ten Units | 1.68 s |
| Crew complete, inspection, callback, correction, and reinspection | 0.57 s |
| Property Walk, end-review reload, and closure | 2.65 s |
| End Day and Activity/history recovery | 1.49 s |
| Backup export | 0.18 s |
| Total measured automated interaction | 9.80 s |

Physical iPhone timing remains part of acceptance. The product targets remain:
Setup under three minutes; normal Start Day, ten-Unit release, and Start Walk
under 30 seconds; one-crew/ten-Unit assignment under 20 seconds; crew completion
under 10 seconds; section pass within three taps; callback within four taps.

## Device and visual evidence

| Surface | Evidence | Result |
| --- | --- | --- |
| iPhone 320 | Actual Unit 101 screenshot and overflow assertion | **PASS.** Compact grid and Common label fit; focused route hides root tabs. |
| iPhone 390 | Actual TurnBoard and Unit 101 screenshots; full supervisor-loop gate | **PASS.** Multiple Unit rows fit, assignment/readiness copy is legible, and the core loop completes. |
| iPhone 430 | Actual Unit 101 screenshot and overflow assertion | **PASS.** No diagonal or horizontal panning. |
| iPad landscape | Core/shell/Track C browser gates | **PASS.** One navigation owner and no horizontal overflow. |
| Mac | Core/shell/Track C browser gates | **PASS.** One navigation owner and no horizontal overflow. |
| Light / Dark / System | Theme contracts and browser gates | **PASS.** Shared semantic tokens remain coherent and explicit preference persists. |
| Reduced motion | Shell/Track C browser gate | **PASS.** Reduced-motion mode is detected and preserved. |
| 500-Unit scale | Track C field-operations browser/contract tests | **PASS.** Projection and navigation remain bounded. |

Visual comparison used the supplied Alpha 0.1 screenshots and the actual Alpha
0.2 screenshots together. The accepted correction removes the duplicate
Applicable strip, repeated section-sized crew messages, Common overflow, and
bottom navigation from focused Unit Detail while preserving the existing Turn
OS visual language.

## Verification summary

- Lint: **PASS**
- Deterministic suite: **PASS — 388/388**
- Production build: **PASS**
- Actual-host 50-step supervisor loop: **PASS**
- Alpha 0.2 Setup browser gate: **PASS**
- Field Operations browser/contract gates: **PASS**
- Cross-device accepted-core gate: **PASS**
- Theme, reduced motion, shell, route, and focus gates: **PASS**
- Cache/account ownership browser gate: **PASS**
- Board-first, Capture workspace, single-Capture, and integrated Wave 2A gates:
  **PASS**
- `git diff --check`: **PASS**
- Fresh release reviewer: **ACCEPT PERSONAL ALPHA 0.2.** The reviewer found no
  demonstrated P0 defect, confirmed the release diff is scope-contained, and
  confirmed that the browser-test readiness stabilization retained real
  rendered-state and product-contract assertions.

## Quarantine and production safety

- Rejected Track D modules, routes, parsing, and write receipts are not included.
- Kimi, Turn Chat, OCR, Whisper, model routing, and AI extraction did not start.
- No schema or migration changed.
- No remote migration ran.
- No production data or real sensitive PDS data was used.
- Personal Alpha 0.1 remains the rollback comparison.
- The production branch, production domain, and protected checkout remain
  untouched.

## Known non-blocking P2/P3 limitations

- Physical iPhone Safari/PWA timing and VoiceOver acceptance remain required
  after deployment.
- Advanced photo/file extraction and general CSV import are not part of this
  release.
- Additional Scope remains limited and intentionally secondary.
- Advanced analytics, portals, Turn Chat, and model-assisted workflows are not
  included.
- The production bundle still reports a non-blocking large-chunk warning.
