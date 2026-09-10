# Current State

Last rewritten: 2026-09-10. Before this date the file described the July
"Copilot" build and was wrong about nearly everything below. Git history has
the old text.

## What Turn OS is now

Los's personal iPhone-first PWA for supervising a student-housing Turn:
Paint and Clean crews, room-grain releases from the property, walks,
callbacks, and the pay packet Tony pays crews off. Production:
https://turn-supervisor-os.vercel.app. One user, one allowed email.

The Moon Tower turn (Aug 1–17 2026, ~168 units) ran on it end to end and
payroll reconciled with Tony room by room with zero disputes. The turn is
sealed in the app; the next one has not started.

## Where the truth lives

- Pay week and calendar day: `src/lib/localDay.ts`
- Room and trade stage: `src/features/wave2a2-track-c/roomStatus.ts`
- Pay engine: `src/features/wave2a2-track-c/crewPayroll.ts`
- What Tony was handed per week: `src/features/wave2a2-track-c/paidWeekSnapshot.ts`
- Storage, compression, quota rescue, multi-tab guard: `src/lib/storage.ts`
- Load validator (Recovery Mode): `src/lib/backups.ts`
- Cloud sync: `src/lib/supabase/sync.ts` + `syncCore.ts`
- Host / routing / More pages: `src/features/launch-command-center/LaunchIntegratedApp.tsx`
- Field rules, terminology, deploy command, engineering guardrails: `CLAUDE.md`

## Shipped in September 2026

- Tier 1 hardening (deployed): portal escaping, typed event vocabulary,
  on-device problem log, multi-tab guard, dead-file purge.
- Tier 2 "one truth" (pushed): one local-day/pay-week module, one room-status
  rule, Home queues read the board's projection.
- Sep 9–10 fix list (pushed): portal page runs under the CSP again, daily
  keep-alive cron so the free-tier database never sleeps, plain-English
  unreachable-server message, Crews tab ticking clock, welcome card off the
  demo, non-blocking failed restore, paid-week snapshot with drift warning.

## Known debt (ranked)

1. The host component is ~5,600 lines with 50 state hooks and 71 route
   branches. Split by domain is the next structural job.
2. Five CSS systems (four token blocks, ~345 hex colors, 76 `!important`).
   One token file first, then motion.
3. Twelve legacy "Copilot"-era collections still ride in every save and
   sync (memories, draft actions, agent runs, suggestions, training
   questions, follow-ups, AI usage). Dropping them needs a migration plan.
4. Sync has no deletes (no tombstones). Fine on one device; a second device
   would resurrect removed rows.
5. Feature folders are named by sprint (`wave2a2-track-c`, `jul28-*`), not
   by what they are.

## What is deliberately NOT here

Multi-user, CRM, company branding, payroll as an official record. Paper is
the official TurnBoard. See `CLAUDE.md`.
