# Turn OS — Claude Project Instructions

Turn OS is **Los's personal iPhone-first PWA** for supervising the Moon Tower student-housing Turn: one supervisor (Carlos "Los" Adrian) + one runner (Rocky, also paint lead), ~4 crews, 166 units × Paint + Clean, ~Aug 2–16 2026. This is a LIVE production tool used in the field every day — treat every change like it ships to a job site, because it does.

## The user and how he works
- Los is a field supervisor, not a developer. Write everything (UI copy, reports, commit-facing summaries) in plain field language.
- **His #1 needs:** at-a-glance truth (which units are LIVE, who's in them), instant undo for every mistake, and numbers that agree across every surface — his boss Tony pays crews off these counts.
- **Standing rule:** when he asks for a fix once, apply the same pattern across the ENTIRE app in the same commit (terminology, grains, formats, navigation). Never make him repeat himself.
- Trade-grain everywhere: Paint releases first, cleans follow later. Any unit-grain count that hides a finished trade is wrong.
- Context-aware controls: a button on unit 1205 already knows it's 1205.

## Field rules that shape the data model (Tony/Joseph SOP)
- Paper wall-board is AUTHORITATIVE; the app is Los's personal record. Board marks: "/" = released, written name = assigned, X = done, CC = Los/property approved.
- Joseph (property manager) releases units daily, in person, at room grain ("paint 307 — A, B, C"). Partial releases are real. Walks can lag a day (painted today, walked tomorrow).
- Pay week = **Sunday 00:00 → Saturday 23:59, date only** (Los-confirmed Aug 8 — no 5 PM cutoff). Pay basis = crew-reported-complete, deduped per crew+unit+trade+section per ROUND (a Joseph-approved-then-re-released room pays again; a same-round redo does not).
- Change orders: wall hole > quarter, tubs. Three official JotForm links in `src/config/officialPdsLinks.ts` (release proof / change order / turn sign-off).
- Portal (read-only web page) is for Joseph & Paige, never shows pay/pricing/phones.

## Engineering guardrails (hard rules)
1. **Gates before every commit:** `npm run test:sync` AND `npm run test:supervisor-loop` must be fully green, plus `npx tsc -b`. New test files must be added to the `test:sync` script in package.json (a manifest test enforces it) and `git add`ed before running.
2. **Contract tests pin architecture on purpose.** When an intended change breaks one, update the pin in the same commit — never delete the test.
3. **Schema freeze during the Turn:** no new event types, no enum/shape changes to stored AppData. Compose new behavior from existing event types; device-local flags go in localStorage (`turn-os:*` keys).
4. **Validator rule:** any writer touching stored collections MUST be checked against the load validator in `src/lib/backups.ts` (superRefine): no empty confirmed release batches, no duplicate unit+trade+section scope within a batch, session references must resolve, timestamps ordered. A payload the validator rejects locks the app in Recovery Mode over Los's REAL data (happened once — loader now repairs empty batches, but don't rely on repairs).
5. **Timestamps are UTC; days are local.** Always compare event dates with a local-calendar-day helper (`localEventDate`), never `recordedAt.slice(0, 10)`. Evening work must count as today.
6. **Data safety:** deploys ship code only; localStorage/IndexedDB data is untouched. NEVER suggest the Erase button for the real project. Nothing gets removed without Los's explicit authorization.
7. **Idempotency:** retry paths (e.g. re-sending the same release batch) must stay no-ops before any duplicate guards fire.

## Build & deploy
- Deploy: `vercel deploy --prod --yes --build-env VITE_ENABLE_INTAKE=true --build-env VITE_ALPHA_GIT_SHA=$(git rev-parse --short HEAD)` (run unsandboxed; sandboxed vite/git hang).
- Git push: `GIT_TERMINAL_PROMPT=0 git -c credential.helper='!gh auth git-credential' push`.
- Official origin: https://turn-supervisor-os.vercel.app — deployment-hash URLs are separate storage worlds and auto-redirect. Sync preview: https://turn-os-sync-preview.vercel.app (VITE_ENABLE_SYNC=true build).
- Verify every deploy by polling the served bundle for the new SHA and feature markers before telling Los it's live. The PWA self-updates on foreground (service worker checks on visibilitychange).
- Auth: Supabase, single allowed email `loscastro75@gmail.com` (TURN_OS_ALLOWED_EMAIL). AI endpoints (`/api/importIntake/extract`, `/api/compose`) and portal publish are locked behind it; portal view/walk-requests use TURN_OS_PORTAL_TOKEN.

## Code map (where things live)
- Host/shell: `src/features/launch-command-center/LaunchIntegratedApp.tsx` (routing, tab memory, More pages, block dialog, portal auto-publish, walk-request banner).
- Home/day flows: `src/features/wave2a2-track-b/DayTaskWorkspace.tsx` (Home, End Day + wall-board transfer), `src/features/wave2a21-track-a/StartDayScreen.tsx` + `src/features/wave2a2-core/startDayParse.ts` (Start Day — one-screen paste/dictate → review → start; also "Add to today" mid-day). RETIRED, not routed: `FastStartDayFlow.tsx` + `DailyReleaseSelector.tsx` (old wizard) and `wave2a2-core/dictationParse.ts` (old parser) — do NOT fix Start Day bugs there.
- TurnBoard/units/crews: `src/features/wave2a2-track-c/` (BoardView = Paint|Clean boards + UnitDetail, CrewView = crews + payroll receipts, UnitPhotos, operations/projections/model).
- Quick add: `src/features/wave2a2-core/ManualReleaseReview.tsx`; data adapters + release/block writers: `src/features/wave2a2-core/appDataAdapters.ts`.
- Server: `api/` + `server/` (intake, compose, portal). Portal page: `public/portal.html`.
- Load validation: `src/lib/backups.ts`. Storage: `src/lib/storage.ts`. Photos: `src/lib/photoStorage.ts` + `photoProcessing.ts`.

## Terminology (use exactly these words in UI)
- "beds" (bedrooms A–E) and "common" (Común in Spanish crew texts). Sections = rooms.
- Trades: Paint, Clean (capitalized in UI; 'paint'/'clean' in TrackC data, 'Painter'/'Cleaner' in AppData crews).
- Queues: Needs Crew, Working, Needs Inspection, Waiting / Blocked, Callbacks, Ready to walk.
- Crew texts: calm, plain, single language (Español/English picker), units formatted "1706 — Común — A — C", always "text me as each unit is finished". Rocky's texts add a runner line.

## Reporting back to Los
Lead with what changed in his words ("Done today now names its trades"), give exact tap paths for anything he must do, keep it glanceable with short sections, never expose stack traces or jargon. If a step was skipped or a test failed, say so plainly.
