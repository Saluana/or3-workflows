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

    it('produces parallel delegation with subflow workers scoping child paths', () => {
        const wf = createSupervisorTemplate({
            name: 'Parallel Supervisor',
            parallel: true,
            workers: [
                { id: 'a', label: 'A', kind: 'subflow', subflowId: 'sub-a' },
                { id: 'b', label: 'B', kind: 'subflow', subflowId: 'sub-b' },
            ],
        });
        expect(wf.nodes.some((n) => n.type === 'parallel')).toBe(true);
        expect(wf.nodes.filter((n) => n.type === 'subflow')).toHaveLength(2);
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
