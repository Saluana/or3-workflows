<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { GitMerge, Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'
import BaseNode from './BaseNode.vue'
import type { NodeStatus } from '@/types/workflow'

// Vue Flow passes node data through these props
const props = defineProps<{
  id: string
  data: {
    label: string
    status?: NodeStatus
    prompt?: string  // System prompt for merging/summarizing parallel outputs
    model?: string   // Model to use for merging
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
    
    <div class="parallel-node">
      <div class="node-header">
        <div class="icon-wrapper">
          <GitMerge :size="18" />
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
      
      <div class="parallel-badge">
        <span>Parallel</span>
      </div>
    </div>
    
    <!-- Multiple output handles for parallel branches -->
    <Handle 
      type="source" 
      :position="Position.Bottom" 
      id="out-1"
      :style="{ left: '25%' }"
    />
    <Handle 
      type="source" 
      :position="Position.Bottom" 
      id="out-2"
      :style="{ left: '50%' }"
    />
    <Handle 
      type="source" 
      :position="Position.Bottom" 
      id="out-3"
      :style="{ left: '75%' }"
    />
  </BaseNode>
</template>

<style scoped>
.parallel-node {
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
  background: var(--color-info-muted);
  border-radius: var(--radius-sm);
  color: var(--color-info);
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

.parallel-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--color-info-muted);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius-full);
  width: fit-content;
}

.parallel-badge span {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-info);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
