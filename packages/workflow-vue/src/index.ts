// Composables
export { useWorkflowEditor, useEditor } from './composables/useEditor';
export { useWorkflowExecution, type WorkflowExecutionState, type UseWorkflowExecutionReturn } from './composables/useWorkflowExecution';
export { useWorkflowStorage, type UseWorkflowStorageReturn } from './composables/useWorkflowStorage';
export { useExecutionState } from './composables/useExecutionState';
export { useNodeState } from './composables/useNodeState';

// Core components
export { default as WorkflowCanvas } from './components/WorkflowCanvas.vue';
export { default as NodePalette } from './components/ui/NodePalette.vue';
export { default as NodeInspector } from './components/ui/NodeInspector.vue';
export { default as ChatPanel } from './components/ui/ChatPanel.vue';

// Optional components
export { default as Controls } from './components/ui/Controls.vue';
export { default as MiniMap } from './components/ui/MiniMap.vue';
export { default as EdgeLabelEditor } from './components/ui/EdgeLabelEditor.vue';
export { default as ValidationOverlay } from './components/ui/ValidationOverlay.vue';

// Node components
export { default as NodeWrapper } from './components/nodes/NodeWrapper.vue';

// Re-export key types from core
export {
  type WorkflowData,
  type WorkflowNode,
  type WorkflowEdge,
  type NodeStatus,
  type ExecutionResult,
  type StorageAdapter,
  type WorkflowSummary,
} from '@or3/workflow-core';

// CSS - import in your app: import '@or3/workflow-vue/styles/variables.css'

