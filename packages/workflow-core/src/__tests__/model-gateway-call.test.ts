import { describe, expect, it } from 'vitest';
import { buildNodeModelRequest } from '../extensions/modelGatewayCall';
import {
    DEFAULT_WORKFLOW_FALLBACK_MODEL,
    DEFAULT_WORKFLOW_MODEL,
} from '../models';

const context = {
    input: '',
    history: [],
    memory: {},
    outputs: {},
    nodeChain: [],
    getNode: () => undefined,
    getOutgoingEdges: () => [],
} as any;

describe('buildNodeModelRequest', () => {
    it('adds Luna as the single automatic fallback for a non-Luna legacy model', () => {
        const request = buildNodeModelRequest({
            context,
            nodeId: 'writer',
            legacyModel: '~deepseek/deepseek-v4-flash-latest',
            messages: [],
        });

        expect(request.models).toEqual([
            '~deepseek/deepseek-v4-flash-latest',
            DEFAULT_WORKFLOW_FALLBACK_MODEL,
        ]);
    });

    it('does not duplicate Luna for the default model', () => {
        const request = buildNodeModelRequest({
            context,
            nodeId: 'writer',
            legacyModel: DEFAULT_WORKFLOW_MODEL,
            messages: [],
        });

        expect(request.models).toEqual([DEFAULT_WORKFLOW_FALLBACK_MODEL]);
    });

    it('keeps an explicit model list unchanged', () => {
        const request = buildNodeModelRequest({
            context,
            nodeId: 'writer',
            legacyModel: '~deepseek/deepseek-v4-flash-latest',
            modelRequest: {
                version: 1,
                models: ['z-ai/glm-5.2', 'openai/gpt-5.6-luna'],
            },
            messages: [],
        });

        expect(request.models).toEqual([
            'z-ai/glm-5.2',
            'openai/gpt-5.6-luna',
        ]);
    });
});
