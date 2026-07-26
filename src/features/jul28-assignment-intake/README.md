# July 28 Assignment Intake Foundation

This feature is an isolated, synthetic-data candidate. It does not connect to routing, `AppData`, storage, sync, Supabase, schemas, or official PDS forms.

## Supported sources

- Labeled pasted lines such as `Unit: 602 | Section: Common | Trade: Paint`
- CSV with an explicit header row
- Excel-compatible CSV or tab-delimited text with manual column mapping

Binary `.xlsx` files and image/OCR extraction are not implemented. `types.ts` defines the transient-only image extractor provider boundary for a later reviewed implementation.

## Safety boundary

1. `createAssignmentIntakeDraft` preserves the complete raw source and returns `status: "draft"`.
2. Unknown sections, unknown trades, unparsed wording, formula-like cells, duplicates, and competing crew claims remain blocking.
3. `updateAssignmentDraftRecord` records manual corrections without replacing the raw source. Unparsed wording must be preserved explicitly in Notes or corrected at the source.
4. Duplicate/conflict resolution keeps every source row and records which row Los supported and which related rows were excluded; the decision can be reconsidered.
5. Parsing stops as soon as the 5,000-row limit is exceeded. The UI previews at most 25 records per page, selects no records by default, and commits text edits on blur instead of rebuilding the complete collection on every keystroke.
6. `confirmAssignmentIntakeDraft` requires an explicit Los confirmation and returns a privacy-minimized personal-candidate receipt containing only selected normalized records, source row/record references, corrected values, and relationship decisions. Raw upload text, raw-derived fingerprints, prior values, unselected rows, ignored columns, and source cells do not cross that boundary.
7. Neither the draft nor the receipt writes to `AppData`; the official paper process remains authoritative.

Do not import tenant names, contact details, access credentials, QR contents, or other tenant data. Raw source wording is retained only inside the local review draft and should be cleared when review is complete.

An integration agent must review and wire `AssignmentIntakePanel` into shared routing. That later step must decide whether and how a confirmed, minimized personal-candidate receipt may be stored.
