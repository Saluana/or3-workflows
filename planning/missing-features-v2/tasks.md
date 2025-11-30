# Core Features v2 - Implementation Tasks

## Overview

Implementation plan following TipTap's architecture philosophy. Features are built as composable extensions with pluggable adapters.

---

## Phase 1: Foundation - Memory & Session System

### 1.1 Memory Adapter Interface

_Requirements: 1.1, 1.2, 1.3_

-   [ ] Create `packages/workflow-core/src/memory.ts`

    -   [ ] Define `MemoryEntry` interface
    -   [ ] Define `MemoryQuery` interface
    -   [ ] Define `MemoryAdapter` interface (minimal: store, query, delete, clear)
    -   [ ] Implement `InMemoryAdapter` as default
    -   [ ] Add JSDoc with example implementations (Redis, Postgres, Pinecone)
    -   [ ] Write unit tests for InMemoryAdapter

-   [ ] Create `packages/workflow-core/src/session.ts`

    -   [ ] Define `Session` interface
    -   [ ] Implement `ExecutionSession` class
    -   [ ] Add `addMessage()`, `getRecent()`, `clear()` methods
    -   [ ] Add `messageCount` and `tokenCount` getters
    -   [ ] Write unit tests

-   [ ] Integrate into ExecutionContext

    -   [ ] Add `session: Session` to `ExecutionContext` in `types.ts`
    -   [ ] Add `memory: MemoryAdapter` to `ExecutionContext`
    -   [ ] Update `OpenRouterExecutionAdapter` constructor to accept `memory` option
    -   [ ] Default to `InMemoryAdapter` when not provided
    -   [ ] Initialize session in `execute()` method

-   [ ] Update execution flow
    -   [ ] Auto-add user message to session at execution start
    -   [ ] Auto-add assistant response to session at execution end
    -   [ ] Pass session to agent nodes for context building
    -   [ ] Write integration tests

### 1.2 Memory Node Extension (Optional)

_Requirements: 1.3_

-   [ ] Create `packages/workflow-core/src/extensions/MemoryNodeExtension.ts`

    -   [ ] Define `MemoryNodeData` interface (operation: query/store)
    -   [ ] Implement node extension
    -   [ ] Add validation
    -   [ ] Write unit tests

-   [ ] Add Memory node execution

    -   [ ] Add `executeMemoryNode()` to adapter
    -   [ ] Handle query with configurable limit
    -   [ ] Handle store with metadata
    -   [ ] Write integration tests

-   [ ] Create Memory Vue component
    -   [ ] Create `packages/workflow-vue/src/components/nodes/MemoryNode.vue`
    -   [ ] Add operation selector
    -   [ ] Add to NodePalette

---

## Phase 2: Error Handling Hardening

### 2.1 Enhanced Error Types

_Requirements: 3.1, 3.2, 3.3_

-   [ ] Create `packages/workflow-core/src/errors.ts`
    -   [ ] Define `NodeRetryConfig` interface
    -   [ ] Define `ExecutionError` interface (extends Error)
    -   [ ] Define error codes: `LLM_ERROR`, `TIMEOUT`, `RATE_LIMIT`, `VALIDATION`, `NETWORK`, `UNKNOWN`
    -   [ ] Define `ErrorHandlingMode` type: `'stop' | 'continue' | 'branch'`
    -   [ ] Define `NodeErrorConfig` interface
    -   [ ] Implement `wrapError()` helper
    -   [ ] Implement `classifyError()` helper
    -   [ ] Write unit tests

### 2.2 Per-Node Retry Configuration

_Requirements: 3.1_

-   [ ] Extend node data types

    -   [ ] Add `errorHandling?: NodeErrorConfig` to `AgentNodeData`
    -   [ ] Add `errorHandling?: NodeErrorConfig` to `ToolNodeData`
    -   [ ] Add `errorHandling?: NodeErrorConfig` to `RouterNodeData`

-   [ ] Update execution with retry logic
    -   [ ] Create `executeNodeWithErrorHandling()` wrapper
    -   [ ] Implement exponential backoff
    -   [ ] Track retry history in error context
    -   [ ] Respect `retryOn` and `skipOn` filters
    -   [ ] Write integration tests

