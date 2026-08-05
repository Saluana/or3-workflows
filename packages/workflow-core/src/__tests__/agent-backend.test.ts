import { describe, it, expect, vi } from 'vitest';
import { NativeAgentLoopBackend, aggregateUsage } from '../agent';
import { LegacyLLMProviderGateway } from '../gateway';
import type { ChatMessage, LLMProvider } from '../types';
import { toNonEmptyModels } from '../gateway';

function makeProvider(
    responses: Array<Awaited<ReturnType<LLMProvider['chat']>>>
): LLMProvider {
    let call = 0;
    return {
        chat: vi.fn(async () => responses[Math.min(call++, responses.length - 1)]),
        getModelCapabilities: async () => null,
    };
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('NativeAgentLoopBackend (R6.AC1)', () => {
    it('returns content when the model emits no tool calls', async () => {
        const provider = makeProvider([
            { content: 'done', usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } },
        ]);
        const gateway = new LegacyLLMProviderGateway(provider);
        const backend = new NativeAgentLoopBackend();
        const result = await backend.run({
            gateway,
            models: toNonEmptyModels(['m']),
            messages,
            maxIterations: 5,
        });
        expect(result.finalContent).toBe('done');
        expect(result.iterations).toBe(1);
        expect(result.stoppedOnMaxIterations).toBe(false);
        expect(result.usage?.totalTokens).toBe(3);
    });

    it('executes tool calls and appends tool results in order', async () => {
        const provider = makeProvider([
            {
                content: null,
                toolCalls: [
                    {
                        id: 'call1',
                        type: 'function',
                        function: { name: 'lookup', arguments: '{"q":"x"}' },
                    },
                ],
            },
            { content: 'final answer' },
        ]);
        const gateway = new LegacyLLMProviderGateway(provider);
        const executeTool = vi.fn(async () => 'tool-output');
        const backend = new NativeAgentLoopBackend();
        const result = await backend.run({
            gateway,
            models: toNonEmptyModels(['m']),
            messages,
            maxIterations: 5,
            executeTool,
        });
        expect(executeTool).toHaveBeenCalledOnce();
        expect(result.finalContent).toBe('final answer');
        // assistant tool-call message precedes the tool result message
        const toolMsgIndex = result.messages.findIndex(
            (m) => m.role === 'tool'
        );
        const assistantIndex = result.messages.findIndex(
            (m) => m.role === 'assistant' && m.tool_calls
        );
        expect(assistantIndex).toBeGreaterThanOrEqual(0);
        expect(toolMsgIndex).toBeGreaterThan(assistantIndex);
    });

    it('stops at maxIterations', async () => {
        const provider = makeProvider([
            {
                content: null,
                toolCalls: [
                    {
                        id: 'call1',
                        type: 'function',
                        function: { name: 't', arguments: '{}' },
                    },
                ],
            },
        ]);
        const gateway = new LegacyLLMProviderGateway(provider);
        const backend = new NativeAgentLoopBackend();
        const result = await backend.run({
            gateway,
            models: toNonEmptyModels(['m']),
            messages,
            maxIterations: 2,
            executeTool: async () => 'x',
        });
        expect(result.stoppedOnMaxIterations).toBe(true);
        expect(result.iterations).toBe(2);
    });

    it('aborts when the signal is already aborted', async () => {
        const provider = makeProvider([{ content: 'x' }]);
        const gateway = new LegacyLLMProviderGateway(provider);
        const backend = new NativeAgentLoopBackend();
        const controller = new AbortController();
        controller.abort();
        await expect(
            backend.run({
                gateway,
                models: toNonEmptyModels(['m']),
                messages,
                maxIterations: 3,
                signal: controller.signal,
            })
        ).rejects.toThrow();
    });
});

describe('aggregateUsage (R8.AC2)', () => {
    it('sums only reported fields and leaves others undefined', () => {
        const agg = aggregateUsage([
            { inputTokens: 1, totalTokens: 3 },
            { inputTokens: 2, costUsd: 0.5 },
        ]);
        expect(agg?.inputTokens).toBe(3);
        expect(agg?.totalTokens).toBe(3);
        expect(agg?.costUsd).toBe(0.5);
        expect(agg?.outputTokens).toBeUndefined();
    });

    it('returns undefined for empty usage', () => {
        expect(aggregateUsage([])).toBeUndefined();
    });
});
