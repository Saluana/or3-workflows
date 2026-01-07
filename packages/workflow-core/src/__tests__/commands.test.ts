import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowEditor } from '../editor';
import type { WorkflowData } from '../types';

const createTestWorkflow = (): WorkflowData => ({
    meta: { version: '2.0.0', name: 'Test' },
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
            data: { label: 'Agent', model: 'test', prompt: '' },
        },
    ],
    edges: [{ id: 'edge-1', source: 'start-1', target: 'agent-1' }],
});

describe('CommandManager', () => {
    let editor: WorkflowEditor;

    beforeEach(() => {
        editor = new WorkflowEditor({ content: createTestWorkflow() });
    });

    describe('createNode', () => {
        it('should create a new node', () => {
            const initialCount = editor.nodes.length;

            editor.commands.createNode('agent', { label: 'New Agent' });

            expect(editor.nodes.length).toBe(initialCount + 1);
        });

        it('should create node with default position', () => {
            editor.commands.createNode('agent', { label: 'Test' });

            const newNode = editor.nodes[editor.nodes.length - 1];
            expect(newNode.position).toEqual({ x: 0, y: 0 });
        });

        it('should create node with custom position', () => {
            editor.commands.createNode(
                'agent',
                { label: 'Test' },
                { x: 100, y: 200 }
            );

            const newNode = editor.nodes[editor.nodes.length - 1];
            expect(newNode.position).toEqual({ x: 100, y: 200 });
        });

        it('should emit nodeCreate event', () => {
            const callback = vi.fn();
            editor.on('nodeCreate', callback);

            editor.commands.createNode('agent', { label: 'Test' });

            expect(callback).toHaveBeenCalled();
        });

        it('should emit update event', () => {
            const callback = vi.fn();
            editor.on('update', callback);

            editor.commands.createNode('agent', { label: 'Test' });

            expect(callback).toHaveBeenCalled();
        });

        it('should push to history', async () => {
            // Wait for debounce period to pass
            await new Promise((resolve) => setTimeout(resolve, 350));
            editor.commands.createNode('agent', { label: 'Test' });

            expect(editor.canUndo()).toBe(true);
        });
    });

    describe('deleteNode', () => {
        it('should delete an existing node', () => {
            const initialCount = editor.nodes.length;

            editor.commands.deleteNode('agent-1');

            expect(editor.nodes.length).toBe(initialCount - 1);
        });

        it('should return false for non-existent node', () => {
            const result = editor.commands.deleteNode('non-existent');

            expect(result).toBe(false);
        });

        it('should delete connected edges', () => {
            expect(editor.edges.length).toBe(1);

            editor.commands.deleteNode('agent-1');

            expect(editor.edges.length).toBe(0);
        });

        it('should emit nodeDelete event', () => {
            const callback = vi.fn();
            editor.on('nodeDelete', callback);

            editor.commands.deleteNode('agent-1');

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('updateNodeData', () => {
        it('should update node data', () => {
            editor.commands.updateNodeData('agent-1', {
                label: 'Updated Agent',
            });

            const node = editor.nodes.find((n) => n.id === 'agent-1');
            expect(node?.data.label).toBe('Updated Agent');
        });

        it('should merge with existing data', () => {
            editor.commands.updateNodeData('agent-1', { temperature: 0.7 });

            const node = editor.nodes.find((n) => n.id === 'agent-1');
            expect(node?.data.label).toBe('Agent'); // Original preserved
            expect((node?.data as any).temperature).toBe(0.7); // New added
        });

        it('should return false for non-existent node', () => {
            const result = editor.commands.updateNodeData('non-existent', {
                label: 'Test',
            });

            expect(result).toBe(false);
        });

        it('should emit nodeUpdate event', () => {
            const callback = vi.fn();
            editor.on('nodeUpdate', callback);

            editor.commands.updateNodeData('agent-1', { label: 'Updated' });

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('duplicateNode', () => {
        it('should duplicate a node', () => {
            const initialCount = editor.nodes.length;

            editor.commands.duplicateNode('agent-1');

            expect(editor.nodes.length).toBe(initialCount + 1);
        });

        it('should offset the duplicated node position', () => {
            const original = editor.nodes.find((n) => n.id === 'agent-1')!;

            editor.commands.duplicateNode('agent-1');

            const duplicate = editor.nodes[editor.nodes.length - 1];
            expect(duplicate.position.x).toBe(original.position.x + 20);
            expect(duplicate.position.y).toBe(original.position.y + 20);
        });

        it('should copy node data', () => {
            editor.commands.duplicateNode('agent-1');

            const duplicate = editor.nodes[editor.nodes.length - 1];
            expect(duplicate.data.label).toBe('Agent');
        });

        it('should return false for non-existent node', () => {
            const result = editor.commands.duplicateNode('non-existent');

            expect(result).toBe(false);
        });
    });

    describe('setNodePosition', () => {
        it('should update node position', () => {
            editor.commands.setNodePosition('agent-1', { x: 500, y: 300 });

            const node = editor.nodes.find((n) => n.id === 'agent-1');
            expect(node?.position).toEqual({ x: 500, y: 300 });
        });

        it('should return false for non-existent node', () => {
            const result = editor.commands.setNodePosition('non-existent', {
                x: 0,
                y: 0,
            });

            expect(result).toBe(false);
        });
    });

    describe('createEdge', () => {
        it('should create a new edge', () => {
            // Add another node first
            editor.commands.createNode('agent', { label: 'Agent 2' });
            const newNode = editor.nodes[editor.nodes.length - 1];
            const initialEdgeCount = editor.edges.length;

            editor.commands.createEdge('agent-1', newNode.id);

            expect(editor.edges.length).toBe(initialEdgeCount + 1);
        });

        it('should set source and target', () => {
            editor.commands.createNode('agent', { label: 'Agent 2' });
            const newNode = editor.nodes[editor.nodes.length - 1];

            editor.commands.createEdge('agent-1', newNode.id);

            const edge = editor.edges[editor.edges.length - 1];
            expect(edge.source).toBe('agent-1');
            expect(edge.target).toBe(newNode.id);
        });

        it('should set handles if provided', () => {
            editor.commands.createNode('agent', { label: 'Agent 2' });
            const newNode = editor.nodes[editor.nodes.length - 1];

            // Use valid handle names: 'output' for agent output, 'input' for agent input
            editor.commands.createEdge(
                'agent-1',
                newNode.id,
                'output',
                'input'
            );

            const edge = editor.edges[editor.edges.length - 1];
            expect(edge.sourceHandle).toBe('output');
            expect(edge.targetHandle).toBe('input');
        });

        it('should emit edgeCreate event', () => {
            const callback = vi.fn();
            editor.on('edgeCreate', callback);

            editor.commands.createNode('agent', { label: 'Agent 2' });
            const newNode = editor.nodes[editor.nodes.length - 1];
            editor.commands.createEdge('agent-1', newNode.id);

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('deleteEdge', () => {
        it('should delete an existing edge', () => {
            const initialCount = editor.edges.length;

            editor.commands.deleteEdge('edge-1');

            expect(editor.edges.length).toBe(initialCount - 1);
        });

        it('should return false for non-existent edge', () => {
            const result = editor.commands.deleteEdge('non-existent');

            expect(result).toBe(false);
        });

        it('should emit edgeDelete event', () => {
            const callback = vi.fn();
            editor.on('edgeDelete', callback);

            editor.commands.deleteEdge('edge-1');

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('selectNode', () => {
        it('should select a node', () => {
            editor.commands.selectNode('agent-1');

            const node = editor.nodes.find((n) => n.id === 'agent-1');
            expect(node?.selected).toBe(true);
        });

        it('should deselect other nodes by default', () => {
            editor.commands.selectNode('start-1');
            editor.commands.selectNode('agent-1');

            const start = editor.nodes.find((n) => n.id === 'start-1');
            const agent = editor.nodes.find((n) => n.id === 'agent-1');

            expect(start?.selected).toBe(false);
            expect(agent?.selected).toBe(true);
        });

        it('should support additive selection', () => {
            editor.commands.selectNode('start-1');
            editor.commands.selectNode('agent-1', true);

            const start = editor.nodes.find((n) => n.id === 'start-1');
            const agent = editor.nodes.find((n) => n.id === 'agent-1');

            expect(start?.selected).toBe(true);
            expect(agent?.selected).toBe(true);
        });

        it('should emit selectionUpdate event', () => {
            const callback = vi.fn();
            editor.on('selectionUpdate', callback);

            editor.commands.selectNode('agent-1');

            expect(callback).toHaveBeenCalled();
        });
    });

    describe('deselectAll', () => {
        it('should deselect all nodes', () => {
            editor.commands.selectNode('start-1');
            editor.commands.selectNode('agent-1', true);

            editor.commands.deselectAll();

            const selected = editor.getSelected();
            expect(selected.nodes).toHaveLength(0);
        });
    });

    describe('undo/redo', () => {
        it('should undo last command', async () => {
            const initialCount = editor.nodes.length;
            await new Promise((resolve) => setTimeout(resolve, 350)); // Wait for debounce
            editor.commands.createNode('agent', { label: 'Test' });

            editor.commands.undo();

            expect(editor.nodes.length).toBe(initialCount);
        });

        it('should redo undone command', async () => {
            await new Promise((resolve) => setTimeout(resolve, 350)); // Wait for debounce
            editor.commands.createNode('agent', { label: 'Test' });
            const afterCreate = editor.nodes.length;

            editor.commands.undo();
            editor.commands.redo();

            expect(editor.nodes.length).toBe(afterCreate);
        });

        it('should return false when nothing to undo', () => {
            // Clear history by reloading
            editor.load(createTestWorkflow());

            const result = editor.commands.undo();

            expect(result).toBe(false);
        });

        it('should return false when nothing to redo', () => {
            const result = editor.commands.redo();

            expect(result).toBe(false);
        });
    });

    describe('immutability', () => {
        it('selectNode should not mutate existing nodes array', () => {
            const originalNodes = editor.nodes;

            editor.commands.selectNode('agent-1');

            expect(editor.nodes).not.toBe(originalNodes);
        });

        it('selectNode should create new node objects', () => {
            const originalNode = editor.nodes.find((n) => n.id === 'agent-1');

            editor.commands.selectNode('agent-1');

            const newNode = editor.nodes.find((n) => n.id === 'agent-1');
            expect(newNode).not.toBe(originalNode);
            expect(newNode?.selected).toBe(true);
        });

        it('deselectAll should not mutate existing nodes array', () => {
            editor.commands.selectNode('agent-1');
            const originalNodes = editor.nodes;

            editor.commands.deselectAll();

            expect(editor.nodes).not.toBe(originalNodes);
        });

        it('updateNodeData should not mutate existing node', () => {
            const originalNode = editor.nodes.find((n) => n.id === 'agent-1');
            const originalData = originalNode?.data;

            editor.commands.updateNodeData('agent-1', { label: 'Updated' });

            const updatedNode = editor.nodes.find((n) => n.id === 'agent-1');
            expect(updatedNode).not.toBe(originalNode);
            expect(updatedNode?.data).not.toBe(originalData);
        });

        it('setNodePosition should not mutate existing node', () => {
            const originalNode = editor.nodes.find((n) => n.id === 'agent-1');

            editor.commands.setNodePosition('agent-1', { x: 500, y: 500 });

            const updatedNode = editor.nodes.find((n) => n.id === 'agent-1');
            expect(updatedNode).not.toBe(originalNode);
        });

        it('updateEdgeData should not mutate existing edge', () => {
            const originalEdge = editor.edges.find((e) => e.id === 'edge-1');

            editor.commands.updateEdgeData('edge-1', { label: 'Updated' });

            const updatedEdge = editor.edges.find((e) => e.id === 'edge-1');
            expect(updatedEdge).not.toBe(originalEdge);
        });
    });

    describe('debounced history', () => {
        it('should batch rapid updateNodeData calls into single history entry', async () => {
            // Clear history
            editor.load(createTestWorkflow());
            await new Promise((resolve) => setTimeout(resolve, 350));

            // Rapid updates
            editor.commands.updateNodeData('agent-1', { label: 'Update 1' });
            editor.commands.updateNodeData('agent-1', { label: 'Update 2' });
            editor.commands.updateNodeData('agent-1', { label: 'Update 3' });

            // Wait for debounce to settle
            await new Promise((resolve) => setTimeout(resolve, 350));

            // Should have only one undo available (the batched update)
            expect(editor.canUndo()).toBe(true);
            editor.commands.undo();
            expect(editor.canUndo()).toBe(false);
        });

        it('commitHistory should flush pending history immediately', async () => {
            editor.load(createTestWorkflow());
            await new Promise((resolve) => setTimeout(resolve, 350));

            editor.commands.updateNodeData('agent-1', { label: 'Update 1' });
            editor.commands.commitHistory();

            // Should be immediately undoable without waiting
            expect(editor.canUndo()).toBe(true);
        });

        it('should batch setNodePosition calls during drag', async () => {
            editor.load(createTestWorkflow());
            await new Promise((resolve) => setTimeout(resolve, 350));

            // Simulate drag with many position updates
            for (let i = 0; i < 10; i++) {
                editor.commands.setNodePosition('agent-1', {
                    x: i * 10,
                    y: i * 10,
                });
            }

            await new Promise((resolve) => setTimeout(resolve, 350));

            // Single undo should restore to original
            editor.commands.undo();
            const node = editor.nodes.find((n) => n.id === 'agent-1');
            expect(node?.position).toEqual({ x: 200, y: 0 });
        });
    });

    describe('duplicateNode', () => {
        it('should deep clone node data', () => {
            // Add a node with nested data
            editor.commands.createNode('agent', {
                label: 'Test',
                model: 'test-model',
                prompt: 'test prompt',
                tools: ['tool1', 'tool2'],
            });
            const originalNode = editor.nodes[editor.nodes.length - 1];

            editor.commands.duplicateNode(originalNode.id);

            const duplicatedNode = editor.nodes[editor.nodes.length - 1];

            // Should have same values
            expect(duplicatedNode.data.label).toBe(originalNode.data.label);

            // But be different objects (deep clone)
            expect(duplicatedNode.data).not.toBe(originalNode.data);

            // Nested arrays should also be cloned
            if (
                'tools' in duplicatedNode.data &&
                'tools' in originalNode.data
            ) {
                expect(duplicatedNode.data.tools).not.toBe(
                    originalNode.data.tools
                );
                expect(duplicatedNode.data.tools).toEqual(
                    originalNode.data.tools
                );
            }
        });

        it('should offset position', () => {
            const originalNode = editor.nodes.find((n) => n.id === 'agent-1')!;

            editor.commands.duplicateNode('agent-1');

            const duplicatedNode = editor.nodes[editor.nodes.length - 1];
            expect(duplicatedNode.position.x).toBe(
                originalNode.position.x + 20
            );
            expect(duplicatedNode.position.y).toBe(
                originalNode.position.y + 20
            );
        });

        it('should not select duplicated node', () => {
            editor.commands.duplicateNode('agent-1');

            const duplicatedNode = editor.nodes[editor.nodes.length - 1];
            expect(duplicatedNode.selected).toBe(false);
        });
    });

    describe('Zod validation', () => {
        it('should reject invalid edge label (too long)', () => {
            const result = editor.commands.updateEdgeData('edge-1', {
                label: 'a'.repeat(101), // exceeds 100 char limit
            });

            expect(result).toBe(false);
        });

        it('should reject invalid temperature (out of range)', () => {
            const result = editor.commands.updateNodeData('agent-1', {
                temperature: 3, // exceeds max of 2
            });

            expect(result).toBe(false);
        });

        it('should reject negative maxTokens', () => {
            const result = editor.commands.updateNodeData('agent-1', {
                maxTokens: -100,
            });

            expect(result).toBe(false);
        });

        it('should accept valid node data update', () => {
            const result = editor.commands.updateNodeData('agent-1', {
                label: 'Valid Label',
                temperature: 0.7,
                maxTokens: 1000,
            });

            expect(result).toBe(true);
        });
    });

    describe('validation integration', () => {
        it('should reject deleting the only start node', () => {
            const initialCount = editor.nodes.length;

            const result = editor.commands.deleteNode('start-1');

            expect(result).toBe(false);
            expect(editor.nodes.length).toBe(initialCount);
            expect(editor.nodes.some((n) => n.id === 'start-1')).toBe(true);
        });

        it('should reject creating a second start node', () => {
            const initialCount = editor.nodes.length;

            const result = editor.commands.createNode('start', {
                label: 'New',
            });

            expect(result).toBe(false);
            expect(editor.nodes.length).toBe(initialCount);
        });

        it('should reject edges that create cycles', () => {
            const initialEdges = editor.edges.length;

            const result = editor.commands.createEdge('agent-1', 'start-1');

            expect(result).toBe(false);
            expect(editor.edges.length).toBe(initialEdges);
        });

        it('should reject edges with missing endpoints', () => {
            const result = editor.commands.createEdge('missing', 'start-1');

            expect(result).toBe(false);
        });

        it('should allow adding disconnected nodes for incremental editing', () => {
            const result = editor.commands.createNode('agent', {
                label: 'Floating',
            });

            expect(result).toBe(true);
            expect(editor.nodes.some((n) => n.data.label === 'Floating')).toBe(
                true
            );
        });
    });
});
