# GitHub PR Workflow

This project now uses pull requests for normal non-emergency work.

## Default Flow

1. Start from `main`.
2. Create a branch named `agent/<short-slice-name>`.
3. Keep the slice narrow.
4. Run the relevant checks.
5. Stage only the intended files.
6. Commit with a short descriptive message.
7. Push the branch to GitHub.
8. Open a draft PR.
9. Review the GitHub diff, checks, and notes.
10. Under Los's standing release authorization, mark ready, merge, and deploy when checks pass and the diff stays within the approved non-destructive slice.

## Direct-To-Main Exception

Direct commits to `main` are reserved for urgent field hotfixes only.

Use direct `main` only when:

- Los explicitly approves it.
- The change is narrow.
- Verification passes.
- A production deploy is needed immediately.

## Standing Release Authorization

Los has authorized Codex to keep the Fable 5 slice train moving without asking for per-slice approval on normal scoped code/docs work.

Allowed after checks pass and the diff is reviewed:

- Commit
- Push
- Open PR
- Mark PR ready
- Merge
- Deploy production

Still requires fresh explicit approval:

- Force-push
- Destructive git operations
- Production data changes
- Supabase migrations
- Supabase data cleanup
- Secret or environment variable changes
- Reset/delete operations
- Product-scope changes into CRM/company/multi-user software

## PR Description Standard

Every PR should say:

- What changed
- Why it changed
- What user or field problem it solves
- What files changed
- What verification ran
- Known risks or follow-up work

## Current Branch Rules

- `main` should represent the current shipped or shippable state.
- Documentation-only work should still use PRs.
- App code, sync behavior, parser behavior, and UI changes should use PRs unless Los approves a hotfix.
- Do not apply database migrations or run remote data cleanup without fresh explicit approval.

## GitHub Tabs For Los

- `Code`: current files and latest commit.
- `Commits`: history of what changed.
- `Pull requests`: proposed changes waiting for review or merge.
- `Actions`: automated checks if configured.

## Vercel

Production remains:

```text
https://turn-supervisor-os.vercel.app
```

Vercel CLI version verified on 2026-07-07:

```text
54.21.1
```
