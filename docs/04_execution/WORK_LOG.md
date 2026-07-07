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
- Current gate remains real-device Mac/iPhone/iPad sync confirmation before entering real field data.
