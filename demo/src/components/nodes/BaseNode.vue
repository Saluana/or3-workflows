<script setup lang="ts">
import { computed } from 'vue'
import type { NodeStatus } from '@/types/workflow'

const props = withDefaults(defineProps<{
  status?: NodeStatus
  selected?: boolean
}>(), {
  status: 'idle',
  selected: false
})

const statusClass = computed(() => `status-${props.status}`)
</script>

<template>
  <div 
    class="base-node" 
    :class="[statusClass, { selected }]"
  >
    <slot />
  </div>
</template>

<style scoped>
.base-node {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  min-width: 200px;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-normal);
  position: relative;
}

.base-node::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: transparent;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  transition: background var(--transition-normal);
}

/* Status styles */
.status-idle {
  border-color: var(--color-border);
}

.status-active {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-glow);
}

.status-active::before {
  background: linear-gradient(135deg, var(--color-accent), transparent);
}

.status-completed {
  border-color: var(--color-success);
}

.status-completed::before {
  background: linear-gradient(135deg, var(--color-success), transparent);
}

.status-error {
  border-color: var(--color-error);
}

.status-error::before {
  background: linear-gradient(135deg, var(--color-error), transparent);
}

/* Selected state */
.selected {
  border-color: var(--color-accent);
}

/* Hover effect */
.base-node:hover {
  border-color: var(--color-border-hover);
  transform: translateY(-1px);
}

.status-active:hover,
.status-completed:hover,
.status-error:hover {
  border-color: inherit;
}
</style>
