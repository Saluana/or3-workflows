<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Bot, Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'
import BaseNode from './BaseNode.vue'
import type { NodeStatus } from '@/types/workflow'

// Vue Flow passes node data through these props
const props = defineProps<{
  id: string
  data: {
    label: string
    model: string
    status?: NodeStatus
    prompt?: string
  }
  selected?: boolean
}>()

const label = computed(() => props.data.label)
const model = computed(() => props.data.model)
const status = computed(() => props.data.status || 'idle')

const modelShort = computed(() => {
  // Extract short model name (e.g., "gpt-4" from "openai/gpt-4")
  const parts = model.value.split('/')
  return parts[parts.length - 1]
})

const StatusIcon = computed(() => {
  switch (status.value) {
    case 'active': return Loader2
    case 'completed': return CheckCircle2
    case 'error': return XCircle
    default: return null
  }
})
</script>

<template>
  <BaseNode :status="status" :selected="selected">
    <Handle type="target" :position="Position.Top" />
    
    <div class="agent-node">
      <div class="node-header">
        <div class="icon-wrapper">
          <Bot :size="18" />
        </div>
        <span class="node-label">{{ label }}</span>
        <component 
          v-if="StatusIcon" 
          :is="StatusIcon" 
          :size="16" 
          class="status-icon"
          :class="{ spinning: status === 'active' }"
        />
      </div>
      
      <div class="model-badge">
        <span class="model-name">{{ modelShort }}</span>
      </div>
    </div>
    
    <Handle type="source" :position="Position.Bottom" />
  </BaseNode>
</template>

<style scoped>
.agent-node {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.node-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent-muted);
  border-radius: var(--radius-sm);
  color: var(--color-accent);
}

.node-label {
  flex: 1;
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 13px;
}

.status-icon {
  color: var(--color-text-muted);
}

.status-icon.spinning {
  animation: spin 1s linear infinite;
  color: var(--color-accent);
}

.model-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--color-surface-glass);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  width: fit-content;
}

.model-name {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
