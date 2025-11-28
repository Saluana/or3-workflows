import { ref } from 'vue'
import { OpenRouter } from '@openrouter/sdk'
import type { Node, Edge } from '@vue-flow/core'
import type { ChatMessage, NodeStatus } from '@/types/workflow'

// ============================================================================
// Constants
// ============================================================================

/** Default model used when no model is specified */
const DEFAULT_MODEL = 'openai/gpt-4o-mini'

/** Maximum retry attempts for API calls */
const MAX_RETRIES = 2

/** Base delay in milliseconds between retry attempts */
const RETRY_DELAY_MS = 1000

/** Maximum iterations to prevent infinite loops in workflow execution */
const MAX_ITERATIONS_MULTIPLIER = 3

// ============================================================================
// Types
// ============================================================================

/** Message format for OpenRouter API */
interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Streaming response chunk from OpenRouter */
interface StreamChunk {
  choices: Array<{
    delta?: { content?: string }
    message?: { content?: string | unknown[] }
  }>
}

/** 
 * Context passed through the workflow during execution.
 * Contains the current state and history of the execution.
 */
interface ExecutionContext {
  /** Original user input that started the workflow */
  input: string
  /** Current input (may be modified by previous nodes) */
  currentInput: string
  /** Conversation history for multi-turn interactions */
  history: Array<{ role: string; content: string }>
  /** Outputs from each executed node, keyed by node ID */
  outputs: Record<string, string>
  /** Ordered list of executed node IDs */
  nodeChain: string[]
}

/** Result from a successful parallel branch execution */
interface BranchResult {
  nodeId: string
  branchId?: string
  branchLabel: string
  output: string
  nextNodes: string[]
}

