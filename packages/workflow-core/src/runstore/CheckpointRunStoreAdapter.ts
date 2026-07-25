/**
 * Bridge a v1 {@link CheckpointAdapter} into the {@link RunStore} snapshot API
 * (R7.AC2, R1.AC1).
 *
 * IMPORTANT LIMITATION: this bridge is NOT side-effect-safe durability. A v1
 * checkpoint captures a wave-boundary snapshot only; it has no ordered event
 * journal, no optimistic ownership, and no tool receipts. Two workers may both
 * advance a run, and an external side effect can be duplicated on restart.
 * Use a native `RunStore` implementation when exactly-once side effects matter.
 */
import type {
    CheckpointAdapter,
    WorkflowCheckpoint,
} from '../checkpoint';
import { createCheckpointId } from '../checkpoint';
import type {
    PersistedRunEvent,
    RunSnapshot,
    RunStore,
    ToolReceipt,
} from './types';
import { RUN_SCHEMA_VERSION } from './types';

function snapshotToCheckpoint(snapshot: RunSnapshot): WorkflowCheckpoint {
    return {
        schemaVersion: 1,
        id: snapshot.runId,
        workflowId: snapshot.workflowId,
        sessionId: snapshot.runId,
        createdAt: Date.now(),
        status:
            snapshot.status === 'completed'
                ? 'completed'
                : snapshot.status === 'failed' ||
                    snapshot.status === 'reconciliation_required'
                  ? 'failed'
                  : snapshot.status === 'paused'
                    ? 'paused'
                    : 'running',
        nodeOutputs: snapshot.nodeOutputs,
        executionOrder: snapshot.completedNodes,
        lastActiveNodeId:
            snapshot.completedNodes[snapshot.completedNodes.length - 1],
        sessionMessages: snapshot.transcript,
    };
}

function checkpointToSnapshot(
    cp: WorkflowCheckpoint,
    lastSequence: number
): RunSnapshot {
    return {
        runId: cp.id,
        sequence: lastSequence,
        version: RUN_SCHEMA_VERSION,
        status:
            cp.status === 'completed'
                ? 'completed'
                : cp.status === 'failed'
                  ? 'failed'
                  : cp.status === 'paused'
                    ? 'paused'
                    : 'running',
        workflowId: cp.workflowId,
        pendingNodes: [],
        scheduledNodes: [],
        completedNodes: [...cp.executionOrder],
        nodeOutputs: { ...cp.nodeOutputs },
        transcript: [...cp.sessionMessages],
        subflowPath: [],
        lastSequence,
    };
}

/**
 * Adapts a `CheckpointAdapter` to the `RunStore` surface. Events are held in
 * memory only (the v1 adapter has no journal); receipts are held in memory and
 * are lost on restart — hence the bridge cannot guarantee receipt reuse across
 * process boundaries.
 */
export class CheckpointRunStoreAdapter implements RunStore {
    private readonly nextSeq = new Map<string, number>();
    private readonly events = new Map<string, PersistedRunEvent[]>();
    private readonly receipts = new Map<string, ToolReceipt>();

    constructor(private readonly checkpoints: CheckpointAdapter) {}

    async append(
        event: Omit<PersistedRunEvent, 'sequence'>,
        expectedSequence: number
    ): Promise<number> {
        const current = this.nextSeq.get(event.runId) ?? 0;
        if (expectedSequence !== current) {
            // Best-effort ownership only; not a durability guarantee.
            throw new Error(
                `CheckpointRunStoreAdapter: stale writer for "${event.runId}" (expected ${expectedSequence}, at ${current})`
            );
        }
        const list = this.events.get(event.runId) ?? [];
        list.push({ ...event, sequence: current });
        this.events.set(event.runId, list);
        this.nextSeq.set(event.runId, current + 1);
        return current;
    }

    async saveSnapshot(
        snapshot: RunSnapshot,
        expectedSequence: number
    ): Promise<void> {
        const current = this.nextSeq.get(snapshot.runId) ?? 0;
        if (expectedSequence !== current) {
            throw new Error(
                `CheckpointRunStoreAdapter: stale snapshot writer for "${snapshot.runId}"`
            );
        }
        await this.checkpoints.save(snapshotToCheckpoint(snapshot));
    }

    async load(
        runId: string
    ): Promise<{ snapshot?: RunSnapshot; events: PersistedRunEvent[] }> {
        const cp = await this.checkpoints.load(runId);
        const events = this.events.get(runId) ?? [];
        return {
            snapshot: cp
                ? checkpointToSnapshot(cp, this.nextSeq.get(runId) ?? 0)
                : undefined,
            events,
        };
    }

    async currentSequence(runId: string): Promise<number> {
        return this.nextSeq.get(runId) ?? 0;
    }

    async getToolReceipt(
        runId: string,
        callId: string
    ): Promise<ToolReceipt | null> {
        return this.receipts.get(`${runId}:${callId}`) ?? null;
    }

    async putToolReceipt(receipt: ToolReceipt): Promise<void> {
        this.receipts.set(`${receipt.runId}:${receipt.callId}`, receipt);
    }
}

/** Create a fresh run id compatible with checkpoint ids. */
export function createRunId(): string {
    return createCheckpointId().replace(/^cp_/, 'run_');
}
