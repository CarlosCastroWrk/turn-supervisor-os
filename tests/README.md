# Tests

The current automated gate is:

```bash
npm run test:sync
npm run test:field-scale
```

Covered categories:

- Supabase sync row merge/fingerprint behavior
- Disposable three-device offline/reconnect convergence, reconnect-order coverage, duplicate prevention, and equal-timestamp settling
- Deterministic Daily Log project/date identity, legacy cloud-row reconciliation, all six reconnect orders, and 5,000-log performance
- Demo/real sync boundaries
- Draft Action apply safety
- Draft batch safety
- Number input canonicalization
- Report date safety
- Issue status safety
- Project archive behavior
- Parser evals for punctuation-free field notes
- 300-unit Real Turn generation and responsive rendered Unit-board behavior
- Preview-first Real Turn CSV import with quoted-field parsing, header aliases, duplicate/existing-unit skips, structural label matching, Not Started defaults, stale-project refusal, storage-quota fail-closed behavior, and spreadsheet-formula-safe exports
- Rendered desktop/iPhone CSV previews, mobile Capture-button overlap protection, 5,000-unit import/reload persistence, and retryable 500-row Supabase upload batches
- 1,000 units, 100 blockers, 500 ready units, 10,000 activity events, Reports, CSV, backup restore, and large-board Capture targeting
- Bounded 10,000-entry Activity retention, active-Turn/provenance priority, and matching Supabase pull limits
- Coalesced full-state persistence, immediate lifecycle flush, and reset-safe pending-write cancellation
- Session-backed commit-on-blur text fields, stale-draft rejection, one-event commits, and interrupted-draft reload recovery
- Session-backed numeric commit-on-blur behavior, one-event/one-write commits, and transient Setup blur-then-submit safety
- Signed-out JSON restore guard behavior while Supabase auth is loading or active
- Rendered iPhone Daily Log save/reload/update with one persistent project/date row

Use parser evals for Quick Capture regressions before changing the deterministic Copilot parser.
Use the field-scale gate after changing Setup, Units, Capture, Reports, exports, backups, storage, or large-list behavior.
