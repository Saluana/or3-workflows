# Requirements

## Introduction

Modernize the `or3-workflows` execution layer around provider-neutral model requests, OpenRouter routing, typed tools, validated structured values, durable runs, and observability. The visual graph, node semantics, serialized workflow format, and existing `or3-chat` foreground/background integrations remain the compatibility baseline. New agent-loop and OpenRouter server-tool features are optional capabilities, not replacements for OR3's graph executor.

## Context

`or3-workflows` is a Bun/TypeScript monorepo whose `workflow-core` package currently exposes `LLMProvider.chat(model, messages, options)`, uses `@openrouter/sdk@0.3.11`, already supports tool loops, Zod argument validation, parallel tool execution, structured-output request fields, typed workflow events, HITL, subflows, and versioned checkpoints. `or3-chat` links both workflow packages with `file:` dependencies, uses `@openrouter/sdk@1`, patches SDK v1 clients into the core's v0.3 request shape, maps its own client/server tool registries into `ExecutableToolDefinition`, and has separate foreground and SSR background execution paths. The July audit's targeted core tests currently pass (33 passed, 4 skipped), and the targeted `or3-chat` workflow integration suites pass (98 passed, 23 skipped).

## Assumptions

- The current `WorkflowData` `2.0.0` documents and public `LLMProvider` contract require a deprecation window rather than a flag-day migration.
- `or3-chat` remains local-first and must continue to support both static foreground execution and SSR background execution.
- JSON Schema is the portable persisted schema representation; Zod schemas are code-first runtime registrations because Zod objects are not serializable workflow data.
- At-least-once execution is the honest default for external side effects. Exactly-once behavior is claimed only when a tool and its external service honor an idempotency key.
- The native OR3 tool loop remains the default backend. `@openrouter/agent` is optional and may be selected per agent only after its event, cancellation, HITL, and persistence behavior passes compatibility tests.
- Prompt and tool payload capture is disabled by default in telemetry; hosts may opt in with redaction.
- OpenRouter Chat Completions remains the initial transport. Responses-API-only capabilities are advertised only when that transport is explicitly selected.

## Out of Scope

- Replacing the visual graph executor with `@openrouter/agent`, Vercel AI SDK, LangGraph, or another orchestration runtime.
- Rewriting the `or3-chat` tool registry, background-job provider, Dexie schema, or plugin system.
- Shipping a hosted tracing, evaluation, database, queue, or model-catalog service from `workflow-core`.
- Promising direct invocation of OpenRouter server tools outside a model request.
- Building a general autonomous multi-agent platform in the first modernization release.
- Expanding or redesigning the Vue editor before the execution contracts and compatibility suite are stable.

## Requirements

### R1: Preserve existing consumers and workflows

**User Story:** As an `or3-chat` maintainer, I want modernization to be additive, so that existing foreground, background, static, and serialized-workflow behavior does not regress.

**Acceptance Criteria:**
- R1.AC1: WHEN an existing `WorkflowData` `2.0.0` document is loaded and executed without new fields THEN the system SHALL preserve its current node selection, output strings, callbacks, and error-routing behavior.
- R1.AC2: WHEN a host supplies an existing `LLMProvider` implementation with `chat()` and `getModelCapabilities()` THEN the system SHALL execute it through a legacy adapter without requiring source changes during the deprecation window.
- R1.AC3: WHEN `or3-chat` executes the same compatibility fixture in foreground and SSR background modes THEN both modes SHALL produce equivalent canonical assistant/tool transcripts and terminal workflow state.
- R1.AC4: WHEN `or3-chat` builds in static mode THEN no SSR-only persistence, OpenTelemetry SDK, or `@openrouter/agent` module SHALL enter the client bundle solely because workflow modernization is enabled.
- R1.AC5: WHEN a public field or callback is deprecated THEN the package SHALL retain it for at least one minor release and SHALL document its replacement.

### R2: Add a provider-neutral model request and result contract

**User Story:** As a workflow integrator, I want one typed model-call contract, so that routing and metadata do not leak one SDK's internal request types through the core API.

**Acceptance Criteria:**
- R2.AC1: WHEN core code makes a model call THEN it SHALL express the call as a `ModelRequest` containing a non-empty ordered model list, messages, generation settings, tool settings, required capabilities, callbacks, and `AbortSignal`.
- R2.AC2: WHEN a model call completes THEN `ModelCallResult` SHALL identify the requested models, actual model when reported, provider when reported, assistant message, finish reason, usage, cost when reported, request/generation identifiers when reported, annotations, and timing metadata.
- R2.AC3: IF a provider omits optional metadata THEN normalization SHALL preserve `undefined` rather than inventing zero cost, a provider name, a request ID, or an actual model.
- R2.AC4: WHEN raw provider data is requested through an explicit debug option THEN it SHALL be returned under a provider-scoped field; otherwise the normalized result SHALL NOT retain the raw response.
- R2.AC5: WHEN a caller aborts a run THEN the same `AbortSignal` SHALL reach every provider request and locally executed tool call.

