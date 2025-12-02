import { describe, it, expect } from 'vitest';
import { useExecutionState, createExecutionState } from '../useExecutionState';

describe('useExecutionState', () => {
    describe('createExecutionState', () => {
        it('should create isolated state instances', () => {
            const state1 = createExecutionState();
            const state2 = createExecutionState();

            // Verify they are different instances
            expect(state1).not.toBe(state2);
            expect(state1.state).not.toBe(state2.state);
        });

        it('should initialize with default values', () => {
            const { state } = createExecutionState();

            expect(state.value.isRunning).toBe(false);
            expect(state.value.streamingContent).toBe('');
            expect(state.value.nodeStatuses).toEqual({});
            expect(state.value.currentNodeId).toBe(null);
            expect(state.value.error).toBe(null);
        });

        it('should update state independently between instances', () => {
            const state1 = createExecutionState();
            const state2 = createExecutionState();

            // Modify state1
            state1.setRunning(true);
            state1.setStreamingContent('content1');
            state1.setNodeStatus('node-1', 'active');

            // Verify state2 is unaffected
            expect(state2.state.value.isRunning).toBe(false);
            expect(state2.state.value.streamingContent).toBe('');
            expect(state2.state.value.nodeStatuses).toEqual({});
        });

        it('should append streaming content', () => {
            const { state, appendStreamingContent } = createExecutionState();

            appendStreamingContent('Hello');
            appendStreamingContent(' World');

            expect(state.value.streamingContent).toBe('Hello World');
        });

        it('should reset state to defaults', () => {
            const {
                state,
                setRunning,
                setStreamingContent,
                setNodeStatus,
                setError,
                reset,
            } = createExecutionState();

            // Set some state
            setRunning(true);
            setStreamingContent('content');
            setNodeStatus('node-1', 'completed');
            setError(new Error('test'));

            // Reset
            reset();

            // Verify defaults
            expect(state.value.isRunning).toBe(false);
            expect(state.value.streamingContent).toBe('');
            expect(state.value.nodeStatuses).toEqual({});
            expect(state.value.currentNodeId).toBe(null);
            expect(state.value.error).toBe(null);
        });
    });

    describe('useExecutionState (deprecated)', () => {
        it('should return independent state instances (fixed shared state bug)', () => {
            // This test verifies the fix for the shared state bug
            // Previously, useExecutionState() returned the same singleton instance
            // Now it returns fresh state each call
            const state1 = useExecutionState();
            const state2 = useExecutionState();

            // Verify they are different instances
            expect(state1).not.toBe(state2);
            expect(state1.state).not.toBe(state2.state);
        });

        it('should not share state between calls', () => {
            const state1 = useExecutionState();
            const state2 = useExecutionState();

            // Modify state1
            state1.setRunning(true);
            state1.setCurrentNodeId('node-1');

            // Verify state2 is unaffected (this would fail with the old shared singleton)
            expect(state2.state.value.isRunning).toBe(false);
            expect(state2.state.value.currentNodeId).toBe(null);
        });
    });
});
