# Capture-First Field Shell Design

## Purpose

D7 makes the existing Turn Field Copilot feel like one field tool instead of a collection of manual forms. It changes the visible information architecture and Capture entry behavior without removing the underlying local-first records, Draft Action safety, sync, reporting, or recovery paths.

The field loop remains:

```text
Capture -> Confirm -> Update Board -> Follow Up -> Report -> Learn
```

## Visible Information Architecture

- Home: readiness, status counts, Needs attention, today's movement, and next actions.
- Units: scan, filter, inspect, and manually correct the board when needed.
- Issues: inspect and correct open work that Capture created or Los entered directly.
- Crew: contacts and field observations.
- Reports: editable daily document and PDF/print path.
- Setup: active Turn, profile-oriented preferences, Memory review, and AI usage.
- Data & backup: deliberately secondary but still available for recovery and export.

Assignments, Daily Log, Draft history, and Memory are not deleted. They remain operational records or automation surfaces, but they no longer compete with the primary field navigation.

## Capture Contract

- One tap opens Capture in place and starts the voice surface immediately.
- The keyboard does not autofocus on open.
- Camera, Photo, File, and Type are explicit equal fallbacks.
- Browser speech recognition is used only when supported; iPhone/iPad keyboard dictation remains the dependable fallback.
- Finish returns to the same Capture review rather than navigating to another page.
- Parsed operations remain pending Draft Actions until Los approves them.
- Approval updates the board and Home activity; rejection changes nothing operational.

## Responsive Rules

- Desktop: a true left-edge rail, compact top sync status, wide field Home, and a right-side Capture workspace.
- iPad landscape: the same information hierarchy with reduced rail width and a contained Capture panel.
- iPhone: Home, Units, raised Capture, Issues, and More in a fixed bottom bar; Capture uses the full viewport.
- The More sheet isolates the background, traps keyboard focus, closes with Escape, and restores focus to More.
- Every field action targets at least 44 pixels and layouts must not overflow horizontally.

## Safety Boundaries

- No route or record mutation occurs merely by opening Capture.
- No AI or parser result bypasses Draft Action approval.
- No schema, sync contract, project boundary, or data deletion behavior changes in D7.
- Production AI remains separately gated and disabled unless Los approves server environment activation.

## Visual References

- Desktop concept: `docs/05_quality/design-concepts/capture-first-field-shell-desktop.png`
- Mobile concept: `docs/05_quality/design-concepts/capture-first-field-shell-mobile.png`
- Desktop implementation: `docs/05_quality/design-concepts/capture-first-field-shell-implementation-desktop.png`
- iPad Home implementation: `docs/05_quality/design-concepts/capture-first-field-shell-implementation-ipad-home.png`
- Mobile Home implementation: `docs/05_quality/design-concepts/capture-first-field-shell-implementation-mobile-home.png`
- Mobile Capture implementation: `docs/05_quality/design-concepts/capture-first-field-shell-implementation-mobile.png`

## Acceptance

The release must pass deterministic tests, Capture workflow QA, field-scale QA, recovery QA, lint, build, dependency audit, and screenshot review at Mac, iPad landscape, and iPhone dimensions. Production smoke remains read-only and must not send field data or model requests.

## Fidelity Review

1. The implementation keeps the concept's left-edge desktop rail, compact Home hierarchy, raised mobile Capture action, and right-side/full-screen Capture behavior.
2. Mobile status cards use a horizontal scan row instead of compressing five numbers into narrow columns, preserving touch size and readable labels on a 390-pixel viewport.
3. Voice Capture keeps the central recording state, timer, activity bars, transcript, four input alternatives, and one dominant Finish action without implying offline speech support.
4. The implementation uses existing real record vocabulary and Draft Actions rather than concept-only owners, tasks, or completion data.
5. Review state remains denser than recording state so Los can approve, reject, save a photo, or open a target without returning to a manual form.
