import { z } from 'zod';
import type { MemoryAdapter } from './memory';
import type { Session } from './session';
import type { NodeErrorConfig } from './errors';
import type { HITLConfig, HITLCallback } from './hitl';
import type { SubflowNodeData, SubflowRegistry } from './subflow';
import type { OutputNodeData } from './extensions/OutputNodeExtension';
import type {
    CompactionConfig,
    CompactionResult,
    TokenCounter,
} from './compaction';

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

// Re-export modality types from models.ts for consistency
import type { ModelInputModality, ModelOutputModality } from './models';
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
    | ToolNodeData
    | MemoryNodeData
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
export { isSubflowNodeData, type SubflowNodeData } from './subflow';

/**
 * Type guard to check if node data is OutputNodeData.
 * This is a re-export from OutputNodeExtension.ts for convenience.
 */
export {
    isOutputNodeData,
    type OutputNodeData,
} from './extensions/OutputNodeExtension';

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
 * Interface for an LLM Provider.
 * Abstracts the underlying LLM client (OpenRouter, OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
    /**
     * Generate a completion for a chat conversation.
     */
    chat(
        model: string,
        messages: ChatMessage[],
        options?: {
            temperature?: number;
            maxTokens?: number;
            tools?: any[]; // TODO: Define strict tool types
            toolChoice?: any; // Allow tool choice configuration
            responseFormat?: { type: 'json_object' | 'text' };
            onToken?: (token: string) => void;
            onReasoning?: (token: string) => void;
            signal?: AbortSignal;
        }
    ): Promise<{
        content: string | null;
        toolCalls?: any[];
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    }>;

    /**
     * Get capabilities for a model.
     */
    getModelCapabilities(modelId: string): Promise<ModelCapabilities | null>;
}

/**
 * Result of a node execution.
 */
export interface NodeExecutionResult {
    /** The primary output text of the node */
    output: string;
    /** The IDs of the next nodes to execute */
    nextNodes: string[];
    /** Optional additional outputs (e.g. for debugging or specific UI rendering) */
    metadata?: Record<string, any>;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

/**
 * Optional context passed to validators.
 * Provides access to registries and config needed for deep validation.
 */
export interface ValidationContext {
    /** Registry for resolving subflow references */
    subflowRegistry?: SubflowRegistry;
    /** Default model to use when node doesn't specify one */
    defaultModel?: string;
    /** Extension registry for port/handle validation */
    extensionRegistry?: Map<string, NodeExtension>;
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
    | 'MISSING_EXIT';

export type ValidationWarningCode =
    | 'EMPTY_PROMPT'
    | 'UNREACHABLE_NODE'
    | 'DEAD_END_NODE'
    | 'MISSING_EDGE_LABEL'
    | 'NO_SUBFLOW_OUTPUTS'
    | 'NO_REGISTRY'
    | 'NO_INPUT'
    | 'NO_OUTPUT'
    | 'MISSING_BODY'
    | 'MISSING_EXIT'
    | 'DISCONNECTED_COMPONENTS';

/**
 * Extension definition for a custom node type.
 */
export interface NodeExtension {
    /** Unique type identifier for the node (e.g., 'agent', 'router') */
    name: string;
    /** The type of extension */
    type: 'node';
    /** Label to display in the palette */
    label?: string;
    /** Description to display in the palette */
    description?: string;
    /** Category for grouping in the palette */
    category?: string;
    /** Icon to display (lucide icon name) */
    icon?: string;
    /** Input handles definition */
    inputs: PortDefinition[];
    /** Output handles definition */
    outputs: PortDefinition[];
    /** Default data when creating a new node */
    defaultData: Record<string, any>;

    /** Add custom commands to the editor */
    addCommands?: () => Record<string, Command>;
    /** Lifecycle hook called when extension is registered */
    onCreate?: () => void;
    /** Lifecycle hook called when extension is destroyed */
    onDestroy?: () => void;

