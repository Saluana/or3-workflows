# OR3 AI Runtime Modernization — Final Code Review

Reviewed: 2026-07-25

## Verdict

The modernization is implementation-complete for the native OR3 runtime and
remains backward compatible with `or3-chat`. The graph document format,
legacy provider contract, callbacks, string outputs, foreground execution, and
background execution remain supported. Modern model requests, typed values,
typed tools, durable runs, V2 telemetry, server-tool selection, supervisor
templates, and the optional OpenRouter Agent loop are additive.

No P0 or P1 correctness issue remains from this review.

## Important Fixes Made During Review

- Removed all OpenRouter SDK private-field access and routed both raw SDK
  clients and modern workflow requests through the public v1 gateway.
- Made ordered model fallbacks and capability-aware provider routing work for
  every model-calling node, including compaction, router, while, parallel,
  output synthesis, and agent loops.
- Added strict schema validation plus bounded regeneration or response-healing
  repair, with schema versioning and typed downstream values.
- Fixed the optional `@openrouter/agent` adapter's tool-call identity,
  provider routing, stop-condition reporting, multi-response usage
  aggregation, HITL continuation state, and natural single-turn completion.
- Added pre-execution tool intents, call-input fingerprints, receipt reuse,
  idempotency aliases, crash recovery, and reconciliation of uncertain
  non-idempotent side effects.
- Fixed preflight and durable-load early returns so they always emit terminal
  events and clear the adapter's running state.
- Fixed parallel-subflow OpenTelemetry span collisions by including the event
  path in span identity.
- Closed default-telemetry leaks in terminal results, HITL payloads, tool
  idempotency keys, provider annotations, and nested tool errors.
- Added typed tool policy metadata at both `or3-chat` registry boundaries.
  Existing tools preserve legacy behavior; classified destructive tools are
  approval-gated, background tools are marked `host-server`, and workflow call
  IDs/cancellation signals now reach the actual handler.

## Remaining Non-Blocking Work

### P2 — Backend quality thresholds are application policy, not a runtime bug

The OpenRouter Agent backend is functional and parity-tested with mocked
transport/state, but native remains the default. Before changing that default,
OR3 should run its own saved task corpus through native, OpenRouter Agent, and
supervisor candidates and choose explicit quality, latency, and cost
thresholds. The evaluation API and artifact-store contract exist; the
application-specific cases and release policy do not.

### P2 — Live candidate comparison is not yet a routine release gate

The repository has a gated, budget-capped complex live workflow and a
deterministic offline candidate-comparison harness. It does not automatically
spend against multiple live models or backends during CI. Keep that deliberate:
network variability and provider spend make it better suited to an opt-in
release job with pinned cases and a separately provisioned budget.

### P2 — Strict validation has a browser-size cost

Ajv makes JSON Schema validation real, but it materially increases the core
browser bundle. If editor startup size becomes important, split schema
compilation behind a lazy validator boundary. Do not weaken validation merely
to reduce bundle size.

### P3 — Existing `or3-chat` build warnings remain

The production build still reports pre-existing warnings for Lightning CSS
`:deep(...)` selectors, documentation prerender fetches/404s, and stale
Browserslist data. They do not fail the workflow build or indicate a runtime
compatibility regression.

## Verification Scope

The final release gate covers:

- all `or3-workflows` tests, type checks, declarations, and production bundles;
- all `or3-chat` tests, Nuxt type checks, and production SSR/plugin loading;
- foreground and background workflow compatibility;
- fallback routing, parallel branches, strict structured output and repair;
- typed tool validation, approvals, cancellation, durable intents/receipts,
  restart reconciliation, retries, and checkpoint forks;
- V2 redaction/export safety, OpenTelemetry nesting, model usage/cost, and
  evaluation artifacts;
- an opt-in, budget-capped live workflow using `x-ai/grok-4.5`, a fallback
  model, parallel specialist calls, synthesis, strict JSON normalization,
  durable completion, and event-safety assertions.

Final evidence:

- `or3-workflows`: 642 passed, 4 skipped; typecheck and both package builds
  passed.
- `or3-chat`: 3,348 passed, 56 skipped across 493 passing and 5 skipped test
  files; Nuxt typecheck and the production SSR/plugin-runtime build passed.
- Live complex workflow: four `x-ai/grok-4.5` calls through xAI, ordered
  fallback configured, strict result validated, durable status `completed`, 82
  export-safe V2 events, and provider-reported total cost `$0.0051416`.
