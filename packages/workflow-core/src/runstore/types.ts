/**
 * Durable run journal types (R7).
 *
 * A {@link RunStore} combines an append-only, ordered run-event journal,
 * queryable snapshots, and side-effect receipts. It is distinct from the
 * long-term {@link MemoryAdapter} and richer than a `CheckpointAdapter` because
 * it adds ordered events, optimistic ownership, and receipts (design decision
 * 6).
 */
import type { ChatMessage } from '../types';
import type { JsonValue } from '../gateway/types';
import type { ToolIntent, ToolReceipt } from '../tools/types';

export type { ToolIntent, ToolReceipt } from '../tools/types';

/** Current persisted-run schema version. */
export const RUN_SCHEMA_VERSION = 2;

/** Lifecycle status of a run. */
export type RunStatus =
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'reconciliation_required';

/** A single append-only, ordered run event. */
export interface PersistedRunEvent {
    runId: string;
    /** Monotonic per-run sequence number (0-based). */
    sequence: number;
    /** Event schema version. */
    version: number;
    type: string;
    nodeId?: string;
    /** Nested subflow path for scoping. */
    path?: string[];
    attempt?: number;
    at: number;
    /** Bounded, redaction-safe payload (no prompts/credentials by default). */
    payload?: Record<string, unknown>;
}

/** A resumable snapshot captured at a safe wave boundary. */
export interface RunSnapshot {
    runId: string;
    /** Sequence this snapshot was taken at. */
    sequence: number;
    version: number;
    status: RunStatus;
    workflowId?: string;
    workflowHash?: string;
    workflowVersion?: string;
    /** Nodes queued but not yet scheduled. */
    pendingNodes: string[];
    /** Nodes scheduled in the current wave. */
    scheduledNodes: string[];
    /** Nodes that have completed. */
    completedNodes: string[];
    nodeOutputs: Record<string, string>;
    /** Typed values for typed downstream edges (R4). */
    nodeValues?: Record<string, JsonValue>;
    transcript: ChatMessage[];
    /** Nested subflow path at snapshot time. */
    subflowPath: string[];
    /** Last durable sequence captured. */
    lastSequence: number;
    reconciliation?: ReconciliationState;
}

/** Reconciliation state after an uncertain side effect. */
export interface ReconciliationState {
    reason: string;
    callId: string;
    toolName: string;
    at: number;
    nodeId?: string;
    sideEffect?: import('../tools').ToolSideEffect;
    idempotencyKey?: string;
}

/** Top-level run record used for listing / authorization. */
export interface RunRecord {
    runId: string;
    workflowId?: string;
    workflowHash?: string;
    workflowVersion?: string;
    status: RunStatus;
    ownerScope?: string;
    createdAt: number;
    updatedAt: number;
    lastSequence: number;
}

/**
 * Durable run journal. Implementations use optimistic sequence checks so two
 * workers cannot advance the same run concurrently (R7.AC5).
 */
export interface RunStore {
    /**
     * Append an event. `expectedSequence` must equal the store's current next
     * sequence for the run; a stale value throws {@link ConcurrentRunWriterError}.
     * Returns the newly assigned sequence.
     */
    append(
        event: Omit<PersistedRunEvent, 'sequence'>,
        expectedSequence: number
    ): Promise<number>;
    /** Persist a snapshot; rejects stale writers via `expectedSequence`. */
    saveSnapshot(snapshot: RunSnapshot, expectedSequence: number): Promise<void>;
    /** Load the latest snapshot plus all events for a run. */
    load(
        runId: string
    ): Promise<{ snapshot?: RunSnapshot; events: PersistedRunEvent[] }>;
    /** Current next-sequence for a run (0 when unknown). */
    currentSequence(runId: string): Promise<number>;
    /** Look up a tool receipt for idempotent replay. */
    getToolReceipt(runId: string, callId: string): Promise<ToolReceipt | null>;
    /** Look up a receipt by a host-derived idempotency key. */
    getToolReceiptByIdempotencyKey?(
        runId: string,
        idempotencyKey: string
    ): Promise<ToolReceipt | null>;
    /** Enumerate receipts when forking or inspecting a run. */
    listToolReceipts?(runId: string): Promise<ToolReceipt[]>;
    /** Persist a tool receipt. */
    putToolReceipt(receipt: ToolReceipt): Promise<void>;
    /** Look up the durable pre-execution intent for a call. */
    getToolIntent(runId: string, callId: string): Promise<ToolIntent | null>;
    /** Enumerate intents for inspection/fork/reconciliation. */
    listToolIntents?(runId: string): Promise<ToolIntent[]>;
    /** Persist or transition a tool intent before/after external execution. */
    putToolIntent(intent: ToolIntent): Promise<void>;
}

/** Thrown when a writer presents a stale `expectedSequence`. */
export class ConcurrentRunWriterError extends Error {
    readonly runId: string;
    readonly expected: number;
    readonly actual: number;
    constructor(runId: string, expected: number, actual: number) {
        super(
            `Stale run writer for "${runId}": expected sequence ${expected} but store is at ${actual}`
        );
        this.name = 'ConcurrentRunWriterError';
        this.runId = runId;
        this.expected = expected;
        this.actual = actual;
    }
}
