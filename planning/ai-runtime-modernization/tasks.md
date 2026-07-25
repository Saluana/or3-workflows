# Tasks

## 1. Compatibility baselines

- [x] 1.1 Add golden fixtures for legacy workflows, provider mocks, canonical assistant/tool transcripts, callbacks, and string outputs
      Requirements: R1.AC1, R1.AC2, R1.AC3, R8.AC6
      Done when: the same fixtures pass in `workflow-core` and both `or3-chat` foreground/background test harnesses.

- [x] 1.2 Add static and SSR package-boundary checks for optional runtime modules
      Requirements: R1.AC4, R6.AC3
      Done when: static generation proves no SSR run-store, OpenTelemetry SDK, or OpenRouter Agent implementation is eagerly bundled.

- [x] 1.3 Document the compatibility/deprecation policy and public surfaces
      Requirements: R1.AC5, R2.AC1, R2.AC2
      Done when: current interfaces, replacements, deprecation window, and workflow-format guarantees are published in package docs.

## 2. Provider-neutral model gateway

- [x] 2.1 Define `ModelRequest`, `ModelCallResult`, normalized metadata, routing, capabilities, and error types
      Requirements: R2.AC1, R2.AC2, R2.AC3, R2.AC4
      Done when: type tests cover non-empty models, absent metadata, debug raw response opt-in, and provider-neutral exports.

- [x] 2.2 Implement `LegacyLLMProviderGateway` and gateway detection in `OpenRouterExecutionAdapter`
      Requirements: R1.AC2, R2.AC1, R2.AC5
      Done when: all existing provider mocks run unchanged and abort reaches their supported call path.

- [x] 2.3 Refactor native LLM nodes and loops to call only `ModelGateway.generate`
      Requirements: R2.AC1, R2.AC2, R2.AC5
      Done when: agent, router, while-loop, parallel branch, output synthesis, compaction, and subflow calls pass gateway contract tests.

- [x] 2.4 Add normalized model lifecycle events and metadata aggregation
      Requirements: R2.AC2, R8.AC1, R8.AC2
      Done when: every model attempt emits correlated start/finish/error data and the run result aggregates usage without fabricated values.

## 3. OpenRouter v1 adapter and routing

- [x] 3.1 Isolate OpenRouter SDK v1 types and implement its public request transport
      Requirements: R3.AC1, R3.AC2, R3.AC5
      Done when: the provider contains no `_options`/`_baseURL` access and unit fixtures verify the SDK v1 request shape.

- [x] 3.2 Map model fallback arrays and provider routing policies
      Requirements: R3.AC1, R3.AC2, R3.AC3
      Done when: tests cover ordered models, provider order/filters, privacy, price, fallback, latency/throughput preferences, and `requireParameters`.

- [x] 3.3 Implement tri-state capability preflight across fallback models
      Requirements: R3.AC3, R3.AC4, R4.AC3
      Done when: proven unsupported chains fail, unknown catalog entries warn, and required parameters are enforced at request time.

- [x] 3.4 Normalize actual model, provider, usage/cost, identifiers, annotations, and router metadata
      Requirements: R2.AC2, R2.AC3, R8.AC2
      Done when: streaming/non-streaming fixtures preserve reported fields and leave unavailable fields undefined.

- [x] 3.5 Migrate both `or3-chat` execution paths to a shared gateway factory
      Requirements: R1.AC3, R3.AC5, R3.AC6
      Done when: foreground/background parity passes without a patched client and `createWorkflowOpenRouterClient` is unused.

- [x] 3.6 Remove the v1 compatibility monkey patch after one green compatibility cycle
      Requirements: R3.AC6, R8.AC6
      Done when: repository search finds no workflow use of the patch and core/chat builds plus workflow suites pass.

## 4. Structured value runtime

- [x] 4.1 Add serializable versioned schema specs and a runtime schema registry
      Requirements: R4.AC1, R4.AC2
      Done when: JSON Schema round-trips through workflow storage and a registered Zod schema validates the same `schemaId@version`.

- [x] 4.2 Add typed `value`/`valueSchema` fields with stable string projection
      Requirements: R4.AC5, R4.AC6
      Done when: typed downstream edges receive JSON values while legacy output maps, checkpoints, callbacks, and UI status remain strings.

