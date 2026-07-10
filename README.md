# Turn Supervisor OS / Turn Field Copilot

Turn Supervisor OS is the current app name for PDS / Turn Field Copilot: a private, local-first field operations companion for Los during a two-week student housing Turn operation.

It is not official Property Doctor Services software. It is a personal supervisor notebook for staying organized, tracking field status, communicating clearly, and learning the operation from the inside before proposing any software ideas.

## What V0.1 Includes

- Mobile-first dashboard with Turn day, project progress, blockers, crews, priorities, and quick actions
- Copilot section with focused Quick Capture, Draft Actions, deterministic Ask/Briefing internals, and Setup-based Supervisor Memory review
- Editable project setup
- Demo Mode vs Real Turn Mode with a Start Real Turn setup flow
- Preview-first Real Turn CSV Unit import that skips existing/invalid rows and never imports status
- Preview-first bulk Unit updates for up to 500 filtered Units with protected/stale-row skips and no bulk Ready path
- Global bottom-right Capture button available across tabs
- Organized/collapsible sidebar on iPad and desktop widths
- Buildings, floors, units, unit filters, and quick unit creation
- Unit detail view with fast status updates, notes, linked issues, photos, and activity history
- Crew directory with factual professional notes
- Assignment tracker with check-in, delay, no-show, reassignment, and completion states
- Issue tracker for blockers, owner, priority, due date, status, notes, and resolution
- Photo and note capture using browser file input
- Daily log for morning plan, midday update, end-of-day reflection, blockers, lessons, and tomorrow priorities
- Copy-ready daily report generator
- Training questions with status, answer, and follow-up fields
- Export / backup for photo-complete JSON, units CSV, issues CSV, daily report text, daily logs Markdown, Copilot/Memory Markdown, and Follow-Ups CSV
- PWA manifest and service worker with iOS PNG icons, rotation support, atomic app-shell updates, bounded navigation fallback, and offline deep-link startup
- Field-accessible navigation and Capture behavior with 44px targets, visible focus, semantic progress/navigation state, reduced-motion support, and a keyboard-contained Voice dialog
- Nonblocking field feedback plus timestamp-guarded Undo for Unit quick-status taps; destructive and recovery actions retain explicit confirmation
- Local-first persistence using browser localStorage for operational records and IndexedDB for compressed photo files
- Rule-based no-API-key copilot parser that creates draft actions before changing data, plus an optional protected model-assisted Capture path with the same approval boundary
- Draft Action status tabs for Pending, Applied, Rejected, Failed, and All
- Mobile-accessible secondary navigation for Setup, Assignments, Reports, Training Questions, and Export
- Optional Supabase sync panel behind `VITE_ENABLE_SYNC` for signing in and syncing records across devices

## Intentionally Excluded

- No company/team login system
- No general application backend beyond the bounded Capture function and Supabase/Vercel infrastructure
- No unrestricted cloud sync; sync requires Los's Supabase account and remains feature-flagged
- No production-enabled external AI until the metering schema and server-only environment activation are explicitly approved
- No autonomous AI agent or direct model mutation
- No autonomous actions
- No CRM
- No tenant portal
- No vendor portal
- No payroll/payment system
- No SMS automation
- No official company branding or claims
- No multi-user company dashboard
- No API keys in browser code

## Run Locally

```bash
npm install
npm run dev
```

Then open the local URL Vite prints, usually:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Use On iPhone / iPad

1. Start the dev server on your Mac.
2. Open the app URL in Mobile Safari. For phone access from the same network, use the network URL Vite prints.
3. Tap Share.
4. Tap Add to Home Screen.

The app stores data locally in that browser on that device. Operational records use localStorage and normal compressed photo files use IndexedDB. When Supabase sync is enabled and you are signed in, supported records and available Real Turn photo files also sync to your private Supabase project. Export JSON backups regularly; the backup gathers photo files available on that device and reports any missing files.

## Supabase Sync

Production sync is controlled by:

- `VITE_ENABLE_SYNC=true`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The sync panel appears in the header when the flag is enabled. Sign in with the Supabase user created in the project Dashboard. The app keeps localStorage as the hot/offline cache, uploads local records after sign-in, pulls cloud records, and listens for Realtime changes from other signed-in devices.

Safety notes:

