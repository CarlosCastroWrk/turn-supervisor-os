# Turn Supervisor OS — Sync + Voice + AI Upgrade Plan

Status: historical architecture plan, partially implemented as of 2026-07-07.

This document remains useful for planned sync, voice, photo, and AI direction, but the current source of truth is `docs/CURRENT_STATE.md`, `docs/ROADMAP.md`, `docs/TESTING.md`, and `docs/RISKS.md`.

Implemented since this was drafted:

- Vercel production deploy
- Supabase Auth and sync behind `VITE_ENABLE_SYNC`
- Realtime subscriptions
- Demo Mode vs Real Turn Mode
- Global Capture entry point
- Sync change fingerprinting fix

Still not implemented:

- Photo binary sync through Supabase Storage
- Durable recorded-audio upload/transcription
- Server-side AI provider routes
- Web Push reminders

The remaining plan is to keep the app private, human-confirmed, and offline-tolerant.

Companion files:
- `supabase/migrations/0001_init.sql` — full schema + RLS
- `.env.example` — environment variable contract
- `tests/sync-upgrade-qa-checklist.md` — manual QA before/after each slice

---

## 0. Ground rules (unchanged)

- Personal supervisor notebook, not company software.
- Every AI mutation stays draft-first and requires Los's approval.
- No secrets in browser code. `VITE_*` vars are public by definition.
- The app must keep working with no network — localStorage remains the hot store.
- JSON export/backup stays, always.

## 1. Target architecture

```
iPhone / iPad / MacBook (PWA, installed from Vercel URL)
  ├── React + Vite app, localStorage = hot cache + offline write buffer
  ├── Outbox: every local mutation appended as {table, row, updated_at}
  ├── Sync loop: push outbox → Supabase; pull rows where updated_at > watermark
  └── Supabase Realtime subscription → live cross-device updates
Vercel
  ├── Static hosting of the PWA (production = main branch)
  ├── /api/ai/*  serverless functions (holds ANTHROPIC_API_KEY)
  │     /api/ai/extract   transcript|note → validated DraftAction[]
  │     /api/ai/ask       question + data snapshot → answer
  │     /api/ai/brief     briefing generation
  │     /api/ai/transcribe audio → text (Deepgram/Whisper key server-side)
  └── Preview deployments per branch (test on phone before merging)
Supabase
  ├── Postgres (schema in 0001_init.sql), RLS on every table
  ├── Auth: single account, email+password, signups disabled
  ├── Storage: private buckets photos/ audio/ (per-user folder policies)
  ├── Realtime: postgres_changes on core tables
  └── pg_cron + Edge Function → scheduled Web Push (reminders)
```

Key decisions and why:

| Decision | Choice | Why |
|---|---|---|
| Auth | Email+password, signups disabled after creating Los's account | Magic links are painful with weak field connectivity; sessions persist ~forever on device |
| Sync model | Outbox push + watermark pull + Realtime, **per-row last-write-wins** | One user, 2–3 devices, tiny data. A CRDT/sync engine (PowerSync, ElectricSQL, Yjs) is real engineering risk mid-Turn for a conflict that will almost never happen. Activity log preserves history if a write is ever lost |
| Row IDs | Keep existing text IDs (`unit_x_y`) as primary keys | localStorage data migrates without remapping |
| Photos | Client-side compression (canvas → JPEG ~1600px) → Supabase Storage private bucket; DB keeps metadata + path | Fixes the localStorage-bloat problem and makes photos sync |
| AI routes | Vercel serverless functions (not Supabase Edge Functions) | Same repo/deploy as the app, plain TypeScript + official Anthropic SDK, one dashboard for secrets. Edge Functions remain a fine alternative |
| AI safety | Server returns **DraftAction JSON validated by the same Zod schema**; the existing approve/apply pipeline is unchanged | The draft-first boundary is already built — reuse it |
| Offline AI | Keep `mockAgentProvider` as automatic fallback when offline / flag off | Field-safe degradation |

## 2. Sync design (the part that can break things)

1. **Refactor storage into a thin repository layer** — keep the `AppData` shape in
   memory, but route every mutation through a function that (a) applies it locally,
   (b) appends `{table, op, row, updated_at}` to an outbox array in localStorage.
