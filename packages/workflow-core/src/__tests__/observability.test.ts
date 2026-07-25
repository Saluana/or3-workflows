import { describe, it, expect, vi } from 'vitest';
import {
    RunSequencer,
    projectToLegacyEvent,
    redactEnvelope,
    isSafeForExport,
    OtelWorkflowAdapter,
    runEvaluationSuite,
    summarizeEvaluation,
    compareCandidates,
    InMemoryEvaluationArtifactStore,
    type EvaluationCase,
    type SpanLike,
    type TracerLike,
} from '../observability';
import type { WorkflowData } from '../types';
import { OpenRouterExecutionAdapter } from '../execution';
import type {
    ModelGateway,
    ModelRequest,
    WorkflowEventEnvelope,
} from '../index';

describe('event v2 envelope + legacy projection (R8.AC1)', () => {
    it('assigns stable run/sequence correlation', () => {
        const seq = new RunSequencer('run1', { workflowId: 'wf' });
        const e0 = seq.envelope({ type: 'run_start' });
        const e1 = seq.envelope({
            type: 'node_start',
            nodeId: 'n1',
        });
        expect(e0.sequence).toBe(0);
        expect(e1.sequence).toBe(1);
        expect(e0.runId).toBe('run1');
        expect(e0.workflowId).toBe('wf');
    });

    it('projects v1-compatible events and returns null for v2-only', () => {
        const seq = new RunSequencer('run1');
        const legacy = projectToLegacyEvent(
            seq.envelope({ type: 'node_finish', nodeId: 'n', output: 'x' })
        );
        expect(legacy?.type).toBe('node_finish');
        const v2only = projectToLegacyEvent(
            seq.envelope({
                type: 'model_start',
                callId: 'call-1',
                nodeId: 'n',
                requestedModels: ['m'],
                transport: 'chat',
            })
        );
        expect(v2only).toBeNull();
    });
});

describe('redaction defaults (R8.AC4)', () => {
    it('redacts outputs, tokens, and tool payloads by default', () => {
        const seq = new RunSequencer('r');
        const finish = redactEnvelope(
            seq.envelope({ type: 'node_finish', nodeId: 'n', output: 'secret' })
        );
        expect((finish.event as { output: string }).output).toBe('[redacted]');
        expect(isSafeForExport(seq.envelope({ type: 'token', nodeId: 'n', token: 'hi' }))).toBe(
            true
        );
    });

    it('includes outputs when opted in and bounds length', () => {
        const seq = new RunSequencer('r');
        const long = 'a'.repeat(1000);
        const finish = redactEnvelope(
            seq.envelope({ type: 'node_finish', nodeId: 'n', output: long }),
            { includeOutputs: true, maxStringLength: 10 }
        );
        expect((finish.event as { output: string }).output.length).toBeLessThan(
            20
        );
    });

    it('redacts completion results, HITL context, annotations, and idempotency keys', () => {
        const seq = new RunSequencer('r');
        const done = redactEnvelope(
            seq.envelope({
                type: 'done',
                result: {
                    success: true,
                    output: 'final secret',
                    finalOutput: 'final secret',
                    nodeOutputs: { agent: 'node secret' },
                    executionOrder: ['agent'],
                    duration: 1,
                    sessionMessages: [
                        { role: 'user', content: 'prompt secret' },
                    ],
                    modelCalls: [
                        {
                            callId: 'call',
                            nodeId: 'agent',
                            requestedModels: ['model'],
                            transport: 'chat',
                            annotations: [
                                {
                                    type: 'url_citation',
                                    content: 'provider secret',
                                },
                            ],
                        },
                    ],
                },
            })
        );
        const hitl = redactEnvelope(
            seq.envelope({
                type: 'hitl_pause',
                resumeToken: 'resume',
                request: {
                    id: 'approval',
                    nodeId: 'agent',
                    nodeLabel: 'Agent',
                    mode: 'review',
                    prompt: 'Review this secret',
                    context: {
                        input: 'input secret',
                        output: 'output secret',
                        workflowName: 'Workflow',
                    },
                    createdAt: new Date(0).toISOString(),
                },
            })
        );
        const intent = redactEnvelope(
            seq.envelope({
                type: 'tool_intent',
                callId: 'call',
                toolName: 'charge',
                nodeId: 'agent',
                idempotencyKey: 'customer-secret',
            })
        );

        expect(isSafeForExport(done)).toBe(true);
        expect(isSafeForExport(hitl)).toBe(true);
        expect(isSafeForExport(intent)).toBe(true);
        expect(
            done.event.type === 'done'
                ? done.event.result.modelCalls?.[0]?.annotations
                : undefined
        ).toEqual([{ type: 'url_citation' }]);
    });
});

