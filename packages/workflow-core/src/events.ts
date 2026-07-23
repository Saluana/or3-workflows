/**
 * Typed workflow execution event stream.
 * Prefer `onEvent` over the many ad-hoc ExecutionCallbacks when building UIs/telemetry.
 *
 * @module events
 */

import type { HITLRequest } from './hitl';
import type {
    ExecutionResult,
    NodeExecutionMetadata,
    TokenUsageDetails,
    ToolCallEventWithNode,
} from './types';

/** Discriminated union of all execution lifecycle events. */
export type WorkflowEvent =
    | {
          type: 'run_start';
          workflowName?: string;
          sessionId?: string;
          at: number;
      }
    | {
          type: 'node_start';
          nodeId: string;
          meta?: NodeExecutionMetadata;
          at: number;
      }
    | {
          type: 'node_finish';
          nodeId: string;
          output: string;
          meta?: NodeExecutionMetadata;
          at: number;
      }
    | {
          type: 'node_error';
          nodeId: string;
          error: Error;
          meta?: NodeExecutionMetadata;
          at: number;
      }
    | {
          type: 'token';
          nodeId: string;
          token: string;
          at: number;
      }
    | {
          type: 'reasoning';
          nodeId: string;
          token: string;
          at: number;
      }
    | {
          type: 'tool_call';
          event: ToolCallEventWithNode;
          at: number;
      }
    | {
          type: 'tool_result';
          event: ToolCallEventWithNode;
          result?: string;
          at: number;
      }
    | {
          type: 'hitl_pause';
          request: HITLRequest;
          checkpointId?: string;
          resumeToken: string;
          at: number;
      }
    | {
          type: 'budget';
          reason: string;
          tokensUsed?: number;
          stepsUsed?: number;
          durationMs?: number;
          at: number;
      }
    | {
          type: 'token_usage';
          nodeId: string;
          usage: TokenUsageDetails;
          at: number;
      }
    | {
          type: 'route_selected';
          nodeId: string;
          routeId: string;
          at: number;
      }
    | {
          type: 'done';
          result: ExecutionResult;
          at: number;
      };

export type WorkflowEventType = WorkflowEvent['type'];

export type WorkflowEventHandler = (event: WorkflowEvent) => void;

/** Emit helper that never throws into the execution path. */
export function safeEmitEvent(
    handler: WorkflowEventHandler | undefined,
    event: WorkflowEvent
): void {
    if (!handler) return;
    try {
        handler(event);
    } catch (err) {
        console.error('[or3] onEvent handler threw:', err);
    }
}