    /**
     * Execute the node logic.
     * @param context - The execution context.
     * @param node - The node being executed.
     * @param provider - The LLM provider (optional, for nodes that need LLM).
     */
    execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult>;

    /**
     * Validate the node configuration.
     * @param node - The node to validate
     * @param edges - All edges in the workflow
     * @param context - Optional validation context with registries
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[],
        context?: ValidationContext
    ): (ValidationError | ValidationWarning)[];
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

// Base node data schema
const BaseNodeDataSchema = z.object({
    label: z.string(),
    description: z.string().optional(),
    status: z.enum(['idle', 'active', 'completed', 'error']).optional(),
});

// Error handling schema
const NodeErrorConfigSchema = z
    .object({
        mode: z.enum(['stop', 'continue', 'branch']),
        retry: z
            .object({
                maxRetries: z.number().int().min(0),
                baseDelay: z.number().int().min(0),
                maxDelay: z.number().int().min(0).optional(),
                retryOn: z.array(z.string()).optional(),
                skipOn: z.array(z.string()).optional(),
            })
            .optional(),
    })
    .optional();

// HITL config schema
const HITLConfigSchema = z
    .object({
        enabled: z.boolean(),
        mode: z.enum(['approval', 'input', 'review']),
        message: z.string().optional(),
        timeout: z.number().optional(),
        defaultAction: z.enum(['approve', 'reject', 'skip']).optional(),
    })
    .optional();

// Per-node-type data schemas
const StartNodeDataSchema = BaseNodeDataSchema;

const AgentNodeDataSchema = BaseNodeDataSchema.extend({
    model: z.string().min(1, 'Agent node requires a model'),
    prompt: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    tools: z.array(z.string()).optional(),
    acceptsImages: z.boolean().optional(),
    acceptsAudio: z.boolean().optional(),
    acceptsVideo: z.boolean().optional(),
    acceptsFiles: z.boolean().optional(),
    errorHandling: NodeErrorConfigSchema,
    hitl: HITLConfigSchema,
    maxToolIterations: z.number().int().positive().optional(),
    onMaxToolIterations: z.enum(['warning', 'error', 'hitl']).optional(),
});

const RouteDefinitionSchema = z.object({
    id: z.string(),
    label: z.string(),
    condition: z
        .object({
            type: z.enum(['contains', 'equals', 'regex', 'custom']),
            field: z.string().optional(),
            value: z.string().optional(),
            expression: z.string().optional(),
        })
        .optional(),
});

const RouterNodeDataSchema = BaseNodeDataSchema.extend({
    model: z.string().optional(),
    prompt: z.string().optional(),
    routes: z
        .array(RouteDefinitionSchema)
        .min(1, 'Router requires at least one route'),
    errorHandling: NodeErrorConfigSchema,
    hitl: HITLConfigSchema,
});

const BranchDefinitionSchema = z.object({
    id: z.string(),
    label: z.string(),
    model: z.string().optional(),
    prompt: z.string().optional(),
});

const ParallelNodeDataSchema = BaseNodeDataSchema.extend({
    model: z.string().optional(),
    prompt: z.string().optional(),
    branches: z
        .array(BranchDefinitionSchema)
        .min(1, 'Parallel requires at least one branch'),
    mergeEnabled: z.boolean().optional(),
});

const ToolNodeDataSchema = BaseNodeDataSchema.extend({
    toolId: z.string().min(1, 'Tool node requires a toolId'),
    config: z.record(z.unknown()).optional(),
    errorHandling: NodeErrorConfigSchema,
    hitl: HITLConfigSchema,
});

const MemoryNodeDataSchema = BaseNodeDataSchema.extend({
    operation: z.enum(['query', 'store']),
    text: z.string().optional(),
    limit: z.number().int().positive().optional(),
    filter: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    fallback: z.string().optional(),
});

const WhileLoopNodeDataSchema = BaseNodeDataSchema.extend({
    conditionPrompt: z
        .string()
        .min(1, 'While loop requires a condition prompt'),
    conditionModel: z.string().optional(),
    maxIterations: z
        .number()
        .int()
        .positive('maxIterations must be a positive integer'),
    onMaxIterations: z.enum(['error', 'warning', 'continue']),
    customEvaluator: z.string().optional(),
});

const SubflowNodeDataSchema = BaseNodeDataSchema.extend({
    subflowId: z.string().min(1, 'Subflow node requires a subflowId'),
    inputMappings: z.record(z.string()).optional(),
    preserveContext: z.boolean().optional(),
});

const OutputNodeDataSchema = BaseNodeDataSchema.extend({
    template: z.string().optional(),
    format: z.enum(['text', 'json', 'markdown']).optional(),
});

/**
 * Strict node data schema with type discrimination.
 * Use for parsing untrusted input where fail-fast is desired.
 */
export const StrictNodeDataSchema = z.discriminatedUnion('_nodeType', [
    z.object({ _nodeType: z.literal('start') }).merge(StartNodeDataSchema),
    z.object({ _nodeType: z.literal('agent') }).merge(AgentNodeDataSchema),
    z.object({ _nodeType: z.literal('router') }).merge(RouterNodeDataSchema),
    z.object({ _nodeType: z.literal('condition') }).merge(RouterNodeDataSchema), // Legacy alias
    z
        .object({ _nodeType: z.literal('parallel') })
        .merge(ParallelNodeDataSchema),
    z.object({ _nodeType: z.literal('tool') }).merge(ToolNodeDataSchema),
    z.object({ _nodeType: z.literal('memory') }).merge(MemoryNodeDataSchema),
    z
        .object({ _nodeType: z.literal('whileLoop') })
        .merge(WhileLoopNodeDataSchema),
    z.object({ _nodeType: z.literal('subflow') }).merge(SubflowNodeDataSchema),
    z.object({ _nodeType: z.literal('output') }).merge(OutputNodeDataSchema),
]);

/**
 * Get the appropriate data schema for a node type.
 */
export function getNodeDataSchema(nodeType: string): z.ZodType<unknown> {
    switch (nodeType) {
        case 'start':
            return StartNodeDataSchema;
        case 'agent':
            return AgentNodeDataSchema;
        case 'router':
        case 'condition':
            return RouterNodeDataSchema;
        case 'parallel':
            return ParallelNodeDataSchema;
        case 'tool':
            return ToolNodeDataSchema;
        case 'memory':
            return MemoryNodeDataSchema;
        case 'whileLoop':
            return WhileLoopNodeDataSchema;
        case 'subflow':
            return SubflowNodeDataSchema;
        case 'output':
            return OutputNodeDataSchema;
        default:
            return z.record(z.unknown()); // Unknown node types get loose validation
    }
}

/**
 * Validate node data against its type-specific schema.
 * Returns Zod parse result.
 */
export function validateNodeData(
    nodeType: string,
    data: unknown
): z.SafeParseReturnType<unknown, unknown> {
    const schema = getNodeDataSchema(nodeType);
    return schema.safeParse(data);
}

// Legacy loose schemas for backwards compatibility
export const WorkflowNodeSchema = z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.any()),
    selected: z.boolean().optional(),
});

