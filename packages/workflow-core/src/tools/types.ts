/**
 * Typed tool descriptors, runtime tools, execution context, policy, and
 * receipts (R5).
 *
 * A {@link WorkflowTool} separates a *serializable descriptor* (safe to persist
 * and to render in a palette / send to a model) from an optional runtime
 * `execute` implementation. Different tool authorities (local host client,
 * host server, MCP, provider-managed server tools) are represented without
 * conflating their execution trust boundaries (R5.AC1).
 */

/** Where a tool actually runs / who is authoritative for its execution. */
export type ToolAuthority =
    | 'host-client'
    | 'host-server'
    | 'mcp'
    | 'provider-server';

/** Side-effect classification used by the policy engine. */
export type ToolSideEffect = 'none' | 'reversible' | 'destructive';

/** When human approval is required before execution. */
export type ToolApproval = 'never' | 'policy' | 'always';

/** Serializable descriptor. Contains no runtime code. */
export interface ToolDescriptor {
    name: string;
    description?: string;
    /** JSON Schema for the tool input. */
    inputSchema: Record<string, unknown>;
    /** Optional JSON Schema for the tool output. */
    outputSchema?: Record<string, unknown>;
    authority: ToolAuthority;
    sideEffect: ToolSideEffect;
    approval: ToolApproval;
    /** Whether the tool is safe to run concurrently with others. */
    parallelSafe: boolean;
    /** Optional permission scopes required to run this tool. */
    permissions?: string[];
    /**
     * For `provider-server` tools: the transport(s) that support it. Provider
     * server tools have no local `execute` — the model request runs them.
     */
    transport?: 'chat' | 'responses' | 'either';
    /** Provider request configuration for `provider-server` tools. */
    providerConfig?: Record<string, unknown>;
}

/** Context passed into every local tool execution (R5.AC5, R2.AC5). */
export interface ToolExecutionContext {
    runId: string;
    nodeId: string;
    callId: string;
    attempt: number;
    idempotencyKey?: string;
    signal: AbortSignal;
}

/**
 * Runtime tool: a descriptor plus optional input parsing, execution, and
 * idempotency-key derivation. `provider-server` tools omit `execute`.
 */
export interface WorkflowTool<TInput = unknown, TOutput = unknown> {
    descriptor: ToolDescriptor;
    parseInput?: (value: unknown) => TInput;
    execute?: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
    idempotencyKey?: (
        input: TInput,
        context: Pick<ToolExecutionContext, 'runId' | 'nodeId' | 'callId'>
    ) => string;
}

/** Executor scheduling policy (independent of model `parallelToolCalls`). */
export interface ToolExecutionPolicy {
    /** Preferred scheduling mode when tools permit it. */
    mode: 'parallel' | 'sequential';
    /** Cap on concurrent tool executions in parallel mode. */
    maxConcurrency?: number;
    /**
     * Default approval decision applied to `approval: 'policy'` tools when the
     * side effect is not destructive. Destructive side effects always require
     * approval regardless of this value.
     */
    defaultApproval?: 'auto' | 'require';
}

/** Conservative default policy for legacy/adapted tools. */
export const DEFAULT_TOOL_POLICY: ToolExecutionPolicy = {
    mode: 'sequential',
    maxConcurrency: 1,
    defaultApproval: 'require',
};

/** Disposition for a single tool call after policy evaluation. */
export type ToolCallDisposition = 'execute' | 'approve' | 'reject';

/** Planned handling of one tool call. */
export interface ToolCallPlan {
    callId: string;
    toolName: string;
    disposition: ToolCallDisposition;
    reason?: string;
}

/** Full plan for a batch of tool calls emitted in one model turn. */
export interface ToolBatchPlan {
    /** Effective scheduling mode after safety reductions. */
    mode: 'parallel' | 'sequential';
    maxConcurrency: number;
    calls: ToolCallPlan[];
}

/** Persisted record of an external tool execution (R7.AC3-R7.AC5). */
export interface ToolReceipt {
    runId: string;
    callId: string;
    toolName: string;
    authority: ToolAuthority;
    /** Side-effect policy captured at execution time for safe retry planning. */
    sideEffect?: ToolSideEffect;
    idempotencyKey?: string;
    /** Validated-input fingerprint for call-id collision detection. */
    inputFingerprint?: string;
    status: 'succeeded' | 'failed' | 'uncertain';
    /** Serialized output (or a reference the host can resolve). */
    result?: string;
    error?: string;
    at: number;
}

/** Durable record written before an external tool is allowed to execute. */
export interface ToolIntent {
    runId: string;
    nodeId: string;
    callId: string;
    toolName: string;
    authority: ToolAuthority;
    sideEffect: ToolSideEffect;
    idempotencyKey?: string;
    /** Non-reversible fingerprint of the validated input. */
    inputFingerprint: string;
    attempt: number;
    status:
        | 'prepared'
        | 'started'
        | 'completed'
        | 'failed'
        | 'reconciliation_required';
    preparedAt: number;
    startedAt?: number;
    completedAt?: number;
    updatedAt: number;
    error?: string;
}

/** Host decision for an uncertain side effect discovered during resume. */
export type ToolReconciliationDecision =
    | {
          action: 'completed';
          /** External result recovered from the authoritative system. */
          output: unknown;
      }
    | {
          action: 'retry';
          /** Human/host assertion that replay is safe. */
          reason?: string;
      }
    | { action: 'failed'; error: string }
    | { action: 'pause'; reason?: string };

/** Host hook used to reconcile a prepared/started call without a receipt. */
export type ToolReconciler = (params: {
    intent: ToolIntent;
    input: unknown;
    signal: AbortSignal;
}) => Promise<ToolReconciliationDecision>;

/** Result of running a single tool call through the executor. */
export interface ToolCallOutcome {
    callId: string;
    toolName: string;
    status:
        | 'succeeded'
        | 'failed'
        | 'rejected'
        | 'reused'
        | 'reconciled';
    output: string;
    error?: string;
    receipt?: ToolReceipt;
}
