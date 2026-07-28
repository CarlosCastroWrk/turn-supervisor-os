# Wave 2A.2 Acceptance Matrix

This matrix is the release gate for the Wave 2A.2 non-production candidate.
Automated checks do not replace Los's physical iPhone Safari and Home Screen PWA
acceptance.

## Theme and shell

- [ ] System follows the device appearance and is the default.
- [ ] Light and Dark are readable on every user-facing route.
- [ ] Theme preference survives refresh and reopen.
- [ ] Header, content, sheets, toasts, inputs, and bottom navigation use one
      semantic token system.
- [ ] Reduced motion removes nonessential transitions.
- [ ] Browser/PWA theme color follows the active theme without a wrong-theme
      flash.
- [ ] Primary navigation is exactly Home, TurnBoard, Plus, Activity, More.
- [ ] Search and Notifications use the shared shell.
- [ ] Detail routes have one Back action and open at the top.
- [ ] Returning from Unit detail may restore the TurnBoard list position.
- [ ] Sheets do not move the page underneath.
- [ ] Browser Back/Forward remains deterministic.

## Mobile ergonomics

- [ ] No horizontal overflow at 320px, 390px, or 430px.
- [ ] iPad landscape and Mac remain usable without stretched mobile controls.
- [ ] Interactive targets are at least 44px where field use requires them.
- [ ] Text inputs are at least 16px on iPhone.
- [ ] Keyboard open/close does not hide the active control or bottom action.
- [ ] Safe areas are respected in Safari and the installed PWA.
- [ ] VoiceOver exposes useful names, order, state, and focus return.

## Today's Task and Day Session

- [ ] Property roster and Daily Release Batch remain separate.
- [ ] No confirmed release shows `Import today's released work`.
- [ ] Start Day requires explicit review and confirmation.
- [ ] Only one active Day Session exists per account/property.
- [ ] Key status is recorded separately from release authorization.
- [ ] Paint and Clean crews are confirmed separately.
- [ ] Today's Task contains only confirmed released work.
- [ ] Progress names scope, metric, milestone, actual, and target.
- [ ] Working, Waiting, Callbacks, and Ready to walk open exact records.
- [ ] Events distinguish `occurredAt` from `recordedAt`.
- [ ] End Day shows deterministic totals and unresolved work.
- [ ] End Day can close with unresolved work after a warning.
- [ ] An active session restores after close/reopen.
- [ ] Date rollover offers Resume, Review and close, or Reopen as correction.

## Import

- [ ] First screen is Camera, Photos, File, Paste Text, Manual.
- [ ] Property Roster and Daily Release are separate import modes.
- [ ] CSV and pasted text produce a draft preview.
- [ ] Image/PDF sources say extraction is unavailable.
- [ ] No image silently creates Units or released work.
- [ ] Original source reference is retained when permitted.
- [ ] Duplicate, uncertainty, and conflict rows are visible.
- [ ] Explicit confirmation is required before release.
- [ ] 500-row roster and 40-Unit release remain vertically usable.

## TurnBoard and crews

- [ ] Several compact Unit rows fit on one iPhone screen.
- [ ] Unit type and applicable Common/A-E sections remain explicit.
- [ ] Paint and Clean stay independent.
- [ ] Release, access, assignment, work, crew report, Los inspection, callback,
      property acceptance, and paper review stay independent.
- [ ] No whole-Unit `Done` action exists.
- [ ] Only confirmed released sections can be assigned.
- [ ] Crew detail opens before Edit.
- [ ] Crew counts derive only from confirmed personal-app events.
- [ ] Bulk assignment warns on unreleased, duplicate, access, occupancy, and
      uncertain-source conflicts.
- [ ] No payroll, ranking, payment, or blame metric exists.
- [ ] 500-Unit search/scroll remains usable.

## Walk and paper boundary

- [ ] Start Walk candidates are Los-passed, property-walk-pending, unblocked,
      and not already accepted.
- [ ] A walk records contact, selected trade-sections, and start time.
- [ ] Accepted, Correction requested, Not walked, and Deferred remain distinct.
- [ ] Correction preserves the responsible crew and creates reinspection work.
- [ ] Paint and Clean cannot be accepted together by one generic Unit action.
- [ ] Personal PDS Approved mirror requires recorded property acceptance and
      explicit confirmation.
- [ ] The mirror records identity/time only; no legal signature.
- [ ] Every consequential mirror reminds Los to update paper.
- [ ] No action changes payroll or submits an official form.

## Notes, photos, Activity, and forms

- [ ] New Note starts blank; Resume Draft is explicit.
- [ ] Note and Photo save directly without Capture/Draft Actions/Apply/Daily Log.
- [ ] Save receipts provide View and Undo.
- [ ] Linked notes/photos appear in Unit history and the active Day Session.
- [ ] Activity is filterable and each item is tappable.
- [ ] Activity shows actor, time, Unit, trade-section, source, and boundary.
- [ ] Draft or model output is not an event before Los confirms it.
- [ ] Official Change Order, Backup Safety, and Turn Sign-Off links are always
      available and open externally.
- [ ] Official forms are not prefilled, submitted, scraped, or signed by Turn OS.

## Persistence and recovery

- [ ] Existing AppData loads with backward-compatible defaults.
- [ ] Existing Units, notes, photos, and Activity remain readable.
- [ ] New collections are scoped to account/property.
- [ ] Local sync merge preserves local-only Wave 2A.2 records.
- [ ] JSON backup includes the new local records.
- [ ] Restore validates and restores the new records.
- [ ] Invalid new records fail closed without replacing current data.
- [ ] Offline edits survive close/reopen.
- [ ] No Supabase schema or remote migration changes.
- [ ] No fixture becomes real data automatically.

## Regression and release

- [ ] Lint passes.
- [ ] Full deterministic suite passes with every committed test in the manifest.
- [ ] Production build passes.
- [ ] Cache ownership, Capture workspace, one-Capture-owner, board-first,
      persistence/photo, production recovery, and Wave 2A.1 gates pass.
- [ ] Route/theme browser audit passes in Light and Dark.
- [ ] No duplicate dialog or sheet owner exists.
- [ ] Before/after screenshots are compared at matching states and viewports.
- [ ] One protected non-production Vercel Preview is READY.
- [ ] Production, protected checkouts, and production data remain untouched.
- [ ] Los completes physical iPhone Safari/PWA acceptance before release is
      called field-accepted.
