import { ref } from 'vue';
import { LocalStorageAdapter, type WorkflowData } from '@or3/workflow-core';

// ============================================================================
// Types
// ============================================================================

export interface SavedWorkflow {
    id: string;
    name: string;
    nodes: unknown[];
    edges: unknown[];
    createdAt: string;
    updatedAt: string;
}

// ============================================================================
// Composable
// ============================================================================

const STORAGE_KEY = 'or3-workflow-saved';

export function useWorkflowStorage() {
    const savedWorkflows = ref<SavedWorkflow[]>([]);
    const storage = new LocalStorageAdapter();

    function loadSavedWorkflows(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                savedWorkflows.value = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load saved workflows:', e);
        }
    }

    function saveWorkflow(
        name: string,
        nodes: unknown[],
        edges: unknown[]
    ): SavedWorkflow {
        const now = new Date().toISOString();
        const workflow: SavedWorkflow = {
            id: crypto.randomUUID(),
            name,
            nodes: structuredClone(nodes),
            edges: structuredClone(edges),
            createdAt: now,
            updatedAt: now,
        };

        savedWorkflows.value.push(workflow);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedWorkflows.value));
        return workflow;
    }

    function deleteWorkflow(id: string): void {
        savedWorkflows.value = savedWorkflows.value.filter((w) => w.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedWorkflows.value));
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
        storage.autosave(workflow);
    }

    function loadAutosave(): WorkflowData | null {
        return storage.loadAutosave();
    }

    return {
        savedWorkflows,
        storage,
        loadSavedWorkflows,
        saveWorkflow,
        deleteWorkflow,
        exportWorkflow,
        importWorkflow,
        autosave,
        loadAutosave,
    };
}
