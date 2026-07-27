# Launch-Week Option 2 Integration Record

## Status

Implementation is isolated and non-production. The official paper TurnBoard and
accountable PDS/property processes remain authoritative.

## Verified Base

- Worktree: `/Users/los/Documents/PDS-wave1r-board-first-candidate`
- Branch: `codex/wave1r-board-first-candidate`
- Commit: `51a0edd4179a44400839ca171a9bda9ed648a497`
- Rollback Preview:
  `https://turn-supervisor-neae3pnnh-carloscastrowrk.vercel.app`
- Preview state: READY, authentication protected, non-production
- Repository-adapter commits reviewed as inputs: `46d9eb5`, `723fdb0`

Baseline verification on the integration worktree:

- `npm run lint`: pass
- `npm run test:sync`: 292/292 pass
- `npm run build`: pass
- Existing build warning: main application chunk remains above 500 kB

## Worktrees and Ownership

| Track | Worktree | Branch | Write boundary |
| --- | --- | --- | --- |
| Integration | `/Users/los/Documents/PDS-launch-week-integration` | `codex/launch-week-option2` | Host wiring, shared routing/state/styles, service worker, final gates |
| A | `/Users/los/Documents/PDS-launch-track-a-shell` | `codex/launch-track-a-shell` | Unified shell, minimal Home, Search, Notifications, visual Login |
| B | `/Users/los/Documents/PDS-launch-track-b-auth-goals` | `codex/launch-track-b-auth-goals` | Auth/session adapter, onboarding, property setup, deterministic goals |
| C | `/Users/los/Documents/PDS-launch-track-c-intelligence` | `codex/launch-track-c-intelligence` | AI packages, gateway, router, Turn Chat, usage contracts |
| D | `/Users/los/Documents/PDS-launch-track-d-memory` | `codex/launch-track-d-memory` | Activity, Unit history, approved knowledge, repositories, read tools |

Shared host files are reserved for integration. No two implementation agents
write one worktree.

## Integration Waves

1. Wave 2A: unified shell, Login, onboarding foundation, minimal Home, Search,
   Notifications, deterministic goals, Activity memory.
2. Wave 2B: grounded Turn Chat, provider router, read tools, proposal cards,
   usage/cost, mock and no-model fallbacks.
3. Wave 2C: draft-only assignment source intake and source-preserving review.
4. Wave 2D: provider-independent voice; Local Whisper remains experimental and
   off by default.

Each wave must pass its own review and verification gate before the next wave is
integrated.

## Wave 2A Host Contract

The shared application host remains the only owner of routing, persisted
`AppData`, Supabase initialization, Capture, and recovery state. Feature tracks
must remain pure or adapter-driven.

Locked destination mapping:

| Launch destination | Host destination |
| --- | --- |
| Home | Minimal command-center surface |
| TurnBoard | Existing Paint/Clean board and Unit workspace |
| Central Plus | Existing single Capture owner |
| Activity | Operational event and Unit-history projection |
| More | Existing secondary tools inside the unified launch shell |
| Search | Full-page launch route with deterministic grouped results |
| Notifications | Full-page launch route with deterministic grouped alerts |
| Intelligence | Contextual entry point; remains non-model/manual until Wave 2B passes |

Wave 2A must not mount the legacy field shell around any route. Existing
secondary tools may remain functionally unchanged, but their route content must
appear inside the unified launch shell.

## Required Wave Gates

Wave 2A cannot advance to Preview until:

- Track A, B, and D commits receive independent diff review.
- `npm run lint`, `npm run test:sync`, and `npm run build` pass.
- Existing Capture, cache, recovery, Wave 1R, and field-scale gates pass.
- New launch-shell, auth, onboarding, goal, memory, Search, and Notifications
  tests pass.
- Browser checks cover iPhone, iPad landscape, and Mac with no horizontal
  overflow, no iPhone input zoom, reduced-motion behavior, and one Capture
  owner.
- Login remains configuration-gated and the synthetic/manual local workflow
  remains usable without credentials.
- The resulting Preview is authentication protected and non-production.

## Model Routing Evidence

Official Vercel AI Gateway references currently identify:

- Routine model: `moonshotai/kimi-k2.6`
- Complex model: `moonshotai/kimi-k3`

Deterministic counts, progress, filters, status lookups, and safety validation
must not invoke a model. Mock/no-model operation must work without credentials.

## Safety Boundaries

- Synthetic/redacted data only.
- No production deployment.
- No remote Supabase migration.
- No direct model database writes.
- No client-exposed provider credential.
- No automatic official mark, message, approval, form submission, or payroll
  decision.
- Every consequential proposal requires deterministic validation and Los's
  explicit confirmation.
- AI, voice, sync, and network failure must preserve a useful manual workflow.