- [x] 4.3 Implement structured response parsing, validation, bounded repair, and typed errors
      Requirements: R4.AC3, R4.AC4
      Done when: valid, malformed, schema-invalid, repair-success, repair-exhausted, streaming, and healing compatibility cases pass.

- [x] 4.4 Add schema-validation extension and a Structured Agent palette preset
      Requirements: R4.AC1, R4.AC5
      Done when: authors can validate any upstream value and create a schema-configured agent without duplicating agent execution code.

## 5. Typed tools and policy

- [x] 5.1 Define serializable tool descriptors, runtime tools, execution context, policy, and receipt types
      Requirements: R5.AC1, R5.AC5, R5.AC6
      Done when: type tests represent local, server, MCP, and provider-managed tools without conflating their execution authority.

- [x] 5.2 Implement legacy and `or3-chat` tool-registry adapters
      Requirements: R5.AC2, R5.AC6
      Done when: current tools execute through adapters with unchanged results and conservative default approval/concurrency policy.

- [x] 5.3 Split model parallel-call permission from executor scheduling policy
      Requirements: R5.AC3, R5.AC4
      Done when: tests cover parallel model calls executed in parallel, serialized for safety, paused for approval, and rejected.

- [x] 5.4 Pass cancellation, identity, attempt, and idempotency context into every local tool
      Requirements: R2.AC5, R5.AC5
      Done when: abort stops active tools and event/receipt fixtures use stable identifiers across retry/resume.

- [x] 5.5 Add input/output schema validation and policy-aware HITL
      Requirements: R5.AC1, R5.AC4, R9.AC3
      Done when: invalid input never executes, invalid output is not marked successful, and approval resumes through existing HITL contracts.

## 6. Durable run journal

- [x] 6.1 Define `RunStore`, versioned run events, snapshots, optimistic sequence rules, and reconciliation state
      Requirements: R7.AC1, R7.AC2, R7.AC5
      Done when: an in-memory reference adapter rejects stale writers and can reconstruct a run from snapshot plus events.

- [x] 6.2 Bridge `CheckpointAdapter` v1 into the new snapshot API with explicit limitations
      Requirements: R1.AC1, R7.AC2
      Done when: existing HITL/checkpoint tests pass and documentation states that the bridge is not side-effect-safe durability.

- [x] 6.3 Persist node scheduling/completion and nested subflow state at wave boundaries
      Requirements: R7.AC1, R7.AC2
      Done when: restart tests at every DAG wave resume with identical pending nodes, values, transcript, and paths.

- [x] 6.4 Persist tool intent and receipt around external execution
      Requirements: R7.AC3, R7.AC4, R7.AC5
      Done when: receipt-backed calls are reused, idempotent uncertain calls retry with the same key, and non-idempotent uncertain calls pause.

- [x] 6.5 Implement retry-one-node and checkpoint fork semantics
      Requirements: R7.AC6
      Done when: the UI/runtime reports reused receipts and requires authorization before destructive replay.

- [x] 6.6 Implement an `or3-chat` durable `RunStore` adapter
      Requirements: R1.AC3, R7.AC1, R7.AC7
      Done when: an SSR process-restart test resumes a background workflow without duplicating a completed tool and long-term memory remains separate.

## 7. Observability and evaluations

- [x] 7.1 Introduce the v2 event envelope and legacy callback projection
      Requirements: R1.AC1, R8.AC1
      Done when: events have stable run/sequence/path correlation and existing callback fixtures remain unchanged.

- [x] 7.2 Add privacy defaults, bounded payloads, and redaction tests
      Requirements: R8.AC4
      Done when: default events contain no prompt, attachment, credential, tool payload, or raw provider content.

- [x] 7.3 Add an optional OpenTelemetry API adapter
      Requirements: R8.AC3
      Done when: a no-SDK host remains no-op and a test SDK receives correlated run/node/model/tool/checkpoint spans and metrics.

- [x] 7.4 Build the mocked evaluation harness and assertion DSL
      Requirements: R8.AC5, R8.AC6
      Done when: CI can run pinned workflow fixtures with property assertions and cost/duration reports without network access.

