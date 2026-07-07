# QA Plan

## Current Gate

Phase 1 is not stable until production sync, offline behavior, mobile usability, and export/backup are verified on Los's Mac, iPhone, and iPad.

## Verification Levels

- Static review: docs and source inspection.
- Automated checks: `npm run test:sync`, `npm run lint`, `npm run build`, and `npm run check:os`.
- Production smoke: public URL returns 200 and the PWA boots without console errors.
- Real-device QA: Mac/iPhone/iPad sync and offline checklist in `docs/TESTING.md`.
- Regression review: inspect staged diff before commit or PR.

## Required Commands For Code Slices

```bash
npm run test:sync
npm run lint
npm run build
npm run check:os
git diff --check
```

Run Supabase CLI checks only when a slice touches migrations or remote schema.

## Current Manual Tests

- Sync settling: one `Sync now`, wait 60-90 seconds, confirm `Synced`.
- Cross-device update: unit, issue, daily log, and follow-up across Mac/iPhone/iPad.
- Offline edit: airplane mode changes survive reconnect.
- Demo vs Real separation: real reports and Copilot answers do not use demo records.
- Capture flow: bottom-right Capture, Create Drafts, approve/reject/applied/failed states.
- Mobile layout: no horizontal overflow on iPhone width; sidebar collapses on iPad width.
- Export/backup: JSON, units CSV, issues CSV, daily report, Copilot/Memory Markdown, Follow-Ups CSV.

## Release Gate

Do not mark a slice complete unless:

- Requirements are linked to acceptance criteria.
- Relevant checks were run and recorded.
- Known risks are documented.
- Los has approved irreversible action.
- PR or hotfix workflow was followed.
