import { ref, readonly, type Ref, type DeepReadonly } from 'vue';

export interface ExecutionState {
    isRunning: boolean;
    streamingContent: string;
    nodeStatuses: Record<string, 'idle' | 'active' | 'completed' | 'error'>;
    currentNodeId: string | null;
    error: Error | null;
}

export interface UseExecutionStateReturn {
    state: DeepReadonly<Ref<ExecutionState>>;
    setRunning: (isRunning: boolean) => void;
    setStreamingContent: (content: string) => void;
    appendStreamingContent: (content: string) => void;
    setNodeStatus: (
        nodeId: string,
        status: 'idle' | 'active' | 'completed' | 'error'
    ) => void;
    setCurrentNodeId: (nodeId: string | null) => void;
    setError: (error: Error | null) => void;
    reset: () => void;
}

/**
 * Factory function to create execution state.
 * Each call creates a new isolated state instance.
 *
 * @example
 * ```ts
 * // Create isolated state for a workflow instance
 * const { state, setRunning, reset } = createExecutionState();
 * ```
 */
export function createExecutionState(): UseExecutionStateReturn {
    const state = ref<ExecutionState>({
        isRunning: false,
        streamingContent: '',
        nodeStatuses: {},
        currentNodeId: null,
        error: null,
    });

    const setRunning = (isRunning: boolean) => {
        state.value.isRunning = isRunning;
    };

    const setStreamingContent = (content: string) => {
        state.value.streamingContent = content;
    };

    const appendStreamingContent = (content: string) => {
        state.value.streamingContent += content;
    };

    const setNodeStatus = (
        nodeId: string,
        status: 'idle' | 'active' | 'completed' | 'error'
    ) => {
        state.value.nodeStatuses[nodeId] = status;
    };

    const setCurrentNodeId = (nodeId: string | null) => {
        state.value.currentNodeId = nodeId;
    };

    const setError = (error: Error | null) => {
        state.value.error = error;
    };

    const reset = () => {
        state.value = {
            isRunning: false,
            streamingContent: '',
            nodeStatuses: {},
            currentNodeId: null,
            error: null,
        };
    };

    return {
        state: readonly(state),
        setRunning,
        setStreamingContent,
        appendStreamingContent,
        setNodeStatus,
        setCurrentNodeId,
        setError,
        reset,
    };
}

/**
 * Create execution state for a workflow instance.
 * Each call returns a new isolated state instance to avoid shared state bugs.
 *
 * Note: This function previously returned a shared singleton instance which caused
 * bugs when multiple workflow instances were used. It now creates fresh state
 * each call for backward compatibility while fixing the shared state issue.
 *
 * @deprecated Use `createExecutionState()` directly for clearer intent.
 *
 * @example
 * ```ts
 * // Each call gets independent state
 * const state1 = useExecutionState();
 * const state2 = useExecutionState();
 * // state1 and state2 are independent
 * ```
 */
export function useExecutionState(): UseExecutionStateReturn {
    // Fixed: Now returns fresh state each call instead of shared singleton
    return createExecutionState();
}