/**
 * Strict workflow node schema that validates data per node type.
 */
export const StrictWorkflowNodeSchema = z
    .object({
        id: z.string(),
        type: z.string(),
        position: z.object({ x: z.number(), y: z.number() }),
        selected: z.boolean().optional(),
    })
    .passthrough()
    .superRefine((node, ctx) => {
        const result = validateNodeData(node.type, node.data);
        if (!result.success) {
            for (const issue of result.error.issues) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['data', ...issue.path],
                    message: issue.message,
                });
            }
        }
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

/**
 * Strict workflow schema that validates node data per type.
 * Use for parsing untrusted workflow JSON.
 */
export const StrictWorkflowDataSchema = z.object({
    meta: z.object({
        version: z.string(),
        name: z.string().min(1, 'Workflow name is required'),
        description: z.string().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    }),
    nodes: z.array(StrictWorkflowNodeSchema),
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
     * Called for each reasoning/thinking token from the LLM.
     * Use this to display the model's reasoning process (for models that support it).
     * @param nodeId - The ID of the node generating reasoning.
     * @param token - The reasoning token/chunk of text received.
     */
    onReasoning?: (nodeId: string, token: string) => void;

    /**
     * Called when a router node selects a route.
     * Optional - use this to visualize routing decisions.
     * @param nodeId - The ID of the router node.
     * @param routeId - The ID of the selected route.
     */
    onRouteSelected?: (nodeId: string, routeId: string) => void;

    /**
     * Called when token usage is estimated for an LLM request.
     * Use this to display token counts and remaining context.
     * @param nodeId - The ID of the node producing the usage.
     * @param usage - Estimated token usage details.
     */
    onTokenUsage?: (nodeId: string, usage: TokenUsageDetails) => void;

    /**
     * Called when context compaction occurs.
     * Optional - use this to log or display compaction events.
     * @param result - Details about the compaction operation.
     */
    onContextCompacted?: (result: CompactionResult) => void;

    /**
     * Called for each streaming token from a parallel branch.
     * Use this to display real-time streaming for individual branches.
     * @param nodeId - The ID of the parallel node.
     * @param branchId - The ID of the branch.
     * @param branchLabel - The display label of the branch.
     * @param token - The token/chunk of text received.
     */
    onBranchToken?: (
        nodeId: string,
        branchId: string,
        branchLabel: string,
        token: string
    ) => void;

    /**
     * Called for each reasoning/thinking token from a parallel branch.
     * Use this to display thinking indicators for individual branches.
     * @param nodeId - The ID of the parallel node.
     * @param branchId - The ID of the branch.
     * @param branchLabel - The display label of the branch.
     * @param token - The reasoning token/chunk of text received.
     */
    onBranchReasoning?: (
        nodeId: string,
        branchId: string,
        branchLabel: string,
        token: string
    ) => void;

    /**
     * Called when a parallel branch starts execution.
     * @param nodeId - The ID of the parallel node.
     * @param branchId - The ID of the branch.
     * @param branchLabel - The display label of the branch.
     */
    onBranchStart?: (
        nodeId: string,
        branchId: string,
        branchLabel: string
    ) => void;

    /**
     * Called when a parallel branch completes execution.
     * @param nodeId - The ID of the parallel node.
     * @param branchId - The ID of the branch.
     * @param branchLabel - The display label of the branch.
     * @param output - The final output of the branch.
     */
    onBranchComplete?: (
        nodeId: string,
        branchId: string,
        branchLabel: string,
        output: string
    ) => void;
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

    /** Per-request token usage details (estimated). */
    tokenUsageDetails?: Array<TokenUsageDetails & { nodeId: string }>;
}

/** Token usage statistics */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

/** Token usage enriched with model limits */
export interface TokenUsageDetails extends TokenUsage {
    /** Model used for the request */
    model: string;
    /** Maximum context window for the model */
    contextLimit: number;
    /** Compaction threshold in tokens (if enabled) */
    compactionThreshold?: number;
    /** Remaining tokens before compaction would trigger */
    remainingBeforeCompaction?: number;
    /** Remaining tokens before hitting model context limit */
    remainingContext: number;
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
    /**
     * Configuration for automatic context compaction.
     * When enabled, older messages will be summarized or truncated
     * when approaching the model's context limit.
     */
    compaction?: CompactionConfig;
    /**
     * Token counter for measuring context size.
     * Defaults to ApproximateTokenCounter (4 chars ≈ 1 token).
     */
    tokenCounter?: TokenCounter;
    /**
     * Enable debug logging for LLM calls and routing decisions.
     * When false (default), noisy logs are suppressed to reduce console output and PII exposure.
     */
    debug?: boolean;
    /**
     * Run workflow validation before execution (default: true).
     * Set to false to skip preflight validation for performance.
     * Errors are returned via onNodeError callback with code='VALIDATION'.
     */
    preflight?: boolean;
    /**
     * Internal: Current subflow depth, used by subflow execution to track nesting.
     * @internal
     */
    _subflowDepth?: number;
    /**
     * Maximum number of tool call iterations for agent nodes (default: 10).
     * Prevents infinite tool-calling loops.
     */
    maxToolIterations?: number;
    /**
     * Default behavior when max tool iterations is reached.
     * - 'warning': Add a warning to output and continue (default)
     * - 'error': Throw an error
     * - 'hitl': Trigger human-in-the-loop for approval to continue
     */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';
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
    /** Input text for the current execution step */
    input: string;
    /** Conversation history */
    history: ChatMessage[];
    /** Long-term memory adapter (developer-provided or default) */
    memory: MemoryAdapter;
    /** Multimodal attachments for this execution */
    attachments?: Attachment[];
    /** Callback for streaming tokens */
    onToken?: (token: string) => void;
    /** Callback for streaming reasoning/thinking tokens */
    onReasoning?: (token: string) => void;
    /** Outputs from previous nodes, keyed by node ID */
    outputs: Record<string, string>;
    /** Chain of executed node IDs leading to this point */
    nodeChain: string[];
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Get a node by ID to access its metadata/label */
    getNode: (id: string) => WorkflowNode | undefined;
    /** Get outgoing edges from a specific node and handle */
    getOutgoingEdges: (nodeId: string, sourceHandle?: string) => WorkflowEdge[];
    /** Global tool call handler */
    onToolCall?: (name: string, args: any) => Promise<string>;
    /** Session ID for the current execution */
    sessionId?: string;
    /** Execute a subgraph (e.g., for loops) */
    executeSubgraph?: (
        startNodeId: string,
        input: string,
        options?: { nodeOverrides?: Record<string, any> }
    ) => Promise<{ output: string }>;
    /** Execute a complete workflow (for subflows) */
    executeWorkflow?: (
        workflow: WorkflowData,
        input: ExecutionInput,
        options?: Partial<ExecutionOptions>
    ) => Promise<ExecutionResult>;
    /** Registry for subflows */
    subflowRegistry?: SubflowRegistry;
    /** Custom evaluators for while loops */
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
    /** Enable debug logging for LLM calls and routing decisions */
    debug?: boolean;
    /** Default model to use when node doesn't specify one */
    defaultModel?: string;
    /** Current subflow nesting depth (for enforcing maxSubflowDepth) */
    subflowDepth?: number;
    /** Maximum subflow nesting depth (from ExecutionOptions) */
    maxSubflowDepth?: number;
    /** Global tools available to all agents */
    tools?: ToolDefinition[];
    /** Maximum tool call iterations (from node or global options) */
    maxToolIterations?: number;
    /** Behavior when max tool iterations is reached */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';
    /** HITL callback for human-in-the-loop requests */
    onHITLRequest?: (
        request: import('./hitl').HITLRequest
    ) => Promise<import('./hitl').HITLResponse>;
    /** Current workflow name for HITL context */
    workflowName?: string;
    /** Token counter instance for estimating usage */
    tokenCounter?: TokenCounter;
    /** Compaction configuration (if enabled) */
    compaction?: CompactionConfig;
    /** Callback to report token usage for the current node */
    onTokenUsage?: (usage: TokenUsageDetails) => void;
    /** Callback for parallel branch token streaming */
    onBranchToken?: (
        branchId: string,
        branchLabel: string,
        token: string
    ) => void;
    /** Callback for parallel branch reasoning/thinking token streaming */
    onBranchReasoning?: (
        branchId: string,
        branchLabel: string,
        token: string
    ) => void;
    /** Callback when a parallel branch starts */
    onBranchStart?: (branchId: string, branchLabel: string) => void;
    /** Callback when a parallel branch completes */
    onBranchComplete?: (
        branchId: string,
        branchLabel: string,
        output: string
    ) => void;
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
