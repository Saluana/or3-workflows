import { describe, it, expect, beforeEach } from 'vitest';
import type { Model } from '@openrouter/sdk/models';
import {
    ModelRegistry,
    modelRegistry,
    ModelInfo,
    extractProvider,
    toModelInfo,
    DEFAULT_MODELS,
    registerDefaultModels,
} from '../models';

// Sample model matching OpenRouter SDK format (camelCase)
const sampleGPT4Model: Model = {
    id: 'openai/gpt-4',
    canonicalSlug: 'openai/gpt-4',
    name: 'GPT-4',
    created: 1692901234,
    description: 'GPT-4 is a large multimodal model.',
    pricing: {
        prompt: '0.00003',
        completion: '0.00006',
    },
    contextLength: 8192,
    architecture: {
        tokenizer: 'GPT',
        modality: 'text->text',
        inputModalities: ['text'],
        outputModalities: ['text'],
    },
    topProvider: {
        isModerated: true,
        maxCompletionTokens: 4096,
    },
    perRequestLimits: null,
    supportedParameters: ['temperature', 'top_p', 'max_tokens'],
    defaultParameters: { temperature: 0.7 },
};

const sampleVisionModel: Model = {
    id: 'openai/gpt-4-vision-preview',
    canonicalSlug: 'openai/gpt-4-vision-preview',
    name: 'GPT-4 Vision',
    created: 1699401600,
    pricing: {
        prompt: '0.00001',
        completion: '0.00003',
    },
    contextLength: 128000,
    architecture: {
        tokenizer: 'GPT',
        modality: 'text+image->text',
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
    },
    topProvider: {
        isModerated: true,
    },
    perRequestLimits: null,
    supportedParameters: ['temperature', 'top_p', 'max_tokens'],
    defaultParameters: null,
};

const sampleClaudeModel: Model = {
    id: 'anthropic/claude-3-opus',
    canonicalSlug: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    created: 1709596800,
    pricing: {
        prompt: '0.000015',
        completion: '0.000075',
    },
    contextLength: 200000,
    architecture: {
        tokenizer: 'Claude',
        modality: 'text+image->text',
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
    },
    topProvider: {
        isModerated: true,
        contextLength: 200000,
    },
    perRequestLimits: null,
    supportedParameters: [
        'temperature',
        'top_p',
        'top_k',
        'max_tokens',
        'tools',
    ],
    defaultParameters: { temperature: 1 },
};

const sampleGeminiModel: Model = {
    id: 'google/gemini-pro-1.5',
    canonicalSlug: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    created: 1707955200,
    pricing: {
        prompt: '0.00000125',
        completion: '0.000005',
    },
    contextLength: 1000000,
    architecture: {
        tokenizer: 'Gemini',
        modality: 'text+image+video+audio->text',
        inputModalities: ['text', 'image', 'video', 'audio'],
        outputModalities: ['text'],
    },
    topProvider: {
        isModerated: true,
    },
    perRequestLimits: null,
    supportedParameters: ['temperature', 'top_p', 'max_tokens', 'tools'],
    defaultParameters: null,
};

