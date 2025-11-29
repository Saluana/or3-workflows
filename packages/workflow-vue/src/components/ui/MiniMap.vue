<script setup lang="ts">
import { MiniMap } from '@vue-flow/minimap';
</script>

<template>
  <MiniMap />
</template>

<style>
.vue-flow__minimap {
  background: #252525;
  border: 1px solid #444;
  border-radius: 4px;
}

.vue-flow__minimap-mask {
  fill: rgba(0, 0, 0, 0.5);
}

.vue-flow__minimap-node {
  fill: #444;
  stroke: none;
}
</style>
