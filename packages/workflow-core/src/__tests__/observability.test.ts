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
    type EvaluationCase,
    type SpanLike,
    type TracerLike,
} from '../observability';
import type { WorkflowData } from '../types';

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
            seq.envelope({ type: 'model_start', nodeId: 'n', requestedModels: ['m'] })
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
});
