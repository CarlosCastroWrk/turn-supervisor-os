# July 28 Assignment Intake Foundation

This feature is an isolated, synthetic-data candidate. It does not connect to routing, `AppData`, storage, sync, Supabase, schemas, or official PDS forms.

## Supported sources

- Labeled pasted lines such as `Unit: 602 | Section: Common | Trade: Paint`
- CSV with an explicit header row
- Excel-compatible CSV or tab-delimited text with manual column mapping

Binary `.xlsx` files and image/OCR extraction are not implemented. `types.ts` defines the transient-only image extractor provider boundary for a later reviewed implementation.

## Safety boundary

1. `createAssignmentIntakeDraft` preserves the complete raw source and returns `status: "draft"`.
2. Unknown sections, unknown trades, duplicates, and competing crew claims remain blocking.
3. `updateAssignmentDraftRecord` records manual corrections without replacing the raw source.
4. `confirmAssignmentIntakeDraft` requires an explicit Los confirmation and returns a separate personal-candidate receipt.
5. Neither the draft nor the receipt writes to `AppData`; the official paper process remains authoritative.

An integration agent must review and wire `AssignmentIntakePanel` into shared routing. That later step must decide whether and how a confirmed personal-candidate receipt may be stored.
