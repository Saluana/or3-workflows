import { ref, readonly } from 'vue';

export interface ExecutionState {
  isRunning: boolean;
  streamingContent: string;
  nodeStatuses: Record<string, 'idle' | 'active' | 'completed' | 'error'>;
  currentNodeId: string | null;
  error: Error | null;
}

const state = ref<ExecutionState>({
  isRunning: false,
  streamingContent: '',
  nodeStatuses: {},
  currentNodeId: null,
  error: null,
});

export function useExecutionState() {
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
