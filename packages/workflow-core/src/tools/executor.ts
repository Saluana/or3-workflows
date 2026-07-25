/**
 * Policy-aware tool executor with input/output validation, HITL approval,
 * idempotency, and receipts (R5.AC4, R5.AC5, R2.AC5, R7.AC3-R7.AC5).
 */
import { validateToolArgs } from '../toolProtocol';
import type { ToolParameterSchema } from '../types';
import { planToolBatch, type ToolCallInput } from './policy';
import type {
    ToolBatchPlan,
    ToolCallOutcome,
    ToolExecutionContext,
    ToolExecutionPolicy,
    ToolReceipt,
    WorkflowTool,
} from './types';

/** Minimal receipt store surface (implemented by a RunStore). */
export interface ToolReceiptStore {
    getToolReceipt(runId: string, callId: string): Promise<ToolReceipt | null>;
    putToolReceipt?(receipt: ToolReceipt): Promise<void>;
}

/** Approval gate invoked for calls the policy marks `approve`. */
export type ToolApprovalGate = (params: {
    callId: string;
    toolName: string;
    input: unknown;
    reason?: string;
}) => Promise<boolean>;

export interface ToolBatchCall extends ToolCallInput {
    /** Raw (already JSON-parsed) arguments emitted by the model. */
    input: unknown;
}

export interface ExecuteToolBatchOptions {
    runId: string;
    nodeId: string;
    signal: AbortSignal;
    policy?: ToolExecutionPolicy;
    parallelToolCalls?: boolean;
    resolve: (toolName: string) => WorkflowTool | undefined;
    approvalGate?: ToolApprovalGate;
    receiptStore?: ToolReceiptStore;
    attempt?: number;
    now?: () => number;
}

function outputToString(output: unknown): string {
    if (typeof output === 'string') return output;
    return JSON.stringify(output);
}

function validateOutput(
    tool: WorkflowTool,
    output: unknown
): { ok: true } | { ok: false; error: string } {
    const schema = tool.descriptor.outputSchema;
    if (!schema) return { ok: true };
    const result = validateToolArgs(output, {
        parameters: schema as ToolParameterSchema,
    });
    return result.success ? { ok: true } : { ok: false, error: result.error };
}

async function runOne(
    call: ToolBatchCall,
    options: ExecuteToolBatchOptions
): Promise<ToolCallOutcome> {
    const now = options.now ?? (() => Date.now());
    const tool = options.resolve(call.toolName);
    if (!tool || !tool.execute) {
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'failed',
            output: `Tool "${call.toolName}" is not locally executable`,
            error: 'not-executable',
        };
    }

    // Reuse a prior receipt when present (idempotent replay, R7.AC4).
    if (options.receiptStore) {
        const existing = await options.receiptStore.getToolReceipt(
            options.runId,
            call.callId
        );
        if (existing && existing.status === 'succeeded') {
            return {
                callId: call.callId,
                toolName: call.toolName,
                status: 'reused',
                output: existing.result ?? '',
                receipt: existing,
            };
        }
    }

    // Input validation — invalid input never executes (R5.AC5).
    const parsed = tool.parseInput
        ? safeParseInput(tool, call.input)
        : { ok: true as const, value: call.input };
    if (!parsed.ok) {
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'failed',
            output: `Invalid tool input: ${parsed.error}`,
            error: parsed.error,
        };
    }
    const inputValidation = validateToolArgs(parsed.value, {
        parameters: tool.descriptor.inputSchema as ToolParameterSchema,
    });
    if (!inputValidation.success) {
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'failed',
            output: `Invalid tool input: ${inputValidation.error}`,
            error: inputValidation.error,
        };
    }

    const context: ToolExecutionContext = {
        runId: options.runId,
        nodeId: options.nodeId,
        callId: call.callId,
        attempt: options.attempt ?? 1,
        idempotencyKey: tool.idempotencyKey
            ? tool.idempotencyKey(inputValidation.data, {
                  runId: options.runId,
                  nodeId: options.nodeId,
                  callId: call.callId,
              })
            : undefined,
        signal: options.signal,
    };

    try {
        const output = await tool.execute(inputValidation.data, context);
        const outValidation = validateOutput(tool, output);
        const receipt: ToolReceipt = {
            runId: options.runId,
            callId: call.callId,
            toolName: call.toolName,
            authority: tool.descriptor.authority,
            idempotencyKey: context.idempotencyKey,
            status: outValidation.ok ? 'succeeded' : 'failed',
            result: outputToString(output),
            error: outValidation.ok ? undefined : outValidation.error,
            at: now(),
        };
        if (options.receiptStore?.putToolReceipt) {
            await options.receiptStore.putToolReceipt(receipt);
        }
        if (!outValidation.ok) {
            // Invalid output is not presented as successful (R5.AC5).
            return {
                callId: call.callId,
                toolName: call.toolName,
                status: 'failed',
                output: `Tool output failed schema validation: ${outValidation.error}`,
                error: outValidation.error,
                receipt,
            };
        }
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'succeeded',
            output: receipt.result ?? '',
            receipt,
        };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const receipt: ToolReceipt = {
            runId: options.runId,
            callId: call.callId,
            toolName: call.toolName,
            authority: tool.descriptor.authority,
            idempotencyKey: context.idempotencyKey,
            status: 'failed',
            error,
            at: now(),
        };
        if (options.receiptStore?.putToolReceipt) {
            await options.receiptStore.putToolReceipt(receipt);
        }
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'failed',
            output: `Error executing tool ${call.toolName}: ${error}`,
            error,
            receipt,
        };
    }
}

