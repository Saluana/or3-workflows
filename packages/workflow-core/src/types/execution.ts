import type { HITLCallback } from '../hitl';
import type { MemoryAdapter } from '../memory';
import type { Session } from '../session';
import type { SubflowRegistry } from '../subflow';
import type {
    CompactionConfig,
    CompactionResult,
    TokenCounter,
} from '../compaction';
import type {
    Attachment,
    Command,
    ExecutionInput,
    InputModality,
    ModelCapabilities,
    PortDefinition,
    ValidationError,
    ValidationWarning,
    WorkflowData,
    WorkflowEdge,
    WorkflowNode,
} from './base';

// ============================================================================
// Execution State
// ============================================================================

export type WorkflowExecutionState =
    | 'running'
    | 'completed'
    | 'stopped'
    | 'error';

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Parameter schema for a tool function.
 * Follows JSON Schema format for defining parameter types and constraints.
 * Uses a flexible structure to support various parameter definitions.
 */
export interface ToolParameterSchema {
    /** Must be 'object' for function parameters */
    type: 'object';
    /** Property definitions for each parameter */
    properties?: Record<string, Record<string, unknown>>;
    /** List of required parameter names */
    required?: string[];
    /** Whether to allow additional properties not defined in the schema */
    additionalProperties?: boolean;
    /** Allow additional JSON Schema properties */
    [key: string]: unknown;
}

/**
 * Definition of a function that can be called by the LLM.
 * Follows OpenAI's function calling format.
 */
export interface ToolFunctionDefinition {
    /** The name of the function (must be a-z, A-Z, 0-9, underscores, max 64 chars) */
    name: string;
    /** A description of what the function does */
    description?: string;
    /** The parameters the function accepts */
    parameters?: ToolParameterSchema | Record<string, unknown>;
}

/**
 * OpenAI-compatible tool definition.
 * Used by LLM providers to enable function calling capabilities.
 *
 * @example
 * ```typescript
 * const weatherTool: ToolDefinition = {
 *     type: 'function',
 *     function: {
 *         name: 'get_weather',
 *         description: 'Get the current weather for a location',
 *         parameters: {
 *             type: 'object',
 *             properties: {
 *                 location: {
 *                     type: 'string',
 *                     description: 'The city and state, e.g. San Francisco, CA'
 *                 },
 *                 unit: {
 *                     type: 'string',
 *                     enum: ['celsius', 'fahrenheit'],
 *                     description: 'Temperature unit'
 *                 }
 *             },
 *             required: ['location']
 *         }
 *     }
 * };
 * ```
 */
export interface ToolDefinition {
    /** The type of tool - currently only 'function' is supported */
    type: 'function';
    /** The function definition */
    function: ToolFunctionDefinition;
}

export type ToolCallStatus = 'active' | 'completed' | 'error';

export interface ToolCallEvent {
    id: string;
    name: string;
    status: ToolCallStatus;
    branchId?: string;
    branchLabel?: string;
    error?: string;
}

export interface ToolCallEventWithNode extends ToolCallEvent {
    nodeId: string;
    nodeLabel?: string;
    nodeType?: string;
}

/**
 * Result of a tool call made by the LLM.
 */
export interface ToolCallResult {
    /** Unique identifier for this tool call */
    id: string;
    /** The type of tool called */
    type: 'function';
    /** The function call details */
    function: {
        /** Name of the function that was called */
        name: string;
        /** JSON string of the arguments passed to the function */
        arguments: string;
    };
}