### 2.3 Error Branch Routing

_Requirements: 3.2_

-   [ ] Add error output handle to nodes

    -   [ ] Update `AgentNodeExtension` outputs to include optional `error` handle
    -   [ ] Update `ToolNodeExtension` outputs
    -   [ ] Update `RouterNodeExtension` outputs

-   [ ] Implement error branch routing
    -   [ ] Check for connected error branch in `executeNodeWithErrorHandling()`
    -   [ ] Route to error branch when `mode: 'branch'`
    -   [ ] Pass serialized error context to error branch
    -   [ ] Write integration tests

### 2.4 Error Handling UI

_Requirements: 3.1, 3.2_

-   [ ] Update NodeInspector with error config
    -   [ ] Add "Error Handling" section/tab
    -   [ ] Add mode selector (stop/continue/branch)
    -   [ ] Add retry config inputs (maxRetries, baseDelay, maxDelay)
    -   [ ] Add retryOn error code checkboxes

---

## Phase 3: While Loop Implementation

### 3.1 While Loop Node Extension

_Requirements: 2.1, 2.2, 2.3_

-   [ ] Create `packages/workflow-core/src/extensions/WhileLoopExtension.ts`
    -   [ ] Define `WhileLoopNodeData` interface
        -   [ ] `conditionPrompt: string`
        -   [ ] `conditionModel?: string`
        -   [ ] `maxIterations: number`
        -   [ ] `onMaxIterations: 'error' | 'warning' | 'continue'`
        -   [ ] `customEvaluator?: string`
    -   [ ] Define `LoopState` interface
        -   [ ] `iteration: number`
        -   [ ] `outputs: string[]`
        -   [ ] `lastOutput: string | null`
        -   [ ] `totalIterations?: number`
        -   [ ] `isActive: boolean`
    -   [ ] Implement node extension with body/exit outputs
    -   [ ] Add validation (maxIterations required, > 0)
    -   [ ] Write unit tests

### 3.2 Loop Execution Logic

_Requirements: 2.1, 2.2_

-   [ ] Add loop state management to adapter

    -   [ ] Add `loopStates: Map<string, LoopState>` to adapter
    -   [ ] Initialize loop state on first visit
    -   [ ] Clean up loop state on exit

-   [ ] Implement `executeWhileLoopNode()`

    -   [ ] Check maxIterations limit
    -   [ ] Call `evaluateLoopCondition()` for continue/done decision
    -   [ ] Execute body subgraph on continue
    -   [ ] Update loop state after each iteration
    -   [ ] Re-queue self for next iteration
    -   [ ] Route to exit on done
    -   [ ] Handle `onMaxIterations` behavior

-   [ ] Implement `evaluateLoopCondition()`

    -   [ ] First iteration always continues (run at least once)
    -   [ ] Check for custom evaluator function
    -   [ ] Build LLM prompt with loop context
    -   [ ] Parse "continue" or "done" response
    -   [ ] Write unit tests

-   [ ] Implement subgraph execution
    -   [ ] Add `executeSubgraph()` helper for loop bodies
    -   [ ] Handle nested loops (recursion limit)
    -   [ ] Write integration tests

### 3.3 While Loop Vue Component

_Requirements: 2.1_

-   [ ] Create `packages/workflow-vue/src/components/nodes/WhileLoopNode.vue`

    -   [ ] Display loop body and exit handles
    -   [ ] Show current iteration during execution
    -   [ ] Style similar to Parallel node (grouping visual)

-   [ ] Add While Loop inspector UI

    -   [ ] Condition prompt textarea
    -   [ ] Model selector (optional)
    -   [ ] Max iterations input
    -   [ ] onMaxIterations behavior selector
    -   [ ] Custom evaluator input (advanced)

-   [ ] Add to NodePalette
    -   [ ] Add WhileLoop to available nodes

---

## Phase 4: Human-in-the-Loop (HITL)

### 4.1 HITL Core Types

_Requirements: 4.1, 4.2, 4.3, 4.4_

