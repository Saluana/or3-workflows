// Composables
export * from './composables/useEditor';
export * from './composables/useNodeState';
export * from './composables/useExecutionState';

// Main canvas component
export { default as WorkflowCanvas } from './components/WorkflowCanvas.vue';

// UI components
export { default as NodePalette } from './components/ui/NodePalette.vue';
export { default as NodeInspector } from './components/ui/NodeInspector.vue';
export { default as ChatPanel } from './components/ui/ChatPanel.vue';
export { default as Controls } from './components/ui/Controls.vue';
export { default as MiniMap } from './components/ui/MiniMap.vue';
export { default as ValidationOverlay } from './components/ui/ValidationOverlay.vue';
export { default as EdgeLabelEditor } from './components/ui/EdgeLabelEditor.vue';

// Node components
export { default as NodeWrapper } from './components/nodes/NodeWrapper.vue';
export { default as StartNode } from './components/nodes/StartNode.vue';
export { default as AgentNode } from './components/nodes/AgentNode.vue';
export { default as RouterNode } from './components/nodes/RouterNode.vue';
export { default as ParallelNode } from './components/nodes/ParallelNode.vue';
export { default as ToolNode } from './components/nodes/ToolNode.vue';

// CSS - import in your app: import '@or3/workflow-vue/styles/variables.css'
