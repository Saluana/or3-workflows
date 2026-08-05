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
    ToolIntent,
    ToolReceipt,
    ToolReconciler,
    WorkflowTool,
} from './types';

/** Minimal receipt store surface (implemented by a RunStore). */
export interface ToolReceiptStore {
    getToolReceipt(runId: string, callId: string): Promise<ToolReceipt | null>;
    getToolReceiptByIdempotencyKey?(
        runId: string,
        idempotencyKey: string
    ): Promise<ToolReceipt | null>;
    putToolReceipt?(receipt: ToolReceipt): Promise<void>;
    getToolIntent?(
        runId: string,
        callId: string
    ): Promise<ToolIntent | null>;
    putToolIntent?(intent: ToolIntent): Promise<void>;
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
    reconciler?: ToolReconciler;
    receiptStore?: ToolReceiptStore;
    /** `undefined` preserves legacy unrestricted behavior; an array is a scope allow-list. */
    grantedPermissions?: string[];
    attempt?: number;
    now?: () => number;
    onIntent?: (intent: ToolIntent) => void;
    onApproval?: (event: {
        callId: string;
        toolName: string;
        approved: boolean;
    }) => void;
    onReceipt?: (receipt: ToolReceipt, reused?: boolean) => void;
}

/** Raised before replaying a tool whose previous external outcome is unknown. */
export class ToolReconciliationRequiredError extends Error {
    readonly name = 'ToolReconciliationRequiredError';

    constructor(
        public readonly intent: ToolIntent,
        reason?: string
    ) {
        super(
            reason ??
                `Tool "${intent.toolName}" (${intent.callId}) requires reconciliation before it can be resumed`
        );
    }
}

export function isToolReconciliationRequiredError(
    error: unknown
): error is ToolReconciliationRequiredError {
    return error instanceof ToolReconciliationRequiredError;
}

function notify<T>(callback: ((value: T) => void) | undefined, value: T): void {
    try {
        callback?.(value);
    } catch {
        // Observability callbacks must never change execution semantics.
    }
}

