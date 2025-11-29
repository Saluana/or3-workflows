<script setup lang="ts">
import { Controls } from '@vue-flow/controls';
</script>

<template>
  <Controls />
</template>

<style>
/* Override Vue Flow Controls styles if needed */
.vue-flow__controls {
  background: #333;
  border: 1px solid #555;
  border-radius: 4px;
  overflow: hidden;
}

.vue-flow__controls-button {
  background: transparent;
  border: none;
  border-bottom: 1px solid #555;
  color: #ddd;
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.vue-flow__controls-button:last-child {
  border-bottom: none;
}

.vue-flow__controls-button:hover {
  background: #444;
}

.vue-flow__controls-button svg {
  fill: currentColor;
}
</style>
