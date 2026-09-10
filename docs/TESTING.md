# Testing

## The gate (before every commit)

```bash
npx tsc -b
npm run test:sync
npm run test:supervisor-loop
npm run lint
```

All four must be clean. `npm run build` is the fifth check before a deploy.

## Rules

- Every committed `tests/*.test.ts`, `tests/*.test.mjs`, and
  `tests/*contract.mjs` must be listed in the `test:sync` or
  `test:supervisor-loop` script in `package.json`. `tests/test-manifest.test.ts`
  enforces it, so `git add` a new test file before running the gate.
- Contract tests pin architecture on purpose. When an intended change breaks
  one, update the pin in the same commit. Never delete the test.
- Tests run under Node's built-in runner with TypeScript stripped
  (`tests/register-ts-loader.mjs`). No test framework to install.
- Real bugs get a pinned test in the same commit as the fix, in field words:
  the test name should read like the bug report.

## Browser tests

The Playwright suite (26 `*-browser.mjs` files) was removed on 2026-09-10.
No gate ran it, and the first one tried threw on launch. Git history has
them. If browser coverage comes back, it comes back inside the gate.

## Field verification

Some things only Los's iPhone can verify: iOS PWA keyboard and scroll
behavior in Turn Chat, jsPDF share-sheet behavior, camera capture, the
installed-app update on foreground. Say so in the report when a change
touches those.
