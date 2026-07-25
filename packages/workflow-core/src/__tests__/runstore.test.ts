import { describe, it, expect } from 'vitest';
import {
    InMemoryRunStore,
    ConcurrentRunWriterError,
    CheckpointRunStoreAdapter,
    createRunId,
    forkRun,
    planRetryNode,
    snapshotToResumeFrom,
    type RunSnapshot,
    type ToolReceipt,
} from '../runstore';
import { InMemoryCheckpointAdapter } from '../checkpoint';

function snapshot(runId: string, seq: number): RunSnapshot {
    return {
        runId,
        sequence: seq,
        version: 1,
        status: 'running',
        pendingNodes: ['n2'],
        scheduledNodes: [],
        completedNodes: ['n1'],
        nodeOutputs: { n1: 'hello' },
        transcript: [],
        subflowPath: [],
        lastSequence: seq,
    };
}

describe('InMemoryRunStore (R7.AC1, R7.AC5)', () => {
    it('assigns monotonic sequences on append', async () => {
        const store = new InMemoryRunStore();
        const s0 = await store.append(
            { runId: 'r', version: 1, type: 'run_start', at: 1 },
            0
        );
        const s1 = await store.append(
            { runId: 'r', version: 1, type: 'node_start', at: 2 },
            1
        );
        expect(s0).toBe(0);
        expect(s1).toBe(1);
        expect(await store.currentSequence('r')).toBe(2);
    });

    it('rejects stale writers via optimistic sequence', async () => {
        const store = new InMemoryRunStore();
        await store.append({ runId: 'r', version: 1, type: 'a', at: 1 }, 0);
        await expect(
            store.append({ runId: 'r', version: 1, type: 'b', at: 2 }, 0)
        ).rejects.toBeInstanceOf(ConcurrentRunWriterError);
    });

    it('reconstructs a run from snapshot plus later events', async () => {
        const store = new InMemoryRunStore();
        await store.append({ runId: 'r', version: 1, type: 'a', at: 1 }, 0);
        await store.saveSnapshot(snapshot('r', 0), 1);
        await store.append({ runId: 'r', version: 1, type: 'b', at: 2 }, 1);
        const loaded = await store.load('r');
        expect(loaded.snapshot?.completedNodes).toEqual(['n1']);
        // Only events after the snapshot boundary are replayed.
        expect(loaded.events.map((e) => e.type)).toEqual(['b']);
    });

    it('stores and reuses tool receipts', async () => {
        const store = new InMemoryRunStore();
        const receipt: ToolReceipt = {
            runId: 'r',
            callId: 'c1',
            toolName: 't',
            authority: 'host-client',
            status: 'succeeded',
            result: 'ok',
            at: 1,
        };
        await store.putToolReceipt(receipt);
        expect(await store.getToolReceipt('r', 'c1')).toEqual(receipt);
        expect(await store.getToolReceipt('r', 'missing')).toBeNull();
    });
});

describe('CheckpointRunStoreAdapter bridge (R7.AC2)', () => {
    it('bridges snapshots to a checkpoint adapter', async () => {
        const cp = new InMemoryCheckpointAdapter();
        const store = new CheckpointRunStoreAdapter(cp);
        await store.saveSnapshot(snapshot('run_1', 0), 0);
        const loaded = await store.load('run_1');
        expect(loaded.snapshot?.nodeOutputs).toEqual({ n1: 'hello' });
    });
});

describe('time travel (R7.AC6)', () => {
    it('reports reused receipts and stays safe for non-destructive replay', () => {
        const plan = planRetryNode({
            snapshot: snapshot('r', 0),
            nodeId: 'n1',
            receipts: [
                {
                    runId: 'r',
                    callId: 'c1',
                    toolName: 't',
                    authority: 'host-client',
                    status: 'succeeded',
                    at: 1,
                },
            ],
        });
        expect(plan.reusedReceipts).toHaveLength(1);
        expect(plan.safe).toBe(true);
    });

    it('requires authorization for destructive replay', () => {
        const destructive = {
            runId: 'r',
            callId: 'c1',
            toolName: 'delete',
            authority: 'host-server' as const,
            sideEffect: 'destructive' as const,
            status: 'succeeded' as const,
            at: 1,
        };
        const blocked = planRetryNode({
            snapshot: snapshot('r', 0),
            nodeId: 'n1',
            receipts: [destructive as ToolReceipt],
        });
        expect(blocked.safe).toBe(false);
        const authorized = planRetryNode({
            snapshot: snapshot('r', 0),
            nodeId: 'n1',
            receipts: [destructive as ToolReceipt],
            authorizeDestructiveReplay: true,
        });
        expect(authorized.safe).toBe(true);
    });

    it('forks a run into a new id', async () => {
        const store = new InMemoryRunStore();
        await store.saveSnapshot(snapshot('r', 0), 0);
        const newId = createRunId();
        const { forked, snapshot: forkedSnap } = await forkRun(store, 'r', newId);
        expect(forked).toBe(true);
        expect(forkedSnap?.runId).toBe(newId);
    });
});

describe('snapshot resume projection', () => {
    it('restores typed values without re-queueing a completed node', () => {
        const completed: RunSnapshot = {
            ...snapshot('done', 2),
            status: 'completed',
            pendingNodes: [],
            nodeValues: { n1: { answer: 42 } },
        };
        const resume = snapshotToResumeFrom(completed);
        expect(resume.pendingNodes).toEqual([]);
        expect(resume.startNodeId).toBe('');
        expect(resume.nodeValues).toEqual({ n1: { answer: 42 } });
    });
});
