import { z } from 'zod';

export const SCHEMA_VERSION = '2.0.0';

// ============================================================================
// Multimodal Types
// ============================================================================

export type InputModality = 'text' | 'image' | 'file' | 'audio' | 'video';
export type OutputModality = 'text' | 'image' | 'embeddings';

export interface Attachment {
  id: string;
  type: InputModality;
  name: string;
  mimeType: string;
  url?: string;
  content?: string; // Base64
  size?: number;
}

export interface MessageContentPart {
  type: 'text' | 'image_url' | 'file' | 'audio';
  text?: string;
  imageUrl?: { url: string; detail?: 'auto' | 'low' | 'high' };
  file?: { url: string; mimeType: string };
  audio?: { url: string; format?: string };
}

export type MessageContent = string | MessageContentPart[];

export interface ModelCapabilities {
  id: string;
  name: string;
  inputModalities: InputModality[];
  outputModalities: OutputModality[];
  contextLength: number;
  supportedParameters: string[];
}

export interface ExecutionInput {
  text: string;
  attachments?: Attachment[];
}

// ============================================================================
// Workflow Data Types
// ============================================================================

export interface WorkflowData {
  meta: {
    version: string;
    name: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
  selected?: boolean;
}

export type NodeData =
  | StartNodeData
  | AgentNodeData
  | RouterNodeData
  | ParallelNodeData
  | ToolNodeData;

export interface BaseNodeData {
  label: string;
  status?: NodeStatus;
}

export type NodeStatus = 'idle' | 'active' | 'completed' | 'error';

export interface StartNodeData extends BaseNodeData {
  // Minimal
}

export interface AgentNodeData extends BaseNodeData {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  acceptsImages?: boolean;
  acceptsAudio?: boolean;
  acceptsVideo?: boolean;
  acceptsFiles?: boolean;
}

export interface RouterNodeData extends BaseNodeData {
  model?: string;
  prompt?: string;
  routes: RouteDefinition[];
}

export interface RouteDefinition {
  id: string;
  label: string;
  condition?: RouteCondition;
}

export interface RouteCondition {
  type: 'contains' | 'equals' | 'regex' | 'custom';
  field?: string;
  value?: string;
  expression?: string;
}

export interface ParallelNodeData extends BaseNodeData {
  model?: string;
  prompt?: string;
  branches: BranchDefinition[];
}

export interface BranchDefinition {
  id: string;
  label: string;
  model?: string;
  prompt?: string;
}

export interface ToolNodeData extends BaseNodeData {
  toolId: string;
  config?: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  label?: string;
  data?: Record<string, any>;
  selected?: boolean;
}

export interface EdgeData {
  condition?: RouteCondition;
}

export interface PortDefinition {
  id: string;
  label?: string;
  type: 'input' | 'output';
  dataType?: 'any' | 'string' | 'object' | 'array';
  required?: boolean;
  multiple?: boolean;
}

// ============================================================================
// Extension Types
// ============================================================================

export interface Extension {
  name: string;
  type: 'node' | 'behavior';
  addKeyboardShortcuts?: () => Record<string, KeyboardShortcutHandler>;
  addCommands?: () => Record<string, Command>;
  storage?: Record<string, any>;
  onCreate?: () => void;
  onDestroy?: () => void;
}

export interface NodeExtension extends Extension {
  type: 'node';
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  defaultData?: Record<string, any>;
  execute?: (context: any) => Promise<any>; // Typed properly in execution phase
  tools?: any[]; // ToolDefinition
  component?: any; // Vue Component
  validate?: (node: WorkflowNode, edges: WorkflowEdge[]) => any[]; // ValidationError
}

export interface KeyboardShortcutHandler {
  key: string;
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  handler: (editor: any) => boolean; // Typed properly in editor phase
}

export type Command = (...args: any[]) => boolean;

export type EditorEvent = 
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
  | 'execute:done';

// ============================================================================
// Zod Schemas
// ============================================================================

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.any()),
  selected: z.boolean().optional(),
});

export const WorkflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
  data: z.record(z.any()).optional(),
});

export const WorkflowDataSchema = z.object({
  meta: z.object({
    version: z.string(),
    name: z.string(),
    description: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
});

// ============================================================================
// Execution Types
// ============================================================================

/** Callbacks for execution events */
export interface ExecutionCallbacks {
  /** Called when a node starts executing */
  onNodeStart: (nodeId: string) => void;
  /** Called when a node finishes executing */
  onNodeFinish: (nodeId: string, output: string) => void;
  /** Called when a node encounters an error */
  onNodeError: (nodeId: string, error: Error) => void;
  /** Called for each streaming token */
  onToken: (nodeId: string, token: string) => void;
  /** Called when a router selects a route */
  onRouteSelected?: (nodeId: string, routeId: string) => void;
}

/** Result of workflow execution */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Final output of the workflow */
  output: string;
  /** Output from each node, keyed by node ID */
  nodeOutputs: Record<string, string>;
  /** Error if execution failed */
  error?: Error;
  /** Total execution duration in milliseconds */
  duration: number;
  /** Token usage statistics */
  usage?: TokenUsage;
}

/** Token usage statistics */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Options for execution adapter */
export interface ExecutionOptions {
  /** Global tools available to all agents */
  tools?: ToolDefinition[];
  /** Fallback model when node doesn't specify one */
  defaultModel?: string;
  /** Maximum retry attempts for failed API calls */
  maxRetries?: number;
  /** Base delay in ms between retries */
  retryDelayMs?: number;
  /** Safety limit for graph traversal iterations */
  maxIterations?: number;
  /** Global tool call handler */
  onToolCall?: (name: string, args: any) => Promise<string>;
}

/** Tool definition in OpenRouter/OpenAI format */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  };
  handler?: (args: any) => Promise<string> | string;
}

/** Context passed to node executors during execution */
export interface ExecutionContext {
  /** The node being executed */
  node: WorkflowNode;
  /** Current text input (from user or previous node) */
  input: string;
  /** Original user text input */
  originalInput: string;
  /** Multimodal attachments for this execution */
  attachments: Attachment[];
  /** Conversation history */
  history: ChatMessage[];
  /** Outputs from executed nodes */
  outputs: Record<string, string>;
  /** Ordered list of executed node IDs */
  nodeChain: string[];
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

/** Chat message for conversation history */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Execution adapter interface */
export interface ExecutionAdapter {
  /** Execute a workflow with the given input */
  execute(
    workflow: WorkflowData,
    input: ExecutionInput,
    callbacks: ExecutionCallbacks
  ): Promise<ExecutionResult>;
  
  /** Stop the current execution */
  stop(): void;
  
  /** Check if execution is currently running */
  isRunning(): boolean;
  
  /** Get model capabilities */
  getModelCapabilities(modelId: string): Promise<ModelCapabilities | null>;
  
  /** Check if model supports a specific modality */
  supportsModality(modelId: string, modality: InputModality): Promise<boolean>;
}

// ============================================================================
// Storage Types
// ============================================================================

/** Summary of a saved workflow */
export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
}

/** Storage adapter interface */
export interface StorageAdapter {
  /** Load a workflow by ID */
  load(id: string): Promise<WorkflowData>;
  
  /** Save a workflow, returns the ID */
  save(workflow: WorkflowData): Promise<string>;
  
  /** Delete a workflow by ID */
  delete(id: string): Promise<void>;
  
  /** List all saved workflows */
  list(): Promise<WorkflowSummary[]>;
  
  /** Export workflow to JSON string */
  export(workflow: WorkflowData): string;
  
  /** Import workflow from JSON string */
  import(json: string): WorkflowData;
}
