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

Los approved upgrading the local Vercel CLI to `54.21.1`, then approved the next upgrade to `55.0.0` on 2026-07-09.

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

### 2026-07-09: PWA updates must preserve the last complete offline shell

Precache all files required by the current HTML before activating a new service worker. Keep the previous worker/cache when any required asset fails, use a four-second network-first navigation timeout, and return the cached shell when the network hangs or fails. Do not lock the manifest to portrait.

Rationale:

- A partial app update is more dangerous in the field than temporarily running the prior complete build.
- Poor connectivity can leave `fetch()` pending even when the local app is usable.
- iPad field use requires both landscape and portrait.
- PNG and maskable install assets are more dependable across iPhone/iPad/Android launchers than an SVG-only manifest.
- The service worker must cache only known static shell assets, never future same-origin API/data responses.

### 2026-07-09: Field controls must work by touch, keyboard, and assistive technology

Use a 44px minimum target for visible field controls, preserve strong focus visibility, announce navigation/progress state semantically, honor reduced-motion preferences, and keep modal focus contained and restorable.

Rationale:

- Los may use an iPhone, iPad, or Mac while moving quickly, interrupted, or working in bright light.
- Repeated controls need target context so assistive technology does not announce ambiguous actions such as only `Paint` or `Repair`.
- Programmatic route focus helps keyboard and screen-reader users understand that the page changed without adding another screen.
- Physical iOS VoiceOver and sunlight checks remain required because browser automation cannot prove real-device usability.

### 2026-07-09: Undo must never overwrite newer field work

Use nonblocking toasts for routine outcomes and expose Undo only for high-frequency Unit quick-status patches. Bind each Undo to the exact resulting Unit timestamp, refuse it after any later Unit edit, and record successful Undo as a new event. Keep destructive and recovery confirmations blocking.

Rationale:

- Accidental taps are likely in the field, but a broad snapshot restore could erase Realtime or later-device work.
- A timestamp guard makes a stale toast fail closed instead of silently clobbering a newer status.
- Activity history should show both the original action and its Undo so reports remain honest.
- Trade shortcut transitions must preserve harder blockers and suppress no-op events instead of inferring that one completed trade makes the whole Unit advance.
- Reset, restore, project lifecycle, unsaved edits, and unsafe Ready overrides need deliberate confirmation, not transient feedback.

### 2026-07-09: Operational Memory is project-scoped and approval-first

Capture may propose typed Memory, but every candidate belongs to the active Turn and remains inactive until Los approves it. Approved operational Memory applies only to its active, non-archived project and a live source when one is linked. Only explicit personal supervisor preferences and built-in safety rules may apply across Turns.

Rationale:

- A fact learned on one property or crew cannot safely become truth for another Turn.
- Demo, archived, rejected, unapproved, missing-source, and legacy unscoped operational records must fail closed.
- Exact duplicate candidates and repeated approval should not create duplicate saved Memory.
- Memory may support Crew facts, Daily Log lessons, Ask OS records, and report preferences, but it must not mutate operational records or auto-save generated Daily Log text.
- Legacy unscoped records remain visible for review in Setup and require deliberate assignment to the current Turn.

### 2026-07-09: Equal-timestamp sync conflicts must converge deterministically

Keep newer-timestamp whole-row last-write-wins behavior. When two versions of the same row represent the same timestamp but contain different values, choose one canonical winner independent of which device is local. For Draft Actions, lifecycle timestamps and resolved states outrank stale pending copies.

Rationale:

- Preferring the local copy on every timestamp tie lets Mac, iPhone, and iPad alternately re-upload their own version forever.
- A deterministic tie rule stops sync cycling and makes reconnect order irrelevant without introducing a new server or schema migration.
- Whole-row resolution can still lose an independent field from simultaneous same-record edits; physical conflict QA and a future conflict-review design remain required.
- Device clocks remain authoritative for now, so a clock far in the future is a known limitation rather than something the client silently rewrites.
- Concurrent clients can still interleave after both pull the same baseline; the next pass recovers the newest timestamp, while atomic stale-write rejection remains a future server/schema decision.

### 2026-07-09: Daily Log identity is project plus local date

Create every new Daily Log with one deterministic ID derived from its project and `YYYY-MM-DD` date. During sync, reconcile by project/date as well as ID. If the cloud already has a legacy random ID for that tuple, preserve the cloud ID and apply the newest whole-row content to it.

Rationale:

- Supabase already enforces one Daily Log per user, project, and date.
- Random offline IDs let two devices attempt separate inserts for the same unique tuple.
- Preserving the existing cloud ID avoids a destructive ID rewrite and lets pull-before-upload update that row in place.
- Newer timestamps remain authoritative; exact-time conflicts use the existing canonical whole-row rule.
- True field-level merge remains deferred, so Los should still avoid editing the same Daily Log on multiple devices at the same time.

