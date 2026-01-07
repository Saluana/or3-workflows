import { ref } from 'vue';
import { useExecutionCache } from './useExecutionCache';
import type {
    ExecutionAdapter,
    WorkflowData,
    ExecutionInput,
    ExecutionResult,
    ExecutionCallbacks,
    NodeStatus,
} from 'or3-workflow-core';

export interface WorkflowExecutionState {
    isRunning: boolean;
    currentNodeId: string | null;
    nodeStatuses: Record<string, NodeStatus>;
    nodeOutputs: Record<string, string>;
    error: Error | null;
    result: ExecutionResult | null;
}

export interface UseWorkflowExecutionReturn {
    // State
    isRunning: import('vue').Ref<boolean>;
    currentNodeId: import('vue').Ref<string | null>;
    nodeStatuses: import('vue').Ref<Record<string, NodeStatus>>;
    nodeOutputs: import('vue').Ref<Record<string, string>>;
    error: import('vue').Ref<Error | null>;
    result: import('vue').Ref<ExecutionResult | null>;

    // Actions
    execute: (
        adapter: ExecutionAdapter,
        workflow: WorkflowData,
        input: ExecutionInput,
        callbacks?: Partial<ExecutionCallbacks>
    ) => Promise<ExecutionResult>;
    stop: (adapter: ExecutionAdapter) => void;
    reset: () => void;
}

/**
 * Composable for managing workflow execution state.
 * Handles execution lifecycle, status updates, and results.
 *
 * @example
 * ```ts
 * const { execute, isRunning, result } = useWorkflowExecution();
 *
 * async function run() {
 *   await execute(adapter, workflow, { text: 'Hello' });
 * }
 * ```
 */
export function useWorkflowExecution(): UseWorkflowExecutionReturn {
    const { setOutput, clear } = useExecutionCache();
    const isRunning = ref(false);
    const currentNodeId = ref<string | null>(null);
    const nodeStatuses = ref<Record<string, NodeStatus>>({});
    const nodeOutputs = ref<Record<string, string>>({});
    const error = ref<Error | null>(null);
    const result = ref<ExecutionResult | null>(null);

    const reset = () => {
        isRunning.value = false;
        currentNodeId.value = null;
        nodeStatuses.value = {};
        nodeOutputs.value = {};
        error.value = null;
        result.value = null;
        clear();
    };

    const execute = async (
        adapter: ExecutionAdapter,
        workflow: WorkflowData,
        input: ExecutionInput,
        externalCallbacks?: Partial<ExecutionCallbacks>
    ): Promise<ExecutionResult> => {
        reset();
        isRunning.value = true;

        const callbacks: ExecutionCallbacks = {
            onNodeStart: (nodeId) => {
                currentNodeId.value = nodeId;
                nodeStatuses.value[nodeId] = 'active';
                externalCallbacks?.onNodeStart?.(nodeId);
            },
            onNodeFinish: (nodeId, output) => {
                nodeStatuses.value[nodeId] = 'completed';
                nodeOutputs.value[nodeId] = output;
                setOutput(nodeId, output);
                if (currentNodeId.value === nodeId) {
                    currentNodeId.value = null;
                }
                externalCallbacks?.onNodeFinish?.(nodeId, output);
            },
            onNodeError: (nodeId, err) => {
                nodeStatuses.value[nodeId] = 'error';
                error.value = err;
                externalCallbacks?.onNodeError?.(nodeId, err);
            },
            onToken: (nodeId, token) => {
                externalCallbacks?.onToken?.(nodeId, token);
            },
            onReasoning: (nodeId, token) => {
                externalCallbacks?.onReasoning?.(nodeId, token);
            },
            onRouteSelected: (nodeId, routeId) => {
                externalCallbacks?.onRouteSelected?.(nodeId, routeId);
            },
            onTokenUsage: (nodeId, usage) => {
                externalCallbacks?.onTokenUsage?.(nodeId, usage);
            },
            onContextCompacted: (result) => {
                externalCallbacks?.onContextCompacted?.(result);
            },
            // Branch streaming callbacks for parallel nodes
            onBranchStart: (nodeId, branchId, branchLabel) => {
                externalCallbacks?.onBranchStart?.(
                    nodeId,
                    branchId,
                    branchLabel
                );
            },
            onBranchToken: (nodeId, branchId, branchLabel, token) => {
                externalCallbacks?.onBranchToken?.(
                    nodeId,
                    branchId,
                    branchLabel,
                    token
                );
            },
            onBranchReasoning: (nodeId, branchId, branchLabel, token) => {
                externalCallbacks?.onBranchReasoning?.(
                    nodeId,
                    branchId,
                    branchLabel,
                    token
                );
            },
            onBranchComplete: (nodeId, branchId, branchLabel, output) => {
                externalCallbacks?.onBranchComplete?.(
                    nodeId,
                    branchId,
                    branchLabel,
                    output
                );

                // Cache per-branch outputs using composite key for previews
                setOutput(`${nodeId}:${branchId}`, output);
            },
        };

        try {
            const executionResult = await adapter.execute(
                workflow,
                input,
                callbacks
            );
            result.value = executionResult;
            return executionResult;
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            error.value = e;
            throw e;
        } finally {
            isRunning.value = false;
            currentNodeId.value = null;
        }
    };

    const stop = (adapter: ExecutionAdapter) => {
        if (isRunning.value) {
            adapter.stop();
            isRunning.value = false;
        }
    };

    return {
        isRunning,
        currentNodeId,
        nodeStatuses,
        nodeOutputs,
        error,
        result,
        execute,
        stop,
        reset,
    };
}
