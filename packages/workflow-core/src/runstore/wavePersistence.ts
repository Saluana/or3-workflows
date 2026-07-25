/**
 * Wave-boundary snapshot helpers for durable run resume (R7.AC1, R7.AC2).
 *
 * Snapshots capture pending/scheduled/completed nodes, string outputs, typed
 * values, transcript, and nested subflow path so a process restart can resume
 * the DAG wave deterministically.
 */
import type { ChatMessage } from '../types';
import type { JsonValue } from '../gateway/types';
import type {
    ReconciliationState,
    RunSnapshot,
    RunStatus,
    RunStore,
} from './types';
import { RUN_SCHEMA_VERSION } from './types';
import type { ResumeFromOptions } from '../types/execution';

export interface WaveBoundaryState {
    runId: string;
    status?: RunStatus;
    workflowId?: string;
    workflowHash?: string;
    workflowVersion?: string;
    /** Nodes still queued for later waves. */
    pendingNodes: string[];
    /** Nodes that ran in the wave that just completed (empty after persist). */
    scheduledNodes?: string[];
    completedNodes: string[];
    nodeOutputs: Record<string, string>;
    nodeValues?: Record<string, JsonValue>;
    transcript: ChatMessage[];
    subflowPath?: string[];
    reconciliation?: ReconciliationState;
}

/** Build a RunSnapshot for the current wave boundary. */
export function buildWaveSnapshot(
    state: WaveBoundaryState,
    sequence: number
): RunSnapshot {
    return {
        runId: state.runId,
        sequence,
        version: RUN_SCHEMA_VERSION,
        status: state.status ?? 'running',
        workflowId: state.workflowId,
        workflowHash: state.workflowHash,
        workflowVersion: state.workflowVersion,
        pendingNodes: [...state.pendingNodes],
        scheduledNodes: [...(state.scheduledNodes ?? [])],
        completedNodes: [...state.completedNodes],
        nodeOutputs: { ...state.nodeOutputs },
        ...(state.nodeValues ? { nodeValues: { ...state.nodeValues } } : {}),
        transcript: [...state.transcript],
        subflowPath: [...(state.subflowPath ?? [])],
        lastSequence: sequence,
        reconciliation: state.reconciliation,
    };
}

/**
 * Persist a wave-boundary snapshot. Appends a `wave_boundary` event then
 * saves the snapshot at the next sequence position.
 */
export async function persistWaveBoundary(
    store: RunStore,
    state: WaveBoundaryState
): Promise<RunSnapshot> {
    const expected = await store.currentSequence(state.runId);
    const sequence = await store.append(
        {
            runId: state.runId,
            version: RUN_SCHEMA_VERSION,
            type:
                !state.status || state.status === 'running'
                    ? 'wave_boundary'
                    : `run_${state.status}`,
            path: state.subflowPath,
            at: Date.now(),
            payload: {
                status: state.status ?? 'running',
                completedCount: state.completedNodes.length,
                pendingCount: state.pendingNodes.length,
            },
        },
        expected
    );
    const snapshot = buildWaveSnapshot(state, sequence);
    // Snapshot is stored at the post-append next-sequence without consuming it.
    await store.saveSnapshot(snapshot, sequence + 1);
    return snapshot;
}

/** Convert a durable snapshot into resume-from options for the executor. */
export function snapshotToResumeFrom(snapshot: RunSnapshot): ResumeFromOptions {
    const last =
        snapshot.completedNodes[snapshot.completedNodes.length - 1] ??
        snapshot.pendingNodes[0];
    const pending = [...snapshot.pendingNodes];
    return {
        startNodeId: pending[0] ?? '',
        nodeOutputs: { ...snapshot.nodeOutputs },
        nodeValues: snapshot.nodeValues
            ? { ...snapshot.nodeValues }
            : undefined,
        executionOrder: [...snapshot.completedNodes],
        lastActiveNodeId: last,
        sessionMessages: [...snapshot.transcript],
        resumeInput: last ? snapshot.nodeOutputs[last] : undefined,
        pendingNodes: pending,
        subflowPath: [...snapshot.subflowPath],
    };
}

/**
 * Load the latest durable snapshot for a run, if any.
 * Returns null when the store has no snapshot yet.
 */
export async function loadResumeSnapshot(
    store: RunStore,
    runId: string
): Promise<RunSnapshot | null> {
    const loaded = await store.load(runId);
    return loaded.snapshot ?? null;
}