describe('ModelRegistry', () => {
    let registry: ModelRegistry;

    beforeEach(() => {
        registry = new ModelRegistry();
    });

    describe('register', () => {
        it('should register a single model', () => {
            registry.register(sampleGPT4Model);
            expect(registry.has('openai/gpt-4')).toBe(true);
            expect(registry.size).toBe(1);
        });

        it('should overwrite existing model with same ID', () => {
            registry.register(sampleGPT4Model);
            const updatedModel = { ...sampleGPT4Model, name: 'GPT-4 Updated' };
            registry.register(updatedModel);
            expect(registry.size).toBe(1);
            expect(registry.get('openai/gpt-4')?.name).toBe('GPT-4 Updated');
        });
    });

    describe('registerMany', () => {
        it('should register multiple models', () => {
            registry.registerMany([
                sampleGPT4Model,
                sampleVisionModel,
                sampleClaudeModel,
            ]);
            expect(registry.size).toBe(3);
            expect(registry.has('openai/gpt-4')).toBe(true);
            expect(registry.has('openai/gpt-4-vision-preview')).toBe(true);
            expect(registry.has('anthropic/claude-3-opus')).toBe(true);
        });
    });

    describe('unregister', () => {
        it('should remove a registered model', () => {
            registry.register(sampleGPT4Model);
            expect(registry.unregister('openai/gpt-4')).toBe(true);
            expect(registry.has('openai/gpt-4')).toBe(false);
            expect(registry.size).toBe(0);
        });

        it('should return false for non-existent model', () => {
            expect(registry.unregister('non-existent')).toBe(false);
        });
    });

    describe('clear', () => {
        it('should remove all models', () => {
            registry.registerMany([sampleGPT4Model, sampleVisionModel]);
            registry.clear();
            expect(registry.size).toBe(0);
        });
    });

    describe('get', () => {
        it('should return registered model', () => {
            registry.register(sampleGPT4Model);
            const model = registry.get('openai/gpt-4');
            expect(model).toEqual(sampleGPT4Model);
        });

        it('should return undefined for non-existent model', () => {
            expect(registry.get('non-existent')).toBeUndefined();
        });
    });

    describe('getInfo', () => {
        it('should return simplified ModelInfo', () => {
            registry.register(sampleGPT4Model);
            const info = registry.getInfo('openai/gpt-4');
            expect(info).toBeDefined();
            expect(info?.id).toBe('openai/gpt-4');
            expect(info?.name).toBe('GPT-4');
            expect(info?.provider).toBe('Openai');
            expect(info?.inputModalities).toEqual(['text']);
            expect(info?.contextLength).toBe(8192);
        });

        it('should return undefined for non-existent model', () => {
            expect(registry.getInfo('non-existent')).toBeUndefined();
        });
    });

    describe('getAll and getAllInfo', () => {
        it('should return all models', () => {
            registry.registerMany([sampleGPT4Model, sampleClaudeModel]);
            const all = registry.getAll();
            expect(all).toHaveLength(2);
        });

        it('should return all models as ModelInfo', () => {
            registry.registerMany([sampleGPT4Model, sampleClaudeModel]);
            const allInfo = registry.getAllInfo();
            expect(allInfo).toHaveLength(2);
            expect(allInfo[0]).toHaveProperty('provider');
        });
    });

    describe('query', () => {
        beforeEach(() => {
            registry.registerMany([
                sampleGPT4Model,
                sampleVisionModel,
                sampleClaudeModel,
                sampleGeminiModel,
            ]);
        });

        it('should filter by provider', () => {
            const openaiModels = registry.query({ provider: 'openai' });
            expect(openaiModels).toHaveLength(2);
            expect(openaiModels.every((m) => m.id.startsWith('openai/'))).toBe(
                true
            );
        });

        it('should filter by input modality', () => {
            const visionModels = registry.query({ inputModality: 'image' });
            expect(visionModels).toHaveLength(3); // vision, claude, gemini
        });

        it('should filter by audio modality', () => {
            const audioModels = registry.query({ inputModality: 'audio' });
            expect(audioModels).toHaveLength(1);
            expect(audioModels[0].id).toBe('google/gemini-pro-1.5');
        });

        it('should filter by minimum context length', () => {
            const largeContextModels = registry.query({
                minContextLength: 100000,
            });
            expect(largeContextModels).toHaveLength(3); // vision (128k), claude (200k), gemini (1M)
        });

        it('should filter by required parameter', () => {
            const toolModels = registry.query({ requiredParameter: 'tools' });
            expect(toolModels).toHaveLength(2); // claude, gemini
        });

        it('should search by name', () => {
            const gptModels = registry.query({ search: 'gpt' });
            expect(gptModels).toHaveLength(2);
        });

        it('should combine multiple filters', () => {
            const filtered = registry.query({
                inputModality: 'image',
                minContextLength: 100000,
            });
            expect(filtered).toHaveLength(3);
        });
    });

    describe('getProviders', () => {
        it('should return unique providers', () => {
            registry.registerMany([
                sampleGPT4Model,
                sampleVisionModel,
                sampleClaudeModel,
                sampleGeminiModel,
            ]);
            const providers = registry.getProviders();
            expect(providers).toContain('Openai');
            expect(providers).toContain('Anthropic');
            expect(providers).toContain('Google');
            expect(providers).toHaveLength(3);
        });
    });

    describe('getVisionModels', () => {
        it('should return models supporting image input', () => {
            registry.registerMany([
                sampleGPT4Model,
                sampleVisionModel,
                sampleClaudeModel,
            ]);
            const visionModels = registry.getVisionModels();
            expect(visionModels).toHaveLength(2);
        });
    });

    describe('getAudioModels', () => {
        it('should return models supporting audio input', () => {
            registry.registerMany([
                sampleGPT4Model,
                sampleVisionModel,
                sampleGeminiModel,
            ]);
            const audioModels = registry.getAudioModels();
            expect(audioModels).toHaveLength(1);
            expect(audioModels[0].id).toBe('google/gemini-pro-1.5');
        });
    });

    describe('getToolCapableModels', () => {
        it('should return models supporting tools', () => {
            registry.registerMany([
                sampleGPT4Model,
                sampleClaudeModel,
                sampleGeminiModel,
            ]);
            const toolModels = registry.getToolCapableModels();
            expect(toolModels).toHaveLength(2);
        });
    });

    describe('supportsInputModality', () => {
        it('should return true for supported modality', () => {
            registry.register(sampleVisionModel);
            expect(
                registry.supportsInputModality(
                    'openai/gpt-4-vision-preview',
                    'image'
                )
            ).toBe(true);
        });

        it('should return false for unsupported modality', () => {
            registry.register(sampleGPT4Model);
            expect(
                registry.supportsInputModality('openai/gpt-4', 'image')
            ).toBe(false);
        });

        it('should return false for non-existent model', () => {
            expect(registry.supportsInputModality('non-existent', 'text')).toBe(
                false
            );
        });
    });

    describe('supportsTools', () => {
        it('should return true for tool-capable models', () => {
            registry.register(sampleClaudeModel);
            expect(registry.supportsTools('anthropic/claude-3-opus')).toBe(
                true
            );
        });

        it('should return false for non-tool models', () => {
            registry.register(sampleGPT4Model);
            expect(registry.supportsTools('openai/gpt-4')).toBe(false);
        });
    });

    describe('getContextLength', () => {
        it('should return context length for registered model', () => {
            registry.register(sampleClaudeModel);
            expect(registry.getContextLength('anthropic/claude-3-opus')).toBe(
                200000
            );
        });

        it('should return undefined for non-existent model', () => {
            expect(registry.getContextLength('non-existent')).toBeUndefined();
        });
    });
});

