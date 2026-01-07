import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useUpstreamResolver } from '../useUpstreamResolver';
import { WorkflowEditor, WorkflowNode, WorkflowEdge } from 'or3-workflow-core';

// Mock WorkflowEditor
const createMockEditor = (nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
    return {
        nodes,
        edges,
    } as unknown as WorkflowEditor;
};

describe('useUpstreamResolver', () => {
    it('should resolve single upstream node', () => {
        const nodes = [
            {
                id: 'agent-1',
                type: 'agent',
                data: { label: 'Agent 1' },
                position: { x: 0, y: 0 },
            },
            {
                id: 'output-1',
                type: 'output',
                data: {},
                position: { x: 0, y: 100 },
            },
        ] as WorkflowNode[];
        const edges = [
            { id: 'e1', source: 'agent-1', target: 'output-1' },
        ] as WorkflowEdge[];

        const editorRef = ref(createMockEditor(nodes, edges));
        const resolver = useUpstreamResolver(editorRef, 'output-1');

        expect(resolver.value).toHaveLength(1);
        expect(resolver.value[0].type).toBe('single');
        expect(resolver.value[0].sources[0].id).toBe('agent-1');
    });

    it('should group parallel branches', () => {
        const nodes = [
            {
                id: 'parallel-1',
                type: 'parallel',
                data: {
                    label: 'Parallel',
                    branches: [
                        { id: 'b1', label: 'Branch 1' },
                        { id: 'b2', label: 'Branch 2' },
                    ],
                },
                position: { x: 0, y: 0 },
            },
            {
                id: 'agent-1',
                type: 'agent',
                data: { label: 'Agent 1' },
                position: { x: 0, y: 100 },
            },
            {
                id: 'agent-2',
                type: 'agent',
                data: { label: 'Agent 2' },
                position: { x: 100, y: 100 },
            },
            {
                id: 'output-1',
                type: 'output',
                data: {},
                position: { x: 50, y: 200 },
            },
        ] as WorkflowNode[];

        const edges = [
            {
                id: 'e1',
                source: 'parallel-1',
                target: 'agent-1',
                sourceHandle: 'b1',
            },
            {
                id: 'e2',
                source: 'parallel-1',
                target: 'agent-2',
                sourceHandle: 'b2',
            },
            { id: 'e3', source: 'agent-1', target: 'output-1' },
            { id: 'e4', source: 'agent-2', target: 'output-1' },
        ] as WorkflowEdge[];

        const editorRef = ref(createMockEditor(nodes, edges));
        const resolver = useUpstreamResolver(editorRef, 'output-1');

        expect(resolver.value).toHaveLength(1);
        expect(resolver.value[0].type).toBe('parallel');
        expect(resolver.value[0].label).toBe('Parallel');
        expect(resolver.value[0].sources).toHaveLength(2);

        const s1 = resolver.value[0].sources.find((s) => s.id === 'agent-1');
        const s2 = resolver.value[0].sources.find((s) => s.id === 'agent-2');

        expect(s1?.branchLabel).toBe('Branch 1');
        expect(s2?.branchLabel).toBe('Branch 2');
    });
});
