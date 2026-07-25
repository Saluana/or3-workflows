/**
 * Privacy defaults, bounded payloads, and redaction (R8.AC4).
 *
 * By default, exported/persisted events contain NO prompt text, attachment
 * bytes, credentials, tool payloads, or raw provider content. Hosts may opt in
 * to richer capture explicitly.
 */
import type { WorkflowEventEnvelope, WorkflowEventV2 } from './events2';
import type { ExecutionResult } from '../types';
import type { HITLRequest } from '../hitl';
import type { ProviderAnnotation } from '../gateway';

export interface RedactionOptions {
    /** Include node output text (default: false). */
    includeOutputs?: boolean;
    /** Include streamed token text (default: false). */
    includeTokens?: boolean;
    /** Include tool call/result payloads (default: false). */
    includeToolPayloads?: boolean;
    /** Include provider annotations/citations (default: false). */
    includeProviderAnnotations?: boolean;
    /** Maximum length for any retained string field (default: 512). */
    maxStringLength?: number;
}

const DEFAULTS: Required<RedactionOptions> = {
    includeOutputs: false,
    includeTokens: false,
    includeToolPayloads: false,
    includeProviderAnnotations: false,
    maxStringLength: 512,
};

const REDACTED = '[redacted]';

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Return a redacted copy of a v2 envelope safe to export/persist. Sensitive
 * fields are removed unless explicitly opted in; retained strings are bounded.
 */
export function redactEnvelope(
    envelope: WorkflowEventEnvelope,
    options: RedactionOptions = {}
): WorkflowEventEnvelope {
    const opts = { ...DEFAULTS, ...options };
    return {
        ...envelope,
        event: redactEvent(envelope.event, opts),
    };
}

function redactEvent(
    event: WorkflowEventV2,
    opts: Required<RedactionOptions>
): WorkflowEventV2 {
    switch (event.type) {
        case 'node_finish':
            return {
                ...event,
                output: opts.includeOutputs
                    ? truncate(event.output, opts.maxStringLength)
                    : REDACTED,
            };
        case 'token':
        case 'reasoning':
            return {
                ...event,
                token: opts.includeTokens
                    ? truncate(event.token, opts.maxStringLength)
                    : REDACTED,
            };
        case 'tool_result':
            return {
                ...event,
                event: {
                    ...event.event,
                    error: event.event.error
                        ? truncate(
                              event.event.error,
                              opts.maxStringLength
                          )
                        : undefined,
                },
                result: opts.includeToolPayloads
                    ? event.result
                        ? truncate(event.result, opts.maxStringLength)
                        : event.result
                    : REDACTED,
            };
        case 'tool_call':
            return {
                ...event,
                event: {
                    ...event.event,
                    error: event.event.error
                        ? truncate(
                              event.event.error,
                              opts.maxStringLength
                          )
                        : undefined,
                },
            };
        case 'tool_intent':
            return {
                ...event,
                idempotencyKey: event.idempotencyKey
                    ? opts.includeToolPayloads
                        ? truncate(
                              event.idempotencyKey,
                              opts.maxStringLength
                          )
                        : REDACTED
                    : undefined,
            };
        case 'model_finish':
            return {
                ...event,
                annotations: event.annotations
                    ? opts.includeProviderAnnotations
                        ? event.annotations.map((annotation) =>
                              boundAnnotation(
                                  annotation,
                                  opts.maxStringLength
                              )
                          )
                        : event.annotations.map((annotation) => ({
                              type: annotation.type,
                          }))
                    : undefined,
            };
        case 'hitl_pause':
            return {
                ...event,
                request: redactHitlRequest(event.request, opts),
            };
        case 'done':
            return {
                ...event,
                result: redactExecutionResult(event.result, opts),
            };
        case 'node_error':
        case 'model_error':
            // Preserve error type/name but bound the message.
            return {
                ...event,
                error: boundError(event.error, opts.maxStringLength),
            };
        default:
            return event;
    }
}

