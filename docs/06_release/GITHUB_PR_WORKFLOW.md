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
10. Merge only after Los approves.

## Direct-To-Main Exception

Direct commits to `main` are reserved for urgent field hotfixes only.

Use direct `main` only when:

- Los explicitly approves it.
- The change is narrow.
- Verification passes.
- A production deploy is needed immediately.

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
- App code, Supabase migrations, sync behavior, parser behavior, and UI changes should use PRs unless Los approves a hotfix.
- Do not merge, deploy, or apply database migrations without explicit approval.

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

