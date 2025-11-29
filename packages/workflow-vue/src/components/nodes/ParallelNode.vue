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
  <NodeWrapper :id="id" :selected="selected" :label="data.label || 'Parallel'" color="#8b5cf6">
    <div class="parallel-node-content">
      <div class="branches-list">
        <div v-for="(branch, index) in data.branches" :key="index" class="branch-item">
          <span>{{ branch.label || `Branch ${index + 1}` }}</span>
          <Handle
            type="source"
            :position="Position.Right"
            :id="branch.id"
            class="branch-handle"
          />
        </div>
      </div>
    </div>
    
    <Handle type="target" :position="Position.Left" />
  </NodeWrapper>
</template>

<style scoped>
.parallel-node-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.branch-item {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  position: relative;
  height: 24px;
}

.branch-handle {
  right: -20px !important;
}
</style>
