# QA Plan

## Verification Levels

- Static review: docs and source inspection.
- Automated checks: typecheck, lint, tests, build when commands exist.
- Targeted smoke checks: verify the core workflow manually or with a browser/API script.
- Regression review: inspect diff before completion.

## Current State

Runtime exists. Relevant checks are:

- `npm run build`
- `npm run lint`
- `npm run check:os`
- Browser smoke checks for dashboard, unit update, issue creation, crew check-in, daily log save, report copy/download, and export.
- Copilot smoke checks for Quick Capture parsing, draft action apply, memory approval, Ask the OS, briefing generation, and mobile layout.
- Ready-gate smoke check: incomplete inspection must appear in the confirmation dialog, and dismissing the dialog must leave the unit unchanged.
- Mobile secondary-navigation smoke check: Export must be reachable on iPhone width.

## Release Gate

Do not mark a slice complete unless:

- Requirements are linked to acceptance criteria.
- Relevant checks were run and recorded.
- Known risks are documented.
- Los has approved any irreversible action.
