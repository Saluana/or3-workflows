import { describe, it, expect } from 'vitest';
import {
    OpenRouterModelGateway,
    createOpenRouterModelGateway,
    CapabilityResolver,
    mapRoutingPolicy,
    normalizeMessages,
    ModelRegistry,
    CapabilityPreflightError,
    ProviderCallError,
    type OpenRouterV1Client,
    type ChatMessage,
    type OpenRouterModel,
} from '../index';

// A minimal fake model catalog entry.
function model(
    id: string,
    params: string[],
    inputModalities: string[] = ['text']
): OpenRouterModel {
    return {
        id,
        name: id,
        architecture: {
            inputModalities,
            outputModalities: ['text'],
        },
        supportedParameters: params,
        pricing: { prompt: '0', completion: '0' },
        contextLength: 8192,
    };
}

/** A fake client that records the last request and returns a scripted result. */
function fakeClient(
    result: unknown,
    record?: { request?: unknown; options?: unknown }
): OpenRouterV1Client {
    return {
        chat: {
            async send(request, options) {
                if (record) {
                    record.request = request;
                    record.options = options;
                }
                return result as never;
            },
        },
    };
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('mapRoutingPolicy', () => {
    it('maps order/allow/deny/fallback/data-collection/price/latency', () => {
        const prefs = mapRoutingPolicy(
            {
                order: ['openai', 'anthropic'],
                allow: ['openai'],
                deny: ['deepinfra'],
                allowFallbacks: false,
                dataCollection: 'deny',
                maxPrice: { prompt: 1.5, completion: 3 },
                sort: { by: 'throughput', partition: 'none' },
                preferredMaxLatency: { p90: 2, p99: 4 },
                preferredMinThroughput: { p50: 20, p90: 10 },
                quantizations: ['fp8'],
            },
            false
        );
        expect(prefs).toMatchObject({
            order: ['openai', 'anthropic'],
            only: ['openai'],
            ignore: ['deepinfra'],
            allowFallbacks: false,
            dataCollection: 'deny',
            maxPrice: { prompt: '1.5', completion: '3' },
            sort: { by: 'throughput', partition: 'none' },
            preferredMaxLatency: { p90: 2, p99: 4 },
            preferredMinThroughput: { p50: 20, p90: 10 },
            quantizations: ['fp8'],
        });
    });

    it('defaults requireParameters to true when capabilities are required', () => {
        expect(mapRoutingPolicy(undefined, true)).toEqual({
            requireParameters: true,
        });
        expect(mapRoutingPolicy(undefined, false)).toBeUndefined();
    });

    it('honors explicit requireParameters=false over the capability default', () => {
        const prefs = mapRoutingPolicy({ requireParameters: false }, true);
        expect(prefs?.requireParameters).toBe(false);
    });

    it('maps the zeroDataRetention compatibility alias to OpenRouter ZDR', () => {
        expect(mapRoutingPolicy({ zeroDataRetention: true }, false)).toEqual({
            zdr: true,
        });
    });

    it('keeps the legacy latency alias working', () => {
        expect(
            mapRoutingPolicy({ preferredMaxLatencySeconds: 2 }, false)
        ).toEqual({
            preferredMaxLatency: 2,
        });
    });
});

describe('CapabilityResolver (tri-state)', () => {
    const registry = new ModelRegistry();
    registry.register(model('has/tools', ['tools', 'structured_outputs']));
    registry.register(model('no/tools', ['temperature']));
    const resolver = new CapabilityResolver(registry);

    it('reports supported/unsupported/unknown', () => {
        const r = resolver.resolveModel('has/tools', [
            'tools',
            'structured-output',
        ]);
        expect(r.checks.every((c) => c.support === 'supported')).toBe(true);

        const r2 = resolver.resolveModel('no/tools', ['tools']);
        expect(r2.checks[0]?.support).toBe('unsupported');

        const r3 = resolver.resolveModel('unknown/model', ['tools']);
        expect(r3.checks[0]?.support).toBe('unknown');
    });

    it('blocks only when every fallback model is unsupported', () => {
        const blocked = resolver.preflight(['no/tools'], ['tools']);
        expect(blocked.blocking).toBeInstanceOf(CapabilityPreflightError);

        const ok = resolver.preflight(['no/tools', 'has/tools'], ['tools']);
        expect(ok.blocking).toBeNull();
    });

    it('requires one fallback model to support all requested capabilities', () => {
        const splitRegistry = new ModelRegistry();
        splitRegistry.register(model('tools/only', ['tools']));
        splitRegistry.register(
            model('structured/only', ['structured_outputs'])
        );
        const splitResolver = new CapabilityResolver(splitRegistry);
        const result = splitResolver.preflight(
            ['tools/only', 'structured/only'],
            ['tools', 'structured-output']
        );
        expect(result.blocking).toBeInstanceOf(CapabilityPreflightError);
    });

    it('checks parallel tool calls independently from basic tool support', () => {
        expect(
            resolver.resolveModel('has/tools', ['parallel-tool-calls']).checks[0]
                ?.support
        ).toBe('unsupported');
    });

    it('warns and defers for unknown catalog entries', () => {
        const res = resolver.preflight(['unknown/model'], ['tools']);
        expect(res.blocking).toBeNull();
        expect(res.warnings.length).toBeGreaterThan(0);
    });
});

describe('OpenRouterModelGateway request building', () => {
    it('lazily refreshes and caches unknown model capabilities', async () => {
        let gets = 0;
        const registry = new ModelRegistry();
        const client = fakeClient({
            model: 'vendor/new-model',
            choices: [{ message: { content: '{}' } }],
        });
        client.models = {
            async get() {
                gets++;
                return {
                    data: model('vendor/new-model', [
                        'structured_outputs',
                    ]),
                };
            },
        };
        const gateway = createOpenRouterModelGateway(client, {
            modelRegistry: registry,
        });
        const first = await gateway.getModelCapabilities(
            'vendor/new-model'
        );
        const second = await gateway.getModelCapabilities(
            'vendor/new-model'
        );
        expect(first?.supportedParameters).toContain(
            'structured_outputs'
        );
        expect(second?.id).toBe('vendor/new-model');
        expect(gets).toBe(1);
    });

    it('refreshes lazily fetched model capabilities after their TTL expires', async () => {
        let gets = 0;
        const registry = new ModelRegistry();
        const client = fakeClient({
            model: 'vendor/changing-model',
            choices: [{ message: { content: '{}' } }],
        });
        client.models = {
            async get() {
                gets++;
                return {
                    data: model(
                        'vendor/changing-model',
                        gets === 1
                            ? ['structured_outputs']
                            : ['tools']
                    ),
                };
            },
        };
        const gateway = createOpenRouterModelGateway(client, {
            modelRegistry: registry,
            capabilityCatalogTtlMs: 0,
        });

        await gateway.getModelCapabilities('vendor/changing-model');
        const refreshed = await gateway.getModelCapabilities(
            'vendor/changing-model'
        );
        expect(refreshed?.supportedParameters).toEqual(['tools']);
        expect(gets).toBe(2);
    });

    it('preserves the fallback model order and maps routing', async () => {
        const record: { request?: unknown } = {};
        const client = fakeClient(
            { id: 'gen-1', model: 'openai/gpt-4o', choices: [{ message: { content: 'ok' } }] },
            record
        );
        const gateway = createOpenRouterModelGateway(client);
        await gateway.generate({
            models: ['a/1', 'b/2', 'c/3'],
            messages,
            routing: { order: ['openai'] },
        });
        const req = record.request as {
            chatRequest: { models: string[]; provider?: unknown; stream: boolean };
        };
        expect(req.chatRequest.models).toEqual(['a/1', 'b/2', 'c/3']);
        expect(req.chatRequest.provider).toMatchObject({ order: ['openai'] });
        expect(req.chatRequest.stream).toBe(false);
    });

    it('passes AbortSignal via flattened requestOptions.signal', async () => {
        const record: { options?: unknown } = {};
        const client = fakeClient(
            { id: 'x', model: 'm', choices: [{ message: { content: 'ok' } }] },
            record
        );
        const gateway = createOpenRouterModelGateway(client);
        const controller = new AbortController();
        await gateway.generate({
            models: ['m'],
            messages,
            signal: controller.signal,
        });
        expect((record.options as { signal?: AbortSignal }).signal).toBe(
            controller.signal
        );
    });

    it('sends json_schema response format when structured output requested', async () => {
        const record: { request?: unknown } = {};
        const registry = new ModelRegistry();
        registry.register(model('m', ['structured_outputs']));
        const client = fakeClient(
            { id: 'x', model: 'm', choices: [{ message: { content: '{}' } }] },
            record
        );
        const gateway = createOpenRouterModelGateway(client, {
            modelRegistry: registry,
        });
        await gateway.generate({
            models: ['m'],
            messages,
            generation: {
                responseFormat: { name: 'Out', schema: { type: 'object' } },
            },
        });
        const req = record.request as {
            chatRequest: {
                maxTokens?: number;
                maxCompletionTokens?: number;
                responseFormat?: { type: string };
                provider?: { requireParameters?: boolean };
            };
        };
        expect(req.chatRequest.maxTokens).toBeUndefined();
        expect(req.chatRequest.maxCompletionTokens).toBeUndefined();
        expect(req.chatRequest.responseFormat?.type).toBe('json_schema');
        // requireParameters defaults to true when a capability is required.
        expect(req.chatRequest.provider?.requireParameters).toBe(true);
    });

    it('maps the portable output limit to max_tokens for provider filtering', async () => {
        const record: { request?: unknown } = {};
        const gateway = createOpenRouterModelGateway(
            fakeClient(
                {
                    model: 'm',
                    choices: [{ message: { content: 'ok' } }],
                },
                record
            ),
            { modelRegistry: new ModelRegistry() }
        );
        await gateway.generate({
            models: ['m'],
            messages,
            generation: { maxOutputTokens: 128 },
        });
        const request = record.request as {
            chatRequest: {
                maxTokens?: number;
                maxCompletionTokens?: number;
            };
        };
        expect(request.chatRequest.maxTokens).toBe(128);
        expect(request.chatRequest.maxCompletionTokens).toBeUndefined();
    });

    it('maps plugins and parallel tool call capability requirements', async () => {
        const record: { request?: unknown } = {};
        const registry = new ModelRegistry();
        registry.register(model('m', ['tools', 'parallel_tool_calls']));
        const gateway = createOpenRouterModelGateway(
            fakeClient(
                {
                    model: 'm',
                    choices: [{ message: { content: 'ok' } }],
                },
                record
            ),
            { modelRegistry: registry }
        );
        await gateway.generate({
            models: ['m'],
            messages,
            parallelToolCalls: true,
            plugins: [
                {
                    id: 'response-healing',
                    kind: 'response',
                    config: { enabled: true },
                },
            ],
        });
        const request = record.request as {
            chatRequest: {
                parallelToolCalls?: boolean;
                plugins?: unknown[];
                provider?: { requireParameters?: boolean };
            };
        };
        expect(request.chatRequest.parallelToolCalls).toBe(true);
        expect(request.chatRequest.plugins).toEqual([
            { id: 'response-healing', enabled: true },
        ]);
        expect(request.chatRequest.provider?.requireParameters).toBe(true);
    });

    it('fails before transport for Responses-only server tools', async () => {
        const gateway = createOpenRouterModelGateway(
            fakeClient({
                model: 'm',
                choices: [{ message: { content: 'unused' } }],
            })
        );
        await expect(
            gateway.generate({
                models: ['m'],
                messages,
                tools: [
                    {
                        type: 'provider-server',
                        name: 'openrouter:apply_patch',
                        transport: 'responses',
                    },
                ],
            })
        ).rejects.toBeInstanceOf(ProviderCallError);
    });
});

describe('OpenRouterModelGateway normalization', () => {
    it('normalizes actual model, usage, ids; leaves absent fields undefined', async () => {
        const client = fakeClient({
            id: 'gen-42',
            model: 'openai/gpt-4o',
            choices: [
                {
                    finishReason: 'stop',
                    message: { content: 'answer' },
                },
            ],
            usage: {
                promptTokens: 12,
                completionTokens: 8,
                totalTokens: 20,
                cost: 0.0003,
            },
        });
        const gateway = createOpenRouterModelGateway(client);
        const result = await gateway.generate({ models: ['m'], messages });
        expect(result.actualModel).toBe('openai/gpt-4o');
        expect(result.finishReason).toBe('stop');
        expect(result.usage).toMatchObject({
            inputTokens: 12,
            outputTokens: 8,
            totalTokens: 20,
            costUsd: 0.0003,
        });
        expect(result.identifiers).toEqual({
            generationId: 'gen-42',
        });
        // Not reported → undefined (never fabricated).
        expect(result.provider).toBeUndefined();
        expect(result.raw).toBeUndefined();
    });

    it('does not fabricate cost/provider when absent', async () => {
        const client = fakeClient({
            model: 'm',
            choices: [{ message: { content: 'x' } }],
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        });
        const gateway = createOpenRouterModelGateway(client);
        const result = await gateway.generate({ models: ['m'], messages });
        expect(result.usage?.costUsd).toBeUndefined();
        expect(result.provider).toBeUndefined();
        expect(result.identifiers).toBeUndefined();
    });

    it('includes raw response only when debug opt-in is set', async () => {
        const raw = { model: 'm', choices: [{ message: { content: 'x' } }] };
        const gateway = createOpenRouterModelGateway(fakeClient(raw));
        const result = await gateway.generate({
            models: ['m'],
            messages,
            debug: { includeRawResponse: true },
        });
        expect(result.raw).toEqual({ provider: 'openrouter', value: raw });
    });

    it('maps tool calls from the assistant message', async () => {
        const client = fakeClient({
            model: 'm',
            choices: [
                {
                    finishReason: 'tool_calls',
                    message: {
                        content: null,
                        toolCalls: [
                            {
                                id: 'call_1',
                                type: 'function',
                                function: { name: 'get', arguments: '{"a":1}' },
                            },
                        ],
                    },
                },
            ],
        });
        const gateway = createOpenRouterModelGateway(client);
        const result = await gateway.generate({ models: ['m'], messages });
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls?.[0]?.function.name).toBe('get');
        expect(result.finishReason).toBe('tool_calls');
    });
});

