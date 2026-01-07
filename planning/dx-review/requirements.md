# Developer Experience Review - Requirements

## Overview

This document consolidates requirements from three developer experience reviews. Issues are organized by severity and project area to enable parallel work streams without file conflicts.

---

## 1. Documentation Accuracy

### 1.1 Fix Quick-Start and README API Examples

**Priority:** Critical  
**Area:** Documentation

**User Story:** As a developer, I want copy-paste examples that work without modification, so that I can get started quickly without debugging incorrect API signatures.

**Acceptance Criteria:**

- WHEN a developer copies the `OpenRouterExecutionAdapter` example from `docs/quick-start.md` THEN it SHALL compile without type errors
- WHEN a developer uses the README example for execution THEN it SHALL work with the actual constructor signature `(clientOrProvider, options)`
- IF the adapter constructor does not accept `extensions` or lifecycle callbacks THEN the docs SHALL NOT show those parameters
- WHEN docs reference `editor.nodes` THEN it SHALL match the actual API (not `editor.value?.nodes` for refs)

### 1.2 Align Vue Composable Documentation

**Priority:** Critical  
**Area:** Documentation

**User Story:** As a Vue developer, I want the composable documentation to match the actual implementation, so that I don't waste time debugging missing features.

**Acceptance Criteria:**

- WHEN `docs/vue/composables.md` describes `useEditor` options THEN each option SHALL exist in the implementation
- IF the docs list `autofocus`, `onCreate`, `onValidation`, `isReady` options THEN those SHALL work in code or be removed from docs
- WHEN the docs describe `useWorkflowExecution` features (pause/resume/HITL state, messages) THEN those SHALL be implemented or removed from docs
- WHEN `execute()` is called THEN its signature SHALL match the documented signature

### 1.3 Align Extension Documentation with Types

**Priority:** High  
**Area:** Documentation

**User Story:** As a developer building custom nodes, I want the EXTENSIONS.md guide to match TypeScript types, so that my code compiles.

**Acceptance Criteria:**

- WHEN `EXTENSIONS.md` shows `NodeExtension` fields THEN they SHALL match `packages/workflow-core/src/types.ts`
- IF fields like `inputs`, `outputs`, `defaultData`, `execute`, `validate` are required in types THEN docs SHALL show them as required
- WHEN a developer follows the extension guide THEN their code SHALL compile without TypeScript errors

---

## 2. API Naming Consistency

### 2.1 Resolve `useWorkflowExecution` Name Collision

**Priority:** Critical  
**Area:** demo-v2

**User Story:** As a developer, I want unambiguous imports, so that I don't accidentally use the wrong composable.

**Acceptance Criteria:**

- WHEN importing from `@or3/workflow-vue` THEN `useWorkflowExecution` SHALL have a distinct signature
- WHEN the demo has its own execution composable THEN it SHALL use a different name (e.g., `useDemoExecution`)
- IF both are imported in the same file THEN there SHALL be no naming conflict

### 2.2 Resolve `useEditor` Deprecation Status

**Priority:** Medium  
**Area:** workflow-vue

**User Story:** As a developer, I want consistent guidance on which composable to use, so that I don't get deprecation warnings after following docs.

**Acceptance Criteria:**

- IF `useEditor` is deprecated THEN all docs SHALL use `useWorkflowEditor` instead
- IF `useEditor` is an acceptable alias THEN the deprecation warning SHALL be removed
- WHEN a developer follows any documentation THEN they SHALL NOT see deprecation warnings

### 2.3 Standardize Callback Naming

**Priority:** Medium  
**Area:** workflow-core, workflow-vue

**User Story:** As a developer, I want consistent callback names across core and Vue packages, so that I can easily understand the API.

**Acceptance Criteria:**

- WHEN core uses `onToken` THEN Vue layer SHALL NOT use `onStreamingContent` for the same concept
- WHEN core uses `onReasoning` THEN Vue layer SHALL NOT use `onReasoningToken` for the same concept
- WHEN `ExecutionCallbacks` is defined THEN it SHALL be exported from `@or3/workflow-core`

---

## 3. Extension System

### 3.1 Bridge Editor Extensions to Execution Registry

**Priority:** Critical  
**Area:** workflow-core

**User Story:** As a developer building custom nodes, I want extensions registered with the editor to automatically work with validation and execution, so that I don't need to register them twice.

**Acceptance Criteria:**

- WHEN an extension is registered via `editor.registerExtension()` THEN it SHALL be discoverable by `validateWorkflow()`
- WHEN an extension is registered via `editor.registerExtension()` THEN it SHALL be discoverable by `OpenRouterExecutionAdapter`
- IF a custom extension works in the UI THEN it SHALL also execute without manual `registerExtension()` call

### 3.2 Document Custom Node Execution

**Priority:** High  
**Area:** Documentation

**User Story:** As a developer, I want a guide on creating custom executable nodes, so that I can extend the system beyond built-in nodes.

**Acceptance Criteria:**

- WHEN I read EXTENSIONS.md THEN there SHALL be a section on implementing `NodeExtension.execute()`
- WHEN following the guide THEN I SHALL be able to create a custom node that runs during workflow execution
- WHEN the custom node executes THEN it SHALL receive proper context (inputs, signal, session, memory)

### 3.3 Wire StarterKit Options to Runtime

**Priority:** Medium  
**Area:** workflow-core

**User Story:** As a developer, I want StarterKit configuration options to actually affect runtime behavior, so that I can customize execution.

**Acceptance Criteria:**

