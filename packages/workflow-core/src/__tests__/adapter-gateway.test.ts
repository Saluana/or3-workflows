import { describe, it, expect, vi } from 'vitest';
import {
    OpenRouterExecutionAdapter,
    LegacyLLMProviderGateway,
    gatewayAsLLMProvider,
    isModelGateway,
    type LLMProvider,
    type ModelGateway,
    type WorkflowData,
    type ExecutionCallbacks,
} from '../index';

function callbacks(): ExecutionCallbacks {
    return {
        onNodeStart: () => {},
        onNodeFinish: () => {},
        onNodeError: () => {},
        onToken: () => {},
    };
}

function mockProvider(
    onChat?: (signal?: AbortSignal) => void
): LLMProvider {
    return {
        async chat(_model, _messages, options) {
            onChat?.(options?.signal);
            return { content: 'gateway-output', finishReason: 'stop' };
        },
        async getModelCapabilities(id) {
            return {
                id,
                name: id,
                inputModalities: ['text'],
                outputModalities: ['text'],
                contextLength: 4096,
                supportedParameters: [],
            };
        },
    };
}

const workflow: WorkflowData = {
    meta: { version: '2.0.0', name: 'gw-test' },
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
            position: { x: 200, y: 0 },
            data: { label: 'Agent', model: 'test/model', prompt: 'Do it' },
        },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'agent' }],
};

describe('OpenRouterExecutionAdapter + ModelGateway', () => {
    it('accepts a ModelGateway and exposes it via getGateway()', () => {
        const gateway = new LegacyLLMProviderGateway(mockProvider());
        const adapter = new OpenRouterExecutionAdapter(gateway);
        expect(isModelGateway(adapter.getGateway())).toBe(true);
        expect(adapter.getGateway()).toBe(gateway);
    });

    it('wraps a legacy LLMProvider in a gateway internally', () => {
        const adapter = new OpenRouterExecutionAdapter(mockProvider());
        expect(isModelGateway(adapter.getGateway())).toBe(true);
    });

    it('routes a raw OpenRouter client through the v1 gateway with model fallbacks', async () => {
        const send = vi.fn(async () =>
            (async function* () {
                yield {
                    model: 'fallback/model',
                    choices: [{ delta: { content: 'fallback-output' } }],
                };
            })()
        );
        const adapter = new OpenRouterExecutionAdapter({
            chat: { send },
        } as any);
        const modernWorkflow = structuredClone(workflow);
        const agent = modernWorkflow.nodes.find(
            (node) => node.id === 'agent'
        )!;
        agent.data = {
            ...agent.data,
            modelRequest: {
                version: 1,
                models: ['primary/model', 'fallback/model'],
            },
        };

        const result = await adapter.execute(
            modernWorkflow,
            { text: 'hello' },
            callbacks()
        );
        expect(result.output).toBe('fallback-output');
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                chatRequest: expect.objectContaining({
                    models: ['primary/model', 'fallback/model'],
                }),
            }),
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    it('executes an agent node through the gateway path', async () => {
        const gateway = new LegacyLLMProviderGateway(mockProvider());
        const adapter = new OpenRouterExecutionAdapter(gateway);
        const result = await adapter.execute(
            workflow,
            { text: 'hello' },
            callbacks()
        );
        expect(result.success).toBe(true);
        expect(result.output).toBe('gateway-output');
    });

    it('keeps response healing enabled for a legacy structured node repair call', async () => {
        const requests: Parameters<ModelGateway['generate']>[0][] = [];
        const gateway: ModelGateway = {
            generate: vi.fn(async (request) => {
                requests.push(request);
                const content =
                    requests.length === 1
                        ? '{"answer":"wrong"}'
                        : '{"answer":42}';
                return {
                    requestedModels: request.models,
                    assistantMessage: {
                        role: 'assistant',
                        content,
                    },
                    content,
                };
            }),
            getModelCapabilities: vi.fn(async () => null),
        };
        const structuredWorkflow = structuredClone(workflow);
        const agent = structuredWorkflow.nodes.find(
            (node) => node.id === 'agent'
        )!;
        agent.data = {
            ...agent.data,
            structuredOutput: {
                name: 'answer',
                schema: {
                    type: 'object',
                    properties: {
                        answer: { type: 'integer', const: 42 },
                    },
                    required: ['answer'],
                    additionalProperties: false,
                },
                strict: true,
                repair: {
                    maxAttempts: 1,
                    backend: 'response-healing',
                },
            },
        };

        const result = await new OpenRouterExecutionAdapter(
            gateway
        ).execute(
            structuredWorkflow,
            { text: 'answer' },
            callbacks()
        );

        expect(result.output).toBe('{"answer":42}');
        expect(requests).toHaveLength(2);
        expect(
            requests.every((request) =>
                request.plugins?.some(
                    (plugin) => plugin.id === 'response-healing'
                )
            )
        ).toBe(true);
    });

    it('propagates abort through the gateway to the provider call path', async () => {
        let receivedSignal: AbortSignal | undefined;
        const gateway = new LegacyLLMProviderGateway(
            mockProvider((signal) => {
                receivedSignal = signal;
            })
        );
        const adapter = new OpenRouterExecutionAdapter(gateway);
        await adapter.execute(workflow, { text: 'hello' }, callbacks());
        expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('does not invent zero token fields for partial gateway usage', async () => {
        const gateway: ModelGateway = {
            generate: vi.fn(async (request) => ({
                requestedModels: request.models,
                assistantMessage: { role: 'assistant', content: 'ok' },
                content: 'ok',
                usage: { totalTokens: 7 },
            })),
            getModelCapabilities: vi.fn(async () => null),
        };
        const result = await gatewayAsLLMProvider(gateway).chat('m', [
            { role: 'user', content: 'hi' },
        ]);
        expect(result.usage).toBeUndefined();
    });
});
