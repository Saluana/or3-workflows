import { shallowRef, onBeforeUnmount, markRaw } from 'vue';
import { WorkflowEditor, EditorOptions } from '@or3/workflow-core';

export function useEditor(options: EditorOptions = {}) {
  const editor = shallowRef<WorkflowEditor | null>(null);

  // Initialize editor
  const instance = new WorkflowEditor(options);
  editor.value = markRaw(instance);

  // Cleanup
  onBeforeUnmount(() => {
    editor.value?.destroy();
    editor.value = null;
  });

  return editor;
}
