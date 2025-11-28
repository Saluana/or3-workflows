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
    routes?: Array<{ id: string; label: string }>
    model?: string
    prompt?: string
  }
  selected?: boolean
}>()

const label = computed(() => props.data.label)
const status = computed(() => props.data.status || 'idle')

/** Minimum number of routes required */
const MIN_ROUTES = 1

/** Default routes used when none are configured */
const DEFAULT_ROUTES = [
  { id: 'route-1', label: 'Route 1' },
  { id: 'route-2', label: 'Route 2' }
]

// Routes with minimum enforcement
const routes = computed(() => {
  const configuredRoutes = props.data.routes || DEFAULT_ROUTES
  // Ensure at least MIN_ROUTES routes exist
  if (configuredRoutes.length < MIN_ROUTES) {
    return DEFAULT_ROUTES.slice(0, MIN_ROUTES)
  }
  return configuredRoutes
})

// Calculate handle positions based on number of routes
const handlePositions = computed(() => {
  const count = routes.value.length
  if (count === 1) return [50]
  return routes.value.map((_, i) => ((i + 1) / (count + 1)) * 100)
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
        <span>Router · {{ routes.length }} routes</span>
      </div>
    </div>
    
    <!-- Dynamic output handles based on routes -->
    <Handle 
      v-for="(route, index) in routes"
      :key="route.id"
      type="source" 
      :position="Position.Bottom" 
      :id="route.id"
      :style="{ left: `${handlePositions[index]}%` }"
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
