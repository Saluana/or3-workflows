<script setup lang="ts">
import { ref, watch, markRaw, onMounted, onUnmounted } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import type { Node, Edge } from '@vue-flow/core'

import AgentNode from './nodes/AgentNode.vue'
import StartNode from './nodes/StartNode.vue'
import ConditionNode from './nodes/ConditionNode.vue'
import ParallelNode from './nodes/ParallelNode.vue'
import NodePalette from './NodePalette.vue'
import EdgeLabelEditor from './EdgeLabelEditor.vue'

import { useUndoRedo } from '@/composables/useUndoRedo'
import { useWorkflowStorage } from '@/composables/useWorkflowStorage'
import type { NodeStatus } from '@/types/workflow'

// Define custom node types
const nodeTypes = {
  agent: markRaw(AgentNode),
  start: markRaw(StartNode),
  condition: markRaw(ConditionNode),
  parallel: markRaw(ParallelNode),
}

// Props for external control
const props = defineProps<{
  nodeStatuses?: Record<string, NodeStatus>
}>()

const emit = defineEmits<{
  (e: 'nodesChange', nodes: Node[]): void
  (e: 'edgesChange', edges: Edge[]): void
  (e: 'nodeClick', node: Node): void
  (e: 'nodeDelete', nodeId: string): void
  (e: 'change'): void
}>()

// Use Vue Flow composable for viewport access
const { screenToFlowCoordinate, fitView, zoomIn, zoomOut } = useVueFlow()

const FIT_VIEW_OPTIONS = { padding: 0.2 }
const fitViewWithPadding = () => fitView(FIT_VIEW_OPTIONS)

// Undo/Redo
const { canUndo, canRedo, pushState, initialize: initHistory, undo, redo } = useUndoRedo()

// Storage
const { autosave, loadAutosave } = useWorkflowStorage()

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

// Edge editing state
const selectedEdge = ref<Edge | null>(null)
const showEdgeEditor = ref(false)

// Handle node click
function onNodeClick(event: { node: Node }) {
  selectedEdge.value = null
  showEdgeEditor.value = false
  emit('nodeClick', event.node)
}

// Handle edge click
function onEdgeClick(event: { edge: Edge }) {
  selectedEdge.value = event.edge
  showEdgeEditor.value = true
}

// Update edge label
function updateEdgeLabel(edgeId: string, label: string) {
  edges.value = edges.value.map(edge => {
    if (edge.id === edgeId) {
      return { ...edge, label }
    }
    return edge
  })
}

// Close edge editor
function closeEdgeEditor() {
  selectedEdge.value = null
  showEdgeEditor.value = false
}

