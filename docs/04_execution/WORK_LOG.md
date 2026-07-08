# Work Log

## 2026-07-04

- Created project operating-system scaffold.
- Left runtime stack undecided pending master prompt.
- Implemented Turn Supervisor OS v0.1 as a React + TypeScript + Vite app.
- Added localStorage persistence, seed data, PWA manifest, service worker, exports, dashboard, setup, units, unit detail, issues, crews, assignments, daily log, reports, training questions, and export views.
- Added draft-first Copilot with local deterministic parser, Draft Actions Inbox, Memory Inbox, Ask the OS, Briefings/Reports, smart suggestions, Zod validation, and no browser API key path.
- Reviewed Fable 5 audit report; verified existing fixes, tightened Unit Detail Ready confirmation to include inspection, made secondary navigation reachable on mobile, and added explicit Copilot/Memory Markdown plus Follow-Ups CSV exports.

## 2026-07-05

- Accepted the product direction shift from a small operations system toward a personal Turn Field Copilot.
- Added Phase 1 stabilization: Demo Mode vs Real Turn Mode, Start Real Turn setup, backup-before-reset copy, dashboard mode labeling, and project-scoped crew contacts.
- Added and applied a Supabase migration for project mode and crew project scope before deploying the stabilization slice.

## 2026-07-06

- Aligned operating docs around the Turn Field Copilot framing and Phase 1 Stabilize gate.
- Added roadmap, testing checklist, risk register, decision log, and Fable 5 review prompt for real-device QA and external review.

## 2026-07-07

- Shipped global bottom-right Capture, organized/collapsible sidebar, and Draft Action status clarity.
- Shipped sync change fingerprinting fix so equivalent Supabase timestamp and JSON shapes do not trigger repeated false uploads.
- Upgraded local Vercel CLI to `54.21.1` after Los explicitly approved.
- Adopted pull requests for normal non-emergency slices; direct `main` commits are reserved for urgent approved hotfixes.
- Started sync status diagnostics after Los reported continued green/blue sync cycling on real devices.
- Added quiet background Realtime checks so idle devices should stay visually `Synced` while still pulling cloud changes.
- Added visible Sync details for trigger, table, event, row counts, queued state, and last error.
- Reviewed the Fable 5 full product/UX/code audit and started the P0 storage/photo safety slice.
- Converted the Fable 5 audit into a dedicated execution roadmap, updated the build queue, and defined the slice-by-slice release loop.
- Updated repo policy after Los granted standing release authorization for scoped, non-destructive code/docs slices after checks pass.
- Preserved corrupt local cache payloads before seed fallback.
- Added client-side photo compression before saving captured photos into local app state.
- Started A2 Draft Apply Safety after shipping storage/photo safety.
- Added active-project scoping for draft unit-number lookup and assignment unit matching.
- Added enum validation for draft unit status and issue payloads, plus regression tests for duplicate unit numbers and invalid payloads.
- Current gate remains real-device Mac/iPhone/iPad sync confirmation before entering real field data.

## 2026-07-08

- Shipped A2 Draft Apply Safety in `6697278`.
- Started A3 Number Input Safety on `codex/number-input-safety`.
- Added shared integer input behavior for setup/count fields so zero-valued fields can be typed into without creating leading-zero drafts.
- Added regression tests for `020`, `08`, blank drafts, and pasted numeric text.
- Shipped A3 Number Input Safety in `6c34eb8`.
- Started A4 Report Date Safety on `codex/report-date-safety`.
- Made daily reports use the selected report date explicitly and label missing-log reports as draft/missing-data.
- Added regression tests so past empty report dates cannot fall back to today's report.
- Shipped A4 Report Date Safety in `72ddd4a`.
- Started A5 Issue Status Safety on `codex/issue-status-safety`.
- Added explicit `Blocks this unit` controls so issue creation is issue-only unless Los chooses to change the linked unit status.
- Added regression tests for non-blocking issue creation, explicit blocking, and issue resolution not changing unit status.
