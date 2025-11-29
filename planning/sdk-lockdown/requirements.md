# or3-workflows SDK Lockdown Requirements

## Introduction

This document defines the requirements for transforming or3-workflows into a production-ready, Tiptap-style workflow SDK. The goal is to create a clean, minimal public API surface that allows integrators to build workflow-based applications without the SDK owning auth, database, or deployment concerns.

The scope includes:
1. Locking down `@or3/workflow-core` public exports
2. Locking down `@or3/workflow-vue` public exports  
3. Refactoring `OpenRouterExecutionAdapter` to accept injected clients
4. Creating formal storage and execution interfaces for integrators
5. Building a minimal example app demonstrating proper integration

---

## 1. Core Package Public API (`@or3/workflow-core`)

### 1.1 Export Only Essential Types

**User Story:** As an integrator, I want to import only the types I need from `@or3/workflow-core`, so that I have a clear, stable contract for building my application.

**Acceptance Criteria:**
- WHEN I import from `@or3/workflow-core` THEN I SHALL have access to:
  - `WorkflowData` - The main workflow document type
  - `WorkflowNode` - Individual node type
  - `WorkflowEdge` - Edge/connection type
  - `NodeData`, `AgentNodeData`, `RouterNodeData`, `ParallelNodeData`, `ToolNodeData`, `StartNodeData` - Node data types
  - `ExecutionInput` - Input type for execution
  - `ExecutionResult` - Result type from execution
  - `ExecutionCallbacks` - Callback interface for execution events
  - `ChatMessage` - Message type for conversation history
  - `NodeStatus` - Node execution status enum
  - `ValidationResult`, `ValidationError`, `ValidationWarning` - Validation types
- WHEN I import from `@or3/workflow-core` THEN internal implementation types SHALL NOT be exported
- WHEN I use TypeScript THEN all public types SHALL have proper JSDoc documentation

### 1.2 Export `createWorkflowEditor` Factory

**User Story:** As an integrator, I want a single factory function to create workflow editors, so that I have a clear entry point and the internal `WorkflowEditor` class can evolve without breaking my code.

**Acceptance Criteria:**
- WHEN I call `createWorkflowEditor(options)` THEN I SHALL receive a `WorkflowEditor` instance
- WHEN I call `createWorkflowEditor` THEN the options SHALL support:
  - `content?: WorkflowData` - Initial workflow to load
  - `extensions?: Extension[]` - Node extensions to register
  - `onUpdate?: (editor) => void` - Change callback
- WHEN the `WorkflowEditor` class implementation changes THEN the factory function signature SHALL remain stable
- WHEN I use the editor THEN I SHALL have access to the same API as the current `WorkflowEditor` class

### 1.3 Export `ExecutionAdapter` Interface and `OpenRouterExecutionAdapter`

**User Story:** As an integrator, I want a formal execution adapter interface, so that I can implement custom execution backends or use the provided OpenRouter adapter.

**Acceptance Criteria:**
- WHEN I import `ExecutionAdapter` THEN it SHALL be an interface with:
  - `execute(workflow, input, callbacks): Promise<ExecutionResult>`
  - `stop(): void`
  - `isRunning(): boolean`
- WHEN I import `OpenRouterExecutionAdapter` THEN I SHALL be able to construct it with an injected OpenRouter client
- WHEN I create `new OpenRouterExecutionAdapter(client, options)` THEN it SHALL use the provided client for all API calls
- WHEN the adapter needs to make API calls THEN it SHALL NOT use `fetch` directly; it SHALL rely only on the OpenRouter SDK surface

### 1.4 Export Node Extension System

**User Story:** As an integrator, I want to register custom node types, so that I can extend the workflow system with domain-specific nodes.

**Acceptance Criteria:**
- WHEN I import from `@or3/workflow-core` THEN I SHALL have access to:
  - `Extension` - Base extension interface
  - `NodeExtension` - Node-specific extension interface
  - `registerNodeExtension(extension)` - Function to register extensions
