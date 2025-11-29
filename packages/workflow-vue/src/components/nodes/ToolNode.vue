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
  <NodeWrapper :id="id" :selected="selected" :label="data.label || 'Tool'" color="#ec4899">
    <div class="tool-node-content">
      <p>{{ data.toolName || 'Select Tool' }}</p>
    </div>
    
    <Handle type="target" :position="Position.Left" />
    <Handle type="source" :position="Position.Right" />
  </NodeWrapper>
</template>

<style scoped>
.tool-node-content {
  font-size: 0.8rem;
  color: #ddd;
}
</style>
