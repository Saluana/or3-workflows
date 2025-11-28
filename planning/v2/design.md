# Embeddable Workflow Builder Kit — Design

## Architecture Overview

The architecture is split into two main packages to ensure separation of concerns and reusability:

1.  **`@or3/workflow-core`**: A framework-agnostic (though initially Vue-focused) headless library containing the editor state, command system, schema validation, and execution logic.
2.  **`@or3/workflow-vue`**: A set of Vue 3 components and composables that provide the UI for the editor, binding to the core instance.

### Package Dependencies

```
@or3/workflow-vue
  └── @or3/workflow-core
        ├── @openrouter/sdk
        └── zod (validation)
```

## Core API (`@or3/workflow-core`)

### `WorkflowEditor` Class

The central entry point, similar to TipTap's `Editor`.

```typescript
interface EditorOptions {
  element?: HTMLElement
  extensions?: Extension[]
  content?: WorkflowData
  onUpdate?: (props: { editor: WorkflowEditor }) => void
  onSelectionUpdate?: (props: { editor: WorkflowEditor }) => void
  execution?: ExecutionAdapter
  storage?: StorageAdapter
  // OpenRouter specific config
  openRouter?: {
    client?: OpenRouter // Pass an existing client instance
    apiKey?: string // Or pass a key to create one
    defaultModel?: string
  }
}

class WorkflowEditor {
  constructor(options: EditorOptions)
  
  // State
  public state: WorkflowState
  public storage: StorageAdapter
  public execution: ExecutionAdapter
  public openRouter?: OpenRouter // Exposed for direct usage if needed
  
  // Commands (Chainable)
  public get commands(): CommandManager
  public get chain(): () => ChainedCommands
  
  // Queries
  public getJSON(): WorkflowData
  public getNodes(): Node[]
  public getEdges(): Edge[]
  public getSelected(): { nodes: Node[], edges: Edge[] }
  public canUndo(): boolean
  public canRedo(): boolean
  
  // Lifecycle
  public destroy(): void
  
  // Events
  public on(event: EditorEvent, callback: Function): () => void
  public off(event: EditorEvent, callback: Function): void
  public emit(event: EditorEvent, ...args: any[]): void
}

type EditorEvent = 
  | 'update'
  | 'selectionUpdate'
  | 'nodeCreate'
  | 'nodeDelete'
  | 'nodeUpdate'
  | 'edgeCreate'
  | 'edgeDelete'
  | 'execute:start'
  | 'execute:nodeStart'
  | 'execute:nodeFinish'
  | 'execute:error'
  | 'execute:done'
```

### Command System

Commands are functions that mutate the editor state. They can be chained.

```typescript
interface Commands {
  // Node operations
  createNode(type: string, data?: any, position?: XYPosition): boolean
  deleteNode(id: string): boolean
  updateNodeData(id: string, data: Partial<NodeData>): boolean
  duplicateNode(id: string): boolean
  setNodePosition(id: string, position: XYPosition): boolean
  
  // Edge operations
  createEdge(source: string, target: string, sourceHandle?: string, targetHandle?: string): boolean
  deleteEdge(id: string): boolean
  updateEdgeData(id: string, data: Partial<EdgeData>): boolean
  
  // Selection
  selectNode(id: string, additive?: boolean): boolean
  selectEdge(id: string, additive?: boolean): boolean
  selectAll(): boolean
  deselectAll(): boolean
  
  // History
  undo(): boolean
  redo(): boolean
  
  // Viewport
  zoomTo(level: number): boolean
  zoomIn(): boolean
  zoomOut(): boolean
  fitView(options?: FitViewOptions): boolean
  setViewport(viewport: Viewport): boolean
  
  // Execution
  execute(input: string): Promise<void>
  stopExecution(): void
}
```

### Extension System

Extensions define node types, custom behavior, and keyboard shortcuts.

```typescript
interface Extension {
  name: string
  type: 'node' | 'behavior'
  
  // Keyboard shortcuts (optional)
  addKeyboardShortcuts?: () => Record<string, KeyboardShortcutHandler>
  
  // Commands added by this extension
  addCommands?: () => Record<string, Command>
  
  // Storage for extension-specific data
  storage?: Record<string, any>
  
  // Lifecycle hooks
  onCreate?: () => void
  onDestroy?: () => void
}

interface NodeExtension extends Extension {
  type: 'node'
  
  // Schema definition
  inputs?: PortDefinition[]
  outputs?: PortDefinition[]
  
  // Default data for new nodes of this type
  defaultData?: Record<string, any>
  
  // Execution logic
  execute?: (context: ExecutionContext) => Promise<ExecutionResult>
  
  // Tools provided by this node (OpenRouter/OpenAI format)
  tools?: ToolDefinition[]
  
  // Vue Component for rendering (registered in @or3/workflow-vue)
  component?: Component
  
  // Validation rules for this node type
  validate?: (node: WorkflowNode, edges: WorkflowEdge[]) => ValidationError[]
}

interface PortDefinition {
  id: string
  label?: string
  type: 'input' | 'output'
  dataType?: 'any' | 'string' | 'object' | 'array'  // For type-safe connections
  required?: boolean
  multiple?: boolean  // Can accept/emit multiple connections
}

interface KeyboardShortcutHandler {
  key: string
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[]
  handler: (editor: WorkflowEditor) => boolean
}

interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, any>  // JSON Schema
  }
  handler?: (args: any) => Promise<string> | string
}
```

