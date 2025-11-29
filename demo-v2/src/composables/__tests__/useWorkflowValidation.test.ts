import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../useWorkflowValidation';

describe('validateWorkflow', () => {
    describe('start node validation', () => {
        it('should error when no start node exists', () => {
            const nodes = [
                { id: 'agent-1', type: 'agent', data: { label: 'Agent' } },
            ];
            const edges: { id: string; source: string; target: string }[] = [];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    type: 'error',
                    message: 'Workflow must have a Start node',
                })
            );
        });

        it('should pass with exactly one start node', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                { id: 'agent-1', type: 'agent', data: { label: 'Agent' } },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.message.includes('Start'))
            ).toHaveLength(0);
        });
    });

    describe('connectivity validation', () => {
        it('should error when node is completely disconnected', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'Lonely Agent' },
                },
                {
                    id: 'agent-2',
                    type: 'agent',
                    data: { label: 'Connected Agent' },
                },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-2' }];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    type: 'error',
                    nodeId: 'agent-1',
                    message: expect.stringContaining('not connected'),
                })
            );
        });

        it('should warn when node has no incoming connections', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                { id: 'agent-1', type: 'agent', data: { label: 'No Input' } },
            ];
            // Agent has outgoing but no incoming
            const edges = [{ id: 'e1', source: 'agent-1', target: 'start-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    type: 'warning',
                    nodeId: 'agent-1',
                    message: expect.stringContaining('no incoming'),
                })
            );
        });

        it('should pass when all nodes are connected', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                { id: 'agent-1', type: 'agent', data: { label: 'Agent' } },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.message.includes('connected'))
            ).toHaveLength(0);
        });
    });

    describe('agent node validation', () => {
        it('should warn when agent has no prompt', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'No Prompt Agent' },
                },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    type: 'warning',
                    nodeId: 'agent-1',
                    message: expect.stringContaining('no system prompt'),
                })
            );
        });

        it('should warn when agent has empty prompt', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'Empty Prompt', prompt: '   ' },
                },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    type: 'warning',
                    nodeId: 'agent-1',
                })
            );
        });

        it('should pass when agent has prompt', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'Agent', prompt: 'You are helpful' },
                },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.warnings.filter((w) => w.nodeId === 'agent-1')
            ).toHaveLength(0);
        });
    });

    describe('cycle detection', () => {
        it('should warn when workflow contains a cycle', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                { id: 'agent-1', type: 'agent', data: { label: 'Agent 1' } },
                { id: 'agent-2', type: 'agent', data: { label: 'Agent 2' } },
            ];
            const edges = [
                { id: 'e1', source: 'start-1', target: 'agent-1' },
                { id: 'e2', source: 'agent-1', target: 'agent-2' },
                { id: 'e3', source: 'agent-2', target: 'agent-1' }, // Creates cycle
            ];

            const result = validateWorkflow(nodes, edges);

            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    type: 'warning',
                    message: expect.stringContaining('cycle'),
                })
            );
        });

        it('should not warn for acyclic workflow', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'Agent 1', prompt: 'test' },
                },
                {
                    id: 'agent-2',
                    type: 'agent',
                    data: { label: 'Agent 2', prompt: 'test' },
                },
            ];
            const edges = [
                { id: 'e1', source: 'start-1', target: 'agent-1' },
                { id: 'e2', source: 'agent-1', target: 'agent-2' },
            ];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.warnings.filter((w) => w.message.includes('cycle'))
            ).toHaveLength(0);
        });
    });

    describe('overall validation', () => {
        it('should return isValid=true for valid workflow', () => {
            const nodes = [
                { id: 'start-1', type: 'start', data: { label: 'Start' } },
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'Agent', prompt: 'test' },
                },
            ];
            const edges = [{ id: 'e1', source: 'start-1', target: 'agent-1' }];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(true);
        });

        it('should return isValid=false for invalid workflow', () => {
            const nodes = [
                { id: 'agent-1', type: 'agent', data: { label: 'Agent' } },
            ];
            const edges: { id: string; source: string; target: string }[] = [];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
        });

        it('should handle empty workflow', () => {
            const result = validateWorkflow([], []);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should collect multiple errors and warnings', () => {
            const nodes = [
                {
                    id: 'agent-1',
                    type: 'agent',
                    data: { label: 'Disconnected' },
                },
                {
                    id: 'agent-2',
                    type: 'agent',
                    data: { label: 'Also Disconnected' },
                },
            ];
            const edges: { id: string; source: string; target: string }[] = [];

            const result = validateWorkflow(nodes, edges);

            // No start node + 2 disconnected nodes = at least 3 errors
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
        });
    });
});