function redactHitlRequest(
    request: HITLRequest,
    opts: Required<RedactionOptions>
): HITLRequest {
    return {
        ...request,
        prompt: REDACTED,
        context: {
            ...request.context,
            input: REDACTED,
            output:
                request.context.output === undefined
                    ? undefined
                    : opts.includeOutputs
                      ? truncate(
                            request.context.output,
                            opts.maxStringLength
                        )
                      : REDACTED,
        },
    };
}

function redactExecutionResult(
    result: ExecutionResult,
    opts: Required<RedactionOptions>
): ExecutionResult {
    const output = (value: string) =>
        opts.includeOutputs
            ? truncate(value, opts.maxStringLength)
            : REDACTED;
    return {
        ...result,
        output: output(result.output),
        finalOutput: output(result.finalOutput),
        nodeOutputs: Object.fromEntries(
            Object.entries(result.nodeOutputs).map(([nodeId, value]) => [
                nodeId,
                output(value),
            ])
        ),
        sessionMessages: undefined,
        error: result.error
            ? boundError(result.error, opts.maxStringLength)
            : undefined,
        hitlRequest: result.hitlRequest
            ? redactHitlRequest(result.hitlRequest, opts)
            : undefined,
        pause: result.pause
            ? {
                  ...result.pause,
                  reason: result.pause.reason
                      ? truncate(
                            result.pause.reason,
                            opts.maxStringLength
                        )
                      : undefined,
                  hitlRequest: result.pause.hitlRequest
                      ? redactHitlRequest(
                            result.pause.hitlRequest,
                            opts
                        )
                      : undefined,
              }
            : undefined,
        modelCalls: result.modelCalls?.map((call) => ({
            ...call,
            annotations: call.annotations
                ? opts.includeProviderAnnotations
                    ? call.annotations.map((annotation) =>
                          boundAnnotation(
                              annotation,
                              opts.maxStringLength
                          )
                      )
                    : call.annotations.map((annotation) => ({
                          type: annotation.type,
                      }))
                : undefined,
        })),
    };
}

function boundAnnotation(
    annotation: ProviderAnnotation,
    max: number
): ProviderAnnotation {
    return boundValue(annotation, max) as ProviderAnnotation;
}

function boundValue(value: unknown, max: number): unknown {
    if (typeof value === 'string') return truncate(value, max);
    if (Array.isArray(value)) {
        return value
            .slice(0, 50)
            .map((item) => boundValue(item, max));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 50)
                .map(([key, item]) => [
                    key,
                    boundValue(item, max),
                ])
        );
    }
    return value;
}

function boundError(error: Error, max: number): Error {
    const bounded = new Error(truncate(error.message, max));
    bounded.name = error.name;
    return bounded;
}

/** True when an envelope, after default redaction, carries no sensitive text. */
export function isSafeForExport(envelope: WorkflowEventEnvelope): boolean {
    const redacted = redactEnvelope(envelope);
    const event = redacted.event;
    if (event.type === 'node_finish') return event.output === REDACTED;
    if (event.type === 'token' || event.type === 'reasoning')
        return event.token === REDACTED;
    if (event.type === 'tool_result') return event.result === REDACTED;
    if (event.type === 'tool_intent')
        return (
            event.idempotencyKey === undefined ||
            event.idempotencyKey === REDACTED
        );
    if (event.type === 'hitl_pause')
        return (
            event.request.prompt === REDACTED &&
            event.request.context.input === REDACTED &&
            (event.request.context.output === undefined ||
                event.request.context.output === REDACTED)
        );
    if (event.type === 'done')
        return (
            event.result.output === REDACTED &&
            event.result.finalOutput === REDACTED &&
            event.result.sessionMessages === undefined &&
            Object.values(event.result.nodeOutputs).every(
                (value) => value === REDACTED
            )
        );
    if (event.type === 'model_finish')
        return (
            event.annotations?.every(
                (annotation) =>
                    Object.keys(annotation).length === 1 &&
                    typeof annotation.type === 'string'
            ) ?? true
        );
    return true;
}