// Handle new connections
function onConnect(params: { source: string; target: string; sourceHandle?: string; targetHandle?: string }) {
  const newEdge: Edge = {
    id: `e-${params.source}-${params.target}-${Date.now()}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
  }
  edges.value = [...edges.value, newEdge]
}

// Update node data from config panel
function updateNodeData(nodeId: string, data: Record<string, unknown>) {
  nodes.value = nodes.value.map(node => {
    if (node.id === nodeId) {
      return {
        ...node,
        data: {
          ...node.data,
          ...data,
        }
      }
    }
    return node
  })
}

// Generate unique node ID
let nodeIdCounter = 1
function generateNodeId(type: string): string {
  return `${type}-${Date.now()}-${nodeIdCounter++}`
}

// Handle drop from palette
function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/vueflow')
  const nodeDataStr = event.dataTransfer?.getData('application/json')
  
  if (!nodeType || !nodeDataStr) return
  
  let nodeData: Record<string, unknown>
  try {
    nodeData = JSON.parse(nodeDataStr)
  } catch {
    console.error('Failed to parse node data')
    return
  }
  
  // Get drop position in flow coordinates
  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  })
  
  // Create new node
  const newNode: Node = {
    id: generateNodeId(nodeType),
    type: nodeType,
    position,
    data: nodeData,
  }
  
  nodes.value = [...nodes.value, newNode]
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

// Delete a node and its connected edges
function deleteNode(nodeId: string) {
  // Don't allow deleting the start node
  if (nodeId === 'start') return
  
  recordChange()
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  edges.value = edges.value.filter(e => e.source !== nodeId && e.target !== nodeId)
  
  emit('nodeDelete', nodeId)
}

// Delete an edge
function deleteEdge(edgeId: string) {
  recordChange()
  edges.value = edges.value.filter(e => e.id !== edgeId)
  closeEdgeEditor()
}

// Duplicate a node
function duplicateNode(nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node || node.type === 'start') return
  
  recordChange()
  const newNode: Node = {
    id: generateNodeId(node.type || 'node'),
    type: node.type,
    position: {
      x: node.position.x + 50,
      y: node.position.y + 50,
    },
    data: JSON.parse(JSON.stringify(node.data)),
  }
  newNode.data.label = `${node.data.label} (copy)`
  
  nodes.value = [...nodes.value, newNode]
}

// Record change for undo/redo
function recordChange() {
  pushState(nodes.value, edges.value)
  emit('change')
}

// Handle undo
function handleUndo() {
  const state = undo()
  if (state) {
    nodes.value = state.nodes
    edges.value = state.edges
  }
}

// Handle redo
function handleRedo() {
  const state = redo()
  if (state) {
    nodes.value = state.nodes
    edges.value = state.edges
  }
}

// Handle keyboard shortcuts
function onKeyDown(event: KeyboardEvent) {
  // Undo: Cmd/Ctrl + Z
  if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    handleUndo()
    return
  }
  
  // Redo: Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y
  if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
    event.preventDefault()
    handleRedo()
    return
  }
  
  // Duplicate: Cmd/Ctrl + D
  if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
    event.preventDefault()
    const selectedNodes = nodes.value.filter(n => n.selected)
    for (const node of selectedNodes) {
      duplicateNode(node.id)
    }
    return
  }
  
  // Delete
  if (event.key === 'Delete' || event.key === 'Backspace') {
    // Check if we're in an input field
    if ((event.target as HTMLElement).tagName === 'INPUT' || 
        (event.target as HTMLElement).tagName === 'TEXTAREA') {
      return
    }
    
    // Delete selected edges
    const selectedEdgeIds = edges.value.filter(e => e.selected).map(e => e.id)
    if (selectedEdgeIds.length > 0) {
      recordChange()
      edges.value = edges.value.filter(e => !selectedEdgeIds.includes(e.id))
    }
    
    // Delete selected nodes
    const selectedNodes = nodes.value.filter(n => n.selected)
    for (const node of selectedNodes) {
      deleteNode(node.id)
    }
  }
}

// Load workflow from external source
function loadWorkflow(newNodes: Node[], newEdges: Edge[]) {
  nodes.value = newNodes
  edges.value = newEdges
  initHistory(newNodes, newEdges)
  setTimeout(() => fitViewWithPadding(), 100)
}

// Initialize history and autosave
onMounted(() => {
  // Try to load autosave
  const saved = loadAutosave()
  if (saved && saved.nodes.length > 0) {
    nodes.value = saved.nodes
    edges.value = saved.edges
  }
  
  initHistory(nodes.value, edges.value)

  requestAnimationFrame(() => fitViewWithPadding())
  
  // Autosave periodically
  const autosaveInterval = setInterval(() => {
    autosave(nodes.value, edges.value)
  }, 30000) // Every 30 seconds
  
  onUnmounted(() => {
    clearInterval(autosaveInterval)
  })
})

// Watch for changes and record
watch([nodes, edges], () => {
  emit('change')
}, { deep: true })

// Expose nodes for parent to read workflow definition
defineExpose({
  getNodes: () => nodes.value,
  getEdges: () => edges.value,
  updateNodeData,
  deleteNode,
  deleteEdge,
  duplicateNode,
  loadWorkflow,
  handleUndo,
  handleRedo,
  canUndo,
  canRedo,
  fitView: () => fitViewWithPadding(),
  zoomIn: () => zoomIn(),
  zoomOut: () => zoomOut(),
})
</script>

<template>
  <div 
    class="workflow-editor"
    @drop="onDrop"
    @dragover="onDragOver"
    @keydown="onKeyDown"
    tabindex="0"
  >
    <!-- Node Palette -->
    <div class="palette-container">
      <NodePalette />
    </div>
    
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypes"
      :default-viewport="{ x: 50, y: 50, zoom: 1 }"
      :min-zoom="0.5"
      :max-zoom="2"
      fit-view-on-init
      class="vue-flow-canvas"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @connect="onConnect"
      @pane-click="closeEdgeEditor"
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
    
    <!-- Edge Label Editor -->
    <EdgeLabelEditor
      v-if="showEdgeEditor"
      :edge="selectedEdge"
      @close="closeEdgeEditor"
      @update="updateEdgeLabel"
      @delete="deleteEdge"
    />
  </div>
</template>

<style scoped>
.workflow-editor {
  width: 100%;
  height: 100%;
  position: relative;
  outline: none;
}

.palette-container {
  position: absolute;
  top: var(--spacing-md);
  left: var(--spacing-md);
  z-index: 10;
  background: var(--color-surface);
  backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-lg);
  max-width: 220px;
}

/* Mobile palette adjustments */
@media (max-width: 768px) {
  .palette-container {
    top: var(--spacing-sm);
    left: var(--spacing-sm);
    right: var(--spacing-sm);
    max-width: none;
    padding: var(--spacing-sm);
  }
}

@media (max-width: 480px) {
  .palette-container {
    padding: var(--spacing-xs) var(--spacing-sm);
  }
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

@media (max-width: 768px) {
  :deep(.vue-flow__controls) {
    bottom: calc(var(--mobile-nav-height) + var(--spacing-sm));
    left: var(--spacing-sm);
  }
}
</style>
