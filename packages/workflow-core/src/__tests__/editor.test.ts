import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEditor } from '../editor';
import type { WorkflowData, NodeExtension } from '../types';

// Sample workflow for testing
const createTestWorkflow = (): WorkflowData => ({
  meta: {
    version: '2.0.0',
    name: 'Test Workflow',
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
        prompt: 'You are helpful.',
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

// Mock extension for testing
const mockExtension: NodeExtension = {
  name: 'mock',
  type: 'node',
  defaultData: { label: 'Mock' },
  onCreate: vi.fn(),
  onDestroy: vi.fn(),
  addCommands: () => ({
    customCommand: () => true,
  }),
};

describe('WorkflowEditor', () => {
  let editor: WorkflowEditor;

  beforeEach(() => {
    editor = new WorkflowEditor();
  });

  describe('constructor', () => {
    it('should create an empty editor', () => {
      expect(editor.nodes).toEqual([]);
      expect(editor.edges).toEqual([]);
    });

    it('should load initial content', () => {
      const workflow = createTestWorkflow();
      editor = new WorkflowEditor({ content: workflow });

      expect(editor.nodes).toHaveLength(2);
      expect(editor.edges).toHaveLength(1);
    });

    it('should register extensions', () => {
      editor = new WorkflowEditor({ extensions: [mockExtension] });

      expect(editor.extensions.has('mock')).toBe(true);
      expect(mockExtension.onCreate).toHaveBeenCalled();
    });
  });

  describe('load', () => {
    it('should load a valid workflow', () => {
      const workflow = createTestWorkflow();
      editor.load(workflow);

      expect(editor.nodes).toHaveLength(2);
      expect(editor.edges).toHaveLength(1);
    });

    it('should throw on invalid workflow', () => {
      expect(() => editor.load({} as any)).toThrow();
    });

    it('should clear history on load', () => {
      // Load clears history - verify by checking canUndo is false after load
      editor.load(createTestWorkflow());
      expect(editor.canUndo()).toBe(false);
    });

    it('should emit update event', () => {
      const callback = vi.fn();
      editor.on('update', callback);

      editor.load(createTestWorkflow());

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('getJSON', () => {
    it('should return workflow data', () => {
      editor.load(createTestWorkflow());
      const json = editor.getJSON();

      expect(json.meta.version).toBe('2.0.0');
      expect(json.nodes).toHaveLength(2);
      expect(json.edges).toHaveLength(1);
    });
  });

  describe('getNodes / getEdges', () => {
    it('should return nodes and edges', () => {
      editor.load(createTestWorkflow());

      expect(editor.getNodes()).toHaveLength(2);
      expect(editor.getEdges()).toHaveLength(1);
    });
  });

  describe('getSelected', () => {
    it('should return selected nodes and edges', () => {
      editor.load(createTestWorkflow());
      editor.commands.selectNode('start-1');

      const selected = editor.getSelected();

      expect(selected.nodes).toContain('start-1');
      expect(selected.edges).toHaveLength(0);
    });
  });

  describe('event system', () => {
    it('should subscribe to events', () => {
      const callback = vi.fn();
      editor.on('update', callback);

      editor.emit('update');

      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe from events', () => {
      const callback = vi.fn();
      const unsubscribe = editor.on('update', callback);

      unsubscribe();
      editor.emit('update');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      editor.on('update', callback1);
      editor.on('update', callback2);
      editor.emit('update');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('extensions', () => {
    it('should register extension', () => {
      editor.registerExtension(mockExtension);

      expect(editor.extensions.has('mock')).toBe(true);
    });

    it('should call onCreate on registration', () => {
      const ext = { ...mockExtension, onCreate: vi.fn() };
      editor.registerExtension(ext);

      expect(ext.onCreate).toHaveBeenCalled();
    });

    it('should warn on duplicate registration', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      editor.registerExtension(mockExtension);
      editor.registerExtension(mockExtension);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should add extension commands', () => {
      editor.registerExtension(mockExtension);

      expect(editor.extensionCommands.customCommand).toBeDefined();
    });
  });

  describe('undo/redo', () => {
    it('should track canUndo state', async () => {
      editor.load(createTestWorkflow());
      expect(editor.canUndo()).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 350)); // Wait for debounce
      editor.commands.createNode('test', { label: 'Test' });
      expect(editor.canUndo()).toBe(true);
    });

    it('should undo changes', async () => {
      editor.load(createTestWorkflow());
      const initialCount = editor.nodes.length;

      await new Promise(resolve => setTimeout(resolve, 350)); // Wait for debounce
      editor.commands.createNode('test', { label: 'Test' });
      expect(editor.nodes.length).toBe(initialCount + 1);

      editor.undo();
      expect(editor.nodes.length).toBe(initialCount);
    });

    it('should redo changes', async () => {
      editor.load(createTestWorkflow());

      await new Promise(resolve => setTimeout(resolve, 350)); // Wait for debounce
      editor.commands.createNode('test', { label: 'Test' });
      const afterCreate = editor.nodes.length;

      editor.undo();
      editor.redo();

      expect(editor.nodes.length).toBe(afterCreate);
    });
  });

  describe('destroy', () => {
    it('should call onDestroy on extensions', () => {
      const ext = { ...mockExtension, onDestroy: vi.fn() };
      editor.registerExtension(ext);

      editor.destroy();

      expect(ext.onDestroy).toHaveBeenCalled();
    });

    it('should clear state', () => {
      editor.load(createTestWorkflow());
      editor.destroy();

      expect(editor.nodes).toHaveLength(0);
      expect(editor.edges).toHaveLength(0);
    });
  });
});