## Vue Components (`@or3/workflow-vue`)

### Components

-   **`<WorkflowCanvas>`**: The main wrapper. Accepts an `editor` instance.
    -   Wraps `VueFlow` internally.
    -   Handles drag-and-drop, selection, and zoom events.
    -   Syncs Vue Flow state with `WorkflowEditor` state.
-   **`<NodeWrapper>`**: Base wrapper for all node types. Handles selection, status indicators, ports.
-   **`<NodePalette>`**: Renders a list of available node types from the editor's extensions.
    -   Supports drag-and-drop to canvas.
    -   Groups nodes by category.
-   **`<NodeInspector>`**: A property editor that binds to the currently selected node.
    -   Tab-based UI for different config sections (prompt, model, tools, etc.).
    -   Supports different node types with type-specific panels.
-   **`<ChatPanel>`**: A chat interface for executing workflows and viewing results.
    -   Shows streaming responses.
    -   Displays process flow with node status indicators.
    -   Supports multi-turn conversations.
-   **`<EdgeLabelEditor>`**: Inline editor for edge labels (used for router conditions).
-   **`<MiniMap>`**: A wrapper around Vue Flow's minimap.
-   **`<Controls>`**: Zoom/Fit/Undo/Redo buttons.
-   **`<ValidationOverlay>`**: Displays validation errors/warnings on nodes and edges.

### Standard Node Components

-   **`<StartNode>`**: Entry point node (minimal, just a label).
-   **`<AgentNode>`**: LLM invocation node with model/prompt config.
-   **`<RouterNode>`**: Conditional branching node with multiple output handles.
-   **`<ParallelNode>`**: Concurrent execution node with branch configuration.
-   **`<ToolNode>`**: Tool/action execution node.

### Composables

-   **`useEditor(options)`**: Creates and manages a `WorkflowEditor` instance. Returns reactive refs.
-   **`useNodeState(nodeId)`**: Reactive access to a specific node's state and data.
-   **`useExecutionState()`**: Reactive access to execution status, streaming content, node statuses.

## Data Model (Schema)

We will define a strict JSON schema for portability using Zod.

```typescript
import { z } from 'zod'

// Schema version for migrations
const SCHEMA_VERSION = '2.0.0'

interface WorkflowData {
  meta: {
    version: string
    name: string
    description?: string
    createdAt?: string
    updatedAt?: string
  }
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: NodeData
  selected?: boolean
}

// Union type for node-specific data
type NodeData = 
  | StartNodeData
  | AgentNodeData
  | RouterNodeData
  | ParallelNodeData
  | ToolNodeData

interface BaseNodeData {
  label: string
  status?: NodeStatus
}

interface StartNodeData extends BaseNodeData {
  // Minimal - just entry point
}

interface AgentNodeData extends BaseNodeData {
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
  tools?: string[]  // Tool IDs enabled for this agent
}

interface RouterNodeData extends BaseNodeData {
  model?: string  // Model for classification (optional, uses default)
  prompt?: string  // Custom routing instructions
  routes: RouteDefinition[]
}

interface RouteDefinition {
  id: string
  label: string
  condition?: RouteCondition  // Optional programmatic condition
}

interface RouteCondition {
  type: 'contains' | 'equals' | 'regex' | 'custom'
  field?: string  // Which field to check (default: previous output)
  value?: string  // Value to match
  expression?: string  // For 'custom' type - JS expression
}

interface ParallelNodeData extends BaseNodeData {
  model?: string  // Model for merge step
  prompt?: string  // Merge/synthesis prompt
  branches: BranchDefinition[]
}

interface BranchDefinition {
  id: string
  label: string
  model?: string  // Override model for this branch
  prompt?: string  // Override prompt for connected agent
}

interface ToolNodeData extends BaseNodeData {
  toolId: string  // Reference to registered tool
  config?: Record<string, any>  // Tool-specific configuration
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string  // Display label (used for router branches)
  data?: EdgeData
}

interface EdgeData {
  condition?: RouteCondition  // For conditional edges
}

type NodeStatus = 'idle' | 'active' | 'completed' | 'error'
```

## Adapters

### Execution Adapter

Allows swapping the execution engine (e.g., Local vs. Remote).

