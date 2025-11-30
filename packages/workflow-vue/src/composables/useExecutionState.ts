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
  setNodeStatus: (nodeId: string, status: 'idle' | 'active' | 'completed' | 'error') => void;
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

  const setNodeStatus = (nodeId: string, status: 'idle' | 'active' | 'completed' | 'error') => {
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

// Default shared instance for backward compatibility
let defaultInstance: UseExecutionStateReturn | null = null;

/**
 * Get or create a shared execution state instance.
 * For multiple workflow instances, use `createExecutionState()` instead.
 * 
 * @deprecated Use `createExecutionState()` for new code to avoid shared state issues.
 */
export function useExecutionState(): UseExecutionStateReturn {
  if (!defaultInstance) {
    defaultInstance = createExecutionState();
  }
  return defaultInstance;
}