- IF `subflow.maxNestingDepth` is configured in StarterKit THEN execution SHALL respect that limit
- WHEN StarterKit accepts an option THEN that option SHALL have an effect (not be silently ignored)
- IF the `start` flag is documented THEN it SHALL either work or be removed from docs

---

## 4. Configuration

### 4.1 Configurable Default Model

**Priority:** High  
**Area:** workflow-core

**User Story:** As a developer, I want to configure the default LLM model globally, so that I don't need to specify it on every node.

**Acceptance Criteria:**

- WHEN creating `OpenRouterExecutionAdapter` THEN I SHALL be able to pass a `defaultModel` option
- WHEN a node doesn't specify a model THEN execution SHALL use the configured default
- WHEN the default model is changed THEN new executions SHALL use the new default

### 4.2 Use Reasonable Default Model

**Priority:** High  
**Area:** workflow-core

**User Story:** As a developer, I want the default fallback model to be a known, working model, so that workflows run out of the box.

**Acceptance Criteria:**

- WHEN no model is specified THEN the fallback model SHALL be a model that exists and works (e.g., `openai/gpt-4o-mini`)
- WHEN `DEFAULT_MODELS` are listed THEN they SHALL be real, available models (not speculative future models)

---

## 5. State Management

### 5.1 Fix `useExecutionState` Shared State Issue

**Priority:** High  
**Area:** workflow-vue

**User Story:** As a developer, I want `useExecutionState()` to not cause shared state bugs, so that multiple workflow instances work correctly.

**Acceptance Criteria:**

- WHEN `useExecutionState()` is called twice THEN each call SHALL return independent state
- IF the shared instance pattern causes bugs THEN the function SHALL create fresh state each time
- WHEN the deprecated pattern is removed THEN there SHALL be no breaking changes for existing code

### 5.2 Optimize State Synchronization

**Priority:** Medium  
**Area:** workflow-vue

**User Story:** As a developer with large workflows, I want the canvas to remain responsive, so that I can work efficiently.

**Acceptance Criteria:**

- WHEN a workflow has 100+ nodes THEN the canvas SHALL remain responsive during editing
- WHEN `syncFromEditor` runs THEN it SHALL NOT use `JSON.stringify` for deep comparison
- WHEN fingerprinting nodes THEN the method SHALL be O(1) per node (shallow comparison or dirty flags)

---

## 6. Type Safety

### 6.1 Replace `any[]` in Tool Types

**Priority:** Medium  
**Area:** workflow-core

**User Story:** As a developer, I want tool definitions to be type-safe, so that I catch errors at compile time.

**Acceptance Criteria:**

- WHEN `LLMProvider.tools` is defined THEN it SHALL use a proper `ToolDefinition` interface
- WHEN I define a tool THEN TypeScript SHALL validate the structure
- WHEN the TODO comment `// TODO: Define strict tool types` exists THEN it SHALL be resolved

### 6.2 Export Validation Types

**Priority:** Low  
**Area:** workflow-core

**User Story:** As a developer, I want access to validation-related types, so that I can build typed validation UI.

**Acceptance Criteria:**

- WHEN `ExecutionCallbacks` is used externally THEN it SHALL be exported from the package index
- WHEN I import types THEN all commonly-used types SHALL be available without deep imports

---

## 7. Code Quality

### 7.1 Refactor Large Components

**Priority:** Low (Demo Only)  
**Area:** demo-v2

**User Story:** As a developer learning from the demo, I want to see well-structured code, so that I can follow best practices.

**Acceptance Criteria:**

- WHEN `App.vue` is reviewed THEN it SHALL be under 500 lines
- WHEN the demo is refactored THEN functionality SHALL be split into focused components
- WHEN developers reference the demo THEN it SHALL demonstrate proper Vue architecture

### 7.2 Modularize types.ts

**Priority:** Low  
**Area:** workflow-core

**User Story:** As a contributor, I want types organized by domain, so that I can navigate the codebase easily.

**Acceptance Criteria:**

- WHEN `types.ts` is over 1500 lines THEN it SHALL be split into domain-focused modules
- WHEN I need execution types THEN they SHALL be in a dedicated file
- WHEN I need schema types THEN they SHALL be separate from runtime types

---

## 8. Editor Lifecycle

### 8.1 Wire Editor Lifecycle Hooks

**Priority:** Medium  
**Area:** workflow-core

**User Story:** As a developer, I want `onUpdate` and `onSelectionUpdate` options to actually fire, so that I can respond to editor changes.

**Acceptance Criteria:**

- WHEN `onUpdate` is provided to `WorkflowEditor` constructor THEN it SHALL be called on updates
- WHEN `onSelectionUpdate` is provided THEN it SHALL be called on selection changes
- IF options are typed but not implemented THEN they SHALL be either implemented or removed

### 8.2 Add Validation to Commands

**Priority:** Low  
**Area:** workflow-core

**User Story:** As a developer, I want commands to validate changes, so that invalid state is prevented.

**Acceptance Criteria:**

- WHEN README says commands "handle validation" THEN commands SHALL actually validate
- WHEN a command would create invalid state THEN it SHALL reject the operation
- IF validation is not implemented THEN docs SHALL NOT claim it is

---

## 9. Security

### 9.1 Document API Key Security

**Priority:** Medium  
**Area:** Documentation

**User Story:** As a developer, I want clear guidance on API key security, so that I don't accidentally expose keys in production.

**Acceptance Criteria:**

- WHEN the demo stores API keys in localStorage THEN there SHALL be a visible warning
- WHEN documentation discusses API keys THEN it SHALL recommend backend proxying for production
- WHEN developers copy demo patterns THEN they SHALL see security guidance
