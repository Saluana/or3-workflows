<script setup lang="ts">
import { ref, computed, watch, markRaw } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import type { Node, Edge } from '@vue-flow/core'

import AgentNode from './nodes/AgentNode.vue'
import StartNode from './nodes/StartNode.vue'
import ConditionNode from './nodes/ConditionNode.vue'

import type { NodeStatus } from '@/types/workflow'

// Define custom node types
const nodeTypes = {
  agent: markRaw(AgentNode),
  start: markRaw(StartNode),
  condition: markRaw(ConditionNode),
}

// Props for external control
const props = defineProps<{
  nodeStatuses?: Record<string, NodeStatus>
}>()

const emit = defineEmits<{
  (e: 'nodesChange', nodes: Node[]): void
  (e: 'edgesChange', edges: Edge[]): void
}>()

// Initial workflow nodes
const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'start',
    position: { x: 250, y: 0 },
    data: { label: 'Start' },
  },
  {
    id: 'router',
    type: 'condition',
    position: { x: 200, y: 120 },
    data: { label: 'Detect Intent' },
  },
  {
    id: 'technical-agent',
    type: 'agent',
    position: { x: 50, y: 280 },
    data: { 
      label: 'Technical Agent',
      model: 'anthropic/claude-3.5-sonnet',
      prompt: 'You are a technical support specialist...'
    },
  },
  {
    id: 'sales-agent',
    type: 'agent',
    position: { x: 350, y: 280 },
    data: { 
      label: 'Sales Agent',
      model: 'openai/gpt-4o',
      prompt: 'You are a friendly sales representative...'
    },
  },
  {
    id: 'response-formatter',
    type: 'agent',
    position: { x: 200, y: 440 },
    data: { 
      label: 'Response Formatter',
      model: 'openai/gpt-4o-mini',
      prompt: 'Format the response professionally...'
    },
  },
]

const initialEdges: Edge[] = [
  { 
    id: 'e-start-router', 
    source: 'start', 
    target: 'router',
    animated: false,
  },
  { 
    id: 'e-router-technical', 
    source: 'router', 
    sourceHandle: 'default',
    target: 'technical-agent',
    label: 'Technical',
    animated: false,
  },
  { 
    id: 'e-router-sales', 
    source: 'router', 
    sourceHandle: 'branch',
    target: 'sales-agent',
    label: 'Sales',
    animated: false,
  },
  { 
    id: 'e-technical-formatter', 
    source: 'technical-agent', 
    target: 'response-formatter',
    animated: false,
  },
  { 
    id: 'e-sales-formatter', 
    source: 'sales-agent', 
    target: 'response-formatter',
    animated: false,
  },
]

const nodes = ref<Node[]>(initialNodes)
const edges = ref<Edge[]>(initialEdges)

// Update node statuses when prop changes
watch(() => props.nodeStatuses, (statuses) => {
  if (!statuses) return
  
  nodes.value = nodes.value.map(node => ({
    ...node,
    data: {
      ...node.data,
      status: statuses[node.id] || 'idle'
    }
  }))
  
  // Animate edges connected to active nodes
  edges.value = edges.value.map(edge => ({
    ...edge,
    animated: statuses[edge.source] === 'active' || statuses[edge.target] === 'active'
  }))
}, { deep: true })

// Expose nodes for parent to read workflow definition
defineExpose({
  getNodes: () => nodes.value,
  getEdges: () => edges.value,
})
</script>

<template>
  <div class="workflow-editor">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypes"
      :default-viewport="{ x: 50, y: 50, zoom: 1 }"
      :min-zoom="0.5"
      :max-zoom="2"
      fit-view-on-init
      class="vue-flow-canvas"
    >
      <Background 
        :gap="20" 
        :size="1"
        pattern-color="rgba(255, 255, 255, 0.03)"
      />
      <Controls position="bottom-left" />
      
      <!-- Custom edge labels -->
      <template #edge-label="{ label }">
        <div v-if="label" class="edge-label">{{ label }}</div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.workflow-editor {
  width: 100%;
  height: 100%;
  position: relative;
}

.vue-flow-canvas {
  width: 100%;
  height: 100%;
}

.edge-label {
  background: var(--color-bg-elevated);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
</style>