- [x] 7.5 Add opt-in live candidate comparison
      Requirements: R8.AC5
      Done when: an explicit environment flag compares models/routing/backends and writes isolated evaluation results.

## 8. Optional OpenRouter Agent and managed tools

- [x] 8.1 Define `AgentLoopBackend` and wrap the native loop
      Requirements: R6.AC1, R6.AC2
      Done when: native behavior is unchanged and backend selection is explicit in node/runtime configuration.

- [x] 8.2 Implement a lazy optional `@openrouter/agent` backend
      Requirements: R1.AC4, R6.AC2, R6.AC3
      Done when: missing-package preflight is actionable, static bundles omit it, and parity tests cover streaming, tools, stop conditions, HITL, state, and cancellation.

- [x] 8.3 Add provider-server tool and plugin descriptors with endpoint gates
      Requirements: R6.AC4, R6.AC5, R6.AC6
      Done when: Chat/Responses compatibility is validated, plugins and tools render separately, and deprecated web-plugin use warns.

- [x] 8.4 Expose server tools through agent capability selection and optional palette presets
      Requirements: R5.AC6, R6.AC4
      Done when: authors can attach supported server tools to an agent while the graph never presents them as directly locally executable.

## 9. Supervisor pattern and release gates

- [x] 9.1 Build a supervisor graph template/composite extension
      Requirements: R9.AC1, R9.AC2, R9.AC3
      Done when: delegation produces ordinary router/subflow/parallel/HITL nodes, scoped child paths, and explicit budgets/permissions.

- [x] 9.2 Evaluate supervisor and agent backends against explicit graph baselines
      Requirements: R8.AC5, R9.AC4
      Done when: quality, cost, and latency results determine recommendations and no backend becomes default without passing thresholds.

- [ ] 9.3 Run full core/chat compatibility, type, build, static, and SSR verification
      Requirements: R1.AC1, R1.AC3, R1.AC4, R8.AC6
      Done when: `or3-workflows` tests/typecheck/build and `or3-chat` workflow tests/typecheck/static/SSR builds are green.

- [x] 9.4 Publish migration notes and staged feature flags
      Requirements: R1.AC5, R3.AC6, R6.AC1, R7.AC1
      Done when: native/legacy defaults remain active, opt-in flags are documented, rollback paths exist, and deprecated code removal is scheduled.

## Traceability Matrix

| Requirement ID | Design component | Task number |
|---|---|---|
| R1 | Compatibility facade; `or3-chat` strangler migration | 1.1-1.3, 2.2, 3.5-3.6, 6.2, 7.1, 8.2, 9.3-9.4 |
| R2 | ModelGateway; OpenRouter boundary | 2.1-2.4, 3.4, 5.4 |
| R3 | OpenRouterTransport; CapabilityResolver | 3.1-3.6 |
| R4 | TypedValueRuntime; SchemaRegistry | 3.3, 4.1-4.4 |
| R5 | ToolRegistry and PolicyEngine | 5.1-5.5, 8.4 |
| R6 | AgentLoopBackend; remote capability descriptors | 8.1-8.4, 9.4 |
| R7 | RunStore; checkpoints; side-effect receipts | 6.1-6.6, 9.4 |
| R8 | WorkflowEvent v2; OpenTelemetry adapter; EvaluationHarness | 2.4, 7.1-7.5, 9.2-9.3 |
| R9 | SupervisorTemplate; EvaluationHarness | 5.5, 9.1-9.2 |

## Definition of Done

- Every acceptance criterion passes through an automated test or an explicitly documented manual release check.
- Existing `WorkflowData` fixtures and legacy provider/tool integrations execute without source or document migration.
- `or3-chat` foreground, SSR background, and static-build gates are green without the OpenRouter SDK monkey patch.
- Side-effect restart tests demonstrate receipt reuse, idempotent retry, and reconciliation pause behavior.
- Provider metadata and telemetry are normalized without fabricated fields or default sensitive-content capture.
- `bun run test`, `bun run typecheck`, and `bun run build` pass in `or3-workflows`; targeted/full workflow tests, typecheck, static generation, and SSR build pass in `or3-chat`.
- The traceability matrix has no gaps, migration/rollback notes are published, and optional backends remain opt-in until evaluation thresholds are met.
