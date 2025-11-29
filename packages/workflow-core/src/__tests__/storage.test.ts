import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalStorageAdapter } from '../storage';
import type { WorkflowData } from '../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Sample workflow for testing
const createTestWorkflow = (name = 'Test Workflow'): WorkflowData => ({
  meta: {
    version: '2.0.0',
    name,
    description: 'A test workflow',
  },
  nodes: [
    {
      id: 'start-1',
      type: 'start',
      position: { x: 0, y: 0 },
      data: { label: 'Start' },
    },
    {
      id: 'agent-1',
      type: 'agent',
      position: { x: 200, y: 0 },
      data: {
        label: 'Test Agent',
        model: 'openai/gpt-4o-mini',
        prompt: 'You are a helpful assistant.',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'start-1',
      target: 'agent-1',
    },
  ],
});

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    localStorageMock.clear();
    adapter = new LocalStorageAdapter('test-workflows');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('save', () => {
    it('should save a workflow and return an ID', async () => {
      const workflow = createTestWorkflow();
      const id = await adapter.save(workflow);

      expect(id).toBeTruthy();
      expect(id).toContain('test-workflow');
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should update timestamps on save', async () => {
      const workflow = createTestWorkflow();
      await adapter.save(workflow);

      const stored = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      const savedWorkflow = Object.values(stored)[0] as WorkflowData;

      expect(savedWorkflow.meta.createdAt).toBeTruthy();
      expect(savedWorkflow.meta.updatedAt).toBeTruthy();
    });
  });

  describe('load', () => {
    it('should load a saved workflow', async () => {
      const workflow = createTestWorkflow();
      const id = await adapter.save(workflow);
      const loaded = await adapter.load(id);

      expect(loaded.meta.name).toBe('Test Workflow');
      expect(loaded.nodes).toHaveLength(2);
      expect(loaded.edges).toHaveLength(1);
    });

    it('should throw error for non-existent workflow', async () => {
      await expect(adapter.load('non-existent')).rejects.toThrow('Workflow not found');
    });
  });

  describe('delete', () => {
    it('should delete a workflow', async () => {
      const workflow = createTestWorkflow();
      const id = await adapter.save(workflow);
      
      await adapter.delete(id);
      
      await expect(adapter.load(id)).rejects.toThrow('Workflow not found');
    });
  });

  describe('list', () => {
    it('should list all saved workflows', async () => {
      await adapter.save(createTestWorkflow('Workflow 1'));
      await adapter.save(createTestWorkflow('Workflow 2'));

      const list = await adapter.list();

      expect(list).toHaveLength(2);
      expect(list[0].nodeCount).toBe(2);
    });

    it('should return empty array when no workflows', async () => {
      const list = await adapter.list();
      expect(list).toEqual([]);
    });
  });

  describe('export', () => {
    it('should export workflow as JSON string', () => {
      const workflow = createTestWorkflow();
      const json = adapter.export(workflow);
      const parsed = JSON.parse(json);

      expect(parsed.meta.name).toBe('Test Workflow');
      expect(parsed.meta.exportedAt).toBeTruthy();
      expect(parsed.nodes).toHaveLength(2);
    });
  });

  describe('import', () => {
    it('should import workflow from JSON string', () => {
      const workflow = createTestWorkflow();
      const json = adapter.export(workflow);
      const imported = adapter.import(json);

      expect(imported.meta.name).toBe('Test Workflow');
      expect(imported.nodes).toHaveLength(2);
    });

    it('should handle legacy format (v1)', () => {
      const legacyJson = JSON.stringify({
        name: 'Legacy Workflow',
        nodes: [
          { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        ],
        edges: [],
      });

      const imported = adapter.import(legacyJson);

      expect(imported.meta.name).toBe('Legacy Workflow');
      expect(imported.meta.version).toBe('2.0.0');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => adapter.import('not valid json')).toThrow('Invalid JSON format');
    });
  });

  describe('autosave', () => {
    it('should save and load autosave state', () => {
      const workflow = createTestWorkflow();
      adapter.autosave(workflow);

      const loaded = adapter.loadAutosave();

      expect(loaded).not.toBeNull();
      expect(loaded?.meta.name).toBe('Test Workflow');
    });

    it('should check if autosave exists', () => {
      expect(adapter.hasAutosave()).toBe(false);

      adapter.autosave(createTestWorkflow());

      expect(adapter.hasAutosave()).toBe(true);
    });

    it('should clear autosave', () => {
      adapter.autosave(createTestWorkflow());
      adapter.clearAutosave();

      expect(adapter.hasAutosave()).toBe(false);
      expect(adapter.loadAutosave()).toBeNull();
    });

    it('should get autosave timestamp', () => {
      expect(adapter.getAutosaveTimestamp()).toBeNull();

      adapter.autosave(createTestWorkflow());

      const timestamp = adapter.getAutosaveTimestamp();
      expect(timestamp).toBeTruthy();
      expect(typeof timestamp).toBe('number');
    });
  });
});
