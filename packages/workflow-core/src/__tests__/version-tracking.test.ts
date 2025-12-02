import { describe, it, expect, beforeEach } from 'vitest';
import { createWorkflowEditor, WorkflowEditor } from '../editor';
import type { WorkflowData } from '../types';

describe('WorkflowEditor Version Tracking', () => {
    let editor: WorkflowEditor;

    beforeEach(() => {
        editor = createWorkflowEditor();
    });

    describe('node version tracking', () => {
        it('should start with version 0 for new nodes', () => {
            editor.commands.createNode('agent', { label: 'Test' });
            const nodeId = editor.nodes[0].id;

            // After creation, version should be 1 (incremented on create)
            expect(editor.getNodeVersion(nodeId)).toBe(1);
        });

        it('should increment version on node data update', () => {
            editor.commands.createNode('agent', { label: 'Test' });
            const nodeId = editor.nodes[0].id;
            const initialVersion = editor.getNodeVersion(nodeId);

            editor.commands.updateNodeData(nodeId, { label: 'Updated' });

            expect(editor.getNodeVersion(nodeId)).toBe(initialVersion + 1);
        });

        it('should increment version on position change', () => {
            editor.commands.createNode('agent', { label: 'Test' });
            const nodeId = editor.nodes[0].id;
            const initialVersion = editor.getNodeVersion(nodeId);

            editor.commands.setNodePosition(nodeId, { x: 100, y: 100 });

            expect(editor.getNodeVersion(nodeId)).toBe(initialVersion + 1);
        });

        it('should increment version on selection change', () => {
            editor.commands.createNode('agent', { label: 'Test' });
            const nodeId = editor.nodes[0].id;
            const initialVersion = editor.getNodeVersion(nodeId);

            editor.commands.selectNode(nodeId);

            expect(editor.getNodeVersion(nodeId)).toBe(initialVersion + 1);
        });

        it('should remove version tracking on node delete', () => {
            editor.commands.createNode('agent', { label: 'Test' });
            const nodeId = editor.nodes[0].id;

            expect(editor.getNodeVersion(nodeId)).toBeGreaterThan(0);

            editor.commands.deleteNode(nodeId);

            // After deletion, version should be 0 (default for non-existent)
            expect(editor.getNodeVersion(nodeId)).toBe(0);
        });

        it('should return 0 for non-existent node', () => {
            expect(editor.getNodeVersion('non-existent')).toBe(0);
        });
    });

    describe('edge version tracking', () => {
        beforeEach(() => {
            editor.commands.createNode('start', { label: 'Start' });
            editor.commands.createNode('agent', { label: 'Agent' });
        });

        it('should track version for new edges', () => {
            const sourceId = editor.nodes[0].id;
            const targetId = editor.nodes[1].id;

            editor.commands.createEdge(sourceId, targetId);
            const edgeId = editor.edges[0].id;

            expect(editor.getEdgeVersion(edgeId)).toBe(1);
        });

        it('should increment version on edge data update', () => {
            const sourceId = editor.nodes[0].id;
            const targetId = editor.nodes[1].id;

            editor.commands.createEdge(sourceId, targetId);
            const edgeId = editor.edges[0].id;
            const initialVersion = editor.getEdgeVersion(edgeId);

            editor.commands.updateEdgeData(edgeId, { label: 'Updated' });

            expect(editor.getEdgeVersion(edgeId)).toBe(initialVersion + 1);
        });

        it('should remove version tracking on edge delete', () => {
            const sourceId = editor.nodes[0].id;
            const targetId = editor.nodes[1].id;

            editor.commands.createEdge(sourceId, targetId);
            const edgeId = editor.edges[0].id;

            expect(editor.getEdgeVersion(edgeId)).toBeGreaterThan(0);

            editor.commands.deleteEdge(edgeId);

            expect(editor.getEdgeVersion(edgeId)).toBe(0);
        });

        it('should clean up edge versions when node is deleted', () => {
            const sourceId = editor.nodes[0].id;
            const targetId = editor.nodes[1].id;

            editor.commands.createEdge(sourceId, targetId);
            const edgeId = editor.edges[0].id;

            expect(editor.getEdgeVersion(edgeId)).toBeGreaterThan(0);

            // Delete target node (agent) - should also delete connected edge
            // Note: Cannot delete start node as it would leave workflow invalid
            editor.commands.deleteNode(targetId);

            expect(editor.getEdgeVersion(edgeId)).toBe(0);
        });
    });

    describe('global version tracking', () => {
        it('should increment on any node change', () => {
            const initialVersion = editor.getGlobalVersion();

            editor.commands.createNode('agent', { label: 'Test' });

            expect(editor.getGlobalVersion()).toBeGreaterThan(initialVersion);
        });

        it('should increment on any edge change', () => {
            editor.commands.createNode('start', { label: 'Start' });
            editor.commands.createNode('agent', { label: 'Agent' });

            const versionAfterNodes = editor.getGlobalVersion();

            editor.commands.createEdge(editor.nodes[0].id, editor.nodes[1].id);

            expect(editor.getGlobalVersion()).toBeGreaterThan(
                versionAfterNodes
            );
        });

        it('should be useful for quick change detection', () => {
            // Create a workflow with many nodes
            for (let i = 0; i < 10; i++) {
                editor.commands.createNode('agent', { label: `Node ${i}` });
            }

            const versionBefore = editor.getGlobalVersion();

            // No changes - version should be same
            expect(editor.getGlobalVersion()).toBe(versionBefore);

            // Make one change
            editor.commands.updateNodeData(editor.nodes[0].id, {
                label: 'Updated',
            });

            // Version should have changed
            expect(editor.getGlobalVersion()).toBeGreaterThan(versionBefore);
        });
    });

    describe('performance characteristics', () => {
        it('should handle 100+ nodes efficiently', () => {
            const nodeCount = 150;

            // Create many nodes
            for (let i = 0; i < nodeCount; i++) {
                editor.commands.createNode('agent', { label: `Node ${i}` });
            }

            expect(editor.nodes.length).toBe(nodeCount);

            // Version lookups should be O(1)
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const nodeId = editor.nodes[i % nodeCount].id;
                editor.getNodeVersion(nodeId);
            }
            const elapsed = performance.now() - start;

            // 1000 lookups should be very fast (< 10ms)
            expect(elapsed).toBeLessThan(10);
        });

        it('should provide O(1) fingerprint generation', () => {
            // Create nodes
            for (let i = 0; i < 100; i++) {
                editor.commands.createNode('agent', { label: `Node ${i}` });
            }

            // Version-based fingerprint is O(1) - just a map lookup + string concat
            const nodeId = editor.nodes[0].id;

            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                const version = editor.getNodeVersion(nodeId);
                const fingerprint = `${version}:idle`;
            }
            const elapsed = performance.now() - start;

            // 10000 fingerprints should be very fast (< 50ms)
            expect(elapsed).toBeLessThan(50);
        });
    });
});
