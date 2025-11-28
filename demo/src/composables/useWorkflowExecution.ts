import { ref } from 'vue'
import { OpenRouter } from '@openrouter/sdk'
import type { Node, Edge } from '@vue-flow/core'
import type { ChatMessage, NodeStatus } from '@/types/workflow'

interface ExecutionContext {
  input: string
  history: Array<{ role: string; content: string }>
  outputs: Record<string, string>
}

export function useWorkflowExecution() {
  const messages = ref<ChatMessage[]>([])
  const isRunning = ref(false)
  const streamingContent = ref('')
  const nodeStatuses = ref<Record<string, NodeStatus>>({})
  const error = ref<string | null>(null)
  const apiKey = ref('')

  // Build graph structure from nodes and edges
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

  // Execute a single agent node
  async function executeAgent(
    client: OpenRouter,
    node: Node,
    context: ExecutionContext,
    onChunk?: (content: string) => void
  ): Promise<string> {
    const model = node.data.model || 'openai/gpt-4o-mini'
    const systemPrompt = node.data.prompt || `You are a helpful assistant named ${node.data.label}.`
    
    // Build messages
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...context.history,
      { role: 'user', content: context.input }
    ]

    // Stream the response
    const stream = await client.chat.send({
      model,
      messages: messages as any,
      stream: true,
    })

    let output = ''
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        output += content
        onChunk?.(content)
      }
    }

    return output
  }

  // Execute a router node - uses LLM to classify and pick a branch
  async function executeRouter(
    client: OpenRouter,
    _node: Node,
    childEdges: Array<{ nodeId: string; handleId?: string }>,
    context: ExecutionContext,
    nodeMap: Map<string, Node>
  ): Promise<string[]> {
    // Get the labels of child nodes for routing
    const routeOptions = childEdges.map((child, index) => {
      const childNode = nodeMap.get(child.nodeId)
      return {
        index,
        nodeId: child.nodeId,
        label: childNode?.data.label || `Option ${index + 1}`,
        handleId: child.handleId
      }
    })

    // Build a classification prompt
    const classificationPrompt = `You are a routing assistant. Based on the user's message, determine which route to take.

Available routes:
${routeOptions.map((opt, i) => `${i + 1}. ${opt.label}`).join('\n')}

User message: "${context.input}"

Respond with ONLY the number of the best matching route (e.g., "1" or "2"). Do not explain.`

    const response = await client.chat.send({
      model: 'openai/gpt-4o-mini', // Fast model for routing
      messages: [
        { role: 'system', content: 'You are a routing classifier. Respond only with a number.' },
        { role: 'user', content: classificationPrompt }
      ] as any,
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

  // Execute a parallel node - runs all branches concurrently
  async function executeParallel(
    client: OpenRouter,
    childEdges: Array<{ nodeId: string; handleId?: string }>,
    context: ExecutionContext,
    nodeMap: Map<string, Node>,
    graph: ReturnType<typeof buildGraph>,
    onNodeStatus: (nodeId: string, status: NodeStatus) => void,
    onChunk?: (content: string) => void
  ): Promise<{ outputs: Record<string, string>; nextNodes: string[] }> {
    // Execute all child branches in parallel
    const promises = childEdges.map(async (child) => {
      const result = await executeNode(
        client,
        child.nodeId,
        context,
        nodeMap,
        graph,
        onNodeStatus,
        onChunk
      )
      return { nodeId: child.nodeId, output: result.output, nextNodes: result.nextNodes }
    })

    const results = await Promise.all(promises)
    
    // Merge outputs
    const outputs: Record<string, string> = {}
    const allNextNodes: string[] = []
    
    for (const result of results) {
      outputs[result.nodeId] = result.output
      allNextNodes.push(...result.nextNodes)
    }

    // Find common descendants (nodes that all branches lead to)
    // For simplicity, return unique next nodes
    const uniqueNextNodes = [...new Set(allNextNodes)]
    
    return { outputs, nextNodes: uniqueNextNodes }
  }

  // Execute a single node (recursive)
  async function executeNode(
    client: OpenRouter,
    nodeId: string,
    context: ExecutionContext,
    nodeMap: Map<string, Node>,
    graph: ReturnType<typeof buildGraph>,
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
          output = context.input
          nextNodes = childEdges.map(c => c.nodeId)
          break

        case 'agent':
          output = await executeAgent(client, node, context, onChunk)
          nextNodes = childEdges.map(c => c.nodeId)
          // Update context for next nodes
          context.outputs[nodeId] = output
          context.history.push({ role: 'assistant', content: output })
          break

        case 'condition':
          // Router node - classify and pick a branch
          nextNodes = await executeRouter(client, node, childEdges, context, nodeMap)
          output = `Routed to: ${nextNodes.join(', ')}`
          break

        case 'parallel':
          // Parallel node - execute all branches concurrently
          const parallelResult = await executeParallel(
            client,
            childEdges,
            context,
            nodeMap,
            graph,
            onNodeStatus,
            onChunk
          )
          
          // Format parallel outputs for merging
          const formattedOutputs = Object.entries(parallelResult.outputs)
            .map(([id, out]) => `## ${nodeMap.get(id)?.data.label || id}\n${out}`)
            .join('\n\n')
          
          // Check if node has a merge prompt - if so, use LLM to merge
          const mergePrompt = node.data.prompt
          const mergeModel = node.data.model || 'openai/gpt-4o-mini'
          
          if (mergePrompt) {
            // Use LLM to merge/summarize the parallel outputs
            const mergeMessages = [
              { role: 'system', content: mergePrompt },
              { role: 'user', content: `Here are the outputs from parallel agents:\n\n${formattedOutputs}\n\nPlease merge/summarize these outputs according to your instructions.` }
            ]
            
            const stream = await client.chat.send({
              model: mergeModel,
              messages: mergeMessages as any,
              stream: true,
            })
            
            let mergedOutput = ''
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content
              if (content) {
                mergedOutput += content
                onChunk?.(content)
              }
            }
            output = mergedOutput
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

  // Main workflow execution
  async function executeWorkflow(
    input: string,
    nodes: Node[],
    edges: Edge[]
  ) {
    if (!apiKey.value) {
      error.value = 'Please enter your OpenRouter API key'
      return
    }

    isRunning.value = true
    error.value = null
    streamingContent.value = ''
    
    // Reset all node statuses
    nodeStatuses.value = {}
    for (const node of nodes) {
      nodeStatuses.value[node.id] = 'idle'
    }

    // Add user message
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

      // Initialize execution context
      const context: ExecutionContext = {
        input,
        history: [],
        outputs: {}
      }

      // Track final output
      let finalOutput = ''

      // BFS execution through the graph
      const queue: string[] = [startNode.id]
      const executed = new Set<string>()

      while (queue.length > 0) {
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

        // Execute the node
        const result = await executeNode(
          client,
          currentId,
          context,
          graph.nodeMap,
          graph,
          (nodeId, status) => {
            nodeStatuses.value[nodeId] = status
          },
          (chunk) => {
            streamingContent.value += chunk
          }
        )

        finalOutput = result.output
        streamingContent.value = '' // Reset for next node

        // Queue next nodes
        for (const nextId of result.nextNodes) {
          if (!executed.has(nextId)) {
            queue.push(nextId)
          }
        }
      }

      // Add final assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalOutput,
        timestamp: new Date()
      }
      messages.value.push(assistantMessage)

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An error occurred'
      
      // Mark current active nodes as error
      for (const [nodeId, status] of Object.entries(nodeStatuses.value)) {
        if (status === 'active') {
          nodeStatuses.value[nodeId] = 'error'
        }
      }
    } finally {
      isRunning.value = false
      streamingContent.value = ''
    }
  }

  function clearMessages() {
    messages.value = []
    nodeStatuses.value = {}
    error.value = null
  }

  return {
    messages,
    isRunning,
    streamingContent,
    nodeStatuses,
    error,
    apiKey,
    executeWorkflow,
    clearMessages
  }
}
