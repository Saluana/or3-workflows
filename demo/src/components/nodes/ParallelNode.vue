<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { GitMerge, Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'
import BaseNode from './BaseNode.vue'
import type { NodeStatus } from '@/types/workflow'

export interface ParallelBranch {
  id: string
  label: string
  model?: string  // Optional per-branch model override
  prompt?: string // Optional per-branch prompt
}

// Vue Flow passes node data through these props
const props = defineProps<{
  id: string
  data: {
    label: string
    status?: NodeStatus
    prompt?: string  // System prompt for merging/summarizing parallel outputs
    model?: string   // Default model for all branches and merging
    branches?: ParallelBranch[]  // Configurable branches
  }
  selected?: boolean
}>()

const label = computed(() => props.data.label)
const status = computed(() => props.data.status || 'idle')

/** Minimum number of branches required */
const MIN_BRANCHES = 1

/** Default branches used when none are configured */
const DEFAULT_BRANCHES = [
  { id: 'branch-1', label: 'Branch 1' },
  { id: 'branch-2', label: 'Branch 2' },
  { id: 'branch-3', label: 'Branch 3' }
]

// Branches with minimum enforcement
const branches = computed(() => {
  const configuredBranches = props.data.branches || DEFAULT_BRANCHES
  // Ensure at least MIN_BRANCHES branches exist
  if (configuredBranches.length < MIN_BRANCHES) {
    return DEFAULT_BRANCHES.slice(0, MIN_BRANCHES)
  }
  return configuredBranches
})

// Calculate handle positions based on number of branches
const handlePositions = computed(() => {
  const count = branches.value.length
  if (count === 1) return [50]
  return branches.value.map((_, i) => ((i + 1) / (count + 1)) * 100)
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
        <span>Parallel · {{ branches.length }} branches</span>
      </div>
    </div>
    
    <!-- Dynamic output handles based on branches -->
    <Handle 
      v-for="(branch, index) in branches"
      :key="branch.id"
      type="source" 
      :position="Position.Bottom" 
      :id="branch.id"
      :style="{ left: `${handlePositions[index]}%` }"
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
