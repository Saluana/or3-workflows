<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';

defineProps<{
  id: string;
  data: any;
  selected?: boolean;
}>();
</script>

<template>
  <NodeWrapper :id="id" :selected="selected" :label="data.label || 'Agent'" color="#60a5fa">
    <div class="agent-node-content">
      <div class="model-badge" v-if="data.model">
        {{ data.model.split('/').pop() }}
      </div>
      <div class="prompt-preview" v-if="data.prompt">
        {{ data.prompt.substring(0, 30) }}{{ data.prompt.length > 30 ? '...' : '' }}
      </div>
      <div class="empty-state" v-else>
        No prompt configured
      </div>
    </div>
    
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </NodeWrapper>
</template>

<style scoped>
.agent-node-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-badge {
  background: #1e3a8a;
  color: #93c5fd;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  align-self: flex-start;
}

.prompt-preview {
  font-size: 0.8rem;
  color: #ddd;
}

.empty-state {
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
}
</style>
