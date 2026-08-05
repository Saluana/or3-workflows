import { describe, expect, it, vi } from 'vitest';
import {
    OpenRouterAgentLoopBackend,
    OpenRouterAgentClientRequiredError,
} from '../agent/openrouterAgentBackend';
import type { ModelGateway } from '../gateway';

const gateway: ModelGateway = {
    async generate() {
        throw new Error('agent backend must not call the Chat gateway');
    },
    async getModelCapabilities() {
        return null;
    },
};

function emptyStream(): AsyncIterable<string> {
    return {
        async *[Symbol.asyncIterator]() {},
    };
}

function moduleFixture(options?: {
    onRequest?: (request: Record<string, any>) => Promise<void> | void;
    completedUsages?: Array<Record<string, unknown>>;
}) {
    const defaultUsage = {
        inputTokens: 5,
        outputTokens: 2,
        totalTokens: 7,
        cost: 0.001,
    };
    const request = vi.fn(
        (
            _client: unknown,
            input: Record<string, any>,
            requestOptions?: { signal?: AbortSignal }
        ) => ({
            async *getTextStream() {
                yield 'done';
            },
            getReasoningStream: emptyStream,
            async *getFullResponsesStream() {
                for (const [index, usage] of (
                    options?.completedUsages ?? [defaultUsage]
                ).entries()) {
                    yield {
                        type: 'response.completed',
                        response: {
                            id: `response-${index + 1}`,
                            usage,
                        },
                    };
                }
            },
            async getResponse() {
                await options?.onRequest?.(input);
                const response = {
                    id: 'response-1',
                    model: 'test/fallback',
                    provider: 'MockProvider',
                    outputText: 'done',
                    output: [],
                    usage: defaultUsage,
                };
                await input.onTurnEnd?.({}, response);
                return response;
            },
            cancel: vi.fn(async () => undefined),
            requestOptions,
        })
    );
    return {
        request,
        module: {
            callModel: request,
            fromChatMessages: (messages: unknown[]) => messages,
            toChatMessage: (response: { outputText: string }) => ({
                role: 'assistant',
                content: response.outputText,
            }),
            tool: (config: Record<string, unknown>) => config,
            serverTool: (config: Record<string, unknown>) => config,
            stepCountIs: (count: number) => ({ count }),
        },
    };
}

describe('OpenRouterAgentLoopBackend', () => {
    it('preflights the optional module only once', async () => {
        const fixture = moduleFixture();
        const load = vi.fn(async () => fixture.module);
        const backend = new OpenRouterAgentLoopBackend({
            client: {},
            loadModule: load,
        });

        await backend.preflight();
        await backend.preflight();

        expect(load).toHaveBeenCalledOnce();
    });

    it('requires the host to provide the correct agent SDK client', async () => {
        const fixture = moduleFixture();
        const backend = new OpenRouterAgentLoopBackend({
            client: null,
            loadModule: async () => fixture.module,
        });
        await expect(backend.preflight()).rejects.toBeInstanceOf(
            OpenRouterAgentClientRequiredError
        );
    });

    it('runs typed tools through the OR3 executor and reports usage/state', async () => {
        const executeTool = vi.fn(async () => '72 F');
        const state = { get: vi.fn(), set: vi.fn() };
        const fixture = moduleFixture({
            onRequest: async (request) => {
                await request.tools[0].execute({ city: 'LA' });
            },
        });
        const backend = new OpenRouterAgentLoopBackend({
            client: { kind: 'agent-client' },
            state,
            loadModule: async () => fixture.module,
        });

        const result = await backend.run({
            gateway,
            models: ['test/primary', 'test/fallback'],
            messages: [{ role: 'user', content: 'weather' }],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'weather',
                        parameters: {
                            type: 'object',
                            properties: { city: { type: 'string' } },
                            required: ['city'],
                        },
                    },
                },
            ],
            maxIterations: 3,
            routing: {
                allow: ['xAI'],
                deny: ['Other'],
            },
            executeTool,
        });

        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({
                toolName: 'weather',
                argumentsJson: '{"city":"LA"}',
            })
        );
        const sent = fixture.request.mock.calls[0]![1];
        expect(sent.models).toEqual(['test/primary', 'test/fallback']);
        expect(sent.state).toBe(state);
        expect(sent.stopWhen).toEqual({ count: 3 });
        expect(sent.provider).toMatchObject({
            only: ['xAI'],
            ignore: ['Other'],
            requireParameters: true,
        });
        expect(result).toMatchObject({
            finalContent: 'done',
            iterations: 1,
            actualModel: 'test/fallback',
            provider: 'MockProvider',
            usage: { totalTokens: 7, costUsd: 0.001 },
        });
    });

    it('passes AbortSignal to the Responses request', async () => {
        const fixture = moduleFixture();
        const backend = new OpenRouterAgentLoopBackend({
            client: {},
            loadModule: async () => fixture.module,
        });
        const controller = new AbortController();
        await backend.run({
            gateway,
            models: ['test/model'],
            messages: [{ role: 'user', content: 'hello' }],
            maxIterations: 1,
            signal: controller.signal,
        });
        expect(fixture.request.mock.calls[0]![2]?.signal).toBe(
            controller.signal
        );
    });

    it('uses collision-safe ids for nested tool arguments', async () => {
        const executeTool = vi.fn(async () => 'ok');
        const fixture = moduleFixture({
            onRequest: async (request) => {
                await request.tools[0].execute({
                    payload: { value: 1 },
                });
                await request.tools[0].execute({
                    payload: { value: 2 },
                });
            },
        });
        const backend = new OpenRouterAgentLoopBackend({
            client: {},
            loadModule: async () => fixture.module,
        });

        await backend.run({
            gateway,
            models: ['test/model'],
            messages: [{ role: 'user', content: 'run twice' }],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'nested',
                        parameters: {
                            type: 'object',
                            properties: {
                                payload: {
                                    type: 'object',
                                    properties: {
                                        value: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
            maxIterations: 3,
            executeTool,
        });

        const first = executeTool.mock.calls[0]![0].callId;
        const second = executeTool.mock.calls[1]![0].callId;
        expect(first).not.toBe(second);
    });

    it('reports only an actually fired step limit and aggregates every response', async () => {
        const fixture = moduleFixture({
            completedUsages: [
                {
                    inputTokens: 5,
                    outputTokens: 2,
                    totalTokens: 7,
                    cost: 0.001,
                },
                {
                    inputTokens: 3,
                    outputTokens: 4,
                    totalTokens: 7,
                    cost: 0.002,
                },
            ],
            onRequest: async (request) => {
                await request.stopWhen({ steps: [{}, {}] });
            },
        });
        fixture.module.stepCountIs = () =>
            async ({ steps }: { steps: unknown[] }) =>
                steps.length >= 2;
        const backend = new OpenRouterAgentLoopBackend({
            client: {},
            loadModule: async () => fixture.module,
        });

        const result = await backend.run({
            gateway,
            models: ['test/model'],
            messages: [{ role: 'user', content: 'bounded' }],
            maxIterations: 2,
        });

        expect(result.stoppedOnMaxIterations).toBe(true);
        expect(result.iterations).toBe(2);
        expect(result.usage).toMatchObject({
            inputTokens: 8,
            outputTokens: 6,
            totalTokens: 14,
            costUsd: 0.003,
        });
    });
});
