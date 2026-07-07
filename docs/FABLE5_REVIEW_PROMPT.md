# Fable 5 Review Prompt

You are reviewing a project called Turn Field Copilot.

## Context

This is a personal local-first mobile field companion for Los, who will supervise a two-week student housing Turn operation near West Campus in Austin.

It is not official Property Doctor Services software, not company software, not a CRM, and not a multi-user portal.

It helps Los:

- Capture field observations quickly
- Track real units, issues, blockers, and follow-ups
- Keep crew/contact notes organized
- Generate factual reports
- Learn the operation deeply
- Stay reliable under pressure on Mac, iPhone, and iPad

Core loop:

Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn

## Current Phase

Phase 1 Stabilize.

## Current Goal

Make Real Turn Mode safe across Mac, iPhone, and iPad before adding more AI or field-experience features.

## Current Implementation

- React + TypeScript + Vite PWA
- Local-first persistence via browser `localStorage`
- Optional Supabase sync with sign-in panel and Realtime subscriptions
- Vercel production deployment
- Demo Mode vs Real Turn Mode
- Start Real Turn setup flow
- Project-scoped crew contacts
- Global bottom-right Capture entry point
- Organized/collapsible sidebar on iPad/desktop widths
- Draft Action status tabs and clearer approve/reject feedback
- Sync change fingerprinting fix for equivalent Supabase timestamp/JSON shapes
- Dashboard, Setup, Units, Issues, Crews, Assignments, Daily Log, Reports, Training Questions, Export
- Rule-based Copilot with Quick Capture, Draft Actions, Ask the OS, Briefings, Memory Inbox, and smart suggestions
- No browser API keys
- Photo metadata sync only; actual base64 photo data remains local-only

## Recently Changed Areas

Please focus review on:

- `src/lib/actions.ts`
- `src/lib/dataMigrations.ts`
- `src/lib/storage.ts`
- `src/lib/supabase/sync.ts`
- `src/lib/supabase/syncCore.ts`
- `tests/sync-core.test.ts`
- `src/components/AppShell.tsx`
- `src/views/CopilotView.tsx`
- `src/views/SetupView.tsx`
- `src/views/DashboardView.tsx`
- `src/views/ExportView.tsx`
- `src/views/CrewsView.tsx`
- `src/views/AssignmentsView.tsx`
- `src/types.ts`
- `supabase/migrations/20260705230053_add_project_mode_and_crew_scope.sql`
- `docs/CURRENT_STATE.md`
- `docs/ROADMAP.md`
- `docs/TESTING.md`
- `docs/RISKS.md`
- `docs/DECISIONS.md`
- `docs/06_release/GITHUB_PR_WORKFLOW.md`

## Review Roles

Review as:

1. Staff Engineer
2. Principal Product Designer
3. Field Operations Consultant
4. Reliability/Safety Reviewer
5. Mobile PWA QA Lead

## Please Review For

1. Architecture risk
2. Data integrity risk
3. Demo vs Real mode contamination risk
4. Supabase sync risk
5. Local-first/offline risk
6. Mobile PWA field usability
7. Overbuilt screens/features
8. Missing safety checks
9. Testing gaps
10. What should be simplified before adding AI

## Important Constraints

- No API keys in browser
- No official company software claims
- No autonomous AI mutations
- AI must use Draft Actions only
- Reports must not invent data
- Local-first must remain
- Demo data must never pollute real mode
- Keep implementation simple
- Do not suggest a full rebuild
- Do not recommend Phase 5 company-product features yet

## Output Requested

Return:

- Top 10 risks
- Top 10 fixes
- What to do next
- What not to do next
- Code-level concerns
- UX-level concerns
- Mobile field concerns
- Data integrity concerns
- Sync/offline edge cases to test

Make recommendations actionable and incremental.
