/**
 * Privacy defaults, bounded payloads, and redaction (R8.AC4).
 *
 * By default, exported/persisted events contain NO prompt text, attachment
 * bytes, credentials, tool payloads, or raw provider content. Hosts may opt in
 * to richer capture explicitly.
 */
import type { WorkflowEventEnvelope, WorkflowEventV2 } from './events2';

export interface RedactionOptions {
    /** Include node output text (default: false). */
    includeOutputs?: boolean;
    /** Include streamed token text (default: false). */
    includeTokens?: boolean;
    /** Include tool call/result payloads (default: false). */
    includeToolPayloads?: boolean;
    /** Maximum length for any retained string field (default: 512). */
    maxStringLength?: number;
}

const DEFAULTS: Required<RedactionOptions> = {
    includeOutputs: false,
    includeTokens: false,
    includeToolPayloads: false,
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
                result: opts.includeToolPayloads
                    ? event.result
                        ? truncate(event.result, opts.maxStringLength)
                        : event.result
                    : REDACTED,
            };
        case 'node_error':
            // Preserve error type/name but bound the message.
            return {
                ...event,
                error: boundError(event.error, opts.maxStringLength),
            };
        default:
            return event;
    }
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
    return true;
}
