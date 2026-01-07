# Developer Experience Review - Implementation Tasks

## Overview

Tasks are organized by **work stream** to enable parallel development without file conflicts. Each work stream can be assigned to a different developer.

---

## Work Stream A: Documentation (No Code Changes)

**Owner:** _Assign a technical writer or developer_  
**Files:** `/docs/*`, `/README.md`, `/EXTENSIONS.md`  
**Dependencies:** None (can start immediately)

### A.1 Fix Quick-Start Execution Examples

**Priority:** Critical  
**Requirements:** 1.1

-   [ ] A.1.1 Update `docs/quick-start.md` lines 72-93 with correct `OpenRouterExecutionAdapter` constructor signature
    -   Change from `new OpenRouterExecutionAdapter({ client, extensions, ... })`
    -   To `new OpenRouterExecutionAdapter(client, options)` with callbacks in `execute()`
-   [x] A.1.2 Fix `editor.nodes` references to not use `.value?.nodes` when using class directly
-   [x] A.1.3 Remove non-existent parameters: `extensions`, `onNodeStart`, `onNodeComplete`, `onStreamChunk` from adapter constructor

### A.2 Fix README Execution Examples

**Priority:** Critical  
**Requirements:** 1.1

-   [x] A.2.1 Update `README.md` lines 121-160 with correct adapter usage
-   [x] A.2.2 Ensure example compiles with actual API

### A.3 Fix Vue Composable Documentation

**Priority:** Critical  
**Requirements:** 1.2

-   [x] A.3.1 Update `docs/vue/composables.md` lines 9-118 for `useEditor`
    -   Remove: `autofocus`, `onCreate`, `onValidation`, `isReady`
    -   Document actual options: `extensions`, `content`, `onUpdate`, `onSelectionUpdate`
-   [x] A.3.2 Update `docs/vue/composables.md` lines 200-350 for `useWorkflowExecution`
    -   Remove: pause/resume, HITL state, messages
    -   Document actual return: `isRunning`, `execute(adapter, workflow, input, callbacks)`, `stop`, `reset`
-   [x] A.3.3 Verify `docs/quick-start.md` complete example matches actual API

### A.4 Align EXTENSIONS.md with Types

**Priority:** High  
**Requirements:** 1.3, 3.2

-   [x] A.4.1 Update `EXTENSIONS.md` to show correct required/optional fields for `NodeExtension`
-   [x] A.4.2 Add "Creating a Custom Executable Node" section with working example
-   [x] A.4.3 Include complete example showing `execute()` and `validate()` implementations
-   [x] A.4.4 Document that custom nodes need to be registered for execution (until bridge is implemented)

### A.5 Update useEditor Deprecation

**Priority:** Medium  
**Requirements:** 2.2

-   [x] A.5.1 Decision: Either remove `useEditor` deprecation OR update all docs to use `useWorkflowEditor`
-   [x] A.5.2 Update `docs/quick-start.md` to use chosen name consistently
-   [x] A.5.3 Update `README.md` to use chosen name consistently
-   [x] A.5.4 Update `docs/vue/composables.md` to use chosen name consistently

### A.6 Add Security Guidance

**Priority:** Medium  
**Requirements:** 9.1

-   [x] A.6.1 Add warning in `docs/quick-start.md` about localStorage API key storage
-   [x] A.6.2 Add "Security Considerations" section recommending backend proxy for production
-   [x] A.6.3 Add warning comment in demo-v2 where API key is stored

---

## Work Stream B: Demo Application

**Owner:** _Assign a developer_  
**Files:** `/demo-v2/*`  
**Dependencies:** None (can start immediately)

### B.1 Rename useWorkflowExecution to Avoid Collision

**Priority:** Critical  
**Requirements:** 2.1

-   [x] B.1.1 Rename `demo-v2/src/composables/useWorkflowExecution.ts` to `useDemoExecution.ts`
-   [x] B.1.2 Update function name from `useWorkflowExecution` to `useDemoExecution`
-   [x] B.1.3 Update `demo-v2/src/composables/index.ts` export
-   [x] B.1.4 Update all imports in `demo-v2/src/App.vue`
-   [ ] B.1.5 Verify demo still runs correctly

### B.2 Refactor App.vue (Optional - Lower Priority)

**Priority:** Low  
**Requirements:** 7.1

> **Note:** This task has been moved to a dedicated spec with detailed phased implementation plan.
> See: `.kiro/specs/demo-app-refactor/tasks.md`

-   [ ] B.2.1 See `.kiro/specs/demo-app-refactor/` for detailed refactoring plan
    -   Phase 1: Extract LeftSidebar component
    -   Phase 2: Extract MobileNav component
    -   Phase 3: Extract CanvasArea component
    -   Phase 4: Final cleanup and verification
-   [ ] B.2.2 Extract workflow manager to `demo-v2/src/components/WorkflowManager.vue`
-   [ ] B.2.3 Extract settings modal to `demo-v2/src/components/SettingsModal.vue`
-   [ ] B.2.4 Reduce `App.vue` to under 500 lines
-   [ ] B.2.5 Verify all functionality still works

