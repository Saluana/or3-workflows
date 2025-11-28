<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { GitBranch, Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import BaseNode from './BaseNode.vue'
import type { NodeStatus } from '@/types/workflow'

// Vue Flow passes node data through these props
const props = defineProps<{
  id: string
  data: {
    label: string
    status?: NodeStatus
  }
  selected?: boolean
}>()

const label = computed(() => props.data.label)
const status = computed(() => props.data.status || 'idle')

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
    
    <div class="condition-node">
      <div class="node-header">
        <div class="icon-wrapper">
          <GitBranch :size="18" />
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
      
      <div class="condition-badge">
        <span>Router</span>
      </div>
    </div>
    
    <!-- Multiple output handles for branching -->
    <Handle 
      type="source" 
      :position="Position.Bottom" 
      id="default"
      :style="{ left: '30%' }"
    />
    <Handle 
      type="source" 
      :position="Position.Bottom" 
      id="branch"
      :style="{ left: '70%' }"
    />
  </BaseNode>
</template>

<style scoped>
.condition-node {
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
  background: var(--color-warning-muted);
  border-radius: var(--radius-sm);
  color: var(--color-warning);
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

.condition-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--color-warning-muted);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-full);
  width: fit-content;
}

.condition-badge span {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-warning);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
