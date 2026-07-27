# Track C — Model-Agnostic Intelligence Receipt

## Delivered in this isolated track

- AI SDK v6 compatibility pinned to `ai@6.0.235`.
- Provider-independent request, stream, structured-output, visual, health, cancellation, model-identity, usage, cost, and latency contracts.
- Deterministic no-model / routine K2.6 / complex K3 router.
- Vercel AI Gateway adapter with server-only configuration and no direct database dependency.
- Credential-free synthetic mock provider.
- Hardened feature-local streaming endpoint.
- Exact authorized read and proposal-only tool registries.
- Editable proposal lifecycle with `applied: false` in every state.
- Feature-local Turn Chat for Property, Unit, Trade-section, and General contexts.
- Streaming history, source display, suggestions, diagnostics, proposal cards, cancellation, and explicit mock/disabled fallback.
- Visibly disabled attachment, visual, and microphone controls pending host integration.
- Focused routing, schema, injection, tool, lifecycle, endpoint, fallback, and client-secret tests.

## Deliberately not delivered

- No change to `App.tsx`, routing, `AppShell.tsx`, shared types, global styles, service worker, Supabase initialization, schemas, migrations, or production configuration.
- No live model call, provider provisioning, API key, production record, direct database write, operational mutation, automatic message, approval, payroll action, or paper mark.
- No AI Elements registry installation because it would require a broad shadcn/Tailwind foundation change.
- No attachment, camera, microphone, or visual-source resolver pretending to work.
- No persistence integration for chat or proposals; the owning integration track must decide that boundary.
- No app navigation entry. The standalone preview is the only UI entry in Track C.

## Safety invariants

1. Paper and accountable field instruction remain authoritative.
2. Uploaded sources cannot authorize work.
3. Model output cannot call an unregistered tool.
4. Read tools receive an injected read-only runtime.
5. Proposal tools return pending proposals only.
6. Proposal approval is not operational application.
7. No-model tasks do not incur a model call.
8. Browser code contains no Gateway credential name or value.
9. Disabled integrations are labeled rather than simulated.
10. Exact source wording is retained on every proposal.

## Preview

For synthetic local review only:

```text
/src/features/turn-intelligence/preview.html
```

The preview uses `turn-os/mock-intelligence`. Its answers explicitly state that no live model or production record is connected.

## Verification commands

```bash
npm run lint
npm run test:intelligence
npm run build
npm run test:intelligence-bundle
npm run test:sync
git diff --check
```

## Remaining integration evidence

- Reviewed host read adapters and their redaction rules.
- Approved chat/proposal persistence owner and retention policy.
- Approved attachment and visual privacy treatment.
- Physical iPhone Safari/PWA behavior.
- Live Gateway authentication and model-call acceptance in a separate non-production gate.
- Cost metadata behavior from the selected Gateway response.
- A design-system decision before AI Elements or rich markdown is enabled.

## Baseline dependency advisory note

The required read-only `npm audit` reported two high-severity transitive advisories: PostCSS through the existing Vite dependency and `brace-expansion` through existing lint tooling. Both vulnerable versions are already present in the base commit's lockfile; the AI SDK subtree is not listed in either advisory path. Track C did not alter or auto-fix those unrelated baseline dependencies. They remain a separate dependency-maintenance follow-up before production release.