describe('OpenTelemetry adapter (R8.AC3)', () => {
    it('is a no-op without a tracer/meter', () => {
        const adapter = new OtelWorkflowAdapter();
        expect(adapter.enabled).toBe(false);
        const seq = new RunSequencer('r');
        expect(() =>
            adapter.handle(seq.envelope({ type: 'node_start', nodeId: 'n' }))
        ).not.toThrow();
    });

    it('emits correlated spans to a test tracer', () => {
        const ended: string[] = [];
        const span: SpanLike = {
            setAttribute: vi.fn(),
            addEvent: vi.fn(),
            setStatus: vi.fn(),
            end: vi.fn(() => ended.push('end')),
        };
        const tracer: TracerLike = {
            startSpan: vi.fn(() => span),
        };
        const adapter = new OtelWorkflowAdapter({ tracer });
        expect(adapter.enabled).toBe(true);
        const seq = new RunSequencer('r');
        adapter.handle(seq.envelope({ type: 'node_start', nodeId: 'n' }));
        adapter.handle(seq.envelope({ type: 'node_finish', nodeId: 'n', output: 'x' }));
        expect(tracer.startSpan).toHaveBeenCalled();
        expect(ended.length).toBeGreaterThan(0);
    });

    it('keeps equal node ids in different subflow paths on separate spans', () => {
        const spans: SpanLike[] = [];
        const tracer: TracerLike = {
            startSpan: vi.fn(() => {
                const span: SpanLike = {
                    setAttribute: vi.fn(),
                    addEvent: vi.fn(),
                    setStatus: vi.fn(),
                    end: vi.fn(),
                };
                spans.push(span);
                return span;
            }),
        };
        const adapter = new OtelWorkflowAdapter({ tracer });
        const seq = new RunSequencer('r');
        adapter.handle(
            seq.envelope(
                { type: 'node_start', nodeId: 'worker' },
                { path: ['branch-a'] }
            )
        );
        adapter.handle(
            seq.envelope(
                { type: 'node_start', nodeId: 'worker' },
                { path: ['branch-b'] }
            )
        );
        adapter.handle(
            seq.envelope(
                {
                    type: 'node_finish',
                    nodeId: 'worker',
                    output: 'a',
                },
                { path: ['branch-a'] }
            )
        );
        adapter.handle(
            seq.envelope(
                {
                    type: 'node_finish',
                    nodeId: 'worker',
                    output: 'b',
                },
                { path: ['branch-b'] }
            )
        );

        expect(spans).toHaveLength(2);
        expect(spans[0]?.end).toHaveBeenCalledOnce();
        expect(spans[1]?.end).toHaveBeenCalledOnce();
    });
});

