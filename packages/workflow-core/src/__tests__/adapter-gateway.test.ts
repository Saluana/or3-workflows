import { describe, it, expect } from 'vitest';
import {
    OpenRouterExecutionAdapter,
    LegacyLLMProviderGateway,
    isModelGateway,
    type LLMProvider,
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
});
