# Embeddable Workflow Builder Kit — Tasks

> **Note**: This task list includes both v2 core implementation AND migration of the existing demo.
> Tasks are ordered by dependency. Complete each phase before moving to the next.

---

## Phase 1: Project Setup & Core Architecture

### 1.1 Initialize Package Structure
- [x] Create `packages/` directory structure:
  - [x] `packages/workflow-core/` - Headless core library
  - [x] `packages/workflow-vue/` - Vue 3 components
- [x] Configure monorepo tooling (workspace in `package.json` or pnpm workspaces)
- [x] Configure Vite/Rollup for library mode (ESM/CJS builds)
- [x] Set up TypeScript configuration for both packages with proper paths
- [x] Install core dependencies:
  - [x] `@openrouter/sdk` in workflow-core
  - [x] `zod` in workflow-core for schema validation
  - [x] `@vue-flow/core`, `@vue-flow/background`, `@vue-flow/controls` in workflow-vue

### 1.2 Define Core Types & Schema
- [x] Create `WorkflowData`, `WorkflowNode`, `WorkflowEdge` interfaces
- [x] Define node-specific data interfaces:
  - [x] `StartNodeData`
  - [x] `AgentNodeData` (with multimodal flags: `acceptsImages`, `acceptsAudio`, etc.)
  - [x] `RouterNodeData` (with `RouteDefinition`, `RouteCondition`)
  - [x] `ParallelNodeData` (with `BranchDefinition`)
  - [x] `ToolNodeData`
- [x] Define `PortDefinition` interface
- [x] Define `Extension` and `NodeExtension` interfaces
- [x] **Define Multimodal Types**:
  - [x] `InputModality` type (`'text' | 'image' | 'file' | 'audio' | 'video'`)
  - [x] `OutputModality` type (`'text' | 'image' | 'embeddings'`)
  - [x] `Attachment` interface (id, type, name, mimeType, url/content)
  - [x] `MessageContentPart` interface for multimodal messages
  - [x] `ModelCapabilities` interface (inputModalities, outputModalities, etc.)
  - [x] `ExecutionInput` interface (text + attachments)
- [x] Create Zod schemas for runtime validation
- [x] Add schema version constant (`SCHEMA_VERSION = '2.0.0'`)

### 1.3 Implement `WorkflowEditor` Class
- [x] Create the main class shell with constructor accepting `EditorOptions`
- [x] Implement internal state management:
  - [x] `nodes: WorkflowNode[]`
  - [x] `edges: WorkflowEdge[]`
  - [x] `selection: { nodes: string[], edges: string[] }`
- [x] Implement Event Emitter system:
  - [x] `on(event, callback)` - Subscribe to events
  - [x] `off(event, callback)` - Unsubscribe
  - [x] `emit(event, ...args)` - Emit events
  - [x] Define all `EditorEvent` types
- [x] Implement Extension registry:
  - [x] `registerExtension(extension)`
  - [x] `getExtension(name)`
  - [x] Call lifecycle hooks (`onCreate`, `onDestroy`)
- [x] Implement query methods:
  - [x] `getJSON()`, `getNodes()`, `getEdges()`, `getSelected()`
  - [x] `canUndo()`, `canRedo()`
- [x] Implement `destroy()` cleanup

### 1.4 Implement History System
- [x] Create `HistoryManager` class
- [x] Implement snapshot-based undo/redo:
  - [x] `push(state)` - Add state to history
  - [x] `undo()` - Return previous state
  - [x] `redo()` - Return next state
  - [x] `clear()` - Reset history
- [x] Add configurable `maxHistory` (default: 50)
- [x] Integrate with `WorkflowEditor`

### 1.5 Implement Command System
- [x] Create `CommandManager` class
- [x] Implement core node commands:
  - [x] `createNode(type, data?, position?)`
  - [x] `deleteNode(id)`
  - [x] `updateNodeData(id, data)`
  - [x] `duplicateNode(id)`
  - [x] `setNodePosition(id, position)`
- [x] Implement edge commands:
  - [x] `createEdge(source, target, sourceHandle?, targetHandle?)`
  - [x] `deleteEdge(id)`
  - [x] `updateEdgeData(id, data)`
