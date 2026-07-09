# Tests

The current automated gate is:

```bash
npm run test:sync
npm run test:field-scale
```

Covered categories:

- Supabase sync row merge/fingerprint behavior
- Demo/real sync boundaries
- Draft Action apply safety
- Draft batch safety
- Number input canonicalization
- Report date safety
- Issue status safety
- Project archive behavior
- Parser evals for punctuation-free field notes
- 300-unit Real Turn generation and responsive rendered Unit-board behavior
- 1,000 units, 100 blockers, 500 ready units, 10,000 activity events, Reports, CSV, backup restore, and large-board Capture targeting
- Coalesced full-state persistence, immediate lifecycle flush, and reset-safe pending-write cancellation
- Session-backed commit-on-blur text fields, stale-draft rejection, one-event commits, and interrupted-draft reload recovery
- Session-backed numeric commit-on-blur behavior, one-event/one-write commits, and transient Setup blur-then-submit safety

Use parser evals for Quick Capture regressions before changing the deterministic Copilot parser.
Use the field-scale gate after changing Setup, Units, Capture, Reports, exports, backups, storage, or large-list behavior.
