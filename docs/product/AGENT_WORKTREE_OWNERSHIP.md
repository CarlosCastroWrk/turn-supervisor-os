# July 28 Agent Worktree Ownership

## Rules

- Maximum four implementation agents concurrently.
- One implementation agent per worktree.
- No two agents edit the same worktree.
- Tracks own feature-local components, adapters, fixtures, styles, and tests.
- The integration agent alone changes shared application wiring.
- Review agents are read-only.
- Every accepted track produces one or more focused local commits and a test receipt.

## Shared Integration Reservations

Only the integration agent may modify:

- `src/App.tsx`
- `src/views/CopilotView.tsx`
- `src/components/TurnCommandBar.tsx`
- primary routing and global navigation wiring
- shared persisted `AppData` contracts
- global styles
- Supabase schema/sync behavior
- production deployment wiring

Voice-track exception: Track C owns package files, CSP, service-worker model-cache logic, and voice-related Vercel configuration on its isolated branch.

## Track Matrix

| Track | Branch | Worktree | Owned surfaces | Initial wave |
| --- | --- | --- | --- | --- |
| A — Field shell | `codex/jul28-field-shell` | `/Users/los/Documents/PDS-jul28-field-shell` | Today, Needs Me, More, header/bell, responsive nav, local styles/tests | 1 |
| B — Paint/Clean TurnBoard | `codex/jul28-turnboard` | `/Users/los/Documents/PDS-jul28-turnboard` | TurnBoard cards, Unit workspace, filters, local view model/adapter/fixtures/tests | 1–2 |
| C — Voice/Whisper | `codex/jul28-voice-whisper` | `/Users/los/Documents/PDS-jul28-voice` | provider contract, browser speech, experimental Whisper, worker/cache/package/CSP tests | 3 |
| D — Assignment intake | `codex/jul28-assignment-intake` | `/Users/los/Documents/PDS-jul28-intake` | text/CSV intake, mapping, preview, conflicts, confirmation, tests | 2 |
| E — Intelligence foundation | `codex/jul28-intelligence-foundation` | `/Users/los/Documents/PDS-jul28-intelligence` | context snapshots, candidate memory, metrics, deterministic queries | 2–3 |
| F — Reliability review | `codex/jul28-reliability-review` | `/Users/los/Documents/PDS-jul28-reliability` | read-only release/reliability review; approved isolated repairs only | all |

## Integration Contract

Track commits are reviewed before cherry-pick. The integration agent adapts shared wiring rather than letting track agents bypass ownership. Conflicts involving operational meaning, persistence, sync, or a reserved file are stop conditions for that track.
