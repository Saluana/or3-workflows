import type { OpenRouter } from '@openrouter/sdk';
import type {
    WorkflowData,
    WorkflowNode,
    WorkflowEdge,
    ExecutionAdapter,
    ExecutionCallbacks,
    ExecutionResult,
    ExecutionOptions,
    ExecutionInput,
    Attachment,
    ModelCapabilities,
    InputModality,
    NodeExtension,
    LLMProvider,
    ExecutionContext,
    ChatMessage,
    TokenUsage,
    TokenUsageDetails,
    ValidationContext,
    NodeExecutionMetadata,
} from './types';
import {
    AgentNodeExtension,
    RouterNodeExtension,
    ParallelNodeExtension,
    WhileLoopExtension,
    SubflowExtension,
    OutputNodeExtension,
    StartNodeExtension,
} from './extensions';
import { OpenRouterLLMProvider } from './providers/OpenRouterLLMProvider';
import { InMemoryAdapter, type MemoryAdapter } from './memory';
import { ExecutionSession, type Session } from './session';
import {
    createExecutionError,
    ExecutionError,
    type NodeErrorConfig,
    type NodeRetryConfig,
} from './errors';
import {
    type HITLConfig,
    type HITLRequest,
    type HITLResponse,
    generateHITLRequestId,
    getDefaultApprovalOptions,
} from './hitl';
import {
    ApproximateTokenCounter,
    countMessageTokens,
    calculateThreshold,
    splitMessagesForCompaction,
    buildSummarizationPrompt,
    createSummaryMessage,
    type CompactionResult,
    type TokenCounter,
} from './compaction';
import { validateWorkflow } from './validation';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default model used when no model is specified.
 * This is a reliable, cost-effective model that works well for most use cases.
 * Can be overridden via ExecutionOptions.defaultModel.
 */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** Maximum retry attempts for API calls */
const DEFAULT_MAX_RETRIES = 2;

/** Base delay in milliseconds between retry attempts */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Maximum iterations multiplier to prevent infinite loops */
const MAX_ITERATIONS_MULTIPLIER = 3;

/** Default error codes to skip retrying */
const DEFAULT_SKIP_ON_RETRY: ReadonlyArray<import('./errors').ErrorCode> = [
    'AUTH',
    'VALIDATION',
] as const;

// ============================================================================
// Types
// ============================================================================

/** Graph structure for workflow traversal */
interface WorkflowGraph {
    readonly nodeMap: ReadonlyMap<string, WorkflowNode>;
    readonly children: Readonly<
        Record<string, ReadonlyArray<{ nodeId: string; handleId?: string }>>
    >;
    readonly parents: Readonly<Record<string, ReadonlyArray<string>>>;
}

/** Internal execution state */
interface InternalExecutionContext {
    readonly input: string;
    currentInput: string;
    readonly originalInput: string;
    readonly attachments: Attachment[];
    outputs: Record<string, string>;
    nodeChain: string[];
    readonly nodePath: string[];
    readonly signal: AbortSignal;
    readonly session: Session;
    readonly memory: MemoryAdapter;
    readonly workflowName: string;
}

const SUBFLOW_SCOPE_PREFIX = 'sf:';
const SUBFLOW_SCOPE_SEPARATOR = '|';

function scopeNodeId(nodeId: string, path?: string[]): string {
    if (!path || path.length === 0) return nodeId;
    const scoped = path
        .map((segment) => `${SUBFLOW_SCOPE_PREFIX}${segment}`)
        .join(SUBFLOW_SCOPE_SEPARATOR);
    return `${scoped}${SUBFLOW_SCOPE_SEPARATOR}${nodeId}`;
}

function scopeMeta(
    meta: NodeExecutionMetadata | undefined,
    path: string[]
): NodeExecutionMetadata | undefined {
    if (!meta) return meta;
    return {
        ...meta,
        id: meta.id ? scopeNodeId(meta.id, path) : meta.id,
        path: [...path],
    };
}

