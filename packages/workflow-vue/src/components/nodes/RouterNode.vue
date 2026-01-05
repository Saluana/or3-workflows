<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';
import IconRouter from '../icons/IconRouter.vue';

const props = defineProps<{
  id: string;
  data: {
    label: string;
    status?: 'idle' | 'active' | 'completed' | 'error';
    routes?: Array<{ id: string; label: string }>;
  };
  selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Router');
const status = computed(() => props.data.status || 'idle');

const DEFAULT_ROUTES = [
  { id: 'route-1', label: 'Route 1' },
  { id: 'route-2', label: 'Route 2' }
];

const routes = computed(() => {
  const configuredRoutes = props.data.routes || DEFAULT_ROUTES;
  return configuredRoutes.length > 0 ? configuredRoutes : DEFAULT_ROUTES;
});

const handlePositions = computed(() => {
  const count = routes.value.length;
  if (count === 1) return [50];
  return routes.value.map((_, i) => ((i + 1) / (count + 1)) * 100);
});
const emit = defineEmits<{
  (e: 'inspect'): void;
}>();
</script>

<template>
  <NodeWrapper :id="id" :selected="selected" :status="status" variant="warning" @inspect="emit('inspect')">
    <Handle type="target" :position="Position.Top" class="handle" />
    
    <div class="router-node">
      <div class="node-header">
        <div class="icon-wrapper">
          <IconRouter class="branch-icon" />
        </div>
        <span class="node-label">{{ label }}</span>
        <div v-if="status === 'active'" class="status-spinner"></div>
      </div>
      
      <div class="router-badge">
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
      class="handle route-handle"
      :data-route-label="route.label || route.id"
      :title="route.label || route.id"
      :style="{ left: `${handlePositions[index]}%` }"
    />
    <Handle
      type="source"
      :position="Position.Right"
      id="error"
      class="handle error-handle"
    />
  </NodeWrapper>
</template>

<style scoped>
.router-node {
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-sm, 8px);
}

.node-header {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--or3-color-warning-muted, rgba(245, 158, 11, 0.2));
  border-radius: var(--or3-radius-sm, 6px);
  color: var(--or3-color-warning, #f59e0b);
}

.branch-icon {
  width: 18px;
  height: 18px;
}

.node-label {
  flex: 1;
  font-weight: 600;
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
  font-size: 13px;
}

.status-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--or3-color-warning-muted, rgba(245, 158, 11, 0.2));
  border-top-color: var(--or3-color-warning, #f59e0b);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.router-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: var(--or3-color-warning-muted, rgba(245, 158, 11, 0.2));
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--or3-radius-full, 9999px);
  width: fit-content;
}

.router-badge span {
  font-size: 11px;
  font-weight: 500;
  color: var(--or3-color-warning, #f59e0b);
}

.handle {
  background: var(--or3-color-bg-elevated, #22222e) !important;
  border: 2px solid var(--or3-color-border-hover, rgba(255, 255, 255, 0.15)) !important;
  width: 12px !important;
  height: 12px !important;
}

.route-handle::after {
  content: attr(data-route-label);
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--or3-color-bg-elevated, #22222e);
  border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.9));
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--or3-radius-sm, 6px);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 5;
}

.route-handle:hover::after,
.route-handle:focus-visible::after {
  opacity: 1;
}

.handle:hover {
  background: var(--or3-color-warning, #f59e0b) !important;
  border-color: var(--or3-color-warning, #f59e0b) !important;
}

.error-handle {
  border-color: var(--or3-color-error, #ef4444) !important;
}

.error-handle:hover {
  background: var(--or3-color-error, #ef4444) !important;
  border-color: var(--or3-color-error, #ef4444) !important;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
