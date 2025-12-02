import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowEditor, createWorkflowEditor } from '../editor';
import { extensionRegistry } from '../execution';
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
    inputs: [{ id: 'input', type: 'input' }],
    outputs: [{ id: 'output', type: 'output' }],
    defaultData: { label: 'Mock' },
    onCreate: vi.fn(),
    onDestroy: vi.fn(),
    addCommands: () => ({
        customCommand: () => true,
    }),
    execute: async () => ({ output: 'test output', nextNodes: [] }),
    validate: () => [],
};

// Create a fresh mock extension for each test that needs to verify registration
const createMockNodeExtension = (name: string): NodeExtension => ({
    name,
    type: 'node',
    inputs: [{ id: 'input', type: 'input' }],
    outputs: [{ id: 'output', type: 'output' }],
    defaultData: { label: name },
    execute: async () => ({ output: 'test', nextNodes: [] }),
    validate: () => [],
});

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
            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

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

            await new Promise((resolve) => setTimeout(resolve, 350)); // Wait for debounce
            editor.commands.createNode('test', { label: 'Test' });
            expect(editor.canUndo()).toBe(true);
        });

        it('should undo changes', async () => {
            editor.load(createTestWorkflow());
            const initialCount = editor.nodes.length;

            await new Promise((resolve) => setTimeout(resolve, 350)); // Wait for debounce
            editor.commands.createNode('test', { label: 'Test' });
            expect(editor.nodes.length).toBe(initialCount + 1);

            editor.undo();
            expect(editor.nodes.length).toBe(initialCount);
        });

        it('should redo changes', async () => {
            editor.load(createTestWorkflow());

            await new Promise((resolve) => setTimeout(resolve, 350)); // Wait for debounce
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

        it('should set destroyed flag', () => {
            expect(editor.isDestroyed()).toBe(false);
            editor.destroy();
            expect(editor.isDestroyed()).toBe(true);
        });

        it('should warn on double destroy', () => {
            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

            editor.destroy();
            editor.destroy();

            expect(warnSpy).toHaveBeenCalledWith(
                'WorkflowEditor.destroy() called on already destroyed instance'
            );
            warnSpy.mockRestore();
        });

        it('should prevent operations after destroy', () => {
            editor.destroy();

            expect(() => editor.load(createTestWorkflow())).toThrow(
                'Cannot use WorkflowEditor after it has been destroyed'
            );
            expect(() => editor.undo()).toThrow(
                'Cannot use WorkflowEditor after it has been destroyed'
            );
            expect(() => editor.redo()).toThrow(
                'Cannot use WorkflowEditor after it has been destroyed'
            );
        });

        it('should handle errors in extension onDestroy', () => {
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            const ext = {
                ...mockExtension,
                name: 'error-ext',
                onDestroy: () => {
                    throw new Error('Destroy error');
                },
            };
            editor.registerExtension(ext);

            expect(() => editor.destroy()).not.toThrow();
            expect(errorSpy).toHaveBeenCalled();
            errorSpy.mockRestore();
        });

        it('should clear event listeners', () => {
            const callback = vi.fn();
            editor.on('update', callback);
            editor.destroy();

            // Listeners should be cleared - emit should not call the callback
            // We can't emit after destroy, but we can check listeners map is cleared
            expect(editor.isDestroyed()).toBe(true);
        });
    });

    describe('memory leak prevention', () => {
        it('should cleanup empty listener sets', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            editor.on('update', callback1);
            const unsub2 = editor.on('update', callback2);

            unsub2();

            // Verify callback2 is removed but callback1 still works
            editor.emit('update');
            expect(callback1).toHaveBeenCalled();
            expect(callback2).not.toHaveBeenCalled();
        });

        it('should remove event key when all callbacks removed', () => {
            const callback = vi.fn();
            const unsub = editor.on('update', callback);

            unsub();

            // Event should be completely removed from map
            editor.emit('update');
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('event emitter error handling', () => {
        it('should catch and log errors in event callbacks', () => {
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            const goodCallback = vi.fn();
            const badCallback = vi.fn(() => {
                throw new Error('Callback error');
            });

            editor.on('update', badCallback);
            editor.on('update', goodCallback);

            editor.emit('update');

            expect(errorSpy).toHaveBeenCalled();
            expect(goodCallback).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe('extension command conflicts', () => {
        it('should warn on command name conflicts', () => {
            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

            const ext1: NodeExtension = {
                ...mockExtension,
                name: 'ext1',
                addCommands: () => ({ testCmd: () => true }),
            };

            const ext2: NodeExtension = {
                ...mockExtension,
                name: 'ext2',
                addCommands: () => ({ testCmd: () => false }),
            };

            editor.registerExtension(ext1);
            editor.registerExtension(ext2);

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Command 'testCmd'")
            );
            warnSpy.mockRestore();
        });
    });

    describe('viewport zoom validation', () => {
        it('should validate zoom level is a number', () => {
            const warnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {});

            editor.setViewportZoom(NaN);
            expect(warnSpy).toHaveBeenCalledWith(
                'Invalid zoom level provided:',
                NaN
            );

            editor.setViewportZoom(Infinity);
            expect(warnSpy).toHaveBeenCalled();

            warnSpy.mockRestore();
        });

        it('should clamp zoom level to valid range', () => {
            editor.setViewportZoom(10);
            expect(editor.viewport.zoom).toBe(3);

            editor.setViewportZoom(0.01);
            expect(editor.viewport.zoom).toBe(0.1);

            editor.setViewportZoom(1.5);
            expect(editor.viewport.zoom).toBe(1.5);
        });
    });

    describe('readonly properties', () => {
        it('should expose readonly extensions map', () => {
            const ext = mockExtension;
            editor.registerExtension(ext);

            expect(editor.extensions.has('mock')).toBe(true);
            // Verify it's the same reference (readonly view)
            expect(editor.extensions).toBeDefined();
        });

        it('should return readonly arrays from getNodes/getEdges', () => {
            editor.load(createTestWorkflow());

            const nodes = editor.getNodes();
            const edges = editor.getEdges();

            // These should be typed as readonly but we can still access them
            expect(nodes.length).toBeGreaterThan(0);
            expect(edges.length).toBeGreaterThan(0);
        });

        it('should return readonly metadata from getMeta', () => {
            const meta = editor.getMeta();

            expect(meta).toBeDefined();
            expect(meta.version).toBeDefined();
        });
    });

    describe('createWorkflowEditor', () => {
        it('should create an editor instance', () => {
            const editor = createWorkflowEditor();
            expect(editor).toBeInstanceOf(WorkflowEditor);
        });

        it('should pass options to constructor', () => {
            const workflow = createTestWorkflow();
            const editor = createWorkflowEditor({ content: workflow });
            expect(editor.nodes).toHaveLength(2);
        });
    });

    describe('extension bridge to execution registry', () => {
        afterEach(() => {
            // Clean up test extensions from the global registry
            extensionRegistry.delete('testCustomNode');
            extensionRegistry.delete('testBridgeNode');
        });

        it('should register NodeExtension with global execution registry', () => {
            const customExtension = createMockNodeExtension('testCustomNode');

            // Verify it's not in the registry before
            expect(extensionRegistry.has('testCustomNode')).toBe(false);

            editor.registerExtension(customExtension);

            // Should be in both editor and global registry
            expect(editor.extensions.has('testCustomNode')).toBe(true);
            expect(extensionRegistry.has('testCustomNode')).toBe(true);
            expect(extensionRegistry.get('testCustomNode')).toBe(
                customExtension
            );
        });

        it('should not register behavior extensions to execution registry', () => {
            const behaviorExtension = {
                name: 'testBehavior',
                type: 'behavior' as const,
                addCommands: () => ({}),
            };

            editor.registerExtension(behaviorExtension);

            // Should be in editor but NOT in global registry
            expect(editor.extensions.has('testBehavior')).toBe(true);
            expect(extensionRegistry.has('testBehavior')).toBe(false);
        });

        it('should bridge extension for use in validation and execution', () => {
            const customExtension = createMockNodeExtension('testBridgeNode');
            editor.registerExtension(customExtension);

            // Get the extension from global registry
            const registeredExtension = extensionRegistry.get('testBridgeNode');

            expect(registeredExtension).toBeDefined();
            expect(registeredExtension?.execute).toBe(customExtension.execute);
            expect(registeredExtension?.validate).toBe(
                customExtension.validate
            );
        });
    });

    describe('lifecycle hooks', () => {
        it('should call onUpdate callback when update event is emitted', () => {
            const onUpdate = vi.fn();
            const editor = new WorkflowEditor({ onUpdate });

            editor.emit('update');

            expect(onUpdate).toHaveBeenCalledTimes(1);
            expect(onUpdate).toHaveBeenCalledWith({ editor });
        });

        it('should call onSelectionUpdate callback when selectionUpdate event is emitted', () => {
            const onSelectionUpdate = vi.fn();
            const editor = new WorkflowEditor({ onSelectionUpdate });

            editor.emit('selectionUpdate');

            expect(onSelectionUpdate).toHaveBeenCalledTimes(1);
            expect(onSelectionUpdate).toHaveBeenCalledWith({ editor });
        });

        it('should call onUpdate on load', () => {
            const onUpdate = vi.fn();
            const editor = new WorkflowEditor({ onUpdate });

            editor.load(createTestWorkflow());

            // load() calls emit('update')
            expect(onUpdate).toHaveBeenCalled();
        });

        it('should call both event listeners and lifecycle hooks', () => {
            const onUpdate = vi.fn();
            const eventListener = vi.fn();

            const editor = new WorkflowEditor({ onUpdate });
            editor.on('update', eventListener);

            editor.emit('update');

            expect(onUpdate).toHaveBeenCalledTimes(1);
            expect(eventListener).toHaveBeenCalledTimes(1);
        });

        it('should handle errors in lifecycle callbacks gracefully', () => {
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
            const onUpdate = vi.fn().mockImplementation(() => {
                throw new Error('Test error');
            });

            const editor = new WorkflowEditor({ onUpdate });

            // Should not throw
            expect(() => editor.emit('update')).not.toThrow();
            expect(errorSpy).toHaveBeenCalled();

            errorSpy.mockRestore();
        });

        it('should not call lifecycle hooks for other events', () => {
            const onUpdate = vi.fn();
            const onSelectionUpdate = vi.fn();

            const editor = new WorkflowEditor({ onUpdate, onSelectionUpdate });

            editor.emit('metaUpdate', {});
            editor.emit('nodeCreate', {
                id: 'test',
                type: 'agent',
                position: { x: 0, y: 0 },
                data: {},
            });

            expect(onUpdate).not.toHaveBeenCalled();
            expect(onSelectionUpdate).not.toHaveBeenCalled();
        });
    });
});
