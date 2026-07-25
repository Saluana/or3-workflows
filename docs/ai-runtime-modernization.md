# AI Runtime Modernization — Migration & Compatibility

This document describes the modernized AI runtime for `or3-workflow-core`: the
provider-neutral model gateway, structured values, typed tools, the durable run
journal, richer observability, optional agent backends, and the supervisor
pattern. It also states the compatibility/deprecation policy and staged feature
flags (R1.AC5, R2.AC1, R2.AC2, R3.AC6, R6.AC1, R7.AC1).

## Compatibility policy

- **Workflow documents:** `WorkflowData` `2.0.0` documents continue to load and
  run without source or document migration. New fields (`value`/`valueSchema` on
  results, structured specs, tool descriptors, run snapshots) are additive.
- **String projection:** Every node still produces a stable `output` string.
  Typed values are additive; legacy consumers that read only `output` are
  unaffected. Object values use deterministic key ordering
  (`stableStringify`) so checkpoints, callbacks, and UI status remain stable.
- **Providers:** The positional `LLMProvider.chat(model, messages, options)`
  contract remains exported and supported. Existing provider mocks run unchanged
  through `LegacyLLMProviderGateway`.
- **Callbacks:** All existing `ExecutionCallbacks` and the v1 `WorkflowEvent`
  union keep working. The v2 envelope projects back to v1 events via
  `projectToLegacyEvent`.

## Deprecation window

| Surface | Status | Replacement | Removal |
|---|---|---|---|
| `OpenRouterLLMProvider` | deprecated | `OpenRouterModelGateway` | after one minor release with no workflow call sites |
| `createOpenRouterLLMProvider` | deprecated | `createOpenRouterModelGateway` | same as above |
| `or3-chat` `createWorkflowOpenRouterClient` / `patchOpenRouterClientForWorkflowCompat` (workflow paths) | removed from workflow paths | shared `OpenRouterModelGateway` factory | done |
| SDK `Model`-coupled catalog types | replaced | OR3-owned structural model types in `models.ts` | n/a (deprecated aliases kept one minor) |

Deprecated symbols carry `@deprecated` JSDoc and remain source-compatible for at
least one minor release.

## Public surfaces

Main entry (`or3-workflow-core`):

- **Gateway (R2):** `ModelGateway`, `ModelRequest`, `ModelCallResult`,
  `LegacyLLMProviderGateway`, `isModelGateway`, `resolveToModelGateway`,
  `gatewayAsLLMProvider`, routing/capability/error types.
- **OpenRouter (R3):** `OpenRouterModelGateway`, `createOpenRouterModelGateway`,
  `CapabilityResolver`, `mapRoutingPolicy`, `normalizeMessages`.
- **Structured values (R4):** `SchemaRegistry`, `StructuredOutputSpec`,
  `stableStringify`, `parseValidateRepair`, `SchemaValidationNodeExtension`,
  `createStructuredAgentPreset`.
- **Typed tools (R5):** `WorkflowTool`, `WorkflowToolRegistry`, `planToolBatch`,
  `executeToolBatch`, `adaptExecutableTool`, `adaptRegisteredTool`,
  `providerServerTool`, `DEFAULT_TOOL_POLICY`.
- **Run journal (R7):** `RunStore`, `InMemoryRunStore`,
  `CheckpointRunStoreAdapter`, `planRetryNode`, `forkRun`.
- **Observability (R8):** `RunSequencer`, `WorkflowEventEnvelope`,
  `redactEnvelope`, `OtelWorkflowAdapter`, `runEvaluationSuite`,
  `compareCandidates`.
- **Agent backends (R6):** `NativeAgentLoopBackend` (default).
- **Supervisor (R9):** `createSupervisorTemplate`.

Optional subpath (`or3-workflow-core/openrouter-agent`):

- `OpenRouterAgentLoopBackend`, `createOpenRouterAgentBackend`,
  `preflightOpenRouterAgent`, `OptionalBackendUnavailableError`.

## Optional peer dependencies

These are **optional** and never eagerly bundled:

- `@openrouter/agent` — required only when using the OpenRouter Agent backend.
  Loaded via a runtime dynamic import; a missing package fails preflight with an
  actionable error (`OptionalBackendUnavailableError`).
- `@opentelemetry/api` — the host constructs and passes a tracer/meter to
  `OtelWorkflowAdapter`; without one it is a no-op.

## Feature flags (staged rollout)

All modernized capabilities are opt-in; defaults preserve current behavior:

- **Native tool loop remains the default backend.** `openrouter-agent` is
  disabled until parity tests pass (assistant/tool ordering, cancellation, stop
  conditions, resumable state, receipt ownership).
- **Structured values** apply only when a node configures a
  `StructuredOutputSpec`.
- **Typed tool policy** defaults to conservative sequential execution with
  approval required for `policy`/destructive tools (`DEFAULT_TOOL_POLICY`).
- **RunStore** is opt-in; foreground execution stays in-memory unless a host
  provides a `RunStore`/`CheckpointAdapter`.
- **OpenTelemetry** is off unless a tracer/meter is supplied.
- **Supervisor** is a template that emits ordinary primitives; there is no hidden
  engine primitive.

## Durability caveats

`CheckpointRunStoreAdapter` bridges a v1 `CheckpointAdapter` to the `RunStore`
snapshot API but is **not** side-effect-safe durability: a v1 checkpoint has no
ordered event journal, no optimistic ownership, and no cross-restart tool
receipts. Use a native `RunStore` implementation for exactly-once side effects.
There is an unavoidable uncertainty window when an external system commits but
the receipt write fails; OR3 resolves it with an idempotency key when supported,
otherwise the run pauses in `reconciliation_required`.

## Rollback

Each capability is additive and independently revertible: remove the gateway
wiring to fall back to `LLMProvider`, omit `RunStore` to use checkpoints only,
omit the OTel tracer to disable tracing, and keep the native backend to avoid the
optional agent package. No document migration is required to roll back.
