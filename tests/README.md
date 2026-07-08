# Tests

The current automated gate is:

```bash
npm run test:sync
```

Covered categories:

- Supabase sync row merge/fingerprint behavior
- Demo/real sync boundaries
- Draft Action apply safety
- Number input canonicalization
- Report date safety
- Issue status safety
- Project archive behavior
- Parser evals for punctuation-free field notes

Use parser evals for Quick Capture regressions before changing the deterministic Copilot parser.
