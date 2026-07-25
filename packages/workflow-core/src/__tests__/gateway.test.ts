import { describe, it, expect, expectTypeOf, vi } from 'vitest';
import {
    LegacyLLMProviderGateway,
    isModelGateway,
    isLLMProvider,
    resolveToModelGateway,
    gatewayAsLLMProvider,
    toNonEmptyModels,
    type ModelGateway,
    type ModelRequest,
    type ModelCallResult,
    type NonEmptyModels,
    type LLMProvider,
    type ChatMessage,
} from '../index';

function createLegacyProvider(
    result: Awaited<ReturnType<LLMProvider['chat']>>,
    spy?: (model: string, options: unknown) => void
): LLMProvider {
    return {
        async chat(model, _messages, options) {
            spy?.(model, options);
            // simulate streaming
            options?.onToken?.('hello');
            return result;
        },
        async getModelCapabilities(modelId) {
            return {
                id: modelId,
                name: modelId,
                inputModalities: ['text'],
                outputModalities: ['text'],
                contextLength: 4096,
                supportedParameters: ['tools'],
            };
        },
    };
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];

describe('gateway type contracts', () => {
    it('enforces non-empty models at runtime', () => {
        expect(() => toNonEmptyModels([])).toThrow(/at least one/);
        const models = toNonEmptyModels(['a', 'b']);
        expectTypeOf(models).toEqualTypeOf<NonEmptyModels>();
        expect(models[0]).toBe('a');
    });

    it('exposes provider-neutral request/result types', () => {
        expectTypeOf<ModelRequest['models']>().toEqualTypeOf<NonEmptyModels>();
        expectTypeOf<ModelCallResult['actualModel']>().toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf<ModelCallResult['usage']>().toMatchTypeOf<
            { costUsd?: number } | undefined
        >();
    });
});

describe('LegacyLLMProviderGateway', () => {
    it('adapts a legacy provider and preserves absent metadata as undefined', async () => {
        const provider = createLegacyProvider({
            content: 'answer',
            finishReason: 'stop',
        });
        const gateway = new LegacyLLMProviderGateway(provider);
        const result = await gateway.generate({
            models: ['openai/gpt-4o-mini'],
            messages,
        });
        expect(result.content).toBe('answer');
        expect(result.finishReason).toBe('stop');
        // Absent metadata is not fabricated (R2.AC3)
        expect(result.actualModel).toBeUndefined();
        expect(result.provider).toBeUndefined();
        expect(result.usage).toBeUndefined();
        expect(result.raw).toBeUndefined();
        expect(result.requestedModels).toEqual(['openai/gpt-4o-mini']);
    });

    it('maps usage when the provider reports it', async () => {
        const provider = createLegacyProvider({
            content: 'x',
            usage: {
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
            },
        });
        const gateway = new LegacyLLMProviderGateway(provider);
        const result = await gateway.generate({
            models: ['m'],
            messages,
        });
        expect(result.usage).toEqual({
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
        });
    });

    it('warns about ignored fallback models and routing', async () => {
        const warnings: string[] = [];
        const provider = createLegacyProvider({ content: 'x' });
        const gateway = new LegacyLLMProviderGateway(provider, {
            onWarning: (m) => warnings.push(m),
        });
        await gateway.generate({
            models: ['a', 'b', 'c'],
            messages,
            routing: { order: ['openai'] },
        });
        expect(warnings.some((w) => w.includes('fallback'))).toBe(true);
        expect(warnings.some((w) => w.includes('routing'))).toBe(true);
    });

    it('passes AbortSignal through to the legacy provider', async () => {
        let received: AbortSignal | undefined;
        const provider: LLMProvider = {
            async chat(_m, _msgs, options) {
                received = options?.signal;
                return { content: 'ok' };
            },
            async getModelCapabilities() {
                return null;
            },
        };
        const gateway = new LegacyLLMProviderGateway(provider);
        const controller = new AbortController();
        await gateway.generate({
            models: ['m'],
            messages,
            signal: controller.signal,
        });
        expect(received).toBe(controller.signal);
    });

    it('forwards structured output as json_schema response format', async () => {
        const spy = vi.fn();
        const provider = createLegacyProvider(
            { content: '{"a":1}' },
            (_model, options) => spy(options)
        );
        const gateway = new LegacyLLMProviderGateway(provider);
        await gateway.generate({
            models: ['m'],
            messages,
            generation: {
                responseFormat: {
                    name: 'Out',
                    schema: { type: 'object' },
                    strict: true,
                },
            },
        });
        const passed = spy.mock.calls[0]?.[0] as {
            responseFormat?: { type: string };
        };
        expect(passed.responseFormat?.type).toBe('json_schema');
    });
});

describe('gateway helpers', () => {
    it('isModelGateway / isLLMProvider discriminate correctly', () => {
        const provider = createLegacyProvider({ content: 'x' });
        const gateway = new LegacyLLMProviderGateway(provider);
        expect(isModelGateway(gateway)).toBe(true);
        expect(isModelGateway(provider)).toBe(false);
        expect(isLLMProvider(provider)).toBe(true);
        expect(isLLMProvider(gateway)).toBe(false);
    });

    it('resolveToModelGateway wraps legacy providers and passes gateways through', () => {
        const provider = createLegacyProvider({ content: 'x' });
        const wrapped = resolveToModelGateway(provider);
        expect(isModelGateway(wrapped)).toBe(true);
        const gw: ModelGateway = wrapped;
        expect(resolveToModelGateway(gw)).toBe(gw);
    });

    it('gatewayAsLLMProvider round-trips a gateway back to the legacy surface', async () => {
        const provider = createLegacyProvider({
            content: 'legacy answer',
            usage: {
                promptTokens: 3,
                completionTokens: 2,
                totalTokens: 5,
            },
            finishReason: 'stop',
        });
        const gateway = resolveToModelGateway(provider);
        const asProvider = gatewayAsLLMProvider(gateway);
        const tokens: string[] = [];
        const result = await asProvider.chat('m', messages, {
            onToken: (t) => tokens.push(t),
        });
        expect(result.content).toBe('legacy answer');
        expect(result.usage).toEqual({
            promptTokens: 3,
            completionTokens: 2,
            totalTokens: 5,
        });
        expect(result.finishReason).toBe('stop');
        expect(tokens).toContain('hello');
    });
});