-   [ ] Create `packages/workflow-core/src/hitl.ts`
    -   [ ] Define `HITLMode` type: `'approval' | 'input' | 'review'`
    -   [ ] Define `HITLConfig` interface
        -   [ ] `enabled: boolean`
        -   [ ] `mode: HITLMode`
        -   [ ] `prompt?: string`
        -   [ ] `inputSchema?: Record<string, unknown>`
        -   [ ] `options?: Array<{ id, label, action }>`
        -   [ ] `timeout?: number`
        -   [ ] `defaultAction?: 'approve' | 'reject' | 'skip'`
    -   [ ] Define `HITLRequest` interface
    -   [ ] Define `HITLResponse` interface
    -   [ ] Define `HITLCallback` type
    -   [ ] Write unit tests for type guards

### 4.2 HITL Execution Integration

_Requirements: 4.1, 4.2, 4.3, 4.4_

-   [ ] Add HITL to node data types

    -   [ ] Add `hitl?: HITLConfig` to `AgentNodeData`
    -   [ ] Add `hitl?: HITLConfig` to `RouterNodeData`
    -   [ ] Add `hitl?: HITLConfig` to `ToolNodeData`

-   [ ] Add HITL callback to execution options

    -   [ ] Add `onHITLRequest?: HITLCallback` to `ExecutionOptions`

-   [ ] Implement `executeWithHITL()` wrapper

    -   [ ] Check if HITL enabled on node
    -   [ ] Check if callback provided (skip HITL if not)
    -   [ ] Implement approval mode (pause before execution)
    -   [ ] Implement input mode (collect input before execution)
    -   [ ] Implement review mode (pause after execution)
    -   [ ] Handle timeout with default action
    -   [ ] Route to rejection branch if configured

-   [ ] Implement helper methods
    -   [ ] `createHITLRequest()` - build request object
    -   [ ] `waitForHITL()` - call callback with timeout
    -   [ ] Write integration tests

### 4.3 HITL Node Outputs

_Requirements: 4.2, 4.4_

-   [ ] Add HITL-related output handles
    -   [ ] Add optional `rejected` handle to agent nodes
    -   [ ] Handle rejection routing in execution

### 4.4 HITL UI Integration

_Requirements: 4.1_

-   [ ] Update NodeInspector with HITL config
    -   [ ] Add "Human Review" section
    -   [ ] Add enabled toggle (default: off)
    -   [ ] Add mode selector (approval/input/review)
    -   [ ] Add prompt input
    -   [ ] Add timeout input
    -   [ ] Add default action selector

---

## Phase 5: Subflows

### 5.1 Subflow Core Types

_Requirements: 5.1, 5.2, 5.3_

-   [ ] Create `packages/workflow-core/src/subflow.ts`
    -   [ ] Define `SubflowDefinition` interface
        -   [ ] `id: string`
        -   [ ] `name: string`
        -   [ ] `inputs: Array<{ id, name, type, required, default }>`
        -   [ ] `outputs: Array<{ id, name, type }>`
        -   [ ] `workflow: WorkflowData`
    -   [ ] Define `SubflowNodeData` interface
        -   [ ] `subflowId: string`
        -   [ ] `inputMappings: Record<string, string | unknown>`
        -   [ ] `shareSession?: boolean`
    -   [ ] Define `SubflowRegistry` interface
    -   [ ] Implement `DefaultSubflowRegistry`
    -   [ ] Write unit tests

### 5.2 Subflow Node Extension

_Requirements: 5.2_

-   [ ] Create `packages/workflow-core/src/extensions/SubflowExtension.ts`
    -   [ ] Implement node extension with input/output/error handles
    -   [ ] Add configuration for registry and maxNestingDepth
    -   [ ] Add validation (subflowId required, exists in registry)
    -   [ ] Write unit tests

### 5.3 Subflow Execution

_Requirements: 5.2, 5.3_

-   [ ] Add subflow registry to adapter

    -   [ ] Add `subflowRegistry: SubflowRegistry` to adapter
    -   [ ] Accept registry in constructor options