describe('OpenRouterModelGateway streaming', () => {
    it('accumulates text and tool-call deltas', async () => {
        async function* stream() {
            yield { model: 'm', choices: [{ delta: { content: 'Hel' } }] };
            yield { choices: [{ delta: { content: 'lo' } }] };
            yield {
                choices: [
                    {
                        delta: {
                            toolCalls: [
                                {
                                    index: 0,
                                    id: 'c1',
                                    function: { name: 'f', arguments: '{"x":' },
                                },
                            ],
                        },
                    },
                ],
            };
            yield {
                choices: [
                    {
                        delta: {
                            toolCalls: [
                                { index: 0, function: { arguments: '1}' } },
                            ],
                        },
                        finishReason: 'tool_calls',
                    },
                ],
                usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
            };
        }
        const client: OpenRouterV1Client = {
            chat: {
                async send() {
                    return stream();
                },
            },
        };
        const gateway = new OpenRouterModelGateway({ client });
        const tokens: string[] = [];
        const result = await gateway.generate({
            models: ['m'],
            messages,
            onTextDelta: (t) => tokens.push(t),
        });
        expect(tokens.join('')).toBe('Hello');
        expect(result.content).toBe('Hello');
        expect(result.toolCalls?.[0]?.function.arguments).toBe('{"x":1}');
        expect(result.finishReason).toBe('tool_calls');
        expect(result.usage?.totalTokens).toBe(8);
    });

    it('captures raw stream chunks only with debug opt-in', async () => {
        async function* stream() {
            yield { id: 'gen-1', choices: [{ delta: { content: 'ok' } }] };
        }
        const client: OpenRouterV1Client = {
            chat: {
                async send() {
                    return stream();
                },
            },
        };
        const result = await new OpenRouterModelGateway({ client }).generate({
            models: ['m'],
            messages,
            onTextDelta: () => undefined,
            debug: { includeRawResponse: true },
        });
        expect(result.raw).toEqual({
            provider: 'openrouter',
            value: [
                { id: 'gen-1', choices: [{ delta: { content: 'ok' } }] },
            ],
        });
        expect(result.identifiers).toEqual({ generationId: 'gen-1' });
    });

    it('extracts the selected provider from OpenRouter metadata', async () => {
        async function* stream() {
            yield {
                choices: [{ delta: { content: 'ok' } }],
                openrouterMetadata: {
                    endpoints: {
                        available: [
                            {
                                model: 'm',
                                provider: 'Provider A',
                                selected: false,
                            },
                            {
                                model: 'm',
                                provider: 'Provider B',
                                selected: true,
                            },
                        ],
                        total: 2,
                    },
                },
            };
        }
        const client: OpenRouterV1Client = {
            chat: {
                async send() {
                    return stream();
                },
            },
        };
        const result = await new OpenRouterModelGateway({ client }).generate({
            models: ['m'],
            messages,
            onTextDelta: () => undefined,
        });
        expect(result.provider).toBe('Provider B');
    });
});

