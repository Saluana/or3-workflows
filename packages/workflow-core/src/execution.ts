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
  ChatMessage,
  ModelCapabilities,
  InputModality,
  MessageContentPart,
  AgentNodeData,
  RouterNodeData,
  ParallelNodeData,
  RouteDefinition,
  BranchDefinition,
  ToolNodeData,
  MemoryNodeData,
} from './types';
import { toolRegistry } from './extensions/ToolNodeExtension';
import { InMemoryAdapter, type MemoryAdapter, type MemoryEntry } from './memory';
import { ExecutionSession, type Session } from './session';
import {
  classifyError,
  wrapError as wrapExecutionError,
  type ExecutionError,
  type NodeErrorConfig,
  type NodeRetryConfig,
} from './errors';

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

/** Message format for OpenRouter API */
interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContentPart[];
}

/** Streaming response chunk from OpenRouter */
interface StreamChunk {
  choices: Array<{
    delta?: { content?: string };
    message?: { content?: string | unknown[] };
  }>;
}

/** Graph structure for workflow traversal */
interface WorkflowGraph {
  nodeMap: Map<string, WorkflowNode>;
  children: Record<string, Array<{ nodeId: string; handleId?: string }>>;
  parents: Record<string, string[]>;
}

/** Result from a parallel branch execution */
interface BranchResult {
  nodeId: string;
  branchId?: string;
  branchLabel: string;
  output: string;
  nextNodes: string[];
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
  private client: OpenRouter;
  private options: ExecutionOptions;
  private abortController: AbortController | null = null;
  private running = false;
  private modelCapabilitiesCache: Map<string, ModelCapabilities | null> = new Map();
  private memory: MemoryAdapter;

