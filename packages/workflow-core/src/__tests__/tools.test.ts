import { describe, it, expect, vi } from 'vitest';
import {
    planToolBatch,
    decideDisposition,
    executeToolBatch,
    adaptExecutableTool,
    adaptRegisteredTool,
    providerServerTool,
    toModelToolDescriptor,
    WorkflowToolRegistry,
    DEFAULT_TOOL_POLICY,
    type WorkflowTool,
    type ToolExecutionPolicy,
    type ToolReceipt,
} from '../tools';

function tool(
    name: string,
    overrides: Partial<WorkflowTool['descriptor']> = {},
    execute?: WorkflowTool['execute']
): WorkflowTool {
    return {
        descriptor: {
            name,
            inputSchema: { type: 'object', properties: {} },
            authority: 'host-client',
            sideEffect: 'none',
            approval: 'never',
            parallelSafe: true,
            ...overrides,
        },
        execute,
    };
}

describe('policy: disposition (R5.AC4)', () => {
    it('rejects unknown tools', () => {
        expect(decideDisposition(undefined, DEFAULT_TOOL_POLICY).disposition).toBe(
            'reject'
        );
    });
    it('always-approval requires approval', () => {
        const d = decideDisposition(tool('t', { approval: 'always' }), {
            mode: 'parallel',
            defaultApproval: 'auto',
        });
        expect(d.disposition).toBe('approve');
    });
    it('destructive policy tools require approval', () => {
        const d = decideDisposition(
            tool('t', { approval: 'policy', sideEffect: 'destructive' }),
            { mode: 'parallel', defaultApproval: 'auto' }
        );
        expect(d.disposition).toBe('approve');
    });
    it('never-approval executes', () => {
        expect(
            decideDisposition(tool('t', { approval: 'never' }), DEFAULT_TOOL_POLICY)
                .disposition
        ).toBe('execute');
    });
});

describe('policy: batch planning (R5.AC3)', () => {
    const parallelPolicy: ToolExecutionPolicy = {
        mode: 'parallel',
        maxConcurrency: 4,
        defaultApproval: 'auto',
    };
    const resolve = (n: string) =>
        n === 'safe'
            ? tool('safe', { parallelSafe: true })
            : n === 'unsafe'
              ? tool('unsafe', { parallelSafe: false })
              : undefined;

    it('runs safe tools in parallel when the model permits', () => {
        const plan = planToolBatch(
            [
                { callId: '1', toolName: 'safe' },
                { callId: '2', toolName: 'safe' },
            ],
            resolve,
            { policy: parallelPolicy, parallelToolCalls: true }
        );
        expect(plan.mode).toBe('parallel');
    });

    it('serializes when a tool is not parallel-safe', () => {
        const plan = planToolBatch(
            [
                { callId: '1', toolName: 'safe' },
                { callId: '2', toolName: 'unsafe' },
            ],
            resolve,
            { policy: parallelPolicy, parallelToolCalls: true }
        );
        expect(plan.mode).toBe('sequential');
    });

    it('serializes when the model did not permit parallel calls', () => {
        const plan = planToolBatch(
            [
                { callId: '1', toolName: 'safe' },
                { callId: '2', toolName: 'safe' },
            ],
            resolve,
            { policy: parallelPolicy, parallelToolCalls: false }
        );
        expect(plan.mode).toBe('sequential');
    });
});

describe('executor (R5.AC4, R5.AC5)', () => {
    const signal = new AbortController().signal;

    it('executes a valid call and produces a receipt', async () => {
        const registry = new WorkflowToolRegistry();
        registry.register(
            tool(
                'echo',
                { inputSchema: { type: 'object', properties: {} } },
                async (input) => `ok:${JSON.stringify(input)}`
            )
        );
        const { outcomes } = await executeToolBatch(
            [{ callId: 'c1', toolName: 'echo', input: { a: 1 } }],
            {
                runId: 'r1',
                nodeId: 'n1',
                signal,
                resolve: (n) => registry.get(n),
                now: () => 123,
            }
        );
        expect(outcomes[0].status).toBe('succeeded');
        expect(outcomes[0].receipt?.at).toBe(123);
    });

    it('rejects invalid input before execution', async () => {
        const exec = vi.fn();
        const t = tool(
            'needsName',
            {
                inputSchema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                    required: ['name'],
                },
            },
            exec
        );
        const { outcomes } = await executeToolBatch(
            [{ callId: 'c1', toolName: 'needsName', input: {} }],
            { runId: 'r', nodeId: 'n', signal, resolve: () => t }
        );
        expect(outcomes[0].status).toBe('failed');
        expect(exec).not.toHaveBeenCalled();
    });

    it('does not mark invalid output as successful', async () => {
        const t = tool(
            'badout',
            {
                outputSchema: {
                    type: 'object',
                    properties: { n: { type: 'number' } },
                    required: ['n'],
                },
            },
            async () => ({ n: 'not-number' })
        );
        const { outcomes } = await executeToolBatch(
            [{ callId: 'c1', toolName: 'badout', input: {} }],
            { runId: 'r', nodeId: 'n', signal, resolve: () => t }
        );
        expect(outcomes[0].status).toBe('failed');
    });

    it('reuses a prior succeeded receipt (idempotency)', async () => {
        const exec = vi.fn(async () => 'fresh');
        const t = tool('once', {}, exec);
        const prior: ToolReceipt = {
            runId: 'r',
            callId: 'c1',
            toolName: 'once',
            authority: 'host-client',
            status: 'succeeded',
            result: 'cached',
            at: 1,
        };
        const { outcomes } = await executeToolBatch(
            [{ callId: 'c1', toolName: 'once', input: {} }],
            {
                runId: 'r',
                nodeId: 'n',
                signal,
                resolve: () => t,
                receiptStore: {
                    getToolReceipt: async () => prior,
                },
            }
        );
        expect(outcomes[0].status).toBe('reused');
        expect(outcomes[0].output).toBe('cached');
        expect(exec).not.toHaveBeenCalled();
    });

    it('gates approval-required tools through the approval gate', async () => {
        const t = tool('danger', { approval: 'always' }, async () => 'done');
        const gate = vi.fn(async () => false);
        const { outcomes } = await executeToolBatch(
            [{ callId: 'c1', toolName: 'danger', input: {} }],
            {
                runId: 'r',
                nodeId: 'n',
                signal,
                resolve: () => t,
                approvalGate: gate,
            }
        );
        expect(gate).toHaveBeenCalled();
        expect(outcomes[0].status).toBe('rejected');
    });
});

describe('adapters (R5.AC2, R5.AC6)', () => {
    it('adapts an executable tool with conservative defaults', () => {
        const wt = adaptExecutableTool({
            type: 'function',
            function: { name: 'foo', parameters: { type: 'object' } },
            handler: async () => 'x',
        });
        expect(wt.descriptor.authority).toBe('host-client');
        expect(wt.descriptor.approval).toBe('policy');
        expect(wt.descriptor.parallelSafe).toBe(false);
        expect(wt.execute).toBeTypeOf('function');
    });

    it('adapts a registered tool', () => {
        const wt = adaptRegisteredTool({
            id: 'r',
            name: 'reg',
            handler: async () => 'y',
        });
        expect(wt.descriptor.name).toBe('reg');
    });

    it('provider server tools have no execute and carry transport', () => {
        const wt = providerServerTool({ name: 'web', transport: 'chat' });
        expect(wt.execute).toBeUndefined();
        const md = toModelToolDescriptor(wt);
        expect(md.type).toBe('provider-server');
    });
});
