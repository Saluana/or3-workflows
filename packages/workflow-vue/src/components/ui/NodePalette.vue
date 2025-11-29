<script setup lang="ts">


const nodeTypes = [
  { type: 'agent', label: 'Agent', icon: '🤖' },
  { type: 'router', label: 'Router', icon: '🔀' },
  { type: 'parallel', label: 'Parallel', icon: 'twisted_rightwards_arrows' },
  { type: 'tool', label: 'Tool', icon: '🛠️' },
];

const onDragStart = (event: DragEvent, nodeType: string) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/vueflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }
};
</script>

<template>
  <div class="node-palette">
    <h3>Nodes</h3>
    <div class="node-list">
      <div
        v-for="node in nodeTypes"
        :key="node.type"
        class="node-item"
        draggable="true"
        @dragstart="onDragStart($event, node.type)"
      >
        <span class="node-icon">{{ node.icon }}</span>
        <span class="node-label">{{ node.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-palette {
  padding: 16px;
  background: #252525;
  border-right: 1px solid #444;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

h3 {
  margin: 0;
  font-size: 1rem;
  color: #fff;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #333;
  border-radius: 6px;
  cursor: grab;
  color: #ddd;
  transition: background 0.2s;
}

.node-item:hover {
  background: #444;
}

.node-icon {
  font-size: 1.2rem;
}
</style>
