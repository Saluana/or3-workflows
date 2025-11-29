# or3-workflows SDK Lockdown - Implementation Tasks

## Overview

This document provides the implementation checklist for locking down the or3-workflows SDK public API. Tasks are grouped by component and ordered by dependency.

---

## 1. Lock Down `@or3/workflow-core` Exports

**Requirements: 1.1, 1.2, 1.3, 1.4, 1.5**

### 1.1 Create `createWorkflowEditor` Factory Function

-   [ ] Add `createWorkflowEditor` function to `packages/workflow-core/src/editor.ts`
    -   [ ] Function accepts `EditorOptions` and returns `WorkflowEditor`
    -   [ ] Add JSDoc documentation with usage example
-   [ ] Add unit test for factory function in `packages/workflow-core/src/__tests__/editor.test.ts`

### 1.2 Refactor `index.ts` to Explicit Exports

-   [ ] Replace `export * from './types'` with explicit type exports
    -   [ ] Export public types: `WorkflowData`, `WorkflowNode`, `WorkflowEdge`
    -   [ ] Export node data types: `NodeData`, `AgentNodeData`, `RouterNodeData`, `ParallelNodeData`, `ToolNodeData`, `StartNodeData`
    -   [ ] Export execution types: `ExecutionInput`, `ExecutionResult`, `ExecutionCallbacks`, `ExecutionOptions`, `ChatMessage`, `NodeStatus`
    -   [ ] Export extension types: `Extension`, `NodeExtension`, `PortDefinition`
    -   [ ] Export storage types: `StorageAdapter`, `WorkflowSummary`
-   [ ] Export `createWorkflowEditor` from `./editor`
-   [ ] Export `WorkflowEditor` type (for typing, but factory is preferred)
-   [ ] Export `EditorOptions` type
-   [ ] Replace `export * from './validation'` with explicit export
    -   [ ] Export `validateWorkflow` function
    -   [ ] Export `ValidationResult`, `ValidationError`, `ValidationWarning` types
-   [ ] Replace `export * from './execution'` with explicit exports
    -   [ ] Export `ExecutionAdapter` type from types
    -   [ ] Export `OpenRouterExecutionAdapter` class
-   [ ] Replace `export * from './storage'` with explicit exports
    -   [ ] Export `LocalStorageAdapter` class
-   [ ] Replace `export * from './extensions'` with explicit exports
    -   [ ] Export `StartNodeExtension`
    -   [ ] Export `AgentNodeExtension`
    -   [ ] Export `RouterNodeExtension`
    -   [ ] Export `ParallelNodeExtension`
    -   [ ] Export `ToolNodeExtension`
-   [ ] Export `SCHEMA_VERSION` constant
-   [ ] Remove `export * from './history'` (internal)
-   [ ] Remove `export * from './commands'` (internal, accessed via editor.commands)

### 1.3 Add JSDoc to Public Types

-   [ ] Add JSDoc to all exported types in `types.ts`
-   [ ] Add JSDoc to `WorkflowEditor` class and public methods
-   [ ] Add JSDoc to `validateWorkflow` function
-   [ ] Add JSDoc to `LocalStorageAdapter` class

### 1.4 Verify Build and Types

-   [ ] Run `bun run build` in `packages/workflow-core`
-   [ ] Verify `.d.ts` files only contain public exports
-   [ ] Run `bun run typecheck` to ensure no type errors

---

## 2. Lock Down `@or3/workflow-vue` Exports

**Requirements: 2.1, 2.2, 2.3, 2.4**

### 2.1 Rename `useEditor` to `useWorkflowEditor`

-   [ ] Rename function in `packages/workflow-vue/src/composables/useEditor.ts`
-   [ ] Add backward-compatible alias `export const useEditor = useWorkflowEditor`
-   [ ] Update JSDoc with full usage example
-   [ ] Update import in index.ts

### 2.2 Create `useWorkflowExecution` Composable

-   [ ] Create `packages/workflow-vue/src/composables/useWorkflowExecution.ts`
    -   [ ] Define `WorkflowExecutionState` interface
    -   [ ] Define `UseWorkflowExecutionReturn` interface
    -   [ ] Implement `useWorkflowExecution()` composable
        -   [ ] Implement `execute(adapter, workflow, input)` function
        -   [ ] Implement `stop(adapter)` function
        -   [ ] Implement `reset()` function
        -   [ ] Wire up `ExecutionCallbacks` to update reactive state
    -   [ ] Add JSDoc documentation
-   [ ] Add unit tests in `packages/workflow-vue/src/composables/__tests__/`

### 2.3 Create `useWorkflowStorage` Composable

-   [ ] Create `packages/workflow-vue/src/composables/useWorkflowStorage.ts`
    -   [ ] Define `UseWorkflowStorageReturn` interface
    -   [ ] Implement `useWorkflowStorage(adapter: StorageAdapter)` composable
        -   [ ] Implement `loadList()` function
        -   [ ] Implement `load(id)` function
        -   [ ] Implement `save(workflow)` function
        -   [ ] Implement `remove(id)` function
    -   [ ] Add JSDoc documentation
-   [ ] Add unit tests with mock adapter

### 2.4 Refactor `index.ts` to Explicit Exports

