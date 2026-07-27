# Track A — Unified Shell and Minimal Home

## Delivery boundary

- Branch: `codex/launch-track-a-shell`
- Integration base: `51a0edd4179a44400839ca171a9bda9ed648a497`
- Package: `src/features/launch-command-center/`
- Status: feature-local and ready for host integration

This track supplies controlled React surfaces and deterministic display helpers.
It does not own routing, authentication, persistence, service-worker behavior,
operational mutations, paper TurnBoard semantics, approvals, payroll, or
production configuration.

## Public package

`src/features/launch-command-center/index.ts` exports:

- `LaunchCommandCenterShell`
- `LaunchHome`
- `LaunchSearchPage`
- `LaunchNotificationsPage`
- `LaunchLoginSurface`
- typed props and navigation/action contracts
- deterministic goal, Search, and Notifications helpers
- visibly synthetic fixtures for tests and the local preview

## Host integration contract

1. Mount `LaunchCommandCenterShell` from the reserved host layer and pass the
   current destination through `activeDestination`.
2. Render the accepted TurnBoard, Activity, and More content through the
   shell's `children` slot. This track intentionally does not duplicate those
   surfaces.
3. Map `onNavigate`, `onOpenSearch`, and `onOpenNotifications` to host-owned
   routing. Search and Notifications are full-page surfaces with an explicit
   Back callback.
4. Map `onOpenPlus` to the existing single Capture/command owner. The shell
   does not open a dialog and must not become a second Capture owner.
5. Map `onOpenIntelligence` to the separately owned Intelligence surface. This
   track provides only the header entry point.
6. Supply Home counts and the daily-goal view model from reviewed projections.
   The helper calculates only deterministic display progress and persists
   nothing.
7. Adapt `LaunchLoginSurface` to host-owned session/authentication behavior.
   The component emits controlled-field, forgot-password, and submit callbacks
   but never sends an authentication request itself.

## Product and safety behavior

- Official paper/PDS records remain authoritative.
- Home labels represent personal workspace views, not official approval,
  payroll, or paper reconciliation.
- Quick actions emit intent callbacks only.
- Search results and Notifications open exact host destinations through typed
  destination IDs.
- No external message, autonomous update, or operational mutation is performed.
- The `TO` mark is a code-native visual fallback; no unapproved brand asset is
  introduced.

## Responsive and accessibility behavior

- iPhone: compact header, property/date strip, two-column Home actions, fixed
  safe-area-aware bottom navigation with a central Add control.
- iPad/Mac: shared header, compact left navigation rail, bounded content width.
- Form controls use at least 16 px text.
- Critical interactive targets are approximately 44 px or larger.
- Login motion is disabled under `prefers-reduced-motion`.
- Offline Login state is explicit and prevents submission.

## Local preview and tests

The development-only preview is:

`src/features/launch-command-center/preview.html`

It uses synthetic fixtures and contains no production connection.

Focused verification:

```bash
node --experimental-strip-types --import ./tests/register-ts-loader.mjs \
  --test tests/launch-command-center-contract.mjs

node --experimental-strip-types --import ./tests/register-ts-loader.mjs \
  tests/launch-command-center-browser.mjs
```

The browser harness covers 320 px and 390 px iPhones, iPad landscape, Mac,
Search, Notifications, Login, target sizing, horizontal overflow, reduced
motion, offline copy, callback destinations, and the absence of a second dialog.

## Known integration limitations

- Host routes are intentionally not wired in this track.
- Activity, TurnBoard, More, Capture, and Intelligence content remain owned by
  their existing or assigned tracks.
- Search data sourcing, notification-read persistence, goal setup/persistence,
  and real authentication remain host responsibilities.
- Synthetic fixtures are test/preview-only and must not ship as operational
  records.