- WHEN I register a custom extension THEN it SHALL be available for use in workflows
- WHEN I import built-in extensions THEN I SHALL have access to:
  - `AgentNodeExtension`
  - `RouterNodeExtension`
  - `ParallelNodeExtension`
  - `StartNodeExtension`
  - `ToolNodeExtension`

### 1.5 Export `validateWorkflow` Function

**User Story:** As an integrator, I want to validate workflows before execution, so that I can catch configuration errors early.

**Acceptance Criteria:**
- WHEN I call `validateWorkflow(nodes, edges)` THEN I SHALL receive a `ValidationResult`
- WHEN the workflow is valid THEN `result.isValid` SHALL be `true`
- WHEN the workflow has errors THEN `result.errors` SHALL contain descriptive error objects
- WHEN the workflow has warnings THEN `result.warnings` SHALL contain descriptive warning objects

---

## 2. Vue Package Public API (`@or3/workflow-vue`)

### 2.1 Export `useWorkflowEditor` Composable

**User Story:** As a Vue developer, I want a composable to manage the workflow editor lifecycle, so that I have proper Vue integration with reactivity.

**Acceptance Criteria:**
- WHEN I call `useWorkflowEditor(options)` THEN I SHALL receive a reactive `Ref<WorkflowEditor | null>`
- WHEN the component is unmounted THEN the editor SHALL be properly destroyed
- WHEN the editor state changes THEN Vue reactivity SHALL trigger updates

### 2.2 Export `useWorkflowExecution` Composable

**User Story:** As a Vue developer, I want a composable to manage workflow execution state, so that I can easily show execution status in my UI.

**Acceptance Criteria:**
- WHEN I use `useWorkflowExecution()` THEN I SHALL receive:
  - `isRunning: Ref<boolean>` - Whether execution is in progress
  - `execute(adapter, workflow, input)` - Function to start execution
  - `stop()` - Function to stop execution
  - `nodeStatuses: Ref<Record<string, NodeStatus>>` - Current status of each node
  - `streamingContent: Ref<string>` - Current streaming response content
- WHEN a node starts executing THEN `nodeStatuses` SHALL update reactively
- WHEN execution completes THEN `isRunning` SHALL become `false`

### 2.3 Export Storage Interfaces

**User Story:** As an integrator, I want storage interfaces defined in the Vue package, so that I can implement database-backed persistence.

**Acceptance Criteria:**
- WHEN I import from `@or3/workflow-vue` THEN I SHALL have access to:
  - `StorageAdapter` interface
  - `WorkflowSummary` type for listing workflows
- WHEN I implement `StorageAdapter` THEN I SHALL provide:
  - `load(id): Promise<WorkflowData>`
  - `save(workflow): Promise<string>`
  - `delete(id): Promise<void>`
  - `list(): Promise<WorkflowSummary[]>`
- WHEN I want to use localStorage THEN I SHALL be able to import `LocalStorageAdapter` from `@or3/workflow-core`

### 2.4 Export Core UI Components

**User Story:** As a Vue developer, I want pre-built UI components, so that I can quickly build a workflow editor UI.

**Acceptance Criteria:**
- WHEN I import from `@or3/workflow-vue` THEN I SHALL have access to:
  - `<WorkflowCanvas />` - Main drag-and-drop canvas component
  - `<NodePalette />` - Sidebar with draggable node types
  - `<NodeInspector />` - Panel for editing selected node properties
  - `<ChatPanel />` - Chat interface for testing workflows
- WHEN I use `<WorkflowCanvas :editor="editor" />` THEN it SHALL render the workflow
- WHEN I use `<NodePalette />` THEN I SHALL be able to drag nodes onto the canvas

---

## 3. OpenRouter Client Injection

### 3.1 Accept Injected Client

**User Story:** As an integrator, I want to provide my own OpenRouter client instance, so that I can manage API key configuration and middleware.

