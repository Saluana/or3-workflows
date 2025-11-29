<script setup lang="ts">
import { WorkflowEditor } from '@or3/workflow-core';

const props = defineProps<{
  editor?: WorkflowEditor;
}>();

const nodeTypes = [
  {
    type: 'agent',
    label: 'Agent Node',
    description: 'LLM-powered agent',
    colorVar: '--or3-color-accent',
    defaultData: {
      label: 'New Agent',
      model: 'openai/gpt-4o-mini',
      prompt: '',
    }
  },
  {
    type: 'router',
    label: 'Router Node',
    description: 'Route based on intent',
    colorVar: '--or3-color-warning',
    defaultData: {
      label: 'Router',
    }
  },
  {
    type: 'parallel',
    label: 'Parallel Node',
    description: 'Run branches concurrently',
    colorVar: '--or3-color-info',
    defaultData: {
      label: 'Parallel',
      model: 'openai/gpt-4o-mini',
      prompt: 'Combine the outputs into a coherent response.',
    }
  },
];

const onDragStart = (event: DragEvent, nodeType: string, defaultData: Record<string, unknown>) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', nodeType);
    event.dataTransfer.setData('application/json', JSON.stringify(defaultData));
    event.dataTransfer.effectAllowed = 'move';
  }
};
</script>

<template>
  <div class="node-palette">
    <div class="palette-header">
      <svg class="plus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
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
        <div class="node-icon" :style="{ '--node-color': `var(${node.colorVar}, #8b5cf6)` }">
          <svg v-if="node.type === 'agent'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
          </svg>
          <svg v-else-if="node.type === 'router'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="6" y1="3" x2="6" y2="15"></line>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <path d="M18 9a9 9 0 0 1-9 9"></path>
          </svg>
          <svg v-else-if="node.type === 'parallel'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M6 21V9a9 9 0 0 0 9 9"></path>
          </svg>
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
  gap: var(--or3-spacing-sm, 8px);
}

.palette-header {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
  font-size: 12px;
  font-weight: 600;
  color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0 var(--or3-spacing-xs, 4px);
}

.plus-icon {
  width: 16px;
  height: 16px;
}

.palette-nodes {
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-xs, 4px);
}

.palette-node {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  background: var(--or3-color-bg-tertiary, #1a1a24);
  border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--or3-radius-md, 10px);
  cursor: grab;
  transition: all 0.15s ease;
}

.palette-node:hover {
  border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15));
  background: var(--or3-color-surface-hover, rgba(34, 34, 46, 0.9));
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
  border-radius: var(--or3-radius-sm, 6px);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--node-color) 20%, transparent);
  color: var(--node-color);
}

.node-icon svg {
  width: 18px;
  height: 18px;
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
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.node-desc {
  font-size: 11px;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.palette-hint {
  padding: var(--or3-spacing-sm, 8px);
  background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
  border-radius: var(--or3-radius-md, 10px);
  margin-top: var(--or3-spacing-sm, 8px);
}

.palette-hint p {
  margin: 0;
  font-size: 11px;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  line-height: 1.4;
}
</style>
