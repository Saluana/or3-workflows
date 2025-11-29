<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  id: string;
  selected?: boolean;
  label?: string;
  status?: 'idle' | 'active' | 'completed' | 'error';
  color?: string;
}>();

const classes = computed(() => ({
  'node-wrapper': true,
  'selected': props.selected,
  [`status-${props.status}`]: !!props.status,
}));

const style = computed(() => ({
  borderColor: props.color,
}));
</script>

<template>
  <div :class="classes" :style="style">
    <div class="node-header" v-if="label">
      <span class="node-title">{{ label }}</span>
      <div class="node-status" v-if="status" :class="status" />
    </div>
    
    <div class="node-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.node-wrapper {
  background: #252525;
  border: 1px solid #444;
  border-radius: 8px;
  min-width: 150px;
  color: #fff;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.node-wrapper.selected {
  border-color: #646cff;
  box-shadow: 0 0 0 2px rgba(100, 108, 255, 0.4);
}

.node-header {
  padding: 8px 12px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 0.9rem;
}

.node-content {
  padding: 12px;
}

/* Status Indicators */
.node-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}

.node-status.active { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }
.node-status.completed { background: #34d399; }
.node-status.error { background: #f87171; }
</style>
