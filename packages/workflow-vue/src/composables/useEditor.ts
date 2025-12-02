import { shallowRef, onBeforeUnmount, markRaw, triggerRef } from 'vue';
import {
    createWorkflowEditor,
    WorkflowEditor,
    EditorOptions,
} from '@or3/workflow-core';

/**
 * Composable for creating and managing a WorkflowEditor instance.
 *
 * Returns a shallowRef to the editor that triggers reactivity on updates.
 * This ensures computed properties like `canUndo()` and `canRedo()`
 * properly re-evaluate when the editor state changes.
 *
 * @example
 * ```ts
 * const editor = useWorkflowEditor({
 *   content: initialData,
 *   extensions: [new MyExtension()]
 * });
 *
 * // These will now be reactive
 * const canUndo = computed(() => editor.value?.canUndo() ?? false);
 * const canRedo = computed(() => editor.value?.canRedo() ?? false);
 * ```
 */
export function useWorkflowEditor(options: EditorOptions = {}) {
    const editor = shallowRef<WorkflowEditor | null>(null);

    // Initialize editor
    const instance = createWorkflowEditor(options);
    editor.value = markRaw(instance);

    // Subscribe to editor updates to trigger reactivity
    // This allows computed properties that depend on editor methods
    // (like canUndo, canRedo) to re-evaluate when state changes
    const unsubscribe = instance.on('update', () => {
        // Trigger the shallowRef to notify dependents
        triggerRef(editor);
    });

    // Cleanup
    onBeforeUnmount(() => {
        unsubscribe();
        editor.value?.destroy();
        editor.value = null;
    });

    return editor;
}

/**
 * Alias for `useWorkflowEditor`.
 * Both names are supported - use whichever you prefer.
 */
export const useEditor = useWorkflowEditor;