- [x] Implement selection commands:
  - [x] `selectNode(id, additive?)`
  - [x] `selectEdge(id, additive?)`
  - [x] `selectAll()`, `deselectAll()`
- [x] Implement history commands:
  - [x] `undo()`, `redo()`
- [x] Implement viewport commands:
  - [x] `zoomTo(level)`, `zoomIn()`, `zoomOut()`
  - [x] `fitView(options?)`, `setViewport(viewport)`
- [x] Implement chainable API (`editor.chain()...run()`)
- [x] Ensure all mutating commands push to history

### 1.6 Implement Validation System
- [x] Create `validateWorkflow(nodes, edges)` function
- [x] Implement validation rules:
  - [x] `NO_START_NODE` - Must have exactly one start node
  - [x] `MULTIPLE_START_NODES` - Only one start allowed
  - [x] `DISCONNECTED_NODE` - All nodes must be reachable from start
  - [x] `CYCLE_DETECTED` - DAG validation (no cycles)
  - [x] `MISSING_MODEL` - Agent nodes need a model
- [x] Implement warning rules:
  - [x] `EMPTY_PROMPT` - Agent without prompt
  - [x] `DEAD_END_NODE` - Node with no outputs
  - [x] `MISSING_EDGE_LABEL` - Router edge without label
- [x] Return `ValidationResult` with errors and warnings

---

## Phase 2: Vue Integration (`@or3/workflow-vue`)

### 2.1 Core Composables
- [ ] Create `useEditor(options)` composable:
  - [ ] Instantiate `WorkflowEditor`
  - [ ] Return reactive refs for state
  - [ ] Handle cleanup on unmount
- [ ] Create `useNodeState(nodeId)` composable:
  - [ ] Reactive access to node data
  - [ ] Update methods
- [ ] Create `useExecutionState()` composable:
  - [ ] `isRunning`, `streamingContent`, `nodeStatuses`
  - [ ] `currentNodeId`, `error`

### 2.2 WorkflowCanvas Component
- [ ] Create `<WorkflowCanvas>` component wrapping Vue Flow
- [ ] Accept `editor` prop (WorkflowEditor instance)
- [ ] Sync Vue Flow state with editor state:
  - [ ] `nodesChange` → editor commands
  - [ ] `edgesChange` → editor commands
  - [ ] `connect` → `createEdge` command
- [ ] Handle drag-and-drop from palette
- [ ] Handle keyboard shortcuts (delegate to editor)
- [ ] Emit events: `nodeClick`, `edgeClick`, `paneClick`

### 2.3 Node Components
- [ ] Create `<NodeWrapper>` base component:
  - [ ] Status indicator (idle/active/completed/error)
  - [ ] Selection styling
  - [ ] Delete button
  - [ ] Slot for node-specific content
- [ ] Create `<StartNode>` component
- [ ] Create `<AgentNode>` component:
  - [ ] Display label, model badge
  - [ ] Input/output handles
- [ ] Create `<RouterNode>` component:
  - [ ] Dynamic output handles based on routes
  - [ ] Route labels on handles
- [ ] Create `<ParallelNode>` component:
  - [ ] Dynamic output handles based on branches
  - [ ] Branch labels
- [ ] Create `<ToolNode>` component (placeholder for future)

### 2.4 UI Components
- [ ] Create `<NodePalette>` component:
  - [ ] List available node types from extensions
  - [ ] Drag-and-drop support
  - [ ] Group by category
- [ ] Create `<NodeInspector>` component:
  - [ ] Tab-based UI (Prompt, Model, Tools, Routes/Branches)
  - [ ] Type-specific panels
  - [ ] Debounced save on input
- [ ] Create `<ChatPanel>` component:
  - [ ] Message list with user/assistant styling
  - [ ] Streaming content display
  - [ ] Process flow indicator
  - [ ] Input with send button
  - [ ] **Multimodal Attachment Support**:
    - [ ] File picker button (images, PDFs, audio, etc.)
    - [ ] Drag-and-drop file upload
    - [ ] Attachment preview chips (thumbnail for images, icon for files)
    - [ ] Remove attachment button
    - [ ] Show supported modalities based on workflow's first agent model
    - [ ] Disable/warn for unsupported file types
