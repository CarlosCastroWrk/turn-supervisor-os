# Session Log

## 2026-07-04

- Bootstrapped project operating-system layout.
- Completed Slice 0 deployment bootstrap:
  - Created the initial local git commit on `main`.
  - Created and pushed the private GitHub repo `CarlosCastroWrk/turn-supervisor-os`.
  - Deployed the static Vite PWA to Vercel production.
  - Verified `https://turn-supervisor-os.vercel.app` returns HTTP 200.
  - Build, lint, and project OS checks passed before deployment.
- Completed Slice 1 Supabase foundation:
  - Created Supabase project `turn-supervisor-os` in org `ACTION`, region `us-east-1`, ref `jgplalexkmjzldczouih`.
  - Generated the database password locally and stored it in macOS Keychain under `turn-supervisor-os supabase db password`.
  - Initialized `supabase/config.toml` with the production URL and local dev redirects.
  - Applied the initial schema, RLS policies, private `photos` and `audio` buckets, and Storage object policies.
  - Pushed Auth config with public signup disabled.
  - Ran linked database lint and advisors; advisors passed after adding a `set_updated_at` search path hardening migration.
  - Smoke checked 22 public tables, 22 RLS-enabled tables, private buckets, and 4 Storage policies.
  - Remaining manual step: create Los's Supabase user from the Dashboard because signups are now disabled.
- Started Slice 2 Supabase app sync:
  - Confirmed the Supabase project has 1 auth user.
  - Added pinned `@supabase/supabase-js`.
  - Added a feature-flagged Supabase client, sign-in/status panel, cloud row mapping, first-run upload/pull, manual sync controls, and Realtime subscriptions.
  - Added Realtime publication migration for 15 synced tables and applied it remotely.
  - Added fresh-device protection so cloud data wins over sample seed data when a new browser has no local cache.
  - Set Vercel production env vars for Supabase URL, anon key, and `VITE_ENABLE_SYNC=true`.
  - Enabled TOTP MFA support in Supabase config.
  - Remaining advisor warning: leaked-password protection is disabled and should be enabled from Supabase Auth security settings if available.
  - Remaining QA: sign in on Mac/iPhone/iPad, verify edit propagation, offline edits, and export after sync.
- Fixed sign-in friction:
  - Re-enabled the Supabase Email provider while keeping global public signup disabled.
  - Confirmed a fake email/password smoke returns invalid credentials instead of "Email logins are disabled."
  - Changed the sync sign-in UI from a header popover to a centered sheet so it does not fight the iPad side nav.
