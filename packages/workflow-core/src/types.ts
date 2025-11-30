import { z } from 'zod';
import type { MemoryAdapter } from './memory';
import type { Session } from './session';
import type { NodeErrorConfig } from './errors';
import type { HITLConfig, HITLCallback } from './hitl';
import type { SubflowNodeData, SubflowRegistry } from './subflow';

export const SCHEMA_VERSION = '2.0.0';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique slug-based ID from a name.
 * @param name - The name to convert to a slug ID
 * @returns A unique ID in format "slug-timestamp"
 */
export function generateWorkflowId(name: string): string {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const timestamp = Date.now().toString(36);
    return `${slug}-${timestamp}`;
}

/**
 * Check if a workflow version is compatible with the current schema.
 * @param version - The version string to check
 * @returns true if compatible (same major version)
 */
export function isVersionCompatible(version: string): boolean {
    const currentMajor = parseInt(SCHEMA_VERSION.split('.')[0] || '0', 10);
    const checkMajor = parseInt(version.split('.')[0] || '0', 10);
    return currentMajor === checkMajor;
}

/**
 * Parse a semantic version string.
 * @param version - Version string (e.g., "2.0.0")
 * @returns Object with major, minor, patch numbers
 */
export function parseVersion(version: string): {
    major: number;
    minor: number;
    patch: number;
} {
    const parts = version.split('.').map((p) => parseInt(p, 10) || 0);
    return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
    };
}

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
    type: 'text' | 'image_url' | 'file' | 'audio' | 'video';
    text?: string;
    imageUrl?: { url: string; detail?: 'auto' | 'low' | 'high' };
    file?: { url: string; mimeType: string };
    audio?: { url: string; format?: string };
    video?: { url: string; mimeType?: string };
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

/**
 * Represents the complete data structure of a workflow.
 * Contains metadata, nodes, and edges.
 */
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

/**
 * Represents a single node in the workflow graph.
 */
export interface WorkflowNode {
    /** Unique identifier for the node */
    id: string;
    /** Type of the node (e.g., 'agent', 'router') */
    type: string;
    /** Position on the canvas */
    position: { x: number; y: number };
    /** Node-specific data */
    data: NodeData;
    /** Selection state */
    selected?: boolean;
}

/**
 * Union type for all possible node data structures.
 */
export type NodeData =
    | StartNodeData
    | AgentNodeData
    | RouterNodeData
    | ParallelNodeData
    | ToolNodeData
    | MemoryNodeData
    | WhileLoopNodeData
    | SubflowNodeData;

// ============================================================================
// Type Guards for Node Data
// ============================================================================

/**
 * Type guard to check if node data is AgentNodeData.
 */
export function isAgentNodeData(data: NodeData): data is AgentNodeData {
    return (
        'model' in data &&
        'prompt' in data &&
        !('routes' in data) &&
        !('branches' in data)
    );
}

/**
 * Type guard to check if node data is RouterNodeData.
 */
export function isRouterNodeData(data: NodeData): data is RouterNodeData {
    return 'routes' in data && Array.isArray((data as RouterNodeData).routes);
}

/**
 * Type guard to check if node data is ParallelNodeData.
 */
export function isParallelNodeData(data: NodeData): data is ParallelNodeData {
    return (
        'branches' in data && Array.isArray((data as ParallelNodeData).branches)
    );
}

/**
 * Type guard to check if node data is ToolNodeData.
 */
export function isToolNodeData(data: NodeData): data is ToolNodeData {
    return 'toolId' in data;
}

/**
 * Type guard to check if node data is MemoryNodeData.
 */
export function isMemoryNodeData(data: NodeData): data is MemoryNodeData {
    return 'operation' in data && 'fallback' in data;
}

/**
 * Type guard to check if node data is WhileLoopNodeData.
 */
export function isWhileLoopNodeData(data: NodeData): data is WhileLoopNodeData {
    return 'maxIterations' in data && 'conditionPrompt' in data;
}

/**
 * Type guard to check if node data is SubflowNodeData.
 * This is a re-export from subflow.ts for convenience.
 */
export { isSubflowNodeData } from './subflow';
/**
 * Type guard to check if node data is StartNodeData.
 * Start nodes have minimal data - only label and optional status.
 */
export function isStartNodeData(data: NodeData): data is StartNodeData {
    return (
        !isAgentNodeData(data) &&
        !isRouterNodeData(data) &&
        !isParallelNodeData(data) &&
        !isToolNodeData(data) &&
        !isMemoryNodeData(data) &&
        !isWhileLoopNodeData(data)
    );
}

/**
 * Base interface for all node data.
 */
export interface BaseNodeData {
    /** Display label for the node */
    label: string;
    /** Current execution status */
    status?: NodeStatus;
}

/**
 * Execution status of a node.
 */
export type NodeStatus = 'idle' | 'active' | 'completed' | 'error';

/**
 * Data for the Start node.
 */
export interface StartNodeData extends BaseNodeData {
    // Minimal
}

/**
 * Data for an Agent node.
 * Configures the AI model and its parameters.
 */
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
    errorHandling?: NodeErrorConfig;
    /** Human-in-the-loop configuration for this node */
    hitl?: HITLConfig;
}

