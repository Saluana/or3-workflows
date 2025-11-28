import type { Node, Edge } from '@vue-flow/core'

export type NodeStatus = 'idle' | 'active' | 'completed' | 'error'

export interface BaseNodeData {
  label: string
  status: NodeStatus
}

export interface AgentNodeData extends BaseNodeData {
  model: string
  prompt: string
  icon?: string
}

export interface StartNodeData extends BaseNodeData {
  // Start node has minimal data
}

export interface ConditionNodeData extends BaseNodeData {
  conditions?: string[]
}

export type WorkflowNode = Node<AgentNodeData | StartNodeData | ConditionNodeData>
export type WorkflowEdge = Edge

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  nodeId?: string
}

export interface WorkflowState {
  isRunning: boolean
  currentNodeId: string | null
  completedNodeIds: string[]
  error: string | null
}
