import { ref } from 'vue';
import type { StorageAdapter, WorkflowData, WorkflowSummary } from 'or3-workflow-core';

export interface UseWorkflowStorageReturn {
  // State
  isLoading: import('vue').Ref<boolean>;
  error: import('vue').Ref<Error | null>;
  workflows: import('vue').Ref<WorkflowSummary[]>;
  currentWorkflow: import('vue').Ref<WorkflowData | null>;
  
  // Actions
  loadList: () => Promise<WorkflowSummary[]>;
  load: (id: string) => Promise<WorkflowData | null>;
  save: (workflow: WorkflowData) => Promise<string>;
  remove: (id: string) => Promise<void>;
}

/**
 * Composable for managing workflow storage.
 * Handles loading, saving, and listing workflows using a storage adapter.
 * 
 * @example
 * ```ts
 * const { loadList, workflows } = useWorkflowStorage(new LocalStorageAdapter());
 * await loadList();
 * ```
 * 
 * @param adapter - The storage adapter to use
 */
export function useWorkflowStorage(adapter: StorageAdapter): UseWorkflowStorageReturn {
  const isLoading = ref(false);
  const error = ref<Error | null>(null);
  const workflows = ref<WorkflowSummary[]>([]);
  const currentWorkflow = ref<WorkflowData | null>(null);

  const loadList = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const list = await adapter.list();
      workflows.value = list;
      return list;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  const load = async (id: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      const workflow = await adapter.load(id);
      currentWorkflow.value = workflow;
      return workflow;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  const save = async (workflow: WorkflowData) => {
    isLoading.value = true;
    error.value = null;
    try {
      // Ensure we're saving a plain object without proxies
      const plainWorkflow = JSON.parse(JSON.stringify(workflow));
      const id = await adapter.save(plainWorkflow);
      // Refresh list after save
      await loadList();
      return id;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  const remove = async (id: string) => {
    isLoading.value = true;
    error.value = null;
    try {
      await adapter.delete(id);
      // Refresh list after delete
      await loadList();
      // Clear current workflow to avoid stale state
      // (We don't track workflow IDs in WorkflowData, so we can't check if it matches)
      currentWorkflow.value = null;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = e;
      throw e;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    isLoading,
    error,
    workflows,
    currentWorkflow,
    loadList,
    load,
    save,
    remove
  };
}
