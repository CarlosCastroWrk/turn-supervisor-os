# Roadmap

## Product Direction

PDS / Turn Field Copilot is Los's private field companion for a two-week student housing Turn operation. It should help Los capture facts, confirm changes, keep the board accurate, follow up, report clearly, and learn the operation under pressure.

It is not official Property Doctor Services software, not a company CRM, and not a multi-user portal.

## Core Loop

Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn

Every near-term slice must improve this loop or reduce a field-safety risk that would break it.

## Execution Source Of Truth

The detailed slice train lives in [docs/04_execution/FABLE5_EXECUTION_ROADMAP.md](04_execution/FABLE5_EXECUTION_ROADMAP.md).

That roadmap incorporates the Fable 5 audit and organizes the work into safe PR-sized slices.

## Phase A: Immediate Data Safety

Goal: prevent data loss and board corruption before real field reliance.

Slices:

- Storage and photo safety
- Draft apply project scope and enum validation
- Number input safety
- Report date safety
- Issue status safety

Success gate:

Los can capture notes/photos and apply drafts without obvious data-loss, cross-project, or form-input failures.

## Phase B: Real Turn Cleanup And Sync Boundaries

Goal: clean test noise and reduce resurrection/duplication risks.

Slices:

- Project archive for duplicate/test Real Turn projects
- Demo sync boundary
- Offline/reconnect trust check

Success gate:

Real Turn records stay separate, duplicate test projects can be hidden safely, and offline edits sync back cleanly.

## Phase C: Capture Trust

Goal: make voice/dictation capture reliable enough to use while walking.

Slices:

- Parser eval suite with realistic field notes
- Unit-boundary parser
- Draft batch safety
- Voice reliability improvements

Success gate:

Los can dictate messy, punctuation-free field notes and get accurate draft actions for review.

## Phase D: Field Command Center UX

Goal: turn the app from display-first into action-first.

Slices:

- Clickable dashboard stats
- Needs Attention feed
- Units scan upgrade
- Issue flow simplification
- Sidebar and responsive frame
- Hash routing/deep links

Success gate:

Dashboard cards, issue cards, suggestions, and unit rows take Los to the underlying work instead of dead-ending.

## Phase E: Reports And Daily Memory

Goal: build Tony-ready reporting and source-grounded daily memory.

Slices:

- Daily activity snapshot
- Report preview and print/PDF
- Daily log auto-draft
- Memory consumption and project scoping (implemented and deployed)
- Daily Log project/date identity and signed-out restore safety (implemented and deployed)

Success gate:

The report builds throughout the day from real activity, remains editable, and can be previewed before export.

## Phase F: Photo Durability

Goal: make photos durable without breaking local-first behavior.

Slices:

- IndexedDB photo store (implemented)
- Supabase Storage photo sync (implemented; physical-device acceptance pending)

Success gate:

Photo sets no longer threaten the main app cache and can sync privately across Los's devices after the physical-device acceptance check passes.

## Phase G: Performance, Accessibility, And Polish

Goal: harden the app for field pressure.

Slices:

- Activity log pruning
- Undo/toast feedback (implemented for routine feedback and guarded Unit quick-status Undo)
- PWA install and offline startup (implemented; physical iPhone/iPad acceptance pending)
- Accessibility and field contrast (implemented; physical outdoor/VoiceOver acceptance pending)
- Preview-first CSV Unit import (implemented; physical iPhone/iPad file-picker acceptance pending)
- Preview-first bulk Unit updates (implemented; physical iPhone/iPad filtered-batch acceptance pending)
- Production security headers (implemented; header, PWA registration, Capture, and signed-out sync-panel production smoke passed; signed-in physical acceptance remains open)
- Production export/backup/restore gate and local-field-date filenames (implemented; physical signed-in and device-camera acceptance remains open)

Success gate:

The app stays responsive, usable outdoors, and understandable after errors.

## Phase H: Guarded Intelligence

The deterministic field tool remains authoritative and must work without a provider.

Current:

- Protected server-side AI route with structured pending Draft Actions
- Cost-aware single-call routing and estimated TurnOS usage metering
- Local deterministic fallback for offline, disabled, or failed provider requests

Possible future:

- Model-assisted summaries with local fallback
- Grounded image understanding and recorded-audio transcription
- Conflict review UI
- True delete tombstones
- Field-level merge/server timestamps

Do not allow Phase H to mutate operational records without Los's existing confirmation boundary.

## Possible Company Product

Only after field validation and explicit leadership approval.

Possible future:

- Multi-supervisor mode
- Project manager dashboard
- Company workflow integration
- Official reporting
- Permissions
- Audit logs
- Crew communication
- Real-time operations view

Do not build company product features during the current Turn preparation phase.