**Acceptance Criteria:**
- WHEN I create `new OpenRouterExecutionAdapter(client)` THEN it SHALL use my provided `OpenRouter` instance
- WHEN the adapter makes LLM calls THEN it SHALL use `client.chat.completions.create()`
- WHEN I need to add custom headers or middleware THEN I can configure them on my client before injection
- IF I provide an invalid client THEN the constructor SHALL throw a descriptive error

### 3.2 Remove Direct Fetch Usage

**User Story:** As an integrator, I want the adapter to rely only on the OpenRouter SDK, so that I have consistent behavior and error handling.

**Acceptance Criteria:**
- WHEN the adapter needs to make API calls THEN it SHALL NOT use `fetch()` directly
- WHEN the adapter needs model information THEN it SHALL use OpenRouter SDK methods
- WHEN network errors occur THEN the SDK's error handling SHALL apply

---

## 4. Storage and Execution Interfaces

### 4.1 StorageAdapter Interface

**User Story:** As an integrator, I want to implement my own database-backed storage, so that workflows persist to my backend.

**Acceptance Criteria:**
- WHEN I implement `StorageAdapter` THEN the interface SHALL define:
  ```typescript
  interface StorageAdapter {
    load(id: string): Promise<WorkflowData>;
    save(workflow: WorkflowData): Promise<string>;
    delete(id: string): Promise<void>;
    list(): Promise<WorkflowSummary[]>;
    export?(workflow: WorkflowData): string;
    import?(json: string): WorkflowData;
  }
  ```
- WHEN I pass my adapter to the storage composable THEN it SHALL use my implementation
- WHEN storage operations fail THEN the adapter SHALL throw descriptive errors

### 4.2 Execution Event Subscription

**User Story:** As an integrator, I want to subscribe to execution events, so that I can log workflow runs and debug issues.

**Acceptance Criteria:**
- WHEN I provide `ExecutionCallbacks` THEN I SHALL receive events for:
  - `onNodeStart(nodeId)` - When a node begins executing
  - `onNodeFinish(nodeId, output)` - When a node completes successfully
  - `onNodeError(nodeId, error)` - When a node fails
  - `onToken(nodeId, token)` - For each streaming token
  - `onRouteSelected(nodeId, routeId)` - When a router selects a path
- WHEN execution completes THEN I SHALL receive a final `ExecutionResult` with:
  - `success: boolean`
  - `output: string`
  - `nodeOutputs: Record<string, string>`
  - `duration: number`
  - `error?: Error`

---

## 5. Example Application

### 5.1 Minimal Integration Example

**User Story:** As a new integrator, I want a working example app, so that I can understand how to wire up the SDK.

**Acceptance Criteria:**
- WHEN I run the example app THEN it SHALL demonstrate:
  - Creating an `OpenRouter` client instance
  - Creating a `WorkflowEditor` with the factory function
  - Using `LocalStorageAdapter` for persistence
  - Rendering `<WorkflowCanvas />` with the editor
  - Executing workflows with user input
- WHEN I examine the example code THEN it SHALL be clear and well-commented
- WHEN I copy the example pattern THEN I SHALL be able to integrate into my own Vue app

### 5.2 Custom Storage Example

**User Story:** As an integrator, I want an example of custom storage implementation, so that I can model my own database adapter.

**Acceptance Criteria:**
- WHEN I view the example THEN it SHALL show a mock database adapter implementation
- WHEN the example loads workflows THEN it SHALL use the custom adapter
- WHEN the example saves workflows THEN it SHALL use the custom adapter

---

## Non-Functional Requirements

### NFR-1: Bundle Size

- WHEN I import only types THEN tree-shaking SHALL exclude implementation code
- WHEN I import the full package THEN the bundle size SHALL be reasonable for production use

### NFR-2: TypeScript Support

- WHEN I use the SDK with TypeScript THEN all exports SHALL have proper type definitions
- WHEN I hover over exports in my IDE THEN I SHALL see JSDoc documentation

### NFR-3: Backward Compatibility

- WHEN the SDK is updated THEN semver SHALL be followed for breaking changes
- WHEN breaking changes occur THEN migration guides SHALL be provided
