// Composables
export { useWorkflowEditor, useEditor } from './composables/useEditor';
export {
    useWorkflowExecution,
    type WorkflowExecutionState,
    type UseWorkflowExecutionReturn,
} from './composables/useWorkflowExecution';
export {
    useWorkflowStorage,
    type UseWorkflowStorageReturn,
} from './composables/useWorkflowStorage';
export {
    useExecutionState,
    createExecutionState,
    type ExecutionState,
    type UseExecutionStateReturn,
} from './composables/useExecutionState';
export { useNodeState } from './composables/useNodeState';

// Node Component Registry
export {
    createNodeRegistry,
    defaultNodeRegistry,
    type NodeComponentRegistry,
} from './nodeRegistry';

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

// Re-export key types from core for convenience
export {
    // Data types
    type WorkflowData,
    type WorkflowNode,
    type WorkflowEdge,
    type NodeData,
    type AgentNodeData,
    type RouterNodeData,
    type ParallelNodeData,
    type ToolNodeData,
    type StartNodeData,
    type OutputNodeData,
    type NodeStatus,
    // Execution types
    type ExecutionResult,
    type ExecutionCallbacks,
    type ExecutionInput,
    type ExecutionAdapter,
    // Storage types
    type StorageAdapter,
    type WorkflowSummary,
    // Type guards
    isAgentNodeData,
    isRouterNodeData,
    isParallelNodeData,
    isToolNodeData,
    isStartNodeData,
    isOutputNodeData,
} from '@or3/workflow-core';

// Re-export vue-flow types for convenience
export type { Edge, Node, Connection } from '@vue-flow/core';

// CSS - import in your app: import '@or3/workflow-vue/style.css'
