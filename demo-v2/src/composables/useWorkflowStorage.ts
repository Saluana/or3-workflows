import {
    useWorkflowStorage as useCoreStorage,
} from '@or3/workflow-vue';
import { LocalStorageAdapter, type WorkflowData } from '@or3/workflow-core';

export type SavedWorkflow = WorkflowData & { id: string };

export function useWorkflowStorage() {
    const adapter = new LocalStorageAdapter('or3-workflow-saved');
    const {
        workflows,
        loadList,
        load,
        save,
        remove,
    } = useCoreStorage(adapter);

    // Wrapper to match demo's expected API
    const savedWorkflows = workflows;

    // Autosave adapter - needs to be declared before functions that use it
    const autosaveAdapter = new LocalStorageAdapter('or3-workflow-autosave');

    function loadSavedWorkflows() {
        return loadList();
    }

    // ... (rest of file)

    return {
        savedWorkflows,
        storage: adapter,
        loadSavedWorkflows,
        loadList,
        load,
        saveWorkflow,
        deleteWorkflow,
        exportWorkflow,
        importWorkflow,
        autosave,
        loadAutosave,
    };

    async function saveWorkflow(
        name: string,
        nodes: unknown[],
        edges: unknown[]
    ) {
        const workflow: WorkflowData = {
            meta: {
                version: '2.0.0',
                name,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            nodes: nodes as any,
            edges: edges as any,
        };
        
        await save(workflow);
        // Return type in demo was SavedWorkflow, but core save returns ID.
        // We'll just reload the list to update UI.
        return workflow;
    }

    function deleteWorkflow(id: string) {
        return remove(id);
    }

    function exportWorkflow(
        name: string,
        nodes: unknown[],
        edges: unknown[]
    ): void {
        const workflow = {
            name,
            version: '2.0',
            exportedAt: new Date().toISOString(),
            nodes,
            edges,
        };

        const blob = new Blob([JSON.stringify(workflow, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-workflow.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importWorkflow(file: File): Promise<WorkflowData> {
        const content = await file.text();
        const data = JSON.parse(content);

        if (!data.nodes || !data.edges) {
            throw new Error('Invalid workflow file format');
        }

        return {
            meta: { version: '2.0.0', name: data.name || 'Imported Workflow' },
            nodes: data.nodes,
            edges: data.edges,
        };
    }

    function autosave(workflow: WorkflowData): void {
        autosaveAdapter.autosave(workflow);
    }

    function loadAutosave(): WorkflowData | null {
        return autosaveAdapter.loadAutosave();
    }

    return {
        savedWorkflows,
        storage: adapter,
        loadSavedWorkflows,
        loadList,
        load,
        saveWorkflow,
        deleteWorkflow,
        exportWorkflow,
        importWorkflow,
        autosave,
        loadAutosave,
    };
}
