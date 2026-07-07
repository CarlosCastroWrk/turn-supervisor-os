# Release Plan

## Production

```text
https://turn-supervisor-os.vercel.app
```

Vercel project:

```text
turn-supervisor-os
```

GitHub repo:

```text
CarlosCastroWrk/turn-supervisor-os
```

## Default Release Path

Normal non-emergency work:

1. Create a branch from `main`.
2. Make a narrow slice.
3. Run relevant checks.
4. Push branch.
5. Open a draft PR.
6. Review/approve.
7. Merge.
8. Deploy only after explicit approval or configured production automation is confirmed.

Urgent field hotfix:

1. Confirm Los approves direct `main` hotfix.
2. Stage only intended files.
3. Run checks.
4. Commit and push.
5. Deploy production.
6. Smoke-test live URL.

## Required Checks

For app code:

```bash
npm run test:sync
npm run lint
npm run build
npm run check:os
git diff --check
```

For production-env confidence:

```bash
vercel env run -e production -- npm run build
```

For Supabase schema changes:

```bash
supabase migration list --linked
supabase db push --dry-run --linked
supabase db lint --linked --fail-on error
```

## Production Smoke

- `curl -I https://turn-supervisor-os.vercel.app` returns 200.
- App boots on mobile width.
- Sync panel is present when production sync is enabled.
- Floating Capture is present.
- No horizontal overflow.
- No console errors in a basic smoke.

## Rollback

If a production deployment breaks core field use:

1. Stop entering new real field data if data integrity is questionable.
2. Export JSON from any device that still has correct local data.
3. Use Vercel rollback to promote the previous known-good deployment.
4. Re-test boot, sync panel, and core data visibility.
5. Document the incident in `docs/04_execution/WORK_LOG.md`.
