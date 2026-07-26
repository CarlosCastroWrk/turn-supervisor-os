# Turn OS Product Constitution

## Status

**Authorized July 28 pattern-candidate doctrine.** This document governs the isolated `codex/jul28-pattern-candidate` program and its child worktrees. It does not change the accepted V2 branch, the production application, the official paper TurnBoard, or any PDS/property process.

## Product Boundary

1. Turn OS is Los's personal supervisor field companion.
2. It is not official PDS software, property software, payroll software, a crew portal, or a client system of record.
3. The official paper TurnBoard and accountable PDS/property processes remain authoritative.
4. Candidate screens use synthetic fixtures until permissions and Moon Tower-specific procedures are confirmed.
5. Property-specific behavior must remain property-scoped and configurable.

## Operational Truth

The product must keep these facts separate:

1. Assignment authorization
2. Occupancy or access restriction
3. Crew assignment
4. Crew-reported completion
5. Los inspection
6. Callback or rework
7. Reinspection
8. Property walkthrough or acceptance
9. Personal paper-reconciliation reminder
10. Official payroll or submitted-board state, which Turn OS does not calculate or control

Crew-reported completion is not Los inspection. Los inspection is not property acceptance. Property acceptance is not paper reconciliation or payroll.

## Interaction Rules

- Preserve raw wording.
- Make data loss loud.
- Never hide a mutation.
- Avoid a generic `Done` state when different facts exist.
- Ambiguity defaults to clarification or a personal Note.
- Keep one Capture owner.
- Voice creates editable source text before any interpretation.
- Every consequential action shows its destination before confirmation.
- Safe reversible personal actions should support Undo.
- No automatic messages, approvals, form submissions, or operational mutations.
- The app remains useful when voice, AI, sync, or the network is unavailable.

## Field UX Rules

- Optimize for one-handed iPhone use while walking.
- A screen's purpose should be understandable in about three seconds.
- Prefer removing duplicate controls over adding another entry point.
- Use 44-point minimum touch targets, visible focus, accessible contrast, safe-area handling, and VoiceOver-compatible labels.
- Respect `prefers-reduced-motion`.
- Do not recreate a dense spreadsheet on a phone.
- Do not ship fake pages or nonfunctional controls.

## Data Safety

- Use synthetic Unit numbers, crew names, contacts, files, and photos during development.
- Do not store tenant data, signatures, W-9/paycard data, raw QR sheets, access codes, or real interior Unit photos.
- Supabase capability does not equal organizational permission.
- Personal data categories, retention, photo handling, and sync eligibility stay configurable and blocked until permission is documented.

## Engineering Rules

- Avoid rebuilding the application from scratch.
- Preserve the accepted V2 Capture, local-first, offline, persistence, backup, and sync safety contracts.
- No destructive migrations or production-data operations.
- Prefer additive, feature-local, rollback-safe work.
- Keep experimental Whisper off by default and separate from browser speech and typing.
- Use synthetic fixtures for every test and Preview.