### R3: Modernize OpenRouter routing without private SDK access

**User Story:** As an OpenRouter user, I want fallbacks and provider routing, so that workflows can meet availability, capability, privacy, cost, and latency requirements.

**Acceptance Criteria:**
- R3.AC1: WHEN an OpenRouter request contains multiple models THEN the adapter SHALL send them in priority order using the current public SDK/API shape.
- R3.AC2: WHEN a request specifies provider order, allow/deny lists, fallback policy, data-collection/ZDR policy, parameter requirements, price limits, throughput preference, or latency preference THEN the adapter SHALL map supported values without reading SDK private fields.
- R3.AC3: WHEN tools, structured output, reasoning, or another parameter is required THEN policy resolution SHALL set `require_parameters` unless the author explicitly disables it and accepts a validation warning.
- R3.AC4: IF the local model catalog proves that every configured fallback lacks a required capability THEN preflight SHALL fail before incurring a model charge; IF catalog data is absent or stale THEN preflight SHALL warn and defer authoritative validation to OpenRouter.
- R3.AC5: WHEN the adapter is constructed THEN credentials, base URL, headers, and request options SHALL be supplied through public constructor/configuration surfaces rather than `_options`, `_baseURL`, or other private fields.
- R3.AC6: WHEN `or3-chat` adopts the new adapter THEN its `patchOpenRouterClientForWorkflowCompat` shim SHALL be removable without changing workflow documents.

### R4: Make structured values validated and composable

**User Story:** As a workflow author, I want schema-constrained agent output, so that downstream nodes receive validated data rather than untrusted JSON text.

**Acceptance Criteria:**
- R4.AC1: WHEN a node declares structured output THEN its persisted definition SHALL contain a versioned JSON Schema or a serializable schema reference.
- R4.AC2: WHEN a code-first host registers a Zod schema THEN the runtime SHALL derive or associate its JSON Schema and SHALL validate the completed value with Zod before exposing it downstream.
- R4.AC3: WHEN structured generation is requested THEN capability policy SHALL require structured-output support and SHALL reject unsupported endpoint/streaming/healing combinations during preflight.
- R4.AC4: IF the completed response is invalid THEN the configured policy SHALL perform at most the declared number of repair attempts and SHALL otherwise route a typed validation error; it SHALL NOT silently pass malformed JSON as valid data.
- R4.AC5: WHEN a structured node succeeds THEN `NodeExecutionResult.output` SHALL remain a deterministic string projection for legacy consumers and a new typed value field SHALL carry the validated JSON value for typed edges.
- R4.AC6: WHEN an old consumer reads only string outputs THEN a structured-value workflow SHALL still render, checkpoint, resume, and complete without requiring that consumer to understand the typed field.

### R5: Upgrade tools into typed, policy-aware capabilities

**User Story:** As a host application, I want typed tool metadata and execution policy, so that parallelism, approvals, permissions, retries, and side effects are explicit.

**Acceptance Criteria:**
- R5.AC1: WHEN a tool is registered THEN its runtime contract SHALL support an input schema, optional output schema, execution authority, side-effect classification, approval policy, idempotency policy, permissions, and parallel-safety policy.
- R5.AC2: WHEN a legacy `ExecutableToolDefinition` is registered THEN a compatibility adapter SHALL preserve its current handler behavior and SHALL classify unspecified policy conservatively.
- R5.AC3: WHEN a model request is configured THEN `parallelToolCalls` SHALL control whether the model may emit parallel calls, while a separate executor policy SHALL control whether accepted calls execute concurrently.
- R5.AC4: IF any accepted call is destructive, requires approval, or is not parallel-safe THEN the executor SHALL NOT run it concurrently unless an explicit host policy authorizes that behavior.
- R5.AC5: WHEN a tool executes THEN its context SHALL include run, node, call, attempt, `AbortSignal`, and idempotency identifiers, and its completion receipt SHALL be recordable before another model turn begins.
- R5.AC6: WHEN MCP, host-local, `or3-chat` client/server, OpenRouter server, and agent-SDK tools are displayed together THEN the UI SHALL preserve their distinct execution authorities and approval semantics.

### R6: Support optional agent-loop and OpenRouter-managed capabilities

**User Story:** As a workflow author, I want maintained agent loops and OpenRouter-managed tools where appropriate, so that I can use current platform capabilities without losing OR3 graph control.