/**
 * Data for a Router node.
 * Defines routing logic based on conditions.
 */
export interface RouterNodeData extends BaseNodeData {
    model?: string;
    prompt?: string;
    routes: RouteDefinition[];
    errorHandling?: NodeErrorConfig;
    /** Human-in-the-loop configuration for this node */
    hitl?: HITLConfig;
}

/**
 * Definition of a single route in a Router node.
 */
export interface RouteDefinition {
    id: string;
    label: string;
    condition?: RouteCondition;
}

/**
 * Condition for a route.
 */
export interface RouteCondition {
    type: 'contains' | 'equals' | 'regex' | 'custom';
    field?: string;
    value?: string;
    expression?: string;
}

/**
 * Data for a Parallel node.
 * Defines parallel execution branches.
 */
export interface ParallelNodeData extends BaseNodeData {
    model?: string;
    prompt?: string;
    branches: BranchDefinition[];
}

/**
 * Definition of a branch in a Parallel node.
 */
export interface BranchDefinition {
    id: string;
    label: string;
    model?: string;
    prompt?: string;
}

/**
 * Data for a Tool node.
 * Configures a specific tool execution.
 */
export interface ToolNodeData extends BaseNodeData {
    toolId: string;
    config?: Record<string, any>;
    errorHandling?: NodeErrorConfig;
    /** Human-in-the-loop configuration for this node */
    hitl?: HITLConfig;
}

/**
 * Data for a Memory node.
 * Supports querying or storing long-term memories via configured adapters.
 */
export interface MemoryNodeData extends BaseNodeData {
    operation: 'query' | 'store';
    text?: string;
    limit?: number;
    filter?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    fallback?: string;
}

/**
 * Data for a While Loop node.
 */
export interface WhileLoopNodeData extends BaseNodeData {
    conditionPrompt: string;
    conditionModel?: string;
    maxIterations: number;
    onMaxIterations: 'error' | 'warning' | 'continue';
    customEvaluator?: string;
}

export interface LoopState {
    iteration: number;
    outputs: string[];
    lastOutput: string | null;
    totalIterations?: number;
    isActive: boolean;
}

/**
 * Represents a connection between two nodes.
 */
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

/**
 * Defines an input or output port on a node.
 */
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

/**
 * Base interface for editor extensions.
 */
export interface Extension {
    name: string;
    type: 'node' | 'behavior';
    addKeyboardShortcuts?: () => Record<string, KeyboardShortcutHandler>;
    addCommands?: () => Record<string, Command>;
    storage?: Record<string, any>;
    onCreate?: () => void;
    onDestroy?: () => void;
}

/**
 * Extension for defining custom node types.
 */
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
    | 'metaUpdate'
    | 'viewportUpdate'
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

/**
 * Callbacks for workflow execution events.
 *
 * Implement these callbacks to receive real-time updates during workflow execution,
 * including streaming tokens, node lifecycle events, and routing decisions.
 *
 * @example
 * ```typescript
 * const callbacks: ExecutionCallbacks = {
 *   onNodeStart: (nodeId) => console.log(`Node ${nodeId} started`),
 *   onNodeFinish: (nodeId, output) => console.log(`Node ${nodeId} finished: ${output}`),
 *   onNodeError: (nodeId, error) => console.error(`Node ${nodeId} error:`, error),
 *   onToken: (nodeId, token) => process.stdout.write(token),
 *   onRouteSelected: (nodeId, routeId) => console.log(`Router ${nodeId} selected ${routeId}`),
 * };
 * ```
 */
export interface ExecutionCallbacks {
    /**
     * Called when a node begins execution.
     * Use this to update UI state (e.g., show loading indicator).
     * @param nodeId - The ID of the node that started.
     */
    onNodeStart: (nodeId: string) => void;

    /**
     * Called when a node successfully completes execution.
     * @param nodeId - The ID of the node that finished.
     * @param output - The output produced by the node.
     */
    onNodeFinish: (nodeId: string, output: string) => void;

    /**
     * Called when a node encounters an error during execution.
     * The workflow will stop after this callback.
     * @param nodeId - The ID of the node that errored.
     * @param error - The error that occurred.
     */
    onNodeError: (nodeId: string, error: Error) => void;

    /**
     * Called for each streaming token from the LLM.
     * Use this to display real-time text generation.
     * @param nodeId - The ID of the node generating tokens.
     * @param token - The token/chunk of text received.
     */
    onToken: (nodeId: string, token: string) => void;

    /**
     * Called when a router node selects a route.
     * Optional - use this to visualize routing decisions.
     * @param nodeId - The ID of the router node.
     * @param routeId - The ID of the selected route.
     */
    onRouteSelected?: (nodeId: string, routeId: string) => void;
}

/**
 * Result returned after workflow execution completes.
 *
 * Contains the final output, per-node outputs, timing information,
 * and any errors that occurred.
 *
 * @example
 * ```typescript
 * const result = await adapter.execute(workflow, input, callbacks);
 *
 * if (result.success) {
 *   console.log('Output:', result.output);
 *   console.log('Duration:', result.duration, 'ms');
 *   console.log('Node outputs:', result.nodeOutputs);
 * } else {
 *   console.error('Execution failed:', result.error?.message);
 * }
 * ```
 */
