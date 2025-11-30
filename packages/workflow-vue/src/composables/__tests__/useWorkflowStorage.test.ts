import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkflowStorage } from '../useWorkflowStorage';
import type {
    StorageAdapter,
    WorkflowData,
    WorkflowSummary,
} from '@or3/workflow-core';

// Mock Adapter
const mockAdapter: StorageAdapter = {
    load: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    export: vi.fn(),
    import: vi.fn(),
};

const mockWorkflow: WorkflowData = {
    meta: { version: '1.0.0', name: 'Test' },
    nodes: [],
    edges: [],
};

const mockSummary: WorkflowSummary = {
    id: '1',
    name: 'Test',
    createdAt: '',
    updatedAt: '',
    nodeCount: 0,
};

describe('useWorkflowStorage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with default state', () => {
        const { isLoading, error, workflows } = useWorkflowStorage(mockAdapter);

        expect(isLoading.value).toBe(false);
        expect(error.value).toBe(null);
        expect(workflows.value).toEqual([]);
    });

    it('should load list of workflows', async () => {
        const { loadList, workflows, isLoading } =
            useWorkflowStorage(mockAdapter);

        (mockAdapter.list as any).mockResolvedValue([mockSummary]);

        const promise = loadList();
        expect(isLoading.value).toBe(true);

        await promise;

        expect(isLoading.value).toBe(false);
        expect(workflows.value).toHaveLength(1);
        expect(workflows.value[0]).toMatchObject({
            id: '1',
            name: 'Test',
            nodeCount: 0,
        });
    });

    it('should load a workflow', async () => {
        const { load, currentWorkflow } = useWorkflowStorage(mockAdapter);

        (mockAdapter.load as any).mockResolvedValue(mockWorkflow);

        await load('1');

        expect(currentWorkflow.value).toEqual(mockWorkflow);
        expect(mockAdapter.load).toHaveBeenCalledWith('1');
    });

    it('should save a workflow', async () => {
        const { save } = useWorkflowStorage(mockAdapter);

        (mockAdapter.save as any).mockResolvedValue('1');
        (mockAdapter.list as any).mockResolvedValue([mockSummary]);

        const id = await save(mockWorkflow);

        expect(id).toBe('1');
        expect(mockAdapter.save).toHaveBeenCalledWith(mockWorkflow);
        expect(mockAdapter.list).toHaveBeenCalled(); // Should refresh list
    });

    it('should remove a workflow', async () => {
        const { remove } = useWorkflowStorage(mockAdapter);

        (mockAdapter.list as any).mockResolvedValue([]);

        await remove('1');

        expect(mockAdapter.delete).toHaveBeenCalledWith('1');
        expect(mockAdapter.list).toHaveBeenCalled(); // Should refresh list
    });

    it('should handle errors', async () => {
        const { loadList, error } = useWorkflowStorage(mockAdapter);
        const testError = new Error('Test Error');

        (mockAdapter.list as any).mockRejectedValue(testError);

        try {
            await loadList();
        } catch (e) {
            // Expected
        }

        expect(error.value).toBe(testError);
    });
});
