<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps<{
  id: string;
  data: {
    label?: string;
    status?: 'idle' | 'active' | 'completed' | 'error';
  };
  selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Start');
const status = computed(() => props.data.status || 'idle');
</script>

<template>
  <div 
    class="start-node" 
    :class="[`status-${status}`, { selected }]"
  >
    <div class="start-content">
      <svg class="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>{{ label }}</span>
    </div>
    <Handle type="source" :position="Position.Bottom" class="handle" />
  </div>
</template>

<style scoped>
.start-node {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--or3-color-success, #22c55e), #16a34a);
  border: 1px solid transparent;
  border-radius: var(--or3-radius-full, 9999px);
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-lg, 24px);
  box-shadow: var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
  transition: all 0.25s ease;
  min-width: 100px;
}

.start-content {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
  color: white;
  font-weight: 600;
  font-size: 13px;
}

.play-icon {
  width: 16px;
  height: 16px;
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
  box-shadow: 0 0 0 2px var(--or3-color-accent, #8b5cf6), var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
}

.handle {
  background: var(--or3-color-bg-elevated, #22222e) !important;
  border: 2px solid rgba(255, 255, 255, 0.3) !important;
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.4); }
  50% { box-shadow: 0 0 25px rgba(34, 197, 94, 0.6); }
}
</style>