function notifyReceipt(
    callback: ExecuteToolBatchOptions['onReceipt'],
    receipt: ToolReceipt,
    reused = false
): void {
    try {
        callback?.(receipt, reused);
    } catch {
        // Observability callbacks must never change execution semantics.
    }
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? String(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    return `{${Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
        .join(',')}}`;
}

function inputFingerprint(value: unknown): string {
    // Deterministic FNV-1a. This is intentionally a comparison fingerprint,
    // not a cryptographic digest or a persisted copy of potentially secret input.
    const source = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function missingPermissions(
    tool: WorkflowTool,
    grantedPermissions: string[] | undefined
): string[] {
    if (grantedPermissions === undefined) return [];
    const granted = new Set(grantedPermissions);
    return (tool.descriptor.permissions ?? []).filter(
        (permission) => !granted.has(permission)
    );
}

function outputToString(output: unknown): string {
    if (typeof output === 'string') return output;
    return JSON.stringify(output) ?? String(output);
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
    options.signal.throwIfAborted();
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

    const missing = missingPermissions(tool, options.grantedPermissions);
    if (missing.length > 0) {
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'rejected',
            output: `Tool call rejected: missing permission${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`,
            error: `missing-permissions:${missing.join(',')}`,
        };
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
    const fingerprint = inputFingerprint(inputValidation.data);

    const receiptStore = options.receiptStore;
    const priorIntent = await receiptStore?.getToolIntent?.(
        options.runId,
        call.callId
    );
    if (priorIntent) {
        if (
            priorIntent.toolName !== call.toolName ||
            priorIntent.inputFingerprint !== fingerprint
        ) {
            throw new Error(
                `Tool call identity collision for "${call.callId}"; the persisted intent does not match this tool input`
            );
        }
    }

    const reuseReceipt = async (
        existing: ToolReceipt,
        reusedByIdempotencyKey: boolean
    ): Promise<ToolCallOutcome> => {
        const receipt =
            reusedByIdempotencyKey && existing.callId !== call.callId
                ? {
                      ...existing,
                      runId: options.runId,
                      callId: call.callId,
                      inputFingerprint: fingerprint,
                  }
                : existing;
        if (
            !reusedByIdempotencyKey &&
            existing.inputFingerprint &&
            existing.inputFingerprint !== fingerprint
        ) {
            throw new Error(
                `Tool call identity collision for "${call.callId}"; the persisted receipt does not match this tool input`
            );
        }
        if (
            receipt !== existing &&
            receiptStore?.putToolReceipt
        ) {
            await receiptStore.putToolReceipt(receipt);
        }
        if (receiptStore?.putToolIntent) {
            const completed: ToolIntent = {
                runId: options.runId,
                nodeId: options.nodeId,
                callId: call.callId,
                toolName: call.toolName,
                authority: tool.descriptor.authority,
                sideEffect: tool.descriptor.sideEffect,
                idempotencyKey: context.idempotencyKey,
                inputFingerprint: fingerprint,
                attempt: options.attempt ?? 1,
                status: 'completed',
                preparedAt: priorIntent?.preparedAt ?? receipt.at,
                startedAt: priorIntent?.startedAt,
                completedAt: receipt.at,
                updatedAt: receipt.at,
            };
            await receiptStore.putToolIntent(completed);
            notify(options.onIntent, completed);
        }
        notifyReceipt(options.onReceipt, receipt, true);
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'reused',
            output: receipt.result ?? '',
            receipt,
        };
    };

    if (receiptStore) {
        const existing = await receiptStore.getToolReceipt(
            options.runId,
            call.callId
        );
        if (
            existing &&
            existing.toolName === call.toolName &&
            existing.status === 'succeeded'
        ) {
            return reuseReceipt(existing, false);
        }
    }

    if (
        context.idempotencyKey &&
        receiptStore?.getToolReceiptByIdempotencyKey
    ) {
        const existing =
            await receiptStore.getToolReceiptByIdempotencyKey(
                options.runId,
                context.idempotencyKey
            );
        if (
            existing &&
            existing.toolName === call.toolName &&
            existing.status === 'succeeded'
        ) {
            return reuseReceipt(existing, true);
        }
    }

    if (priorIntent) {
        const uncertain =
            priorIntent.status === 'started' ||
            priorIntent.status === 'completed' ||
            priorIntent.status === 'failed' ||
            priorIntent.status === 'reconciliation_required';
        if (
            uncertain &&
            priorIntent.sideEffect !== 'none' &&
            !priorIntent.idempotencyKey
        ) {
            const decision = options.reconciler
                ? await options.reconciler({
                      intent: priorIntent,
                      input: inputValidation.data,
                      signal: options.signal,
                  })
                : { action: 'pause' as const };

            if (decision.action === 'completed') {
                const receipt: ToolReceipt = {
                    runId: options.runId,
                    callId: call.callId,
                    toolName: call.toolName,
                    authority: tool.descriptor.authority,
                    sideEffect: tool.descriptor.sideEffect,
                    idempotencyKey: context.idempotencyKey,
                    inputFingerprint: fingerprint,
                    status: 'succeeded',
                    result: outputToString(decision.output),
                    at: now(),
                };
                await receiptStore?.putToolReceipt?.(receipt);
                const reconciled: ToolIntent = {
                    ...priorIntent,
                    status: 'completed',
                    completedAt: receipt.at,
                    updatedAt: receipt.at,
                    error: undefined,
                };
                await receiptStore?.putToolIntent?.(reconciled);
                notify(options.onIntent, reconciled);
                notifyReceipt(options.onReceipt, receipt);
                return {
                    callId: call.callId,
                    toolName: call.toolName,
                    status: 'reconciled',
                    output: receipt.result ?? '',
                    receipt,
                };
            }
            if (decision.action === 'failed') {
                const receipt: ToolReceipt = {
                    runId: options.runId,
                    callId: call.callId,
                    toolName: call.toolName,
                    authority: tool.descriptor.authority,
                    sideEffect: tool.descriptor.sideEffect,
                    idempotencyKey: context.idempotencyKey,
                    inputFingerprint: fingerprint,
                    status: 'failed',
                    error: decision.error,
                    at: now(),
                };
                await receiptStore?.putToolReceipt?.(receipt);
                const failed: ToolIntent = {
                    ...priorIntent,
                    status: 'failed',
                    completedAt: receipt.at,
                    updatedAt: receipt.at,
                    error: decision.error,
                };
                await receiptStore?.putToolIntent?.(failed);
                notify(options.onIntent, failed);
                notifyReceipt(options.onReceipt, receipt);
                return {
                    callId: call.callId,
                    toolName: call.toolName,
                    status: 'failed',
                    output: `Tool reconciliation failed: ${decision.error}`,
                    error: decision.error,
                    receipt,
                };
            }
            if (decision.action === 'pause') {
                const pending: ToolIntent = {
                    ...priorIntent,
                    status: 'reconciliation_required',
                    updatedAt: now(),
                    error:
                        decision.reason ??
                        'External side-effect outcome is unknown',
                };
                await receiptStore?.putToolIntent?.(pending);
                notify(options.onIntent, pending);
                throw new ToolReconciliationRequiredError(
                    pending,
                    decision.reason
                );
            }
            // An explicit `retry` decision deliberately falls through.
        }
    }

    const preparedAt = now();
    let intent: ToolIntent = {
        runId: options.runId,
        nodeId: options.nodeId,
        callId: call.callId,
        toolName: call.toolName,
        authority: tool.descriptor.authority,
        sideEffect: tool.descriptor.sideEffect,
        idempotencyKey: context.idempotencyKey,
        inputFingerprint: fingerprint,
        attempt: options.attempt ?? 1,
        status: 'prepared',
        preparedAt: priorIntent?.preparedAt ?? preparedAt,
        updatedAt: preparedAt,
    };

    if (
        tool.descriptor.sideEffect !== 'none' &&
        (!receiptStore?.putToolIntent || !receiptStore.getToolIntent)
    ) {
        throw new Error(
            `Side-effecting tool "${call.toolName}" requires a durable tool-intent store`
        );
    }

    await receiptStore?.putToolIntent?.(intent);
    notify(options.onIntent, intent);
    const startedAt = now();
    intent = {
        ...intent,
        status: 'started',
        startedAt,
        updatedAt: startedAt,
    };
    await receiptStore?.putToolIntent?.(intent);
    notify(options.onIntent, intent);

    let output: unknown;
    try {
        options.signal.throwIfAborted();
        output = await tool.execute(inputValidation.data, context);
    } catch (err) {
        if (options.signal.aborted) throw err;
        const error = err instanceof Error ? err.message : String(err);
        const failedAt = now();
        const receipt: ToolReceipt = {
            runId: options.runId,
            callId: call.callId,
            toolName: call.toolName,
            authority: tool.descriptor.authority,
            sideEffect: tool.descriptor.sideEffect,
            idempotencyKey: context.idempotencyKey,
            inputFingerprint: fingerprint,
            status: 'failed',
            error,
            at: failedAt,
        };
        await receiptStore?.putToolReceipt?.(receipt);
        const failedIntent: ToolIntent = {
            ...intent,
            status: 'failed',
            completedAt: failedAt,
            updatedAt: failedAt,
            error,
        };
        await receiptStore?.putToolIntent?.(failedIntent);
        notify(options.onIntent, failedIntent);
        notifyReceipt(options.onReceipt, receipt);
        return {
            callId: call.callId,
            toolName: call.toolName,
            status: 'failed',
            output: `Error executing tool ${call.toolName}: ${error}`,
            error,
            receipt,
        };
    }

    {
        const outValidation = validateOutput(tool, output);
        const completedAt = now();
        const receipt: ToolReceipt = {
            runId: options.runId,
            callId: call.callId,
            toolName: call.toolName,
            authority: tool.descriptor.authority,
            sideEffect: tool.descriptor.sideEffect,
            idempotencyKey: context.idempotencyKey,
            inputFingerprint: fingerprint,
            status: outValidation.ok ? 'succeeded' : 'failed',
            result: outputToString(output),
            error: outValidation.ok ? undefined : outValidation.error,
            at: completedAt,
        };
        await receiptStore?.putToolReceipt?.(receipt);
        const completedIntent: ToolIntent = {
            ...intent,
            status: outValidation.ok ? 'completed' : 'failed',
            completedAt,
            updatedAt: completedAt,
            error: outValidation.ok ? undefined : outValidation.error,
        };
        await receiptStore?.putToolIntent?.(completedIntent);
        notify(options.onIntent, completedIntent);
        notifyReceipt(options.onReceipt, receipt);
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
            notify(options.onApproval, {
                callId: call.callId,
                toolName: call.toolName,
                approved,
            });
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