```typescript
interface ExecutionAdapter {
  execute(workflow: WorkflowData, input: string, callbacks: ExecutionCallbacks): Promise<ExecutionResult>
  stop(): void
  isRunning(): boolean
}

interface ExecutionCallbacks {
  onNodeStart(nodeId: string): void
  onNodeFinish(nodeId: string, output: any): void
  onNodeError(nodeId: string, error: Error): void
  onToken(nodeId: string, token: string): void  // For streaming
  onRouteSelected(nodeId: string, routeId: string): void  // For router nodes
}

interface ExecutionResult {
  success: boolean
  output: string
  nodeOutputs: Record<string, string>  // Output per node
  error?: Error
  duration: number
  usage?: TokenUsage
}

interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// Concrete implementation using OpenRouter SDK
class OpenRouterExecutionAdapter implements ExecutionAdapter {
  constructor(client: OpenRouter, options?: ExecutionOptions)
  
  async execute(workflow: WorkflowData, input: string, callbacks: ExecutionCallbacks): Promise<ExecutionResult>
  stop(): void
  isRunning(): boolean
}

interface ExecutionOptions {
  tools?: ToolDefinition[]  // Global tools available to all agents
  defaultModel?: string  // Fallback model
  maxRetries?: number  // Retry count for failed API calls
  retryDelayMs?: number  // Base delay between retries
  maxIterations?: number  // Safety limit for graph traversal
  onToolCall?: (name: string, args: any) => Promise<string>  // Global tool handler
}

// Execution context passed to node executors
interface ExecutionContext {
  node: WorkflowNode
  input: string  // Current input (from user or previous node)
  originalInput: string  // Original user input
  history: ChatMessage[]  // Conversation history
  outputs: Record<string, string>  // Outputs from executed nodes
  nodeChain: string[]  // Ordered list of executed node IDs
  editor: WorkflowEditor
  client: OpenRouter
  signal: AbortSignal  // For cancellation
}
```

### Storage Adapter

Allows swapping the persistence layer.

```typescript
interface StorageAdapter {
  load(id: string): Promise<WorkflowData>
  save(workflow: WorkflowData): Promise<string>  // Returns ID
  delete(id: string): Promise<void>
  list(): Promise<WorkflowSummary[]>
  export(workflow: WorkflowData): string  // JSON string
  import(json: string): WorkflowData  // Parse and validate
}

interface WorkflowSummary {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  nodeCount: number
}

// Concrete implementations
class LocalStorageAdapter implements StorageAdapter { /* ... */ }
class IndexedDBAdapter implements StorageAdapter { /* ... */ }
class RestStorageAdapter implements StorageAdapter {
  constructor(baseUrl: string, options?: { headers?: Record<string, string> })
}
```

## History System (Undo/Redo)

The history system uses a snapshot-based approach for simplicity and reliability.

```typescript
interface HistoryManager {
  // State
  canUndo: boolean
  canRedo: boolean
  historyLength: number
  currentIndex: number
  
  // Operations
  push(state: HistoryState): void
  undo(): HistoryState | null
  redo(): HistoryState | null
  clear(): void
}

interface HistoryState {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  timestamp: number
}

interface HistoryOptions {
  maxHistory?: number  // Default: 50
  debounceMs?: number  // Debounce rapid changes, default: 300
}
```

## Validation System

Validation runs on the workflow graph to detect issues before execution.

```typescript
interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

interface ValidationError {
  type: 'error'
  code: ValidationErrorCode
  message: string
  nodeId?: string
  edgeId?: string
}

interface ValidationWarning {
  type: 'warning'
  code: ValidationWarningCode
  message: string
  nodeId?: string
  edgeId?: string
}

type ValidationErrorCode =
  | 'NO_START_NODE'
  | 'MULTIPLE_START_NODES'
  | 'DISCONNECTED_NODE'
  | 'CYCLE_DETECTED'
  | 'MISSING_REQUIRED_PORT'
  | 'INVALID_CONNECTION'
  | 'MISSING_MODEL'
  | 'MISSING_PROMPT'

type ValidationWarningCode =
  | 'EMPTY_PROMPT'
  | 'UNREACHABLE_NODE'
  | 'DEAD_END_NODE'  // Node with no outputs (except terminal nodes)
  | 'MISSING_EDGE_LABEL'  // Router edge without label
```

## Graph Execution Algorithm

The executor uses a modified BFS traversal with dependency tracking.

```typescript
// Pseudocode for execution flow
async function executeWorkflow(workflow, input) {
  const graph = buildGraph(workflow.nodes, workflow.edges)
  const startNode = findStartNode(workflow.nodes)
  
  const queue = [startNode.id]
  const executed = new Set()
  const context = createContext(input)
  
  while (queue.length > 0) {
    const nodeId = queue.shift()
    
    // Skip if already executed
    if (executed.has(nodeId)) continue
    
    // Wait for all parents to complete (dependency check)
    const parents = graph.parents[nodeId]
    if (!parents.every(p => executed.has(p))) {
      queue.push(nodeId)  // Re-queue
      continue
    }
    
    // Execute node based on type
    const result = await executeNode(nodeId, context)
    executed.add(nodeId)
    
    // Queue next nodes
    // - For router: only queue selected route
    // - For parallel: queue all branches (execute concurrently)
    // - For others: queue all children
    queue.push(...result.nextNodes)
  }
  
  return context.outputs
}
```
