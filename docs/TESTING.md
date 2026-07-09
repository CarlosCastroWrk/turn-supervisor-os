# Testing

## Current Gate

Phase 1 is not stable until Real Turn Mode and sync are tested on Los's Mac, iPhone, and iPad.

Use production unless intentionally testing a local development change:

```text
https://turn-supervisor-os.vercel.app
```

## Repo Verification Commands

Run before reporting a code or release slice as verified:

```bash
npm run test:sync
npm run lint
npm run check:os
npm run build
```

Use Supabase checks only when working on migrations or sync setup:

```bash
supabase migration list --linked
supabase db push --dry-run --linked
supabase db lint --linked --fail-on error
```

Do not print secrets or `.env` values.

## Pre-Test Setup

- Use the production URL.
- Export JSON before destructive reset or major sync testing.
- Use obvious test data names such as `QA_TEST_REAL_TURN`.
- Do not enter tenant personal information.
- Do not capture faces, private documents, or sensitive property records.
- Keep Demo Mode available for practice, but enter real testing records in Real Turn Mode.

## Mac / iPhone / iPad Phase 1 Checklist

### 1. Sign In And Baseline Sync

- [ ] Open production on Mac.
- [ ] Open production on iPhone Safari or installed PWA.
- [ ] Open production on iPad Safari or installed PWA.
- [ ] Sign into Supabase sync on all three.
- [ ] Confirm each device shows `Synced`.
- [ ] Confirm Dashboard clearly shows Demo Mode or Real Turn Mode.

Pass:

- All three devices load without console-visible failure or UI dead ends.
- Sync panel is available and understandable.

### 1A. Sync Settling Check

- [ ] On each device, close/reopen or hard-refresh the PWA.
- [ ] Tap `Sync now` once.
- [ ] Wait 60-90 seconds.
- [ ] Confirm the panel settles on `Synced`.
- [ ] Confirm it does not repeatedly cycle through `Syncing`.
- [ ] If cycling continues after the diagnostics deployment, open `Sync details` and record Last trigger, Last table, Last event, Pulled rows, Uploaded rows, Queued, and Last error.

Pass:

- The app settles on `Synced` after one manual sync.
- No duplicate records appear.

If it keeps cycling, do not enter real field data yet. Use `Sync details` to identify whether the loop is caused by Realtime, reconnect, auth/session changes, local edits, upload failures, or queued sync runs.

### 1B. Sync Diagnostics Check

- [ ] Open the sync panel after the app says `Synced`.
- [ ] Open `Sync details`.
- [ ] Confirm idle Realtime/background checks do not flip the summary back to `Syncing`.
- [ ] Confirm `Background checks` may increase while the visible status remains `Synced`.
- [ ] Confirm manual `Sync now`, `Pull cloud`, and `Upload this device` still show clear foreground sync status.
- [ ] If a device keeps cycling, record the diagnostics values before refreshing.

Pass:

- Idle devices stay visually stable on `Synced`.
- The diagnostics identify the last trigger and table without exposing secrets.
- Blue `Syncing` is reserved for manual sync, initial startup sync, reconnect sync, or real local uploads.

### 2. Real Turn Mode Creation

- [ ] On Mac, go to Setup.
- [ ] Export JSON backup.
- [ ] Create `QA_TEST_REAL_TURN` with known building/floor/unit counts.
- [ ] Confirm Dashboard says Real Turn Mode.
- [ ] Confirm Demo Mode remains available in Setup.
- [ ] Confirm real units appear in Units.
- [ ] Confirm demo units are not mixed into the real board.

Pass:

- A real project is created without deleting demo data.
- Active real board only shows real project records.

### 3. Cross-Device Realtime Sync

- [ ] Mac creates or updates a test unit.
- [ ] iPhone sees the update without tapping Sync.
- [ ] iPhone updates a different test unit.
- [ ] iPad sees the update without tapping Sync.
- [ ] iPad creates a test issue.
- [ ] Mac sees the issue without tapping Sync.
- [ ] Mac creates or updates a daily log.
- [ ] iPhone sees the daily log without tapping Sync.

