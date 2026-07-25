import { describe, it, expect } from 'vitest';
import { createSupervisorTemplate } from '../supervisor';
import { validateWorkflow } from '../validation';
// Importing execution registers the standard node extensions in the default registry.
import '../execution';

describe('supervisor template (R9.AC1)', () => {
    it('composes routed delegation from ordinary primitives', () => {
        const wf = createSupervisorTemplate({
            name: 'Support Supervisor',
            supervisorModel: 'openai/gpt-4o',
            workers: [
                {
                    id: 'billing',
                    label: 'Billing',
                    kind: 'agent',
                    prompt: 'Handle billing',
                    permissions: ['billing:read'],
                },
                {
                    id: 'tech',
                    label: 'Tech',
                    kind: 'agent',
                    prompt: 'Handle tech',
                },
            ],
        });
        const types = wf.nodes.map((n) => n.type).sort();
        expect(types).toContain('start');
        expect(types).toContain('router');
        expect(types).toContain('agent');
        expect(types).toContain('output');
        // Router edges carry the worker id as sourceHandle.
        const routed = wf.edges.filter((e) => e.source === 'supervisor');
        expect(routed.some((e) => e.sourceHandle === 'billing')).toBe(true);
    });

    it('fans out subflow workers without duplicating them as LLM branches', () => {
        const wf = createSupervisorTemplate({
            name: 'Parallel Supervisor',
            parallel: true,
            workers: [
                { id: 'a', label: 'A', kind: 'subflow', subflowId: 'sub-a' },
                { id: 'b', label: 'B', kind: 'subflow', subflowId: 'sub-b' },
            ],
        });
        expect(wf.nodes.some((n) => n.type === 'parallel')).toBe(false);
        expect(wf.nodes.filter((n) => n.type === 'subflow')).toHaveLength(2);
        expect(
            wf.edges.filter(
                (edge) =>
                    edge.source === 'start' &&
                    edge.target.startsWith('worker-')
            )
        ).toHaveLength(2);
    });

    it('runs agent branches and subflow workers in the same DAG fan-out', () => {
        const wf = createSupervisorTemplate({
            name: 'Mixed Parallel Supervisor',
            parallel: true,
            workers: [
                { id: 'agent', label: 'Agent', kind: 'agent' },
                {
                    id: 'subflow',
                    label: 'Subflow',
                    kind: 'subflow',
                    subflowId: 'subflow-id',
                },
            ],
        });
        const parallel = wf.nodes.find((node) => node.type === 'parallel');
        expect(parallel).toBeDefined();
        expect(
            (parallel?.data as { branches?: unknown[] }).branches
        ).toHaveLength(1);
        expect(
            wf.edges.some(
                (edge) =>
                    edge.source === 'start' &&
                    edge.target === 'worker-subflow'
            )
        ).toBe(true);
    });

    it('inserts a HITL approval node when requested', () => {
        const wf = createSupervisorTemplate({
            name: 'Approved Supervisor',
            requireApproval: true,
            workers: [{ id: 'a', label: 'A', kind: 'agent' }],
        });
        const approval = wf.nodes.find((n) => n.id === 'approval');
        expect(approval).toBeTruthy();
        expect((approval?.data as { hitl?: { enabled?: boolean } }).hitl?.enabled).toBe(
            true
        );
    });

    it('throws without workers', () => {
        expect(() =>
            createSupervisorTemplate({ name: 'x', workers: [] })
        ).toThrow();
    });

    it('generates a structurally valid workflow graph', () => {
        const wf = createSupervisorTemplate({
            name: 'Valid Supervisor',
            workers: [
                { id: 'a', label: 'A', kind: 'agent', model: 'openai/gpt-4o', prompt: 'a' },
            ],
        });
        const result = validateWorkflow(wf.nodes, wf.edges);
        // The composite should not produce structural errors.
        expect(result.errors).toEqual([]);
    });
});
