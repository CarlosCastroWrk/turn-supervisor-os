# Master Prompt Intake

The master prompt has been provided and normalized into the active project docs.

## Raw Prompt Location

- [../../MASTER_PROMPT.md](../../MASTER_PROMPT.md)

## Extracted Intent

- Product: PDS / Turn Field Copilot
- Audience: Los, supervising a two-week student housing Turn operation
- Primary workflow: Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn
- Outcome: Make Los organized, reliable, and useful under real field pressure
- Non-negotiables: Local-first, draft-first Copilot, demo/real data separation, export/backup, no browser API keys
- Explicit exclusions: No official company software, CRM, multi-user portal, automatic texting, payroll, or autonomous AI mutations

## Constraints

- Time: Phase 1 must be safe before real field reliance
- Budget: Keep changes narrow and low-dependency
- Stack: React + TypeScript + Vite PWA, Supabase sync, Vercel production
- Data: LocalStorage hot cache with optional Supabase sync overlay
- Security: No secrets in browser, no tenant PII, RLS in Supabase
- Deployment: Vercel production at `https://turn-supervisor-os.vercel.app`

## Ambiguities

| Question | Why It Matters | Default Assumption | Needs Los? |
| --- | --- | --- | --- |
| Does the latest sync fix settle on real devices? | Determines whether to build diagnostics next | Test Mac/iPhone/iPad before real field data | Yes |
| What is the real training workflow? | Prevents overbuilding wrong field features | Keep Phase 1 stabilization-first | Yes |
| Is photo binary sync required before Turn? | Affects storage and offline risk | Local-only photos are acceptable unless field use proves otherwise | Yes |

## First Pass Decision

- Proceed: Phase 1 stabilization, real-device QA, PR workflow for non-emergency slices
- Ask: Confirm real-device sync result after one manual sync and 60-90 seconds
- Blocked by: Field workflow details until training clarifies real Turn process