### 2026-07-09: JSON restore requires a confirmed signed-out state

Do not allow local JSON replacement until Supabase auth state has resolved and the device is signed out. Restore remains a local recovery workflow; it does not force-delete or overwrite cloud rows.

Rationale:

- Restoring while signed in lets startup, Realtime, or local-edit sync immediately merge cloud records over the recovered copy.
- A force-cloud-restore action would be destructive production-data behavior and needs a separate design and explicit approval.
- Los can safely inspect and export recovered data while signed out.
- Signing in later may still merge newer cloud rows, so recovered data should be reviewed/exported first.

### 2026-07-09: CSV Unit import is preview-first, additive, and status-blind

Allow flexible Unit-list CSV files only in Real Turn Mode. Parse and preview the complete bounded file before applying it, skip existing/duplicate/invalid Units, ignore status columns, and create every imported Unit as Not Started. Revalidate and durably persist the whole additive result before showing success.

Rationale:

- Training may provide differently named Unit-list columns, so documented aliases are safer than one guessed company template.
- A roster file is not trustworthy evidence of live field progress; imported status must never advance the board.
- Existing Units may already contain notes, issues, photos, or current work, so import must never overwrite them.
- A browser quota failure after an apparent success would be field data loss; the apply must fail closed before UI state changes.
- Large imports need explicit limits and retryable sync batches instead of one unbounded cloud request.
- Import has no general Undo, so backup and preview remain the recovery boundary.

### 2026-07-09: Bulk Unit updates are filtered, previewed, and transition-limited

Bulk updates operate only on explicitly selected Units from the active filtered board, apply one known workflow transition, and stop at 500 Units. Confirmation rechecks the active Turn, each Unit's preview timestamp, workflow protection, and durable browser storage. Bulk Ready, arbitrary status resets, and automatic bulk Undo are not available.

Rationale:

- A broad `Approve All` or free-form mass editor can silently move hidden, blocked, or stale Units under field pressure.
- Current filters provide understandable operational scope such as one floor or one status group; changing a filter clears selection.
- Exact Unit timestamps prevent a reviewed batch from overwriting newer local or Realtime work.
- Reusing guarded transitions keeps bulk Paint/Clean/Repair behavior aligned with known one-Unit behavior.
- Inspection can be queued only when tracked trades qualify; final Ready remains a per-Unit safety decision.
- A 500-Unit ceiling matches retryable sync batching and forces very large projects into reviewable groups.
- Preview plus durable-write-before-success is the recovery boundary because bulk Undo does not exist.

### 2026-07-10: H1 uses one bounded Responses API parser, not an agent swarm

Keep the app's deterministic parser and Draft Action application layer authoritative. When enabled, one authenticated Vercel Function sends bounded active-Turn context to the OpenAI Responses API, validates structured output, rejects unsafe targets, and returns pending drafts for Los to review. Do not add autonomous tools, handoffs, or a multi-agent runtime for H1.

Rationale:

- Capture needs one model judgment step, while the app already owns the workflow, persistence, confirmation, and mutation loop.
- A server route keeps `OPENAI_API_KEY` out of the Vite/browser bundle and allows Los-only Supabase auth, account allowlisting, request limits, rate limits, timeouts, and redacted errors.
- Running the deterministic parser first preserves offline behavior, project-scoped Memory extraction, and a safe result when the provider, network, auth, quota, or model is unavailable.
- Structured model output is still untrusted: unknown Unit mutations are discarded, due dates are normalized, conflicts require confirmation, and Ready remains guarded by the existing apply layer.
- The model remains configurable, but production activation is separate from code release and requires explicit environment approval.

### 2026-07-10: H2 routes once by Capture risk and meters estimated TurnOS cost

Use one server-selected model per Capture request. Route focused extraction to `gpt-5.4-nano`; route attachments, long or multi-target notes, ambiguity, unknown Units, and higher-consequence status language to `gpt-5.4-mini`. Never auto-select `gpt-5.5`, and do not cascade from one completed model call into a second billable call.

Rationale:

- Direct routing keeps a $10 prepaid budget useful without weakening complex field-note handling.
- Returned token usage supports a transparent per-call estimate and local-first Turn budget meter.
- The meter is deliberately not labeled as official OpenAI balance: standard project keys cannot read organization Costs/Usage, and adding an elevated admin key would create unnecessary privilege and secret risk.
- Provider pricing can change, so every receipt records a pricing version and the UI links to authoritative OpenAI Billing.
- The meter is informational, not a hard cap; provider project limits remain the enforcement boundary.

## Deferred Decisions

- Whether to rename visible runtime copy from Turn Supervisor OS to Turn Field Copilot before or after Phase 1 sync QA.
- Whether later image understanding, recorded-audio transcription, or model-assisted reporting warrants additional model routes after H1 field evidence.
