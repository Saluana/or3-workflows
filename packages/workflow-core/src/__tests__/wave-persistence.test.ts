import { describe, it, expect, vi } from 'vitest';
import {
    OpenRouterExecutionAdapter,
    InMemoryRunStore,
    type LLMProvider,
    type WorkflowData,
    type ExecutionCallbacks,
} from '../index';

function silentCallbacks(): ExecutionCallbacks {
    return {
        onNodeStart: () => undefined,
        onNodeFinish: () => undefined,
        onNodeError: () => undefined,
        onToken: () => undefined,
        onRouteSelected: () => undefined,
    };
}

function diamondWorkflow(): WorkflowData {
    return {
        meta: { version: '2.0.0', name: 'diamond-wave' },
        nodes: [
            {
                id: 'start',
                type: 'start',
                position: { x: 0, y: 0 },
                data: { label: 'Start' },
            },
            {
                id: 'a',
                type: 'agent',
                position: { x: 0, y: 0 },
                data: {
                    label: 'A',
                    model: 'test/model',
                    systemPrompt: 'a',
                    userPrompt: '{{input}}',
                },
            },
            {
                id: 'b',
                type: 'agent',
                position: { x: 0, y: 0 },
                data: {
                    label: 'B',
                    model: 'test/model',
                    systemPrompt: 'b',
                    userPrompt: '{{input}}',
                },
            },
            {
                id: 'merge',
                type: 'agent',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Merge',
                    model: 'test/model',
                    systemPrompt: 'merge',
                    userPrompt: '{{input}}',
                },
            },
        ],
        edges: [
            {
                id: 'e1',
                source: 'start',
                target: 'a',
                sourceHandle: 'output',
                targetHandle: 'input',
            },
            {
                id: 'e2',
                source: 'start',
                target: 'b',
                sourceHandle: 'output',
                targetHandle: 'input',
            },
            {
                id: 'e3',
                source: 'a',
                target: 'merge',
                sourceHandle: 'output',
                targetHandle: 'input',
            },
            {
                id: 'e4',
                source: 'b',
                target: 'merge',
                sourceHandle: 'output',
                targetHandle: 'input',
            },
        ],
    };
}

