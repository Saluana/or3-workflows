import type { NodeErrorConfig } from '../errors';
import type { HITLConfig } from '../hitl';
import type { SubflowNodeData } from '../subflow';
import type { OutputNodeData } from '../extensions/OutputNodeExtension';
import type { ModelInputModality, ModelOutputModality } from '../models';
export { isSubflowNodeData } from '../subflow';
export { isOutputNodeData } from '../extensions/OutputNodeExtension';
export type { SubflowNodeData } from '../subflow';
export type { OutputNodeData } from '../extensions/OutputNodeExtension';

export const SCHEMA_VERSION = '2.0.0';

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

// Re-export modality types from models.ts for consistency
export type InputModality = ModelInputModality;
export type OutputModality = ModelOutputModality;

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
    | WhileLoopNodeData
    | SubflowNodeData
    | OutputNodeData;

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
 * Type guard to check if node data is WhileLoopNodeData.
 */
export function isWhileLoopNodeData(data: NodeData): data is WhileLoopNodeData {
    return 'maxIterations' in data && 'conditionPrompt' in data;
}

/**
 * Type guard to check if node data is StartNodeData.
 * Start nodes have minimal data - only label and optional status.
 */
export function isStartNodeData(data: NodeData): data is StartNodeData {
    return (
        !isAgentNodeData(data) &&
        !isRouterNodeData(data) &&
        !isParallelNodeData(data) &&
        !isWhileLoopNodeData(data)
    );
}

/**
 * Base interface for all node data.
 */
export interface BaseNodeData {
    /** Display label for the node */
    label: string;
    /** Description of what this node does - used by router for routing decisions */
    description?: string;
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
    /** Maximum tool call iterations for this node (overrides global setting) */
    maxToolIterations?: number;
    /**
     * Behavior when max tool iterations is reached.
     * - 'warning': Add a warning to output and continue (default)
     * - 'error': Throw an error
     * - 'hitl': Trigger human-in-the-loop for approval to continue
     */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';
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
    /**
     * Fallback behavior when LLM fails to select a valid route:
     * - 'first': Use first route (default, backward compatible)
     * - 'error': Throw error
     * - 'none': Return empty nextNodes (stop execution)
     */
    fallbackBehavior?: 'first' | 'error' | 'none';
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
    mergeEnabled?: boolean;
    errorHandling?: NodeErrorConfig;
    /**
     * Timeout for each branch in milliseconds (default: 300000 = 5 minutes).
     * Set to 0 to disable timeout.
     */
    branchTimeout?: number;
}

/**
 * Definition of a branch in a Parallel node.
 */
export interface BranchDefinition {
    id: string;
    label: string;
    model?: string;
    prompt?: string;
    tools?: string[];
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

    /**
     * Instructions to prepend to each iteration's input.
     * Use this to guide what happens in each loop cycle.
     * Example: "Improve this text, making it clearer and more concise."
     */
    loopPrompt?: string;

    // Loop mode settings
    /**
     * Loop mode: 'condition' uses LLM to evaluate, 'fixed' runs exactly maxIterations times
     * @default 'condition'
     */
    loopMode?: 'condition' | 'fixed';

    /**
     * Whether to include previous outputs in body agent context (always enabled by default)
     * @default true
     */
    includePreviousOutputs?: boolean;

    /**
     * Whether to include iteration info (current/max) in body agent context
     * @default false
     */
    includeIterationContext?: boolean;

    /**
     * Output mode: 'last' returns only final output, 'accumulate' returns all outputs as JSON array
     * @default 'last'
     */
    outputMode?: 'last' | 'accumulate';
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
    | 'edgeUpdate'
    | 'execute:start'
    | 'execute:nodeStart'
    | 'execute:nodeFinish'
    | 'execute:error'
    | 'execute:done';

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

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    type: 'error';
    code: ValidationErrorCode;
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export interface ValidationWarning {
    type: 'warning';
    code: ValidationWarningCode;
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export type ValidationErrorCode =
    | 'NO_START_NODE'
    | 'MULTIPLE_START_NODES'
    | 'DISCONNECTED_NODE'
    | 'CYCLE_DETECTED'
    | 'MISSING_REQUIRED_PORT'
    | 'INVALID_CONNECTION'
    | 'DANGLING_EDGE'
    | 'UNKNOWN_HANDLE'
    | 'MISSING_MODEL'
    | 'MISSING_PROMPT'
    | 'MISSING_SUBFLOW_ID'
    | 'SUBFLOW_NOT_FOUND'
    | 'MISSING_INPUT_MAPPING'
    | 'MISSING_OPERATION'
    | 'INVALID_LIMIT'
    | 'MISSING_CONDITION_PROMPT'
    | 'INVALID_MAX_ITERATIONS'
    | 'MISSING_BODY'
    | 'MISSING_EXIT'
    | 'EXTENSION_VALIDATION_ERROR'
    | 'DATA_VALIDATION_ERROR';

export type ValidationWarningCode =
    | 'EMPTY_PROMPT'
    | 'UNREACHABLE_NODE'
    | 'DEAD_END_NODE'
    | 'DUPLICATE_SOURCE_HANDLE'
    | 'MISSING_EDGE_LABEL'
    | 'NO_SUBFLOW_OUTPUTS'
    | 'NO_REGISTRY'
    | 'NO_INPUT'
    | 'NO_OUTPUT'
    | 'MISSING_BODY'
    | 'MISSING_EXIT'
    | 'DISCONNECTED_COMPONENTS';

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
     * Note: The default LocalStorageAdapter and IndexedDBAdapter implementations
     * always generate a new ID based on the workflow name. This means repeated saves
     * of the same workflow will create multiple entries. For upsert behavior,
     * implement a custom adapter that tracks workflow IDs in meta.
     * @param workflow - The workflow data to save.
     * @returns The generated ID of the saved workflow.
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