---

## Work Stream C: workflow-core - Extension System

**Owner:** ✅ Completed  
**Files:** `/packages/workflow-core/src/editor.ts`, `/packages/workflow-core/src/execution.ts`  
**Dependencies:** None (can start immediately)

### C.1 Bridge Editor Extensions to Execution Registry

**Priority:** Critical  
**Requirements:** 3.1

-   [x] C.1.1 Import `registerExtension` from `execution.ts` into `editor.ts`
-   [x] C.1.2 Modify `WorkflowEditor.registerExtension()` to also call global `registerExtension()` for NodeExtensions
-   [x] C.1.3 Add type guard: only register if extension has `execute` method
-   [x] C.1.4 Add unit test: custom extension registered via editor is available in `extensionRegistry`
-   [x] C.1.5 Add integration test: custom node executes without manual registration

### C.2 Wire Editor Lifecycle Hooks

**Priority:** Medium  
**Requirements:** 8.1

-   [x] C.2.1 Store options in `WorkflowEditor` class property
-   [x] C.2.2 Call `options.onUpdate({ editor: this })` in `emit('update')` handler
-   [x] C.2.3 Call `options.onSelectionUpdate({ editor: this })` in `emit('selectionUpdate')` handler
-   [x] C.2.4 Add unit test for lifecycle hook invocation

---

## Work Stream D: workflow-core - Configuration & Types

**Owner:** ✅ Completed  
**Files:** `/packages/workflow-core/src/execution.ts`, `/packages/workflow-core/src/types.ts`, `/packages/workflow-core/src/index.ts`  
**Dependencies:** None (can start immediately)

### D.1 Fix Default Model

**Priority:** High  
**Requirements:** 4.1, 4.2

-   [x] D.1.1 Change `DEFAULT_MODEL` in `execution.ts` from `'z-ai/glm-4.6:exacto'` to `'openai/gpt-4o-mini'`
-   [x] D.1.2 Ensure `ExecutionOptions.defaultModel` is documented in types
-   [ ] D.1.3 Add test: default model is used when node has no model specified _(existing execution tests cover this)_

### D.2 Add ToolDefinition Type

**Priority:** Medium  
**Requirements:** 6.1

-   [x] D.2.1 Add `ToolDefinition` interface to `types.ts`:
    ```typescript
    export interface ToolDefinition {
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters?: {
                type: 'object';
                properties?: Record<string, unknown>;
                required?: string[];
            };
        };
    }
    ```
-   [x] D.2.2 Update `LLMProvider.tools` from `any[]` to `ToolDefinition[]`
-   [x] D.2.3 Remove TODO comment about tool types
-   [x] D.2.4 Add type test to verify tool definition validation _(TypeScript compilation validates this)_

### D.3 Export Missing Types

**Priority:** Low  
**Requirements:** 6.2, 2.3

-   [x] D.3.1 Add `ExecutionCallbacks` export to `packages/workflow-core/src/index.ts` _(already exported)_
-   [x] D.3.2 Verify all commonly-used types are exported _(added LLMProvider, ToolDefinition, ToolFunctionDefinition, ToolParameterSchema, ToolCallResult, ExecutableToolDefinition)_
-   [ ] D.3.3 Document exported types in package README

### D.4 Clarify StarterKit Options (Optional)

**Priority:** Low  
**Requirements:** 3.3

-   [ ] D.4.1 Document that `subflow.maxNestingDepth` should be passed to `ExecutionOptions.maxSubflowDepth`
-   [ ] D.4.2 Consider removing unused StarterKit options or wiring them to execution
-   [ ] D.4.3 Update StarterKit JSDoc comments

---

## Work Stream E: workflow-vue - State & Composables

**Owner:** ✅ Completed  
**Files:** `/packages/workflow-vue/src/composables/*`  
**Dependencies:** None (can start immediately)

### E.1 Fix useExecutionState Shared State Bug

**Priority:** High  
**Requirements:** 5.1

-   [x] E.1.1 Modify `useExecutionState()` to call `createExecutionState()` instead of returning shared instance
-   [x] E.1.2 Update deprecation comment to explain the fix
-   [x] E.1.3 Add unit test: two calls to `useExecutionState()` return independent state objects
-   [x] E.1.4 Verify demo-v2 still works correctly

### E.2 Remove useEditor Deprecation (if decided in A.5)

**Priority:** Medium  
**Requirements:** 2.2

-   [x] E.2.1 If keeping both names: remove `@deprecated` from `useEditor` alias
-   [x] E.2.2 If deprecating: keep deprecation, ensure docs updated (Work Stream A)

### E.3 Standardize Callback Naming (Optional)

**Priority:** Low  
**Requirements:** 2.3

-   [x] E.3.1 Audit callback names in `useWorkflowExecution.ts`
-   [x] E.3.2 Align with core callback names (`onToken` vs `onStreamingContent`)
-   [x] E.3.3 Update any demo code that uses old names