- A fresh browser with no local cache pulls cloud records before uploading sample seed data.
- Sync comparison normalizes equivalent timestamp formats and JSON object key order to reduce false local-change upload loops.
- Demo and real Turn projects are separated by project mode. Start Real Turn Mode before entering real field records.
- Important Copilot mutations are still draft-first.
- Project-scoped operational Memory is deployed with the approved E4 migration; legacy unscoped operational Memory remains inactive until assigned in Setup.
- New Daily Logs use one deterministic project/date identity. Sync preserves an existing legacy cloud ID and updates that row instead of inserting a conflicting second log.
- Real Turn photos save locally first, then upload to Los's private Supabase Storage folder when signed in and online. Other devices lazy-download and cache thumbnails; Demo Mode photos stay local.
- Deletes are not propagated yet; avoid deleting browser data unless you exported a backup.
- JSON restore is available only after sync auth resolves and the device is signed out. Review/export recovered data before signing in again because newer cloud rows can later merge back.

## Start A Real Turn Safely

1. Open Setup.
2. Tap Backup JSON.
3. Fill the Start Real Turn fields: property, location, dates, supervisor, project manager, and the structure you know.
4. Tap Start Real Turn.
5. Confirm the Dashboard says Real Turn Mode before entering real field notes.
6. Optional: use Setup's CSV import to preview and add a known Unit list. Existing Units are skipped and every imported Unit starts Not Started.

Demo Mode stays available for practice. Use the mode switch in Setup to return to the sample project without mixing it into the real board.

## Copilot

The Copilot is a local-first assistant layer. It helps capture, organize, summarize, remember, and suggest. It does not make final decisions and does not mutate important records without a visible Draft Action.

### Quick Capture

1. Tap the bottom-right Capture button.
2. Tap Record if browser speech recognition is available, or tap the messy note box and use iPhone/iPad keyboard dictation.
3. Speak or type a field note.
4. Tap Review Changes.
5. Review Draft Actions.
6. Edit payloads if needed.
7. Approve/apply or reject each action.

Example note:

```text
Building A unit 204 paint done but cleaning blocked because keys are missing. Jose crew moved from 203 to 205. Unit 312 has sink leak, ask Tony.
```

The local parser can create drafts like:

- Unit status update
- Issue creation
- Assignment / crew movement note
- Follow-up task
- Daily log entry
- Memory candidate

### Draft Actions

Draft Actions are the safety boundary. Copilot output starts as pending drafts with:

- action type
- target
- summary
- confidence
- reason
- editable JSON payload
- approve/apply and reject controls

If a draft references a unit that does not exist, applying it will fail and ask you to confirm setup first. Ready-state changes are blocked unless paint, clean, maintenance, and inspection are complete. The Unit Detail "Mark Ready" shortcut also warns before overriding incomplete paint, clean, repair, or inspection status.

### Ask the OS

Ask the OS answers using local app data only. It supports questions like:

- What units are blocked?
- What needs inspection?
- Which units have not been updated in 3 hours?
- What are my highest priority issues?
- Which crews are currently assigned?
- What open issues involve keys?
- What should I tell Tony right now?
- What questions do I still need to ask during training?

Answers include a concise response, supporting records, uncertainty, and suggested next actions.

### Briefings / Reports

Copilot can generate editable:

- Morning Brief
- Midday Brief
- End-of-Day Report

Reports use real local data. If data is missing, the report says so instead of making up numbers. Approved memory can influence tone, such as putting a short Tony-ready version first.

### Memory

Memory helps the OS get smarter over time, but memory candidates require approval. Memory types include:

- Role Memory
- Workflow Memory
- Property Memory
- Crew Memory
- Personal Supervisor Preference
- Lesson Learned

Capture scopes new candidates to the active Turn. Review and edit them in Setup under Supervisor Memory before approval. Rejected candidates are not used, and exact duplicate facts or repeated approval do not create duplicate saved Memory.

Approved operational Memory applies only to the active non-archived project and a live linked source. Explicit personal supervisor preferences and built-in safety rules may apply across all Turns. Legacy unscoped operational Memory stays inactive until Los assigns it to the current Turn.

Current typed consumption is deliberately narrow: sourced Crew facts, review-first Daily Log lessons, Ask OS supporting records, and briefing/report preferences. Memory never bypasses Draft Actions or automatically saves a Daily Log.

## AI / API Safety

The app still runs without an API key and always retains the deterministic local provider in `src/lib/ai/mockAgentProvider.ts`. H1 adds an optional `/api/agent/capture` Vercel Function. API billing is funded and synthetic local model checks pass, but production model use stays disabled until the H2 metering schema and explicitly approved Vercel environment changes are complete.

The protected route:

