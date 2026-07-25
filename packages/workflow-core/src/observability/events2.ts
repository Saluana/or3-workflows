/**
 * WorkflowEvent v2 envelope and legacy projection (R8.AC1, R1.AC1).
 *
 * The v2 envelope adds stable run/sequence/path correlation around a richer
 * event union while remaining projectable back to the existing v1
 * {@link WorkflowEvent} discriminated union so current callbacks keep working.
 */
import type { WorkflowEvent } from '../events';
import type { HITLRequest } from '../hitl';
import type {
    ExecutionResult,
    NodeExecutionMetadata,
    TokenUsageDetails,
    ToolCallEventWithNode,
} from '../types';
import type { ModelUsage } from '../gateway/types';
import type {
    FinishReason,
    ModelIdentifiers,
    ModelTiming,
    ProviderAnnotation,
} from '../gateway/types';

/** New model/tool/durability events plus the existing lifecycle events (v2). */
export type WorkflowEventV2 =
    | { type: 'run_start'; workflowName?: string; sessionId?: string }
    | { type: 'node_start'; nodeId: string; meta?: NodeExecutionMetadata }
    | {
          type: 'node_finish';
          nodeId: string;
          output: string;
          meta?: NodeExecutionMetadata;
      }
    | { type: 'node_error'; nodeId: string; error: Error; meta?: NodeExecutionMetadata }
    | { type: 'token'; nodeId: string; token: string }
    | { type: 'reasoning'; nodeId: string; token: string }
    | { type: 'route_selected'; nodeId: string; routeId: string }
    | { type: 'token_usage'; nodeId: string; usage: TokenUsageDetails }
    | { type: 'tool_call'; event: ToolCallEventWithNode }
    | { type: 'tool_result'; event: ToolCallEventWithNode; result?: string }
    | {
          type: 'model_start';
          callId: string;
          nodeId: string;
          requestedModels: readonly string[];
          transport: 'chat' | 'responses';
      }
    | {
          type: 'model_finish';
          callId: string;
          nodeId: string;
          actualModel?: string;
          provider?: string;
          finishReason?: FinishReason;
          usage?: ModelUsage;
          identifiers?: ModelIdentifiers;
          timing?: ModelTiming;
          annotations?: ProviderAnnotation[];
      }
    | {
          type: 'model_error';
          callId: string;
          nodeId: string;
          requestedModels: readonly string[];
          transport: 'chat' | 'responses';
          error: Error;
      }
    | { type: 'retry'; nodeId: string; attempt: number; reason?: string }
    | {
          type: 'checkpoint';
          checkpointId: string;
          nodeId?: string;
          status?: string;
      }
    | {
          type: 'resume';
          checkpointId: string;
          nodeId?: string;
          status?: string;
      }
    | {
          type: 'tool_intent';
          callId: string;
          toolName: string;
          nodeId: string;
          status?: string;
          sideEffect?: string;
          idempotencyKey?: string;
      }
    | {
          type: 'tool_approval';
          callId: string;
          toolName: string;
          approved: boolean;
      }
    | {
          type: 'tool_receipt';
          callId: string;
          toolName: string;
          status: 'succeeded' | 'failed' | 'uncertain' | 'reused';
      }
    | { type: 'hitl_pause'; request: HITLRequest; checkpointId?: string; resumeToken: string }
    | { type: 'budget'; reason: string; tokensUsed?: number; stepsUsed?: number; durationMs?: number }
    | { type: 'done'; result: ExecutionResult };

export type WorkflowEventV2Type = WorkflowEventV2['type'];

/** Versioned envelope carrying correlation metadata around a v2 event. */
export interface WorkflowEventEnvelope<
    T extends WorkflowEventV2 = WorkflowEventV2,
> {
    schemaVersion: 2;
    workflowId?: string;
    workflowVersion?: string;
    runId: string;
    sequence: number;
    path: string[];
    event: T;
    at: number;
}

export type WorkflowEventV2Handler = (
    envelope: WorkflowEventEnvelope
) => void;

/** Monotonic per-run sequence generator for envelopes. */
export class RunSequencer {
    private next = 0;
    constructor(
        readonly runId: string,
        private readonly meta: {
            workflowId?: string;
            workflowVersion?: string;
        } = {}
    ) {}

    /** Wrap a v2 event in an envelope with the next sequence number. */
    envelope<T extends WorkflowEventV2>(
        event: T,
        options: { path?: string[]; at?: number } = {}
    ): WorkflowEventEnvelope<T> {
        return {
            schemaVersion: 2,
            workflowId: this.meta.workflowId,
            workflowVersion: this.meta.workflowVersion,
            runId: this.runId,
            sequence: this.next++,
            path: options.path ?? [],
            event,
            at: options.at ?? Date.now(),
        };
    }

    get sequence(): number {
        return this.next;
    }
}

/**
 * Project a v2 envelope to the legacy v1 {@link WorkflowEvent}, or `null` for
 * v2-only events that have no v1 equivalent. Existing callbacks stay unchanged.
 */
export function projectToLegacyEvent(
    envelope: WorkflowEventEnvelope
): WorkflowEvent | null {
    const { event, at } = envelope;
    switch (event.type) {
        case 'run_start':
            return {
                type: 'run_start',
                workflowName: event.workflowName,
                sessionId: event.sessionId,
                at,
            };
        case 'node_start':
            return { type: 'node_start', nodeId: event.nodeId, meta: event.meta, at };
        case 'node_finish':
            return {
                type: 'node_finish',
                nodeId: event.nodeId,
                output: event.output,
                meta: event.meta,
                at,
            };
        case 'node_error':
            return {
                type: 'node_error',
                nodeId: event.nodeId,
                error: event.error,
                meta: event.meta,
                at,
            };
        case 'token':
            return { type: 'token', nodeId: event.nodeId, token: event.token, at };
        case 'reasoning':
            return {
                type: 'reasoning',
                nodeId: event.nodeId,
                token: event.token,
                at,
            };
        case 'route_selected':
            return {
                type: 'route_selected',
                nodeId: event.nodeId,
                routeId: event.routeId,
                at,
            };
        case 'token_usage':
            return {
                type: 'token_usage',
                nodeId: event.nodeId,
                usage: event.usage,
                at,
            };
        case 'tool_call':
            return { type: 'tool_call', event: event.event, at };
        case 'tool_result':
            return {
                type: 'tool_result',
                event: event.event,
                result: event.result,
                at,
            };
        case 'hitl_pause':
            return {
                type: 'hitl_pause',
                request: event.request,
                checkpointId: event.checkpointId,
                resumeToken: event.resumeToken,
                at,
            };
        case 'budget':
            return {
                type: 'budget',
                reason: event.reason,
                tokensUsed: event.tokensUsed,
                stepsUsed: event.stepsUsed,
                durationMs: event.durationMs,
                at,
            };
        case 'done':
            return { type: 'done', result: event.result, at };
        // v2-only events have no v1 projection.
        case 'model_start':
        case 'model_finish':
        case 'model_error':
        case 'retry':
        case 'checkpoint':
        case 'resume':
        case 'tool_intent':
        case 'tool_approval':
        case 'tool_receipt':
            return null;
        default: {
            const _exhaustive: never = event;
            return _exhaustive;
        }
    }
}
