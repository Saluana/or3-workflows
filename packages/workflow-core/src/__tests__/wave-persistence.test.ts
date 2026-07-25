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
        expect(loaded.snapshot!.completedNodes).toEqual(
            expect.arrayContaining(['start', 'a', 'b', 'merge'])
        );
        expect(loaded.snapshot!.pendingNodes).toEqual([]);
        expect(loaded.snapshot!.nodeOutputs.a).toBeTruthy();
        expect(loaded.snapshot!.transcript.length).toBeGreaterThan(0);
        expect(store.allEvents('wave-run-1').some((e) => e.type === 'wave_boundary')).toBe(
            true
        );
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
});
