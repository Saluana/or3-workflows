<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';

const props = defineProps<{
  id: string;
  data: {
    label: string;
    toolName?: string;
    status?: 'idle' | 'active' | 'completed' | 'error';
  };
  selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Tool');
const toolName = computed(() => props.data.toolName || 'No tool selected');
const status = computed(() => props.data.status || 'idle');
</script>

<template>
  <NodeWrapper :id="id" :selected="selected" :status="status">
    <Handle type="target" :position="Position.Top" class="handle" />
    
    <div class="tool-node">
      <div class="node-header">
        <div class="icon-wrapper">
          <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
          </svg>
        </div>
        <span class="node-label">{{ label }}</span>
        <div v-if="status === 'active'" class="status-spinner"></div>
      </div>
      
      <div class="tool-badge">
        <span class="tool-name">{{ toolName }}</span>
      </div>
    </div>
    
    <Handle type="source" :position="Position.Bottom" class="handle" />
    <Handle
      type="source"
      :position="Position.Right"
      id="error"
      class="handle error-handle"
    />
  </NodeWrapper>
</template>

<style scoped>
.tool-node {
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
  background: rgba(236, 72, 153, 0.2);
  border-radius: var(--or3-radius-sm, 6px);
  color: #ec4899;
}

.tool-icon {
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
  border: 2px solid rgba(236, 72, 153, 0.2);
  border-top-color: #ec4899;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.tool-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(236, 72, 153, 0.2);
  border: 1px solid rgba(236, 72, 153, 0.3);
  border-radius: var(--or3-radius-full, 9999px);
  width: fit-content;
}

.tool-name {
  font-size: 11px;
  font-weight: 500;
  color: #ec4899;
}

.handle {
  background: var(--or3-color-bg-elevated, #22222e) !important;
  border: 2px solid var(--or3-color-border-hover, rgba(255, 255, 255, 0.15)) !important;
  width: 12px !important;
  height: 12px !important;
}

.handle:hover {
  background: #ec4899 !important;
  border-color: #ec4899 !important;
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
