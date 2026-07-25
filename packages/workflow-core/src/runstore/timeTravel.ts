/**
 * Retry-one-node and checkpoint fork semantics (R7.AC6).
 *
 * Time travel reuses receipts by default and never silently replays destructive
 * operations. `planRetryNode` produces a resume plan and surfaces which
 * receipt-backed tool calls would be reused; destructive replay requires
 * explicit authorization.
 */
import type { RunSnapshot, RunStore, ToolReceipt } from './types';

export interface RetryNodePlan {
    runId: string;
    nodeId: string;
    /** Receipts that will be reused rather than re-executed. */
    reusedReceipts: ToolReceipt[];
    /** Destructive receipts that require explicit authorization to replay. */
    destructiveReplays: ToolReceipt[];
    /** True when the plan can proceed without further authorization. */
    safe: boolean;
    snapshot: RunSnapshot;
}

/**
 * Build a retry plan for a single node. Callers must pass the receipts they
 * intend to touch (usually collected from the run's tool_receipt records).
 */
export function planRetryNode(params: {
    snapshot: RunSnapshot;
    nodeId: string;
    receipts: ToolReceipt[];
    /** Explicitly authorize replaying destructive receipts. */
    authorizeDestructiveReplay?: boolean;
}): RetryNodePlan {
    const reused = params.receipts.filter(
        (r) => r.status === 'succeeded'
    );
    const destructive = reused.filter(
        (r) => r.authority !== 'provider-server' && isDestructive(r)
    );
    const safe =
        destructive.length === 0 || params.authorizeDestructiveReplay === true;
    return {
        runId: params.snapshot.runId,
        nodeId: params.nodeId,
        reusedReceipts: reused,
        destructiveReplays: destructive,
        safe,
        snapshot: params.snapshot,
    };
}

// A receipt does not carry side-effect classification directly; hosts that need
// destructive-aware replay should tag receipts. We conservatively treat any
// receipt whose tool name is flagged by the caller as destructive; by default
// nothing is destructive so retries are non-blocking unless annotated.
function isDestructive(receipt: ToolReceipt): boolean {
    return receipt.sideEffect === 'destructive';
}

/**
 * Fork a run at its current snapshot into a new run id, copying the snapshot and
 * all receipts so the original run is untouched (R7.AC6).
 */
export async function forkRun(
    store: RunStore,
    sourceRunId: string,
    newRunId: string
): Promise<{ forked: boolean; snapshot?: RunSnapshot }> {
    const { snapshot } = await store.load(sourceRunId);
    if (!snapshot) return { forked: false };
    const forkedSnapshot: RunSnapshot = {
        ...snapshot,
        runId: newRunId,
        sequence: 0,
        lastSequence: 0,
    };
    await store.saveSnapshot(forkedSnapshot, 0);
    if (store.listToolReceipts) {
        const receipts = await store.listToolReceipts(sourceRunId);
        for (const receipt of receipts) {
            await store.putToolReceipt({
                ...receipt,
                runId: newRunId,
            });
        }
    }
    if (store.listToolIntents) {
        const intents = await store.listToolIntents(sourceRunId);
        for (const intent of intents) {
            await store.putToolIntent({
                ...intent,
                runId: newRunId,
            });
        }
    }
    return { forked: true, snapshot: forkedSnapshot };
}
