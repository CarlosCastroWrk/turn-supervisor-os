# Launch Track B — Auth, Onboarding, and Goals

## Status

Isolated, integration-ready Track B implementation based on `51a0edd4179a44400839ca171a9bda9ed648a497`.

This track does not wire routes, initialize Supabase, alter shared persistence, apply a migration, or change the live application. It provides feature-local contracts and components for the Launch Week integration agent.

## Delivered Contracts

### Authentication

- `LaunchAuthAdapter` is provider-facing and injected.
- `createSupabaseAuthAdapter` accepts only a narrow Auth port supplied by the integration layer. It does not import or initialize the repository Supabase client.
- Email/password sign-in, session lookup, password-reset request, sign-out, and auth-event subscription are supported.
- Passwords remain component-local and are never persisted by this feature.
- Offline access is allowed only when local operational data has a verified owner matching the active or last authenticated user.
- Offline sign-in, password reset, and sign-out fail loudly without deleting local field data.
- Cloud access remains paused offline. The existing sync/cache-ownership layer remains authoritative for checked synchronization.

The integration agent should adapt the existing `getSupabaseClient()?.auth` methods into `SupabaseAuthPort`; Track B must not initialize another client.

### Onboarding

The state machine preserves the locked one-question order:

1. Property
2. Dates
3. Trades
4. Property contacts
5. Work hours
6. Walkthrough time
7. Unit import
8. Unit types and sections
9. Crews
10. Data/photo permissions
11. Official forms
12. Daily goal
13. Review and activate

Draft recovery is versioned. Invalid saved answers are dropped individually, and recovery returns to the first unanswered or invalid question. Activation requires explicit acknowledgement that the app is personal, paper remains authoritative, and operational mutation is never automatic.

Unknown contacts, work hours, walkthroughs, Unit templates, and crews may be explicitly marked `needsConfirmation`; the feature does not invent answers.

### Personal configuration and permissions

- Setup output is labeled `personal-launch-setup`.
- Paint and Clean are the bounded supported trade choices for this candidate.
- Assignment-source storage, work-photo storage, and personal cloud sync each require an explicit permission decision.
- Conservative defaults are `not-reviewed`, which disables those capabilities.
- Tenant data, signatures, W-9/paycard data, and access credentials remain prohibited regardless of a configurable permission.
- Official forms store reference labels only and keep automatic submission off.

### Daily goals

- Configuration: Date + Metric + Milestone + Target.
- Metrics: Units, Sections, Inspections.
- Milestones: Crew reported complete, Los inspected, Ready to walk, Property accepted.
- Default: Sections + Los inspected.
- Actual count is derived only from explicit `recorded-operational-fact` achievements on the goal date.
- Units, sections, and inspections use separate deterministic unique keys.
- Duplicate facts do not inflate the count.
- The displayed percentage is capped at 100 while the actual count remains visible.
- An AI may return a `DailyGoalProposal`, but this feature exposes no method that applies it or uses it to calculate progress.

## Components and host ownership

- `LaunchAuthPanel` provides semantic email/password and reset controls with 16px inputs and 44px minimum actions.
- `OnboardingQuestionFrame` enforces one visible question and exposes Back, Next, and explicit Activate actions.
- `DailyGoalEditor` is controlled and never writes shared state.
- `useLaunchAuthController` and `useOnboardingController` are optional integration hooks.
- Track A/integration still owns visual composition, the animated mark, global styling, routing, persistence, and shared application wiring.

## Integration boundaries

Before Wave 2A integration, the integration agent must provide:

1. The existing Supabase Auth port.
2. Existing cache-ownership facts for offline-continuity decisions.
3. A feature-local persistence destination for onboarding drafts and personal configuration through the approved shared-state integration path.
4. A repository projection that produces `DailyGoalAchievement` facts without collapsing crew report, Los inspection, ready-to-walk, or property acceptance.
5. Track A styling and route ownership.

No production credentials, real PDS data, remote migration, package change, or environment change was used by this track.
