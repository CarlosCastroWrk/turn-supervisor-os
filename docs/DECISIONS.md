# Decisions

This file captures product and technical decisions that affect near-term execution. Detailed historical ADRs can still live in `ops/decisions/`.

## Accepted Decisions

### 2026-07-06: Product framing is Turn Field Copilot

Use PDS / Turn Field Copilot as the project framing.

Rationale:

- The app is a personal field companion for Los during Turn.
- It should make Los more organized, reliable, and valuable under pressure.
- It is not official Property Doctor software and should not read like company software.

### 2026-07-06: Core loop governs scope

The core loop is Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn.

Rationale:

- This keeps the project focused on field performance.
- Features that do not support this loop should be challenged before implementation.

### 2026-07-06: Phase 1 stays stabilization-only

Do not build major new features until Real Turn Mode, sync, offline behavior, export/backup, and PWA usage are verified on real devices.

Rationale:

- The app must be trustworthy before it becomes smarter.
- Sync/data integrity failures would be more damaging than missing convenience features.

### 2026-07-06: Local-first remains non-negotiable

`localStorage` remains the hot/offline cache even when Supabase sync is enabled.

Rationale:

- Field conditions may include bad Wi-Fi, low battery, and interruptions.
- The app must remain useful without internet access.

### 2026-07-06: AI remains draft-first

Any AI or rule-based Copilot output must create Draft Actions. Los approves, edits, rejects, or applies.

Rationale:

- AI should reduce typing and cognitive load, not become the source of truth.
- Important mutations require human confirmation.

### 2026-07-06: No provider secrets in browser code

Do not put OpenAI, Anthropic, or similar provider keys in Vite/browser code.

Rationale:

- Browser bundles are public.
- Real AI requires a server-side route with structured output validation and local fallback.

### 2026-07-06: Demo and Real Turn data must stay separated

Demo/sample records must not pollute Real Turn reports, Copilot answers, exports, or sync conclusions.

Rationale:

- Los needs trustworthy real field status.
- Sample records are useful for practice only.

### 2026-07-07: Normal work uses pull requests

Use GitHub pull requests for normal non-emergency slices.

Rationale:

- Pull requests keep GitHub updated with reviewable change packages.
- Los can see what changed before merge.
- `main` should remain the shipped or shippable state.
- Direct commits to `main` stay available for urgent field hotfixes with explicit approval.

### 2026-07-07: Sync diagnostics come before more sync guessing

If the deployed sync fingerprinting fix does not stop repeated sync cycling on real devices, the next sync PR should add visible sync diagnostics rather than another blind fix.

Rationale:

- Field sync failures need table/trigger/error visibility.
- Diagnostics should show whether sync was triggered by manual tap, Realtime, reconnect, or local edit.
- Diagnostics reduce the chance of repeatedly changing sync logic without evidence.

### 2026-07-07: Vercel CLI upgrade approved and completed

Los approved upgrading the local Vercel CLI. The installed version is now `54.21.1`.

Rationale:

- Keeping CLI tooling current reduces deployment friction.
- This was a tooling change only and did not alter app code or production data.

### 2026-07-09: Photo files use IndexedDB before Turn

Keep lightweight photo metadata in the main app state and store normal compressed photo files in versioned IndexedDB on the capture device.

Rationale:

- Large base64 photo payloads can fill or slow the synchronous `localStorage` record that protects every other field update.
- IndexedDB preserves local-first/offline photo capture without adding a new service or browser secret.
- Existing embedded photos migrate only after their durable write succeeds.
- Project JSON backup gathers photo files available on the current device so this storage change does not silently weaken recovery.

### 2026-07-09: Photo sync stays local-first and private

Save compressed files into IndexedDB before attempting cloud work. During a signed-in Real Turn sync, upload changed record rows first, upload available photo files into `{user_id}/{photo_id}.ext`, then persist successful `storage_path` values back to `photo_notes`. Other devices download private files only when rendering a thumbnail and cache them locally.

Rationale:

- A broken network must never block or erase field capture.
- Row-first ordering keeps the field record recoverable even if Storage is unavailable.
- Deterministic owner-scoped paths make retries idempotent and match the existing private bucket RLS policies.
- Demo photos must not leak into cloud data.
- Automatic cloud deletion is deferred until delete propagation/tombstones have an explicit, tested design.

## Deferred Decisions

- Whether to rename visible runtime copy from Turn Supervisor OS to Turn Field Copilot before or after Phase 1 sync QA.
- Whether to implement CSV unit import before training clarifies the actual unit list format.
- Which server-side AI provider/model to use, if any, after Phase 1 stabilizes.
