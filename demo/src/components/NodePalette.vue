<script setup lang="ts">
import { Bot, GitBranch, GitMerge, Plus } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'dragStart', event: DragEvent, nodeType: string, nodeData: Record<string, unknown>): void
}>()

const nodeTypes = [
  {
    type: 'agent',
    label: 'Agent Node',
    description: 'LLM-powered agent',
    icon: Bot,
    color: 'var(--color-accent)',
    defaultData: {
      label: 'New Agent',
      model: 'openai/gpt-4o-mini',
      prompt: '',
      tools: [],
    }
  },
  {
    type: 'condition',
    label: 'Router Node',
    description: 'Route based on intent',
    icon: GitBranch,
    color: 'var(--color-warning)',
    defaultData: {
      label: 'Router',
    }
  },
  {
    type: 'parallel',
    label: 'Parallel Node',
    description: 'Run branches concurrently',
    icon: GitMerge,
    color: 'var(--color-info)',
    defaultData: {
      label: 'Parallel',
      model: 'openai/gpt-4o-mini',
      prompt: 'You are a synthesis assistant. Combine the following outputs from multiple agents into a coherent, unified response. Highlight the key insights from each perspective.',
    }
  },
]

function onDragStart(event: DragEvent, nodeType: string, defaultData: Record<string, unknown>) {
  if (!event.dataTransfer) return
  
  event.dataTransfer.setData('application/vueflow', nodeType)
  event.dataTransfer.setData('application/json', JSON.stringify(defaultData))
  event.dataTransfer.effectAllowed = 'move'
  
  emit('dragStart', event, nodeType, defaultData)
}
</script>

<template>
  <div class="node-palette">
    <div class="palette-header">
      <Plus :size="16" />
      <span>Add Nodes</span>
    </div>
    
    <div class="palette-nodes">
      <div
        v-for="node in nodeTypes"
        :key="node.type"
        class="palette-node"
        draggable="true"
        @dragstart="onDragStart($event, node.type, node.defaultData)"
      >
        <div class="node-icon" :style="{ background: `color-mix(in srgb, ${node.color} 20%, transparent)`, color: node.color }">
          <component :is="node.icon" :size="18" />
        </div>
        <div class="node-info">
          <span class="node-name">{{ node.label }}</span>
          <span class="node-desc">{{ node.description }}</span>
        </div>
      </div>
    </div>
    
    <div class="palette-hint">
      <p>Drag nodes onto the canvas to add them to your workflow.</p>
    </div>
  </div>
</template>

<style scoped>
.node-palette {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.palette-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 var(--spacing-xs);
}

.palette-nodes {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.palette-node {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: grab;
  transition: all var(--transition-fast);
}

.palette-node:hover {
  border-color: var(--color-border-hover);
  background: var(--color-surface-hover);
}

.palette-node:active {
  cursor: grabbing;
  transform: scale(0.98);
}

.node-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.node-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.node-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-primary);
}

.node-desc {
  font-size: 11px;
  color: var(--color-text-muted);
}

.palette-hint {
  padding: var(--spacing-sm);
  background: var(--color-surface-glass);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-sm);
}

.palette-hint p {
  margin: 0;
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.4;
}
</style>