2. **Push:** when online, POST outbox rows to Supabase via `upsert` (idempotent —
   retries are safe). Remove from outbox on success.
3. **Pull:** on app open / interval / Realtime event, `select * where updated_at >
   last_watermark`, merge into local state. Merge rule: incoming row wins if its
   `updated_at` is newer than the local row's (per-row LWW).
4. **Conflicts:** with one user, a true conflict means Los edited the same record on
   two devices while offline. LWW resolves it silently; separate activity rows can
   preserve evidence of both actions, but the conflicting record itself still has one
   whole-row winner. Do not build merge UI for v1.
   Current implementation pulls cloud state before upload, chooses the row with the
   newer lifecycle timestamp, and uses a canonical deterministic winner when timestamps
   tie so devices converge instead of re-uploading tied copies. This is still whole-row
   resolution: independent fields on the same row are not merged, and a badly skewed
   future device clock can win until conflict review/server timestamps exist. Plain
   Supabase upserts are not timestamp-conditional, so truly overlapping fetch/upload
   runs can briefly publish an older row; a later pass recovers the newer timestamp,
   but atomic stale-write rejection would require a separately approved server/schema slice.
5. **Feature flag:** `VITE_ENABLE_SYNC`. Off → app behaves exactly as today.
6. **Never migrate destructively:** first sync run uploads the current localStorage
   snapshot; local data is never deleted by sync code.

## 3. Voice pipeline

```
Hold-to-record (MediaRecorder, m4a/webm)
  → save blob to IndexedDB immediately (survives refresh/offline)
  → upload to Storage audio/ bucket when online
  → POST /api/ai/transcribe (Deepgram Nova or Whisper; key server-side)
  → transcript row saved (raw text kept forever = audit trail)
  → POST /api/ai/extract → Claude with a JSON-schema-constrained output
      (schema mirrors src/lib/ai/types.ts draftActionSchema; one draft per atomic fact)
  → drafts land in the existing Draft Actions inbox → Los approves/edits/rejects
```

- **"I said 10 things"**: the extraction prompt instructs one DraftAction per atomic
  statement, each carrying the source sentence in `sourceText`. The README example remains
  a baseline multi-action parse case; add an explicit ask/call/confirm statement only when
  testing follow-up creation.
- **Low confidence:** extraction sets `confidence`; anything < 0.7 renders with a
  warning style and is never bulk-approved. Whole-note fallback (save as daily-log
  draft) stays.
- **Noisy audio:** Deepgram Nova handles field noise well; keep the raw audio so a bad
  transcript can be re-run. Always show the transcript for correction before/alongside
  drafts.
- **Fallback that already works:** iOS keyboard dictation into Quick Capture. If
  MediaRecorder misbehaves in the installed PWA (historically flaky on some iOS
  versions), dictation is the day-one path and recording is progressive enhancement.

## 4. Notifications

- iOS Web Push works for installed PWAs (iOS 16.4+): Notification permission prompt
  must come from a user gesture ("Enable reminders" button in Setup).
- v1 scheduled pushes only (pg_cron → Edge Function → Web Push):
  - 7:00am "Start-day: open Morning Brief"
  - 4:30pm "Build End-of-Day report"
- v1.5 condition digests (one push, many findings): stale units > 3h, blocked units
  with no owner, crews not checked in by 9:30am, critical issues unowned.
- Noise budget: max 4 pushes/day, everything always visible in the in-app Attention
  Queue (the existing smart-suggestions list, renamed), quiet hours 21:00–06:30.

## 5. AI models (2026)

| Job | Model | Notes |
|---|---|---|
| Draft extraction, Ask-the-OS, briefings, coaching | `claude-opus-4-8` ($5/$25 per MTok) | Default. Use structured outputs (`output_config.format` json_schema) so responses are guaranteed-parseable; validate again with Zod server-side |
| High-volume/cheap parses (if cost matters) | `claude-haiku-4-5` ($1/$5) | Fine for Quick Capture extraction; keep Opus for briefings/coaching |
| Transcription | Deepgram Nova (or OpenAI Whisper) | Claude doesn't take audio; both handle noisy field audio; pennies per day |

Use prompt caching for the stable system prompt + approved memories (order: frozen
instructions first, volatile data snapshot last). At this scale expect **well under
$1/day**.