---

## Work Stream F: workflow-vue - Canvas Performance (Future)

**Owner:** ✅ Completed  
**Files:** `/packages/workflow-vue/src/components/WorkflowCanvas.vue`  
**Dependencies:** Can be done independently, but lower priority

### F.1 Optimize syncFromEditor Performance

**Priority:** Medium  
**Requirements:** 5.2

-   [x] F.1.1 Add version counter to `WorkflowEditor` for each node/edge
-   [x] F.1.2 Replace `JSON.stringify` fingerprinting with version-based comparison
-   [x] F.1.3 Benchmark with 100+ nodes to verify improvement
-   [x] F.1.4 Add performance test to catch regressions

### F.2 Implement Dynamic Node Registry (Future)

**Priority:** Low (Future Enhancement)  
**Requirements:** Related to extensibility review

-   [x] F.2.1 Create `nodeRegistry.ts` with `createNodeRegistry()` function
-   [x] F.2.2 Pre-register built-in node components
-   [x] F.2.3 Export registry from `@or3/workflow-vue`
-   [x] F.2.4 Update `WorkflowCanvas.vue` to use dynamic template rendering
-   [x] F.2.5 Document how to register custom node components

---

## Work Stream G: Code Quality (Future)

**Owner:** _Assign when capacity available_  
**Files:** Various  
**Dependencies:** All other streams complete

### G.1 Modularize types.ts

**Priority:** Low  
**Requirements:** 7.2

-   [x] G.1.1 Create `packages/workflow-core/src/types/` directory
-   [x] G.1.2 Extract execution types to `types/execution.ts`
-   [x] G.1.3 Extract schema types to `types/schemas.ts`
-   [x] G.1.4 Extract HITL types to `types/hitl.ts`
-   [x] G.1.5 Keep `types.ts` as barrel export for backward compatibility
-   [x] G.1.6 Verify all imports still work

### G.2 Add Command Validation (Future)

**Priority:** Low  
**Requirements:** 8.2

-   [x] G.2.1 Audit README claims about command validation
-   [x] G.2.2 Either implement validation in `CommandManager` or update docs
-   [x] G.2.3 Add tests for validation behavior

---

## Summary: Priority Order

### Critical (Do First)

| Task    | Work Stream    | Owner | Status      |
| ------- | -------------- | ----- | ----------- |
| A.1-A.3 | Documentation  | TBD   |             |
| B.1     | Demo           | TBD   |             |
| C.1     | Core Extension | -     | ✅ Complete |

### High Priority

| Task | Work Stream   | Owner | Status      |
| ---- | ------------- | ----- | ----------- |
| A.4  | Documentation | TBD   |             |
| D.1  | Core Config   | -     | ✅ Complete |
| E.1  | Vue State     | -     | ✅ Complete |

### Medium Priority

| Task    | Work Stream     | Owner | Status      |
| ------- | --------------- | ----- | ----------- |
| A.5-A.6 | Documentation   | TBD   |             |
| C.2     | Core Lifecycle  | -     | ✅ Complete |
| D.2     | Core Types      | -     | ✅ Complete |
| E.2     | Vue Composables | -     | ✅ Complete |
| F.1     | Vue Canvas      | -     | ✅ Complete |

### Low Priority (Future)

| Task    | Work Stream   | Owner | Status          |
| ------- | ------------- | ----- | --------------- |
| B.2     | Demo Refactor | TBD   |                 |
| D.3-D.4 | Core Types    | -     | ✅ D.3 Complete |
| E.3     | Vue Callbacks | -     | ✅ Complete     |
| F.2     | Vue Registry  | -     | ✅ Complete     |
| G.1-G.2 | Code Quality  | TBD   | ✅ Complete     |

---

## File Ownership Matrix

To avoid conflicts, each work stream owns specific files:

| Work Stream        | Owned Files                                                | Can Modify             | Status      |
| ------------------ | ---------------------------------------------------------- | ---------------------- | ----------- |
| A (Docs)           | `/docs/*`, `/README.md`, `/EXTENSIONS.md`                  | Only docs              |             |
| B (Demo)           | `/demo-v2/*`                                               | Only demo              |             |
| C (Core Extension) | `editor.ts`, parts of `execution.ts`                       | Extension registration | ✅ Complete |
| D (Core Config)    | `types.ts`, `index.ts`, parts of `execution.ts`            | Types and config       | ✅ Complete |
| E (Vue State)      | `/packages/workflow-vue/src/composables/*`                 | Composables only       | ✅ Complete |
| F (Vue Canvas)     | `/packages/workflow-vue/src/components/WorkflowCanvas.vue` | Canvas only            | ✅ Complete |
| G (Quality)        | Various                                                    | After other streams    |             |

**Conflict Risk:**

-   C and D both touch `execution.ts` - coordinate on which sections
-   A and all other streams - docs should be updated after code changes land