-   [ ] Export composables
    -   [ ] `useWorkflowEditor` (primary)
    -   [ ] `useEditor` (alias for backward compat)
    -   [ ] `useWorkflowExecution`
    -   [ ] `useWorkflowStorage`
    -   [ ] `useExecutionState`
-   [ ] Export core components
    -   [ ] `WorkflowCanvas`
    -   [ ] `NodePalette`
    -   [ ] `NodeInspector`
    -   [ ] `ChatPanel`
-   [ ] Export optional components
    -   [ ] `Controls`
    -   [ ] `MiniMap`
    -   [ ] `EdgeLabelEditor`
    -   [ ] `ValidationOverlay`
-   [ ] Export `NodeWrapper` for custom node rendering
-   [ ] Re-export key types from `@or3/workflow-core`
    -   [ ] `WorkflowData`
    -   [ ] `WorkflowNode`
    -   [ ] `WorkflowEdge`
    -   [ ] `NodeStatus`
    -   [ ] `ExecutionResult`
    -   [ ] `StorageAdapter`
    -   [ ] `WorkflowSummary`
-   [ ] Remove individual node component exports (internal)

### 2.5 Verify Build

-   [ ] Run `bun run build` in `packages/workflow-vue`
-   [ ] Verify `.d.ts` files only contain public exports
-   [ ] Run `bun run typecheck`

---

## 3. Refactor `OpenRouterExecutionAdapter`

**Requirements: 3.1, 3.2**

### 3.1 Validate Client Injection

-   [ ] Review constructor in `packages/workflow-core/src/execution.ts`
-   [ ] Add validation that `client` is provided
-   [ ] Throw descriptive error if client is null/undefined
-   [ ] Add JSDoc with usage example showing client injection

### 3.2 Audit for Direct Fetch Usage

-   [ ] Search for `fetch(` in execution.ts
-   [ ] Replace any direct fetch calls with SDK methods
-   [ ] For model capabilities:
    -   [ ] Check if OpenRouter SDK has a models API
    -   [ ] If not, use static capabilities or cached data
-   [ ] Ensure all LLM calls use `client.chat.completions.create()`
-   [ ] Add/update unit tests for adapter

### 3.3 Add Adapter Tests

-   [ ] Add test for constructor validation
-   [ ] Add test with mock OpenRouter client
-   [ ] Add test for execution callbacks being called

---

## 4. Define Storage and Execution Interfaces

**Requirements: 4.1, 4.2**

### 4.1 Verify `StorageAdapter` Interface

-   [ ] Review interface in `packages/workflow-core/src/types.ts`
-   [ ] Ensure all required methods are defined:
    -   [ ] `load(id: string): Promise<WorkflowData>`
    -   [ ] `save(workflow: WorkflowData): Promise<string>`
    -   [ ] `delete(id: string): Promise<void>`
    -   [ ] `list(): Promise<WorkflowSummary[]>`
-   [ ] Add optional methods:
    -   [ ] `export?(workflow: WorkflowData): string`
    -   [ ] `import?(json: string): WorkflowData`
-   [ ] Add JSDoc documentation

### 4.2 Verify `ExecutionCallbacks` Interface

-   [ ] Review interface in `packages/workflow-core/src/types.ts`
-   [ ] Ensure all callbacks are documented:
    -   [ ] `onNodeStart(nodeId: string): void`
    -   [ ] `onNodeFinish(nodeId: string, output: string): void`
    -   [ ] `onNodeError(nodeId: string, error: Error): void`
    -   [ ] `onToken(nodeId: string, token: string): void`
    -   [ ] `onRouteSelected?(nodeId: string, routeId: string): void`
-   [ ] Add JSDoc documentation

### 4.3 Verify `ExecutionResult` Interface

-   [ ] Review interface in `packages/workflow-core/src/types.ts`
-   [ ] Ensure all fields are defined:
    -   [ ] `success: boolean`
    -   [ ] `output: string`
    -   [ ] `nodeOutputs: Record<string, string>`
    -   [ ] `duration: number`
    -   [ ] `error?: Error`
    -   [ ] `usage?: TokenUsage`
-   [ ] Add JSDoc documentation

---

## 5. Update Demo Application (`demo-v2`)

**Requirements: 5.1, 5.2**

### 5.1 Refactor Demo Composables

-   [ ] Extract reusable parts of `demo-v2/src/composables/useWorkflowExecution.ts`
    -   [ ] Move generic execution state management to `@or3/workflow-vue`
    -   [ ] Keep demo-specific chat/message handling in demo-v2
-   [ ] Extract reusable parts of `demo-v2/src/composables/useWorkflowStorage.ts`
    -   [ ] Move generic storage wrapper to `@or3/workflow-vue`
    -   [ ] Keep demo-specific UI logic in demo-v2

### 5.2 Update Demo Imports

-   [ ] Update `demo-v2/src/App.vue` to import from packages
    -   [ ] Import `useWorkflowEditor` from `@or3/workflow-vue`
    -   [ ] Import `useWorkflowExecution` from `@or3/workflow-vue`
    -   [ ] Import `useWorkflowStorage` from `@or3/workflow-vue`
-   [ ] Update `demo-v2/src/composables/index.ts` to re-export package composables
-   [ ] Remove duplicated code from demo composables

### 5.3 Verify Demo Still Works

-   [ ] Run `bun install` in demo-v2 directory
-   [ ] Run `bun dev` and verify app loads
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