describe('execution event bridge', () => {
    it('records fallback routing, actual model, cost, and redacted V2 output', async () => {
        const requests: ModelRequest[] = [];
        const gateway: ModelGateway = {
            async generate(request) {
                requests.push(request);
                return {
                    requestedModels: request.models,
                    actualModel: 'mock/fallback',
                    provider: 'MockProvider',
                    assistantMessage: {
                        role: 'assistant',
                        content: 'secret output',
                    },
                    content: 'secret output',
                    finishReason: 'stop',
                    usage: {
                        inputTokens: 4,
                        outputTokens: 2,
                        totalTokens: 6,
                        costUsd: 0.002,
                    },
                    identifiers: { generationId: 'gen-1' },
                    timing: {
                        startedAt: 1,
                        completedAt: 3,
                        totalMs: 2,
                    },
                };
            },
            async getModelCapabilities() {
                return null;
            },
        };
        const events: WorkflowEventEnvelope[] = [];
        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'telemetry' },
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
                    position: { x: 1, y: 0 },
                    data: {
                        label: 'Agent',
                        prompt: 'Answer',
                        model: 'mock/primary',
                        modelRequest: {
                            version: 1,
                            models: [
                                'mock/primary',
                                'mock/fallback',
                            ],
                        },
                    },
                },
            ] as WorkflowData['nodes'],
            edges: [
                {
                    id: 'start-agent',
                    source: 'start',
                    target: 'agent',
                },
            ],
        };
        const adapter = new OpenRouterExecutionAdapter(gateway, {
            preflight: false,
            onEventV2: (event) => events.push(event),
        });
        const result = await adapter.execute(
            workflow,
            { text: 'hello' },
            {
                onNodeStart: vi.fn(),
                onNodeFinish: vi.fn(),
                onNodeError: vi.fn(),
                onToken: vi.fn(),
            }
        );

        expect(result.success).toBe(true);
        expect(requests[0]?.models).toEqual([
            'mock/primary',
            'mock/fallback',
        ]);
        expect(result.modelCalls?.[0]).toMatchObject({
            actualModel: 'mock/fallback',
            provider: 'MockProvider',
            identifiers: { generationId: 'gen-1' },
        });
        expect(result.costUsd).toBe(0.002);
        const finish = events.find(
            (event) =>
                event.event.type === 'node_finish' &&
                event.event.nodeId === 'agent'
        );
        expect(
            finish?.event.type === 'node_finish'
                ? finish.event.output
                : undefined
        ).toBe('[redacted]');
        expect(
            events.some(
                (event) => event.event.type === 'model_finish'
            )
        ).toBe(true);
    });
});

const fixture: WorkflowData = {
    meta: { version: '2.0.0', name: 'eval' },
    nodes: [],
    edges: [],
};

describe('evaluation harness (R8.AC5, R8.AC6)', () => {
    const cases: EvaluationCase[] = [
        {
            id: 'c1',
            workflowFixture: fixture,
            input: { input: 'hi' } as never,
            providerMode: 'mock',
            assertions: [{ kind: 'output-contains', value: 'hello' }],
            limits: { maxDurationMs: 1000 },
        },
    ];

    it('runs mock cases and reports pass/fail', async () => {
        const results = await runEvaluationSuite(cases, async () => ({
            output: 'hello world',
            durationMs: 5,
            costUsd: 0.001,
        }));
        expect(results[0].passed).toBe(true);
        const report = summarizeEvaluation(results);
        expect(report.passed).toBe(1);
    });

    it('skips live cases unless allowed', async () => {
        const live: EvaluationCase[] = [
            { ...cases[0], id: 'live', providerMode: 'live' },
        ];
        const runner = vi.fn(async () => ({ output: 'x', durationMs: 1 }));
        const results = await runEvaluationSuite(live, runner, {
            allowLive: false,
        });
        expect(results[0].skipped).toBe(true);
        expect(runner).not.toHaveBeenCalled();
    });

    it('compares candidates and recommends the best', () => {
        const cmp = compareCandidates({
            a: [
                {
                    caseId: 'c1',
                    skipped: false,
                    passed: true,
                    assertions: [],
                    output: { output: 'x', durationMs: 1, costUsd: 0.5 },
                },
            ],
            b: [
                {
                    caseId: 'c1',
                    skipped: false,
                    passed: true,
                    assertions: [],
                    output: { output: 'x', durationMs: 1, costUsd: 0.1 },
                },
            ],
        });
        expect(cmp.recommendation).toBe('b');
    });

    it('persists isolated evaluation artifacts through a host store', async () => {
        const store = new InMemoryEvaluationArtifactStore();
        await runEvaluationSuite(
            cases,
            async () => ({
                output: 'hello',
                durationMs: 1,
            }),
            { artifactStore: store, suiteId: 'regression-1' }
        );
        const artifacts = await store.list('regression-1');
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]?.result.caseId).toBe('c1');
    });
});