describe('OpenRouterModelGateway preflight blocking', () => {
    it('fails preflight when the entire fallback chain lacks a capability', async () => {
        const registry = new ModelRegistry();
        registry.register(model('no/tools', ['temperature']));
        const client = fakeClient({
            model: 'm',
            choices: [{ message: { content: 'x' } }],
        });
        const gateway = createOpenRouterModelGateway(client, {
            modelRegistry: registry,
        });
        await expect(
            gateway.generate({
                models: ['no/tools'],
                messages,
                requiredCapabilities: ['tools'],
            })
        ).rejects.toBeInstanceOf(CapabilityPreflightError);
    });
});

describe('normalizeMessages', () => {
    it('maps tool-call and tool-result messages to SDK camelCase', () => {
        const out = normalizeMessages([
            {
                role: 'assistant',
                content: '',
                tool_calls: [
                    {
                        id: 'c1',
                        type: 'function',
                        function: { name: 'f', arguments: '{}' },
                    },
                ],
            },
            { role: 'tool', content: 'result', tool_call_id: 'c1' },
        ]);
        expect(out[0]?.toolCalls?.[0]?.id).toBe('c1');
        expect(out[1]?.toolCallId).toBe('c1');
    });
});

describe('no SDK private field access', () => {
    it('never reads _options/_baseURL from the client', async () => {
        // A frozen client with a poisoned trap for private fields.
        const trap = new Proxy(
            {
                chat: {
                    async send() {
                        return {
                            model: 'm',
                            choices: [{ message: { content: 'x' } }],
                        };
                    },
                },
            },
            {
                get(target, prop, receiver) {
                    if (prop === '_options' || prop === '_baseURL') {
                        throw new Error(
                            `private field access: ${String(prop)}`
                        );
                    }
                    return Reflect.get(target, prop, receiver);
                },
            }
        ) as unknown as OpenRouterV1Client;
        const gateway = createOpenRouterModelGateway(trap);
        const result = await gateway.generate({ models: ['m'], messages });
        expect(result.content).toBe('x');
    });
});

// Keep ProviderCallError referenced for import coverage.
describe('error type export', () => {
    it('exposes ProviderCallError', () => {
        expect(new ProviderCallError({ message: 'x' })).toBeInstanceOf(Error);
    });
});