/**
 * Chat message for conversation history.
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
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
            /** Tool definitions for function calling */
            tools?: ToolDefinition[];
            /** Control tool selection behavior */
            toolChoice?:
                | 'auto'
                | 'none'
                | 'required'
                | { type: 'function'; function: { name: string } };
            responseFormat?: { type: 'json_object' | 'text' };
            onToken?: (token: string) => void;
            onReasoning?: (token: string) => void;
            signal?: AbortSignal;
        }
    ): Promise<{
        content: string | null;
        toolCalls?: ToolCallResult[];
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
    onNodeStart: (nodeId: string, meta?: NodeExecutionMetadata) => void;

    /**
     * Called when a node successfully completes execution.
     * @param nodeId - The ID of the node that finished.
     * @param output - The output produced by the node.
     */
    onNodeFinish: (
        nodeId: string,
        output: string,
        meta?: NodeExecutionMetadata
    ) => void;

    /**
     * Called when a node encounters an error during execution.
     * The workflow will stop after this callback.
     * @param nodeId - The ID of the node that errored.
     * @param error - The error that occurred.
     */
    onNodeError: (
        nodeId: string,
        error: ExecutionErrorPayload,
        meta?: NodeExecutionMetadata
    ) => void;

    /**
     * Called for each streaming token from the LLM.
     * Use this to display real-time text generation.
     * @param nodeId - The ID of the node generating tokens.
     * @param token - The token/chunk of text received.
     */
    onToken: (nodeId: string, token: string) => void;

    /**
     * Called for workflow-level streaming tokens (intended final output).
     * Emitted only for terminal/leaf nodes so UIs can stream the final result box directly.
     */
    onWorkflowToken?: (token: string, meta: WorkflowTokenMetadata) => void;

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
    onRouteSelected?: (
        nodeId: string,
        routeId: string,
        meta?: NodeExecutionMetadata
    ) => void;

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
        branchLabel: string,
        meta?: NodeExecutionMetadata
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
        output: string,
        meta?: NodeExecutionMetadata
    ) => void;

    /**
     * Called when a loop node starts a new iteration.
     * Use this to update the UI with the current iteration count.
     * @param nodeId - The ID of the loop node.
     * @param iteration - The current iteration number (1-based).
     * @param maxIterations - The maximum allowed iterations.
     */
    onLoopIteration?: (
        nodeId: string,
        iteration: number,
        maxIterations: number,
        meta?: NodeExecutionMetadata
    ) => void;

    /**
     * Called when the entire workflow completes (success, stopped, or error).
     */
    onComplete?: (payload: WorkflowCompletionPayload) => void;
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

    /** Alias for clarity. */
    finalOutput: string;

    /** The node ID that produced the final output. */
    finalNodeId?: string;

    /** Output from each executed node, keyed by node ID. */
    nodeOutputs: Record<string, string>;

    /** Ordered list of nodes as they finished execution. */
    executionOrder: string[];

    /** Last node that produced output or streamed tokens. */
    lastActiveNodeId?: string;

    /** Error that caused execution to fail (only set if success is false). */
    error?: Error;

    /** Total execution duration in milliseconds. */
    duration: number;

    /** Token usage statistics (if available from the LLM provider). */
    usage?: TokenUsage;

    /** Per-request token usage details (estimated). */
    tokenUsageDetails?: Array<TokenUsageDetails & { nodeId: string }>;

    /** Session messages captured during execution (for resume). */
    sessionMessages?: ChatMessage[];
}

/**
 * Metadata emitted alongside node lifecycle events.
 */
export interface NodeExecutionMetadata {
    id: string;
    label?: string;
    type?: string;
    path?: string[];
    executionOrder?: string[];
    lastActiveNodeId?: string;
}

/**
 * Structured error payload for UI display.
 */
export interface ExecutionErrorPayload extends Error {
    nodeId: string;
    nodeLabel?: string;
    nodeType: string;
    code: string;
    statusCode?: number;
    stack?: string;
}

/**
 * Workflow-level completion payload.
 */
export interface WorkflowCompletionPayload {
    success: boolean;
    output: string;
    finalOutput: string;
    finalNodeId?: string;
    nodeOutputs: Record<string, string>;
    executionOrder: string[];
    lastActiveNodeId?: string;
    error?: ExecutionErrorPayload;
    usage?: TokenUsage;
    tokenUsageDetails?: Array<TokenUsageDetails & { nodeId: string }>;
    sessionMessages?: ChatMessage[];
}

/**
 * Metadata for workflow-level streaming tokens.
 */
export interface WorkflowTokenMetadata {
    nodeId: string;
    nodeLabel?: string;
    nodeType?: string;
    isFinalNode: boolean;
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
    /**
     * Maximum executions per individual node (circuit breaker).
     * Prevents infinite loops caused by nodes re-queueing themselves.
     * Default: 100
     */
    maxNodeExecutions?: number;
    /** Global tool call handler */
    onToolCall?: (name: string, args: any) => Promise<string>;
    /** Tool call lifecycle handler with node metadata */
    onToolCallEvent?: (event: ToolCallEventWithNode) => void;
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

    /** Resume execution from a specific node using prior outputs/session. */
    resumeFrom?: ResumeFromOptions;
}

/**
 * Tool definition with handler for execution context.
 * Extends the base ToolDefinition with an optional handler function.
 */
export interface ExecutableToolDefinition extends ToolDefinition {
    /** Handler function to execute when the tool is called */
    handler?: (args: unknown) => Promise<string> | string;
}

/** Resume metadata to continue from a failed node without re-running parents. */
export interface ResumeFromOptions {
    /** Node ID to restart from. */
    startNodeId: string;
    /** Per-node outputs collected so far. */
    nodeOutputs: Record<string, string>;
    /** Execution order captured up to the failure point. */
    executionOrder?: string[];
    /** Last active node before failure. */
    lastActiveNodeId?: string;
    /** Session messages accumulated during prior execution. */
    sessionMessages?: ChatMessage[];
    /** Suggested current input (usually last output). */
    resumeInput?: string;
    /** Final node id if known. */
    finalNodeId?: string;
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
    /** Tool call lifecycle handler */
    onToolCallEvent?: (event: ToolCallEvent) => void;
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
    /** Global tools available to all agents (with handlers for execution) */
    tools?: ExecutableToolDefinition[];
    /** Maximum tool call iterations (from node or global options) */
    maxToolIterations?: number;
    /** Behavior when max tool iterations is reached */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';
    /** HITL callback for human-in-the-loop requests */
    onHITLRequest?: (
        request: import('../hitl').HITLRequest
    ) => Promise<import('../hitl').HITLResponse>;
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
    /** Callback when a loop iteration starts */
    onLoopIteration?: (iteration: number, maxIterations: number) => void;
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
