# Review Checklist

## Product

- [ ] Does the change solve the stated problem?
- [ ] Are non-goals respected?
- [ ] Are fake data and speculative features avoided?

## Engineering

- [ ] Is the change scoped?
- [ ] Does it follow existing patterns?
- [ ] Are dependencies justified?
- [ ] Are errors and empty states handled?

## Security

- [ ] No secrets exposed.
- [ ] No production data mutated without approval.
- [ ] Sensitive logs avoided.
- [ ] Auth and permission assumptions documented.

## Verification

- [ ] Typecheck run when available.
- [ ] Lint run when available.
- [ ] Tests run when available.
- [ ] Build run when available.
- [ ] Targeted smoke check run when available.
- [ ] Diff reviewed.

