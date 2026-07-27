# July 28 Candidate Status

Last updated: 2026-07-26

## Baseline Receipt

| Item | Verified value |
| --- | --- |
| Accepted worktree | `/Users/los/Documents/PDS-ai-native-field-command-v2` |
| Accepted branch | `codex/ai-native-field-command-v2` |
| Accepted commit | `a3f6b3d0c6133c32b403fe21f12c1e31258f1770` |
| Accepted status | Clean |
| Accepted scope | V2-A through V2-B1; no later semantic automation |
| Current accepted Preview | `dpl_AovacJWZ7qkGBVvavd2mANoqRKJo` — `READY`, non-production |
| Protected checkout | `/Users/los/Documents/PDS` — read-only |
| Active local Vite servers at kickoff | None detected |

## Program Base

| Item | Value |
| --- | --- |
| Integration worktree | `/Users/los/Documents/PDS-jul28-pattern-candidate` |
| Integration branch | `codex/jul28-pattern-candidate` |
| Base | `a3f6b3d0c6133c32b403fe21f12c1e31258f1770` |
| Current state | Wave 1 integrated and locally verified; independent reliability review and non-production Preview pending |
| Documentation checkpoint | `d9a114c6f147f793139d57d33082d48f4ef96844` |
| Visual-reference checkpoint | `dc2240a8a4d33ffdc7299a86ec932f59f8a89e1d` |
| Current integration HEAD | `3f95e2b97b8a92c8a1d10a4ec4e17e93b83ba1c3` |
| Production touched | No |

## Shared Visual References

| Reference | Purpose | Authority |
| --- | --- | --- |
| `docs/05_quality/design-concepts/iphone-today-needs-me.png` | Three-second Today hierarchy and actionable Needs Me view | Visual direction only |
| `docs/05_quality/design-concepts/iphone-turnboard-unit.png` | Paint/Clean card view and Unit workspace hierarchy | Visual direction only |
| `docs/05_quality/design-concepts/ipad-mac-responsive.png` | iPad two-pane and Mac review/setup/reporting adaptation | Visual direction only |

Operational semantics remain governed by the product constitution, field-truth model, and source-separated evidence—not by generated imagery.

## Wave 1 Verification

| Check | Result |
| --- | --- |
| Lint | Pass |
| Deterministic suite | 256/256 pass |
| Wave 1 focused models | 24/24 pass |
| Production build | Pass |
| OS scaffold check | Pass |
| Command-bar browser gate | Pass — Mac, iPad landscape, iPhone viewports |
| One-Capture-owner browser gate | Pass |
| Capture workspace browser gate | Pass |
| Board-first Wave 1 browser gate | Pass — desktop, iPad, iPhone viewports |
| Field-shell browser gate | Pass — iPhone, iPad landscape, Mac |
| TurnBoard browser gate | Pass — 320px iPhone through Mac |
| Persistence/photo reliability gate | Pass |
| Cache ownership gate | Pass |
| AI usage browser gate | Pass |
| Field-scale browser gate | Pass — 300 synthetic Paint/Clean Units; 646–1,832ms measured load |

## Track Ledger

| Track | Worktree | Branch | State | Latest commit | Tests | Blocker | Review | Integration | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A Field shell | `/Users/los/Documents/PDS-jul28-field-shell` | `codex/jul28-field-shell` | Accepted and integrated | `17f194e` after `a7e8039`, `f80215d` | 10/10 focused; responsive browser gate; 256/256 existing; lint/build pass | None for Wave 1 | ACCEPT — no P1/P2/P3 findings | `e1825e1`, `81af8ba`, `ceaf411` | Pending Wave 1 Preview |
| B Paint/Clean TurnBoard | `/Users/los/Documents/PDS-jul28-turnboard` | `codex/jul28-turnboard` | Accepted and integrated | Product `7e54483`; test stabilization `112168e` | 14/14 focused; 320px–Mac responsive browser checks; 256/256 existing; lint/build pass | None for Wave 1 | ACCEPT after deterministic focus-test stabilization | `c568caf`, `159fb59`, `e3e1894`, `cfdfd4f` | Pending Wave 1 Preview |
| C Voice/Whisper | `/Users/los/Documents/PDS-jul28-voice` | `codex/jul28-voice-whisper` | Queued — four-agent cap | — | — | Wave 1 first | — | — | — |
| D Assignment intake | `/Users/los/Documents/PDS-jul28-intake` | `codex/jul28-assignment-intake` | Corrected and clean — isolated Wave 2 HOLD | `239cc6f` after `794847d` | 14/14 focused; 256/256 existing; lint/build/diff-check pass | HOLD: surplus/ragged CSV cells can drop wording; formula-like pasted values can bypass the guard | Independent review: five prior items closed, two P2 findings remain | Wave 2 only | — |
| E Intelligence | `/Users/los/Documents/PDS-jul28-intelligence` | `codex/jul28-intelligence-foundation` | Second correction preserved but uncommitted | `0cc29d6` after `a978ccd` | 17/17 corrected focused tests; exact Track B archive 9/9; diff-check pass | Full lint hung and was stopped; test:sync/build/final diff review remain | Paused safely pending full gate | Later wave only | — |
| F Reliability review | `/Users/los/Documents/PDS-jul28-reliability` | `codex/jul28-reliability-review` | Ready for integrated Wave 1 read-only review | — | Full local gate passed on integration branch | Two stale untracked baseline copies require explicit deletion approval or a clean deployment worktree | Pending | Read-only review next | — |

## Wave Ledger

| Wave | State | Integrated commits | Verification | Preview | Physical test |
| --- | --- | --- | --- | --- | --- |
| 1 Field pattern | Integrated; reliability review and Preview pending | A: `e1825e1`, `81af8ba`, `ceaf411`; B: `c568caf`, `159fb59`, `e3e1894`, `cfdfd4f`; shared: `36ecf9d`, `f254225`, `42b1ebb`, `3f95e2b` | Full local gate passed; production untouched | Pending | Pending one physical iPhone test |
| 2 Workflow pattern | Not started | — | — | — | — |
| 3 Experimental intelligence | Not started | — | — | — | — |

## Rollback

The program is isolated. Revert the Wave 1 commits on `codex/jul28-pattern-candidate` in reverse order with new revert commits; do not reset, force-push, or alter the accepted V2 branch. The accepted branch remains at `a3f6b3d0c6133c32b403fe21f12c1e31258f1770`.
