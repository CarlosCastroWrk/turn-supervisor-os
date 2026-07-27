# Turn Intelligence Gateway

Status: Track C isolated foundation at base `51a0edd4179a44400839ca171a9bda9ed648a497`
Scope: personal, advisory, local-first Turn OS intelligence
Authority: the official paper workflow and accountable PDS instructions remain authoritative

## Boundary

Track C provides a model-agnostic contract and a feature-local Turn Chat surface. It does not wire itself into `App.tsx`, `AppShell.tsx`, routing, persistence, Supabase records, operational schemas, or the service worker.

The request path is:

```text
explicit Property / Unit / Trade-section / General context
  -> strict request schema
  -> deterministic router
     -> NO MODEL for counts, progress, filters, status lookup, and fixed safety rules
     -> ROUTINE K2.6 for routine chat, Spanish drafting, summaries, and normal visual work
     -> COMPLEX K3 for difficult visuals, conflicts, long ambiguity, and deep analysis
  -> validated streaming events
  -> editable proposal cards only
```

Current routed model identities:

- Routine: `moonshotai/kimi-k2.6`
- Complex: `moonshotai/kimi-k3`
- Mock: `turn-os/mock-intelligence`

The router, not the browser or an uploaded source, selects the tier. A no-model route does not call provider health, streaming, or structured output.

## Provider contract

`TurnIntelligenceProvider` supports:

- streaming text and typed events;
- Zod-validated structured output;
- typed read and proposal-only tools;
- server-resolved visual bytes with source provenance;
- provider and model identity;
- token, estimated-cost, latency, and success receipts;
- health state;
- AbortSignal cancellation.

Cost is nullable. Track C does not invent a price when the Gateway or provider does not report one.

## Server boundary

`api/intelligence/chat.ts` follows the existing Vercel-function convention and reuses the current authenticated-user verifier. The endpoint:

- accepts POST and same-origin JSON only;
- requires a bearer session;
- caps request bytes and every schema field;
- rate limits before provider work;
- returns no-store NDJSON events;
- validates every outgoing stream event;
- forwards request cancellation;
- does not import a Supabase client or service-role credential;
- does not expose a provider credential to browser code;
- never logs source text or model prompts.

Mock mode is the default and needs no model credential. Gateway mode is dormant unless explicitly selected server-side and a server-side Gateway credential is available. This branch performs no real model call and provisions no provider.

### Environment names only

No values are recorded in the repository.

- `TURN_OS_INTELLIGENCE_PROVIDER` — `mock` or, after separate approval, `gateway`
- `AI_GATEWAY_API_KEY` — optional server-side local/non-Vercel Gateway credential
- `VERCEL_OIDC_TOKEN` — Vercel-managed server identity when available
- `TURN_OS_ALLOWED_EMAIL` — existing allowed-account boundary
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — existing server auth verification names
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — existing public fallback names used by current auth verification

Never add an AI key to a `VITE_` variable. Track C does not use or require a Supabase service-role key.

## Tool boundary

The only read tools are:

- `get_property_summary`
- `search_units`
- `get_unit`
- `get_unit_history`
- `get_needs_me`
- `get_daily_progress`
- `get_callbacks`
- `get_ready_for_walk`
- `get_crew_assignments`
- `get_approved_knowledge`

The only proposal tools are:

- `propose_daily_goal`
- `propose_note`
- `propose_assignment`
- `propose_crew_report`
- `propose_inspection_result`
- `propose_callback`
- `propose_blocker`
- `propose_property_walk`
- `draft_spanish_message`
- `draft_tony_update`
- `parse_assignment_source`

Read tools call an injected read-only host interface. Proposal tools return a validated object with `status: pending` and `applied: false`. Approve, edit, reject, and save-note alter only the proposal review object. They do not write an operational record.

## Source and prompt-injection policy

Every uploaded file, image, transcript, excerpt, and provider citation has `authorization: none`. Uploaded sources must have `trust: untrusted`. Source instructions are wrapped as untrusted data and cannot override:

- system policy;
- human confirmation;
- tool availability;
- paper authority;
- assignment or access authority;
- approval, payroll, or communication boundaries.

Pattern detection adds a warning but is not the security boundary. Strict schemas, fixed tools, read-only runtime injection, proposal-only results, and human review are the boundary.

## Visual input

The provider contract accepts server-resolved JPEG, PNG, or WebP bytes plus a non-authoritative source record. The public request carries metadata and source references, not arbitrary remote URLs or client-supplied authorization. Visual upload remains visibly disabled in the isolated UI until the integration track defines privacy checks, durable source handling, and server resolution.

## AI Elements decision

AI Elements was not added. The current Vite application does not use the required shadcn/Tailwind registry foundation; adding it here would force a broad styling and dependency rewrite outside Track C. Turn Chat therefore renders controlled plain text only and does not hand-roll an AI markdown renderer. A future integration can add AI Elements after an explicit design-system decision.

## Integration seam

A later integration track must:

1. mount `TurnChatPanel` from a shared owner without creating a second Capture or chat surface;
2. provide explicit context from the host screen;
3. inject authenticated access-token retrieval into `createHttpTurnIntelligenceClient`;
4. connect each read tool to a reviewed read-only repository adapter;
5. decide where proposal review objects live without bypassing the existing implementation gate;
6. add approved attachment/microphone and visual resolution paths;
7. preserve disabled labels until each capability actually works;
8. physically test iPhone Safari/PWA cancellation, keyboard, safe areas, and poor connectivity.

Until then, the standalone preview is synthetic and the production application is unchanged.
