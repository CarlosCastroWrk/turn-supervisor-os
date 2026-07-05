# Turn Supervisor OS

Turn Supervisor OS is a private, local-first field operations companion for Los during a two-week student housing Turn operation.

It is not official Property Doctor Services software. It is a personal supervisor notebook for staying organized, tracking field status, communicating clearly, and learning the operation from the inside before proposing any software ideas.

## What V0.1 Includes

- Mobile-first dashboard with Turn day, project progress, blockers, crews, priorities, and quick actions
- Copilot section with Quick Capture, Ask the OS, Briefings, Draft Actions, Memory Inbox, and smart suggestions
- Editable project setup
- Buildings, floors, units, unit filters, and quick unit creation
- Unit detail view with fast status updates, notes, linked issues, photos, and activity history
- Crew directory with factual professional notes
- Assignment tracker with check-in, delay, no-show, reassignment, and completion states
- Issue tracker for blockers, owner, priority, due date, status, notes, and resolution
- Photo and note capture using browser file input
- Daily log for morning plan, midday update, end-of-day reflection, blockers, lessons, and tomorrow priorities
- Copy-ready daily report generator
- Training questions with status, answer, and follow-up fields
- Export / backup for JSON, units CSV, issues CSV, daily report text, daily logs Markdown, Copilot/Memory Markdown, and Follow-Ups CSV
- PWA manifest and service worker for add-to-home-screen and basic app shell caching
- Local-only data persistence using browser localStorage
- Rule-based no-API-key copilot parser that creates draft actions before changing data
- Mobile-accessible secondary navigation for Setup, Assignments, Reports, Training Questions, and Export
- Optional Supabase sync panel behind `VITE_ENABLE_SYNC` for signing in and syncing records across devices

## Intentionally Excluded

- No company/team login system
- No backend server beyond Supabase/Vercel infrastructure
- No unrestricted cloud sync; sync requires Los's Supabase account and remains feature-flagged
- No external APIs
- No AI agent
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

The app stores data locally in that browser on that device. When Supabase sync is enabled and you are signed in, supported records also sync to your private Supabase project. Export JSON backups regularly if using it for real field notes.

## Supabase Sync

Production sync is controlled by:

- `VITE_ENABLE_SYNC=true`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The sync panel appears in the header when the flag is enabled. Sign in with the Supabase user created in the project Dashboard. The app keeps localStorage as the hot/offline cache, uploads local records after sign-in, pulls cloud records, and listens for Realtime changes from other signed-in devices.

Safety notes:

- A fresh browser with no local cache pulls cloud records before uploading sample seed data.
- Important Copilot mutations are still draft-first.
- Photo metadata syncs, but base64 photo files stay local until the Storage/photo-compression slice is implemented.
- Deletes are not propagated yet; avoid deleting browser data unless you exported a backup.

## Copilot

The Copilot is a local-first assistant layer. It helps capture, organize, summarize, remember, and suggest. It does not make final decisions and does not mutate important records without a visible Draft Action.

### Quick Capture

1. Open Copilot.
2. Tap the messy field note box.
3. Use iPhone/iPad dictation or type a field note.
4. Tap Parse Note.
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

Rejected candidates are not used. Approved memories can guide reports and safety warnings.

## AI / API Safety

The current app runs without an API key. Copilot uses a deterministic local provider in `src/lib/ai/mockAgentProvider.ts`.

Because this is a static Vite app, do not put `OPENAI_API_KEY` or any provider secret in browser code. A real OpenAI provider should only be added through a future server-side API layer that:

- keeps secrets on the server
- validates structured outputs with Zod or JSON Schema
- returns Draft Actions, not direct mutations
- preserves the no-API-key local fallback

## Privacy Guardrails

- Do not collect tenant personal information.
- Do not capture tenant documents.
- Do not capture faces unless required and permitted.
- Only capture work-related photos with permission.
- Export before resetting browser data.
- Do not paste private tenant data into Copilot notes.

## Known V0.1 Limitations

- localStorage is simple and offline-friendly, but not ideal for many large photos.
- Photo data is stored as base64 data URLs and can grow browser storage quickly.
- PWA offline support caches the app shell, but full offline production hardening is not complete.
- Cross-device sync is new and must be field-tested before Turn.
- Delete propagation and conflict review UI are not implemented yet.
- No CSV import yet.
- Copilot parsing is rule-based and conservative. It will miss some messy field phrasing.
- No real OpenAI/API provider is enabled yet because there is no server-side route.

## Sync / Voice / AI Upgrade (planned)

The plan for multi-device sync (Supabase), Vercel hosting, voice capture, server-side
AI, and notifications lives in
[docs/03_architecture/SYNC_UPGRADE_PLAN.md](docs/03_architecture/SYNC_UPGRADE_PLAN.md).

Supporting files (no runtime behavior changes yet — the app is still local-only):

- `supabase/migrations/0001_init.sql` — full Postgres schema with Row Level Security
- `.env.example` — environment variable contract (public `VITE_*` vs server-only keys)
- `tests/sync-upgrade-qa-checklist.md` — manual QA per build slice

Rules that carry over: no secrets in browser code, draft-first AI with human approval,
graceful offline behavior, and JSON export stays forever.

## Roadmap

### Version 0.2

- Better photo compression/storage
- Better offline PWA support
- Import units from CSV
- Voice notes
- Faster bulk unit updates
- Checklist templates per trade
- Stronger Copilot parsing examples
- Better draft-action grouping and bulk review

### Version 0.3

- Voice note transcription upload
- Photo understanding with privacy controls
- Bulk floor updates by voice
- CSV import from company-provided unit list
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
