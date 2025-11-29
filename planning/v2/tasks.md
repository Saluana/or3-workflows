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
- [x] Create `useEditor(options)` composable:
  - [x] Instantiate `WorkflowEditor`
  - [x] Return reactive refs for state
  - [x] Handle cleanup on unmount
- [x] Create `useNodeState(nodeId)` composable:
  - [x] Reactive access to node data
  - [x] Update methods
- [x] Create `useExecutionState()` composable:
  - [x] `isRunning`, `streamingContent`, `nodeStatuses`
  - [x] `currentNodeId`, `error`

### 2.2 WorkflowCanvas Component
- [x] Create `<WorkflowCanvas>` component wrapping Vue Flow
- [x] Accept `editor` prop (WorkflowEditor instance)
- [x] Sync Vue Flow state with editor state:
  - [x] `nodesChange` → editor commands
  - [x] `edgesChange` → editor commands
  - [x] `connect` → `createEdge` command
- [x] Handle drag-and-drop from palette
- [x] Handle keyboard shortcuts (delegate to editor)
- [x] Emit events: `nodeClick`, `edgeClick`, `paneClick`

### 2.3 Node Components
- [x] Create `<NodeWrapper>` base component:
  - [x] Status indicator (idle/active/completed/error)
  - [x] Selection styling
  - [x] Delete button
  - [x] Slot for node-specific content
- [x] Create `<StartNode>` component
- [x] Create `<AgentNode>` component:
  - [x] Display label, model badge
  - [x] Input/output handles
- [x] Create `<RouterNode>` component:
  - [x] Dynamic output handles based on routes
  - [x] Route labels on handles
- [x] Create `<ParallelNode>` component:
  - [x] Dynamic output handles based on branches
  - [x] Branch labels
- [x] Create `<ToolNode>` component (placeholder for future)

### 2.4 UI Components
- [x] Create `<NodePalette>` component:
  - [x] List available node types from extensions
  - [x] Drag-and-drop support
  - [x] Group by category
- [x] Create `<NodeInspector>` component:
  - [x] Tab-based UI (Prompt, Model, Tools, Routes/Branches)
  - [x] Type-specific panels
  - [x] Debounced save on input
- [x] Create `<ChatPanel>` component:
  - [x] Message list with user/assistant styling
  - [x] Streaming content display
  - [x] Process flow indicator
  - [x] Input with send button
  - [x] **Multimodal Attachment Support**:
    - [x] File picker button (images, PDFs, audio, etc.)
    - [x] Drag-and-drop file upload
    - [x] Attachment preview chips (thumbnail for images, icon for files)
    - [x] Remove attachment button
    - [x] Show supported modalities based on workflow's first agent model
    - [x] Disable/warn for unsupported file types
- [x] Create `<EdgeLabelEditor>` component:
  - [x] Inline popover for editing edge labels
- [x] Create `<Controls>` component:
  - [x] Zoom in/out, fit view buttons
  - [x] Undo/redo buttons
- [x] Create `<MiniMap>` wrapper
- [x] Create `<ValidationOverlay>` component:
  - [x] Display errors/warnings on nodes
  - [x] Tooltip with details

---

## Phase 3: Adapters & Execution

### 3.1 Execution Adapter Interface
- [x] Define `ExecutionAdapter` interface
- [x] Define `ExecutionCallbacks` interface
- [x] Define `ExecutionResult` interface
- [x] Define `ExecutionContext` interface
- [x] Define `ExecutionOptions` interface

### 3.2 OpenRouterExecutionAdapter
- [x] Create `OpenRouterExecutionAdapter` class
- [x] Implement graph building (`buildGraph`):
  - [x] Create node map
  - [x] Build parent/child adjacency lists
- [x] Implement BFS execution loop:
  - [x] Dependency checking (wait for parents)
  - [x] Cycle/iteration safety limit
- [x] Implement node executors:
  - [x] `executeStartNode` - Pass through input (including attachments)
  - [x] `executeAgentNode` - LLM call with streaming and multimodal support
  - [x] `executeRouterNode` - Classification and route selection
  - [x] `executeParallelNode` - Concurrent branch execution with merge
- [x] **Implement Multimodal Support**:
  - [x] `buildMessageContent(text, attachments)` - Convert attachments to SDK format
  - [x] Handle `image_url` type (URL or base64 data URI)
  - [x] Handle `file` type for PDFs and documents
  - [x] Handle `audio` type for audio inputs
  - [x] Validate attachments against model's `inputModalities`
  - [x] Skip unsupported attachments with warning callback
- [x] **Implement Model Capability Queries**:
  - [x] `getModelCapabilities(modelId)` - Fetch model info from OpenRouter
  - [x] `supportsModality(modelId, modality)` - Check if model accepts modality
  - [x] Cache model capabilities to avoid repeated API calls
- [x] Implement streaming support:
  - [x] Call `onToken` callback for each chunk
  - [x] Accumulate output
- [x] Implement retry logic:
  - [x] Exponential backoff
  - [x] Skip retry for auth errors
- [x] Implement cancellation:
  - [x] `AbortController` integration
  - [x] `stop()` method
- [x] Implement `isRunning()` method

### 3.3 Storage Adapters
- [x] Define `StorageAdapter` interface
- [x] Implement `LocalStorageAdapter`:
  - [x] `save(workflow)` - Store in localStorage
  - [x] `load(id)` - Retrieve and validate
  - [x] `delete(id)` - Remove
  - [x] `list()` - Return summaries
  - [x] `export(workflow)` - JSON string
  - [x] `import(json)` - Parse and validate
- [x] (Optional) Implement `IndexedDBAdapter` for larger workflows

---

## Phase 4: Standard Extensions

### 4.1 StartNodeExtension
- [x] Define extension with:
  - [x] `name: 'start'`
  - [x] `outputs: [{ id: 'output', type: 'output' }]`
  - [x] `defaultData: { label: 'Start' }`
  - [x] `component: StartNode`
- [x] Implement validation (only one allowed)

### 4.2 AgentNodeExtension
- [x] Define extension with:
  - [x] `name: 'agent'`
  - [x] `inputs/outputs` port definitions
  - [x] `defaultData: { label: 'Agent', model: 'openai/gpt-4o-mini', prompt: '' }`
  - [x] `component: AgentNode`
- [x] Implement `execute` function
- [x] Implement validation (require model)

### 4.3 RouterNodeExtension
- [x] Define extension with:
  - [x] `name: 'router'`
  - [x] Dynamic outputs based on `routes` data
  - [x] `defaultData: { label: 'Router', routes: [...] }`
  - [x] `component: RouterNode`
- [x] Implement `execute` function (LLM classification)
- [x] Implement validation (require at least one route)

### 4.4 ParallelNodeExtension
- [x] Define extension with:
  - [x] `name: 'parallel'`
  - [x] Dynamic outputs based on `branches` data
  - [x] `defaultData: { label: 'Parallel', branches: [...] }`
  - [x] `component: ParallelNode`
- [x] Implement `execute` function (concurrent execution + merge)

### 4.5 ToolNodeExtension (Placeholder)
- [x] Define basic extension structure
- [x] Defer full implementation to future iteration

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