describe('wave-boundary RunStore persistence (R7.AC1, R7.AC2)', () => {
    it('persists pending/completed/transcript at every DAG wave', async () => {
        const store = new InMemoryRunStore();
        let calls = 0;
        const provider: LLMProvider = {
            chat: vi.fn(async () => {
                calls += 1;
                return { content: `out-${calls}`, finishReason: 'stop' as const };
            }),
            getModelCapabilities: async () => null,
        };

        const adapter = new OpenRouterExecutionAdapter(provider, {
            runStore: store,
            runId: 'wave-run-1',
            persistWaveSnapshots: true,
            preflight: false,
        });

        const result = await adapter.execute(
            diamondWorkflow(),
            { text: 'go' },
            silentCallbacks()
        );

        expect(result.success).toBe(true);
        const loaded = await store.load('wave-run-1');
        expect(loaded.snapshot).toBeDefined();
        expect(loaded.snapshot!.status).toBe('completed');
        expect(loaded.snapshot!.completedNodes).toEqual(
            expect.arrayContaining(['start', 'a', 'b', 'merge'])
        );
        expect(loaded.snapshot!.pendingNodes).toEqual([]);
        expect(loaded.snapshot!.nodeOutputs.a).toBeTruthy();
        expect(loaded.snapshot!.transcript.length).toBeGreaterThan(0);
        expect(store.allEvents('wave-run-1').some((e) => e.type === 'wave_boundary')).toBe(
            true
        );
        expect(
            store
                .allEvents('wave-run-1')
                .some((e) => e.type === 'run_completed')
        ).toBe(true);
    });

    it('resumes from a wave snapshot with identical pending nodes and outputs', async () => {
        const store = new InMemoryRunStore();
        let calls = 0;
        const provider: LLMProvider = {
            chat: vi.fn(async (_model, messages) => {
                calls += 1;
                const last = messages[messages.length - 1];
                const text =
                    typeof last?.content === 'string' ? last.content : 'x';
                return {
                    content: `wave-${calls}:${text.slice(0, 8)}`,
                    finishReason: 'stop' as const,
                };
            }),
            getModelCapabilities: async () => null,
        };

        // First run completes one wave then we simulate crash by stopping after
        // capturing the mid-run snapshot via a second store clone.
        const first = new OpenRouterExecutionAdapter(provider, {
            runStore: store,
            runId: 'resume-wave',
            persistWaveSnapshots: true,
            preflight: false,
        });

        // Seed a mid-run snapshot as if a process died after the start+fanout wave.
        // Execute fully first to get realistic outputs, then rewrite snapshot to mid-state.
        await first.execute(diamondWorkflow(), { text: 'seed' }, silentCallbacks());
        const afterFull = await store.load('resume-wave');
        expect(afterFull.snapshot).toBeDefined();

        // Simulate a crash after start+a+b completed but before merge by writing
        // a synthetic mid-wave snapshot into a fresh store and resuming.
        const midStore = new InMemoryRunStore();
        const midSnap = {
            runId: 'resume-wave',
            sequence: 0,
            version: 1 as const,
            status: 'running' as const,
            pendingNodes: ['merge'],
            scheduledNodes: ['a', 'b'],
            completedNodes: ['start', 'a', 'b'],
            nodeOutputs: {
                start: 'seed',
                a: 'from-a',
                b: 'from-b',
            },
            transcript: [
                { role: 'user' as const, content: 'seed' },
                { role: 'assistant' as const, content: 'from-a' },
                { role: 'assistant' as const, content: 'from-b' },
            ],
            subflowPath: [],
            lastSequence: 0,
        };
        await midStore.append(
            { runId: 'resume-wave', version: 1, type: 'wave_boundary', at: 1 },
            0
        );
        await midStore.saveSnapshot(midSnap, 1);

        const callsBefore = calls;
        const resumed = new OpenRouterExecutionAdapter(provider, {
            runStore: midStore,
            runId: 'resume-wave',
            persistWaveSnapshots: true,
            preflight: false,
        });
        const result = await resumed.execute(
            diamondWorkflow(),
            { text: 'seed' },
            silentCallbacks()
        );

        expect(result.success).toBe(true);
        // Only the pending merge node should have invoked the LLM on resume
        // (start has no LLM; a/b already completed in the snapshot).
        expect(calls - callsBefore).toBe(1);
        expect(result.nodeOutputs?.a).toBe('from-a');
        expect(result.nodeOutputs?.b).toBe('from-b');
        expect(result.nodeOutputs?.merge).toBeTruthy();

        const afterResume = await midStore.load('resume-wave');
        expect(afterResume.snapshot?.pendingNodes).toEqual([]);
        expect(afterResume.snapshot?.completedNodes).toEqual(
            expect.arrayContaining(['start', 'a', 'b', 'merge'])
        );
        expect(afterResume.snapshot?.transcript.length).toBeGreaterThanOrEqual(3);
    });

    it('persists and reuses legacy tool receipts across a repeated run', async () => {
        const store = new InMemoryRunStore();
        const handler = vi.fn(async () => 'durable-tool-result');
        const provider: LLMProvider = {
            chat: vi.fn(async (_model, messages) => {
                const hasToolResult = messages.some(
                    (message) => message.role === 'tool'
                );
                return hasToolResult
                    ? { content: 'done', finishReason: 'stop' as const }
                    : {
                          content: null,
                          finishReason: 'tool_calls' as const,
                          toolCalls: [
                              {
                                  id: 'stable-call-1',
                                  type: 'function' as const,
                                  function: {
                                      name: 'durable_tool',
                                      arguments: '{"value":1}',
                                  },
                              },
                          ],
                      };
            }),
            getModelCapabilities: async () => null,
        };
        const options = {
            runStore: store,
            runId: 'tool-receipt-run',
            persistWaveSnapshots: true,
            preflight: false,
            tools: [
                {
                    type: 'function' as const,
                    function: {
                        name: 'durable_tool',
                        parameters: {
                            type: 'object' as const,
                            properties: { value: { type: 'number' } },
                            required: ['value'],
                        },
                    },
                    handler,
                },
            ],
        };
        const toolWorkflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'tool-receipt' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'agent',
                    type: 'agent',
                    position: { x: 1, y: 0 },
                    data: {
                        label: 'Agent',
                        model: 'test/model',
                        prompt: 'Use the tool',
                    },
                },
            ],
            edges: [
                {
                    id: 'start-agent',
                    source: 'start',
                    target: 'agent',
                },
            ],
        };

        const first = await new OpenRouterExecutionAdapter(
            provider,
            options
        ).execute(toolWorkflow, { text: 'go' }, silentCallbacks());
        expect(first.success).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(
            await store.getToolReceipt(
                'tool-receipt-run',
                'stable-call-1'
            )
        ).toMatchObject({
            status: 'succeeded',
            result: 'durable-tool-result',
        });

        const second = await new OpenRouterExecutionAdapter(
            provider,
            options
        ).execute(toolWorkflow, { text: 'go' }, silentCallbacks());
        expect(second.success).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('validates structured agent output and persists its typed value', async () => {
        const store = new InMemoryRunStore();
        const provider: LLMProvider = {
            chat: vi.fn(async () => ({
                content: '{"b":2,"a":1}',
                finishReason: 'stop' as const,
            })),
            getModelCapabilities: async () => null,
        };
        const workflow: WorkflowData = {
            meta: { id: 'structured-wf', version: '2.0.0', name: 'structured' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'agent',
                    type: 'agent',
                    position: { x: 1, y: 0 },
                    data: {
                        label: 'Structured',
                        model: 'test/model',
                        prompt: 'Return JSON',
                        structuredOutput: {
                            name: 'answer',
                            schema: {
                                type: 'object',
                                properties: {
                                    a: { type: 'number' },
                                    b: { type: 'number' },
                                },
                                required: ['a', 'b'],
                                additionalProperties: false,
                            },
                            strict: true,
                        },
                    },
                },
            ],
            edges: [{ id: 'e', source: 'start', target: 'agent' }],
        };
        const result = await new OpenRouterExecutionAdapter(provider, {
            runStore: store,
            runId: 'structured-run',
            preflight: false,
        }).execute(workflow, { text: 'go' }, silentCallbacks());

        expect(result.success).toBe(true);
        expect(result.output).toBe('{"a":1,"b":2}');
        const loaded = await store.load('structured-run');
        expect(loaded.snapshot?.workflowId).toBe('structured-wf');
        expect(loaded.snapshot?.nodeValues?.agent).toEqual({ a: 1, b: 2 });
    });
});
