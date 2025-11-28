<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { Play } from 'lucide-vue-next'
import { computed } from 'vue'
import type { NodeStatus } from '@/types/workflow'

// Vue Flow passes node data through these props
const props = defineProps<{
  id: string
  data: {
    label?: string
    status?: NodeStatus
  }
  selected?: boolean
}>()

const label = computed(() => props.data.label || 'Start')
const status = computed(() => props.data.status || 'idle')
</script>

<template>
  <div 
    class="start-node" 
    :class="[`status-${status}`, { selected }]"
  >
    <div class="start-content">
      <Play :size="16" />
      <span>{{ label }}</span>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.start-node {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-success), #16a34a);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  padding: var(--spacing-sm) var(--spacing-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-normal);
  min-width: 100px;
}

.start-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  color: white;
  font-weight: 600;
  font-size: 13px;
}

.start-node:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
}

.status-active {
  animation: pulse-glow 1.5s ease-in-out infinite;
}

.status-completed {
  opacity: 0.7;
}

.selected {
  box-shadow: 0 0 0 2px var(--color-accent), var(--shadow-md);
}

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
  }
  50% {
    box-shadow: 0 0 25px rgba(34, 197, 94, 0.6);
  }
}
</style>
