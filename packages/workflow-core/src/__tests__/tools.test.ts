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
import { InMemoryRunStore } from '../runstore';

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

    it('reuses a receipt by a host-derived idempotency key', async () => {
        const exec = vi.fn(async () => 'fresh');
        const t: WorkflowTool = {
            ...tool('once', {}, exec),
            idempotencyKey: (input) =>
                `once:${JSON.stringify(input)}`,
        };
        const prior: ToolReceipt = {
            runId: 'r',
            callId: 'old-provider-call-id',
            toolName: 'once',
            authority: 'host-client',
            sideEffect: 'reversible',
            idempotencyKey: 'once:{"x":1}',
            status: 'succeeded',
            result: 'cached',
            at: 1,
        };
        const { outcomes } = await executeToolBatch(
            [{ callId: 'new-provider-call-id', toolName: 'once', input: { x: 1 } }],
            {
                runId: 'r',
                nodeId: 'n',
                signal,
                resolve: () => t,
                receiptStore: {
                    getToolReceipt: async () => null,
                    getToolReceiptByIdempotencyKey: async () => prior,
                },
            }
        );
        expect(outcomes[0].status).toBe('reused');
        expect(outcomes[0].output).toBe('cached');
        expect(exec).not.toHaveBeenCalled();
    });

    it('rejects a reused call id when its validated input changed', async () => {
        const store = new InMemoryRunStore();
        const exec = vi.fn(async () => 'done');
        const once = tool('once', {}, exec);
        const options = {
            runId: 'collision-run',
            nodeId: 'node',
            signal,
            resolve: () => once,
            receiptStore: store,
        };

        await executeToolBatch(
            [{ callId: 'stable-id', toolName: 'once', input: { value: 1 } }],
            options
        );
        await expect(
            executeToolBatch(
                [
                    {
                        callId: 'stable-id',
                        toolName: 'once',
                        input: { value: 2 },
                    },
                ],
                options
            )
        ).rejects.toThrow('identity collision');
        expect(exec).toHaveBeenCalledOnce();
    });

    it('finishes a started intent from a committed receipt after restart', async () => {
        const store = new InMemoryRunStore();
        const originalPutIntent = store.putToolIntent.bind(store);
        let crashBeforeIntentCommit = true;
        store.putToolIntent = async (intent) => {
            if (
                crashBeforeIntentCommit &&
                intent.status === 'completed'
            ) {
                crashBeforeIntentCommit = false;
                throw new Error(
                    'simulated crash after receipt commit'
                );
            }
            await originalPutIntent(intent);
        };
        const exec = vi.fn(async () => 'external-result');
        const once = tool('once', {}, exec);
        const call = {
            callId: 'committed-call',
            toolName: 'once',
            input: { value: 1 },
        };
        const options = {
            runId: 'receipt-recovery-run',
            nodeId: 'node',
            signal,
            resolve: () => once,
            receiptStore: store,
        };

        await expect(
            executeToolBatch([call], options)
        ).rejects.toThrow('simulated crash');
        const resumed = await executeToolBatch([call], options);

        expect(resumed.outcomes[0]?.status).toBe('reused');
        expect(exec).toHaveBeenCalledOnce();
        expect(
            await store.getToolIntent(
                'receipt-recovery-run',
                'committed-call'
            )
        ).toMatchObject({ status: 'completed' });
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

    it('persists a started intent before invoking an external side effect', async () => {
        const store = new InMemoryRunStore();
        const exec = vi.fn(async (_input, context) => {
            const intent = await store.getToolIntent(
                context.runId,
                context.callId
            );
            expect(intent?.status).toBe('started');
            return 'charged';
        });
        const charge = tool(
            'charge',
            { sideEffect: 'destructive' },
            exec
        );
        const { outcomes } = await executeToolBatch(
            [{ callId: 'charge-1', toolName: 'charge', input: {} }],
            {
                runId: 'durable-run',
                nodeId: 'billing',
                signal,
                resolve: () => charge,
                receiptStore: store,
            }
        );
        expect(outcomes[0]?.status).toBe('succeeded');
        expect(
            await store.getToolIntent('durable-run', 'charge-1')
        ).toMatchObject({ status: 'completed' });
    });

    it('reconciles an ambiguous restart without replaying the side effect', async () => {
        const store = new InMemoryRunStore();
        const originalPut = store.putToolReceipt.bind(store);
        let failReceiptWrite = true;
        store.putToolReceipt = async (receipt) => {
            if (failReceiptWrite) {
                failReceiptWrite = false;
                throw new Error('simulated crash before receipt commit');
            }
            await originalPut(receipt);
        };
        const exec = vi.fn(async () => 'external-result');
        const charge = tool(
            'charge',
            { sideEffect: 'destructive' },
            exec
        );
        const options = {
            runId: 'restart-run',
            nodeId: 'billing',
            signal,
            resolve: () => charge,
            receiptStore: store,
        };

        await expect(
            executeToolBatch(
                [
                    {
                        callId: 'charge-1',
                        toolName: 'charge',
                        input: { cents: 50 },
                    },
                ],
                options
            )
        ).rejects.toThrow('simulated crash');
        expect(exec).toHaveBeenCalledOnce();

        const resumed = await executeToolBatch(
            [
                {
                    callId: 'charge-1',
                    toolName: 'charge',
                    input: { cents: 50 },
                },
            ],
            {
                ...options,
                reconciler: async () => ({
                    action: 'completed',
                    output: 'recovered-result',
                }),
            }
        );
        expect(resumed.outcomes[0]).toMatchObject({
            status: 'reconciled',
            output: 'recovered-result',
        });
        expect(exec).toHaveBeenCalledOnce();
    });

    it('reconciles a failed side-effect intent when its receipt is unavailable', async () => {
        const store = new InMemoryRunStore();
        const exec = vi.fn(async () => {
            throw new Error('provider disconnected after submission');
        });
        const charge = tool(
            'charge',
            { sideEffect: 'destructive' },
            exec
        );
        const call = {
            callId: 'charge-ambiguous',
            toolName: 'charge',
            input: { cents: 75 },
        };
        const options = {
            runId: 'failed-intent-run',
            nodeId: 'billing',
            signal,
            resolve: () => charge,
            receiptStore: store,
        };

        const first = await executeToolBatch([call], options);
        expect(first.outcomes[0]?.status).toBe('failed');
        expect(exec).toHaveBeenCalledOnce();

        store.getToolReceipt = async () => undefined;
        const resumed = await executeToolBatch([call], {
            ...options,
            reconciler: async () => ({
                action: 'completed',
                output: 'confirmed externally',
            }),
        });
        expect(resumed.outcomes[0]).toMatchObject({
            status: 'reconciled',
            output: 'confirmed externally',
        });
        expect(exec).toHaveBeenCalledOnce();
    });

    it('enforces tool permission scopes in the executor', async () => {
        const exec = vi.fn(async () => 'secret');
        const scoped = tool(
            'admin-read',
            { permissions: ['admin:read'] },
            exec
        );
        const { outcomes } = await executeToolBatch(
            [{ callId: 'c1', toolName: 'admin-read', input: {} }],
            {
                runId: 'r',
                nodeId: 'n',
                signal,
                resolve: () => scoped,
                grantedPermissions: ['user:read'],
            }
        );
        expect(outcomes[0]).toMatchObject({
            status: 'rejected',
            error: 'missing-permissions:admin:read',
        });
        expect(exec).not.toHaveBeenCalled();
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