- [ ] Create `<EdgeLabelEditor>` component:
  - [ ] Inline popover for editing edge labels
- [ ] Create `<Controls>` component:
  - [ ] Zoom in/out, fit view buttons
  - [ ] Undo/redo buttons
- [ ] Create `<MiniMap>` wrapper
- [ ] Create `<ValidationOverlay>` component:
  - [ ] Display errors/warnings on nodes
  - [ ] Tooltip with details

---

## Phase 3: Adapters & Execution

### 3.1 Execution Adapter Interface
- [ ] Define `ExecutionAdapter` interface
- [ ] Define `ExecutionCallbacks` interface
- [ ] Define `ExecutionResult` interface
- [ ] Define `ExecutionContext` interface
- [ ] Define `ExecutionOptions` interface

### 3.2 OpenRouterExecutionAdapter
- [ ] Create `OpenRouterExecutionAdapter` class
- [ ] Implement graph building (`buildGraph`):
  - [ ] Create node map
  - [ ] Build parent/child adjacency lists
- [ ] Implement BFS execution loop:
  - [ ] Dependency checking (wait for parents)
  - [ ] Cycle/iteration safety limit
- [ ] Implement node executors:
  - [ ] `executeStartNode` - Pass through input (including attachments)
  - [ ] `executeAgentNode` - LLM call with streaming and multimodal support
  - [ ] `executeRouterNode` - Classification and route selection
  - [ ] `executeParallelNode` - Concurrent branch execution with merge
- [ ] **Implement Multimodal Support**:
  - [ ] `buildMessageContent(text, attachments)` - Convert attachments to SDK format
  - [ ] Handle `image_url` type (URL or base64 data URI)
  - [ ] Handle `file` type for PDFs and documents
  - [ ] Handle `audio` type for audio inputs
  - [ ] Validate attachments against model's `inputModalities`
  - [ ] Skip unsupported attachments with warning callback
- [ ] **Implement Model Capability Queries**:
  - [ ] `getModelCapabilities(modelId)` - Fetch model info from OpenRouter
  - [ ] `supportsModality(modelId, modality)` - Check if model accepts modality
  - [ ] Cache model capabilities to avoid repeated API calls
- [ ] Implement streaming support:
  - [ ] Call `onToken` callback for each chunk
  - [ ] Accumulate output
- [ ] Implement retry logic:
  - [ ] Exponential backoff
  - [ ] Skip retry for auth errors
- [ ] Implement cancellation:
  - [ ] `AbortController` integration
  - [ ] `stop()` method
- [ ] Implement `isRunning()` method

### 3.3 Storage Adapters
- [ ] Define `StorageAdapter` interface
- [ ] Implement `LocalStorageAdapter`:
  - [ ] `save(workflow)` - Store in localStorage
  - [ ] `load(id)` - Retrieve and validate
  - [ ] `delete(id)` - Remove
  - [ ] `list()` - Return summaries
  - [ ] `export(workflow)` - JSON string
  - [ ] `import(json)` - Parse and validate
- [ ] (Optional) Implement `IndexedDBAdapter` for larger workflows

---

## Phase 4: Standard Extensions

### 4.1 StartNodeExtension
- [ ] Define extension with:
  - [ ] `name: 'start'`
  - [ ] `outputs: [{ id: 'output', type: 'output' }]`
  - [ ] `defaultData: { label: 'Start' }`
  - [ ] `component: StartNode`
- [ ] Implement validation (only one allowed)

### 4.2 AgentNodeExtension
- [ ] Define extension with:
  - [ ] `name: 'agent'`
  - [ ] `inputs/outputs` port definitions
  - [ ] `defaultData: { label: 'Agent', model: 'openai/gpt-4o-mini', prompt: '' }`
  - [ ] `component: AgentNode`
- [ ] Implement `execute` function
- [ ] Implement validation (require model)

### 4.3 RouterNodeExtension
- [ ] Define extension with:
  - [ ] `name: 'router'`
  - [ ] Dynamic outputs based on `routes` data
  - [ ] `defaultData: { label: 'Router', routes: [...] }`
  - [ ] `component: RouterNode`
