<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { VueFlow, useVueFlow, Node, Edge, Connection } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { WorkflowEditor } from '@or3/workflow-core';
import StartNode from './nodes/StartNode.vue';
import AgentNode from './nodes/AgentNode.vue';
import RouterNode from './nodes/RouterNode.vue';
import ParallelNode from './nodes/ParallelNode.vue';
import ToolNode from './nodes/ToolNode.vue';

// Import CSS
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{
  editor: WorkflowEditor;
}>();

const { onConnect, onNodeDragStop } = useVueFlow();

// Sync nodes/edges from editor to VueFlow
// We use a watcher to react to editor updates
// Since editor.nodes is not reactive by default in the core (it's a plain array),
// we rely on the editor emitting 'update' events.
// But wait, we passed the editor instance. We should probably make the editor's state reactive
// or listen to events.
// In useEditor, we just return the instance.
// Let's use a local reactive state for VueFlow and sync it.

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

const syncFromEditor = () => {
  // Map core nodes to VueFlow nodes
  nodes.value = props.editor.getNodes().map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    selected: n.selected,
  }));

  // Map core edges to VueFlow edges
  edges.value = props.editor.getEdges().map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    data: e.data,
  }));
};

// Initial sync
onMounted(() => {
  syncFromEditor();
  
  // Listen for editor updates
  props.editor.on('update', syncFromEditor);
  props.editor.on('selectionUpdate', syncFromEditor);
});

// Handle VueFlow events -> Editor Commands

onConnect((params: Connection) => {
  props.editor.commands.createEdge(
    params.source,
    params.target,
    params.sourceHandle ?? undefined,
    params.targetHandle ?? undefined
  );
});

onNodeDragStop((event) => {
  // event.node is the VueFlow node
  const node = event.node;
  props.editor.commands.setNodePosition(node.id, node.position);
});

// TODO: Handle selection changes from VueFlow to Editor
// TODO: Handle deletion from VueFlow (e.g. Backspace)

</script>

<template>
  <div class="workflow-canvas">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.2"
      :max-zoom="4"
      fit-view-on-init
    >
      <Background />
      <Controls />
      
      <template #node-start="props">
        <StartNode :id="props.id" :data="props.data" :selected="props.selected" />
      </template>

      <template #node-agent="props">
        <AgentNode :id="props.id" :data="props.data" :selected="props.selected" />
      </template>

      <template #node-router="props">
        <RouterNode :id="props.id" :data="props.data" :selected="props.selected" />
      </template>

      <template #node-parallel="props">
        <ParallelNode :id="props.id" :data="props.data" :selected="props.selected" />
      </template>

      <template #node-tool="props">
        <ToolNode :id="props.id" :data="props.data" :selected="props.selected" />
      </template>
      
    </VueFlow>
  </div>
</template>

<style scoped>
.workflow-canvas {
  width: 100%;
  height: 100%;
  background: #1a1a1a;
}

.basic-node {
  padding: 10px;
  border-radius: 5px;
  background: #333;
  color: #fff;
  border: 1px solid #555;
}
</style>
