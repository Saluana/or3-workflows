/**
 * Optional OpenTelemetry adapter (R8.AC3).
 *
 * Library code depends only on a *structural* subset of the `@opentelemetry/api`
 * surface — the host passes its own tracer/meter (constructed from its SDK). A
 * host with no SDK simply omits them and the adapter is a no-op, so nothing is
 * eagerly bundled. GenAI semantic-convention attribute names are isolated here
 * and treated as potentially unstable.
 */
import type { WorkflowEventEnvelope } from './events2';

/** Structural subset of an OpenTelemetry span. */
export interface SpanLike {
    setAttribute(key: string, value: unknown): void;
    addEvent(name: string, attributes?: Record<string, unknown>): void;
    setStatus(status: { code: number; message?: string }): void;
    end(): void;
}

/** Structural subset of an OpenTelemetry tracer. */
export interface TracerLike {
    startSpan(
        name: string,
        options?: { attributes?: Record<string, unknown> }
    ): SpanLike;
}

/** Structural subset of an OpenTelemetry counter. */
export interface CounterLike {
    add(value: number, attributes?: Record<string, unknown>): void;
}

/** Structural subset of an OpenTelemetry meter. */
export interface MeterLike {
    createCounter(name: string): CounterLike;
}

export interface OtelAdapterOptions {
    tracer?: TracerLike;
    meter?: MeterLike;
    /** Attribute namespace prefix (default: `or3.workflow`). */
    prefix?: string;
}

/**
 * Maps v2 envelopes to OpenTelemetry spans/metrics. Correlates spans by
 * `runId` and node `path`. No-op when no tracer/meter is supplied.
 */
export class OtelWorkflowAdapter {
    private readonly spans = new Map<string, SpanLike>();
    private readonly prefix: string;
    private readonly errorCounter?: CounterLike;
    private readonly modelCounter?: CounterLike;
    private readonly tokenCounter?: CounterLike;
    private readonly costCounter?: CounterLike;

    constructor(private readonly options: OtelAdapterOptions = {}) {
        this.prefix = options.prefix ?? 'or3.workflow';
        this.errorCounter = options.meter?.createCounter(
            `${this.prefix}.errors`
        );
        this.modelCounter = options.meter?.createCounter(
            `${this.prefix}.model_calls`
        );
        this.tokenCounter = options.meter?.createCounter(
            `${this.prefix}.tokens`
        );
        this.costCounter = options.meter?.createCounter(
            `${this.prefix}.cost_usd`
        );
    }

    /** True when a real tracer or meter is attached. */
    get enabled(): boolean {
        return Boolean(this.options.tracer || this.options.meter);
    }

    private key(runId: string, id: string, path: string[]): string {
        return `${runId}:${path.join('/')}:${id}`;
    }

    /** Feed a v2 envelope to the adapter. Safe to call without a tracer. */
    handle(envelope: WorkflowEventEnvelope): void {
        const tracer = this.options.tracer;
        const { event, runId, path } = envelope;
        const baseAttrs = {
            [`${this.prefix}.run_id`]: runId,
            [`${this.prefix}.path`]: path.join('/'),
        };

        switch (event.type) {
            case 'node_start': {
                if (!tracer) return;
                const span = tracer.startSpan(`node ${event.nodeId}`, {
                    attributes: {
                        ...baseAttrs,
                        [`${this.prefix}.node_id`]: event.nodeId,
                    },
                });
                this.spans.set(
                    this.key(runId, event.nodeId, path),
                    span
                );
                break;
            }
            case 'node_finish': {
                const key = this.key(runId, event.nodeId, path);
                const span = this.spans.get(key);
                span?.setStatus({ code: 1 });
                span?.end();
                this.spans.delete(key);
                break;
            }
            case 'node_error': {
                this.errorCounter?.add(1, baseAttrs);
                const key = this.key(runId, event.nodeId, path);
                const span = this.spans.get(key);
                span?.setStatus({ code: 2, message: event.error.message });
                span?.end();
                this.spans.delete(key);
                break;
            }
            case 'model_start': {
                this.modelCounter?.add(1, baseAttrs);
                const span = tracer?.startSpan('gen_ai.chat', {
                        attributes: {
                            ...baseAttrs,
                            [`${this.prefix}.node_id`]: event.nodeId,
                            [`${this.prefix}.call_id`]: event.callId,
                            [`${this.prefix}.transport`]: event.transport,
                            // GenAI semantic conventions (unstable).
                            'gen_ai.request.model':
                                event.requestedModels[0],
                        },
                    });
                if (span) {
                    this.spans.set(
                        this.key(runId, event.callId, path),
                        span
                    );
                }
                break;
            }
            case 'model_finish': {
                const attrs = {
                    ...baseAttrs,
                    model: event.actualModel ?? 'unknown',
                    provider: event.provider ?? 'unknown',
                };
                if (event.usage?.totalTokens) {
                    this.tokenCounter?.add(
                        event.usage.totalTokens,
                        attrs
                    );
                }
                if (event.usage?.costUsd) {
                    this.costCounter?.add(event.usage.costUsd, attrs);
                }
                const key = this.key(runId, event.callId, path);
                const span = this.spans.get(key);
                if (event.actualModel) {
                    span?.setAttribute(
                        'gen_ai.response.model',
                        event.actualModel
                    );
                }
                if (event.provider) {
                    span?.setAttribute(
                        `${this.prefix}.provider`,
                        event.provider
                    );
                }
                span?.setStatus({ code: 1 });
                span?.end();
                this.spans.delete(key);
                break;
            }
            case 'model_error': {
                this.errorCounter?.add(1, baseAttrs);
                const key = this.key(runId, event.callId, path);
                const span = this.spans.get(key);
                span?.setStatus({
                    code: 2,
                    message: event.error.message,
                });
                span?.end();
                this.spans.delete(key);
                break;
            }
            case 'tool_receipt': {
                tracer
                    ?.startSpan(`tool ${event.toolName}`, {
                        attributes: {
                            ...baseAttrs,
                            [`${this.prefix}.tool.status`]: event.status,
                        },
                    })
                    .end();
                break;
            }
            default:
                break;
        }
    }
}
