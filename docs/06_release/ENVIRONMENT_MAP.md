# Environment Map

Document environments without exposing secret values.

| Environment | Purpose | URL | Data | Owner | Notes |
| --- | --- | --- | --- | --- | --- |
| Local | Development | `http://localhost:5173` | Browser localStorage | Los | Vite dev server; no cloud sync until Slice 2 |
| Production app | Hosted PWA | `https://turn-supervisor-os.vercel.app` | Browser localStorage | Los | Static Vercel deploy from private GitHub repo |
| Supabase | Sync/Auth/Storage foundation | `https://jgplalexkmjzldczouih.supabase.co` | Postgres + private Storage | Los | Schema/RLS/buckets applied; app not connected yet |

## Secret Handling

- Use `.env.example` for variable names only.
- Never write real secret values into docs or git.
- Confirm deployment environment variables through the hosting provider UI or CLI without printing values.
- The Supabase database password for `turn-supervisor-os` was generated locally and stored in macOS Keychain under `turn-supervisor-os supabase db password`.
- Do not commit Supabase service-role keys, provider API keys, or real `.env` files.
