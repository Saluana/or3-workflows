/**
 * Workflow checkpointing for durable execution and HITL suspend/resume.
 *
 * @module checkpoint
 */

import type { ChatMessage, ResumeFromOptions } from './types';
import type { HITLMode, HITLRequest, HITLResponse } from './hitl';

/**
 * Persisted snapshot of workflow execution state.
 * Enough to resume after process restart when paired with a HITL response.
 */
export interface WorkflowCheckpoint {
    /** Unique checkpoint ID */
    id: string;
    /** Optional workflow name / id for filtering */
    workflowId?: string;
    /** Execution session id */
    sessionId: string;
    /** Unix ms timestamp */
    createdAt: number;
    /** Checkpoint lifecycle status */
    status: 'running' | 'paused' | 'completed' | 'failed';
    /** Per-node outputs collected so far */
    nodeOutputs: Record<string, string>;
    /** Nodes that have finished, in order */
    executionOrder: string[];
    /** Last node that produced output */
    lastActiveNodeId?: string;
    /** Conversation messages for resume */
    sessionMessages: ChatMessage[];
    /** Suggested current input when resuming */
    resumeInput?: string;
    /** Node to restart from on resume */
    startNodeId?: string;
    /** Why execution paused */
    pauseReason?: 'hitl' | 'manual';
    /** Pending HITL request id (when pauseReason === 'hitl') */
    pendingHITLRequestId?: string;
    /** HITL mode at pause */
    hitlMode?: HITLMode;
    /** Node awaiting HITL */
    hitlNodeId?: string;
}

/**
 * Storage backend for workflow checkpoints.
 * Implement with Redis/Postgres/etc. for production durability.
 */
export interface CheckpointAdapter {
    /** Persist a checkpoint (upsert by id). */
    save(checkpoint: WorkflowCheckpoint): Promise<void>;
    /** Load a checkpoint by id. */
    load(checkpointId: string): Promise<WorkflowCheckpoint | null>;
    /** Delete a checkpoint. */
    delete(checkpointId: string): Promise<void>;
    /** List checkpoints, optionally filtered by session/workflow. */
    list?(filters?: {
        sessionId?: string;
        workflowId?: string;
        status?: WorkflowCheckpoint['status'];
    }): Promise<WorkflowCheckpoint[]>;
}

/**
 * In-memory checkpoint store — useful for tests and single-process demos.
 * NOT durable across restarts.
 */
export class InMemoryCheckpointAdapter implements CheckpointAdapter {
    private checkpoints = new Map<string, WorkflowCheckpoint>();

    async save(checkpoint: WorkflowCheckpoint): Promise<void> {
        this.checkpoints.set(checkpoint.id, { ...checkpoint });
    }

    async load(checkpointId: string): Promise<WorkflowCheckpoint | null> {
        const cp = this.checkpoints.get(checkpointId);
        return cp ? { ...cp } : null;
    }

    async delete(checkpointId: string): Promise<void> {
        this.checkpoints.delete(checkpointId);
    }

    async list(filters?: {
        sessionId?: string;
        workflowId?: string;
        status?: WorkflowCheckpoint['status'];
    }): Promise<WorkflowCheckpoint[]> {
        const all = Array.from(this.checkpoints.values());
        return all.filter((cp) => {
            if (filters?.sessionId && cp.sessionId !== filters.sessionId) {
                return false;
            }
            if (filters?.workflowId && cp.workflowId !== filters.workflowId) {
                return false;
            }
            if (filters?.status && cp.status !== filters.status) {
                return false;
            }
            return true;
        });
    }
}

/**
 * Convert a checkpoint (+ optional HITL response) into ResumeFromOptions.
 */
export function checkpointToResumeFrom(
    checkpoint: WorkflowCheckpoint,
    hitlResponse?: HITLResponse
): ResumeFromOptions {
    return {
        startNodeId:
            checkpoint.startNodeId ||
            checkpoint.hitlNodeId ||
            checkpoint.lastActiveNodeId ||
            '',
        nodeOutputs: { ...checkpoint.nodeOutputs },
        executionOrder: [...checkpoint.executionOrder],
        lastActiveNodeId: checkpoint.lastActiveNodeId,
        sessionMessages: [...checkpoint.sessionMessages],
        resumeInput: checkpoint.resumeInput,
        pendingHITLRequestId: checkpoint.pendingHITLRequestId,
        pendingHITLResponse: hitlResponse,
    };
}

/**
 * Error thrown when durable HITL pauses execution.
 * Caught by the execution adapter and converted into a paused ExecutionResult.
 */
export class WorkflowPausedError extends Error {
    readonly name = 'WorkflowPausedError';

    constructor(
        public readonly checkpoint: WorkflowCheckpoint,
        public readonly hitlRequest: HITLRequest
    ) {
        super(
            `Workflow paused for HITL on node "${hitlRequest.nodeId}" (request ${hitlRequest.id})`
        );
    }
}

export function isWorkflowPausedError(
    error: unknown
): error is WorkflowPausedError {
    return error instanceof WorkflowPausedError;
}

/** Create a new checkpoint id. */
export function createCheckpointId(): string {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return `cp_${crypto.randomUUID()}`;
    }
    return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