describe('extractProvider', () => {
    it('should extract provider from model ID', () => {
        expect(extractProvider('openai/gpt-4')).toBe('Openai');
        expect(extractProvider('anthropic/claude-3-opus')).toBe('Anthropic');
        expect(extractProvider('meta-llama/llama-3.1-70b')).toBe('Meta Llama');
        expect(extractProvider('mistralai/mistral-large')).toBe('Mistralai');
    });

    it('should handle edge cases', () => {
        expect(extractProvider('gpt-4')).toBe('Gpt 4');
        expect(extractProvider('')).toBe('');
    });
});

describe('toModelInfo', () => {
    it('should convert Model to ModelInfo', () => {
        const info: ModelInfo = toModelInfo(sampleGPT4Model);
        expect(info.id).toBe('openai/gpt-4');
        expect(info.name).toBe('GPT-4');
        expect(info.provider).toBe('Openai');
        expect(info.inputModalities).toEqual(['text']);
        expect(info.outputModalities).toEqual(['text']);
        expect(info.contextLength).toBe(8192);
        expect(info.supportedParameters).toContain('temperature');
        expect(info.pricing).toEqual({
            prompt: 0.00003,
            completion: 0.00006,
        });
        expect(info.description).toBe('GPT-4 is a large multimodal model.');
    });

    it('should handle numeric pricing', () => {
        const modelWithNumericPricing: Model = {
            ...sampleGPT4Model,
            pricing: {
                prompt: 0.00003,
                completion: 0.00006,
            },
        };
        const info = toModelInfo(modelWithNumericPricing);
        expect(info.pricing).toEqual({
            prompt: 0.00003,
            completion: 0.00006,
        });
    });
});

describe('DEFAULT_MODELS', () => {
    it('should contain common models', () => {
        expect(DEFAULT_MODELS.length).toBeGreaterThan(0);
        const modelIds = DEFAULT_MODELS.map((m) => m.id);
        expect(modelIds).toContain('openai/gpt-5.1');
        expect(modelIds).toContain('google/gemini-3-pro-preview');
        expect(modelIds).toContain('z-ai/glm-4.6');
        expect(modelIds).toContain('moonshotai/kimi-k2-thinking');
    });

    it('should have valid model structure', () => {
        for (const model of DEFAULT_MODELS) {
            expect(model.id).toBeDefined();
            expect(model.canonicalSlug).toBeDefined();
            expect(model.name).toBeDefined();
            expect(model.pricing).toBeDefined();
            expect(model.architecture).toBeDefined();
            expect(model.architecture.inputModalities).toBeDefined();
            expect(model.architecture.outputModalities).toBeDefined();
        }
    });
});

describe('registerDefaultModels', () => {
    beforeEach(() => {
        modelRegistry.clear();
    });

    it('should register all default models to global registry', () => {
        registerDefaultModels();
        expect(modelRegistry.size).toBe(DEFAULT_MODELS.length);
        expect(modelRegistry.has('openai/gpt-5.1')).toBe(true);
    });
});

describe('modelRegistry (global instance)', () => {
    beforeEach(() => {
        modelRegistry.clear();
    });

    it('should be a singleton instance', () => {
        modelRegistry.register(sampleGPT4Model);
        expect(modelRegistry.has('openai/gpt-4')).toBe(true);
    });

    it('should be separate from new instances', () => {
        modelRegistry.register(sampleGPT4Model);
        const newRegistry = new ModelRegistry();
        expect(newRegistry.has('openai/gpt-4')).toBe(false);
    });
});
