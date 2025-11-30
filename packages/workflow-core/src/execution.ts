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
} from './types';
import {
    AgentNodeExtension,
    RouterNodeExtension,
    ParallelNodeExtension,
    ToolNodeExtension,
    MemoryNodeExtension,
    WhileLoopExtension,
    SubflowExtension,
    OutputNodeExtension,
    StartNodeExtension,
} from './extensions';
import { OpenRouterLLMProvider } from './providers/OpenRouterLLMProvider';
import { InMemoryAdapter, type MemoryAdapter } from './memory';
import { ExecutionSession, type Session } from './session';
import {
    classifyError,
    wrapError as wrapExecutionError,
    type ExecutionError,
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

// ============================================================================
// Constants
// ============================================================================

/** Default model used when no model is specified */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** Maximum retry attempts for API calls */
const DEFAULT_MAX_RETRIES = 2;

/** Base delay in milliseconds between retry attempts */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Maximum iterations multiplier to prevent infinite loops */
const MAX_ITERATIONS_MULTIPLIER = 3;

// ============================================================================
// Types
// ============================================================================

/** Graph structure for workflow traversal */
interface WorkflowGraph {
    nodeMap: Map<string, WorkflowNode>;
    children: Record<string, Array<{ nodeId: string; handleId?: string }>>;
    parents: Record<string, string[]>;
}

/** Internal execution state */
interface InternalExecutionContext {
    input: string;
    currentInput: string;
    originalInput: string;
    attachments: Attachment[];
    outputs: Record<string, string>;
    nodeChain: string[];
    signal: AbortSignal;
    session: Session;
    memory: MemoryAdapter;
    workflowName: string;
}

// ============================================================================
// Extension Registry
// ============================================================================

const extensionRegistry = new Map<string, NodeExtension>([
    ['agent', AgentNodeExtension],
    ['router', RouterNodeExtension],
    ['parallel', ParallelNodeExtension],
    ['tool', ToolNodeExtension],
    ['memory', MemoryNodeExtension],
    ['whileLoop', WhileLoopExtension],
    ['subflow', SubflowExtension],
    ['output', OutputNodeExtension],
    ['start', StartNodeExtension],
    ['condition', RouterNodeExtension], // Legacy alias
]);

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

    private isLLMProvider(obj: any): obj is LLMProvider {
        return 'chat' in obj && typeof obj.chat === 'function';
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

        const startTime = Date.now();
        const nodeOutputs: Record<string, string> = {};

        try {
            const graph = this.buildGraph(workflow.nodes, workflow.edges);

            // Find start node
            const startNode = workflow.nodes.find((n) => n.type === 'start');
            if (!startNode) {
                throw new Error('No start node found in workflow');
            }

            // Initialize execution context
            const session = new ExecutionSession(this.options.sessionId);
            session.addMessage({ role: 'user', content: input.text });

            const context: InternalExecutionContext = {
                input: input.text,
                currentInput: input.text,
                originalInput: input.text,
                attachments: input.attachments || [],
                outputs: {},
                nodeChain: [],
                signal: this.abortController.signal,
                session,
                memory: this.memory,
                workflowName: workflow.meta.name,
            };

            // BFS execution through the graph
            const queue: string[] = [startNode.id];
            const executed = new Set<string>();
            const skipped = new Set<string>();
            // Use configured maxIterations or calculate from node count
            const maxIterations =
                this.options.maxIterations ??
                workflow.nodes.length * MAX_ITERATIONS_MULTIPLIER;
            let iterations = 0;
            let finalOutput = '';

            // Helper to propagate skip status
            const propagateSkip = (nodeId: string) => {
                if (executed.has(nodeId)) return;

                // Check if all parents are resolved (executed or skipped)
                const parentIds = graph.parents[nodeId] || [];
                const allParentsResolved = parentIds.every((p) =>
                    executed.has(p)
                );

                if (allParentsResolved) {
                    executed.add(nodeId);
                    skipped.add(nodeId);

                    // Propagate to children
                    const children = graph.children[nodeId] || [];
                    for (const child of children) {
                        propagateSkip(child.nodeId);
                    }
                }
            };

            while (queue.length > 0 && iterations < maxIterations) {
                iterations++;
                const currentId = queue.shift()!;

                // Check for cancellation
                if (this.abortController.signal.aborted) {
                    throw new Error('Workflow cancelled');
                }

                // Skip if already executed
                if (executed.has(currentId)) continue;

                // Check if all parents are executed (except for start node)
                const parentIds = graph.parents[currentId] || [];
                const allParentsExecuted = parentIds.every((p) =>
                    executed.has(p)
                );

                if (!allParentsExecuted && currentId !== startNode.id) {
                    // If not all parents executed, check if we should wait or if we are stuck
                    // But since we only add to queue when parents complete, this case implies
                    // we were added by one parent but another is still pending.
                    // We should re-queue and wait.
                    queue.push(currentId);
                    continue;
                }

                executed.add(currentId);

                // Execute the node
                const result = await this.executeNodeWithErrorHandling(
                    currentId,
                    context,
                    graph,
                    workflow.edges,
                    callbacks
                );

                // Store output
                nodeOutputs[currentId] = result.output;
                finalOutput = result.output;

                // Handle skipped nodes (children not in nextNodes) - except while loops which manage their own control flow
                const currentNode = graph.nodeMap.get(currentId);
                if (currentNode?.type !== 'whileLoop') {
                    const allChildren = graph.children[currentId] || [];
                    for (const child of allChildren) {
                        if (!result.nextNodes.includes(child.nodeId)) {
                            propagateSkip(child.nodeId);
                        }
                    }
                }

                // Queue next nodes
                for (const nextId of result.nextNodes) {
                    if (!executed.has(nextId) || nextId === currentId) {
                        queue.push(nextId);
                    }
                }

                // Allow re-entry for loop nodes that intentionally re-queue themselves
                if (result.nextNodes.includes(currentId)) {
                    executed.delete(currentId);
                }

                // Also check children of skipped nodes - they might be ready now if they have multiple parents
                // (e.g. merge node where one parent was skipped and one just finished)
                // Actually, propagateSkip handles the recursive skipping.
                // But if a merge node has one skipped parent and one active parent (nextId),
                // nextId is added to queue. When nextId runs, it will add merge node to queue.
                // When merge node runs, it checks allParentsExecuted.
                // Since skipped parent is in executed set, it passes.
                // So we just need to ensure that if a node was WAITING in the queue (re-queued),
                // and its other parent just got skipped, it should be processed.
                // But we don't keep waiting nodes in a separate list, we re-push to queue.
                // So it will be checked again.
            }

            if (iterations >= maxIterations) {
                throw new Error(
                    'Workflow execution exceeded maximum iterations - check for cycles'
                );
            }

            if (finalOutput) {
                const lastMessage =
                    context.session.messages[
                        context.session.messages.length - 1
                    ];
                if (
                    !(
                        lastMessage &&
                        lastMessage.role === 'assistant' &&
                        lastMessage.content === finalOutput
                    )
                ) {
                    context.session.addMessage({
                        role: 'assistant',
                        content: finalOutput,
                    });
                }
            }

            return {
                success: true,
                output: finalOutput,
                nodeOutputs,
                duration: Date.now() - startTime,
                usage: this.getTokenUsageSummary(),
                tokenUsageDetails: this.tokenUsageEvents.map((entry) => ({
                    nodeId: entry.nodeId,
                    ...entry.usage,
                })),
            };
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error));
            return {
                success: false,
                output: '',
                nodeOutputs,
                error: err,
                duration: Date.now() - startTime,
                usage: this.getTokenUsageSummary(),
                tokenUsageDetails: this.tokenUsageEvents.map((entry) => ({
                    nodeId: entry.nodeId,
                    ...entry.usage,
                })),
            };
        } finally {
            this.running = false;
        }
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

        for (const node of nodes) {
            nodeMap.set(node.id, node);
            children[node.id] = [];
            parents[node.id] = [];
        }

        for (const edge of edges) {
            children[edge.source]?.push({
                nodeId: edge.target,
                handleId: edge.sourceHandle || undefined,
            });
            parents[edge.target]?.push(edge.source);
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

        callbacks.onNodeStart(nodeId);

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
        const llmNodeTypes = ['agent', 'router', 'whileLoop'];
        if (llmNodeTypes.includes(node.type) && this.options.compaction) {
            const nodeData = node.data as unknown as Record<string, unknown>;
            const model =
                (nodeData.model as string) ||
                (nodeData.conditionModel as string) ||
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
            },

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
            onBranchStart: callbacks.onBranchStart
                ? (branchId: string, branchLabel: string) => {
                      callbacks.onBranchStart!(nodeId, branchId, branchLabel);
                  }
                : undefined,
            onBranchComplete: callbacks.onBranchComplete
                ? (branchId: string, branchLabel: string, output: string) => {
                      callbacks.onBranchComplete!(
                          nodeId,
                          branchId,
                          branchLabel,
                          output
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

                const subAdapter = new OpenRouterExecutionAdapter(
                    this.provider,
                    {
                        ...this.options,
                        ...options,
                        // Pass subflow registry
                        subflowRegistry: this.options.subflowRegistry,
                    }
                );

                return subAdapter.execute(wf, input, callbacks); // Use same callbacks?
                // SubflowExtension wraps callbacks to namespace them.
                // But `execute` signature takes `callbacks`.
                // So yes, passing callbacks is correct.
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
                    result.metadata.selectedRoute
                );
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

        callbacks.onNodeFinish(nodeId, result.output);
        return { output: result.output, nextNodes: result.nextNodes };
    }
    private getTokenUsageSummary(): TokenUsage | undefined {
        if (this.tokenUsageEvents.length === 0) {
            return undefined;
        }

        const promptTokens = this.tokenUsageEvents.reduce(
            (sum, entry) => sum + entry.usage.promptTokens,
            0
        );
        const completionTokens = this.tokenUsageEvents.reduce(
            (sum, entry) => sum + entry.usage.completionTokens,
            0
        );

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
        if (!node) return { output: '', nextNodes: [] };

        const errorConfig = (node.data as any)?.errorHandling as
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
        const hitlConfig = (node.data as any)?.hitl as HITLConfig | undefined;
        const supportsHITL = ['agent', 'router', 'tool'].includes(node.type);
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
                const execError = wrapExecutionError(
                    error,
                    nodeId,
                    attempt,
                    maxAttempts,
                    retryHistory
                );
                execError.code = classifyError(error);
                execError.retry = {
                    attempts: attempt,
                    maxAttempts,
                    history: [
                        ...retryHistory,
                        {
                            attempt,
                            error: execError.message,
                            timestamp: new Date().toISOString(),
                        },
                    ],
                };
                lastError = execError;

                const shouldRetry =
                    attempt < maxAttempts &&
                    this.shouldRetry(execError, resolvedRetry);
                if (shouldRetry) {
                    const delay = Math.min(
                        (resolvedRetry?.baseDelay || DEFAULT_RETRY_DELAY_MS) *
                            Math.pow(2, attempt - 1),
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
                    callbacks.onNodeError(nodeId, execError);
                    return {
                        output: '',
                        nextNodes: [errorEdge.target],
                    };
                }

                if (mode === 'continue') {
                    callbacks.onNodeError(nodeId, execError);
                    return {
                        output: '',
                        nextNodes: this.getChildNodes(nodeId, edges),
                    };
                }

                callbacks.onNodeError(nodeId, execError);
                throw execError;
            }
        }

        throw lastError!;
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
        const hitlConfig = (node.data as any).hitl as HITLConfig | undefined;

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
        const childEdges = graph.children[node.id] || [];

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
                    // Find rejection branch or stop
                    const rejectEdge = edges.find(
                        (e) =>
                            e.source === node.id &&
                            e.sourceHandle === 'rejected'
                    );
                    if (rejectEdge) {
                        callbacks.onNodeFinish(node.id, 'HITL: Rejected');
                        return { output: '', nextNodes: [rejectEdge.target] };
                    }
                    throw new Error('HITL: Request rejected');
                }

                if (response.action === 'skip') {
                    callbacks.onNodeFinish(node.id, 'HITL: Skipped');
                    return {
                        output: context.currentInput,
                        nextNodes: childEdges.map((c) => c.nodeId),
                    };
                }

                // Approved - execute with possibly modified input
                if (response.data) {
                    context.currentInput =
                        typeof response.data === 'string'
                            ? response.data
                            : JSON.stringify(response.data);
                }
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
                    callbacks.onNodeFinish(node.id, 'HITL: Skipped');
                    return {
                        output: context.currentInput,
                        nextNodes: childEdges.map((c) => c.nodeId),
                    };
                }

                if (response.action === 'reject') {
                    const rejectEdge = edges.find(
                        (e) =>
                            e.source === node.id &&
                            e.sourceHandle === 'rejected'
                    );
                    if (rejectEdge) {
                        callbacks.onNodeFinish(node.id, 'HITL: Rejected');
                        return { output: '', nextNodes: [rejectEdge.target] };
                    }
                    throw new Error('HITL: Request rejected');
                }

                // Use human input as node input
                if (response.data) {
                    context.currentInput =
                        typeof response.data === 'string'
                            ? response.data
                            : JSON.stringify(response.data);
                }

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

        const request: HITLRequest = {
            id: generateHITLRequestId(),
            nodeId: node.id,
            nodeLabel: (node.data as any).label || node.id,
            mode: config.mode,
            prompt:
                config.prompt ||
                this.getDefaultHITLPrompt(
                    config.mode,
                    (node.data as any).label
                ),
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

        // Create abort promise that rejects when execution is cancelled
        let abortHandler: (() => void) | undefined;
        const abortPromise = new Promise<HITLResponse>((_, reject) => {
            const signal = this.abortController?.signal;
            if (signal?.aborted) {
                reject(new Error('Workflow cancelled'));
                return;
            }
            abortHandler = () => reject(new Error('Workflow cancelled'));
            signal?.addEventListener('abort', abortHandler, { once: true });
        });

        const promises: Promise<HITLResponse>[] = [
            this.options.onHITLRequest(request),
            abortPromise,
        ];

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        if (config.timeout && config.timeout > 0) {
            const timeoutPromise = new Promise<HITLResponse>((resolve) => {
                timeoutId = setTimeout(() => {
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
                }, config.timeout);
            });
            promises.push(timeoutPromise);
        }

        try {
            return await Promise.race(promises);
        } finally {
            // Cleanup
            if (abortHandler && this.abortController?.signal) {
                this.abortController.signal.removeEventListener(
                    'abort',
                    abortHandler
                );
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
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
            if (executed.has(currentId)) continue;

            const parents = graph.parents[currentId] || [];
            const allParentsExecuted = parents.every((p) => executed.has(p));
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

        if (config.skipOn?.includes(error.code)) return false;

        if (config.retryOn?.length && !config.retryOn.includes(error.code))
            return false;

        if (error.code === 'VALIDATION') return false;

        return true;
    }

    private async sleep(ms: number): Promise<void> {
        if (this.abortController?.signal.aborted) {
            throw new Error('Workflow cancelled');
        }
        return new Promise((resolve, reject) => {
            const signal = this.abortController?.signal;
            const timeoutId = setTimeout(() => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            }, ms);

            const onAbort = () => {
                clearTimeout(timeoutId);
                reject(new Error('Workflow cancelled'));
            };

            signal?.addEventListener('abort', onAbort, { once: true });
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
            compactedMessages = await config.customCompactor(
                messages,
                threshold
            );
        } else {
            // Default: summarize strategy
            const summarizeModel = config.summarizeModel || model;
            const prompt = buildSummarizationPrompt(toCompact, config);

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
