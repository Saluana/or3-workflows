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
  OutputModality,
  MessageContentPart,
  AgentNodeData,
  RouterNodeData,
  ParallelNodeData,
  RouteDefinition,
  BranchDefinition,
} from './types';

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
  history: ChatMessage[];
  outputs: Record<string, string>;
  nodeChain: string[];
  signal: AbortSignal;
}

// ============================================================================
// OpenRouterExecutionAdapter
// ============================================================================

/**
 * Execution adapter that uses OpenRouter SDK for LLM calls.
 * Implements BFS traversal with streaming, retry logic, and multimodal support.
 */
export class OpenRouterExecutionAdapter implements ExecutionAdapter {
  private client: OpenRouter;
  private options: ExecutionOptions;
  private abortController: AbortController | null = null;
  private running = false;
  private modelCapabilitiesCache: Map<string, ModelCapabilities | null> = new Map();

  constructor(client: OpenRouter, options: ExecutionOptions = {}) {
    this.client = client;
    this.options = {
      defaultModel: DEFAULT_MODEL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      ...options,
    };
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
      const context: InternalExecutionContext = {
        input: input.text,
        currentInput: input.text,
        originalInput: input.text,
        attachments: input.attachments || [],
        history: [],
        outputs: {},
        nodeChain: [],
        signal: this.abortController.signal,
      };

      // BFS execution through the graph
      const queue: string[] = [startNode.id];
      const executed = new Set<string>();
      const maxIterations = workflow.nodes.length * MAX_ITERATIONS_MULTIPLIER;
      let iterations = 0;
      let finalOutput = '';

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
          queue.push(currentId);
          continue;
        }

        executed.add(currentId);

        // Execute the node
        const result = await this.executeNode(
          currentId,
          context,
          graph,
          workflow.edges,
          callbacks
        );

        // Store output
        nodeOutputs[currentId] = result.output;
        finalOutput = result.output;

        // Queue next nodes
        for (const nextId of result.nextNodes) {
          if (!executed.has(nextId)) {
            queue.push(nextId);
          }
        }
      }

      if (iterations >= maxIterations) {
        throw new Error('Workflow execution exceeded maximum iterations - check for cycles');
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
   * Get model capabilities from OpenRouter.
   */
  async getModelCapabilities(modelId: string): Promise<ModelCapabilities | null> {
    // Check cache first
    if (this.modelCapabilitiesCache.has(modelId)) {
      return this.modelCapabilitiesCache.get(modelId) || null;
    }

    try {
      // Use OpenRouter's models endpoint
      const response = await fetch(`https://openrouter.ai/api/v1/models/${modelId}`, {
        headers: {
          'Authorization': `Bearer ${(this.client as any).apiKey || ''}`,
        },
      });

      if (!response.ok) {
        this.modelCapabilitiesCache.set(modelId, null);
        return null;
      }

      const data = await response.json();
      const capabilities: ModelCapabilities = {
        id: modelId,
        name: data.name || modelId,
        inputModalities: this.parseModalities(data.architecture?.input_modalities || ['text']),
        outputModalities: this.parseOutputModalities(data.architecture?.output_modalities || ['text']),
        contextLength: data.context_length || 4096,
        supportedParameters: data.supported_parameters || [],
      };

      this.modelCapabilitiesCache.set(modelId, capabilities);
      return capabilities;
    } catch {
      this.modelCapabilitiesCache.set(modelId, null);
      return null;
    }
  }

  /**
   * Check if model supports a specific modality.
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
  private async executeNode(
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

    try {
      let output = '';
      let nextNodes: string[] = [];

      switch (node.type) {
        case 'start':
          output = context.currentInput;
          nextNodes = childEdges.map(c => c.nodeId);
          break;

        case 'agent':
          output = await this.withRetry(() =>
            this.executeAgentNode(node, context, graph.nodeMap, callbacks)
          );
          nextNodes = childEdges.map(c => c.nodeId);
          context.outputs[nodeId] = output;
          context.nodeChain.push(nodeId);
          context.currentInput = output;
          break;

        case 'router':
        case 'condition': // Support legacy name
          const routeResult = await this.withRetry(() =>
            this.executeRouterNode(node, childEdges, context, graph.nodeMap, edges, callbacks)
          );
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
          context.history.push({ role: 'assistant', content: output });
          break;

        default:
          nextNodes = childEdges.map(c => c.nodeId);
      }

      callbacks.onNodeFinish(nodeId, output);
      return { output, nextNodes };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks.onNodeError(nodeId, err);
      throw err;
    }
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
      ...context.history.map(h => ({
        role: h.role as 'user' | 'assistant',
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
        history: [...context.history],
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
      const result = await this.executeNode(
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
        // Video would be handled similarly if supported
      }
    }

    return parts.length > 1 ? parts : text;
  }

  /**
   * Parse input modalities from API response.
   */
  private parseModalities(modalities: string[]): InputModality[] {
    const validModalities: InputModality[] = ['text', 'image', 'file', 'audio', 'video'];
    return modalities.filter(m => validModalities.includes(m as InputModality)) as InputModality[];
  }

  /**
   * Parse output modalities from API response.
   */
  private parseOutputModalities(modalities: string[]): OutputModality[] {
    const validModalities: OutputModality[] = ['text', 'image', 'embeddings'];
    return modalities.filter(m => validModalities.includes(m as OutputModality)) as OutputModality[];
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

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