**Don't use yet:** vector DB / embeddings (a few hundred structured rows — SQL + the
deterministic suggestion engine answer everything), Managed Agents / autonomous loops
(violates draft-first), fine-tuning, MCP, multi-agent orchestration.

## 6. Unit Command / field UX upgrades (no backend needed)

1. CSV import (unit list from the company) — biggest time-saver before day one.
2. Saved-view chips above the unit grid: **Blocked · Needs Inspection · Stale >3h ·
   My walk path** (one tap, no dropdowns).
3. Group units by building/floor with collapsible sections + counts (300 units on one
   scroll is unusable; 12 collapsed floor rows is fast).
4. Sticky bottom action bar in Unit Detail (one-handed reach).
5. "Check next" mode: full-screen card driven by the existing suggestion ranking —
   swipe done → next.
6. iPad: two-pane layout (unit list left, detail right) via a CSS breakpoint.
7. Per-bed tracking only if Tony's workflow actually tracks beds — schema supports it
   (`beds` table), UI deferred.

## 7. Reports

- Rename export title to **"Personal Turn Supervisor Field Report"** (neutral, no
  company branding).
- Report accumulates automatically (it already derives from live data); EOD flow =
  generate → edit → send.
- Two outputs: **Tony version** (counts, blockers, needs-from-property) and **Los
  internal** (adds lessons, crew notes, tomorrow plan).
- PDF: print stylesheet (`@media print`) + iOS Share → Save as PDF/Print. Zero
  dependencies, looks professional. A pdf-lib/pdfmake generated PDF with photo
  appendix is a later nice-to-have.

## 8. Security & privacy

| Risk | Mitigation |
|---|---|
| Anon key in bundle | Expected and safe **only** with RLS on every table (migration does this). Never ship `service_role` or `ANTHROPIC_API_KEY` in client code |
| Device loss | Device passcode + Supabase session revocation (sign out from dashboard); localStorage is unencrypted → policy stays "no tenant PII, ever" |
| Photos | Private buckets, per-user folder policies, signed URLs with short expiry; no faces/documents/belongings |
| Voice notes | Same bucket policy; transcripts are the sensitive artifact — same no-PII policy applies to what Los says |
| Export files | Full data in one JSON — store in iCloud/Drive private folders only |
| PWA cache | Caches app shell only, never API responses with data |
| AI providers | Server-side only; Anthropic API data-retention is fine for this use; never send tenant PII (policy, not tech) |

## 9. Build sequence (smallest field-ready path)

| Slice | What | Risk if skipped/rushed |
|---|---|---|
| 0 (today) | `git init` + first commit + private GitHub repo + Vercel deploy of the static app | No version control = one bad edit loses the app; no deploy = no multi-device at all |
| 1 | Supabase project, auth (single user, signups off), apply `0001_init.sql`, create buckets | — |
| 2 | Auth screen + sync layer behind `VITE_ENABLE_SYNC` (outbox/pull/Realtime), first-run snapshot upload | **Highest-risk slice.** Test hard on 2 devices before trusting it in the field |
| 3 | Photo compression + Storage upload | Fixes storage-quota time bomb |
| 4 | `/api/ai/extract` + `/api/ai/ask` (Claude, structured outputs) behind `VITE_ENABLE_AI`; server provider implements the existing `AgentProvider` interface, mock stays as offline fallback | — |
| 5 | Voice record → transcribe → drafts behind `VITE_ENABLE_VOICE` (dictation is the fallback throughout) | — |
| 6 | Web Push reminders (2 scheduled pushes) | Nice-to-have; Attention Queue covers it in-app |
| 7 | CSV import + saved-view chips + floor grouping + print stylesheet | Do parts of this early if the unit list arrives before sync is done |

Test on real iPhone + iPad at every slice: install to Home Screen, airplane-mode
behavior, quota behavior, dictation, and the sync-conflict scenario (edit same unit on
both devices offline, then reconnect).

What stays local-only: draft approval flow, the deterministic suggestion engine,
export/backup, the mock provider.

What could break the Turn if done poorly: the sync refactor (slice 2) — everything
else is additive and flag-gated. If slice 2 slips, ship slices 0/1/3/7 and run
single-device + export like today.