export function useWorkflowExecution() {
  const messages = ref<ChatMessage[]>([])
  const isRunning = ref(false)
  const streamingContent = ref('')
  const streamingNodeId = ref<string | null>(null) // Track which node is streaming
  const nodeOutputs = ref<Record<string, string>>({}) // Track outputs per node
  const nodeStatuses = ref<Record<string, NodeStatus>>({})
  const error = ref<string | null>(null)
  const errorNodeId = ref<string | null>(null)
  const apiKey = ref('')
  
  // Conversation history for multi-turn
  const conversationHistory = ref<Array<{ role: string; content: string }>>([])
  
  // AbortController for cancelling requests
  let abortController: AbortController | null = null

  /**
   * Builds a graph structure from nodes and edges for traversal.
   * @param nodes - Array of workflow nodes
   * @param edges - Array of edges connecting nodes
   * @returns Graph structure with nodeMap, children, and parents
   */
  function buildGraph(nodes: Node[], edges: Edge[]) {
    const nodeMap = new Map<string, Node>()
    const children: Record<string, Array<{ nodeId: string; handleId?: string }>> = {}
    const parents: Record<string, string[]> = {}

    for (const node of nodes) {
      nodeMap.set(node.id, node)
      children[node.id] = []
      parents[node.id] = []
    }

    for (const edge of edges) {
      children[edge.source]?.push({ 
        nodeId: edge.target, 
        handleId: edge.sourceHandle || undefined 
      })
      parents[edge.target]?.push(edge.source)
    }

    return { nodeMap, children, parents }
  }

  /**
   * Executes a single agent node by calling the LLM.
   * @param client - OpenRouter client instance
   * @param node - The agent node to execute
   * @param context - Current execution context
   * @param nodeMap - Map of all nodes for context building
   * @param onChunk - Optional callback for streaming chunks
   * @returns The agent's response text
   */
  async function executeAgent(
    client: OpenRouter,
    node: Node,
    context: ExecutionContext,
    nodeMap: Map<string, Node>,
    onChunk?: (content: string) => void
  ): Promise<string> {
    const model = node.data.model || DEFAULT_MODEL
    const systemPrompt = node.data.prompt || `You are a helpful assistant named ${node.data.label}.`
    
    // Build context from previous nodes in the chain
    let contextInfo = ''
    if (context.nodeChain.length > 0) {
      const previousOutputs = context.nodeChain
        .filter(id => context.outputs[id])
        .map(id => {
          const prevNode = nodeMap.get(id)
          return `[${prevNode?.data.label || id}]: ${context.outputs[id]}`
        })
      
      if (previousOutputs.length > 0) {
        contextInfo = `\n\nContext from previous agents:\n${previousOutputs.join('\n\n')}`
      }
    }
    
    // Build messages with proper types
    const chatMessages: ChatMessageParam[] = [
      { role: 'system', content: systemPrompt + contextInfo },
      ...context.history.map(h => ({ 
        role: h.role as 'user' | 'assistant', 
        content: h.content 
      })),
      { role: 'user', content: context.currentInput }
    ]

    // Stream the response with abort signal
    const stream = await client.chat.send({
      model,
      messages: chatMessages,
      stream: true,
    }) as AsyncIterable<StreamChunk>

    let output = ''
    for await (const chunk of stream) {
      // Check if aborted
      if (abortController?.signal.aborted) {
        throw new Error('Workflow cancelled')
      }
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        output += content
        onChunk?.(content)
      }
    }

    return output
  }

  /**
   * Executes a router node that classifies input and selects a branch.
   * Uses LLM to determine which route to take based on user input.
   * @param client - OpenRouter client instance
   * @param node - The router node to execute
   * @param childEdges - Available output edges/routes
   * @param context - Current execution context
   * @param nodeMap - Map of all nodes
   * @param edges - All edges in the workflow
   * @returns Array of selected node IDs to execute next
   */
  async function executeRouter(
    client: OpenRouter,
    node: Node,
    childEdges: Array<{ nodeId: string; handleId?: string }>,
    context: ExecutionContext,
    nodeMap: Map<string, Node>,
    edges: Edge[]
  ): Promise<string[]> {
    // Get route configurations from node data
    const configuredRoutes = node.data.routes as Array<{ id: string; label: string }> | undefined
    
    // Get the labels of child nodes and edge labels for routing
    const routeOptions = childEdges.map((child, index) => {
      const childNode = nodeMap.get(child.nodeId)
      // Find the edge to get its label
      const edge = edges.find(e => e.source === node.id && e.target === child.nodeId)
      const edgeLabel = edge?.label as string | undefined
      
      // Find configured route label by handleId
      const configuredRoute = configuredRoutes?.find(r => r.id === child.handleId)
      
      return {
        index,
        nodeId: child.nodeId,
        // Priority: configured route label > edge label > child node label
        label: configuredRoute?.label || edgeLabel || childNode?.data.label || `Option ${index + 1}`,
        description: childNode?.data.label || '',
        handleId: child.handleId
      }
    })

    // Get router configuration from node data
    const routerModel = node.data.model || DEFAULT_MODEL
    const customInstructions = node.data.prompt || ''

    // Build a classification prompt
    const routeDescriptions = routeOptions.map((opt, i) => {
      const desc = opt.description && opt.description !== opt.label 
        ? ` (connects to: ${opt.description})` 
        : ''
      return `${i + 1}. ${opt.label}${desc}`
    }).join('\n')

    const classificationPrompt = `You are a routing assistant. Based on the user's message, determine which route to take.

Available routes:
${routeDescriptions}
${customInstructions ? `\nRouting instructions:\n${customInstructions}` : ''}

User message: "${context.currentInput}"

Respond with ONLY the number of the best matching route (e.g., "1" or "2"). Do not explain.`

    const routerMessages: ChatMessageParam[] = [
      { role: 'system', content: 'You are a routing classifier. Respond only with a number.' },
      { role: 'user', content: classificationPrompt }
    ]

    const response = await client.chat.send({
      model: routerModel,
      messages: routerMessages,
    })

    const messageContent = response.choices[0]?.message?.content
    const choice = (typeof messageContent === 'string' ? messageContent.trim() : '1') || '1'
    const selectedIndex = parseInt(choice, 10) - 1

    // Return the selected route(s)
    if (selectedIndex >= 0 && selectedIndex < routeOptions.length) {
      return [routeOptions[selectedIndex]!.nodeId]
    }
    
    // Default to first route
    return routeOptions.length > 0 ? [routeOptions[0]!.nodeId] : []
  }

  /**
   * Executes a parallel node that runs multiple branches concurrently.
   * Uses Promise.allSettled for partial failure handling.
   * @param client - OpenRouter client instance
   * @param parallelNode - The parallel node to execute
   * @param childEdges - Child edges representing branches
   * @param context - Current execution context
   * @param nodeMap - Map of all nodes
   * @param graph - Graph structure for traversal
   * @param edges - All edges in the workflow
   * @param onNodeStatus - Callback to update node status
   * @param onChunk - Optional callback for streaming chunks
   * @returns Outputs from all branches and next nodes to execute
   */
  async function executeParallel(
    client: OpenRouter,
    parallelNode: Node,
    childEdges: Array<{ nodeId: string; handleId?: string }>,
    context: ExecutionContext,
    nodeMap: Map<string, Node>,
    graph: ReturnType<typeof buildGraph>,
    edges: Edge[],
    onNodeStatus: (nodeId: string, status: NodeStatus) => void,
    onChunk?: (content: string) => void
  ): Promise<{ outputs: Record<string, string>; nextNodes: string[]; errors: string[] }> {
    // Get branch configurations from the parallel node
    const branches = parallelNode.data.branches as Array<{ 
      id: string; 
      label: string;
      model?: string; 
      prompt?: string 
    }> || []
    
    // Create a deep copy of nodeMap to avoid race conditions
    const branchNodeMaps = childEdges.map(() => new Map(nodeMap))
    
    // Execute all child branches in parallel with isolated contexts
    const promises = childEdges.map(async (child, branchIndex): Promise<BranchResult> => {
      // Find the branch config for this edge (by handleId)
      const branchConfig = branches.find(b => b.id === child.handleId)
      
      // Use isolated nodeMap for this branch
      const isolatedNodeMap = branchNodeMaps[branchIndex]!
      
      // Get the child node and create a modified copy if needed
      const childNode = isolatedNodeMap.get(child.nodeId)
      if (childNode) {
        // Create a modified node with branch-specific settings
        const modifiedNode = {
          ...childNode,
          data: {
            ...childNode.data,
            ...(branchConfig?.model && { model: branchConfig.model }),
            ...(branchConfig?.prompt && { prompt: branchConfig.prompt })
          }
        }
        isolatedNodeMap.set(child.nodeId, modifiedNode)
      }
      
      // Create isolated context for this branch (deep copy mutable arrays)
      const branchContext: ExecutionContext = {
        ...context,
        history: [...context.history],
        outputs: { ...context.outputs },
        nodeChain: [...context.nodeChain]
      }
      
      const result = await executeNode(
        client,
        child.nodeId,
        branchContext,
        isolatedNodeMap,
        graph,
        edges,
        onNodeStatus,
        onChunk
      )
      
      return { 
        nodeId: child.nodeId, 
        branchId: child.handleId,
        branchLabel: branchConfig?.label || child.nodeId,
        output: result.output, 
        nextNodes: result.nextNodes 
      }
    })

    // Use Promise.allSettled for partial failure handling
    const settledResults = await Promise.allSettled(promises)
    
    // Merge outputs and collect errors
    const outputs: Record<string, string> = {}
    const allNextNodes: string[] = []
    const errors: string[] = []
    
    settledResults.forEach((result, index) => {
      const childEdge = childEdges[index]
      if (result.status === 'fulfilled') {
        outputs[result.value.nodeId] = result.value.output
        allNextNodes.push(...result.value.nextNodes)
      } else {
        // Handle failed branch
        const branchConfig = branches.find(b => b.id === childEdge?.handleId)
        const branchLabel = branchConfig?.label || childEdge?.nodeId || `Branch ${index + 1}`
        errors.push(`${branchLabel}: ${result.reason?.message || 'Unknown error'}`)
        if (childEdge?.nodeId) {
          onNodeStatus(childEdge.nodeId, 'error')
        }
      }
    })

    // Find common descendants (nodes that all branches lead to)
    // For simplicity, return unique next nodes
    const uniqueNextNodes = [...new Set(allNextNodes)]
    
    return { outputs, nextNodes: uniqueNextNodes, errors }
  }

  /**
   * Retry helper for API calls with exponential backoff.
   * @param fn - Async function to retry
   * @param maxRetries - Maximum number of retry attempts
   * @param delayMs - Base delay between retries (multiplied by attempt number)
   * @returns Result of the function
   * @throws Last error if all retries fail
   */
  async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    delayMs: number = RETRY_DELAY_MS
  ): Promise<T> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        
        // Don't retry if cancelled
        if (abortController?.signal.aborted) {
          throw lastError
        }
        
        // Don't retry on certain errors
        if (lastError.message.includes('API key') || 
            lastError.message.includes('401') ||
            lastError.message.includes('403')) {
          throw lastError
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)))
        }
      }
    }
    throw lastError
  }

  /**
   * Executes a single node in the workflow graph.
   * Handles different node types (start, agent, condition, parallel).
   * @param client - OpenRouter client instance
   * @param nodeId - ID of the node to execute
   * @param context - Current execution context
   * @param nodeMap - Map of all nodes
   * @param graph - Graph structure for traversal
   * @param edges - All edges in the workflow
   * @param onNodeStatus - Callback to update node status
   * @param onChunk - Optional callback for streaming chunks
   * @returns Output and next nodes to execute
   */
  async function executeNode(
    client: OpenRouter,
    nodeId: string,
    context: ExecutionContext,
    nodeMap: Map<string, Node>,
    graph: ReturnType<typeof buildGraph>,
    edges: Edge[],
    onNodeStatus: (nodeId: string, status: NodeStatus) => void,
    onChunk?: (content: string) => void
  ): Promise<{ output: string; nextNodes: string[] }> {
    const node = nodeMap.get(nodeId)
    if (!node) return { output: '', nextNodes: [] }

    const childEdges = graph.children[nodeId] || []
    
    onNodeStatus(nodeId, 'active')

    try {
      let output = ''
      let nextNodes: string[] = []

      switch (node.type) {
        case 'start':
          // Start node just passes through
          output = context.currentInput
          nextNodes = childEdges.map(c => c.nodeId)
          break

        case 'agent':
          output = await withRetry(() => executeAgent(client, node, context, nodeMap, onChunk))
          nextNodes = childEdges.map(c => c.nodeId)
          // Update context for next nodes
          context.outputs[nodeId] = output
          context.nodeChain.push(nodeId)
          context.currentInput = output // Pass output as input to next node
          break

        case 'condition':
          // Router node - classify and pick a branch
          nextNodes = await withRetry(() => executeRouter(client, node, childEdges, context, nodeMap, edges))
          output = `Routed to: ${nextNodes.join(', ')}`
          break

        case 'parallel':
          // Parallel node - execute all branches concurrently
          const parallelResult = await executeParallel(
            client,
            node,
            childEdges,
            context,
            nodeMap,
            graph,
            edges,
            onNodeStatus,
            onChunk
          )
          
          // Format parallel outputs for merging (include errors if any)
          let formattedOutputs = Object.entries(parallelResult.outputs)
            .map(([id, out]) => `## ${nodeMap.get(id)?.data.label || id}\n${out}`)
            .join('\n\n')
          
          // Append errors if any branches failed
          if (parallelResult.errors.length > 0) {
            formattedOutputs += `\n\n## Errors\n${parallelResult.errors.join('\n')}`
          }
          
          // Check if node has a merge prompt - if so, use LLM to merge
          const mergePrompt = node.data.prompt
          const mergeModel = node.data.model || DEFAULT_MODEL
          
          if (mergePrompt) {
            // Use LLM to merge/summarize the parallel outputs with retry
            output = await withRetry(async () => {
              const mergeMessages: ChatMessageParam[] = [
                { role: 'system', content: mergePrompt },
                { role: 'user', content: `Here are the outputs from parallel agents:\n\n${formattedOutputs}\n\nPlease merge/summarize these outputs according to your instructions.` }
              ]
              
              const stream = await client.chat.send({
                model: mergeModel,
                messages: mergeMessages,
                stream: true,
              }) as AsyncIterable<StreamChunk>
              
              let mergedOutput = ''
              for await (const chunk of stream) {
                if (abortController?.signal.aborted) {
                  throw new Error('Workflow cancelled')
                }
                const content = chunk.choices[0]?.delta?.content
                if (content) {
                  mergedOutput += content
                  onChunk?.(content)
                }
              }
              return mergedOutput
            })
          } else {
            // No merge prompt - just concatenate outputs
            output = formattedOutputs
          }
          
          context.history.push({ role: 'assistant', content: output })
          nextNodes = parallelResult.nextNodes
          break

        default:
          nextNodes = childEdges.map(c => c.nodeId)
      }

      onNodeStatus(nodeId, 'completed')
      return { output, nextNodes }
    } catch (err) {
      onNodeStatus(nodeId, 'error')
      throw err
    }
  }

  /**
   * Main workflow execution function.
   * Executes the workflow from start to finish using BFS traversal.
   * @param input - User's message to process
   * @param nodes - All nodes in the workflow
   * @param edges - All edges connecting nodes
   */
  async function executeWorkflow(
    input: string,
    nodes: Node[],
    edges: Edge[]
  ) {
    if (!apiKey.value) {
      error.value = 'Please enter your OpenRouter API key'
      return
    }

    // Cancel any existing execution
    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()
    
    isRunning.value = true
    error.value = null
    errorNodeId.value = null
    streamingContent.value = ''
    streamingNodeId.value = null
    nodeOutputs.value = {}
    
    // Reset all node statuses
    nodeStatuses.value = {}
    for (const node of nodes) {
      nodeStatuses.value[node.id] = 'idle'
    }

    // Add user message to conversation history
    conversationHistory.value.push({ role: 'user', content: input })

    // Add user message to UI
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }
    messages.value.push(userMessage)

    try {
      const client = new OpenRouter({ apiKey: apiKey.value })
      const graph = buildGraph(nodes, edges)
      
      // Find start node
      const startNode = nodes.find(n => n.type === 'start')
      if (!startNode) throw new Error('No start node found')

      // Initialize execution context with conversation history
      const context: ExecutionContext = {
        input,
        currentInput: input,
        history: [...conversationHistory.value.slice(0, -1)], // Previous messages (exclude current)
        outputs: {},
        nodeChain: []
      }

      // Track final output
      let finalOutput = ''

      // BFS execution through the graph
      const queue: string[] = [startNode.id]
      const executed = new Set<string>()
      const maxIterations = nodes.length * MAX_ITERATIONS_MULTIPLIER // Safety limit
      let iterations = 0

      while (queue.length > 0 && iterations < maxIterations) {
        iterations++
        const currentId = queue.shift()!
        
        // Skip if already executed
        if (executed.has(currentId)) continue
        
        // Check if all parents are executed (except for start node)
        const parentIds = graph.parents[currentId] || []
        const allParentsExecuted = parentIds.every(p => executed.has(p))
        
        if (!allParentsExecuted && currentId !== startNode.id) {
          // Re-queue and continue
          queue.push(currentId)
          continue
        }

        executed.add(currentId)

        // Track which node is streaming
        streamingNodeId.value = currentId
        streamingContent.value = ''

        // Execute the node
        const result = await executeNode(
          client,
          currentId,
          context,
          graph.nodeMap,
          graph,
          edges,
          (nodeId: string, status: NodeStatus) => {
            nodeStatuses.value[nodeId] = status
          },
          (chunk: string) => {
            streamingContent.value += chunk
          }
        )

        // Store the output for this node
        nodeOutputs.value[currentId] = result.output
        finalOutput = result.output

        // Queue next nodes
        for (const nextId of result.nextNodes) {
          if (!executed.has(nextId)) {
            queue.push(nextId)
          }
        }
      }

      if (iterations >= maxIterations) {
        throw new Error('Workflow execution exceeded maximum iterations - check for cycles or disconnected nodes')
      }

      // Add final assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalOutput,
        timestamp: new Date()
      }
      messages.value.push(assistantMessage)
      
      // Add to conversation history for multi-turn
      conversationHistory.value.push({ role: 'assistant', content: finalOutput })

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      error.value = errorMessage
      
      // Find which node failed and store it
      for (const [nodeId, status] of Object.entries(nodeStatuses.value)) {
        if (status === 'active') {
          errorNodeId.value = nodeId
          nodeStatuses.value[nodeId] = 'error'
        }
      }
      
      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Error: ${errorMessage}${errorNodeId.value ? ` (in node: ${errorNodeId.value})` : ''}`,
        timestamp: new Date()
      }
      messages.value.push(errorChatMessage)
    } finally {
      isRunning.value = false
      streamingContent.value = ''
    }
  }

  /**
   * Clears all messages and resets the workflow state.
   * Use this to start a fresh conversation.
   */
  function clearMessages() {
    messages.value = []
    nodeStatuses.value = {}
    error.value = null
    errorNodeId.value = null
    conversationHistory.value = []
  }

  /**
   * Cancels the current workflow execution.
   * Aborts any pending API calls and resets node statuses.
   */
  function cancelExecution() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    isRunning.value = false
    streamingContent.value = ''
    
    // Mark active nodes as idle
    for (const [nodeId, status] of Object.entries(nodeStatuses.value)) {
      if (status === 'active') {
        nodeStatuses.value[nodeId] = 'idle'
      }
    }
  }

  return {
    messages,
    isRunning,
    streamingContent,
    streamingNodeId,
    nodeOutputs,
    nodeStatuses,
    error,
    errorNodeId,
    apiKey,
    conversationHistory,
    executeWorkflow,
    clearMessages,
    cancelExecution
  }
}