function scopeExecutionCallbacks(
    callbacks: ExecutionCallbacks,
    path: string[]
): ExecutionCallbacks {
    const scopeId = (nodeId: string) => scopeNodeId(nodeId, path);
    return {
        onNodeStart: (nodeId, meta) => {
            callbacks.onNodeStart(scopeId(nodeId), scopeMeta(meta, path));
        },
        onNodeFinish: (nodeId, output, meta) => {
            callbacks.onNodeFinish(
                scopeId(nodeId),
                output,
                scopeMeta(meta, path)
            );
        },
        onNodeError: (nodeId, error, meta) => {
            callbacks.onNodeError(
                scopeId(nodeId),
                error,
                scopeMeta(meta, path)
            );
        },
        onToken: (nodeId, token) => {
            callbacks.onToken(scopeId(nodeId), token);
        },
        onWorkflowToken: callbacks.onWorkflowToken
            ? (token, meta) => {
                  const nextMeta = meta
                      ? { ...meta, nodeId: scopeId(meta.nodeId) }
                      : meta;
                  callbacks.onWorkflowToken?.(token, nextMeta as any);
              }
            : undefined,
        onReasoning: callbacks.onReasoning
            ? (nodeId, token) => {
                  callbacks.onReasoning?.(scopeId(nodeId), token);
              }
            : undefined,
        onRouteSelected: callbacks.onRouteSelected
            ? (nodeId, routeId, meta) => {
                  callbacks.onRouteSelected?.(
                      scopeId(nodeId),
                      routeId,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        onTokenUsage: callbacks.onTokenUsage
            ? (nodeId, usage) => {
                  callbacks.onTokenUsage?.(scopeId(nodeId), usage);
              }
            : undefined,
        onContextCompacted: callbacks.onContextCompacted
            ? (result) => {
                  callbacks.onContextCompacted?.(result);
              }
            : undefined,
        onBranchToken: callbacks.onBranchToken
            ? (nodeId, branchId, branchLabel, token) => {
                  callbacks.onBranchToken?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      token
                  );
              }
            : undefined,
        onBranchReasoning: callbacks.onBranchReasoning
            ? (nodeId, branchId, branchLabel, token) => {
                  callbacks.onBranchReasoning?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      token
                  );
              }
            : undefined,
        onBranchStart: callbacks.onBranchStart
            ? (nodeId, branchId, branchLabel, meta) => {
                  callbacks.onBranchStart?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        onBranchComplete: callbacks.onBranchComplete
            ? (nodeId, branchId, branchLabel, output, meta) => {
                  callbacks.onBranchComplete?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      output,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        onLoopIteration: callbacks.onLoopIteration
            ? (nodeId, iteration, maxIterations, meta) => {
                  callbacks.onLoopIteration?.(
                      scopeId(nodeId),
                      iteration,
                      maxIterations,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        // Avoid propagating subflow completion to parent completion handlers.
        onComplete: undefined,
    };
}

function getNodeLabel(node: WorkflowNode | undefined): string | undefined {
    if (!node) return undefined;
    const maybe = (node.data as { label?: string } | undefined)?.label;
    if (typeof maybe === 'string' && maybe.trim().length > 0) {
        return maybe;
    }
    return node.id;
}

// ============================================================================
// Extension Registry
// ============================================================================

/**
 * Registry of all node type extensions.
 * Used by execution and validation to look up node handlers.
 */
export const extensionRegistry = new Map<string, NodeExtension>([
    ['agent', AgentNodeExtension],
    ['router', RouterNodeExtension],
    ['parallel', ParallelNodeExtension],
    ['whileLoop', WhileLoopExtension],
    ['subflow', SubflowExtension],
    ['output', OutputNodeExtension],
    ['start', StartNodeExtension],
    ['condition', RouterNodeExtension], // Legacy alias
]);

/**
 * Get an extension by node type.
 * @param nodeType - The type of node (e.g., 'agent', 'router')
 * @returns The extension or undefined if not found
 */
export function getExtension(nodeType: string): NodeExtension | undefined {
    return extensionRegistry.get(nodeType);
}

/**
 * Register a custom node extension.
 * @param extension - The extension to register
 */
export function registerExtension(extension: NodeExtension): void {
    extensionRegistry.set(extension.name, extension);
}

// ============================================================================
// OpenRouterExecutionAdapter
// ============================================================================

/**
 * Execution adapter that uses OpenRouter SDK for LLM calls.
 * Implements BFS traversal with streaming, retry logic, and multimodal support.
 *
 * @example
 * ```typescript
 * import OpenRouter from '@openrouter/sdk';
 * import { OpenRouterExecutionAdapter } from '@or3/workflow-core';
 *
 * const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
 * const adapter = new OpenRouterExecutionAdapter(client, {
 *   defaultModel: 'openai/gpt-4o-mini',
 *   maxRetries: 2,
 * });
 *
 * const result = await adapter.execute(workflow, { text: 'Hello' }, callbacks);
 * ```
 */
export class OpenRouterExecutionAdapter implements ExecutionAdapter {
    private provider: LLMProvider;
    private options: ExecutionOptions;
    private abortController: AbortController | null = null;
    private running = false;
    private memory: MemoryAdapter;
    private tokenCounter: TokenCounter;
    private tokenUsageEvents: Array<{
        nodeId: string;
        usage: TokenUsageDetails;
    }> = [];

    // Cache node type sets for O(1) lookups
    private static readonly LLM_NODE_TYPES = new Set([
        'agent',
        'router',
        'whileLoop',
    ]);
    private static readonly HITL_SUPPORTED_TYPES = new Set(['agent', 'router']);

    /**
     * Create a new OpenRouterExecutionAdapter.
     *
     * @param clientOrProvider - An OpenRouter client OR an LLMProvider instance.
     * @param options - Optional execution configuration.
     */
    constructor(
        clientOrProvider: OpenRouter | LLMProvider,
        options: ExecutionOptions = {}
    ) {
        if (!clientOrProvider) {
            throw new Error(
                'OpenRouterExecutionAdapter requires an OpenRouter client or LLMProvider.'
            );
        }

        if (this.isLLMProvider(clientOrProvider)) {
            this.provider = clientOrProvider;
        } else {
            this.provider = new OpenRouterLLMProvider(clientOrProvider, {
                debug: options.debug,
            });
        }

        this.options = {
            defaultModel: DEFAULT_MODEL,
            maxRetries: DEFAULT_MAX_RETRIES,
            retryDelayMs: DEFAULT_RETRY_DELAY_MS,
            ...options,
        };
        this.memory = this.options.memory || new InMemoryAdapter();
        this.tokenCounter =
            this.options.tokenCounter || new ApproximateTokenCounter();
    }

    private isLLMProvider(obj: unknown): obj is LLMProvider {
        return (
            obj !== null &&
            typeof obj === 'object' &&
            'chat' in obj &&
            typeof obj.chat === 'function'
        );
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    /**
     * Execute a workflow with the given input.
     */
    async execute(
        workflow: WorkflowData,
        input: ExecutionInput,
        callbacks: ExecutionCallbacks
    ): Promise<ExecutionResult> {
        // Cancel any existing execution
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        this.running = true;
        this.tokenUsageEvents = [];

        const resumeFrom = this.options.resumeFrom;

        const startTime = Date.now();
        const nodeOutputs: Record<string, string> = resumeFrom?.nodeOutputs
            ? { ...resumeFrom.nodeOutputs }
            : {};
        const executionOrder: string[] = resumeFrom?.executionOrder
            ? [...resumeFrom.executionOrder]
            : [];
        let lastActiveNodeId: string | undefined = resumeFrom?.lastActiveNodeId;
        let finalNodeId: string | undefined = resumeFrom?.finalNodeId;
        let finalOutput = resumeFrom?.resumeInput || '';
        let sessionMessages: ChatMessage[] = [];

        // Preflight validation (enabled by default)
        if (this.options.preflight !== false) {
            const validationContext: ValidationContext = {
                subflowRegistry: this.options.subflowRegistry,
                defaultModel: this.options.defaultModel,
                extensionRegistry,
            };

            const validation = validateWorkflow(
                workflow.nodes,
                workflow.edges,
                validationContext
            );

            if (!validation.isValid) {
                const errorMessages = validation.errors
                    .map(
                        (e) =>
                            `${e.code}: ${e.message}${
                                e.nodeId ? ` (node: ${e.nodeId})` : ''
                            }`
                    )
                    .join('; ');

                const validationError = createExecutionError(
                    new Error(`Workflow validation failed: ${errorMessages}`),
                    '',
                    '',
                    undefined,
                    1,
                    1,
                    []
                );

                callbacks.onNodeError('', validationError);

                const result = this.buildExecutionResult(
                    false,
                    '',
                    '',
                    undefined,
                    [],
                    undefined,
                    {},
                    sessionMessages,
                    startTime,
                    validationError
                );
                callbacks.onComplete?.(result as any);
                return result;
            }
        }

        try {
            const graph = this.buildGraph(workflow.nodes, workflow.edges);

            // Find start node
            const startNode = workflow.nodes.find((n) => n.type === 'start');
            if (!startNode) {
                throw new Error('No start node found in workflow');
            }

            // Initialize execution context
            const session = new ExecutionSession(this.options.sessionId);
            if (resumeFrom?.sessionMessages?.length) {
                session.messages.push(...resumeFrom.sessionMessages);
            } else {
                session.addMessage({ role: 'user', content: input.text });
            }

            const context: InternalExecutionContext = {
                input: input.text,
                currentInput:
                    resumeFrom?.resumeInput ||
                    (resumeFrom?.lastActiveNodeId
                        ? resumeFrom.nodeOutputs?.[resumeFrom.lastActiveNodeId]
                        : input.text),
                originalInput: input.text,
                attachments: input.attachments || [],
                outputs: { ...(resumeFrom?.nodeOutputs || {}) },
                nodeChain: resumeFrom?.executionOrder
                    ? [...resumeFrom.executionOrder]
                    : [],
                nodePath: this.options._subflowPath
                    ? [...this.options._subflowPath]
                    : [],
                signal: this.abortController.signal,
                session,
                memory: this.memory,
                workflowName: workflow.meta.name,
            };

            sessionMessages = context.session.messages;

            // BFS execution through the graph
            const rootNodeId = resumeFrom?.startNodeId ?? startNode.id;
            const queue: string[] = [rootNodeId];
            const executed = new Set<string>(
                resumeFrom ? Object.keys(resumeFrom.nodeOutputs || {}) : []
            );
            // Ensure the resume target is re-run
            if (resumeFrom) {
                executed.delete(rootNodeId);
            }
            const skipped = new Set<string>();
            // Per-node execution counter to prevent infinite loops
            const nodeExecutionCount = new Map<string, number>();
            const maxNodeExecutions = this.options.maxNodeExecutions ?? 100;
            // Use configured maxIterations or calculate from node count
            const maxIterations =
                this.options.maxIterations ??
                workflow.nodes.length * MAX_ITERATIONS_MULTIPLIER;
            let iterations = 0;

            // Helper to propagate skip status
            const propagateSkip = (nodeId: string): void => {
                if (executed.has(nodeId)) return;

                // Check if all parents are resolved (executed or skipped)
                const parentIds = graph.parents[nodeId];
                if (!parentIds || parentIds.length === 0) {
                    // No parents means this is unreachable from executed nodes
                    return;
                }

                const allParentsResolved = parentIds.every((p) =>
                    executed.has(p)
                );

                if (allParentsResolved) {
                    executed.add(nodeId);
                    skipped.add(nodeId);

                    // Propagate to children
                    const children = graph.children[nodeId];
                    if (children) {
                        for (const child of children) {
                            propagateSkip(child.nodeId);
                        }
                    }
                }
            };

            // DAG-level parallel execution: execute all ready nodes concurrently
            // A node is "ready" when all its parents have been executed
            while (queue.length > 0 && iterations < maxIterations) {
                iterations++;

                // Check for cancellation
                if (this.abortController?.signal.aborted) {
                    throw new Error('Workflow cancelled');
                }

                // Find all ready nodes (nodes whose parents are all executed)
                const readyNodes: string[] = [];
                const deferredNodes: string[] = [];
                const readySet = new Set<string>();
                const deferredSet = new Set<string>();

                for (const nodeId of queue) {
                    // Skip if already executed
                    if (executed.has(nodeId)) continue;

                    // Check if all parents are executed (except for start node)
                    const parentIds = graph.parents[nodeId];
                    const allParentsExecuted =
                        !parentIds ||
                        parentIds.length === 0 ||
                        parentIds.every((p) => executed.has(p));

                    if (allParentsExecuted || nodeId === rootNodeId) {
                        if (!readySet.has(nodeId)) {
                            readySet.add(nodeId);
                            readyNodes.push(nodeId);
                        }
                    } else if (!deferredSet.has(nodeId)) {
                        deferredSet.add(nodeId);
                        deferredNodes.push(nodeId);
                    }
                }

                // If no nodes are ready, we have a cycle or unreachable nodes
                if (readyNodes.length === 0) {
                    if (deferredNodes.length > 0) {
                        // Re-queue deferred nodes and continue (might become ready later)
                        queue.length = 0;
                        queue.push(...deferredNodes);
                        continue;
                    }
                    break; // No more nodes to execute
                }

                // Clear queue and add back deferred nodes
                queue.length = 0;
                queue.push(...deferredNodes);

                // Mark all ready nodes as executing (prevents re-queueing during concurrent execution)
                for (const nodeId of readyNodes) {
                    executed.add(nodeId);

                    // Track node execution count as circuit breaker
                    const execCount = (nodeExecutionCount.get(nodeId) || 0) + 1;
                    nodeExecutionCount.set(nodeId, execCount);

                    // Check if this node has been executed too many times (circuit breaker)
                    if (execCount > maxNodeExecutions) {
                        throw new Error(
                            `Node "${nodeId}" exceeded maximum executions (${maxNodeExecutions}). ` +
                                'This likely indicates an infinite loop. Check your workflow for cycles.'
                        );
                    }
                }

                // Execute all ready nodes concurrently
                const executeNode = async (
                    nodeId: string
                ): Promise<{
                    nodeId: string;
                    result: { output: string; nextNodes: string[] };
                }> => {
                    const result = await this.executeNodeWithErrorHandling(
                        nodeId,
                        context,
                        graph,
                        workflow.edges,
                        callbacks
                    );
                    return { nodeId, result };
                };

                const results = await Promise.all(readyNodes.map(executeNode));

                // Process results
                for (const { nodeId, result } of results) {
                    // Store output
                    nodeOutputs[nodeId] = result.output;
                    finalOutput = result.output;
                    finalNodeId = nodeId;
                    executionOrder.push(nodeId);
                    lastActiveNodeId = nodeId;

                    // Handle skipped nodes (children not in nextNodes) - except while loops which manage their own control flow
                    const currentNode = graph.nodeMap.get(nodeId);
                    if (currentNode?.type !== 'whileLoop') {
                        const allChildren = graph.children[nodeId];
                        if (allChildren) {
                            for (const child of allChildren) {
                                if (!result.nextNodes.includes(child.nodeId)) {
                                    propagateSkip(child.nodeId);
                                }
                            }
                        }
                    }

                    // Queue next nodes
                    for (const nextId of result.nextNodes) {
                        if (!executed.has(nextId) || nextId === nodeId) {
                            queue.push(nextId);
                        }
                    }

                    // Allow re-entry for loop nodes that intentionally re-queue themselves
                    if (result.nextNodes.includes(nodeId)) {
                        executed.delete(nodeId);
                    }
                }
            }

            if (iterations >= maxIterations) {
                throw new Error(
                    'Workflow execution exceeded maximum iterations - check for cycles'
                );
            }

            if (finalOutput) {
                const messages = context.session.messages;
                const lastMessage = messages[messages.length - 1];
                const shouldAddMessage =
                    !lastMessage ||
                    lastMessage.role !== 'assistant' ||
                    lastMessage.content !== finalOutput;

                if (shouldAddMessage) {
                    context.session.addMessage({
                        role: 'assistant',
                        content: finalOutput,
                    });
                }
            }

            const result = this.buildExecutionResult(
                true,
                finalOutput,
                finalOutput,
                finalNodeId,
                executionOrder,
                lastActiveNodeId,
                nodeOutputs,
                context.session.messages,
                startTime
            );
            callbacks.onComplete?.(result as any);
            return result;
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error));
            const result = this.buildExecutionResult(
                false,
                '',
                '',
                finalNodeId,
                executionOrder,
                lastActiveNodeId,
                nodeOutputs,
                sessionMessages,
                startTime,
                err
            );
            callbacks.onComplete?.(result as any);
            return result;
        } finally {
            this.running = false;
        }
    }

    /**
     * Build an execution result object with common fields.
     */
    private buildExecutionResult(
        success: boolean,
        output: string,
        finalOutput: string,
        finalNodeId: string | undefined,
        executionOrder: string[],
        lastActiveNodeId: string | undefined,
        nodeOutputs: Record<string, string>,
        sessionMessages: ChatMessage[],
        startTime: number,
        error?: Error
    ): ExecutionResult {
        const usage = this.getTokenUsageSummary();
        const tokenUsageDetails = this.tokenUsageEvents.map((entry) => ({
            nodeId: entry.nodeId,
            ...entry.usage,
        }));
        return {
            success,
            output,
            finalOutput,
            finalNodeId,
            executionOrder,
            lastActiveNodeId,
            nodeOutputs,
            sessionMessages: [...sessionMessages],
            error,
            duration: Date.now() - startTime,
            usage,
            tokenUsageDetails,
        };
    }

    /**
     * Stop the current execution.
     */
    stop(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.running = false;
        // Clear token usage events to prevent memory buildup
        this.tokenUsageEvents = [];
    }

    /**
     * Check if execution is currently running.
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Get model capabilities for a given model ID.
     */
    async getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        return this.provider.getModelCapabilities(modelId);
    }

    /**
     * Check if a model supports a specific input modality.
     *
     * @param modelId - The model identifier.
     * @param modality - The input modality to check ('text', 'image', 'audio', etc.).
     * @returns True if the model supports the modality.
     */
    async supportsModality(
        modelId: string,
        modality: InputModality
    ): Promise<boolean> {
        const capabilities = await this.getModelCapabilities(modelId);
        if (!capabilities) return modality === 'text'; // Default to text only
        return capabilities.inputModalities.includes(modality);
    }

    // ==========================================================================
    // Graph Building
    // ==========================================================================

    /**
     * Build a graph structure from nodes and edges for traversal.
     */
    private buildGraph(
        nodes: WorkflowNode[],
        edges: WorkflowEdge[]
    ): WorkflowGraph {
        const nodeMap = new Map<string, WorkflowNode>();
        const children: Record<
            string,
            Array<{ nodeId: string; handleId?: string }>
        > = {};
        const parents: Record<string, string[]> = {};

        // First pass: build node map and initialize edge arrays
        for (const node of nodes) {
            nodeMap.set(node.id, node);
            children[node.id] = [];
            parents[node.id] = [];
        }

        // Second pass: build edges (with validation)
        for (const edge of edges) {
            // Validate edge refers to existing nodes
            if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
                if (this.options.debug) {
                    console.warn(
                        `Skipping edge ${edge.id}: references non-existent node (source: ${edge.source}, target: ${edge.target})`
                    );
                }
                continue;
            }

            // These are guaranteed to exist after initialization loop
            children[edge.source].push({
                nodeId: edge.target,
                handleId: edge.sourceHandle || undefined,
            });
            // Only add parent if not already present (handles multiple edges from same source)
            if (!parents[edge.target].includes(edge.source)) {
                parents[edge.target].push(edge.source);
            }
        }

        return { nodeMap, children, parents };
    }

    // ==========================================================================
    // Node Execution
    // ==========================================================================

    /**
     * Execute a single node in the workflow.
     */
    private async executeNodeInternal(
        nodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[] }> {
        const node = graph.nodeMap.get(nodeId);
        if (!node) return { output: '', nextNodes: [] };
        const meta = {
            id: nodeId,
            label: getNodeLabel(node),
            type: node?.type,
            path: context.nodePath.length ? [...context.nodePath] : undefined,
        } satisfies Partial<NodeExecutionMetadata>;

        callbacks.onNodeStart(nodeId, meta);

        // Look up extension
        const extension = extensionRegistry.get(node.type);
        if (!extension) {
            throw new Error(`No extension found for node type: ${node.type}`);
        }

        if (!extension.execute) {
            throw new Error(
                `Extension for ${node.type} does not implement execute()`
            );
        }

        // Apply context compaction for nodes that use LLM with history
        let historyMessages = context.session.messages;
        if (
            OpenRouterExecutionAdapter.LLM_NODE_TYPES.has(node.type) &&
            this.options.compaction
        ) {
            const nodeData = node.data as unknown as Record<string, unknown>;
            const model =
                (typeof nodeData.model === 'string' ? nodeData.model : null) ||
                (typeof nodeData.conditionModel === 'string'
                    ? nodeData.conditionModel
                    : null) ||
                this.options.defaultModel ||
                DEFAULT_MODEL;
            const compactionResult = await this.compactHistoryIfNeeded(
                historyMessages,
                model,
                callbacks
            );
            historyMessages = compactionResult.messages;
            // Update session messages if compacted
            if (compactionResult.result?.compacted) {
                context.session.messages.length = 0;
                context.session.messages.push(...historyMessages);
            }
        }

        // Construct ExecutionContext for extension
        const executionContext: ExecutionContext = {
            input: context.currentInput,
            history: historyMessages,
            memory: this.memory,
            attachments: context.attachments,
            outputs: context.outputs,
            nodeChain: context.nodeChain,
            signal: context.signal,
            sessionId: context.session.id,
            customEvaluators: this.options.customEvaluators,
            debug: this.options.debug,
            defaultModel: this.options.defaultModel,
            subflowRegistry: this.options.subflowRegistry,
            subflowDepth: this.options._subflowDepth ?? 0,
            maxSubflowDepth: this.options.maxSubflowDepth ?? 10,
            tools: this.options.tools,
            maxToolIterations: this.options.maxToolIterations,
            onMaxToolIterations: this.options.onMaxToolIterations,
            onHITLRequest: this.options.onHITLRequest,
            workflowName: context.workflowName,
            tokenCounter: this.tokenCounter,
            compaction: this.options.compaction,
            onTokenUsage: (usage) => {
                if (callbacks.onTokenUsage) {
                    callbacks.onTokenUsage(nodeId, usage);
                }
                this.tokenUsageEvents.push({ nodeId, usage });
            },

            onToken: (token: string) => {
                callbacks.onToken(nodeId, token);
                const isLeaf = (graph.children[nodeId] || []).length === 0;
                if (isLeaf && callbacks.onWorkflowToken) {
                    callbacks.onWorkflowToken(token, {
                        nodeId,
                        nodeLabel: meta.label,
                        nodeType: meta.type,
                        isFinalNode: true,
                    });
                }
            },

            onReasoning: callbacks.onReasoning
                ? (token: string) => {
                      callbacks.onReasoning!(nodeId, token);
                  }
                : undefined,

            // Branch streaming callbacks for parallel nodes
            onBranchToken: callbacks.onBranchToken
                ? (branchId: string, branchLabel: string, token: string) => {
                      callbacks.onBranchToken!(
                          nodeId,
                          branchId,
                          branchLabel,
                          token
                      );
                  }
                : undefined,
            onBranchReasoning: callbacks.onBranchReasoning
                ? (branchId: string, branchLabel: string, token: string) => {
                      callbacks.onBranchReasoning!(
                          nodeId,
                          branchId,
                          branchLabel,
                          token
                      );
                  }
                : undefined,
            onBranchStart: callbacks.onBranchStart
                ? (branchId: string, branchLabel: string) => {
                      callbacks.onBranchStart!(
                          nodeId,
                          branchId,
                          branchLabel,
                          meta
                      );
                  }
                : undefined,
            onBranchComplete: callbacks.onBranchComplete
                ? (branchId: string, branchLabel: string, output: string) => {
                      callbacks.onBranchComplete!(
                          nodeId,
                          branchId,
                          branchLabel,
                          output,
                          meta
                      );
                  }
                : undefined,
            onLoopIteration: callbacks.onLoopIteration
                ? (iteration: number, maxIterations: number) => {
                      callbacks.onLoopIteration!(
                          nodeId,
                          iteration,
                          maxIterations,
                          meta
                      );
                  }
                : undefined,

            getNode: (id: string) => graph.nodeMap.get(id),

            getOutgoingEdges: (id: string, sourceHandle?: string) => {
                const outgoing = edges.filter((e) => e.source === id);
                if (sourceHandle) {
                    // If looking for a specific handle, match edges with that handle
                    // OR edges without a handle (which are considered default/output)
                    return outgoing.filter(
                        (e) =>
                            e.sourceHandle === sourceHandle || !e.sourceHandle
                    );
                }
                return outgoing;
            },

            onToolCall: this.options.onToolCall,
            onToolCallEvent: this.options.onToolCallEvent
                ? (event) => {
                      this.options.onToolCallEvent?.({
                          ...event,
                          nodeId,
                          nodeLabel: meta.label,
                          nodeType: meta.type,
                      });
                  }
                : undefined,

            executeSubgraph: async (
                startNodeId: string,
                input: string,
                options?: { nodeOverrides?: Record<string, any> }
            ) => {
                // Create isolated context for subgraph
                const subContext: InternalExecutionContext = {
                    ...context,
                    currentInput: input,
                    // inherit outputs/history/memory?
                    // Usually subgraphs share context but operate on new input.
                };

                // Handle node overrides for subgraph execution
                let subgraph = graph;
                if (options?.nodeOverrides) {
                    const modifiedNodeMap = new Map(graph.nodeMap);
                    for (const [id, overrides] of Object.entries(
                        options.nodeOverrides
                    )) {
                        const original = modifiedNodeMap.get(id);
                        if (original) {
                            modifiedNodeMap.set(id, {
                                ...original,
                                data: { ...original.data, ...overrides },
                            });
                        }
                    }
                    subgraph = { ...graph, nodeMap: modifiedNodeMap };
                }

                // Find the parent node that is calling executeSubgraph
                // We need to mark parent nodes as "executed" so their children can run
                // Start node is available via subgraph.nodeMap.get(startNodeId) if needed
                const preExecuted = new Set<string>();

                // Mark parent nodes of startNodeId as executed
                const parents = subgraph.parents[startNodeId] || [];
                for (const parentId of parents) {
                    preExecuted.add(parentId);
                }

                const result = await this.executeSubgraph(
                    startNodeId,
                    subContext,
                    subgraph,
                    edges,
                    callbacks,
                    preExecuted
                );
                return { output: result.output };
            },

            executeWorkflow: async (
                wf: WorkflowData,
                input: ExecutionInput,
                options?: Partial<ExecutionOptions>
            ) => {
                // Execute sub-workflow
                // We need to instantiate a new adapter or reuse current?
                // Reusing current is better to share state/cache/provider
                // But options might differ.
                // Creating a new adapter instance allows separate configuration.
                // But we want to share memory if configured.

                // For now, let's call `this.execute` recursively?
                // `this.execute` resets state (abortController, etc) which breaks parent execution if running on same instance!
                // `this.execute` calls `this.abortController = new AbortController()`.
                // So we MUST create a NEW adapter instance or refactor `execute` to not reset if it's a child.
                // Creating a new adapter is safer.

                // NOTE: provider is shared.
                // BUT provider in this class is LLMProvider. The constructor expects OpenRouter | LLMProvider.
                // So we can pass `this.provider`.

                const subflowPath = [...context.nodePath, nodeId];
                const subflowCallbacks = scopeExecutionCallbacks(
                    callbacks,
                    subflowPath
                );
                const baseOnToolCallEvent =
                    options?.onToolCallEvent ?? this.options.onToolCallEvent;
                const baseOnHITLRequest =
                    options?.onHITLRequest ?? this.options.onHITLRequest;

                const subAdapter = new OpenRouterExecutionAdapter(
                    this.provider,
                    {
                        ...this.options,
                        ...options,
                        // Pass subflow registry
                        subflowRegistry: this.options.subflowRegistry,
                        _subflowPath: subflowPath,
                        onToolCallEvent: baseOnToolCallEvent
                            ? (event) => {
                                  baseOnToolCallEvent({
                                      ...event,
                                      nodeId: scopeNodeId(
                                          event.nodeId,
                                          subflowPath
                                      ),
                                  });
                              }
                            : undefined,
                        onHITLRequest: baseOnHITLRequest
                            ? (request) => {
                                  return baseOnHITLRequest({
                                      ...request,
                                      nodeId: scopeNodeId(
                                          request.nodeId,
                                          subflowPath
                                      ),
                                  });
                              }
                            : undefined,
                    }
                );

                return subAdapter.execute(wf, input, subflowCallbacks);
            },
        };

        const result = await extension.execute(
            executionContext,
            node,
            this.provider
        );

        // Handle metadata/side-effects
        if (result.metadata?.selectedRoute) {
            if (callbacks.onRouteSelected) {
                callbacks.onRouteSelected(
                    nodeId,
                    result.metadata.selectedRoute,
                    meta
                );
            }
        }

        // Store branch outputs with composite keys for Parallel Split nodes
        // This allows Output nodes to reference individual branches via "parallelNodeId:branchId"
        if (result.metadata?.branchOutputs) {
            const branchOutputs = result.metadata.branchOutputs as Record<
                string,
                string
            >;
            for (const [branchId, branchOutput] of Object.entries(
                branchOutputs
            )) {
                context.outputs[`${nodeId}:${branchId}`] = branchOutput;
            }
        }

        // Update context
        context.outputs[nodeId] = result.output;
        if (!context.nodeChain.includes(nodeId)) {
            context.nodeChain.push(nodeId);
        }
        context.currentInput = result.output;

        // Add assistant message for certain node types?
        // AgentNode logic was: "context.session.addMessage({ role: 'assistant', content: output });"
        // Should we move this to extension or keep it here?
        // Ideally extension manages history?
        // But `session` is internal.
        // If `node.type === 'agent'`, add message?
        if (node.type === 'agent') {
            context.session.addMessage({
                role: 'assistant',
                content: result.output,
            });
        }

        callbacks.onNodeFinish(nodeId, result.output, meta);
        return { output: result.output, nextNodes: result.nextNodes };
    }
    private getTokenUsageSummary(): TokenUsage | undefined {
        if (this.tokenUsageEvents.length === 0) {
            return undefined;
        }

        let promptTokens = 0;
        let completionTokens = 0;

        for (const entry of this.tokenUsageEvents) {
            promptTokens += entry.usage.promptTokens;
            completionTokens += entry.usage.completionTokens;
        }

        return {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
        };
    }

    /**
     * Execute a node with retry/error-handling semantics and HITL support.
     */
    private async executeNodeWithErrorHandling(
        nodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[] }> {
        const node = graph.nodeMap.get(nodeId);
        if (!node) {
            // Early return for missing node
            return { output: '', nextNodes: [] };
        }

        const nodeLabel = getNodeLabel(node);
        const meta = {
            id: nodeId,
            label: nodeLabel,
            type: node.type,
            path: context.nodePath.length ? [...context.nodePath] : undefined,
        } satisfies Partial<NodeExecutionMetadata>;

        const nodeData = node.data as unknown as Record<string, unknown>;
        const errorConfig = nodeData?.errorHandling as
            | NodeErrorConfig
            | undefined;
        const retryConfig = errorConfig?.retry;
        const resolvedRetry: NodeRetryConfig | undefined =
            retryConfig ??
            (this.options.maxRetries !== undefined
                ? {
                      maxRetries: this.options.maxRetries,
                      baseDelay:
                          this.options.retryDelayMs || DEFAULT_RETRY_DELAY_MS,
                  }
                : undefined);
        const errorEdge = edges.find(
            (e) => e.source === nodeId && e.sourceHandle === 'error'
        );

        // Check if this node type supports HITL
        const hitlConfig = nodeData?.hitl as HITLConfig | undefined;
        const supportsHITL =
            OpenRouterExecutionAdapter.HITL_SUPPORTED_TYPES.has(node.type);
        const shouldUseHITL =
            supportsHITL && hitlConfig?.enabled && this.options.onHITLRequest;

        let lastError: ExecutionError | null = null;
        const retryHistory: Array<{
            attempt: number;
            error: string;
            timestamp: string;
        }> = [];
        const maxAttempts = (resolvedRetry?.maxRetries ?? 0) + 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Use HITL wrapper for supported nodes with HITL enabled
                if (shouldUseHITL) {
                    return await this.executeWithHITL(
                        node,
                        context,
                        graph,
                        edges,
                        callbacks
                    );
                }
                return await this.executeNodeInternal(
                    nodeId,
                    context,
                    graph,
                    edges,
                    callbacks
                );
            } catch (error) {
                const execError = createExecutionError(
                    error,
                    nodeId,
                    node.type,
                    nodeLabel,
                    attempt,
                    maxAttempts,
                    retryHistory
                );
                lastError = execError;

                const shouldRetry =
                    attempt < maxAttempts &&
                    this.shouldRetry(execError, resolvedRetry);
                if (shouldRetry) {
                    // Use suggested delay (respects retry-after header)
                    const delay = execError.getSuggestedDelay(
                        resolvedRetry?.baseDelay || DEFAULT_RETRY_DELAY_MS,
                        attempt,
                        resolvedRetry?.maxDelay || 30000
                    );
                    await this.sleep(delay);
                    retryHistory.push({
                        attempt,
                        error: execError.message,
                        timestamp: new Date().toISOString(),
                    });
                    continue;
                }

                const mode = errorConfig?.mode || 'stop';

                if (mode === 'branch' && errorEdge) {
                    context.outputs[`${nodeId}_error`] =
                        this.serializeError(execError);
                    callbacks.onNodeError(nodeId, execError, meta);
                    return {
                        output: '',
                        nextNodes: [errorEdge.target],
                    };
                }

                if (mode === 'continue') {
                    callbacks.onNodeError(nodeId, execError, meta);
                    return {
                        output: '',
                        nextNodes: this.getChildNodes(nodeId, edges),
                    };
                }

                callbacks.onNodeError(nodeId, execError, meta);
                throw execError;
            }
        }

        // This should never be reached due to throw in loop above
        if (!lastError) {
            throw new Error('Unexpected: No error captured in retry loop');
        }
        throw lastError;
    }

    // ==========================================================================
    // Human-in-the-Loop (HITL)
    // ==========================================================================

    /**
     * Execute a node with HITL (Human-in-the-Loop) support.
     * Wraps executeNodeInternal with approval/input/review modes.
     */
    private async executeWithHITL(
        node: WorkflowNode,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[] }> {
        const nodeData = node.data as unknown as Record<string, unknown>;
        const hitlConfig = nodeData.hitl as HITLConfig | undefined;
        const nodeLabel = getNodeLabel(node);
        const meta = {
            id: node.id,
            label: nodeLabel,
            type: node.type,
            path: context.nodePath.length ? [...context.nodePath] : undefined,
        } satisfies Partial<NodeExecutionMetadata>;

        // No HITL configured or disabled, or no callback provided
        if (!hitlConfig?.enabled || !this.options.onHITLRequest) {
            return this.executeNodeInternal(
                node.id,
                context,
                graph,
                edges,
                callbacks
            );
        }

        const workflowName = context.session.id || 'Workflow';
        const childEdges = graph.children[node.id];

        // Get only default output handles (exclude error/rejected for skip routing)
        const defaultChildNodeIds = childEdges
            ? childEdges
                  .filter(
                      (c) =>
                          !c.handleId ||
                          (c.handleId !== 'error' && c.handleId !== 'rejected')
                  )
                  .map((c) => c.nodeId)
            : [];

        // Helper to handle reject action
        const handleReject = (): { output: string; nextNodes: string[] } => {
            const rejectEdge = edges.find(
                (e) => e.source === node.id && e.sourceHandle === 'rejected'
            );
            if (rejectEdge) {
                callbacks.onNodeFinish(node.id, 'HITL: Rejected', meta);
                return { output: '', nextNodes: [rejectEdge.target] };
            }
            throw new Error('HITL: Request rejected');
        };

        // Helper to handle skip action - only routes through default output handles
        const handleSkip = (): { output: string; nextNodes: string[] } => {
            callbacks.onNodeFinish(node.id, 'HITL: Skipped', meta);
            return {
                output: context.currentInput,
                nextNodes: defaultChildNodeIds,
            };
        };

        // Helper to update context with response data
        const updateContextWithData = (data: unknown): void => {
            if (data) {
                context.currentInput =
                    typeof data === 'string' ? data : JSON.stringify(data);
            }
        };

        switch (hitlConfig.mode) {
            case 'approval': {
                // Pause BEFORE execution for approval
                const request = this.createHITLRequest(
                    node,
                    hitlConfig,
                    context,
                    workflowName,
                    undefined
                );
                const response = await this.waitForHITL(request, hitlConfig);

                if (response.action === 'reject') {
                    return handleReject();
                }

                if (response.action === 'skip') {
                    return handleSkip();
                }

                // Approved - execute with possibly modified input
                updateContextWithData(response.data);
                return this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );
            }

            case 'input': {
                // Pause to collect human input
                const request = this.createHITLRequest(
                    node,
                    hitlConfig,
                    context,
                    workflowName,
                    undefined
                );
                const response = await this.waitForHITL(request, hitlConfig);

                if (response.action === 'skip') {
                    return handleSkip();
                }

                if (response.action === 'reject') {
                    return handleReject();
                }

                // Use human input as node input
                updateContextWithData(response.data);

                return this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );
            }

            case 'review': {
                // Execute first, then pause for review
                const result = await this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );

                const request = this.createHITLRequest(
                    node,
                    hitlConfig,
                    context,
                    workflowName,
                    result.output
                );
                const response = await this.waitForHITL(request, hitlConfig);

                if (response.action === 'reject') {
                    // Route to rejection branch or re-execute
                    const rejectEdge = edges.find(
                        (e) =>
                            e.source === node.id &&
                            e.sourceHandle === 'rejected'
                    );
                    if (rejectEdge) {
                        return {
                            output: result.output,
                            nextNodes: [rejectEdge.target],
                        };
                    }
                    // Re-execute if no rejection branch
                    return this.executeNodeInternal(
                        node.id,
                        context,
                        graph,
                        edges,
                        callbacks
                    );
                }

                if (response.action === 'modify' && response.data) {
                    // Use modified output
                    const modifiedOutput =
                        typeof response.data === 'string'
                            ? response.data
                            : JSON.stringify(response.data);
                    context.outputs[node.id] = modifiedOutput;
                    context.currentInput = modifiedOutput;
                    return {
                        output: modifiedOutput,
                        nextNodes: result.nextNodes,
                    };
                }

                return result;
            }

            default:
                return this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );
        }
    }

    /**
     * Create a HITL request object.
     */
    private createHITLRequest(
        node: WorkflowNode,
        config: HITLConfig,
        context: InternalExecutionContext,
        workflowName: string,
        output?: string
    ): HITLRequest {
        const now = new Date();
        const nodeData = node.data as unknown as Record<string, unknown>;
        const nodeLabel =
            typeof nodeData.label === 'string' ? nodeData.label : node.id;

        const request: HITLRequest = {
            id: generateHITLRequestId(),
            nodeId: node.id,
            nodeLabel,
            mode: config.mode,
            prompt:
                config.prompt ||
                this.getDefaultHITLPrompt(config.mode, nodeLabel),
            context: {
                input: context.currentInput,
                output,
                workflowName,
                sessionId: context.session.id,
            },
            options:
                config.options ||
                (config.mode === 'approval'
                    ? getDefaultApprovalOptions()
                    : undefined),
            inputSchema: config.inputSchema,
            createdAt: now.toISOString(),
        };

        if (config.timeout && config.timeout > 0) {
            request.expiresAt = new Date(
                now.getTime() + config.timeout
            ).toISOString();
        }

        return request;
    }

    /**
     * Get default prompt based on HITL mode.
     */
    private getDefaultHITLPrompt(
        mode: HITLConfig['mode'],
        nodeLabel?: string
    ): string {
        const label = nodeLabel || 'this node';
        switch (mode) {
            case 'approval':
                return `Review and approve the input for "${label}" before proceeding.`;
            case 'input':
                return `Provide input for "${label}".`;
            case 'review':
                return `Review the output from "${label}" before continuing.`;
        }
    }

    /**
     * Wait for HITL response with optional timeout.
     * Respects abort signal to cancel waiting when execution is stopped.
     * Uses timestamp-based timeout to handle system sleep correctly.
     */
    private async waitForHITL(
        request: HITLRequest,
        config: HITLConfig
    ): Promise<HITLResponse> {
        if (!this.options.onHITLRequest) {
            throw new Error(
                'HITL requested but no onHITLRequest callback configured'
            );
        }

        const signal = this.abortController?.signal;

        // Check if already aborted
        if (signal?.aborted) {
            throw new Error('Workflow cancelled');
        }

        // Create abort promise that rejects when execution is cancelled
        const abortPromise = new Promise<HITLResponse>((_, reject) => {
            if (!signal) {
                // If no signal, this promise never resolves (effectively infinite wait)
                return;
            }
            const abortHandler = () => reject(new Error('Workflow cancelled'));
            signal.addEventListener('abort', abortHandler, { once: true });
        });

        const callbackPromise = this.options.onHITLRequest(request);

        const promises: Promise<HITLResponse>[] = [
            callbackPromise,
            abortPromise,
        ];

        // Timestamp-based timeout handling (robust to system sleep)
        let timeoutCheckInterval: ReturnType<typeof setInterval> | undefined;
        if (config.timeout && config.timeout > 0 && request.expiresAt) {
            const expiresAtMs = new Date(request.expiresAt).getTime();
            const timeoutPromise = new Promise<HITLResponse>((resolve) => {
                // Check expiry every second using performant Date.now()
                timeoutCheckInterval = setInterval(() => {
                    if (Date.now() >= expiresAtMs) {
                        clearInterval(timeoutCheckInterval);
                        const defaultAction = config.defaultAction || 'reject';
                        resolve({
                            requestId: request.id,
                            action:
                                defaultAction === 'approve'
                                    ? 'approve'
                                    : defaultAction === 'skip'
                                    ? 'skip'
                                    : 'reject',
                            respondedAt: new Date().toISOString(),
                        });
                    }
                }, 1000); // Check every second
            });
            promises.push(timeoutPromise);
        }

        try {
            return await Promise.race(promises);
        } finally {
            // Cleanup timeout interval
            if (timeoutCheckInterval) {
                clearInterval(timeoutCheckInterval);
            }
            // Note: abort event listener is automatically cleaned up due to { once: true }
        }
    }

    /**
     * Execute a subgraph starting from a node ID, returning the last output.
     */
    private async executeSubgraph(
        startNodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks,
        preExecuted: Set<string> = new Set()
    ): Promise<{ output: string; nextNodes: string[] }> {
        const queue: string[] = [startNodeId];
        const executed = new Set<string>(preExecuted);
        let output = '';
        let nextNodes: string[] = [];
        let iterations = 0;
        const maxIterations =
            this.options.maxIterations ??
            graph.nodeMap.size * MAX_ITERATIONS_MULTIPLIER;

        while (queue.length > 0 && iterations < maxIterations) {
            iterations++;
            const currentId = queue.shift()!;

            // Check for cancellation
            if (this.abortController?.signal.aborted) {
                throw new Error('Workflow cancelled');
            }

            if (executed.has(currentId)) continue;

            const parents = graph.parents[currentId];
            const allParentsExecuted =
                !parents || parents.every((p) => executed.has(p));
            if (!allParentsExecuted) {
                queue.push(currentId);
                continue;
            }

            const result = await this.executeNodeWithErrorHandling(
                currentId,
                context,
                graph,
                edges,
                callbacks
            );

            executed.add(currentId);
            output = result.output;
            nextNodes = result.nextNodes;

            for (const nextId of result.nextNodes) {
                if (!executed.has(nextId)) {
                    queue.push(nextId);
                }
            }

            if (result.nextNodes.length === 0) {
                break;
            }
        }

        if (iterations >= maxIterations) {
            throw new Error(
                `Subgraph execution exceeded maximum iterations (${maxIterations})`
            );
        }

        return { output, nextNodes };
    }

    // ==========================================================================
    // Retry Logic
    // ==========================================================================

    private shouldRetry(
        error: ExecutionError,
        config?: NodeRetryConfig
    ): boolean {
        if (!config) return false;

        // Use error's built-in retryable check with configured skipOn
        const skipOn = config.skipOn ?? DEFAULT_SKIP_ON_RETRY;
        if (!error.isRetryable(skipOn as import('./errors').ErrorCode[])) {
            return false;
        }

        // If retryOn is specified, only retry on those codes
        if (
            config.retryOn &&
            config.retryOn.length > 0 &&
            !config.retryOn.includes(error.code)
        ) {
            return false;
        }

        return true;
    }

    private async sleep(ms: number): Promise<void> {
        const signal = this.abortController?.signal;

        if (signal?.aborted) {
            throw new Error('Workflow cancelled');
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                resolve();
            }, ms);

            // Only add listener if signal exists
            if (signal) {
                const onAbort = () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Workflow cancelled'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
            }
        });
    }

    private getChildNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
        return edges
            .filter((e) => e.source === nodeId && e.sourceHandle !== 'error')
            .map((e) => e.target);
    }

    private serializeError(error: ExecutionError): string {
        const plain = {
            message: error.message,
            code: error.code,
            nodeId: error.nodeId,
            statusCode: error.statusCode,
            retry: error.retry,
            rateLimit: error.rateLimit,
            stack: error.stack,
        };
        try {
            return JSON.stringify(plain);
        } catch {
            return JSON.stringify({ message: error.message, code: error.code });
        }
    }

    /**
     * Compact conversation history if needed based on compaction configuration.
     * Returns the compacted messages and result if compaction was performed.
     */
    private async compactHistoryIfNeeded(
        messages: ChatMessage[],
        model: string,
        callbacks?: ExecutionCallbacks
    ): Promise<{ messages: ChatMessage[]; result?: CompactionResult }> {
        const config = this.options.compaction;
        if (!config) {
            return { messages };
        }

        // Early return for empty or single message
        if (messages.length <= 1) {
            return { messages };
        }

        const threshold = calculateThreshold(config, model, this.tokenCounter);
        const currentTokens = countMessageTokens(messages, this.tokenCounter);

        // No compaction needed if under threshold
        if (currentTokens <= threshold) {
            return { messages };
        }

        const { toPreserve, toCompact } = splitMessagesForCompaction(
            messages,
            config.preserveRecent
        );

        // No messages to compact
        if (toCompact.length === 0) {
            return { messages };
        }

        let compactedMessages: ChatMessage[];
        let summary: string | undefined;

        if (config.strategy === 'truncate') {
            // Simply drop older messages
            compactedMessages = toPreserve;
        } else if (config.strategy === 'custom' && config.customCompactor) {
            // Use custom compactor
            try {
                compactedMessages = await config.customCompactor(
                    messages,
                    threshold
                );
            } catch (error) {
                // Fallback to truncate on custom compactor error
                if (this.options.debug) {
                    console.error(
                        'Custom compactor failed, falling back to truncate:',
                        error
                    );
                }
                compactedMessages = toPreserve;
            }
        } else {
            // Default: summarize strategy
            const summarizeModel = config.summarizeModel || model;
            const prompt = buildSummarizationPrompt(toCompact, config);

            try {
                const summarizationResult = await this.provider.chat(
                    summarizeModel,
                    [
                        {
                            role: 'system',
                            content:
                                'You are a helpful assistant that summarizes conversation history concisely.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    { temperature: 0.3, maxTokens: 500 }
                );

                summary = summarizationResult.content || '';
                const summaryMessage = createSummaryMessage(summary);
                compactedMessages = [summaryMessage, ...toPreserve];
            } catch (error) {
                // Fallback to truncate on summarization error
                if (this.options.debug) {
                    console.error(
                        'Summarization failed, falling back to truncate:',
                        error
                    );
                }
                compactedMessages = toPreserve;
            }
        }

        const tokensAfter = countMessageTokens(
            compactedMessages,
            this.tokenCounter
        );

        const result: CompactionResult = {
            compacted: true,
            messages: compactedMessages,
            tokensBefore: currentTokens,
            tokensAfter,
            messagesCompacted: toCompact.length,
            summary,
        };

        // Invoke callback if provided
        if (callbacks?.onContextCompacted) {
            callbacks.onContextCompacted(result);
        }

        return { messages: compactedMessages, result };
    }
}
