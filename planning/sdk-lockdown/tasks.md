# or3-workflows SDK Lockdown - Implementation Tasks

## Overview

This document provides the implementation checklist for locking down the or3-workflows SDK public API. Tasks are grouped by component and ordered by dependency.

---

## 1. Lock Down `@or3/workflow-core` Exports

**Requirements: 1.1, 1.2, 1.3, 1.4, 1.5**

### 1.1 Create `createWorkflowEditor` Factory Function

-   [x] Add `createWorkflowEditor` function to `packages/workflow-core/src/editor.ts`
    -   [x] Function accepts `EditorOptions` and returns `WorkflowEditor`
    -   [x] Add JSDoc documentation with usage example
-   [x] Add unit test for factory function in `packages/workflow-core/src/__tests__/editor.test.ts`

### 1.2 Refactor `index.ts` to Explicit Exports

-   [x] Replace `export * from './types'` with explicit type exports
    -   [x] Export public types: `WorkflowData`, `WorkflowNode`, `WorkflowEdge`
    -   [x] Export node data types: `NodeData`, `AgentNodeData`, `RouterNodeData`, `ParallelNodeData`, `ToolNodeData`, `StartNodeData`
    -   [x] Export execution types: `ExecutionInput`, `ExecutionResult`, `ExecutionCallbacks`, `ExecutionOptions`, `ChatMessage`, `NodeStatus`
    -   [x] Export extension types: `Extension`, `NodeExtension`, `PortDefinition`
    -   [x] Export storage types: `StorageAdapter`, `WorkflowSummary`
-   [x] Export `createWorkflowEditor` from `./editor`
-   [x] Export `WorkflowEditor` type (for typing, but factory is preferred)
-   [x] Export `EditorOptions` type
-   [x] Replace `export * from './validation'` with explicit export
    -   [x] Export `validateWorkflow` function
    -   [x] Export `ValidationResult`, `ValidationError`, `ValidationWarning` types
-   [x] Replace `export * from './execution'` with explicit exports
    -   [x] Export `ExecutionAdapter` type from types
    -   [x] Export `OpenRouterExecutionAdapter` class
-   [x] Replace `export * from './storage'` with explicit exports
    -   [x] Export `LocalStorageAdapter` class
-   [x] Replace `export * from './extensions'` with explicit exports
    -   [x] Export `StartNodeExtension`
    -   [x] Export `AgentNodeExtension`
    -   [x] Export `RouterNodeExtension`
    -   [x] Export `ParallelNodeExtension`
    -   [x] Export `ToolNodeExtension`
-   [x] Export `SCHEMA_VERSION` constant
-   [x] Remove `export * from './history'` (internal)
-   [x] Remove `export * from './commands'` (internal, accessed via editor.commands)

### 1.3 Add JSDoc to Public Types

-   [x] Add JSDoc to all exported types in `types.ts`
-   [x] Add JSDoc to `WorkflowEditor` class and public methods
-   [x] Add JSDoc to `validateWorkflow` function
-   [x] Add JSDoc to `LocalStorageAdapter` class

### 1.4 Verify Build and Types

-   [x] Run `bun run build` in `packages/workflow-core`
-   [x] Verify `.d.ts` files only contain public exports
-   [x] Run `bun run typecheck` to ensure no type errors

---

## 2. Lock Down `@or3/workflow-vue` Exports

**Requirements: 2.1, 2.2, 2.3, 2.4**

### 2.1 Rename `useEditor` to `useWorkflowEditor`

-   [x] Rename function in `packages/workflow-vue/src/composables/useEditor.ts`
-   [x] Add backward-compatible alias `export const useEditor = useWorkflowEditor`
-   [x] Update JSDoc with full usage example
-   [x] Update import in index.ts

### 2.2 Create `useWorkflowExecution` Composable

-   [x] Create `packages/workflow-vue/src/composables/useWorkflowExecution.ts`
    -   [x] Define `WorkflowExecutionState` interface
    -   [x] Define `UseWorkflowExecutionReturn` interface
    -   [x] Implement `useWorkflowExecution()` composable
        -   [x] Implement `execute(adapter, workflow, input)` function
        -   [x] Implement `stop(adapter)` function
        -   [x] Implement `reset()` function
        -   [x] Wire up `ExecutionCallbacks` to update reactive state
    -   [x] Add JSDoc documentation
