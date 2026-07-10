# Environment Map

Document environments without exposing secret values.

| Environment | Purpose | URL | Data | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| Local | Development | `http://localhost:5173` | Browser localStorage; optional linked QA sync | Los | Vite dev server; sync stays off unless local public Supabase env values and `VITE_ENABLE_SYNC=true` are present |
| Production app | Hosted PWA | `https://turn-supervisor-os.vercel.app` | Browser localStorage + optional Supabase sync | Los | CSV runtime release verified at `dpl_37Tbxui5LXzLXFoFWnCobU4sbpN8`; later docs-only merges can produce newer deployment IDs |
| Supabase | Sync/Auth/Storage foundation | `https://jgplalexkmjzldczouih.supabase.co` | Postgres + private Storage | Los | Schema/RLS/buckets applied; app sync enabled behind `VITE_ENABLE_SYNC` |
| Local Vercel CLI | Deployment tooling | `vercel` | No app data | Los | Version `55.0.0` verified on 2026-07-09 |

## Secret Handling

- Use `.env.example` for variable names only.
- Never write real secret values into docs or git.
- Confirm deployment environment variables through the hosting provider UI or CLI without printing values.
- The Supabase database password for `turn-supervisor-os` is stored in macOS Keychain under service `pds-supabase-db-password`.
- Vercel production has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_ENABLE_SYNC=true`.
- Supabase Auth keeps global public signup disabled while email/password login is enabled for the existing Los user.
- Do not commit Supabase service-role keys, provider API keys, or real `.env` files.
