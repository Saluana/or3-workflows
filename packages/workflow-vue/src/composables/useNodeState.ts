import { ref, onBeforeUnmount } from 'vue';
import { WorkflowEditor, WorkflowNode, NodeData } from '@or3/workflow-core';

export function useNodeState(editor: WorkflowEditor, nodeId: string) {
  const node = ref<WorkflowNode | undefined>(
    editor.getNodes().find((n) => n.id === nodeId)
  );

  const updateHandler = () => {
    node.value = editor.getNodes().find((n) => n.id === nodeId);
  };

  const cleanup = editor.on('update', updateHandler);
  const cleanupNodeUpdate = editor.on('nodeUpdate', updateHandler);

  onBeforeUnmount(() => {
    cleanup();
    cleanupNodeUpdate();
  });

  const updateData = (data: Partial<NodeData>) => {
    if (node.value) {
      editor.commands.updateNodeData(node.value.id, data);
    }
  };

  return {
    node,
    updateData,
  };
}
