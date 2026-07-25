/**
 * Tool policy engine (R5.AC3, R5.AC4).
 *
 * Decides, for a batch of model-emitted tool calls, whether they may run in
 * parallel, must be serialized for safety, require human approval, or must be
 * rejected. The model's `parallelToolCalls` permission is independent from the
 * executor's scheduling policy — a model may emit parallel calls that the
 * policy still serializes for local safety.
 */
import type {
    ToolBatchPlan,
    ToolCallDisposition,
    ToolCallPlan,
    ToolExecutionPolicy,
    WorkflowTool,
} from './types';
import { DEFAULT_TOOL_POLICY } from './types';

export interface ToolCallInput {
    callId: string;
    toolName: string;
}

/** Decide the disposition for a single tool call. */
export function decideDisposition(
    tool: WorkflowTool | undefined,
    policy: ToolExecutionPolicy
): { disposition: ToolCallDisposition; reason?: string } {
    if (!tool) {
        return {
            disposition: 'reject',
            reason: 'Unknown tool (not registered)',
        };
    }
    const { approval, sideEffect } = tool.descriptor;

    if (approval === 'always') {
        return { disposition: 'approve', reason: 'Tool requires approval' };
    }
    if (approval === 'never') {
        return { disposition: 'execute' };
    }
    // approval === 'policy'
    if (sideEffect === 'destructive') {
        return {
            disposition: 'approve',
            reason: 'Destructive side effect requires approval',
        };
    }
    if (policy.defaultApproval === 'require') {
        return {
            disposition: 'approve',
            reason: 'Policy default requires approval',
        };
    }
    return { disposition: 'execute' };
}

/**
 * Build a batch execution plan for a set of tool calls.
 *
 * The batch is serialized when any of the following hold:
 * - the policy mode is `sequential`;
 * - the model did not permit parallel tool calls (`parallelToolCalls !== true`);
 * - any resolved tool is not `parallelSafe`;
 * - any call requires approval (approvals gate execution ordering).
 */
export function planToolBatch(
    calls: ToolCallInput[],
    resolve: (toolName: string) => WorkflowTool | undefined,
    options: {
        policy?: ToolExecutionPolicy;
        parallelToolCalls?: boolean;
    } = {}
): ToolBatchPlan {
    const policy = options.policy ?? DEFAULT_TOOL_POLICY;
    const planned: ToolCallPlan[] = calls.map((call) => {
        const tool = resolve(call.toolName);
        const { disposition, reason } = decideDisposition(tool, policy);
        return {
            callId: call.callId,
            toolName: call.toolName,
            disposition,
            reason,
        };
    });

    const anyUnsafe = calls.some((call) => {
        const tool = resolve(call.toolName);
        return !tool || tool.descriptor.parallelSafe !== true;
    });
    const anyApproval = planned.some((p) => p.disposition === 'approve');

    const canParallel =
        policy.mode === 'parallel' &&
        options.parallelToolCalls === true &&
        !anyUnsafe &&
        !anyApproval &&
        calls.length > 1;

    return {
        mode: canParallel ? 'parallel' : 'sequential',
        maxConcurrency: canParallel ? policy.maxConcurrency ?? calls.length : 1,
        calls: planned,
    };
}
