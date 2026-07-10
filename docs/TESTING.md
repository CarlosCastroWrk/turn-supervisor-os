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
npm run test:field-scale
npm run lint
npm run check:os
npm run build
```

## Automated Field-Scale Gate

Run after changes to Setup, Units, Capture, Reports, exports, backups, storage, or large-list behavior:

```bash
npm run test:field-scale
```

The gate uses disposable local QA data only. It verifies:

- a 300-unit Real Turn created through the rendered Setup flow;
- Demo/Real separation and 100-at-a-time Unit rendering;
- Unit search and global Capture access;
- desktop, iPad-landscape, and iPhone layouts without horizontal overflow or console errors;
- a 1,000-unit state with 10,000 activity events under 4x CPU throttling;
- a full 10,000-entry Activity window that retains each new field action while rolling off one oldest raw entry;
- large-state Report rendering and an honest missing-Daily-Log warning.
- iPhone-size Daily Log save, reload, and update with exactly one deterministic project/date row.

Baseline recorded July 9, 2026:

- 300-unit Unit boards loaded in about 0.6 seconds in local Chromium at all three viewports.
- The 1,000-unit board loaded in about 1.2 seconds under 4x CPU throttling.
- The 1,000-unit / 10,000-event AppData payload was 3,046,822 JSON characters before photo files.
- Under 4x CPU throttling, 26 rapid project-field updates produced 7 full-state storage writes instead of 26, and a synthetic `pagehide` flushed the latest pending value in one write.
- With session-backed commit-on-blur fields enabled, the same 26-character edit took about 0.22 seconds under 4x CPU throttling, produced no AppData mutation while focused, then committed as one activity event and one full-state write on blur.
- An interrupted focused text edit survived a same-session reload, remained separate from authoritative AppData until review, and committed once after focus/blur.
- Changing an existing Project estimate from 1,000 to 1,250 produced no activity or full-state write while focused, then exactly one activity event and one write on Enter.
- The rendered Start Real Turn path still generated 300 units from ten floors and thirty units per floor, guarding the blur-then-submit ordering used by transient numeric forms.
- The rendered Quick Unit Creation path generated twelve Units with four beds and three baths, including the final number committed by clicking Create Units directly.
- A Daily Log saved, survived reload, updated in place, and retained one deterministic project/date ID without overflow or console findings.
- A 10,000-entry Activity cache stayed at exactly 10,000 through text, date, and numeric commits while each newest action remained present and each commit produced one full-state write.

These timings are regression signals, not physical iPhone/iPad acceptance. B3 offline/reconnect, F2 cross-device photo sync, Home Screen restart, outdoor contrast, and VoiceOver still require Los's real devices.

## Automated Three-Device Sync Gate

`npm run test:sync` includes a disposable in-memory cloud regression for Mac, iPhone, and iPad behavior. It does not read or change production Supabase data. The gate verifies:

- disjoint Unit, Issue, and activity edits survive twelve simulated offline hours without duplicate rows;
- the newest same-row edit wins in all six three-device reconnect orders;
- exact-timestamp conflicts settle on the same whole-row winner instead of alternating uploads;
- applied, rejected, and failed Draft Actions cannot be replaced by a stale pending copy during a timestamp tie.
- overlapping stale uploads recover the newest timestamp on the next cloud pass and then stop uploading.
- 10,000 existing equal-timestamp rows complete deterministic comparison within a two-second regression ceiling.
- same-day Daily Logs converge to one row across all six three-device reconnect orders, including an existing legacy cloud ID.
- Activity normalization keeps a deterministic 10,000-entry window, prioritizes the active Turn and required legacy provenance, and bounds Activity cloud pulls to ten ordered 1,000-row pages.

This remains whole-row last-write-wins. Supabase upserts are not timestamp-conditional, so two truly overlapping uploads can briefly leave an older row in cloud state until the newer device receives or initiates another sync pass. The gate does not merge independent fields from simultaneous edits to the same record, correct a device clock that is far ahead, prove Realtime delivery, or replace the physical airplane-mode checklist below.

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

- [ ] Export Full Device JSON Backup.
- [ ] Export units CSV.
- [ ] Export issues CSV.
- [ ] Export daily report text.
- [ ] Export Copilot/Memory Markdown if populated.
- [ ] Export Follow-Ups CSV if populated.

Pass:

- Downloads complete.
- File contents contain only expected project/test records for the chosen export.
- Reports do not invent counts.
- The full-device recovery backup is kept private and is not mistaken for a project report.

### 5A. JSON Restore Safety

- [ ] Use only an expendable browser profile/device with obvious QA data.
- [ ] Select an invalid JSON file and confirm the app says no local data changed.
- [ ] Select a structurally corrupt backup such as one with no projects and confirm existing project/unit counts remain unchanged.
- [ ] Select a known valid backup, read the replacement count confirmation, and cancel once.
- [ ] Repeat, approve the valid restore, reload, and confirm project/unit/issue counts persist exactly.

Pass:

- Invalid or unsafe files never replace local state.
- A valid current or supported legacy backup restores only after explicit confirmation.
- Restored state survives reload without console errors or horizontal overflow.

### 5B. Photo Storage Safety

- [ ] Open a QA unit.
- [ ] Add one work-safe test photo.
- [ ] Confirm the app says the photo was saved offline on this device.
- [ ] Reload the app.
- [ ] Confirm the photo thumbnail and caption remain visible on that unit.
- [ ] Confirm normal unit edits still save after the photo is added.
- [ ] Export Full Device JSON Backup and confirm the completion message reports local photo files included or missing.
- [ ] Restore only into an expendable QA browser/device and confirm restored thumbnails return after migration.

Pass:

- Photo capture does not freeze the app.
- The photo is compressed before saving.
- Normal photo bytes live in IndexedDB instead of the main `localStorage` app record.
- A reload does not lose the photo or nearby unit data.
- JSON backup includes every photo file available on that device and reports unavailable files.

### 5C. Cross-Device Photo Sync

- [ ] Use a work-safe Real Turn QA unit; do not use Demo Mode or tenant/private content.
- [ ] On iPhone or iPad, add one small photo with an obvious QA caption.
- [ ] Confirm the app says the photo saved locally first.
- [ ] Tap `Sync now` once and open Sync details.
- [ ] Confirm `Photo files uploaded` is `1` and `Photo files waiting` is `0`.
- [ ] Open the same unit on Mac and the other mobile device, then sync/pull if Realtime has not arrived yet.
- [ ] Confirm the thumbnail downloads, the caption is correct, and `Cloud copy ready` appears.
- [ ] Reload each device and confirm the thumbnail remains visible.
- [ ] Put one receiving device offline after its first download and confirm the cached thumbnail still appears.

Pass:

- The capture device never loses the local photo while upload is pending.
- The private file appears only for Los's signed-in account.
- A failed upload stays retryable and does not block ordinary record sync.
- No duplicate photo record appears after repeated `Sync now` taps.

### 5D. Project-Scoped Memory

- [ ] In Demo Mode, Capture an obvious QA lesson and confirm Setup shows it under `Needs approval` for the Demo project.
- [ ] Approve it, switch to a Real Turn, and confirm the Demo lesson is absent while explicit `All Turns` personal/safety rules remain.
- [ ] In the Real Turn, Capture and approve an obvious QA lesson and crew fact.
- [ ] Confirm the crew fact appears in Crews and the lesson appears only after `Draft empty sections` in Daily Log.
- [ ] Confirm the generated lesson remains unsaved until `Save Daily Log` is pressed.
- [ ] Switch back to Demo Mode and confirm the Real Turn lesson/crew fact is absent.
- [ ] On a second signed-in device, sync and confirm the same project boundaries and approval states remain.
- [ ] If Setup shows `Needs project scope`, confirm the legacy record is inactive until `Use for current Turn` is pressed.

Pass:

- Only approved current-project Memory and explicit global personal/safety rules affect output.
- Demo, archived, unapproved, rejected, missing-source, other-project, and legacy unscoped operational Memory do not affect the active Turn.
- Repeating the same captured fact does not create a duplicate candidate or duplicate approved Memory.

### 5E. Active Project Boundary

- [ ] Create or use obvious Demo and Real Turn QA records with the same Unit number.
- [ ] In Demo Mode, Capture one pending Unit draft and one generic follow-up, then switch to the Real Turn.
- [ ] Confirm the Demo drafts are absent from Real Turn Capture history.
- [ ] Capture and approve the same Unit number in Real Turn; confirm only the Real Turn Unit changes.
- [ ] Export Units, Issues, Daily Logs, Copilot/Memory, and Follow-Ups from Real Turn using obvious `REAL_`/`DEMO_` sentinel text.
- [ ] Confirm every human-readable export contains only `REAL_` records.
- [ ] Export Full Device JSON Backup and confirm both `REAL_` and `DEMO_` records remain present for recovery.

Pass:

- Same-number Demo and Real Turn Units cannot be crossed by Draft approval.
- Switching Turns immediately changes visible Capture history.
- Human-readable files are current-Turn only; full-device backup remains intentionally complete.
- Demo or unverifiable drafts and follow-ups are not uploaded as Real Turn cloud work.

### 5F. Daily Log And Restore Safety

- [ ] On Mac, iPhone, and iPad, open the same Real Turn and select the same Daily Log date.
- [ ] Put all three devices offline, add clearly labeled QA text on each, then reconnect them one at a time.
- [ ] Confirm one Daily Log remains for that date and the newest timestamped whole-row content settles on all devices.
- [ ] While signed into Supabase, open Export and tap Restore JSON Backup.
- [ ] Confirm the file picker does not open and the app instructs Los to sign out first.
- [ ] Sign out, confirm restore becomes available, then cancel without replacing field data.
- [ ] For an actual QA restore, review/export the recovered local data before signing in again.

Pass:

- One project/date produces one Daily Log across devices without a cloud uniqueness error.
- Existing legacy Daily Logs update in place.
- Restore cannot begin until auth is resolved and signed out.
- The UI explains that signing in later can merge newer cloud rows.

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
- [ ] Confirm the installed icon is the dark Turn checklist icon rather than a generic browser thumbnail.
- [ ] Open each installed PWA online once and wait for the Dashboard to finish loading.
- [ ] Enable airplane mode, fully close the PWA, reopen it from the Home Screen, and confirm the local Dashboard loads.
- [ ] While still offline, open Units, one Unit, Capture, and Reports; close/reopen once more and confirm the current local data remains.
- [ ] Rotate iPad between portrait and landscape and confirm the app follows the device instead of staying portrait-locked.
- [ ] Check Dashboard, Units, Unit Detail, Capture, Reports, Setup, and Export.
- [ ] Confirm the bottom-right Capture button is available across tabs.
- [ ] Confirm Capture is not duplicated in the bottom nav.
- [ ] Confirm Capture opens as a focused capture/review flow, with older draft history collapsed by default.
- [ ] In installed iPhone/iPad PWA mode, open Voice Mode and confirm it offers keyboard mic fallback instead of waiting on a blank browser transcript.
- [ ] Confirm iPad sidebar opens/closes cleanly.
- [ ] Confirm no horizontal overflow.
- [ ] Confirm bottom navigation and secondary navigation are reachable.
- [ ] Confirm primary buttons have usable touch targets.
- [ ] In direct sunlight or a bright room, confirm secondary text, status chips, and focus/tap states remain readable.
- [ ] With a hardware keyboard on iPad or Mac, press Tab from page start, use `Skip to main content`, and confirm focus remains visible through navigation and forms.
- [ ] Enable VoiceOver on iPhone/iPad and confirm Dashboard stats, Units navigation, progress, Voice Capture controls, and Unit quick actions have understandable names and values.
- [ ] In Voice Capture, confirm focus starts on Close, remains inside the sheet, Escape closes it with a keyboard, and focus returns to Voice Mode.
- [ ] Enable Reduce Motion and confirm route/issue navigation does not use smooth scrolling.
- [ ] Tap a Unit quick-status action, confirm the board changes immediately, then tap Undo and confirm the previous status returns.
- [ ] Tap a Unit quick-status action, change the same Unit again, then use the older Undo and confirm it refuses to overwrite the newer edit.
- [ ] On an Access Blocked or Maintenance Needed Unit, tap Paint/Clean/Repair and confirm the harder overall blocker is not silently cleared.
- [ ] Repeat a quick status that is already set and confirm no new activity is recorded.
- [ ] Confirm Undo remains available while its button has keyboard focus and that Undo/Dismiss targets are at least 44px.
- [ ] Trigger an empty Issue title or invalid Quick Unit Creation and confirm feedback appears without a blocking browser popup.
- [ ] Confirm reset/restore, project archive/start, unsaved Daily Log changes, and unsafe Ready override still require confirmation.
- [ ] Time a unit update.
- [ ] Time an issue log.
- [ ] Time a report generation.

Pass:

- Unit update under 10 seconds.
- Issue log under 20 seconds.
- Capture note under 15 seconds.
- Report generation under 30 seconds.
- A fully closed installed PWA reopens with the cached shell and local field records while offline.

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
- [ ] Any required Supabase migration has fresh explicit approval and is applied before deploying client code that depends on it.
