import type { Node, Edge } from '@vue-flow/core'

export interface ValidationError {
  type: 'error' | 'warning'
  nodeId?: string
  edgeId?: string
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
}

export function useWorkflowValidation() {
  
  function validateWorkflow(nodes: Node[], edges: Edge[]): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Check for start node
    const startNode = nodes.find(n => n.type === 'start')
    if (!startNode) {
      errors.push({
        type: 'error',
        message: 'Workflow must have a Start node',
      })
    }

    // Build adjacency maps
    const outgoing: Record<string, string[]> = {}
    const incoming: Record<string, string[]> = {}
    
    for (const node of nodes) {
      outgoing[node.id] = []
      incoming[node.id] = []
    }
    
    for (const edge of edges) {
      outgoing[edge.source]?.push(edge.target)
      incoming[edge.target]?.push(edge.source)
    }

    // Check for disconnected nodes (except start)
    for (const node of nodes) {
      if (node.type === 'start') continue
      
      const hasIncoming = (incoming[node.id]?.length || 0) > 0
      const hasOutgoing = (outgoing[node.id]?.length || 0) > 0
      
      if (!hasIncoming && !hasOutgoing) {
        errors.push({
          type: 'error',
          nodeId: node.id,
          message: `Node "${node.data.label}" is not connected to the workflow`,
        })
      } else if (!hasIncoming) {
        warnings.push({
          type: 'warning',
          nodeId: node.id,
          message: `Node "${node.data.label}" has no incoming connections`,
        })
      }
    }

    // Check for nodes reachable from start
    if (startNode) {
      const reachable = new Set<string>()
      const queue = [startNode.id]
      
      while (queue.length > 0) {
        const current = queue.shift()!
        if (reachable.has(current)) continue
        reachable.add(current)
        
        const children = outgoing[current] || []
        queue.push(...children)
      }

      for (const node of nodes) {
        if (node.type === 'start') continue
        if (!reachable.has(node.id)) {
          warnings.push({
            type: 'warning',
            nodeId: node.id,
            message: `Node "${node.data.label}" is not reachable from Start`,
          })
        }
      }
    }

    // Check for cycles (could cause infinite loops)
    function hasCycle(): boolean {
      const visited = new Set<string>()
      const recursionStack = new Set<string>()

      function dfs(nodeId: string): boolean {
        visited.add(nodeId)
        recursionStack.add(nodeId)

        const children = outgoing[nodeId] || []
        for (const child of children) {
          if (!visited.has(child)) {
            if (dfs(child)) return true
          } else if (recursionStack.has(child)) {
            return true
          }
        }

        recursionStack.delete(nodeId)
        return false
      }

      for (const node of nodes) {
        if (!visited.has(node.id)) {
          if (dfs(node.id)) return true
        }
      }

      return false
    }

    if (hasCycle()) {
      warnings.push({
        type: 'warning',
        message: 'Workflow contains a cycle - this may cause issues with execution',
      })
    }

    // Check agent nodes have prompts
    for (const node of nodes) {
      if (node.type === 'agent') {
        if (!node.data.prompt || node.data.prompt.trim() === '') {
          warnings.push({
            type: 'warning',
            nodeId: node.id,
            message: `Agent "${node.data.label}" has no system prompt configured`,
          })
        }
      }
    }

    // Check router nodes have at least 2 outgoing connections
    for (const node of nodes) {
      if (node.type === 'condition') {
        const outgoingCount = outgoing[node.id]?.length || 0
        if (outgoingCount < 2) {
          warnings.push({
            type: 'warning',
            nodeId: node.id,
            message: `Router "${node.data.label}" should have at least 2 outgoing connections`,
          })
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  return {
    validateWorkflow,
  }
}
