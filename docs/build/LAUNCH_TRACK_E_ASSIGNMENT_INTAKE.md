# Launch Track E — Assignment Intake

## Status

Feature-local, synthetic-only implementation. It is not wired into shared routing or persisted operational state.

## Product Boundary

Track E turns a permitted, redacted source into a reviewable **personal-record proposal**:

```text
Source
→ extractor provider
→ strict schema validation
→ deterministic Unit / section / Paint-Clean validation
→ conflict review
→ explicit Los confirmation
→ typed proposal for a later deterministic application layer
```

The proposal has no assignment authority, writes no `AppData`, does not mark the paper TurnBoard, and does not contact anyone. Paper and accountable PDS/property processes remain authoritative.

## Entry Points

- Take photo
- Choose image
- Choose file
- Paste text
- Enter manually

The Launch Candidate includes a manual provider and a synthetic mock provider only. Images and files are preserved in transient local review memory while Los manually transcribes fields; this track does not claim OCR or visual understanding.

## Preserved Draft Fields

- Unit
- Unit type when present
- Sections
- Paint scope
- Clean scope
- Original source excerpt
- Confidence
- Uncertainties
- Duplicate warnings
- Occupancy/access conflicts
- Suggested interpretation

The complete accepted source remains in the review session. Rejected sensitive content is removed from the returned result and marked for discard.

## Safety Rules

- Uploaded text and files are always untrusted input.
- Provider outputs use strict Zod schemas; unknown authorization or mutation fields fail validation.
- Instruction-like source text is surfaced as a warning, not followed as policy.
- Claims such as approved, authorized, released, or payroll-eligible are unverified source claims.
- Unknown Units, sections, and trades block confirmation.
- Duplicate and occupancy/access warnings require explicit review.
- Non-empty uncertainties are visible in review and require explicit acknowledgement.
- Trade sections are derived conservatively from each trade's own scope wording; a broad fallback is used only for clearly whole/full scope.
- Occupancy and renewal claims never authorize entry.
- Signatures, W-9/tax forms, paycard/payroll records, access credentials, and tenant-sensitive material are rejected.
- No real PDS, property, tenant, crew, payroll, or access data belongs in Track E tests.

## Integration Contract

The integration owner may mount `AssignmentIntakePanel` and receive
`AssignmentPersonalRecordProposal` through `onProposal`. That callback still must not write operational state without a separately reviewed deterministic application boundary.

Track E intentionally does not edit:

- `src/App.tsx`
- shared routing or navigation
- global styles
- persistent state
- Supabase
- service worker
- schemas or migrations
- environment or deployment configuration
- package files

## Known Limitations

- No OCR, vision model, PDF parser, or cloud extractor is active.
- Binary sensitive-content screening can inspect file metadata before extraction, but semantic pixel/document screening requires a future approved provider. The provider contract can report sensitive material and forces discard.
- Drafts and source bytes are in-memory only in this isolated feature.
- Unit context must be injected from the integration layer.
- Confirmation creates a proposal, not a saved personal record.
