import { OpenRouter } from '@openrouter/sdk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
    OpenRouterExecutionAdapter,
    type ExecutionCallbacks,
    type ExecutionResult,
    type WorkflowData,
    type WorkflowEdge,
    type WorkflowNode,
} from '..';

const MODEL = process.env.OPENROUTER_LIVE_MODEL ??
    '~deepseek/deepseek-v4-flash-latest';
const LIVE = process.env.RUN_OPENROUTER_LIVE === '1';
const API_KEY = process.env.OPENROUTER_API_KEY;
const PROBE_ID = randomUUID();
const SESSION_ID = `or3-workflows-cache-live-${PROBE_ID}`;
const callbacks: ExecutionCallbacks = {
    onNodeStart: () => undefined,
    onNodeFinish: () => undefined,
    onNodeError: () => undefined,
    onToken: () => undefined,
};

const node = (
    id: string,
    type: string,
    data: Record<string, unknown>
): WorkflowNode => ({ id, type, position: { x: 0, y: 0 }, data: data as any });

const edge = (source: string, target: string): WorkflowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
});

function cacheWorkflow(): WorkflowData {
    const prompt = [
        'You are a deterministic text-processing stage.',
        'Read the supplied reference and return one short factual sentence.',
        'Do not repeat the reference or add commentary.',
    ].join(' ');
    const agents = Array.from({ length: 4 }, (_, index) =>
        node(`agent-${index + 1}`, 'agent', {
            label: `Cache stage ${index + 1}`,
            model: MODEL,
            prompt,
            task: `State one fact for stage ${index + 1}.`,
            temperature: 0,
            maxTokens: 64,
            modelRequest: {
                version: 1,
                models: [MODEL],
                generation: { reasoning: { effort: 'none' } },
            },
        })
    );

    return {
        meta: {
            id: 'openrouter-cache-live',
            version: '2.0.0',
            name: 'OpenRouter cache probe',
        },
        nodes: [
            node('start', 'start', { label: 'Start' }),
            ...agents,
            node('output', 'output', {
                label: 'Output',
                mode: 'combine',
                format: 'text',
                sources: ['agent-4'],
            }),
        ],
        edges: [
            edge('start', 'agent-1'),
            edge('start', 'agent-2'),
            edge('agent-1', 'agent-2'),
            edge('start', 'agent-3'),
            edge('agent-2', 'agent-3'),
            edge('start', 'agent-4'),
            edge('agent-3', 'agent-4'),
            edge('agent-4', 'output'),
        ],
    };
}

function stableReference(): string {
    const paragraph = [
        `Probe ${PROBE_ID}.`,
        'The Northwind archive records that the observatory opened in 1912.',
        'Its brass clock was restored in 1987 and is wound every Thursday.',
        'The eastern reading room contains forty-two oak desks.',
        'This reference is synthetic and exists only to exercise prompt caching.',
    ].join(' ');
    return Array.from({ length: 140 }, () => paragraph).join('\n');
}

async function runProbe(): Promise<ExecutionResult> {
    if (!API_KEY) throw new Error('OPENROUTER_API_KEY is required');
    const adapter = new OpenRouterExecutionAdapter(
        new OpenRouter({ apiKey: API_KEY }) as any,
        {
            defaultModel: MODEL,
            maxRetries: 1,
            sessionId: SESSION_ID,
        }
    );
    return adapter.execute(
        cacheWorkflow(),
        {
            text: stableReference(),
            attachments: [],
        },
        callbacks
    );
}

const cacheReads = (result: ExecutionResult) =>
    result.modelCalls?.reduce(
        (total, call) => total + (call.usage?.cachedTokens ?? 0),
        0
    ) ?? 0;

describe.skipIf(!LIVE || !API_KEY)(
    `OpenRouter prompt cache (${MODEL})`,
    () => {
        it('reports cached input after warming the same routed prefix', async () => {
            const cold = await runProbe();
            expect(cold.success).toBe(true);
            expect(cold.modelCalls).toHaveLength(4);

            const warm = await runProbe();
            expect(warm.success).toBe(true);
            expect(warm.modelCalls).toHaveLength(4);

            const coldReads = cacheReads(cold);
            const warmReads = cacheReads(warm);
            console.info(
                `[openrouter-cache] cold=${coldReads} cached tokens; warm=${warmReads} cached tokens`
            );
            expect(coldReads).toBeGreaterThan(0);
            expect(warmReads).toBeGreaterThan(coldReads);
        }, 600_000);
    }
);
