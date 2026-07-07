# Implementation Plan

## Current Mission

Make Turn Field Copilot safe enough for Los's real two-week student housing Turn operation before real field data is entered.

## Phase 1: Stabilize

Goal: trust Real Turn Mode across Mac, iPhone, and iPad.

Required before field reliance:

- Verify production sync settles on `Synced` across Mac, iPhone, and iPad.
- Verify offline edits survive reconnect.
- Verify Demo Mode and Real Turn Mode stay separated.
- Verify JSON/CSV/report exports before destructive testing.
- Keep all important Copilot mutations draft-first.
- Keep the app local-first even when Supabase sync is enabled.

Next implementation if sync still cycles:

- Add sync status diagnostics with trigger reason, table activity, upload count, and last error.

## Phase 2: Field Experience

Goal: make walking the property faster and less error-prone.

Candidate slices:

- Faster unit search and filtering.
- Needs Attention queue.
- One-handed unit/issue update flow.
- iPad overview improvements.
- Better Capture speed after real field use.

## Phase 3: Parser And AI Safety

Goal: reduce typing without weakening approval.

Candidate slices:

- Formal parser tests with realistic field notes.
- Server-side AI provider route only if secrets stay server-side.
- Structured output validation.
- Local fallback stays available.

## Phase 4: Reporting And Recovery

Goal: safer daily reporting and recovery.

Candidate slices:

- Restore-from-JSON UI.
- Clearer reset/import recovery flow.
- Report accuracy checks.
- Print/PDF polish.

## Phase 5: Company Product

Only after Turn validation and explicit leadership approval.

Do not build multi-user/company/CRM features during Phase 1.