- keeps `OPENAI_API_KEY` server-only
- verifies Los's Supabase bearer token and a server-only account allowlist
- sends bounded active-Turn context without crew phone, company, or language fields
- validates structured output and rejects unknown Unit mutations
- returns pending Draft Actions, never direct mutations
- falls back to the local parser when disabled, unsigned, offline, timed out, rate limited, over quota, or unavailable

H2 selects exactly one model per request: `gpt-5.4-nano` for focused extraction and `gpt-5.4-mini` for complex, attachment-heavy, ambiguous, or higher-consequence captures. `gpt-5.5` is available only as an explicit server override and is never selected automatically. Successful model calls return a local-first usage receipt with token counts and estimated cost.

Setup includes an AI Usage panel for a Los-entered Turn budget, estimated used and remaining amounts, average call cost, and recent calls. These values estimate TurnOS spend from returned token usage and versioned prices; they are not the official OpenAI credit balance. The panel links to OpenAI Billing for authoritative account totals, and OpenAI project limits remain the real spending control.

## Privacy Guardrails

- Do not collect tenant personal information.
- Do not capture tenant documents.
- Do not capture faces unless required and permitted.
- Only capture work-related photos with permission.
- Export before resetting browser data.
- Do not paste private tenant data into Copilot notes.

## Known V0.1 Limitations

- A newly captured photo remains device-local until a successful signed-in sync records its private cloud path; reinstalling or clearing site data before that can remove it unless it was included in a JSON backup.
- Cross-device photo sync is implemented but still requires Los's one-photo Mac/iPhone/iPad acceptance check.
- Cloud photo object deletion is not implemented yet.
- PWA offline cold start and deep-link reload pass automated persistent-browser tests; installed iPhone/iPad Home Screen acceptance still must be run on the physical devices.
- Cross-device sync is new and must be field-tested before Turn.
- Visible sync diagnostics now identify trigger, table, row counts, queued work, and the last error; true same-row conflict review is still not implemented.
- Same-date Daily Log creation now converges to one row, but simultaneous edits still use whole-row timestamp resolution rather than field-level merge.
- Delete propagation and conflict review UI are not implemented yet.
- CSV Unit import is additive and preview-first, but it has no automatic import Undo. Export a backup first and review every preview count before confirming a real list.
- Bulk Unit updates support guarded paint, cleaning, repair, and inspection transitions only. They do not offer bulk Ready, arbitrary resets, or automatic Undo.
- Copilot parsing is rule-based and conservative. It will miss some messy field phrasing.
- The protected OpenAI route is implemented but production-disabled. Billing is funded; the H2 metering migration and required Vercel environment changes still need separate fresh explicit approval.

## Sync / Voice / AI Upgrade (planned)

The plan for multi-device sync (Supabase), Vercel hosting, voice capture, server-side
AI, and notifications lives in
[docs/03_architecture/SYNC_UPGRADE_PLAN.md](docs/03_architecture/SYNC_UPGRADE_PLAN.md).

Supporting files:

- `supabase/migrations/0001_init.sql` — full Postgres schema with Row Level Security
- `.env.example` — environment variable contract (public `VITE_*` vs server-only keys)
- `tests/sync-upgrade-qa-checklist.md` — manual QA per build slice

Rules that carry over: no secrets in browser code, draft-first AI with human approval,
graceful offline behavior, and JSON export stays forever.

## Roadmap

The active roadmap is maintained in [docs/ROADMAP.md](docs/ROADMAP.md). Normal non-emergency work should use the PR workflow in [docs/06_release/GITHUB_PR_WORKFLOW.md](docs/06_release/GITHUB_PR_WORKFLOW.md).

### Version 0.2

- Supabase Storage photo sync physical-device acceptance and cleanup lifecycle
- Physical iPhone/iPad PWA install, rotation, and offline-restart acceptance
- Voice notes
- Checklist templates per trade
- Stronger Copilot parsing examples
- Better draft-action grouping and bulk review

### Version 0.3

- Voice note transcription upload
- Photo understanding with privacy controls
- Bulk floor updates by voice
- Supervisor performance journal
- Optional cloud sync
- Multi-device sync between iPhone and iPad
- More polished reporting
- Crew assignment calendar
- Analytics dashboard

### Version 1.0

Only if validated by field experience and approved by leadership:

- Multi-supervisor mode
- Project manager dashboard
- Real-time updates
- Company workflow integration
- Permission system
- Official reporting
- SMS integration
- Company permissions
- Audit logs
- Supabase/backend
