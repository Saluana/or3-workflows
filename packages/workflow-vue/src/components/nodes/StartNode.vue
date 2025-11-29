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
  <NodeWrapper :id="id" :selected="selected" :label="data.label || 'Start'" color="#34d399">
    <div class="start-node-content">
      <p>Entry Point</p>
    </div>
    <Handle type="source" :position="Position.Right" />
  </NodeWrapper>
</template>

<style scoped>
.start-node-content {
  font-size: 0.8rem;
  color: #aaa;
  text-align: center;
}
</style>