function safeParseInput(
    tool: WorkflowTool,
    input: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
    try {
        return { ok: true, value: tool.parseInput!(input) };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Execute a batch of tool calls according to the policy plan. Rejected calls
 * short-circuit, approve-marked calls are gated by {@link ToolApprovalGate},
 * and safe parallel batches run with bounded concurrency.
 */
export async function executeToolBatch(
    calls: ToolBatchCall[],
    options: ExecuteToolBatchOptions
): Promise<{ plan: ToolBatchPlan; outcomes: ToolCallOutcome[] }> {
    const plan = planToolBatch(calls, options.resolve, {
        policy: options.policy,
        parallelToolCalls: options.parallelToolCalls,
    });
    const byId = new Map(plan.calls.map((p) => [p.callId, p]));

    const runWithPolicy = async (
        call: ToolBatchCall
    ): Promise<ToolCallOutcome> => {
        const decision = byId.get(call.callId);
        if (decision?.disposition === 'reject') {
            return {
                callId: call.callId,
                toolName: call.toolName,
                status: 'rejected',
                output: `Tool call rejected: ${decision.reason ?? 'policy'}`,
                error: decision.reason,
            };
        }
        if (decision?.disposition === 'approve') {
            const approved = options.approvalGate
                ? await options.approvalGate({
                      callId: call.callId,
                      toolName: call.toolName,
                      input: call.input,
                      reason: decision.reason,
                  })
                : false;
            if (!approved) {
                return {
                    callId: call.callId,
                    toolName: call.toolName,
                    status: 'rejected',
                    output: `Tool call not approved: ${decision.reason ?? 'approval required'}`,
                    error: 'not-approved',
                };
            }
        }
        return runOne(call, options);
    };

    if (plan.mode === 'parallel') {
        const outcomes = await runConcurrent(
            calls,
            plan.maxConcurrency,
            runWithPolicy
        );
        return { plan, outcomes };
    }

    const outcomes: ToolCallOutcome[] = [];
    for (const call of calls) {
        outcomes.push(await runWithPolicy(call));
    }
    return { plan, outcomes };
}

async function runConcurrent<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    const size = Math.max(1, limit);
    const runners = Array.from({ length: Math.min(size, items.length) }, () =>
        (async () => {
            while (index < items.length) {
                const current = index++;
                results[current] = await worker(items[current]!);
            }
        })()
    );
    await Promise.all(runners);
    return results;
}