-   [x] Add unit tests in `packages/workflow-vue/src/composables/__tests__/`

### 2.3 Create `useWorkflowStorage` Composable

-   [x] Create `packages/workflow-vue/src/composables/useWorkflowStorage.ts`
    -   [x] Define `UseWorkflowStorageReturn` interface
    -   [x] Implement `useWorkflowStorage(adapter: StorageAdapter)` composable
        -   [x] Implement `loadList()` function
        -   [x] Implement `load(id)` function
        -   [x] Implement `save(workflow)` function
        -   [x] Implement `remove(id)` function
    -   [x] Add JSDoc documentation
-   [x] Add unit tests with mock adapter

### 2.4 Refactor `index.ts` to Explicit Exports

-   [x] Export composables
    -   [x] `useWorkflowEditor` (primary)
    -   [x] `useEditor` (alias for backward compat)
    -   [x] `useWorkflowExecution`
    -   [x] `useWorkflowStorage`
    -   [x] `useExecutionState`
-   [x] Export core components
    -   [x] `WorkflowCanvas`
    -   [x] `NodePalette`
    -   [x] `NodeInspector`
    -   [x] `ChatPanel`
-   [x] Export optional components
    -   [x] `Controls`
    -   [x] `MiniMap`
    -   [x] `EdgeLabelEditor`
    -   [x] `ValidationOverlay`
-   [x] Export `NodeWrapper` for custom node rendering
-   [x] Re-export key types from `@or3/workflow-core`
    -   [x] `WorkflowData`
    -   [x] `WorkflowNode`
    -   [x] `WorkflowEdge`
    -   [x] `NodeStatus`
    -   [x] `ExecutionResult`
    -   [x] `StorageAdapter`
    -   [x] `WorkflowSummary`
-   [x] Remove individual node component exports (internal)

### 2.5 Verify Build

-   [x] Run `bun run build` in `packages/workflow-vue`
-   [x] Verify `.d.ts` files only contain public exports
-   [x] Run `bun run typecheck`

---

## 3. Refactor `OpenRouterExecutionAdapter`

**Requirements: 3.1, 3.2**

### 3.1 Validate Client Injection

-   [x] Review constructor in `packages/workflow-core/src/execution.ts`
-   [x] Add validation that `client` is provided
-   [x] Throw descriptive error if client is null/undefined
-   [x] Add JSDoc with usage example showing client injection

### 3.2 Audit for Direct Fetch Usage

-   [x] Search for `fetch(` in execution.ts
-   [x] Replace any direct fetch calls with SDK methods
-   [x] For model capabilities:
    -   [x] Check if OpenRouter SDK has a models API
    -   [x] If not, use static capabilities or cached data (used static inference)
-   [x] Ensure all LLM calls use `client.chat.send()`
-   [x] Add/update unit tests for adapter

### 3.3 Add Adapter Tests

-   [x] Add test for constructor validation
-   [x] Add test with mock OpenRouter client
-   [x] Add test for execution callbacks being called
-   [x] Add tests for getModelCapabilities
-   [x] Add tests for supportsModality

---

## 4. Define Storage and Execution Interfaces

**Requirements: 4.1, 4.2**

### 4.1 Verify `StorageAdapter` Interface

-   [x] Review interface in `packages/workflow-core/src/types.ts`
-   [x] Ensure all required methods are defined:
    -   [x] `load(id: string): Promise<WorkflowData>`
    -   [x] `save(workflow: WorkflowData): Promise<string>`
    -   [x] `delete(id: string): Promise<void>`
    -   [x] `list(): Promise<WorkflowSummary[]>`
-   [x] Add optional methods:
    -   [x] `export(workflow: WorkflowData): string`
    -   [x] `import(json: string): WorkflowData`
-   [x] Add JSDoc documentation with implementation example

### 4.2 Verify `ExecutionCallbacks` Interface

-   [x] Review interface in `packages/workflow-core/src/types.ts`
-   [x] Ensure all callbacks are documented:
    -   [x] `onNodeStart(nodeId: string): void`
    -   [x] `onNodeFinish(nodeId: string, output: string): void`
    -   [x] `onNodeError(nodeId: string, error: Error): void`
    -   [x] `onToken(nodeId: string, token: string): void`
    -   [x] `onRouteSelected?(nodeId: string, routeId: string): void`
