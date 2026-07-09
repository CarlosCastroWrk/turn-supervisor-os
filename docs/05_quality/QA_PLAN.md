# QA Plan

## Current Gate

Phase 1 is not stable until production sync, offline behavior, mobile usability, storage/photo safety, and export/backup are verified on Los's Mac, iPhone, and iPad.

Baseline sync now settles on Los's real devices. The next real-device gate is offline/reconnect QA.

## Quality Philosophy

The app must survive field pressure:

- walking quickly
- dirty hands
- poor internet
- interruptions
- low battery
- small iPhone screens
- iPad landscape
- Mac office view
- hundreds of units/issues/events
- accidental taps
- reloads and PWA restarts

Every slice should try to fail before the field does.

## Verification Levels

Static review:

- Read source and docs before edits.
- Verify scope against [FABLE5_EXECUTION_ROADMAP.md](../04_execution/FABLE5_EXECUTION_ROADMAP.md).
- Review diff for unintended product scope changes.

Automated checks:

- `npm run test:sync`
- `npm run lint`
- `npm run check:os`
- `npm run build`
- `git diff --check`

Production-env build:

- `vercel env run -e production -- npm run build`

Targeted browser smoke:

- Use Playwright with mobile and desktop viewports when UI changes.
- Verify no console/page errors.
- Verify no horizontal overflow.
- Verify the changed workflow actually works.

Real-device QA:

- Mac/iPhone/iPad sync and offline checklist in [docs/TESTING.md](../TESTING.md).
- Required for sync/offline/storage/PWA-sensitive releases.

Production smoke:

- `curl -I https://turn-supervisor-os.vercel.app`
- Fresh mobile browser boot.
- Confirm sync panel and Capture render.
- Confirm no console/page errors.

## Required Commands For Code Slices

```bash
npm run test:sync
npm run lint
npm run check:os
npm run build
git diff --check
```

## Slice-Specific Stress Tests

### Storage And Photos

- Add a test photo to a QA unit.
- Confirm compression/saved message appears.
- Reload and confirm thumbnail/caption persist.
- Confirm normal edits still save after adding the photo.
- Confirm photo bytes are in IndexedDB and not the main localStorage record.
- Export a photo-complete JSON backup and verify included/missing photo counts.
- Stress at least 200 photo records and confirm the unit page remains bounded to six rendered thumbnails.
- Capture one work-safe Real Turn photo, sync it from one physical device, and confirm the other two devices lazy-download and cache the same private file.
- Repeat `Sync now` and confirm the photo record/file does not duplicate.
- Inject corrupt local cache and confirm bad payload is preserved.
- Confirm app still boots after fallback.

### Sync And Offline

- Reopen PWA on Mac, iPhone, and iPad.
- Tap `Sync now` once.
- Wait 60-90 seconds.
- Confirm `Synced`.
- Turn airplane mode on for one device.
- Edit 2-3 QA records.
- Reconnect.
- Confirm other devices receive changes.
- If cycling occurs, record Sync details.

### Parser And Capture

- Run parser fixtures.
- Test punctuation-free voice/dictation notes.
- Verify draft counts and targets.
- Reject one draft, approve one draft, approve batch if applicable.
- Confirm applied drafts point to changed records.
- Confirm stale drafts are not accidentally applied.

### Dashboard And Navigation

- Desktop, iPad landscape, iPad portrait, and iPhone viewports.
- No horizontal overflow.
- Sidebar open/close works.
- Bottom-right Capture remains accessible.
- Tappable cards navigate to filtered/detail views.
- Browser back/reload works if routing is touched.

### Units And Issues

- Create issue by form.
- Create issue by capture.
- Resolve or remove accidental issue.
- Confirm unit status does not change unless explicitly intended.
- Filter/sort blocked, in-progress, inspection, ready.

### Reports

- Generate current-day report.
- Generate past-date report.
- Confirm selected date is respected.
- Confirm missing data is not presented as completed work.
- Preview before export/print.

### Setup

- Start a small QA project.
- Type numeric fields from zero and confirm no leading-zero bug.
- Archive duplicate/test project only after backup prompt.
- Confirm real/demo separation after archive.

## Release Gate

Do not mark a slice complete unless:

- Requirements are linked to acceptance criteria.
- Relevant commands passed.
- Targeted smoke checks passed.
- Known risks are documented.
- Diff was reviewed for unrelated changes.
- The action is covered by Los's standing release authorization, or Los separately approved any irreversible/destructive action.
- PR or approved hotfix workflow was followed.

## Production Gate

After production deploy:

- Confirm deploy is Ready/Aliased.
- Confirm production URL returns HTTP 200.
- Run mobile boot smoke.
- Run the real-device check if the slice changes sync/offline/storage/PWA behavior.
- Update docs/current state only with verified facts.
