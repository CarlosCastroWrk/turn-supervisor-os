# Wave 2A.2 Track A — Theme and Unified Shell

Status: implemented on the isolated Track A branch for integration review.

Scope: presentation and navigation only. No operational state, persistence,
schema, sync, service-worker, approval, payroll, AI, or official-paper behavior
is changed by this track.

## Product boundary

- Turn OS remains Los's personal field companion.
- The paper TurnBoard remains authoritative.
- Theme choice is a device/account presentation preference, not operational
  project data.
- The reserved Intelligence button stays disabled and explicitly unavailable.
- No route in Track A creates official status, approval, payroll, or external
  communication.

## Theme system

Available preferences:

1. **System** — default; follows `prefers-color-scheme`.
2. **Light**
3. **Dark**

The preference is stored outside AppData under an appearance-only local-storage
key. An account-scoped key is used when an account identity is available, with
the device preference retained as the safe startup fallback.

Semantic tokens cover:

- page, elevated, and grouped surfaces;
- header and bottom navigation;
- dividers;
- primary, secondary, and disabled text;
- input background and border;
- brand blue;
- waiting, working, callback, ready, and destructive states;
- focus indication;
- sheet backdrops.

Existing Wave 1R and Wave 2A.1 surfaces receive aliases from the same semantic
tokens so nested routes do not independently select an old theme. Status
meaning continues to use labels and icons; color is supplemental.

The module applies the last device preference before React renders and updates
`meta[name="theme-color"]`. CSS provides a system-dark fallback before the
module runs. A truly parser-blocking first-paint bootstrap would require an
`index.html` seam owned by the integration track; Track A intentionally does
not edit that reserved file.

Reduced motion follows `prefers-reduced-motion` and suppresses Track A route
animation and inherited transitions.

## Shared shell

The primary hierarchy is:

1. Home
2. TurnBoard
3. Plus
4. Activity
5. More

The compact header contains:

- Turn OS identity;
- current property;
- current date;
- Search;
- Notifications;
- reserved, unavailable Intelligence.

The same hierarchy becomes a side rail on Mac-sized viewports. Mobile and iPad
layouts account for safe-area insets, keep critical targets at least 44 by 44
CSS pixels, and keep editable controls at 16px or larger to avoid iPhone input
zoom.

## Route inventory and containment

| Route family | Track A container | Back behavior |
| --- | --- | --- |
| Home and summary | Unified shell | Summary Back returns to Home |
| TurnBoard and Board detail | Unified shell, contained scroll region | Unit/board behavior stays host-owned |
| Activity | Unified shell | Activity sheets close to the invoking item |
| More | Unified shell | Detail Back returns to More |
| Search | Standalone themed route | Browser-history origin, safe Home fallback |
| Notifications | Standalone themed route | Browser-history origin, safe Home fallback |
| Login/recovery | Standalone themed route | Existing authentication behavior |
| Legacy personal tools | Native detail containment inside unified shell | Deterministic tool-family fallback |
| Capture/Plus sheets | Existing single owner above the shell | One close returns focus to origin |

The shell stores scroll position by exact route key. Fresh route entries reset
to the top; the main TurnBoard list may restore its prior position when Los
returns to that exact route.

Legacy `.app-shell`, `.topbar`, `.mobile-bottom-nav`, and `.command-dock`
surfaces are suppressed only inside the new shell. Their data behavior is not
changed.

## Integration seams

Track A changes only the authorized host integration file and new Track A
files. The following remain reserved:

- `src/App.tsx`
- `src/lib/routing.ts`
- `src/types.ts`
- AppData persistence and sync files
- Supabase and migration files
- service-worker files
- global `src/styles.css`
- package and lock files

If the integration track wants a parser-blocking no-flash bootstrap, it may call
the same storage-key and theme-color contract from the document head without
changing the preference semantics.

## Physical acceptance still required

- iPhone Safari and installed PWA in System, Light, and Dark.
- Theme change followed by close/reopen.
- Safe areas and keyboard behavior on a notched iPhone.
- VoiceOver focus order across header, primary navigation, More appearance
  controls, Search Back, and Notifications Back.
- TurnBoard list-position restoration after a real scroll.
- iPad landscape and Mac pointer/keyboard review.
