/**
 * In-memory reference {@link RunStore} (R7.AC1, R7.AC2, R7.AC5).
 *
 * Rejects stale writers via optimistic sequence checks and can reconstruct a
 * run from its latest snapshot plus subsequent events. Not durable across
 * process restarts — production hosts implement `RunStore` over a real store.
 */
import type {
    PersistedRunEvent,
    RunSnapshot,
    RunStore,
    ToolReceipt,
} from './types';
import { ConcurrentRunWriterError, RUN_SCHEMA_VERSION } from './types';

interface RunState {
    events: PersistedRunEvent[];
    snapshot?: RunSnapshot;
    nextSequence: number;
    receipts: Map<string, ToolReceipt>;
}

export class InMemoryRunStore implements RunStore {
    private readonly runs = new Map<string, RunState>();

    private getOrCreate(runId: string): RunState {
        let state = this.runs.get(runId);
        if (!state) {
            state = {
                events: [],
                nextSequence: 0,
                receipts: new Map(),
            };
            this.runs.set(runId, state);
        }
        return state;
    }

    async append(
        event: Omit<PersistedRunEvent, 'sequence'>,
        expectedSequence: number
    ): Promise<number> {
        const state = this.getOrCreate(event.runId);
        if (expectedSequence !== state.nextSequence) {
            throw new ConcurrentRunWriterError(
                event.runId,
                expectedSequence,
                state.nextSequence
            );
        }
        const sequence = state.nextSequence;
        state.events.push({
            ...event,
            sequence,
            version: event.version ?? RUN_SCHEMA_VERSION,
        });
        state.nextSequence = sequence + 1;
        return sequence;
    }

    async saveSnapshot(
        snapshot: RunSnapshot,
        expectedSequence: number
    ): Promise<void> {
        const state = this.getOrCreate(snapshot.runId);
        if (expectedSequence !== state.nextSequence) {
            throw new ConcurrentRunWriterError(
                snapshot.runId,
                expectedSequence,
                state.nextSequence
            );
        }
        state.snapshot = { ...snapshot };
    }

    async load(
        runId: string
    ): Promise<{ snapshot?: RunSnapshot; events: PersistedRunEvent[] }> {
        const state = this.runs.get(runId);
        if (!state) return { events: [] };
        // Only return events after the snapshot boundary for replay.
        const from = state.snapshot?.lastSequence ?? -1;
        const events = state.events.filter((e) => e.sequence > from);
        return {
            snapshot: state.snapshot ? { ...state.snapshot } : undefined,
            events,
        };
    }

    async currentSequence(runId: string): Promise<number> {
        return this.runs.get(runId)?.nextSequence ?? 0;
    }

    async getToolReceipt(
        runId: string,
        callId: string
    ): Promise<ToolReceipt | null> {
        return this.runs.get(runId)?.receipts.get(callId) ?? null;
    }

    async putToolReceipt(receipt: ToolReceipt): Promise<void> {
        this.getOrCreate(receipt.runId).receipts.set(receipt.callId, receipt);
    }

    /** All persisted events for a run (test/inspection helper). */
    allEvents(runId: string): PersistedRunEvent[] {
        return [...(this.runs.get(runId)?.events ?? [])];
    }
}