- [ ] Implement `execute` function (LLM classification)
- [ ] Implement validation (require at least one route)

### 4.4 ParallelNodeExtension
- [ ] Define extension with:
  - [ ] `name: 'parallel'`
  - [ ] Dynamic outputs based on `branches` data
  - [ ] `defaultData: { label: 'Parallel', branches: [...] }`
  - [ ] `component: ParallelNode`
- [ ] Implement `execute` function (concurrent execution + merge)

### 4.5 ToolNodeExtension (Placeholder)
- [ ] Define basic extension structure
- [ ] Defer full implementation to future iteration

---

## Phase 5: Demo Migration

> **Goal**: Migrate the existing `demo/` app to use v2 packages while maintaining identical functionality and appearance.

### 5.1 Prepare Migration
- [ ] Document current demo features (see `migration.md`)
- [ ] Create `demo-v2/` directory (keep `demo/` as reference)
- [ ] Set up new Vite + Vue project
- [ ] Install `@or3/workflow-core` and `@or3/workflow-vue` as local dependencies

### 5.2 Migrate Core Editor
- [ ] Replace `WorkflowEditor.vue` with `<WorkflowCanvas>` + `useEditor`
- [ ] Migrate node types:
  - [ ] `AgentNode.vue` → Use `AgentNodeExtension`
  - [ ] `StartNode.vue` → Use `StartNodeExtension`
  - [ ] `ConditionNode.vue` → Use `RouterNodeExtension` (rename!)
  - [ ] `ParallelNode.vue` → Use `ParallelNodeExtension`
- [ ] Migrate `useUndoRedo.ts` → Use built-in history system
- [ ] Verify drag-and-drop from palette works

### 5.3 Migrate UI Components
- [ ] Migrate `NodePalette.vue` → Use `<NodePalette>`
- [ ] Migrate `NodeConfigPanel.vue` → Use `<NodeInspector>`
- [ ] Migrate `ChatPanel.vue` → Use `<ChatPanel>`
- [ ] Migrate `EdgeLabelEditor.vue` → Use `<EdgeLabelEditor>`
- [ ] Preserve all styling (copy CSS variables)

### 5.4 Migrate Execution
- [ ] Replace `useWorkflowExecution.ts` with `OpenRouterExecutionAdapter`
- [ ] Verify streaming works
- [ ] Verify router classification works
- [ ] Verify parallel execution works
- [ ] Verify multi-turn conversations work
- [ ] Verify cancellation works

### 5.5 Migrate Storage
- [ ] Replace `useWorkflowStorage.ts` with `LocalStorageAdapter`
- [ ] Migrate autosave functionality
- [ ] Verify save/load/export/import work

### 5.6 Migrate Validation
- [ ] Replace `useWorkflowValidation.ts` with core validation
- [ ] Verify validation modal shows correct errors/warnings

### 5.7 Final Verification
- [ ] Visual comparison with original demo
- [ ] Test all keyboard shortcuts
- [ ] Test mobile responsiveness
- [ ] Test error handling
- [ ] Remove old `demo/` directory (or archive)

---

## Phase 6: Testing & Documentation

### 6.1 Unit Tests
- [ ] Test `WorkflowEditor` class
- [ ] Test `CommandManager`
- [ ] Test `HistoryManager`
- [ ] Test validation functions
- [ ] Test Zod schemas

### 6.2 Integration Tests
- [ ] Test `OpenRouterExecutionAdapter` (mock API)
- [ ] Test `LocalStorageAdapter`
- [ ] Test Vue components with Vue Test Utils

### 6.3 Documentation
- [ ] Write API reference for `WorkflowEditor`
- [ ] Write API reference for Vue components
- [ ] Create "Getting Started" guide
- [ ] Document extension creation
- [ ] Document theming/customization
- [ ] Add inline JSDoc comments

---

## Completion Checklist

Before marking v2 complete:

- [ ] All Phase 1-5 tasks completed
- [ ] Demo-v2 is visually identical to original demo
- [ ] Demo-v2 has all original functionality
- [ ] No TypeScript errors
- [ ] No console errors/warnings
- [ ] Basic test coverage
- [ ] README updated with v2 usage
