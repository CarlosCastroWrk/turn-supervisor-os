# Capture Workspace V2 Design

## Purpose

Capture Workspace is the single field entry point for voice, typed updates, photos, and readable field-note files. It keeps the operating loop short:

```text
Capture -> Review -> Approve -> Board -> Report
```

It is still draft-first. No unit, issue, assignment, log, or photo record changes until Los approves the proposed action or explicitly confirms the photo target.

## Interaction Contract

- The global Capture button opens one modal workspace without changing the current route.
- The composer remains visible while the review timeline scrolls.
- Camera opens the device camera picker where supported.
- Attach accepts photos plus bounded CSV, TXT, JSON, and EML notes.
- Voice uses browser speech recognition only where available and falls back to iPhone/iPad keyboard dictation or typed entry.
- One capture can produce multiple compact Draft Actions.
- Every Draft Action has an explicit Approve or Reject control.
- Photos are compressed and staged locally, then require a Unit target before save.
- Opening an applied target closes Capture and navigates to that record.
- Escape closes voice mode first, then Capture; focus returns to the Capture trigger when the route did not change.

## Responsive Rules

- Desktop: centered workspace up to 1320 by 920 pixels with the current board dimmed behind it.
- iPad landscape: 12-pixel viewport inset and the same three-part header/composer structure.
- iPhone: full-viewport workspace, safe-area composer, stacked review actions, and a bottom voice sheet.
- All field controls target at least 44 pixels.
- The background app shell is inert while the workspace is open; the workspace itself is a sibling, never a child, of that inert region.

## File And Photo Safety

- Readable text attachments are limited to 2 MB each.
- Unsupported opaque binaries are rejected before parsing.
- Photo files are compressed before local storage.
- Normal photo bytes use IndexedDB; only a small emergency fallback may enter AppData.
- A suggested Unit target is shown only when one current-project Unit can be inferred.
- File contents remain local in this release. No attachment or transcript is sent to an AI provider.

## Visual References

- Desktop concept: `docs/05_quality/design-concepts/capture-workspace-v2-desktop.png`
- Mobile concept: `docs/05_quality/design-concepts/capture-workspace-v2-mobile.png`
- Desktop implementation: `docs/05_quality/design-concepts/capture-workspace-v2-implementation-desktop.png`
- Mobile implementation: `docs/05_quality/design-concepts/capture-workspace-v2-implementation-mobile.png`

## Fidelity Review

1. Header: implementation keeps the concept's project context, centered Field Copilot identity, and one clear close action. Sync remains in the underlying app header because Capture does not own sync state.
2. Conversation hierarchy: implementation preserves a right-leading user capture followed by an assistant review block, with stronger separation between source material and proposed mutations.
3. Review rows: implementation keeps compact per-action status, target, confidence, Approve, Reject, and advanced edit controls. It uses the existing deterministic Draft Action vocabulary instead of inventing unsupported follow-up fields.
4. Composer: implementation matches the persistent camera, attachment, microphone, clear, and send controls while keeping the draft-first safety statement visible.
5. Voice: implementation uses a mobile bottom sheet with timer, activity meter, transcript, fallback guidance, and explicit Done control. Browser limitations are surfaced instead of simulating unavailable transcription.
6. Mobile behavior: implementation fills the iPhone viewport, stacks approval controls, preserves a fixed composer, and has no horizontal overflow at 390 by 844 pixels.
7. Palette and density: implementation keeps the restrained white, graphite, cobalt, green, amber, and red system while avoiding decorative gradients, oversized cards, or marketing composition.

## Deferred Intelligence

This release does not call OpenAI. The next intelligence slice may add a protected server route with structured outputs and deterministic fallback. Provider keys must remain server-side, and all operational mutations must continue through Draft Action approval.