export interface ExecutionResult {
    /** Whether execution completed successfully without errors. */
    success: boolean;

    /** Final output of the workflow (from the last executed node). */
    output: string;

    /** Output from each executed node, keyed by node ID. */
    nodeOutputs: Record<string, string>;

    /** Error that caused execution to fail (only set if success is false). */
    error?: Error;

    /** Total execution duration in milliseconds. */
    duration: number;

    /** Token usage statistics (if available from the LLM provider). */
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
    /** Pluggable long-term memory adapter */
    memory?: MemoryAdapter;
    /** Provide an existing session ID to reuse */
    sessionId?: string;
    /** Custom evaluators available to while loop nodes */
    customEvaluators?: Record<
        string,
        (
            context: {
                currentInput: string;
                session: Session;
                memory: MemoryAdapter;
                outputs: Record<string, string>;
            },
            loopState: {
                iteration: number;
                outputs: string[];
                lastOutput: string | null;
            }
        ) => Promise<boolean> | boolean
    >;
    /**
     * Callback for human-in-the-loop requests.
     * Implement this to show UI for human interaction (modal, Slack, email, etc.).
     * If not provided, HITL will be skipped even for nodes with hitl.enabled = true.
     */
    onHITLRequest?: HITLCallback;
    /**
     * Registry of available subflows for subflow node execution.
     * Required if any subflow nodes exist in the workflow.
     */
    subflowRegistry?: SubflowRegistry;
    /**
     * Maximum nesting depth for subflows (default: 10).
     * Prevents infinite recursion if subflows call each other.
     */
    maxSubflowDepth?: number;
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
    /** Current session (in-memory conversation history) */
    session: Session;
    /** Long-term memory adapter (developer-provided or default) */
    memory: MemoryAdapter;
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
    supportsModality(
        modelId: string,
        modality: InputModality
    ): Promise<boolean>;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Summary information for a saved workflow.
 * Used in list views without loading the full workflow data.
 */
export interface WorkflowSummary {
    /** Unique identifier for the workflow. */
    id: string;

    /** Display name of the workflow. */
    name: string;

    /** Optional description. */
    description?: string;

    /** ISO 8601 timestamp of creation. */
    createdAt: string;

    /** ISO 8601 timestamp of last update. */
    updatedAt: string;

    /** Number of nodes in the workflow. */
    nodeCount: number;
}

/**
 * Interface for workflow persistence adapters.
 *
 * Implement this interface to create custom storage backends
 * (e.g., database, cloud storage, file system).
 *
 * @example
 * ```typescript
 * class MyDatabaseAdapter implements StorageAdapter {
 *   async load(id: string): Promise<WorkflowData> {
 *     const row = await db.query('SELECT data FROM workflows WHERE id = ?', [id]);
 *     return JSON.parse(row.data);
 *   }
 *
 *   async save(workflow: WorkflowData): Promise<string> {
 *     const id = workflow.meta.id || generateId();
 *     await db.query('INSERT INTO workflows (id, data) VALUES (?, ?)', [id, JSON.stringify(workflow)]);
 *     return id;
 *   }
 *
 *   async delete(id: string): Promise<void> {
 *     await db.query('DELETE FROM workflows WHERE id = ?', [id]);
 *   }
 *
 *   async list(): Promise<WorkflowSummary[]> {
 *     return db.query('SELECT id, name, updated_at FROM workflows');
 *   }
 *
 *   export(workflow: WorkflowData): string {
 *     return JSON.stringify(workflow, null, 2);
 *   }
 *
 *   import(json: string): WorkflowData {
 *     return JSON.parse(json);
 *   }
 * }
 * ```
 */
export interface StorageAdapter {
    /**
     * Load a workflow by its unique ID.
     * @param id - The workflow ID.
     * @returns The full workflow data.
     * @throws Error if workflow not found.
     */
    load(id: string): Promise<WorkflowData>;

    /**
     * Save a workflow to storage.
     * Creates a new workflow or updates an existing one.
     * @param workflow - The workflow data to save.
     * @returns The ID of the saved workflow.
     */
    save(workflow: WorkflowData): Promise<string>;

    /**
     * Delete a workflow from storage.
     * @param id - The workflow ID to delete.
     * @throws Error if workflow not found.
     */
    delete(id: string): Promise<void>;

    /**
     * List all saved workflows.
     * @returns Array of workflow summaries (without full node data).
     */
    list(): Promise<WorkflowSummary[]>;

    /**
     * Export a workflow to a JSON string.
     * Use for file downloads or clipboard operations.
     * @param workflow - The workflow to export.
     * @returns JSON string representation.
     */
    export(workflow: WorkflowData): string;

    /**
     * Import a workflow from a JSON string.
     * Use for file uploads or paste operations.
     * @param json - JSON string to parse.
     * @returns Parsed workflow data.
     * @throws Error if JSON is invalid or malformed.
     */
    import(json: string): WorkflowData;
}
