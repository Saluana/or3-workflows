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
  <NodeWrapper :id="id" :selected="selected" :label="data.label || 'Router'" color="#f59e0b">
    <div class="router-node-content">
      <div class="routes-list">
        <div v-for="(route, index) in data.routes" :key="index" class="route-item">
          <span>{{ route.label || `Route ${index + 1}` }}</span>
          <Handle
            type="source"
            :position="Position.Right"
            :id="route.id"
            class="route-handle"
          />
        </div>
      </div>
      <div class="default-route">
        <span>Default</span>
        <Handle
          type="source"
          :position="Position.Right"
          id="default"
          class="route-handle"
        />
      </div>
    </div>
    
    <Handle type="target" :position="Position.Left" />
  </NodeWrapper>
</template>

<style scoped>
.router-node-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.route-item, .default-route {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  position: relative;
  height: 24px;
}

.route-handle {
  right: -20px !important; /* Adjust based on NodeWrapper padding */
}
</style>
