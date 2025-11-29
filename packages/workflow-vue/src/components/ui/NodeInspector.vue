<script setup lang="ts">
import { ref } from 'vue';
import { WorkflowEditor, WorkflowNode } from '@or3/workflow-core';

const props = defineProps<{
  editor: WorkflowEditor;
}>();

const selectedNode = ref<WorkflowNode | null>(null);

// Watch for selection changes
// Ideally we'd use useEditor or useSelection composable, but for now we listen to events
const updateSelection = () => {
  const selected = props.editor.getSelected().nodes;
  if (selected.length === 1) {
    selectedNode.value = props.editor.getNodes().find(n => n.id === selected[0]) || null;
  } else {
    selectedNode.value = null;
  }
};

props.editor.on('selectionUpdate', updateSelection);

const updateLabel = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  if (selectedNode.value) {
    props.editor.commands.updateNodeData(selectedNode.value.id, { label: value });
  }
};

const updateModel = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  if (selectedNode.value) {
    props.editor.commands.updateNodeData(selectedNode.value.id, { model: value });
  }
};

const updatePrompt = (event: Event) => {
  const value = (event.target as HTMLTextAreaElement).value;
  if (selectedNode.value) {
    props.editor.commands.updateNodeData(selectedNode.value.id, { prompt: value });
  }
};
</script>

<template>
  <div class="node-inspector" v-if="selectedNode">
    <h3>Inspector</h3>
    <div class="inspector-content">
      <div class="field-group">
        <label>Label</label>
        <input :value="selectedNode.data.label" @input="updateLabel" />
      </div>

      <div class="field-group" v-if="selectedNode.type === 'agent'">
        <label>Model</label>
        <input :value="(selectedNode.data as any).model" @input="updateModel" placeholder="provider/model" />
      </div>

      <div class="field-group" v-if="selectedNode.type === 'agent'">
        <label>Prompt</label>
        <textarea :value="(selectedNode.data as any).prompt" @input="updatePrompt" rows="5"></textarea>
      </div>
      
      <!-- Add more fields based on node type -->
    </div>
  </div>
  <div class="node-inspector empty" v-else>
    <p>Select a node to edit</p>
  </div>
</template>

<style scoped>
.node-inspector {
  padding: 16px;
  background: #252525;
  border-left: 1px solid #444;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: #fff;
}

.node-inspector.empty {
  justify-content: center;
  align-items: center;
  color: #666;
}

h3 {
  margin: 0;
  font-size: 1rem;
}

.inspector-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

label {
  font-size: 0.8rem;
  color: #aaa;
}

input, textarea {
  background: #333;
  border: 1px solid #555;
  color: #fff;
  padding: 8px;
  border-radius: 4px;
  font-family: inherit;
}

input:focus, textarea:focus {
  border-color: #646cff;
  outline: none;
}
</style>
