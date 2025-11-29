import { shallowRef, onBeforeUnmount, markRaw } from 'vue';
import { createWorkflowEditor, WorkflowEditor, EditorOptions } from '@or3/workflow-core';

/**
 * Composable for creating and managing a WorkflowEditor instance.
 * 
 * @example
 * ```ts
 * const editor = useWorkflowEditor({
 *   content: initialData,
 *   extensions: [new MyExtension()]
 * });
 * ```
 */
export function useWorkflowEditor(options: EditorOptions = {}) {
  const editor = shallowRef<WorkflowEditor | null>(null);

  // Initialize editor
  const instance = createWorkflowEditor(options);
  editor.value = markRaw(instance);

  // Cleanup
  onBeforeUnmount(() => {
    editor.value?.destroy();
    editor.value = null;
  });

  return editor;
}

/**
 * @deprecated Use `useWorkflowEditor` instead.
 */
export const useEditor = useWorkflowEditor;