-   [ ] Implement `executeSubflowNode()`
    -   [ ] Resolve subflow from registry
    -   [ ] Build subflow inputs from mappings
    -   [ ] Create isolated execution context
    -   [ ] Share session if configured
    -   [ ] Execute subflow workflow recursively
    -   [ ] Handle subflow errors (route to error branch)
    -   [ ] Return subflow output
    -   [ ] Track nesting depth (prevent infinite recursion)
    -   [ ] Write integration tests

### 5.4 Subflow Vue Components

_Requirements: 5.2, 5.4_

-   [ ] Create `packages/workflow-vue/src/components/nodes/SubflowNode.vue`

    -   [ ] Display subflow name
    -   [ ] Show input/output ports based on subflow definition
    -   [ ] Allow double-click to view subflow

-   [ ] Add Subflow inspector UI

    -   [ ] Subflow selector dropdown
    -   [ ] Input mappings editor
    -   [ ] shareSession toggle

-   [ ] Add to NodePalette
    -   [ ] Add Subflow to available nodes

---

## Phase 6: Output Node

### 6.1 Output Node Extension

_Requirements: 6.1, 6.2_

-   [ ] Create `packages/workflow-core/src/extensions/OutputNodeExtension.ts`
    -   [ ] Define `OutputNodeData` interface
        -   [ ] `format: 'text' | 'json' | 'markdown'`
        -   [ ] `template?: string`
        -   [ ] `includeMetadata?: boolean`
        -   [ ] `schema?: Record<string, unknown>`
    -   [ ] Implement node extension (no outputs - terminal)
    -   [ ] Implement `execute()` with template interpolation
    -   [ ] Add format handling
    -   [ ] Add validation
    -   [ ] Write unit tests

### 6.2 Output Node Execution

_Requirements: 6.1_

-   [ ] Mark output nodes as terminal

    -   [ ] Return empty `nextNodes` array
    -   [ ] Use output as workflow final result

-   [ ] Handle multiple output nodes
    -   [ ] Any reached output node is valid endpoint
    -   [ ] Use first reached output's result

### 6.3 Output Vue Component

_Requirements: 6.1_

-   [ ] Create `packages/workflow-vue/src/components/nodes/OutputNode.vue`

    -   [ ] Display as terminal node (distinct styling)
    -   [ ] Show format badge

-   [ ] Add Output inspector UI

    -   [ ] Format selector
    -   [ ] Template editor with {{nodeId}} autocomplete
    -   [ ] Include metadata toggle
    -   [ ] JSON schema editor (advanced)

-   [ ] Add to NodePalette

---

## Phase 7: Context Compaction

### 7.1 Token Counting

_Requirements: 7.4_

-   [ ] Create `packages/workflow-core/src/compaction.ts`
    -   [ ] Define `TokenCounter` interface
    -   [ ] Implement `ApproximateTokenCounter` (4 chars ≈ 1 token)
    -   [ ] Add model context limits map
    -   [ ] Write unit tests

### 7.2 Compaction Configuration

_Requirements: 7.2, 7.3_

-   [ ] Define compaction types
    -   [ ] Define `CompactionStrategy` type
    -   [ ] Define `CompactionConfig` interface
        -   [ ] `threshold: 'auto' | number`
        -   [ ] `preserveRecent: number`
        -   [ ] `strategy: CompactionStrategy`
        -   [ ] `summarizeModel?: string`
        -   [ ] `summarizePrompt?: string`
        -   [ ] `customCompactor?: function`
    -   [ ] Define `DEFAULT_COMPACTION_CONFIG`

### 7.3 Compaction Logic

_Requirements: 7.1, 7.3_

-   [ ] Add compaction to execution options

    -   [ ] Add `compaction?: CompactionConfig` to `ExecutionOptions`
    -   [ ] Add `tokenCounter?: TokenCounter` to `ExecutionOptions`

-   [ ] Implement `compactContextIfNeeded()`

    -   [ ] Calculate current token count
    -   [ ] Calculate threshold (auto = modelLimit - 10000)
    -   [ ] Split messages into preserve and compact sections
    -   [ ] Implement `summarize` strategy
    -   [ ] Implement `truncate` strategy
    -   [ ] Support `custom` strategy
    -   [ ] Return compacted messages