-   [x] Add JSDoc documentation with usage example

### 4.3 Verify `ExecutionResult` Interface

-   [x] Review interface in `packages/workflow-core/src/types.ts`
-   [x] Ensure all fields are defined:
    -   [x] `success: boolean`
    -   [x] `output: string`
    -   [x] `nodeOutputs: Record<string, string>`
    -   [x] `duration: number`
    -   [x] `error?: Error`
    -   [x] `usage?: TokenUsage`
-   [x] Add JSDoc documentation with usage example

---

## 5. Update Demo Application (`demo-v2`)

**Requirements: 5.1, 5.2**

### 5.1 Refactor Demo Composables

-   [x] Extract reusable parts of `demo-v2/src/composables/useWorkflowExecution.ts`
    -   [x] Move generic execution state management to `@or3/workflow-vue`
    -   [x] Keep demo-specific chat/message handling in demo-v2
-   [x] Extract reusable parts of `demo-v2/src/composables/useWorkflowStorage.ts`
    -   [x] Move generic storage wrapper to `@or3/workflow-vue`
    -   [x] Keep demo-specific UI logic in demo-v2

### 5.2 Update Demo Imports

-   [x] Update `demo-v2/src/App.vue` to import from packages
    -   [x] Import `useWorkflowEditor` from `@or3/workflow-vue`
    -   [x] Import `useWorkflowExecution` from `@or3/workflow-vue`
    -   [x] Import `useWorkflowStorage` from `@or3/workflow-vue`
-   [x] Update `demo-v2/src/composables/index.ts` to re-export package composables
-   [x] Remove duplicated code from demo composables

### 5.3 Verify Demo Still Works

-   [x] Run `bun install` in demo-v2 directory
-   [x] Run `bun dev` and verify app loads
-   [ ] Test creating a workflow
-   [ ] Test saving/loading workflow
-   [ ] Test executing workflow (with API key)
-   [ ] Test all node types (start, agent, router, parallel)

---

## 6. Update Documentation

**Requirements: NFR-2, NFR-3**

### 6.1 Update README.md

-   [ ] Update Quick Start with new API
-   [ ] Update import examples to use explicit exports
-   [ ] Add section on creating custom storage adapters
-   [ ] Add section on execution event subscription
-   [ ] Document breaking changes from previous version

### 6.2 Add API Reference

-   [ ] Document `createWorkflowEditor` function
-   [ ] Document `useWorkflowEditor` composable
-   [ ] Document `useWorkflowExecution` composable
-   [ ] Document `useWorkflowStorage` composable
-   [ ] Document `OpenRouterExecutionAdapter` class
-   [ ] Document `LocalStorageAdapter` class

---

## 7. Testing and Validation

### 7.1 Run All Tests

-   [ ] Run `bun test` in workspace root
-   [ ] Ensure all existing tests pass
-   [ ] Ensure new tests pass

### 7.2 Type Checking

-   [ ] Run `bun run typecheck` in workspace root
-   [ ] Fix any type errors

### 7.3 Build All Packages

-   [ ] Run `bun run build` in workspace root
-   [ ] Verify all packages build successfully
-   [ ] Check bundle sizes are reasonable

### 7.4 Verify Demo-v2 Works

-   [ ] Confirm demo-v2 imports from packages correctly
-   [ ] Run full manual test of demo-v2
-   [ ] Test all node types and execution

---

## Summary

| Task Group                             | Est. Time | Dependencies |
| -------------------------------------- | --------- | ------------ |
| 1. Lock down workflow-core             | 2-3 hours | None         |
| 2. Lock down workflow-vue              | 2-3 hours | Task 1       |
| 3. Refactor OpenRouterExecutionAdapter | 1-2 hours | None         |
| 4. Define interfaces                   | 1 hour    | None         |
| 5. Update demo-v2                      | 1-2 hours | Tasks 1-4    |
| 6. Update documentation                | 1-2 hours | Tasks 1-5    |
| 7. Testing and validation              | 1-2 hours | All          |

**Total Estimated Time: 9-15 hours**
