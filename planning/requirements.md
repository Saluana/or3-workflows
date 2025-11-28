# requirements.md

## Purpose

Create `or3-workflow`, a lightweight, headless npm package for building and executing AI workflows using the OpenRouter SDK. The package provides a fluent, chainable API for sequential and parallel execution, designed to be "a joy to use" for developers while powering the visual workflow builder in `or3-chat`.

## Core Philosophy

1.  **Simplicity First**: Minimal API surface. No complex graph definitions by default.
2.  **Auto-Chaining**: Steps automatically receive context from previous steps.
3.  **Headless**: Pure TypeScript execution engine. No UI, no framework dependencies.
4.  **Type-Safe**: First-class TypeScript support with inference.

## Functional Requirements

### 1. Fluent Builder API
**User Story**: As a developer, I want to define workflows using a chainable API that reads like English.

**Acceptance Criteria**:
1.1 Export a `workflow(client)` factory function that accepts an `OpenRouter` client instance.
1.2 Support `.step(config)` for adding sequential LLM calls.
1.3 Support `.parallel([configs])` for concurrent fan-out execution.
1.4 Support `.run(input)` to execute the workflow and return a promise.
1.5 Support `.stream(input)` to execute and yield events (chunks, status).

### 2. Execution Logic & Context
**User Story**: As a developer, I want the workflow to automatically manage context so I don't have to manually pass outputs between nodes.

**Acceptance Criteria**:
2.1 **Sequential**: Step N+1 automatically receives Step N's output as an "assistant" message in its context.
2.2 **Parallel**: All branches in a `.parallel()` block execute concurrently.
2.3 **Auto-Merge**: The step immediately following a `.parallel()` block receives the outputs of *all* parallel branches concatenated (e.g., "## Branch 1... ## Branch 2...").
2.4 **History**: `.run()` accepts an optional `messages` array (chat history) which is prepended to the context of the first step.

### 3. Tool Support
**User Story**: As a developer, I want to use tools in my workflow steps, either handling them automatically or manually.

**Acceptance Criteria**:
3.1 Steps accept a `tools` array containing tool definitions.
3.2 **Auto-Execute**: If a tool definition includes a `handler` function, the engine executes it automatically and feeds the result back to the model.
3.3 **Manual-Execute**: `.run()` accepts an `onToolCall` callback to handle tool execution externally (e.g., via `or3-chat` registry).

### 4. Multimodal Support (Attachments)
**User Story**: As a user, I want to send images or PDFs to the workflow and have them handled correctly.

**Acceptance Criteria**:
4.1 `.run()` accepts an `attachments` array (URL, base64 content, mimeType).
4.2 Attachments are injected into the first step's user message as OpenRouter content parts.
4.3 **Validation**: The engine checks the selected model's capabilities (via OpenRouter SDK metadata) and throws a clear error if the model does not support the input modality (e.g., sending image to text-only model).

### 5. Serialization
**User Story**: As a developer, I want to save workflows to a database and load them later.

**Acceptance Criteria**:
5.1 `.toJSON()` returns a serializable JSON object representing the workflow definition.
5.2 `.fromJSON(json)` reconstructs a workflow instance from the JSON definition.

### 6. Error Handling & Resilience
**User Story**: As a developer, I want robust error handling and control over execution reliability.

**Acceptance Criteria**:
6.1 `.run()` accepts options for `concurrency` (max parallel requests) and `retries` (per step).
6.2 Execution stops on the first unrecoverable error, returning the partial result and error details.
6.3 Validation errors (e.g., missing API key, invalid model capability) are thrown before execution starts.

## Non-Functional Requirements

-   **Zero Dependencies**: Only `@openrouter/sdk` as a peer/dev dependency. No Vue, React, or heavy utility libraries.
-   **Bundle Size**: Keep it tiny (< 5kb gzipped).
-   **Isomorphic**: Works in Node.js, Edge Runtime, and Browsers.
