import { ref } from 'vue'
import { OpenRouter } from '@openrouter/sdk'
import { workflow } from 'or3-workflow'
import type { StepConfig } from 'or3-workflow'
import type { Node, Edge } from '@vue-flow/core'
import type { ChatMessage, NodeStatus } from '@/types/workflow'

export function useWorkflowExecution() {
  const messages = ref<ChatMessage[]>([])
  const isRunning = ref(false)
  const streamingContent = ref('')
  const nodeStatuses = ref<Record<string, NodeStatus>>({})
  const error = ref<string | null>(null)
  const apiKey = ref('')

  // Convert Vue Flow nodes/edges to or3-workflow definition
  function buildWorkflowFromGraph(nodes: Node[], edges: Edge[]) {
    // Find start node
    const startNode = nodes.find(n => n.type === 'start')
    if (!startNode) throw new Error('No start node found')

    // Build adjacency list
    const adjacency: Record<string, string[]> = {}
    for (const edge of edges) {
      if (!adjacency[edge.source]) adjacency[edge.source] = []
      adjacency[edge.source]!.push(edge.target)
    }

    // Topological sort to get execution order
    const visited = new Set<string>()
    const order: string[] = []
    
    function dfs(nodeId: string) {
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      
      const children = adjacency[nodeId] || []
      for (const child of children) {
        dfs(child)
      }
      order.unshift(nodeId)
    }
    
    dfs(startNode.id)

    // Build steps from agent nodes in order
    const steps: { nodeId: string; config: StepConfig }[] = []
    
    for (const nodeId of order) {
      const node = nodes.find(n => n.id === nodeId)
      if (!node || node.type !== 'agent') continue
      
      steps.push({
        nodeId,
        config: {
          model: node.data.model || 'openai/gpt-4o-mini',
          prompt: node.data.prompt || `You are a helpful assistant named ${node.data.label}.`,
        }
      })
    }

    return steps
  }

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
      const steps = buildWorkflowFromGraph(nodes, edges)
      
      // Mark start as completed
      nodeStatuses.value['start'] = 'completed'

      // Build the workflow
      const wf = workflow(client)
      for (const step of steps) {
        wf.step(step.config)
      }

      // Track which step we're on
      let currentStepIndex = 0
      let fullResponse = ''

      // Stream the workflow
      for await (const event of wf.stream(input)) {
        switch (event.type) {
          case 'step:start':
            if (currentStepIndex < steps.length) {
              const step = steps[currentStepIndex]
              if (step) {
                nodeStatuses.value[step.nodeId] = 'active'
              }
            }
            break

          case 'chunk':
            streamingContent.value += event.content
            fullResponse += event.content
            break

          case 'step:done':
            if (currentStepIndex < steps.length) {
              const step = steps[currentStepIndex]
              if (step) {
                nodeStatuses.value[step.nodeId] = 'completed'
              }
              currentStepIndex++
            }
            // Reset streaming for next step
            streamingContent.value = ''
            break

          case 'workflow:done':
            // Add final assistant message
            const assistantMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: event.result.output,
              timestamp: new Date()
            }
            messages.value.push(assistantMessage)
            break
        }
      }
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
