import { describe, it, expect, vi } from 'vitest';
import { OpenRouterExecutionAdapter } from '../execution';
import { LegacyLLMProviderGateway } from '../gateway';
import type {
    ChatMessage,
    ExecutionCallbacks,
    ExecutionInput,
    LLMProvider,
    WorkflowData,
} from '../types';

/**
 * Golden compatibility fixtures (R1.AC1, R1.AC2, R1.AC3, R8.AC6).
 *
 * A legacy `WorkflowData 2.0.0` document runs unchanged through a legacy
 * `LLMProvider` mock, a `ModelGateway`, and a `LegacyLLMProviderGateway`,
 * producing identical canonical string outputs and callback sequences.
 */

const LEGACY_WORKFLOW: WorkflowData = {
    meta: { version: '2.0.0', name: 'Golden Legacy Workflow' },
    nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
            id: 'agent',
            type: 'agent',
            position: { x: 200, y: 0 },
            data: {
                label: 'Assistant',
                model: 'openai/gpt-4o-mini',
                prompt: 'You are a helpful assistant.',
            },
        },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'agent' }],
};

const INPUT: ExecutionInput = { text: 'Say hello' };

function goldenProvider(): LLMProvider {
    return {
        chat: vi.fn(
            async (_model: string, _messages: ChatMessage[]) => ({
                content: 'Hello from the golden fixture.',
                usage: {
                    promptTokens: 10,
                    completionTokens: 6,
                    totalTokens: 16,
                },
                finishReason: 'stop' as const,
            })
        ),
        getModelCapabilities: async () => null,
    };
}

function makeCallbacks() {
    const order: string[] = [];
    const callbacks: ExecutionCallbacks = {
        onNodeStart: (id) => order.push(`start:${id}`),
        onNodeFinish: (id) => order.push(`finish:${id}`),
        onNodeError: (id) => order.push(`error:${id}`),
        onToken: () => {},
    };
    return { callbacks, order };
}

describe('golden fixtures', () => {
    it('legacy LLMProvider produces the canonical output + callbacks', async () => {
        const adapter = new OpenRouterExecutionAdapter(goldenProvider());
        const { callbacks, order } = makeCallbacks();
        const result = await adapter.execute(LEGACY_WORKFLOW, INPUT, callbacks);
        expect(result.success).toBe(true);
        expect(result.output).toBe('Hello from the golden fixture.');
        expect(order).toEqual([
            'start:start',
            'finish:start',
            'start:agent',
            'finish:agent',
        ]);
    });

    it('ModelGateway (via LegacyLLMProviderGateway) matches the legacy output', async () => {
        const gateway = new LegacyLLMProviderGateway(goldenProvider());
        const adapter = new OpenRouterExecutionAdapter(gateway);
        const { callbacks, order } = makeCallbacks();
        const result = await adapter.execute(LEGACY_WORKFLOW, INPUT, callbacks);
        expect(result.success).toBe(true);
        expect(result.output).toBe('Hello from the golden fixture.');
        expect(order).toEqual([
            'start:start',
            'finish:start',
            'start:agent',
            'finish:agent',
        ]);
    });

    it('produces a stable canonical string output across runs', async () => {
        const first = await new OpenRouterExecutionAdapter(
            goldenProvider()
        ).execute(LEGACY_WORKFLOW, INPUT, makeCallbacks().callbacks);
        const second = await new OpenRouterExecutionAdapter(
            goldenProvider()
        ).execute(LEGACY_WORKFLOW, INPUT, makeCallbacks().callbacks);
        expect(first.output).toBe(second.output);
    });
});
