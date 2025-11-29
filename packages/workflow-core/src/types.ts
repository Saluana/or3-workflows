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
