# Wave 2A.2 Track D Route Inventory

Status: audit only; no route or shell file changed
Observed base: `20acfab750c53c889edf981ca5a944dff1f388db`

## Current route ownership and disposition

| Route or entry | Current owner | Shell/theme/header/navigation | Dialog ownership | Track D disposition |
|---|---|---|---|---|
| `#/dashboard` | `NativeHomeSurface` / `NativeHomeSummaryPage` | Launch command-center shell; Track A local theme; shell header and bottom nav | Home owns its dialog state | Preserve. Not Track D. |
| `#/units` | `BoardFirstShell` | Launch shell with embedded board-first shell; board-first theme/header/nav | Board-first plus Capture; external-dialog flag | Preserve. Not Track D. |
| `#/units?status=…` | legacy `UnitsView` | `NativeDetailShell` inside Launch shell | Legacy view | Secondary. Integration owner should prevent old UI leakage when replacing filtered destinations. |
| `#/units/:id` | `BoardFirstShell` Unit workspace | Launch + embedded board-first shell | Board-first | Preserve operational Unit workspace. |
| `#/unit/:id` | legacy `UnitDetailView` | `NativeDetailShell` inside Launch shell | Legacy Unit controls | Secondary. Direct Note/Photo should not reopen this legacy surface after save. |
| `#/activity` | `BoardFirstShell` Activity | Launch + embedded board-first shell | Board-first Activity detail | Replace visible Activity projection with `ActivitySurface` or adapt Track D fields into the board shell. Exact-record navigation required. |
| `#/more` | `TrackBMorePage` plus local Profile/Privacy/Storage state | Launch shell; Track B local theme/header; bottom nav | Local detail state | Replace visible More/Profile/Privacy with Track D modules. Unavailable destinations must be disabled. |
| `#/reports` | `TrackBReportsAndProofPage` | Launch shell + Track B detail shell | None | Replace with `TrackDReportsAndProof`; pass exact record-ID arrays. |
| `#/crews` | Track B crew list/form | Launch shell + Track B detail shell | Local editor state | Preserve until crew track owns a replacement. Track D only supplies report links. |
| `#/setup` | Track B setup questionnaire | Launch shell + Track B detail shell | Questionnaire local state | Preserve. Not Track D. |
| `#/assignments` | legacy `AssignmentsView` | `NativeDetailShell` inside Launch shell | Legacy import/assignment controls | Replace route content with `SourceFirstImport`. Do not route Track D back into legacy Import/Capture/Drafts. |
| `#/daily` | legacy `DailyLogView` | `NativeDetailShell` inside Launch shell | Legacy daily controls | Do not connect Track D Note/Photo to Daily Log. Day-session owner must provide a new exact timeline adapter. |
| `#/issues` | legacy `IssuesView` | `NativeDetailShell` inside Launch shell | Legacy issue controls | Preserve as secondary pending callback/issue ownership. |
| `#/review` | legacy `ReviewView` | `NativeDetailShell` inside Launch shell | Legacy review controls | Preserve only where still required. Track D direct saves must not route through Review/Apply. |
| `#/sync` | `SyncDiagnosticsView` | `NativeDetailShell` inside Launch shell | None | Preserve. Feed verified sync state into Track D Privacy/Reports; do not infer it. |
| `#/export` | `ExportView` | `NativeDetailShell` inside Launch shell | Existing guarded controls | Preserve as Backup/Storage destination. |
| `#/training` | legacy `TrainingQuestionsView` | `NativeDetailShell` inside Launch shell | Legacy controls | Keep secondary; not Track D. |
| `#/search` | `NativeSearchPage` | Full-page Track A surface | Full-page owner | Preserve. Add Track D exact-record destinations only through shared integration. |
| `#/notifications` | `NativeNotificationsPage` | Full-page Track A surface | Full-page owner | Preserve. Not Track D. |
| `#/copilot` legacy bookmark | hash resolver normalizes to dashboard and requests the single Capture overlay | Launch shell | Universal Capture overlay | Preserve one-Capture-owner safeguard. Track D must not own or stack Capture. |
| Plus → Note | Track C native flow | Track C sheet | Track C | Replace action body with `DirectNoteFlow`; blank by default, explicit Save, View/Undo. |
| Plus → Camera/Photos | Track C native picker handoff | Track C sheet | Track C | Open `DirectPhotoFlow` directly; preview then explicit Save. |
| More → Official PDS Forms | currently blocked in Track B handler | Track B More | None | Connect `TrackDOfficialFormsSurface`; exact external links only. |

## Old UI leakage risks

1. `#/assignments` still labels a legacy combined assignment/import surface.
2. `#/daily` still exposes Daily Log wording that direct Note/Photo must not use.
3. Personal `#/unit/:id` still owns legacy note/photo behavior.
4. Filtered Units use `UnitsView` rather than the board-first shell.
5. Track B Reports cards are counts without exact record-link contracts.
6. Track B Privacy combines policy copy but does not represent every permission
   boundary independently.
7. Official PDS Forms are blocked despite now-confirmed exact destinations.

## Reserved integration files

Track D intentionally did not change:

- `src/App.tsx`
- `src/features/launch-command-center/LaunchIntegratedApp.tsx`
- `src/lib/routing.ts`
- shared types, storage, AppData, migrations, Supabase, sync, or service worker
- global `src/styles.css`
- existing Track A/B/C feature files

Those files require the shared integration owner after all Wave 2A.2 tracks are
reviewed together.