  /**
   * Create a new OpenRouterExecutionAdapter.
   *
   * @param client - An initialized OpenRouter SDK client instance.
   *                 Must be created with a valid API key.
   * @param options - Optional execution configuration.
   * @throws {Error} If client is null or undefined.
   *
   * @example
   * ```typescript
   * const client = new OpenRouter({ apiKey: 'your-api-key' });
   * const adapter = new OpenRouterExecutionAdapter(client);
   * ```
   */
  constructor(client: OpenRouter, options: ExecutionOptions = {}) {
    if (!client) {
      throw new Error(
        'OpenRouterExecutionAdapter requires an OpenRouter client instance. ' +
        'Create one with: new OpenRouter({ apiKey: "your-api-key" })'
      );
    }
    
    this.client = client;
    this.options = {
      defaultModel: DEFAULT_MODEL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      ...options,
    };
    this.memory = this.options.memory || new InMemoryAdapter();
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

    const startTime = Date.now();
    const nodeOutputs: Record<string, string> = {};

    try {
      const graph = this.buildGraph(workflow.nodes, workflow.edges);
      
      // Find start node
      const startNode = workflow.nodes.find(n => n.type === 'start');
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
      };

      // BFS execution through the graph
      const queue: string[] = [startNode.id];
      const executed = new Set<string>();
      const skipped = new Set<string>();
      // Use configured maxIterations or calculate from node count
      const maxIterations = this.options.maxIterations ?? 
        (workflow.nodes.length * MAX_ITERATIONS_MULTIPLIER);
      let iterations = 0;
      let finalOutput = '';

      // Helper to propagate skip status
      const propagateSkip = (nodeId: string) => {
        if (executed.has(nodeId)) return;

        // Check if all parents are resolved (executed or skipped)
        const parentIds = graph.parents[nodeId] || [];
        const allParentsResolved = parentIds.every(p => executed.has(p));

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
        const allParentsExecuted = parentIds.every(p => executed.has(p));

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

        // Handle skipped nodes (children not in nextNodes)
        const allChildren = graph.children[currentId] || [];
        for (const child of allChildren) {
          if (!result.nextNodes.includes(child.nodeId)) {
            propagateSkip(child.nodeId);
          }
        }

        // Queue next nodes
        for (const nextId of result.nextNodes) {
          if (!executed.has(nextId)) {
            queue.push(nextId);
          }
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
        throw new Error('Workflow execution exceeded maximum iterations - check for cycles');
      }

      if (finalOutput) {
        const lastMessage = context.session.messages[context.session.messages.length - 1];
        if (!(lastMessage && lastMessage.role === 'assistant' && lastMessage.content === finalOutput)) {
          context.session.addMessage({ role: 'assistant', content: finalOutput });
        }
      }

      return {
        success: true,
        output: finalOutput,
        nodeOutputs,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        output: '',
        nodeOutputs,
        error: err,
        duration: Date.now() - startTime,
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
   * 
   * Uses static capability detection based on known model patterns.
   * The OpenRouter SDK does not expose a models API directly, so we infer
   * capabilities from model naming conventions.
   *
   * @param modelId - The model identifier (e.g., 'openai/gpt-4o-mini').
   * @returns Model capabilities or null if unknown.
   */
  async getModelCapabilities(modelId: string): Promise<ModelCapabilities | null> {
    // Check cache first
    if (this.modelCapabilitiesCache.has(modelId)) {
      return this.modelCapabilitiesCache.get(modelId) || null;
    }

    // Infer capabilities from model naming conventions
    const capabilities = this.inferModelCapabilities(modelId);
    this.modelCapabilitiesCache.set(modelId, capabilities);
    return capabilities;
  }

  /**
   * Infer model capabilities from model ID patterns.
   * @internal
   */
  private inferModelCapabilities(modelId: string): ModelCapabilities {
    const lowerModelId = modelId.toLowerCase();
    
    // Default capabilities
    const capabilities: ModelCapabilities = {
      id: modelId,
      name: modelId.split('/').pop() || modelId,
      inputModalities: ['text'],
      outputModalities: ['text'],
      contextLength: 4096,
      supportedParameters: ['temperature', 'max_tokens', 'top_p'],
    };

    // Vision models (GPT-4V, Claude 3, Gemini with vision)
    const visionPatterns = [
      'gpt-4o', 'gpt-4-vision', 'gpt-4-turbo',
      'claude-3', 'claude-3.5',
      'gemini-pro-vision', 'gemini-1.5', 'gemini-2',
      'llava', 'vision',
    ];
    if (visionPatterns.some(p => lowerModelId.includes(p))) {
      capabilities.inputModalities = ['text', 'image'];
    }

    // Audio models
    const audioPatterns = ['whisper', 'audio', 'gpt-4o-audio'];
    if (audioPatterns.some(p => lowerModelId.includes(p))) {
      capabilities.inputModalities = [...capabilities.inputModalities, 'audio'];
    }

    // Large context models
    const largeContextPatterns: Array<{ pattern: string; context: number }> = [
      { pattern: 'claude-3', context: 200000 },
      { pattern: 'claude-2.1', context: 200000 },
      { pattern: 'gpt-4-turbo', context: 128000 },
      { pattern: 'gpt-4o', context: 128000 },
      { pattern: 'gemini-1.5-pro', context: 1000000 },
      { pattern: 'gemini-1.5-flash', context: 1000000 },
      { pattern: 'gemini-2', context: 1000000 },
      { pattern: 'mistral-large', context: 128000 },
      { pattern: 'command-r', context: 128000 },
    ];
    
    for (const { pattern, context } of largeContextPatterns) {
      if (lowerModelId.includes(pattern)) {
        capabilities.contextLength = context;
        break;
      }
    }

    // Image generation models
    const imageGenPatterns = ['dall-e', 'stable-diffusion', 'midjourney', 'imagen'];
    if (imageGenPatterns.some(p => lowerModelId.includes(p))) {
      capabilities.outputModalities = ['image'];
    }

    // Embedding models
    const embeddingPatterns = ['embed', 'embedding', 'text-embedding'];
    if (embeddingPatterns.some(p => lowerModelId.includes(p))) {
      capabilities.outputModalities = ['embeddings'];
    }

    return capabilities;
  }

  /**
   * Check if a model supports a specific input modality.
   *
   * @param modelId - The model identifier.
   * @param modality - The input modality to check ('text', 'image', 'audio', etc.).
   * @returns True if the model supports the modality.
   */
  async supportsModality(modelId: string, modality: InputModality): Promise<boolean> {
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
  private buildGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowGraph {
    const nodeMap = new Map<string, WorkflowNode>();
    const children: Record<string, Array<{ nodeId: string; handleId?: string }>> = {};
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

    const childEdges = graph.children[nodeId] || [];

    callbacks.onNodeStart(nodeId);

    let output = '';
    let nextNodes: string[] = [];

    switch (node.type) {
      case 'start':
        output = context.currentInput;
        nextNodes = childEdges.map(c => c.nodeId);
        break;

      case 'agent':
        output = await this.executeAgentNode(node, context, graph.nodeMap, callbacks);
        nextNodes = childEdges.map(c => c.nodeId);
        context.outputs[nodeId] = output;
        context.nodeChain.push(nodeId);
        context.currentInput = output;
        context.session.addMessage({ role: 'assistant', content: output });
        break;

      case 'tool':
        output = await this.executeToolNode(node, context);
        nextNodes = childEdges.map(c => c.nodeId);
        context.outputs[nodeId] = output;
        context.nodeChain.push(nodeId);
        context.currentInput = output;
        break;

      case 'memory':
        output = await this.executeMemoryNode(node, context);
        nextNodes = childEdges.map(c => c.nodeId);
        context.outputs[nodeId] = output;
        context.nodeChain.push(nodeId);
        context.currentInput = output;
        break;

      case 'router':
      case 'condition': // Support legacy name
        const routeResult = await this.executeRouterNode(node, childEdges, context, graph.nodeMap, edges, callbacks);
        output = `Routed to: ${routeResult.selectedRoute}`;
        nextNodes = routeResult.nextNodes;
        break;

      case 'parallel':
        const parallelResult = await this.executeParallelNode(
          node,
          childEdges,
          context,
          graph,
          edges,
          callbacks
        );
        output = parallelResult.output;
        nextNodes = parallelResult.nextNodes;
        context.session.addMessage({ role: 'assistant', content: output });
        break;

      default:
        nextNodes = childEdges.map(c => c.nodeId);
    }

    callbacks.onNodeFinish(nodeId, output);
    return { output, nextNodes };
  }

  /**
   * Execute a node with retry/error-handling semantics.
   */
  private async executeNodeWithErrorHandling(
    nodeId: string,
    context: InternalExecutionContext,
    graph: WorkflowGraph,
    edges: WorkflowEdge[],
    callbacks: ExecutionCallbacks
  ): Promise<{ output: string; nextNodes: string[] }> {
    const node = graph.nodeMap.get(nodeId);
    const errorConfig = (node?.data as any)?.errorHandling as NodeErrorConfig | undefined;
    const retryConfig = errorConfig?.retry;
    const resolvedRetry: NodeRetryConfig | undefined = retryConfig ?? (
      this.options.maxRetries !== undefined
        ? {
            maxRetries: this.options.maxRetries,
            baseDelay: this.options.retryDelayMs || DEFAULT_RETRY_DELAY_MS,
          }
        : undefined
    );
    const errorEdge = edges.find(e => e.source === nodeId && e.sourceHandle === 'error');

    let lastError: ExecutionError | null = null;
    const retryHistory: Array<{ attempt: number; error: string; timestamp: string }> = [];
    const maxAttempts = (resolvedRetry?.maxRetries ?? 0) + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeNodeInternal(nodeId, context, graph, edges, callbacks);
      } catch (error) {
        const execError = wrapExecutionError(error, nodeId, attempt, maxAttempts, retryHistory);
        execError.code = classifyError(error);
        execError.retry = {
          attempts: attempt,
          maxAttempts,
          history: [...retryHistory, { attempt, error: execError.message, timestamp: new Date().toISOString() }],
        };
        lastError = execError;

        const shouldRetry = attempt < maxAttempts && this.shouldRetry(execError, resolvedRetry);
        if (shouldRetry) {
          const delay = Math.min(
            (resolvedRetry?.baseDelay || DEFAULT_RETRY_DELAY_MS) * Math.pow(2, attempt - 1),
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
          context.outputs[`${nodeId}_error`] = this.serializeError(execError);
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

  /**
   * Execute an agent node by calling the LLM.
   */
  private async executeAgentNode(
    node: WorkflowNode,
    context: InternalExecutionContext,
    nodeMap: Map<string, WorkflowNode>,
    callbacks: ExecutionCallbacks
  ): Promise<string> {
    const data = node.data as AgentNodeData;
    const model = data.model || this.options.defaultModel || DEFAULT_MODEL;
    const systemPrompt = data.prompt || `You are a helpful assistant named ${data.label}.`;

    // Build context from previous nodes
    let contextInfo = '';
    if (context.nodeChain.length > 0) {
      const previousOutputs = context.nodeChain
        .filter(id => context.outputs[id])
        .map(id => {
          const prevNode = nodeMap.get(id);
          return `[${prevNode?.data.label || id}]: ${context.outputs[id]}`;
        });

      if (previousOutputs.length > 0) {
        contextInfo = `\n\nContext from previous agents:\n${previousOutputs.join('\n\n')}`;
      }
    }

    // Build message content (with multimodal support)
    const userContent = await this.buildMessageContent(
      context.currentInput,
      context.attachments,
      model
    );

    // Build messages
    const chatMessages: ChatMessageParam[] = [
      { role: 'system', content: systemPrompt + contextInfo },
      ...context.session.messages.map(h => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: userContent },
    ];

    // Stream the response
    const stream = await this.client.chat.send({
      model,
      messages: chatMessages as any,
      stream: true,
    }) as AsyncIterable<StreamChunk>;

    let output = '';
    for await (const chunk of stream) {
      if (context.signal.aborted) {
        throw new Error('Workflow cancelled');
      }
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        output += content;
        callbacks.onToken(node.id, content);
      }
    }

    return output;
  }

  /**
   * Execute a tool node using the registered tool handler.
   */
  private async executeToolNode(
    node: WorkflowNode,
    context: InternalExecutionContext
  ): Promise<string> {
    const data = node.data as ToolNodeData;
    if (!data.toolId) {
      throw new Error('Tool node requires a tool to run');
    }

    // Custom handler passed via execution options takes precedence
    if (this.options.onToolCall) {
      return await this.options.onToolCall(data.toolId, {
        input: context.currentInput,
        config: data.config,
        node,
      });
    }

    const tool = toolRegistry.get(data.toolId);
    if (!tool) {
      throw new Error(`Tool not registered: ${data.toolId}`);
    }

    return tool.handler(context.currentInput, data.config);
  }

  /**
   * Execute a memory node using the configured memory adapter.
   */
  private async executeMemoryNode(
    node: WorkflowNode,
    context: InternalExecutionContext
  ): Promise<string> {
    const data = node.data as MemoryNodeData;
    const operation = data.operation || 'query';
    const content = data.text ?? context.currentInput;

    if (operation === 'store') {
      const source = (data.metadata?.['source'] as MemoryEntry['metadata']['source']) || 'agent';
      const entry: MemoryEntry = {
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `mem-${Date.now()}`,
        content,
        metadata: {
          timestamp: new Date().toISOString(),
          source,
          nodeId: node.id,
          sessionId: context.session.id,
          ...data.metadata,
        },
      };

      await context.memory.store(entry);
      return content;
    }

    const results = await context.memory.query({
      text: data.text || context.currentInput,
      limit: data.limit,
      filter: data.filter,
      sessionId: context.session.id,
    });

    if (!results.length) {
      return data.fallback || 'No memories found.';
    }

    return results
      .map(r => {
        const time = r.metadata.timestamp ? `[${r.metadata.timestamp}] ` : '';
        const label = r.metadata.nodeId ? `[${r.metadata.nodeId}] ` : '';
        return `${time}${label}${r.content}`;
      })
      .join('\n');
  }

  /**
   * Execute a router node that classifies input and selects a branch.
   */
  private async executeRouterNode(
    node: WorkflowNode,
    childEdges: Array<{ nodeId: string; handleId?: string }>,
    context: InternalExecutionContext,
    nodeMap: Map<string, WorkflowNode>,
    edges: WorkflowEdge[],
    callbacks: ExecutionCallbacks
  ): Promise<{ selectedRoute: string; nextNodes: string[] }> {
    const data = node.data as RouterNodeData;
    const configuredRoutes = data.routes || [];

    // Build route options
    const routeOptions = childEdges.map((child, index) => {
      const childNode = nodeMap.get(child.nodeId);
      const edge = edges.find(e => e.source === node.id && e.target === child.nodeId);
      const edgeLabel = edge?.label;
      const configuredRoute = configuredRoutes.find((r: RouteDefinition) => r.id === child.handleId);

      return {
        index,
        nodeId: child.nodeId,
        label: configuredRoute?.label || edgeLabel || childNode?.data.label || `Option ${index + 1}`,
        description: childNode?.data.label || '',
        handleId: child.handleId,
      };
    });

    const routerModel = data.model || this.options.defaultModel || DEFAULT_MODEL;
    const customInstructions = data.prompt || '';

    // Build classification prompt
    const routeDescriptions = routeOptions
      .map((opt, i) => {
        const desc = opt.description && opt.description !== opt.label
          ? ` (connects to: ${opt.description})`
          : '';
        return `${i + 1}. ${opt.label}${desc}`;
      })
      .join('\n');

    const classificationPrompt = `You are a routing assistant. Based on the user's message, determine which route to take.

Available routes:
${routeDescriptions}
${customInstructions ? `\nRouting instructions:\n${customInstructions}` : ''}

User message: "${context.currentInput}"

Respond with ONLY the number of the best matching route (e.g., "1" or "2"). Do not explain.`;

    const routerMessages: ChatMessageParam[] = [
      { role: 'system', content: 'You are a routing classifier. Respond only with a number.' },
      { role: 'user', content: classificationPrompt },
    ];

    const response = await this.client.chat.send({
      model: routerModel,
      messages: routerMessages as any,
    });

    const messageContent = response.choices[0]?.message?.content;
    const choice = (typeof messageContent === 'string' ? messageContent.trim() : '1') || '1';
    const selectedIndex = parseInt(choice, 10) - 1;

    let selectedRoute: string;
    let nextNodes: string[];

    if (selectedIndex >= 0 && selectedIndex < routeOptions.length) {
      const selected = routeOptions[selectedIndex]!;
      selectedRoute = selected.label;
      nextNodes = [selected.nodeId];
      
      if (callbacks.onRouteSelected && selected.handleId) {
        callbacks.onRouteSelected(node.id, selected.handleId);
      }
    } else {
      // Default to first route
      selectedRoute = routeOptions[0]?.label || 'default';
      nextNodes = routeOptions.length > 0 ? [routeOptions[0]!.nodeId] : [];
    }

    return { selectedRoute, nextNodes };
  }

  /**
   * Execute a parallel node that runs multiple branches concurrently.
   */
  private async executeParallelNode(
    node: WorkflowNode,
    childEdges: Array<{ nodeId: string; handleId?: string }>,
    context: InternalExecutionContext,
    graph: WorkflowGraph,
    edges: WorkflowEdge[],
    callbacks: ExecutionCallbacks
  ): Promise<{ output: string; nextNodes: string[] }> {
    const data = node.data as ParallelNodeData;
    const branches = data.branches || [];

    // Execute all branches in parallel
    const promises = childEdges.map(async (child): Promise<BranchResult> => {
      const branchConfig = branches.find((b: BranchDefinition) => b.id === child.handleId);

      // Create isolated context for this branch
      const branchContext: InternalExecutionContext = {
        ...context,
        outputs: { ...context.outputs },
        nodeChain: [...context.nodeChain],
      };

      // Create modified node map with branch-specific settings
      const branchNodeMap = new Map(graph.nodeMap);
      const childNode = branchNodeMap.get(child.nodeId);
      if (childNode && branchConfig) {
        const modifiedNode = {
          ...childNode,
          data: {
            ...childNode.data,
            ...(branchConfig.model && { model: branchConfig.model }),
            ...(branchConfig.prompt && { prompt: branchConfig.prompt }),
          },
        };
        branchNodeMap.set(child.nodeId, modifiedNode);
      }

      // Execute the branch node
      const result = await this.executeNodeWithErrorHandling(
        child.nodeId,
        branchContext,
        { ...graph, nodeMap: branchNodeMap },
        edges,
        callbacks
      );

      return {
        nodeId: child.nodeId,
        branchId: child.handleId,
        branchLabel: branchConfig?.label || child.nodeId,
        output: result.output,
        nextNodes: result.nextNodes,
      };
    });

    // Use Promise.allSettled for partial failure handling
    const settledResults = await Promise.allSettled(promises);

    // Collect outputs and errors
    const outputs: Record<string, string> = {};
    const allNextNodes: string[] = [];
    const errors: string[] = [];

    settledResults.forEach((result, index) => {
      const childEdge = childEdges[index];
      if (result.status === 'fulfilled') {
        outputs[result.value.nodeId] = result.value.output;
        allNextNodes.push(...result.value.nextNodes);
      } else {
        const branchConfig = branches.find((b: BranchDefinition) => b.id === childEdge?.handleId);
        const branchLabel = branchConfig?.label || childEdge?.nodeId || `Branch ${index + 1}`;
        errors.push(`${branchLabel}: ${result.reason?.message || 'Unknown error'}`);
      }
    });

    // Format outputs
    let formattedOutputs = Object.entries(outputs)
      .map(([id, out]) => `## ${graph.nodeMap.get(id)?.data.label || id}\n${out}`)
      .join('\n\n');

    if (errors.length > 0) {
      formattedOutputs += `\n\n## Errors\n${errors.join('\n')}`;
    }

    // Merge outputs if merge prompt is provided
    let output: string;
    const mergePrompt = data.prompt;
    const mergeModel = data.model || this.options.defaultModel || DEFAULT_MODEL;

    if (mergePrompt) {
      output = await this.withRetry(async () => {
        const mergeMessages: ChatMessageParam[] = [
          { role: 'system', content: mergePrompt },
          {
            role: 'user',
            content: `Here are the outputs from parallel agents:\n\n${formattedOutputs}\n\nPlease merge/summarize these outputs according to your instructions.`,
          },
        ];

        const stream = await this.client.chat.send({
          model: mergeModel,
          messages: mergeMessages as any,
          stream: true,
        }) as AsyncIterable<StreamChunk>;

        let mergedOutput = '';
        for await (const chunk of stream) {
          if (context.signal.aborted) {
            throw new Error('Workflow cancelled');
          }
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            mergedOutput += content;
            callbacks.onToken(node.id, content);
          }
        }
        return mergedOutput;
      });
    } else {
      output = formattedOutputs;
    }

    const uniqueNextNodes = [...new Set(allNextNodes)];
    return { output, nextNodes: uniqueNextNodes };
  }

  // ==========================================================================
  // Multimodal Support
  // ==========================================================================

  /**
   * Build message content with multimodal attachments.
   */
  private async buildMessageContent(
    text: string,
    attachments: Attachment[],
    modelId: string
  ): Promise<string | MessageContentPart[]> {
    if (!attachments || attachments.length === 0) {
      return text;
    }

    // Check model capabilities
    const capabilities = await this.getModelCapabilities(modelId);
    const supportedModalities = capabilities?.inputModalities || ['text'];

    const parts: MessageContentPart[] = [{ type: 'text', text }];

    for (const attachment of attachments) {
      // Skip unsupported modalities
      if (!supportedModalities.includes(attachment.type)) {
        console.warn(`Model ${modelId} does not support ${attachment.type} modality, skipping attachment`);
        continue;
      }

      const url = attachment.url || (attachment.content ? `data:${attachment.mimeType};base64,${attachment.content}` : null);
      if (!url) continue;

      switch (attachment.type) {
        case 'image':
          parts.push({
            type: 'image_url',
            imageUrl: { url, detail: 'auto' },
          });
          break;
        case 'file':
          parts.push({
            type: 'file',
            file: { url, mimeType: attachment.mimeType },
          });
          break;
        case 'audio':
          parts.push({
            type: 'audio',
            audio: { url },
          });
          break;
        case 'video':
          parts.push({
            type: 'video',
            video: { url, mimeType: attachment.mimeType },
          });
          break;
      }
    }

    return parts.length > 1 ? parts : text;
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  private shouldRetry(error: ExecutionError, config?: NodeRetryConfig): boolean {
    if (!config) return false;

    if (config.skipOn?.includes(error.code)) return false;

    if (config.retryOn?.length && !config.retryOn.includes(error.code)) return false;

    if (error.code === 'VALIDATION') return false;

    return true;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private getChildNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
    return edges
      .filter(e => e.source === nodeId && e.sourceHandle !== 'error')
      .map(e => e.target);
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
   * Retry helper with exponential backoff.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.options.maxRetries || DEFAULT_MAX_RETRIES,
    delayMs: number = this.options.retryDelayMs || DEFAULT_RETRY_DELAY_MS
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry if cancelled
        if (this.abortController?.signal.aborted) {
          throw lastError;
        }

        // Don't retry on auth errors
        if (
          lastError.message.includes('API key') ||
          lastError.message.includes('401') ||
          lastError.message.includes('403')
        ) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }
}