**Acceptance Criteria:**
- R6.AC1: WHEN no backend is selected THEN an agent node SHALL continue using OR3's native validated tool loop.
- R6.AC2: WHEN `openrouter-agent` is selected and installed THEN an `AgentLoopBackend` adapter SHALL map typed tools, stop conditions, streamed text/reasoning/tool events, usage/cost, cancellation, conversation state, and HITL into OR3 contracts.
- R6.AC3: IF the optional package is absent THEN workflows that do not select it SHALL load and execute, while workflows that select it SHALL fail preflight with an actionable missing-capability error.
- R6.AC4: WHEN an OpenRouter server tool is selected THEN it SHALL be encoded as a model-callable remote tool with its endpoint compatibility; the runtime SHALL NOT pretend it is a directly executable local node.
- R6.AC5: IF a selected server tool is Responses-API-only THEN a Chat Completions request SHALL fail preflight or use an explicitly configured Responses transport.
- R6.AC6: WHEN OpenRouter plugins are configured THEN the system SHALL distinguish request/response plugins from model-callable server tools and SHALL warn on deprecated plugin choices.

### R7: Make runs restart-safe around side effects

**User Story:** As an operator, I want runs to resume after process failure, so that completed work is not lost or repeated unexpectedly.

**Acceptance Criteria:**
- R7.AC1: WHEN durable execution is enabled THEN the runtime SHALL assign stable run, step, attempt, tool-call, and checkpoint identifiers and SHALL persist monotonic run events.
- R7.AC2: WHEN a DAG wave begins and ends THEN the runtime SHALL persist scheduled/completed node state, pending nodes, typed values, transcript state, and workflow version sufficient to resume the wave deterministically.
- R7.AC3: WHEN a side-effecting tool is about to run THEN the runtime SHALL persist intent first; WHEN it completes THEN it SHALL persist its result receipt before the next model call.
- R7.AC4: IF a process restarts after a receipt is durable THEN resume SHALL reuse the stored result and SHALL NOT call the tool again.
- R7.AC5: IF a process restarts after intent but before receipt THEN resume SHALL retry only when idempotency policy permits; otherwise it SHALL pause for reconciliation or approval.
- R7.AC6: WHEN a user retries one failed node or forks from a prior checkpoint THEN the runtime SHALL identify which prior side-effect receipts are reused and SHALL require explicit authorization before replaying destructive work.
- R7.AC7: WHEN long-term memory is configured THEN it SHALL use a separate adapter and lifecycle from per-run checkpoints and event history.

### R8: Emit useful, privacy-aware telemetry and evaluations

**User Story:** As an operator, I want comparable run telemetry and repeatable evaluations, so that model, prompt, routing, and tool changes can be judged with evidence.

**Acceptance Criteria:**
- R8.AC1: WHEN a run executes THEN the versioned event stream SHALL correlate workflow/version, run, node, attempt, model request, tool call, retry, checkpoint, resume, and terminal status.
- R8.AC2: WHEN provider metadata is available THEN events SHALL record actual model/provider, token counts, cost, finish reason, latency, generation/request ID, fallback/routing annotations, and error classification.
- R8.AC3: WHEN `workflow-core` is used without an observability SDK THEN event emission SHALL continue with no required exporter; WHEN a host installs an OpenTelemetry adapter THEN events SHALL map to spans/metrics through the OpenTelemetry API.
- R8.AC4: WHEN telemetry is emitted with default settings THEN prompt text, attachment contents, tool arguments/results, credentials, and raw responses SHALL NOT be captured.
- R8.AC5: WHEN an evaluation case runs THEN it SHALL pin a workflow version and input fixture, support deterministic mocked-provider tests and optional live tests, assert typed properties or scorer thresholds, and report cost/latency without changing production workflow state.
- R8.AC6: WHEN the compatibility suite runs THEN it SHALL cover diamond DAG determinism, parallel tool protocol, retries, abort, structured validation/repair, checkpoint resume, foreground/background parity, and legacy provider behavior.

### R9: Introduce supervision as a composable pattern

**User Story:** As a workflow author, I want an agent to delegate to specialist subflows, so that complex tasks can be decomposed without adding hidden orchestration semantics.

**Acceptance Criteria:**
- R9.AC1: WHEN supervision is enabled initially THEN it SHALL be implemented as a versioned graph template or composite extension built from router, subflow, parallel, typed-tool, and HITL primitives.
- R9.AC2: WHEN a supervisor delegates THEN each specialist SHALL have an explicit tool/model/permission budget and SHALL emit a child run or scoped subflow path linked to the parent run.
- R9.AC3: IF confidence or policy requires human review THEN the supervisor SHALL use the existing HITL contract rather than a backend-specific approval channel.
- R9.AC4: WHEN supervisor evaluations do not outperform the equivalent explicit graph on declared quality/cost/latency thresholds THEN the system SHALL retain the explicit graph as the recommended pattern and SHALL NOT promote a new engine primitive.

