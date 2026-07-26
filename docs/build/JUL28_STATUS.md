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
| Current state | Shared documentation and visual references sealed; Wave 1 track commits under independent review |
| Documentation checkpoint | `d9a114c6f147f793139d57d33082d48f4ef96844` |
| Visual-reference checkpoint | `dc2240a8a4d33ffdc7299a86ec932f59f8a89e1d` |
| Production touched | No |

## Shared Visual References

| Reference | Purpose | Authority |
| --- | --- | --- |
| `docs/05_quality/design-concepts/iphone-today-needs-me.png` | Three-second Today hierarchy and actionable Needs Me view | Visual direction only |
| `docs/05_quality/design-concepts/iphone-turnboard-unit.png` | Paint/Clean card view and Unit workspace hierarchy | Visual direction only |
| `docs/05_quality/design-concepts/ipad-mac-responsive.png` | iPad two-pane and Mac review/setup/reporting adaptation | Visual direction only |

Operational semantics remain governed by the product constitution, field-truth model, and source-separated evidence—not by generated imagery.

## Program-Base Verification

| Check | Result |
| --- | --- |
| Lint | Pass |
| Deterministic suite | 256/256 pass |
| Production build | Pass |
| Command-bar browser gate | Pass — Mac, iPad landscape, iPhone viewports |
| One-Capture-owner browser gate | Pass |
| Board-first browser gate | Pass — desktop, iPad, iPhone viewports |

## Track Ledger

| Track | Worktree | Branch | State | Latest commit | Tests | Blocker | Review | Integration | Preview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A Field shell | `/Users/los/Documents/PDS-jul28-field-shell` | `codex/jul28-field-shell` | Committed — bounded correction running | `f80215d` | 5/5 focused; responsive browser gate; 256/256 existing; lint/build pass | HOLD: property/date, nine-group Needs Me taxonomy, decision context, flexible Today IA | Correction in progress | Pending | — |
| B Paint/Clean TurnBoard | `/Users/los/Documents/PDS-jul28-turnboard` | `codex/jul28-turnboard` | Committed — bounded correction running | `141e392` | 9/9 focused; 256/256 existing; responsive browser checks; lint/build pass | HOLD: partial-ready wording, release/assignment collapse, incomplete-coverage false completion, mutable fixtures, blocker copy, filter/focus gaps | Correction in progress | Pending | — |
| C Voice/Whisper | `/Users/los/Documents/PDS-jul28-voice` | `codex/jul28-voice-whisper` | Queued — four-agent cap | — | — | Wave 1 first | — | — | — |
| D Assignment intake | `/Users/los/Documents/PDS-jul28-intake` | `codex/jul28-assignment-intake` | Corrected and clean — isolated Wave 2 checkpoint | `239cc6f` after `794847d` | 14/14 focused; 256/256 existing; lint/build/diff-check pass | Physical iPhone review and shared integration remain deferred to Wave 2 | Accepted correction receipt; independent review reports no P1/P2 findings | Wave 2 only | — |
| E Intelligence | `/Users/los/Documents/PDS-jul28-intelligence` | `codex/jul28-intelligence-foundation` | Second correction preserved but uncommitted | `0cc29d6` after `a978ccd` | 17/17 corrected focused tests; exact Track B archive 9/9; diff-check pass | Full lint hung and was stopped; test:sync/build/final diff review remain | Paused safely pending full gate | Later wave only | — |
| F Reliability review | `/Users/los/Documents/PDS-jul28-reliability` | `codex/jul28-reliability-review` | Queued — four-agent cap | — | — | Track commits required | — | — | — |

## Wave Ledger

| Wave | State | Integrated commits | Verification | Preview | Physical test |
| --- | --- | --- | --- | --- | --- |
| 1 Field pattern | Track implementation running | — | — | — | — |
| 2 Workflow pattern | Not started | — | — | — | — |
| 3 Experimental intelligence | Not started | — | — | — | — |

## Rollback

The program is isolated. Before integration commits exist, rollback is removal of the candidate worktrees and branches after confirming they contain no needed changes. After a wave commit, use a new revert commit on `codex/jul28-pattern-candidate`; do not reset, force-push, or alter the accepted V2 branch.