Pass:

- Updates appear within seconds.
- No duplicate projects, units, issues, or logs appear.
- Demo records do not reappear in Real Turn views.

If updates only appear after `Pull cloud` or `Sync now`, manual sync works but Realtime needs debugging.

### 4. Offline / Reconnect

- [ ] On iPhone, turn on airplane mode.
- [ ] Update 3-5 test records.
- [ ] Refresh or close/reopen if safe.
- [ ] Confirm local changes remain visible.
- [ ] Turn airplane mode off.
- [ ] Wait for sync or tap `Sync now` if needed.
- [ ] Confirm Mac and iPad receive the updates.

Pass:

- No silent data loss.
- Sync state is understandable.
- Offline edits eventually reach the other devices.

### 5. Backup / Export

- [ ] Export JSON.
- [ ] Export units CSV.
- [ ] Export issues CSV.
- [ ] Export daily report text.
- [ ] Export Copilot/Memory Markdown if populated.
- [ ] Export Follow-Ups CSV if populated.

Pass:

- Downloads complete.
- File contents contain only expected project/test records for the chosen export.
- Reports do not invent counts.

### 5A. Photo Storage Safety

- [ ] Open a QA unit.
- [ ] Add one work-safe test photo.
- [ ] Confirm the app shows a photo compression/saved message.
- [ ] Reload the app.
- [ ] Confirm the photo thumbnail and caption remain visible on that unit.
- [ ] Confirm normal unit edits still save after the photo is added.

Pass:

- Photo capture does not freeze the app.
- The photo is compressed before saving.
- A reload does not lose the photo or nearby unit data.

### 6. Reset / Delete Safety

- [ ] Export JSON before reset.
- [ ] Read the reset warning copy.
- [ ] Confirm the warning explains local-only reset and possible cloud pull-back.
- [ ] Do not reset real field data unless Los explicitly decides the backup/restore path is acceptable.

Pass:

- Reset behavior is understandable and not easy to trigger accidentally.

### 7. PWA / Mobile Usability

- [ ] Add production app to iPhone Home Screen.
- [ ] Add production app to iPad Home Screen.
- [ ] Check Dashboard, Units, Unit Detail, Capture, Reports, Setup, and Export.
- [ ] Confirm the bottom-right Capture button is available across tabs.
- [ ] Confirm Capture is not duplicated in the bottom nav.
- [ ] Confirm Capture opens as a focused capture/review flow, with older draft history collapsed by default.
- [ ] Confirm iPad sidebar opens/closes cleanly.
- [ ] Confirm no horizontal overflow.
- [ ] Confirm bottom navigation and secondary navigation are reachable.
- [ ] Confirm primary buttons have usable touch targets.
- [ ] Time a unit update.
- [ ] Time an issue log.
- [ ] Time a report generation.

Pass:

- Unit update under 10 seconds.
- Issue log under 20 seconds.
- Capture note under 15 seconds.
- Report generation under 30 seconds.

## Phase 1 Exit Criteria

- [ ] Real Turn Mode tested on Mac.
- [ ] Real Turn Mode tested on iPhone.
- [ ] Real Turn Mode tested on iPad.
- [ ] Supabase sync tested across all three.
- [ ] Demo data does not appear in Real Mode.
- [ ] Reset flow tested safely.
- [ ] Backup/export tested.
- [ ] Offline behavior tested.
- [ ] PWA install tested.
- [ ] Mobile layout tested.
- [ ] Build passes.
- [ ] Lint passes.
- [ ] `check:os` passes.
- [ ] No API keys exposed.
- [ ] Docs updated.
- [ ] Known risks documented.

## PR Verification Gate

For normal non-emergency work:

- [ ] Branch created from `main`.
- [ ] Only intended files are staged.
- [ ] Relevant checks pass.
- [ ] Draft PR opened.
- [ ] PR explains what changed, why, verification, and remaining risks.
- [ ] No production deploy unless explicitly approved.