-   [ ] Implement `summarizeMessages()`
    -   [ ] Build summarization prompt
    -   [ ] Call LLM with summarize model
    -   [ ] Return summary text
    -   [ ] Write integration tests

### 7.4 Compaction Integration

_Requirements: 7.1_

-   [ ] Call compaction before agent execution

    -   [ ] Check context before building messages
    -   [ ] Compact if over threshold
    -   [ ] Use compacted context for LLM call

-   [ ] Add compaction events
    -   [ ] Add `onContextCompacted` callback option
    -   [ ] Call with before/after token counts

---

## Phase 8: TipTap-style Extension Architecture

### 8.1 Extension Configuration Pattern

_Requirements: All_

-   [ ] Create `packages/workflow-core/src/extensions/configure.ts`
    -   [ ] Define `ExtensionConfig<T>` interface
    -   [ ] Create `createExtension()` helper for configurable extensions
    -   [ ] Document extension creation pattern

### 8.2 StarterKit

_Requirements: All_

-   [ ] Create `packages/workflow-core/src/extensions/StarterKit.ts`
    -   [ ] Define `StarterKitOptions` interface
    -   [ ] Include all core nodes by default
    -   [ ] Make new features opt-in by default
    -   [ ] Support per-extension configuration
    -   [ ] Export as main entry point

### 8.3 Update Exports

_Requirements: All_

-   [ ] Update `packages/workflow-core/src/index.ts`

    -   [ ] Export all new types
    -   [ ] Export all new extensions
    -   [ ] Export StarterKit
    -   [ ] Export adapters and interfaces

-   [ ] Update `packages/workflow-core/src/extensions/index.ts`
    -   [ ] Export all extensions
    -   [ ] Export StarterKit

---

## Phase 9: Documentation & Testing

### 9.1 Integration Tests

_Requirements: All_

-   [ ] Create end-to-end tests
    -   [ ] Test memory adapter integration
    -   [ ] Test while loop with LLM condition
    -   [ ] Test error handling with retry and branching
    -   [ ] Test HITL pause/resume flow
    -   [ ] Test subflow execution
    -   [ ] Test output node formatting
    -   [ ] Test context compaction

### 9.2 Documentation

-   [ ] Update README

    -   [ ] Add TipTap-style usage examples
    -   [ ] Document extension configuration
    -   [ ] Document adapter interfaces

-   [ ] Add ADAPTERS.md

    -   [ ] Document MemoryAdapter interface
    -   [ ] Example: Redis adapter
    -   [ ] Example: PostgreSQL adapter
    -   [ ] Example: Pinecone adapter

-   [ ] Add EXTENSIONS.md
    -   [ ] Document creating custom extensions
    -   [ ] Document StarterKit options
    -   [ ] Document node extension pattern

---

## Priority & Timeline

| Phase                 | Duration | Priority | Dependencies              |
| --------------------- | -------- | -------- | ------------------------- |
| Phase 1: Memory       | 3-4 days | High     | None                      |
| Phase 2: Errors       | 2-3 days | Critical | None                      |
| Phase 3: While Loop   | 4-5 days | High     | None                      |
| Phase 4: HITL         | 3-4 days | High     | None                      |
| Phase 5: Subflows     | 5-6 days | High     | Phase 1 (session sharing) |
| Phase 6: Output       | 1-2 days | Medium   | None                      |
| Phase 7: Compaction   | 3-4 days | High     | None                      |
| Phase 8: Architecture | 2-3 days | Medium   | Phases 1-7                |
| Phase 9: Docs         | Ongoing  | Medium   | All                       |

**Recommended Order:**

1. **Phase 2 (Errors)** - Critical for debugging other features
2. **Phase 1 (Memory)** - Foundation for session/history
3. **Phase 7 (Compaction)** - Prevents failures during development
4. **Phase 3 (While Loop)** - Core feature
5. **Phase 4 (HITL)** - Core feature
6. **Phase 6 (Output)** - Quick win
7. **Phase 5 (Subflows)** - Complex but valuable
8. **Phase 8 (Architecture)** - Polish
9. **Phase 9 (Docs)** - Ongoing

**Total Estimate: ~4-5 weeks**
