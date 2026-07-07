# Roadmap

## Product Direction

PDS / Turn Field Copilot is Los's private field companion for a two-week student housing Turn operation. It should help Los become organized, reliable, and useful under pressure.

It is not official Property Doctor Services software, not a company CRM, and not a multi-user portal.

## Core Loop

Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn

If a feature does not directly improve that loop, challenge it before building.

## Phase 1: Stabilize

Goal: make the app safe to trust with real Turn data on Mac, iPhone, and iPad.

Status: in progress.

Done:

- Demo Mode vs Real Turn Mode
- Start Real Turn flow
- Backup prompt before starting a real project
- Real project setup for property, location, dates, supervisor, project manager, buildings, floors, units, beds, and common areas
- Project-scoped crew contacts
- Dashboard mode labeling
- Supabase migration for project mode and crew project scope
- Production deploy with sync enabled
- Global bottom-right Capture entry point
- Organized/collapsible sidebar for iPad/desktop widths
- Draft Action status clarity for Pending, Applied, Rejected, Failed, and All
- Sync change fingerprinting fix to prevent equivalent Supabase rows from being re-uploaded repeatedly
- Vercel CLI upgraded to `54.21.1`
- PR workflow documented for non-emergency slices

Still required:

- Real-device Mac/iPhone/iPad sync QA
- Verify that the deployed sync fingerprinting fix settles on `Synced` after one manual sync
- Offline/reconnect QA
- Backup/export QA
- PWA install and layout QA
- Confirm demo records do not contaminate real reports or Copilot answers
- Document reset/delete behavior limits
- Decide whether to repeat or accept the previously reported 300-unit stress test evidence
- Add formal parser tests when Phase 1 device QA is no longer blocking

Next PR if sync still cycles:

- Sync status diagnostics showing trigger reason, table activity, row counts, and last error.

Success gate:

Los can create a Real Turn project, use it across Mac/iPhone/iPad, export backups, and know sample data will not pollute real field work.

## Phase 2: Field Experience

Goal: make walking the property effortless.

Candidate work:

- Today view for priorities, blockers, follow-ups, and next checks
- Further Capture speed refinements after the global Capture entry point is field-tested
- Fast unit search / command bar
- Needs Attention queue
- Walk Mode
- Start My Day flow
- End My Day flow
- Owner and follow-up required for blockers
- One-handed iPhone update flow
- Better iPad overview

Success gate:

Los can update a unit in under 10 seconds, log an issue in under 20 seconds, add a capture note in under 15 seconds, and generate a report in under 30 seconds.

## Phase 3: AI Copilot

Goal: reduce typing and thinking load without weakening human approval.

Candidate work:

- Server-side AI route only
- No provider keys in browser code
- Structured output validation
- Messy-note parsing into typed Draft Actions
- Voice transcription workflow
- AI summaries and Tony-ready updates
- Approved memory influence
- Local fallback remains
- Parser eval suite with realistic field notes

Success gate:

Los can dictate messy notes and convert them into accurate Draft Actions that are reviewed before applying.

## Phase 4: Agentic Intelligence

Goal: proactive but human-confirmed intelligence.

Candidate work:

- What should I check next?
- Stale unit detection
- Risk clustering
- Bottleneck detection
- Floor-level issue grouping
- Daily report auto-building
- Follow-up reminders
- Suggested Tony update

Success gate:

The app helps Los think ahead without acting without approval.

## Phase 5: Possible Company Product

Only after field validation and explicit leadership approval.

Possible future:

- Multi-supervisor mode
- Project manager dashboard
- Company workflow integration
- Official reporting
- Permissions
- Audit logs
- Crew communication
- Real-time operations view

Do not build Phase 5 during the current Turn preparation phase.
