import type { OpenRouter } from '@openrouter/sdk';
import type {
    WorkflowData,
    WorkflowNode,
    WorkflowEdge,
    ExecutionAdapter,
    ExecutionCallbacks,
    ExecutionResult,
    ExecutionOptions,
    ExecutionInput,
    Attachment,
    ModelCapabilities,
    InputModality,
    NodeExtension,
    LLMProvider,
    ExecutionContext,
    ChatMessage,
    TokenUsage,
    TokenUsageDetails,
    ValidationContext,
    NodeExecutionMetadata,
} from './types';
import {
    AgentNodeExtension,
    RouterNodeExtension,
    ParallelNodeExtension,
    WhileLoopExtension,
    SubflowExtension,
    OutputNodeExtension,
    StartNodeExtension,
    SchemaValidationNodeExtension,
} from './extensions';
import { OpenRouterLLMProvider } from './providers/OpenRouterLLMProvider';
import {
    type ModelCallRecord,
    type ModelGateway,
    isModelGateway,
    LegacyLLMProviderGateway,
    gatewayAsLLMProvider,
} from './gateway';
import {
    createOpenRouterModelGateway,
    type OpenRouterV1Client,
} from './providers/openrouter';
import { InMemoryAdapter, type MemoryAdapter } from './memory';
import { ExecutionSession, type Session } from './session';
import {
    createExecutionError,
    ExecutionError,
    type NodeErrorConfig,
    type NodeRetryConfig,
} from './errors';
import {
    type HITLConfig,
    type HITLRequest,
    type HITLResponse,
    generateHITLRequestId,
    getDefaultApprovalOptions,
} from './hitl';
import {
    type WorkflowCheckpoint,
    createCheckpointId,
    WorkflowPausedError,
    isWorkflowPausedError,
    CHECKPOINT_SCHEMA_VERSION,
} from './checkpoint';
import {
    ApproximateTokenCounter,
    countMessageTokens,
    calculateThreshold,
    splitMessagesForCompaction,
    buildSummarizationPrompt,
    createSummaryMessage,
    type CompactionResult,
    type TokenCounter,
} from './compaction';
import { validateWorkflow } from './validation';
import { safeEmitEvent, type WorkflowEvent } from './events';
import {
    BudgetExceededError,
    checkStopPolicy,
    createStopPolicyState,
    isBudgetExceededError,
    type StopPolicyState,
} from './stopPolicy';
import type { EdgeData, EdgeInputMapping } from './types/base';
import {
    createRunId,
    loadResumeSnapshot,
    persistWaveBoundary,
    snapshotToResumeFrom,
} from './runstore';
import { DEFAULT_WORKFLOW_MODEL } from './models';
import {
    isToolReconciliationRequiredError,
    type ToolIntent,
} from './tools';
import {
    RunSequencer,
    projectToLegacyEvent,
    redactEnvelope,
    type WorkflowEventV2,
} from './observability';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default model used when no model is specified.
 * This is a reliable, cost-effective model that works well for most use cases.
 * Can be overridden via ExecutionOptions.defaultModel.
 */
const DEFAULT_MODEL = DEFAULT_WORKFLOW_MODEL;

/** Maximum retry attempts for API calls */
const DEFAULT_MAX_RETRIES = 2;

/** Base delay in milliseconds between retry attempts */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Maximum iterations multiplier to prevent infinite loops */
const MAX_ITERATIONS_MULTIPLIER = 3;

/** Default error codes to skip retrying */
const DEFAULT_SKIP_ON_RETRY: ReadonlyArray<import('./errors').ErrorCode> = [
    'AUTH',
    'VALIDATION',
] as const;

function mergeStopPolicies(
    workflow: import('./stopPolicy').StopPolicy | undefined,
    host: import('./stopPolicy').StopPolicy | undefined
): import('./stopPolicy').StopPolicy | undefined {
    if (!workflow) return host;
    if (!host) return workflow;
    const minimum = (
        left: number | undefined,
        right: number | undefined
    ): number | undefined =>
        left === undefined
            ? right
            : right === undefined
              ? left
              : Math.min(left, right);
    return {
        maxSteps: minimum(workflow.maxSteps, host.maxSteps),
        maxDurationMs: minimum(
            workflow.maxDurationMs,
            host.maxDurationMs
        ),
        maxTokens: minimum(workflow.maxTokens, host.maxTokens),
        maxCostUsd: minimum(
            workflow.maxCostUsd,
            host.maxCostUsd
        ),
    };
}

// ============================================================================
// Types
// ============================================================================

/** Graph structure for workflow traversal */
interface WorkflowGraph {
    readonly nodeMap: ReadonlyMap<string, WorkflowNode>;
    readonly children: Readonly<
        Record<string, ReadonlyArray<{ nodeId: string; handleId?: string }>>
    >;
    readonly parents: Readonly<Record<string, ReadonlyArray<string>>>;
    /** Inbound edges keyed by target node id (preserves EdgeData / inputMapping) */
    readonly inboundEdges: Readonly<
        Record<string, ReadonlyArray<WorkflowEdge>>
    >;
}

/** Internal execution state */
interface InternalExecutionContext {
    readonly input: string;
    currentInput: string;
    readonly originalInput: string;
    readonly attachments: Attachment[];
    outputs: Record<string, string>;
    values: Record<string, import('./gateway/types').JsonValue>;
    nodeChain: string[];
    readonly nodePath: string[];
    readonly signal: AbortSignal;
    readonly session: Session;
    readonly memory: MemoryAdapter;
    readonly workflowName: string;
}

const SUBFLOW_SCOPE_PREFIX = 'sf:';
const SUBFLOW_SCOPE_SEPARATOR = '|';

function scopeNodeId(nodeId: string, path?: string[]): string {
    if (!path || path.length === 0) return nodeId;
    const scoped = path
        .map((segment) => `${SUBFLOW_SCOPE_PREFIX}${segment}`)
        .join(SUBFLOW_SCOPE_SEPARATOR);
    return `${scoped}${SUBFLOW_SCOPE_SEPARATOR}${nodeId}`;
}

function scopeMeta(
    meta: NodeExecutionMetadata | undefined,
    path: string[]
): NodeExecutionMetadata | undefined {
    if (!meta) return meta;
    return {
        ...meta,
        id: meta.id ? scopeNodeId(meta.id, path) : meta.id,
        path: [...path],
    };
}

/**
 * Interpolate `{{nodeId}}` (and `{{input}}`) placeholders for edge template mapping.
 */
function interpolateEdgeTemplate(
    template: string,
    outputs: Record<string, string>,
    currentInput: string
): string {
    return template.replace(/\{\{\s*([\w.:-]+)\s*\}\}/g, (_match, key: string) => {
        if (key === 'input') return currentInput;
        return outputs[key] ?? '';
    });
}

function scopeExecutionCallbacks(
    callbacks: ExecutionCallbacks,
    path: string[]
): ExecutionCallbacks {
    const scopeId = (nodeId: string) => scopeNodeId(nodeId, path);
    return {
        onNodeStart: (nodeId, meta) => {
            callbacks.onNodeStart(scopeId(nodeId), scopeMeta(meta, path));
        },
        onNodeFinish: (nodeId, output, meta) => {
            callbacks.onNodeFinish(
                scopeId(nodeId),
                output,
                scopeMeta(meta, path)
            );
        },
        onNodeError: (nodeId, error, meta) => {
            callbacks.onNodeError(
                scopeId(nodeId),
                error,
                scopeMeta(meta, path)
            );
        },
        onToken: (nodeId, token) => {
            callbacks.onToken(scopeId(nodeId), token);
        },
        onWorkflowToken: callbacks.onWorkflowToken
            ? (token, meta) => {
                  const nextMeta = meta
                      ? { ...meta, nodeId: scopeId(meta.nodeId) }
                      : meta;
                  callbacks.onWorkflowToken?.(token, nextMeta as any);
              }
            : undefined,
        onReasoning: callbacks.onReasoning
            ? (nodeId, token) => {
                  callbacks.onReasoning?.(scopeId(nodeId), token);
              }
            : undefined,
        onRouteSelected: callbacks.onRouteSelected
            ? (nodeId, routeId, meta) => {
                  callbacks.onRouteSelected?.(
                      scopeId(nodeId),
                      routeId,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        onTokenUsage: callbacks.onTokenUsage
            ? (nodeId, usage) => {
                  callbacks.onTokenUsage?.(scopeId(nodeId), usage);
              }
            : undefined,
        onContextCompacted: callbacks.onContextCompacted
            ? (result) => {
                  callbacks.onContextCompacted?.(result);
              }
            : undefined,
        onBranchToken: callbacks.onBranchToken
            ? (nodeId, branchId, branchLabel, token) => {
                  callbacks.onBranchToken?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      token
                  );
              }
            : undefined,
        onBranchReasoning: callbacks.onBranchReasoning
            ? (nodeId, branchId, branchLabel, token) => {
                  callbacks.onBranchReasoning?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      token
                  );
              }
            : undefined,
        onBranchStart: callbacks.onBranchStart
            ? (nodeId, branchId, branchLabel, meta) => {
                  callbacks.onBranchStart?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        onBranchComplete: callbacks.onBranchComplete
            ? (nodeId, branchId, branchLabel, output, meta) => {
                  callbacks.onBranchComplete?.(
                      scopeId(nodeId),
                      branchId,
                      branchLabel,
                      output,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        onLoopIteration: callbacks.onLoopIteration
            ? (nodeId, iteration, maxIterations, meta) => {
                  callbacks.onLoopIteration?.(
                      scopeId(nodeId),
                      iteration,
                      maxIterations,
                      scopeMeta(meta, path)
                  );
              }
            : undefined,
        // Avoid propagating subflow completion to parent completion handlers.
        onComplete: undefined,
    };
}

/** UI/host observers must never become part of workflow control flow. */
function isolateExecutionCallbacks(
    callbacks: ExecutionCallbacks
): ExecutionCallbacks {
    const isolated: Record<string, unknown> = {};
    for (const [name, callback] of Object.entries(callbacks)) {
        if (typeof callback !== 'function') {
            isolated[name] = callback;
            continue;
        }
        isolated[name] = (...args: unknown[]) => {
            try {
                const result = callback(...args);
                if (
                    result &&
                    typeof (result as PromiseLike<unknown>).then === 'function'
                ) {
                    void Promise.resolve(result).catch(() => undefined);
                }
            } catch {
                // Observer failures are presentation/integration failures, not
                // grounds to retry model or tool side effects.
            }
        };
    }
    return isolated as unknown as ExecutionCallbacks;
}

function getNodeLabel(node: WorkflowNode | undefined): string | undefined {
    if (!node) return undefined;
    const maybe = (node.data as { label?: string } | undefined)?.label;
    if (typeof maybe === 'string' && maybe.trim().length > 0) {
        return maybe;
    }
    return node.id;
}

// ============================================================================
// Extension Registry
// ============================================================================

/**
 * Registry of all node type extensions.
 * Used by execution and validation to look up node handlers.
 */
export const extensionRegistry = new Map<string, NodeExtension>([
    ['agent', AgentNodeExtension],
    ['router', RouterNodeExtension],
    ['parallel', ParallelNodeExtension],
    ['whileLoop', WhileLoopExtension],
    ['subflow', SubflowExtension],
    ['output', OutputNodeExtension],
    ['schemaValidation', SchemaValidationNodeExtension],
    ['start', StartNodeExtension],
    ['condition', RouterNodeExtension], // Legacy alias
]);

/**
 * Get an extension by node type.
 * @param nodeType - The type of node (e.g., 'agent', 'router')
 * @returns The extension or undefined if not found
 */
export function getExtension(nodeType: string): NodeExtension | undefined {
    return extensionRegistry.get(nodeType);
}

/**
 * Register a custom node extension.
 * @param extension - The extension to register
 */
export function registerExtension(extension: NodeExtension): void {
    extensionRegistry.set(extension.name, extension);
}

// ============================================================================
// OpenRouterExecutionAdapter
// ============================================================================

/**
 * Execution adapter that uses OpenRouter SDK for LLM calls.
 * Implements BFS traversal with streaming, retry logic, and multimodal support.
 *
 * @example
 * ```typescript
 * import OpenRouter from '@openrouter/sdk';
 * import { OpenRouterExecutionAdapter } from 'or3-workflow-core';
 *
 * const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
 * const adapter = new OpenRouterExecutionAdapter(client, {
 *   defaultModel: 'openai/gpt-5.6-luna',
 *   maxRetries: 2,
 * });
 *
 * const result = await adapter.execute(workflow, { text: 'Hello' }, callbacks);
 * ```
 */
export class OpenRouterExecutionAdapter implements ExecutionAdapter {
    private provider: LLMProvider;
    /**
     * Provider-neutral gateway used as the internal source of truth (R2).
     * Legacy `LLMProvider` instances are wrapped in a
     * {@link LegacyLLMProviderGateway}; raw OpenRouter v1 clients are wrapped
     * in an {@link OpenRouterModelGateway}; and a supplied
     * {@link ModelGateway} is used directly. Extensions still receive an
     * `LLMProvider` (`this.provider`) during the deprecation window.
     */
    private gateway: ModelGateway;
    private options: ExecutionOptions;
    private abortController: AbortController | null = null;
    private running = false;
    private memory: MemoryAdapter;
    private tokenCounter: TokenCounter;
    private tokenUsageEvents: Array<{
        nodeId: string;
        usage: TokenUsageDetails;
    }> = [];
    private stopPolicyState: StopPolicyState | null = null;
    private assertBudgetFn: (() => void) | null = null;
    private recordLlmStepFn:
        | ((tokens?: number, costUsd?: number) => void)
        | null = null;
    private modelCalls: ModelCallRecord[] = [];
    private modelCallSequence = 0;
    private activeV2Emitter:
        | ((event: WorkflowEventV2, path?: string[]) => void)
        | null = null;

    // Cache node type sets for O(1) lookups
    private static readonly LLM_NODE_TYPES = new Set([
        'agent',
        'router',
        'whileLoop',
    ]);
    private static readonly HITL_SUPPORTED_TYPES = new Set(['agent', 'router']);

    /**
     * Create a new OpenRouterExecutionAdapter.
     *
     * @param clientOrProvider - An OpenRouter client OR an LLMProvider instance.
     * @param options - Optional execution configuration.
     */
    constructor(
        clientOrProvider: OpenRouter | LLMProvider | ModelGateway,
        options: ExecutionOptions = {}
    ) {
        if (!clientOrProvider) {
            throw new Error(
                'OpenRouterExecutionAdapter requires an OpenRouter client, LLMProvider, or ModelGateway.'
            );
        }

        if (isModelGateway(clientOrProvider)) {
            // A provider-neutral gateway is the source of truth; extensions get
            // a legacy projection during the deprecation window.
            this.gateway = clientOrProvider;
            this.provider = gatewayAsLLMProvider(clientOrProvider);
        } else if (this.isLLMProvider(clientOrProvider)) {
            // Keep the direct provider for extensions (no lossy round-trip) and
            // wrap it as a gateway for the internal contract.
            this.provider = clientOrProvider;
            this.gateway = new LegacyLLMProviderGateway(clientOrProvider);
        } else {
            this.provider = new OpenRouterLLMProvider(clientOrProvider, {
                debug: options.debug,
            });
            this.gateway = createOpenRouterModelGateway(
                clientOrProvider as unknown as OpenRouterV1Client,
                { metadata: 'enabled' }
            );
        }

        this.options = {
            defaultModel: DEFAULT_MODEL,
            maxRetries: DEFAULT_MAX_RETRIES,
            retryDelayMs: DEFAULT_RETRY_DELAY_MS,
            ...options,
        };
        this.memory = this.options.memory || new InMemoryAdapter();
        this.tokenCounter =
            this.options.tokenCounter || new ApproximateTokenCounter();
    }

    private isLLMProvider(obj: unknown): obj is LLMProvider {
        return (
            obj !== null &&
            typeof obj === 'object' &&
            'chat' in obj &&
            typeof obj.chat === 'function'
        );
    }

    /**
     * The internal provider-neutral gateway (R2). Prefer this over the legacy
     * `LLMProvider` projection for new integrations.
     */
    getGateway(): ModelGateway {
        return this.gateway;
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    /**
     * Execute a workflow with the given input.
     */
    async execute(
        workflow: WorkflowData,
        input: ExecutionInput,
        callbacks: ExecutionCallbacks
    ): Promise<ExecutionResult> {
        callbacks = isolateExecutionCallbacks(callbacks);
        // Cancel any existing execution
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // Link parent signal (subflows) so parent stop() cancels children
        const parentSignal = this.options._parentSignal;
        if (parentSignal) {
            if (parentSignal.aborted) {
                this.abortController.abort();
            } else {
                parentSignal.addEventListener(
                    'abort',
                    () => {
                        this.abortController?.abort();
                    },
                    { once: true }
                );
            }
        }

        this.running = true;
        this.tokenUsageEvents = [];
        this.modelCalls = [];
        this.modelCallSequence = 0;
        this.stopPolicyState = createStopPolicyState();

        // Resolve durable run identity when a RunStore is configured (R7).
        const runStore = this.options.runStore;
        const runId =
            this.options.runId ??
            (runStore ? createRunId() : undefined);
        if (runStore && runId && !this.options.runId) {
            this.options = { ...this.options, runId };
        }
        const eventRunId =
            runId ?? this.options.sessionId ?? createRunId();
        const sequencer = new RunSequencer(eventRunId, {
            workflowId: workflow.meta.id ?? workflow.meta.name,
            workflowVersion: workflow.meta.version,
        });
        const dispatchV2 = (
            event: WorkflowEventV2,
            path: string[] = []
        ): void => {
            const envelope = sequencer.envelope(event, { path });
            const legacy = projectToLegacyEvent(envelope);
            if (legacy) safeEmitEvent(this.options.onEvent, legacy);
            const exported = redactEnvelope(
                envelope,
                this.options.eventRedaction
            );
            try {
                this.options.onEventV2?.(exported);
            } catch {
                // Telemetry callbacks never alter workflow execution.
            }
            try {
                this.options.otel?.handle(exported);
            } catch {
                // Host instrumentation remains isolated.
            }
        };
        this.activeV2Emitter = dispatchV2;
        const emit = (event: WorkflowEvent): void => {
            const { at: _at, ...withoutTimestamp } = event;
            dispatchV2(withoutTimestamp as WorkflowEventV2);
        };
        const persistWaves =
            !!runStore &&
            !!runId &&
            (this.options.persistWaveSnapshots ?? true);

        let resumeFrom = this.options.resumeFrom;
        // When no explicit resumeFrom is provided, restore from the durable
        // wave snapshot so process restarts continue deterministically.
        if (!resumeFrom && runStore && runId) {
            let snap;
            try {
                snap = await loadResumeSnapshot(runStore, runId);
            } catch (error) {
                const failedAt = Date.now();
                const err =
                    error instanceof Error
                        ? error
                        : new Error(String(error));
                const result = this.buildExecutionResult(
                    false,
                    '',
                    '',
                    undefined,
                    [],
                    undefined,
                    {},
                    [],
                    failedAt,
                    err
                );
                dispatchV2({
                    type: 'run_start',
                    workflowName: workflow.meta.name,
                    sessionId: this.options.sessionId,
                });
                dispatchV2({ type: 'done', result });
                callbacks.onNodeError('', err as any);
                callbacks.onComplete?.(result as any);
                this.running = false;
                this.activeV2Emitter = null;
                return result;
            }
            if (
                (snap?.status === 'running' ||
                    (snap?.status === 'reconciliation_required' &&
                        !!this.options.toolReconciler)) &&
                snap.pendingNodes.length > 0
            ) {
                resumeFrom = snapshotToResumeFrom(snap);
            }
            if (
                snap?.status === 'reconciliation_required' &&
                !this.options.toolReconciler
            ) {
                const reconciliation = snap.reconciliation;
                const result = this.buildExecutionResult(
                    false,
                    '',
                    '',
                    undefined,
                    [...snap.completedNodes],
                    snap.completedNodes[snap.completedNodes.length - 1],
                    { ...snap.nodeOutputs },
                    [...snap.transcript],
                    Date.now(),
                    undefined,
                    {
                        paused: true,
                        pause: {
                            type: 'reconciliation',
                            resumeToken: runId,
                            reason:
                                reconciliation?.reason ??
                                'An external tool outcome must be reconciled before resume',
                        },
                    }
                );
                dispatchV2({
                    type: 'run_start',
                    workflowName: workflow.meta.name,
                    sessionId: this.options.sessionId,
                });
                dispatchV2({
                    type: 'resume',
                    checkpointId: runId,
                    nodeId: reconciliation?.nodeId,
                    status: 'reconciliation_required',
                });
                dispatchV2({ type: 'done', result });
                callbacks.onComplete?.(result as any);
                this.running = false;
                this.activeV2Emitter = null;
                return result;
            }
        }

        const startTime = Date.now();
        emit({
            type: 'run_start',
            workflowName: workflow.meta.name,
            sessionId: this.options.sessionId,
            at: startTime,
        });
        if (resumeFrom) {
            this.activeV2Emitter?.({
                type: 'resume',
                checkpointId:
                    this.options.runId ?? 'resume-snapshot',
                nodeId: resumeFrom.startNodeId,
                status: 'running',
            });
        }
        const nodeOutputs: Record<string, string> = resumeFrom?.nodeOutputs
            ? { ...resumeFrom.nodeOutputs }
            : {};
        const nodeValues: Record<string, import('./gateway/types').JsonValue> =
            resumeFrom?.nodeValues ? { ...resumeFrom.nodeValues } : {};
        const executionOrder: string[] = resumeFrom?.executionOrder
            ? [...resumeFrom.executionOrder]
            : [];
        let lastActiveNodeId: string | undefined = resumeFrom?.lastActiveNodeId;
        let finalNodeId: string | undefined = resumeFrom?.finalNodeId;
        let finalOutput = resumeFrom?.resumeInput || '';
        let sessionMessages: ChatMessage[] = [];
        let activeWaveNodeIds: string[] = [];
        const persistRunStatus = async (
            status: import('./runstore').RunStatus,
            pendingNodes: string[],
            scheduledNodes: string[] = [],
            transcript: ChatMessage[] = sessionMessages,
            subflowPath: string[] =
                resumeFrom?.subflowPath ??
                this.options._subflowPath ??
                [],
            reconciliation?: import('./runstore').ReconciliationState
        ): Promise<void> => {
            if (!persistWaves || !runStore || !runId) return;
            await persistWaveBoundary(runStore, {
                runId,
                status,
                workflowId: workflow.meta.id ?? workflow.meta.name,
                workflowVersion: workflow.meta.version,
                pendingNodes,
                scheduledNodes,
                completedNodes: [...executionOrder],
                nodeOutputs: { ...nodeOutputs },
                nodeValues:
                    Object.keys(nodeValues).length > 0
                        ? { ...nodeValues }
                        : undefined,
                transcript: [...transcript],
                subflowPath: [...subflowPath],
                reconciliation,
            });
        };

        const configuredStopPolicy =
            mergeStopPolicies(
                workflow.meta.execution?.stopPolicy,
                this.options.stopPolicy
            ) ?? {};

        const assertBudget = () => {
            const check = checkStopPolicy(
                configuredStopPolicy,
                this.stopPolicyState!
            );
            if (check.exceeded) {
                emit({
                    type: 'budget',
                    reason: check.reason,
                    tokensUsed: this.stopPolicyState!.tokens,
                    stepsUsed: this.stopPolicyState!.steps,
                    durationMs: Date.now() - this.stopPolicyState!.startedAt,
                    at: Date.now(),
                });
                throw new BudgetExceededError(check.reason, check.message);
            }
        };

        const recordLlmStep = (tokens?: number, costUsd?: number) => {
            if (!this.stopPolicyState) return;
            this.stopPolicyState.steps += 1;
            if (typeof tokens === 'number' && tokens > 0) {
                this.stopPolicyState.tokens += tokens;
            }
            if (typeof costUsd === 'number' && costUsd >= 0) {
                this.stopPolicyState.costUsd += costUsd;
            }
            // Enforce duration/token budgets immediately; maxSteps is checked
            // at the start of the next LLM call via assertBudget.
            const policy = configuredStopPolicy;
            const check = checkStopPolicy(
                {
                    maxDurationMs: policy.maxDurationMs,
                    maxTokens: policy.maxTokens,
                    maxCostUsd: policy.maxCostUsd,
                },
                this.stopPolicyState
            );
            if (check.exceeded) {
                emit({
                    type: 'budget',
                    reason: check.reason,
                    tokensUsed: this.stopPolicyState.tokens,
                    stepsUsed: this.stopPolicyState.steps,
                    durationMs: Date.now() - this.stopPolicyState.startedAt,
                    at: Date.now(),
                });
                throw new BudgetExceededError(check.reason, check.message);
            }
        };
        this.assertBudgetFn = assertBudget;
        this.recordLlmStepFn = recordLlmStep;

        try {
            // Preflight validation (enabled by default)
            if (this.options.preflight !== false) {
                const validationContext: ValidationContext = {
                    subflowRegistry: this.options.subflowRegistry,
                    defaultModel: this.options.defaultModel,
                    extensionRegistry,
                };

                const validation = validateWorkflow(
                    workflow.nodes,
                    workflow.edges,
                    validationContext,
                    {
                        strictDataValidation:
                            this.options.strictDataValidation,
                    }
                );

                if (!validation.isValid) {
                    const errorMessages = validation.errors
                        .map(
                            (e) =>
                                `${e.code}: ${e.message}${
                                    e.nodeId
                                        ? ` (node: ${e.nodeId})`
                                        : ''
                                }`
                        )
                        .join('; ');

                    const validationError = createExecutionError(
                        new Error(
                            `Workflow validation failed: ${errorMessages}`
                        ),
                        '',
                        '',
                        undefined,
                        1,
                        1,
                        []
                    );

                    callbacks.onNodeError('', validationError);
                    await persistRunStatus('failed', []);

                    const result = this.buildExecutionResult(
                        false,
                        '',
                        '',
                        undefined,
                        [],
                        undefined,
                        {},
                        sessionMessages,
                        startTime,
                        validationError
                    );
                    emit({
                        type: 'done',
                        result,
                        at: Date.now(),
                    });
                    callbacks.onComplete?.(result as any);
                    return result;
                }
            }

            const graph = this.buildGraph(workflow.nodes, workflow.edges);

            // Find start node
            const startNode = workflow.nodes.find((n) => n.type === 'start');
            if (!startNode?.id) {
                throw new Error('No start node found in workflow');
            }

            // Initialize execution context
            const session = new ExecutionSession(this.options.sessionId);
            if (resumeFrom?.sessionMessages?.length) {
                session.messages.push(...resumeFrom.sessionMessages);
            } else {
                session.addMessage({ role: 'user', content: input.text });
            }

            const context: InternalExecutionContext = {
                input: input.text,
                currentInput:
                    resumeFrom?.resumeInput ||
                    (resumeFrom?.lastActiveNodeId
                        ? (resumeFrom.nodeOutputs?.[
                              resumeFrom.lastActiveNodeId
                          ] ?? input.text)
                        : input.text),
                originalInput: input.text,
                attachments: input.attachments || [],
                outputs: { ...(resumeFrom?.nodeOutputs || {}) },
                values: nodeValues,
                nodeChain: resumeFrom?.executionOrder
                    ? [...resumeFrom.executionOrder]
                    : [],
                nodePath:
                    resumeFrom?.subflowPath?.length
                        ? [...resumeFrom.subflowPath]
                        : this.options._subflowPath
                          ? [...this.options._subflowPath]
                          : [],
                signal: this.abortController.signal,
                session,
                memory: this.memory,
                workflowName: workflow.meta.name,
            };

            sessionMessages = context.session.messages;

            // BFS execution through the graph
            const startNodeId = resumeFrom?.startNodeId ?? startNode.id;
            const queue: string[] =
                resumeFrom?.pendingNodes && resumeFrom.pendingNodes.length > 0
                    ? [...resumeFrom.pendingNodes]
                    : [startNodeId];
            const rootNodeId = startNodeId;
            const executed = new Set<string>(
                resumeFrom ? Object.keys(resumeFrom.nodeOutputs || {}) : []
            );
            // Ensure resume targets are re-run (pending nodes not yet in outputs).
            if (resumeFrom) {
                for (const id of queue) {
                    executed.delete(id);
                }
            }
            const skipped = new Set<string>();
            // Per-node execution counter to prevent infinite loops
            const nodeExecutionCount = new Map<string, number>();
            const maxNodeExecutions = this.options.maxNodeExecutions ?? 100;
            // Use configured maxIterations or calculate from node count
            const maxIterations =
                this.options.maxIterations ??
                workflow.nodes.length * MAX_ITERATIONS_MULTIPLIER;
            let iterations = 0;

            // Helper to propagate skip status
            const propagateSkip = (nodeId: string): void => {
                if (executed.has(nodeId)) return;

                // Check if all parents are resolved (executed or skipped)
                const parentIds = graph.parents[nodeId];
                if (!parentIds || parentIds.length === 0) {
                    // No parents means this is unreachable from executed nodes
                    return;
                }

                const allParentsResolved = parentIds.every((p) =>
                    executed.has(p)
                );

                if (allParentsResolved) {
                    executed.add(nodeId);
                    skipped.add(nodeId);

                    // Propagate to children
                    const children = graph.children[nodeId];
                    if (children) {
                        for (const child of children) {
                            propagateSkip(child.nodeId);
                        }
                    }
                }
            };

            // DAG-level parallel execution: execute all ready nodes concurrently
            // A node is "ready" when all its parents have been executed
            while (queue.length > 0) {
                // Check for cancellation
                if (this.abortController?.signal.aborted) {
                    throw new Error('Workflow cancelled');
                }

                // Find all ready nodes (nodes whose parents are all executed)
                const readyNodes: string[] = [];
                const deferredNodes: string[] = [];
                const readySet = new Set<string>();
                const deferredSet = new Set<string>();

                for (const nodeId of queue) {
                    // Skip if already executed
                    if (executed.has(nodeId)) continue;

                    // Check if all parents are executed (except for start node)
                    const parentIds = graph.parents[nodeId];
                    const allParentsExecuted =
                        !parentIds ||
                        parentIds.length === 0 ||
                        parentIds.every((p) => executed.has(p));

                    if (allParentsExecuted || nodeId === rootNodeId) {
                        if (!readySet.has(nodeId)) {
                            readySet.add(nodeId);
                            readyNodes.push(nodeId);
                        }
                    } else if (!deferredSet.has(nodeId)) {
                        deferredSet.add(nodeId);
                        deferredNodes.push(nodeId);
                    }
                }

                // A resume checkpoint from an older client may contain only
                // one member of a parallel wave. Recover any missing,
                // currently-ready prerequisites before declaring the graph
                // blocked. Waiting for dependencies is not an execution
                // iteration and must not consume the cycle guard.
                if (readyNodes.length === 0) {
                    if (deferredNodes.length > 0) {
                        const recoverableParents: string[] = [];
                        const recoverableSet = new Set<string>();
                        for (const deferredId of deferredNodes) {
                            for (const parentId of graph.parents[deferredId] ??
                                []) {
                                if (
                                    executed.has(parentId) ||
                                    recoverableSet.has(parentId)
                                ) {
                                    continue;
                                }
                                const grandparents =
                                    graph.parents[parentId] ?? [];
                                if (
                                    grandparents.length === 0 ||
                                    grandparents.every((id) => executed.has(id))
                                ) {
                                    recoverableSet.add(parentId);
                                    recoverableParents.push(parentId);
                                }
                            }
                        }
                        if (recoverableParents.length > 0) {
                            queue.length = 0;
                            queue.push(...recoverableParents, ...deferredNodes);
                            continue;
                        }

                        const blocked = deferredNodes
                            .map((nodeId) => {
                                const missing = (
                                    graph.parents[nodeId] ?? []
                                ).filter((parentId) => !executed.has(parentId));
                                return `${nodeId} (waiting for ${missing.join(', ') || 'an unreachable dependency'})`;
                            })
                            .join('; ');
                        throw new Error(
                            `Workflow cannot continue because nodes have unresolved dependencies: ${blocked}`
                        );
                    }
                    break; // No more nodes to execute
                }

                if (iterations >= maxIterations) {
                    throw new Error(
                        `Workflow exceeded ${maxIterations} execution waves. Check loop nodes or graph cycles.`
                    );
                }
                iterations++;

                // Clear queue and add back deferred nodes
                queue.length = 0;
                queue.push(...deferredNodes);

                // Mark all ready nodes as executing (prevents re-queueing during concurrent execution)
                for (const nodeId of readyNodes) {
                    executed.add(nodeId);

                    // Track node execution count as circuit breaker
                    const execCount = (nodeExecutionCount.get(nodeId) || 0) + 1;
                    nodeExecutionCount.set(nodeId, execCount);

                    // Check if this node has been executed too many times (circuit breaker)
                    if (execCount > maxNodeExecutions) {
                        throw new Error(
                            `Node "${nodeId}" exceeded maximum executions (${maxNodeExecutions}). ` +
                                'This likely indicates an infinite loop. Check your workflow for cycles.'
                        );
                    }
                }

                // Execute all ready nodes concurrently
                const scheduledThisWave = [...readyNodes];
                activeWaveNodeIds = scheduledThisWave;
                const waveAbortController = new AbortController();
                const abortWaveFromParent = () => {
                    waveAbortController.abort(
                        context.signal.reason ?? new Error('Workflow cancelled')
                    );
                };
                if (context.signal.aborted) abortWaveFromParent();
                else {
                    context.signal.addEventListener(
                        'abort',
                        abortWaveFromParent,
                        {
                            once: true,
                        }
                    );
                }
                const waveContext: InternalExecutionContext = {
                    ...context,
                    signal: waveAbortController.signal,
                };
                let primaryWaveError: unknown;
                const executeNode = async (
                    nodeId: string
                ): Promise<{
                    nodeId: string;
                    result: {
                        output: string;
                        nextNodes: string[];
                        value?: import('./gateway/types').JsonValue;
                    };
                }> => {
                    try {
                        const result = await this.executeNodeWithErrorHandling(
                            nodeId,
                            waveContext,
                            graph,
                            workflow.edges,
                            callbacks
                        );
                        return { nodeId, result };
                    } catch (error) {
                        primaryWaveError ??= error;
                        if (!waveAbortController.signal.aborted) {
                            waveAbortController.abort(error);
                        }
                        throw error;
                    }
                };

                const settled = await Promise.allSettled(
                    readyNodes.map(executeNode)
                );
                context.signal.removeEventListener(
                    'abort',
                    abortWaveFromParent
                );
                if (primaryWaveError !== undefined) {
                    throw primaryWaveError;
                }
                const results = settled.map((result) => {
                    if (result.status === 'rejected') throw result.reason;
                    return result.value;
                });

                // Process results in readyNodes order (deterministic)
                for (const { nodeId, result } of results) {
                    // Store output
                    nodeOutputs[nodeId] = result.output;
                    if (result.value !== undefined) {
                        nodeValues[nodeId] = result.value;
                    }
                    context.outputs[nodeId] = result.output;
                    finalOutput = result.output;
                    finalNodeId = nodeId;
                    executionOrder.push(nodeId);
                    lastActiveNodeId = nodeId;

                    // Handle skipped nodes (children not in nextNodes) - except while loops which manage their own control flow
                    const currentNode = graph.nodeMap.get(nodeId);
                    if (currentNode?.type !== 'whileLoop') {
                        const allChildren = graph.children[nodeId];
                        if (allChildren) {
                            for (const child of allChildren) {
                                if (!result.nextNodes.includes(child.nodeId)) {
                                    propagateSkip(child.nodeId);
                                }
                            }
                        }
                    }

                    // Queue next nodes
                    for (const nextId of result.nextNodes) {
                        if (!executed.has(nextId) || nextId === nodeId) {
                            queue.push(nextId);
                        }
                    }

                    // Allow re-entry for loop nodes that intentionally re-queue themselves
                    if (result.nextNodes.includes(nodeId)) {
                        executed.delete(nodeId);
                    }
                }

                // Optional auto-checkpoint after each successful wave
                if (
                    this.options.autoCheckpoint &&
                    this.options.checkpointAdapter
                ) {
                    const autoCp: WorkflowCheckpoint = {
                        id: createCheckpointId(),
                        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
                        workflowId: context.workflowName,
                        sessionId: context.session.id,
                        createdAt: Date.now(),
                        status: 'running',
                        nodeOutputs: { ...nodeOutputs },
                        executionOrder: [...executionOrder],
                        lastActiveNodeId,
                        sessionMessages: [...context.session.messages],
                        resumeInput: finalOutput,
                        startNodeId: lastActiveNodeId,
                    };
                    await this.options.checkpointAdapter.save(autoCp);
                    this.activeV2Emitter?.(
                        {
                            type: 'checkpoint',
                            checkpointId: autoCp.id,
                            nodeId: lastActiveNodeId,
                            status: autoCp.status,
                        },
                        context.nodePath
                    );
                }

                // Durable RunStore wave snapshot (R7.AC1, R7.AC2): pending,
                // scheduled, completed, transcript, and nested path.
                if (persistWaves && runStore && runId) {
                    const pendingUnique: string[] = [];
                    const pendingSeen = new Set<string>();
                    for (const id of queue) {
                        if (executed.has(id) || pendingSeen.has(id)) continue;
                        pendingSeen.add(id);
                        pendingUnique.push(id);
                    }
                    await persistWaveBoundary(runStore, {
                        runId,
                        status: 'running',
                        workflowId: workflow.meta.id ?? workflow.meta.name,
                        workflowVersion: workflow.meta.version,
                        pendingNodes: pendingUnique,
                        scheduledNodes: scheduledThisWave,
                        completedNodes: [...executionOrder],
                        nodeOutputs: { ...nodeOutputs },
                        nodeValues:
                            Object.keys(nodeValues).length > 0
                                ? { ...nodeValues }
                                : undefined,
                        transcript: [...context.session.messages],
                        subflowPath: [...context.nodePath],
                    });
                    this.activeV2Emitter?.(
                        {
                            type: 'checkpoint',
                            checkpointId: runId,
                            nodeId: lastActiveNodeId,
                            status: 'running',
                        },
                        context.nodePath
                    );
                }
                activeWaveNodeIds = [];
            }

            if (finalOutput) {
                const messages = context.session.messages;
                const lastMessage = messages[messages.length - 1];
                const shouldAddMessage =
                    !lastMessage ||
                    lastMessage.role !== 'assistant' ||
                    lastMessage.content !== finalOutput;

                if (shouldAddMessage) {
                    context.session.addMessage({
                        role: 'assistant',
                        content: finalOutput,
                    });
                }
            }

            await persistRunStatus(
                'completed',
                [],
                [],
                context.session.messages,
                context.nodePath
            );

            const result = this.buildExecutionResult(
                true,
                finalOutput,
                finalOutput,
                finalNodeId,
                executionOrder,
                lastActiveNodeId,
                nodeOutputs,
                context.session.messages,
                startTime
            );
            emit({ type: 'done', result, at: Date.now() });
            callbacks.onComplete?.(result as any);
            return result;
        } catch (error) {
            if (isWorkflowPausedError(error)) {
                await persistRunStatus('paused', [
                    error.hitlRequest.nodeId,
                ]);
                const pausedResult = this.buildExecutionResult(
                    false,
                    '',
                    '',
                    finalNodeId,
                    executionOrder,
                    lastActiveNodeId,
                    nodeOutputs,
                    sessionMessages.length
                        ? sessionMessages
                        : error.checkpoint.sessionMessages,
                    startTime,
                    undefined,
                    {
                        paused: true,
                        checkpointId: error.checkpoint.id,
                        hitlRequest: error.hitlRequest,
                        pause: {
                            type: 'hitl',
                            resumeToken: error.checkpoint.id,
                            reason: `HITL on node ${error.hitlRequest.nodeId}`,
                            hitlRequest: error.hitlRequest,
                        },
                    }
                );
                emit({
                    type: 'hitl_pause',
                    request: error.hitlRequest,
                    checkpointId: error.checkpoint.id,
                    resumeToken: error.checkpoint.id,
                    at: Date.now(),
                });
                emit({ type: 'done', result: pausedResult, at: Date.now() });
                callbacks.onComplete?.(pausedResult as any);
                return pausedResult;
            }

            if (isBudgetExceededError(error)) {
                const budgetCheckpoint: WorkflowCheckpoint = {
                    id: createCheckpointId(),
                    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
                    workflowId: workflow.meta.name,
                    sessionId: this.options.sessionId || 'anonymous',
                    createdAt: Date.now(),
                    status: 'paused',
                    nodeOutputs: { ...nodeOutputs },
                    executionOrder: [...executionOrder],
                    lastActiveNodeId,
                    sessionMessages: [...sessionMessages],
                    resumeInput: finalOutput,
                    startNodeId: lastActiveNodeId,
                    pauseReason: 'budget',
                };
                if (this.options.checkpointAdapter) {
                    await this.options.checkpointAdapter.save(budgetCheckpoint);
                }
                await persistRunStatus(
                    'paused',
                    lastActiveNodeId ? [lastActiveNodeId] : []
                );
                const budgetResult = this.buildExecutionResult(
                    false,
                    finalOutput,
                    finalOutput,
                    finalNodeId,
                    executionOrder,
                    lastActiveNodeId,
                    nodeOutputs,
                    sessionMessages,
                    startTime,
                    error,
                    {
                        paused: true,
                        checkpointId: budgetCheckpoint.id,
                        pause: {
                            type: 'budget',
                            resumeToken: budgetCheckpoint.id,
                            reason: error.message,
                        },
                    }
                );
                emit({
                    type: 'budget',
                    reason: error.reason,
                    tokensUsed: this.stopPolicyState?.tokens,
                    stepsUsed: this.stopPolicyState?.steps,
                    durationMs: this.stopPolicyState
                        ? Date.now() - this.stopPolicyState.startedAt
                        : undefined,
                    at: Date.now(),
                });
                emit({ type: 'done', result: budgetResult, at: Date.now() });
                callbacks.onComplete?.(budgetResult as any);
                return budgetResult;
            }

            if (isToolReconciliationRequiredError(error)) {
                const reconciliation = {
                    reason: error.message,
                    callId: error.intent.callId,
                    toolName: error.intent.toolName,
                    nodeId: error.intent.nodeId,
                    sideEffect: error.intent.sideEffect,
                    idempotencyKey: error.intent.idempotencyKey,
                    at: Date.now(),
                };
                await persistRunStatus(
                    'reconciliation_required',
                    [error.intent.nodeId],
                    [],
                    sessionMessages,
                    resumeFrom?.subflowPath ??
                        this.options._subflowPath ??
                        [],
                    reconciliation
                );
                const pausedResult = this.buildExecutionResult(
                    false,
                    finalOutput,
                    finalOutput,
                    finalNodeId,
                    executionOrder,
                    lastActiveNodeId,
                    nodeOutputs,
                    sessionMessages,
                    startTime,
                    undefined,
                    {
                        paused: true,
                        pause: {
                            type: 'reconciliation',
                            resumeToken:
                                this.options.runId ?? error.intent.runId,
                            reason: error.message,
                        },
                    }
                );
                emit({ type: 'done', result: pausedResult, at: Date.now() });
                callbacks.onComplete?.(pausedResult as any);
                return pausedResult;
            }

            const err =
                error instanceof Error ? error : new Error(String(error));
            await persistRunStatus(
                'failed',
                activeWaveNodeIds.length > 0
                    ? activeWaveNodeIds
                    : lastActiveNodeId
                      ? [lastActiveNodeId]
                      : []
            );
            const result = this.buildExecutionResult(
                false,
                '',
                '',
                finalNodeId,
                executionOrder,
                lastActiveNodeId,
                nodeOutputs,
                sessionMessages,
                startTime,
                err
            );
            emit({ type: 'done', result, at: Date.now() });
            callbacks.onComplete?.(result as any);
            return result;
        } finally {
            this.running = false;
            this.assertBudgetFn = null;
            this.recordLlmStepFn = null;
            this.activeV2Emitter = null;
        }
    }

    private emitLegacyEvent(event: WorkflowEvent, path: string[] = []): void {
        if (this.activeV2Emitter) {
            const { at: _at, ...withoutTimestamp } = event;
            this.activeV2Emitter(
                withoutTimestamp as WorkflowEventV2,
                path
            );
            return;
        }
        safeEmitEvent(this.options.onEvent, event);
    }

    /**
     * Build an execution result object with common fields.
     */
    private buildExecutionResult(
        success: boolean,
        output: string,
        finalOutput: string,
        finalNodeId: string | undefined,
        executionOrder: string[],
        lastActiveNodeId: string | undefined,
        nodeOutputs: Record<string, string>,
        sessionMessages: ChatMessage[],
        startTime: number,
        error?: Error,
        extras?: {
            paused?: boolean;
            checkpointId?: string;
            hitlRequest?: HITLRequest;
            pause?: ExecutionResult['pause'];
        }
    ): ExecutionResult {
        const usage = this.getTokenUsageSummary();
        const tokenUsageDetails = this.tokenUsageEvents.map((entry) => ({
            nodeId: entry.nodeId,
            ...entry.usage,
        }));
        return {
            success,
            output,
            finalOutput,
            finalNodeId,
            executionOrder,
            lastActiveNodeId,
            nodeOutputs,
            sessionMessages: [...sessionMessages],
            error,
            duration: Date.now() - startTime,
            usage,
            tokenUsageDetails,
            modelCalls: [...this.modelCalls],
            costUsd:
                this.modelCalls.some(
                    (call) => call.usage?.costUsd !== undefined
                )
                    ? this.modelCalls.reduce(
                          (sum, call) =>
                              sum + (call.usage?.costUsd ?? 0),
                          0
                      )
                    : undefined,
            paused: extras?.paused,
            checkpointId: extras?.checkpointId,
            hitlRequest: extras?.hitlRequest,
            pause: extras?.pause,
        };
    }

    /**
     * Stop the current execution.
     * Aborts the shared AbortController but keeps it so traversal guards
     * (`this.abortController?.signal.aborted`) keep seeing the aborted state
     * until the next `execute()` creates a fresh controller.
     */
    stop(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.running = false;
        // Clear token usage events to prevent memory buildup
        this.tokenUsageEvents = [];
    }

    /**
     * Check if execution is currently running.
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Get model capabilities for a given model ID.
     */
    async getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        return (
            (await this.gateway.getModelCapabilities(modelId)) ??
            (await this.provider.getModelCapabilities?.(modelId)) ??
            null
        );
    }

    /**
     * Check if a model supports a specific input modality.
     *
     * @param modelId - The model identifier.
     * @param modality - The input modality to check ('text', 'image', 'audio', etc.).
     * @returns True if the model supports the modality.
     */
    async supportsModality(
        modelId: string,
        modality: InputModality
    ): Promise<boolean> {
        const capabilities = await this.getModelCapabilities(modelId);
        if (!capabilities) return modality === 'text'; // Default to text only
        return capabilities.inputModalities.includes(modality);
    }

    // ==========================================================================
    // Graph Building
    // ==========================================================================

    /**
     * Build a graph structure from nodes and edges for traversal.
     */
    private buildGraph(
        nodes: WorkflowNode[],
        edges: WorkflowEdge[]
    ): WorkflowGraph {
        const nodeMap = new Map<string, WorkflowNode>();
        const children: Record<
            string,
            Array<{ nodeId: string; handleId?: string }>
        > = {};
        const parents: Record<string, string[]> = {};
        const inboundEdges: Record<string, WorkflowEdge[]> = {};

        // First pass: build node map and initialize edge arrays
        for (const node of nodes) {
            nodeMap.set(node.id, node);
            children[node.id] = [];
            parents[node.id] = [];
            inboundEdges[node.id] = [];
        }

        // Second pass: build edges (with validation)
        for (const edge of edges) {
            // Validate edge refers to existing nodes
            if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
                if (this.options.debug) {
                    console.warn(
                        `Skipping edge ${edge.id}: references non-existent node (source: ${edge.source}, target: ${edge.target})`
                    );
                }
                continue;
            }

            // These are guaranteed to exist after initialization loop
            children[edge.source]!.push({
                nodeId: edge.target,
                handleId: edge.sourceHandle || undefined,
            });
            // Only add parent if not already present (handles multiple edges from same source)
            if (!parents[edge.target]!.includes(edge.source)) {
                parents[edge.target]!.push(edge.source);
            }
            inboundEdges[edge.target]!.push(edge);
        }

        return { nodeMap, children, parents, inboundEdges };
    }

    // ==========================================================================
    // Node Execution
    // ==========================================================================

    /**
     * Execute a single node in the workflow.
     */
    private async executeNodeInternal(
        nodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[]; value?: import('./gateway/types').JsonValue }> {
        const node = graph.nodeMap.get(nodeId);
        if (!node) return { output: '', nextNodes: [] };
        const nodeData = node.data as unknown as Record<string, unknown>;
        const meta = {
            id: nodeId,
            label: getNodeLabel(node),
            type: node?.type,
            path: context.nodePath.length ? [...context.nodePath] : undefined,
        } satisfies Partial<NodeExecutionMetadata>;

        callbacks.onNodeStart(nodeId, meta);
        this.emitLegacyEvent({
            type: 'node_start',
            nodeId,
            meta: meta as NodeExecutionMetadata,
            at: Date.now(),
        }, context.nodePath);

        // Look up extension
        const extension = extensionRegistry.get(node.type);
        if (!extension) {
            throw new Error(`No extension found for node type: ${node.type}`);
        }

        if (!extension.execute) {
            throw new Error(
                `Extension for ${node.type} does not implement execute()`
            );
        }

        // Apply context compaction for nodes that use LLM with history
        let historyMessages = context.session.messages;
        if (
            OpenRouterExecutionAdapter.LLM_NODE_TYPES.has(node.type) &&
            this.options.compaction
        ) {
            const model =
                (
                    nodeData.modelRequest as
                        | { models?: string[] }
                        | undefined
                )?.models?.[0] ||
                (typeof nodeData.model === 'string' ? nodeData.model : null) ||
                (typeof nodeData.conditionModel === 'string'
                    ? nodeData.conditionModel
                    : null) ||
                this.options.defaultModel ||
                DEFAULT_MODEL;
            const compactionResult = await this.compactHistoryIfNeeded(
                historyMessages,
                model,
                callbacks,
                nodeId
            );
            historyMessages = compactionResult.messages;
            // Update session messages if compacted
            if (compactionResult.result?.compacted) {
                context.session.messages.length = 0;
                context.session.messages.push(...historyMessages);
            }
        }

        // Construct ExecutionContext for extension
        // Resolve input from parent outputs (not shared mutable currentInput)
        // so concurrent DAG waves don't race on a single field.
        const executionContext: ExecutionContext = {
            input: this.resolveNodeInput(nodeId, context, graph),
            value: this.resolveNodeValue(nodeId, context, graph),
            history: historyMessages,
            memory: this.memory,
            attachments: context.attachments,
            outputs: context.outputs,
            nodeChain: context.nodeChain,
            signal: context.signal,
            sessionId: context.session.id,
            customEvaluators: this.options.customEvaluators,
            debug: this.options.debug,
            defaultModel: this.options.defaultModel,
            subflowRegistry: this.options.subflowRegistry,
            subflowDepth: this.options._subflowDepth ?? 0,
            maxSubflowDepth: this.options.maxSubflowDepth ?? 10,
            tools: this.options.tools,
            workflowTools: this.options.workflowTools,
            toolExecutionPolicy: this.options.toolExecutionPolicy,
            toolApprovalGate: this.options.toolApprovalGate,
            toolReconciler: this.options.toolReconciler,
            parallelToolCalls: this.options.parallelToolCalls,
            permissions: Array.isArray(nodeData.permissions)
                ? (nodeData.permissions as string[])
                : undefined,
            modelGateway: this.gateway,
            agentBackends: this.options.agentBackends,
            createModelCallId: (callNodeId) =>
                `${this.options.runId ?? context.session.id}:model:${++this.modelCallSequence}:${callNodeId}`,
            onModelCallStart: (callId, callNodeId, request) => {
                this.modelCalls.push({
                    callId,
                    nodeId: callNodeId,
                    requestedModels: [...request.models],
                    transport: request.transport ?? 'chat',
                });
                this.activeV2Emitter?.(
                    {
                        type: 'model_start',
                        callId,
                        nodeId: callNodeId,
                        requestedModels: [...request.models],
                        transport: request.transport ?? 'chat',
                    },
                    context.nodePath
                );
            },
            onModelCallFinish: (callId, callNodeId, request, result) => {
                const record =
                    this.modelCalls.find((item) => item.callId === callId) ??
                    ({
                        callId,
                        nodeId: callNodeId,
                        requestedModels: [...request.models],
                        transport: request.transport ?? 'chat',
                    } satisfies ModelCallRecord);
                Object.assign(record, {
                    actualModel: result.actualModel,
                    provider: result.provider,
                    finishReason: result.finishReason,
                    usage: result.usage,
                    identifiers: result.identifiers,
                    timing: result.timing,
                    annotations: result.annotations,
                });
                if (!this.modelCalls.includes(record)) {
                    this.modelCalls.push(record);
                }
                this.activeV2Emitter?.(
                    {
                        type: 'model_finish',
                        callId,
                        nodeId: callNodeId,
                        actualModel: result.actualModel,
                        provider: result.provider,
                        finishReason: result.finishReason,
                        usage: result.usage,
                        identifiers: result.identifiers,
                        timing: result.timing,
                        annotations: result.annotations,
                    },
                    context.nodePath
                );
            },
            onModelCallError: (callId, callNodeId, request, error) => {
                const record =
                    this.modelCalls.find((item) => item.callId === callId) ??
                    ({
                        callId,
                        nodeId: callNodeId,
                        requestedModels: [...request.models],
                        transport: request.transport ?? 'chat',
                    } satisfies ModelCallRecord);
                record.error = {
                    name: error.name,
                    message: error.message,
                    retryable:
                        'retryable' in error &&
                        typeof error.retryable === 'boolean'
                            ? error.retryable
                            : undefined,
                    statusCode:
                        'statusCode' in error &&
                        typeof error.statusCode === 'number'
                            ? error.statusCode
                            : undefined,
                };
                if (!this.modelCalls.includes(record)) {
                    this.modelCalls.push(record);
                }
                this.activeV2Emitter?.(
                    {
                        type: 'model_error',
                        callId,
                        nodeId: callNodeId,
                        requestedModels: [...request.models],
                        transport: request.transport ?? 'chat',
                        error,
                    },
                    context.nodePath
                );
            },
            onToolIntent: (intent: ToolIntent) => {
                this.activeV2Emitter?.(
                    {
                        type: 'tool_intent',
                        callId: intent.callId,
                        toolName: intent.toolName,
                        nodeId: intent.nodeId,
                        status: intent.status,
                        sideEffect: intent.sideEffect,
                        idempotencyKey: intent.idempotencyKey,
                    },
                    context.nodePath
                );
            },
            onToolApproval: (approval) => {
                this.activeV2Emitter?.(
                    { type: 'tool_approval', ...approval },
                    context.nodePath
                );
            },
            onToolReceipt: (receipt, reused) => {
                this.activeV2Emitter?.(
                    {
                        type: 'tool_receipt',
                        callId: receipt.callId,
                        toolName: receipt.toolName,
                        status: reused ? 'reused' : receipt.status,
                    },
                    context.nodePath
                );
            },
            runId: this.options.runId,
            runStore: this.options.runStore,
            maxToolIterations: this.options.maxToolIterations,
            onMaxToolIterations: this.options.onMaxToolIterations,
            onHITLRequest: this.options.onHITLRequest,
            workflowName: context.workflowName,
            tokenCounter: this.tokenCounter,
            compaction: this.options.compaction,
            onTokenUsage: (usage) => {
                if (callbacks.onTokenUsage) {
                    callbacks.onTokenUsage(nodeId, usage);
                }
                this.tokenUsageEvents.push({ nodeId, usage });
                this.emitLegacyEvent({
                    type: 'token_usage',
                    nodeId,
                    usage,
                    at: Date.now(),
                }, context.nodePath);
            },
            assertBudget: () => this.assertBudgetFn?.(),
            recordLlmStep: (tokens, costUsd) =>
                this.recordLlmStepFn?.(tokens, costUsd),

            onToken: (token: string) => {
                callbacks.onToken(nodeId, token);
                this.activeV2Emitter?.(
                    { type: 'token', nodeId, token },
                    context.nodePath
                );
                const isLeaf = (graph.children[nodeId] || []).length === 0;
                if (isLeaf && callbacks.onWorkflowToken) {
                    callbacks.onWorkflowToken(token, {
                        nodeId,
                        nodeLabel: meta.label,
                        nodeType: meta.type,
                        isFinalNode: true,
                    });
                }
            },

            onReasoning: callbacks.onReasoning
                ? (token: string) => {
                      callbacks.onReasoning!(nodeId, token);
                      this.activeV2Emitter?.(
                          { type: 'reasoning', nodeId, token },
                          context.nodePath
                      );
                  }
                : (token: string) => {
                      this.activeV2Emitter?.(
                          { type: 'reasoning', nodeId, token },
                          context.nodePath
                      );
                  },

            // Branch streaming callbacks for parallel nodes
            onBranchToken: callbacks.onBranchToken
                ? (branchId: string, branchLabel: string, token: string) => {
                      callbacks.onBranchToken!(
                          nodeId,
                          branchId,
                          branchLabel,
                          token
                      );
                  }
                : undefined,
            onBranchReasoning: callbacks.onBranchReasoning
                ? (branchId: string, branchLabel: string, token: string) => {
                      callbacks.onBranchReasoning!(
                          nodeId,
                          branchId,
                          branchLabel,
                          token
                      );
                  }
                : undefined,
            onBranchStart: callbacks.onBranchStart
                ? (branchId: string, branchLabel: string) => {
                      callbacks.onBranchStart!(
                          nodeId,
                          branchId,
                          branchLabel,
                          meta
                      );
                  }
                : undefined,
            onBranchComplete: callbacks.onBranchComplete
                ? (branchId: string, branchLabel: string, output: string) => {
                      callbacks.onBranchComplete!(
                          nodeId,
                          branchId,
                          branchLabel,
                          output,
                          meta
                      );
                  }
                : undefined,
            onLoopIteration: callbacks.onLoopIteration
                ? (iteration: number, maxIterations: number) => {
                      callbacks.onLoopIteration!(
                          nodeId,
                          iteration,
                          maxIterations,
                          meta
                      );
                  }
                : undefined,

            getNode: (id: string) => graph.nodeMap.get(id),

            getOutgoingEdges: (id: string, sourceHandle?: string) => {
                const outgoing = edges.filter((e) => e.source === id);
                if (sourceHandle) {
                    // If looking for a specific handle, match edges with that handle
                    // OR edges without a handle (which are considered default/output)
                    return outgoing.filter(
                        (e) =>
                            e.sourceHandle === sourceHandle || !e.sourceHandle
                    );
                }
                return outgoing;
            },

            onToolCall: this.options.onToolCall,
            onToolCallEvent: this.options.onToolCallEvent
                ? (event) => {
                      this.options.onToolCallEvent?.({
                          ...event,
                          nodeId,
                          nodeLabel: meta.label,
                          nodeType: meta.type,
                      });
                  }
                : undefined,

            executeSubgraph: async (
                startNodeId: string,
                input: string,
                options?: { nodeOverrides?: Record<string, any> }
            ) => {
                // Create isolated context for subgraph
                const subContext: InternalExecutionContext = {
                    ...context,
                    currentInput: input,
                    // inherit outputs/history/memory?
                    // Usually subgraphs share context but operate on new input.
                };

                // Handle node overrides for subgraph execution
                let subgraph = graph;
                if (options?.nodeOverrides) {
                    const modifiedNodeMap = new Map(graph.nodeMap);
                    for (const [id, overrides] of Object.entries(
                        options.nodeOverrides
                    )) {
                        const original = modifiedNodeMap.get(id);
                        if (original) {
                            modifiedNodeMap.set(id, {
                                ...original,
                                data: { ...original.data, ...overrides },
                            });
                        }
                    }
                    subgraph = { ...graph, nodeMap: modifiedNodeMap };
                }

                // Find the parent node that is calling executeSubgraph
                // We need to mark parent nodes as "executed" so their children can run
                // Start node is available via subgraph.nodeMap.get(startNodeId) if needed
                const preExecuted = new Set<string>();

                // Mark parent nodes of startNodeId as executed
                const parents = subgraph.parents[startNodeId] || [];
                for (const parentId of parents) {
                    preExecuted.add(parentId);
                }

                const result = await this.executeSubgraph(
                    startNodeId,
                    subContext,
                    subgraph,
                    edges,
                    callbacks,
                    preExecuted
                );
                return { output: result.output };
            },

            executeWorkflow: async (
                wf: WorkflowData,
                input: ExecutionInput,
                options?: Partial<ExecutionOptions>
            ) => {
                // Execute sub-workflow
                // We need to instantiate a new adapter or reuse current?
                // Reusing current is better to share state/cache/provider
                // But options might differ.
                // Creating a new adapter instance allows separate configuration.
                // But we want to share memory if configured.

                // For now, let's call `this.execute` recursively?
                // `this.execute` resets state (abortController, etc) which breaks parent execution if running on same instance!
                // `this.execute` calls `this.abortController = new AbortController()`.
                // So we MUST create a NEW adapter instance or refactor `execute` to not reset if it's a child.
                // Creating a new adapter is safer.

                // NOTE: provider is shared.
                // BUT provider in this class is LLMProvider. The constructor expects OpenRouter | LLMProvider.
                // So we can pass `this.provider`.

                const subflowPath = [...context.nodePath, nodeId];
                const subflowCallbacks = scopeExecutionCallbacks(
                    callbacks,
                    subflowPath
                );
                const baseOnToolCallEvent =
                    options?.onToolCallEvent ?? this.options.onToolCallEvent;
                const baseOnHITLRequest =
                    options?.onHITLRequest ?? this.options.onHITLRequest;

                const subAdapter = new OpenRouterExecutionAdapter(
                    this.gateway,
                    {
                        ...this.options,
                        ...options,
                        // Pass subflow registry
                        subflowRegistry: this.options.subflowRegistry,
                        _subflowPath: subflowPath,
                        // Propagate cancellation from parent into child adapter
                        _parentSignal: context.signal,
                        onToolCallEvent: baseOnToolCallEvent
                            ? (event) => {
                                  baseOnToolCallEvent({
                                      ...event,
                                      nodeId: scopeNodeId(
                                          event.nodeId,
                                          subflowPath
                                      ),
                                  });
                              }
                            : undefined,
                        onHITLRequest: baseOnHITLRequest
                            ? (request) => {
                                  return baseOnHITLRequest({
                                      ...request,
                                      nodeId: scopeNodeId(
                                          request.nodeId,
                                          subflowPath
                                      ),
                                  });
                              }
                            : undefined,
                    }
                );

                const subflowResult = await subAdapter.execute(
                    wf,
                    input,
                    subflowCallbacks
                );

                // Child adapters own their execution state, so their model
                // calls and token usage must be folded back into the parent
                // result explicitly. Keep nested records that are already
                // scoped and scope direct child records to this subflow node.
                for (const call of subflowResult.modelCalls ?? []) {
                    const scopedNodeId = call.nodeId.startsWith(
                        SUBFLOW_SCOPE_PREFIX
                    )
                        ? call.nodeId
                        : scopeNodeId(call.nodeId, subflowPath);
                    const scopedCallId = call.callId.startsWith(
                        SUBFLOW_SCOPE_PREFIX
                    )
                        ? call.callId
                        : scopeNodeId(call.callId, subflowPath);
                    this.modelCalls.push({
                        ...call,
                        callId: scopedCallId,
                        nodeId: scopedNodeId,
                    });
                }
                for (const detail of subflowResult.tokenUsageDetails ?? []) {
                    const { nodeId: detailNodeId, ...usage } = detail;
                    this.tokenUsageEvents.push({
                        nodeId: detailNodeId.startsWith(
                            SUBFLOW_SCOPE_PREFIX
                        )
                            ? detailNodeId
                            : scopeNodeId(detailNodeId, subflowPath),
                        usage,
                    });
                }

                return subflowResult;
            },
        };

        const result = await extension.execute(
            executionContext,
            node,
            this.provider
        );

        // Handle metadata/side-effects
        if (result.metadata?.selectedRoute) {
            this.activeV2Emitter?.(
                {
                    type: 'route_selected',
                    nodeId,
                    routeId: result.metadata.selectedRoute,
                },
                context.nodePath
            );
            if (callbacks.onRouteSelected) {
                callbacks.onRouteSelected(
                    nodeId,
                    result.metadata.selectedRoute,
                    meta
                );
            }
        }

        // Store branch outputs with composite keys for Parallel Split nodes
        // This allows Output nodes to reference individual branches via "parallelNodeId:branchId"
        if (result.metadata?.branchOutputs) {
            const branchOutputs = result.metadata.branchOutputs as Record<
                string,
                string
            >;
            for (const [branchId, branchOutput] of Object.entries(
                branchOutputs
            )) {
                context.outputs[`${nodeId}:${branchId}`] = branchOutput;
            }
        }

        // Update context
        context.outputs[nodeId] = result.output;
        if (!context.nodeChain.includes(nodeId)) {
            context.nodeChain.push(nodeId);
        }
        // Keep currentInput as a fallback for nodes with no parents (e.g. start
        // children). Downstream nodes prefer parent outputs via resolveNodeInput.
        context.currentInput = result.output;

        // Defer session history updates to the wave processor so concurrent
        // agent nodes in the same ready-wave don't interleave message order.
        // (See processWaveResults in execute().)

        callbacks.onNodeFinish(nodeId, result.output, meta);
        this.emitLegacyEvent({
            type: 'node_finish',
            nodeId,
            output: result.output,
            meta: meta as NodeExecutionMetadata,
            at: Date.now(),
        }, context.nodePath);
        return {
            output: result.output,
            nextNodes: result.nextNodes,
            value: result.value as import('./gateway/types').JsonValue | undefined,
        };
    }

    /**
     * Resolve a node's input from its parents' outputs.
     * Falls back to shared currentInput when the node has no executed parents
     * (start node / resume edge cases).
     */
    private resolveNodeInput(
        nodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph
    ): string {
        const inbound = graph.inboundEdges[nodeId];
        if (!inbound || inbound.length === 0) {
            return context.currentInput;
        }

        type Contribution = {
            parentId: string;
            output: string;
            mapping?: EdgeInputMapping;
        };

        const contributions: Contribution[] = [];
        for (const edge of inbound) {
            const output = context.outputs[edge.source];
            if (typeof output !== 'string') continue;
            const edgeData = edge.data as EdgeData | undefined;
            contributions.push({
                parentId: edge.source,
                output,
                mapping: edgeData?.inputMapping,
            });
        }

        if (contributions.length === 0) {
            return context.currentInput;
        }

        const picks = contributions.filter((c) => c.mapping?.mode === 'pick');
        if (picks.length > 0) {
            return picks.map((p) => p.output).join('\n\n');
        }

        const templateContrib = contributions.find(
            (c) => c.mapping?.mode === 'template'
        );
        if (
            templateContrib &&
            templateContrib.mapping?.mode === 'template'
        ) {
            return interpolateEdgeTemplate(
                templateContrib.mapping.template,
                context.outputs,
                context.currentInput
            );
        }

        const hasJson = contributions.some((c) => c.mapping?.mode === 'json');
        if (hasJson) {
            const obj: Record<string, string> = {};
            for (const c of contributions) {
                const key =
                    c.mapping?.mode === 'json'
                        ? (c.mapping.key ?? c.parentId)
                        : c.parentId;
                obj[key] = c.output;
            }
            return JSON.stringify(obj);
        }

        const concatMapping = contributions.find(
            (c) => c.mapping?.mode === 'concat'
        )?.mapping;
        const separator =
            concatMapping && concatMapping.mode === 'concat'
                ? (concatMapping.separator ?? '\n\n')
                : '\n\n';

        if (contributions.length === 1) {
            return contributions[0]!.output;
        }
        return contributions.map((c) => c.output).join(separator);
    }

    /**
     * Resolve a typed input without changing the legacy string-input contract.
     * A typed value is unambiguous only for a single inbound source.
     */
    private resolveNodeValue(
        nodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph
    ): import('./gateway/types').JsonValue | undefined {
        const inbound = graph.inboundEdges[nodeId];
        if (!inbound || inbound.length !== 1) return undefined;
        return context.values[inbound[0]!.source];
    }
    private getTokenUsageSummary(): TokenUsage | undefined {
        if (this.tokenUsageEvents.length === 0) {
            return undefined;
        }

        let promptTokens = 0;
        let completionTokens = 0;

        for (const entry of this.tokenUsageEvents) {
            promptTokens += entry.usage.promptTokens;
            completionTokens += entry.usage.completionTokens;
        }

        return {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
        };
    }

    /**
     * Execute a node with retry/error-handling semantics and HITL support.
     */
    private async executeNodeWithErrorHandling(
        nodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[]; value?: import('./gateway/types').JsonValue }> {
        const node = graph.nodeMap.get(nodeId);
        if (!node) {
            // Early return for missing node
            return { output: '', nextNodes: [] };
        }

        const nodeLabel = getNodeLabel(node);
        const meta = {
            id: nodeId,
            label: nodeLabel,
            type: node.type,
            path: context.nodePath.length ? [...context.nodePath] : undefined,
        } satisfies Partial<NodeExecutionMetadata>;

        const nodeData = node.data as unknown as Record<string, unknown>;
        const errorConfig = nodeData?.errorHandling as
            | NodeErrorConfig
            | undefined;
        const retryConfig = errorConfig?.retry;
        const resolvedRetry: NodeRetryConfig | undefined =
            retryConfig ??
            (this.options.maxRetries !== undefined
                ? {
                      maxRetries: this.options.maxRetries,
                      baseDelay:
                          this.options.retryDelayMs || DEFAULT_RETRY_DELAY_MS,
                  }
                : undefined);
        const errorEdge = edges.find(
            (e) => e.source === nodeId && e.sourceHandle === 'error'
        );

        // Check if this node type supports HITL
        const hitlConfig = nodeData?.hitl as HITLConfig | undefined;
        const supportsHITL =
            OpenRouterExecutionAdapter.HITL_SUPPORTED_TYPES.has(node.type);
        const shouldUseHITL =
            supportsHITL &&
            hitlConfig?.enabled &&
            !!(
                this.options.onHITLRequest ||
                this.options.durableHITL ||
                this.options.hitlAdapter
            );

        let lastError: ExecutionError | null = null;
        const retryHistory: Array<{
            attempt: number;
            error: string;
            timestamp: string;
        }> = [];
        const maxAttempts = (resolvedRetry?.maxRetries ?? 0) + 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Use HITL wrapper for supported nodes with HITL enabled
                if (shouldUseHITL) {
                    return await this.executeWithHITL(
                        node,
                        context,
                        graph,
                        edges,
                        callbacks
                    );
                }
                return await this.executeNodeInternal(
                    nodeId,
                    context,
                    graph,
                    edges,
                    callbacks
                );
            } catch (error) {
                // Durable HITL pause / budget stop must not be retried
                if (isWorkflowPausedError(error)) {
                    throw error;
                }
                if (isBudgetExceededError(error)) {
                    throw error;
                }
                if (isToolReconciliationRequiredError(error)) {
                    throw error;
                }

                const execError = createExecutionError(
                    error,
                    nodeId,
                    node.type,
                    nodeLabel,
                    attempt,
                    maxAttempts,
                    retryHistory
                );
                lastError = execError;

                const shouldRetry =
                    attempt < maxAttempts &&
                    this.shouldRetry(execError, resolvedRetry);
                if (shouldRetry) {
                    this.activeV2Emitter?.(
                        {
                            type: 'retry',
                            nodeId,
                            attempt: attempt + 1,
                            reason: execError.message,
                        },
                        context.nodePath
                    );
                    // Use suggested delay (respects retry-after header)
                    const delay = execError.getSuggestedDelay(
                        resolvedRetry?.baseDelay || DEFAULT_RETRY_DELAY_MS,
                        attempt,
                        resolvedRetry?.maxDelay || 30000
                    );
                    await this.sleep(delay);
                    retryHistory.push({
                        attempt,
                        error: execError.message,
                        timestamp: new Date().toISOString(),
                    });
                    continue;
                }

                const mode = errorConfig?.mode || 'stop';

                if (mode === 'branch' && errorEdge) {
                    context.outputs[`${nodeId}_error`] =
                        this.serializeError(execError);
                    callbacks.onNodeError(nodeId, execError, meta);
                    this.activeV2Emitter?.(
                        {
                            type: 'node_error',
                            nodeId,
                            error: execError,
                            meta,
                        },
                        context.nodePath
                    );
                    return {
                        output: '',
                        nextNodes: [errorEdge.target],
                    };
                }

                if (mode === 'continue') {
                    callbacks.onNodeError(nodeId, execError, meta);
                    this.activeV2Emitter?.(
                        {
                            type: 'node_error',
                            nodeId,
                            error: execError,
                            meta,
                        },
                        context.nodePath
                    );
                    return {
                        output: '',
                        nextNodes: this.getChildNodes(nodeId, edges),
                    };
                }

                callbacks.onNodeError(nodeId, execError, meta);
                this.activeV2Emitter?.(
                    {
                        type: 'node_error',
                        nodeId,
                        error: execError,
                        meta,
                    },
                    context.nodePath
                );
                throw execError;
            }
        }

        // This should never be reached due to throw in loop above
        if (!lastError) {
            throw new Error('Unexpected: No error captured in retry loop');
        }
        throw lastError;
    }

    // ==========================================================================
    // Human-in-the-Loop (HITL)
    // ==========================================================================

    /**
     * Execute a node with HITL (Human-in-the-Loop) support.
     * Wraps executeNodeInternal with approval/input/review modes.
     */
    private async executeWithHITL(
        node: WorkflowNode,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[]; value?: import('./gateway/types').JsonValue }> {
        const nodeData = node.data as unknown as Record<string, unknown>;
        const hitlConfig = nodeData.hitl as HITLConfig | undefined;
        const nodeLabel = getNodeLabel(node);
        const meta = {
            id: node.id,
            label: nodeLabel,
            type: node.type,
            path: context.nodePath.length ? [...context.nodePath] : undefined,
        } satisfies Partial<NodeExecutionMetadata>;

        // No HITL configured or disabled
        if (!hitlConfig?.enabled) {
            return this.executeNodeInternal(
                node.id,
                context,
                graph,
                edges,
                callbacks
            );
        }

        // Need a way to receive responses: callback, durable mode, or adapter
        if (
            !this.options.onHITLRequest &&
            !this.options.durableHITL &&
            !this.options.hitlAdapter
        ) {
            return this.executeNodeInternal(
                node.id,
                context,
                graph,
                edges,
                callbacks
            );
        }

        const workflowName = context.session.id || 'Workflow';
        const childEdges = graph.children[node.id];

        // Get only default output handles (exclude error/rejected for skip routing)
        const defaultChildNodeIds = childEdges
            ? childEdges
                  .filter(
                      (c) =>
                          !c.handleId ||
                          (c.handleId !== 'error' && c.handleId !== 'rejected')
                  )
                  .map((c) => c.nodeId)
            : [];

        // Helper to handle reject action
        const handleReject = (): { output: string; nextNodes: string[] } => {
            const rejectEdge = edges.find(
                (e) => e.source === node.id && e.sourceHandle === 'rejected'
            );
            if (rejectEdge) {
                callbacks.onNodeFinish(node.id, 'HITL: Rejected', meta);
                return { output: '', nextNodes: [rejectEdge.target] };
            }
            throw new Error('HITL: Request rejected');
        };

        // Helper to handle skip action - only routes through default output handles
        const handleSkip = (): { output: string; nextNodes: string[] } => {
            callbacks.onNodeFinish(node.id, 'HITL: Skipped', meta);
            return {
                output: context.currentInput,
                nextNodes: defaultChildNodeIds,
            };
        };

        // Helper to update context with response data
        const updateContextWithData = (data: unknown): void => {
            if (data) {
                context.currentInput =
                    typeof data === 'string' ? data : JSON.stringify(data);
            }
        };

        const hitlSnapshot = () => ({
            nodeOutputs: { ...context.outputs },
            executionOrder: [...context.nodeChain],
            lastActiveNodeId: node.id,
            sessionMessages: [...context.session.messages],
            resumeInput: context.currentInput,
            workflowId: context.workflowName,
            sessionId: context.session.id,
            startNodeId: node.id,
        });

        switch (hitlConfig.mode) {
            case 'approval': {
                // Pause BEFORE execution for approval
                const request = this.createHITLRequest(
                    node,
                    hitlConfig,
                    context,
                    workflowName,
                    undefined
                );
                const response = await this.waitForHITL(
                    request,
                    hitlConfig,
                    hitlSnapshot()
                );

                if (response.action === 'reject') {
                    return handleReject();
                }

                if (response.action === 'skip') {
                    return handleSkip();
                }

                // Approved - execute with possibly modified input
                updateContextWithData(response.data);
                return this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );
            }

            case 'input': {
                // Pause to collect human input
                const request = this.createHITLRequest(
                    node,
                    hitlConfig,
                    context,
                    workflowName,
                    undefined
                );
                const response = await this.waitForHITL(
                    request,
                    hitlConfig,
                    hitlSnapshot()
                );

                if (response.action === 'skip') {
                    return handleSkip();
                }

                if (response.action === 'reject') {
                    return handleReject();
                }

                // Use human input as node input
                updateContextWithData(response.data);

                return this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );
            }

            case 'review': {
                // Execute first, then pause for review
                const result = await this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );

                const request = this.createHITLRequest(
                    node,
                    hitlConfig,
                    context,
                    workflowName,
                    result.output
                );
                const response = await this.waitForHITL(
                    request,
                    hitlConfig,
                    hitlSnapshot()
                );

                if (response.action === 'reject') {
                    // Route to rejection branch or re-execute
                    const rejectEdge = edges.find(
                        (e) =>
                            e.source === node.id &&
                            e.sourceHandle === 'rejected'
                    );
                    if (rejectEdge) {
                        return {
                            output: result.output,
                            nextNodes: [rejectEdge.target],
                        };
                    }
                    // Re-execute if no rejection branch
                    return this.executeNodeInternal(
                        node.id,
                        context,
                        graph,
                        edges,
                        callbacks
                    );
                }

                if (response.action === 'modify' && response.data) {
                    // Use modified output
                    const modifiedOutput =
                        typeof response.data === 'string'
                            ? response.data
                            : JSON.stringify(response.data);
                    context.outputs[node.id] = modifiedOutput;
                    context.currentInput = modifiedOutput;
                    return {
                        output: modifiedOutput,
                        nextNodes: result.nextNodes,
                    };
                }

                return result;
            }

            default:
                return this.executeNodeInternal(
                    node.id,
                    context,
                    graph,
                    edges,
                    callbacks
                );
        }
    }

    /**
     * Create a HITL request object.
     */
    private createHITLRequest(
        node: WorkflowNode,
        config: HITLConfig,
        context: InternalExecutionContext,
        workflowName: string,
        output?: string
    ): HITLRequest {
        const now = new Date();
        const nodeData = node.data as unknown as Record<string, unknown>;
        const nodeLabel =
            typeof nodeData.label === 'string' ? nodeData.label : node.id;

        const request: HITLRequest = {
            id: generateHITLRequestId(),
            nodeId: node.id,
            nodeLabel,
            mode: config.mode,
            prompt:
                config.prompt ||
                this.getDefaultHITLPrompt(config.mode, nodeLabel),
            context: {
                input: context.currentInput,
                output,
                workflowName,
                sessionId: context.session.id,
            },
            options:
                config.options ||
                (config.mode === 'approval'
                    ? getDefaultApprovalOptions()
                    : undefined),
            inputSchema: config.inputSchema,
            createdAt: now.toISOString(),
        };

        if (config.timeout && config.timeout > 0) {
            request.expiresAt = new Date(
                now.getTime() + config.timeout
            ).toISOString();
        }

        return request;
    }

    /**
     * Get default prompt based on HITL mode.
     */
    private getDefaultHITLPrompt(
        mode: HITLConfig['mode'],
        nodeLabel?: string
    ): string {
        const label = nodeLabel || 'this node';
        switch (mode) {
            case 'approval':
                return `Review and approve the input for "${label}" before proceeding.`;
            case 'input':
                return `Provide input for "${label}".`;
            case 'review':
                return `Review the output from "${label}" before continuing.`;
        }
    }

    /**
     * Wait for HITL response with optional timeout / durable pause.
     * Respects abort signal to cancel waiting when execution is stopped.
     * Uses timestamp-based timeout to handle system sleep correctly.
     */
    private async waitForHITL(
        request: HITLRequest,
        config: HITLConfig,
        snapshot: {
            nodeOutputs: Record<string, string>;
            executionOrder: string[];
            lastActiveNodeId?: string;
            sessionMessages: ChatMessage[];
            resumeInput?: string;
            workflowId?: string;
            sessionId: string;
            startNodeId: string;
        }
    ): Promise<HITLResponse> {
        // Resume path: response already provided (id may differ if request was recreated)
        const resume = this.options.resumeFrom;
        if (resume?.pendingHITLResponse) {
            return resume.pendingHITLResponse;
        }

        // Resume path: look up response from HITL adapter
        if (this.options.hitlAdapter) {
            const existing = await this.options.hitlAdapter.getResponse(
                request.id
            );
            if (existing) {
                return existing;
            }
            // Also try by pending id from resume metadata
            if (resume?.pendingHITLRequestId) {
                const byId = await this.options.hitlAdapter.getResponse(
                    resume.pendingHITLRequestId
                );
                if (byId) {
                    return byId;
                }
            }
        }

        // Persist pending request
        if (this.options.hitlAdapter) {
            await this.options.hitlAdapter.store(request);
        }

        // Durable pause: return control to caller instead of blocking
        if (this.options.durableHITL && !resume?.pendingHITLResponse) {
            const checkpoint = await this.persistHITLCheckpoint(
                request,
                snapshot
            );
            throw new WorkflowPausedError(checkpoint, request);
        }

        if (!this.options.onHITLRequest) {
            // No interactive callback — if we have an adapter, pause durably
            if (this.options.hitlAdapter) {
                const checkpoint = await this.persistHITLCheckpoint(
                    request,
                    snapshot
                );
                throw new WorkflowPausedError(checkpoint, request);
            }
            throw new Error(
                'HITL requested but no onHITLRequest callback or hitlAdapter configured'
            );
        }

        const signal = this.abortController?.signal;

        // Check if already aborted
        if (signal?.aborted) {
            throw new Error('Workflow cancelled');
        }

        // Create abort promise that rejects when execution is cancelled
        const abortPromise = new Promise<HITLResponse>((_, reject) => {
            if (!signal) {
                // If no signal, this promise never resolves (effectively infinite wait)
                return;
            }
            const abortHandler = () => reject(new Error('Workflow cancelled'));
            signal.addEventListener('abort', abortHandler, { once: true });
        });

        const callbackPromise = this.options.onHITLRequest(request);

        const promises: Promise<HITLResponse>[] = [
            callbackPromise,
            abortPromise,
        ];

        // Timestamp-based timeout handling (robust to system sleep)
        let timeoutCheckInterval: ReturnType<typeof setInterval> | undefined;
        if (config.timeout && config.timeout > 0 && request.expiresAt) {
            const expiresAtMs = new Date(request.expiresAt).getTime();
            const timeoutPromise = new Promise<HITLResponse>((resolve) => {
                // Check expiry every second using performant Date.now()
                timeoutCheckInterval = setInterval(() => {
                    if (Date.now() >= expiresAtMs) {
                        clearInterval(timeoutCheckInterval);
                        const defaultAction = config.defaultAction || 'reject';
                        resolve({
                            requestId: request.id,
                            action:
                                defaultAction === 'approve'
                                    ? 'approve'
                                    : defaultAction === 'skip'
                                      ? 'skip'
                                      : 'reject',
                            respondedAt: new Date().toISOString(),
                        });
                    }
                }, 1000); // Check every second
            });
            promises.push(timeoutPromise);
        }

        try {
            const response = await Promise.race(promises);
            // Persist response for durability even in interactive mode
            if (this.options.hitlAdapter) {
                await this.options.hitlAdapter.respond(request.id, response);
            }
            return response;
        } finally {
            // Cleanup timeout interval
            if (timeoutCheckInterval) {
                clearInterval(timeoutCheckInterval);
            }
            // Note: abort event listener is automatically cleaned up due to { once: true }
        }
    }

    /**
     * Persist a paused HITL checkpoint when a checkpoint adapter is configured.
     */
    private async persistHITLCheckpoint(
        request: HITLRequest,
        snapshot: {
            nodeOutputs: Record<string, string>;
            executionOrder: string[];
            lastActiveNodeId?: string;
            sessionMessages: ChatMessage[];
            resumeInput?: string;
            workflowId?: string;
            sessionId: string;
            startNodeId: string;
        }
    ): Promise<WorkflowCheckpoint> {
        const checkpoint: WorkflowCheckpoint = {
            id: createCheckpointId(),
            schemaVersion: CHECKPOINT_SCHEMA_VERSION,
            workflowId: snapshot.workflowId,
            sessionId: snapshot.sessionId,
            createdAt: Date.now(),
            status: 'paused',
            nodeOutputs: { ...snapshot.nodeOutputs },
            executionOrder: [...snapshot.executionOrder],
            lastActiveNodeId: snapshot.lastActiveNodeId,
            sessionMessages: [...snapshot.sessionMessages],
            resumeInput: snapshot.resumeInput,
            startNodeId: snapshot.startNodeId,
            pauseReason: 'hitl',
            pendingHITLRequestId: request.id,
            hitlMode: request.mode,
            hitlNodeId: request.nodeId,
        };

        if (this.options.checkpointAdapter) {
            await this.options.checkpointAdapter.save(checkpoint);
        }

        return checkpoint;
    }

    /**
     * Execute a subgraph starting from a node ID, returning the last output.
     */
    private async executeSubgraph(
        startNodeId: string,
        context: InternalExecutionContext,
        graph: WorkflowGraph,
        edges: WorkflowEdge[],
        callbacks: ExecutionCallbacks,
        preExecuted: Set<string> = new Set()
    ): Promise<{ output: string; nextNodes: string[]; value?: import('./gateway/types').JsonValue }> {
        const queue: string[] = [startNodeId];
        const executed = new Set<string>(preExecuted);
        let output = '';
        let nextNodes: string[] = [];
        let iterations = 0;
        const maxIterations =
            this.options.maxIterations ??
            graph.nodeMap.size * MAX_ITERATIONS_MULTIPLIER;

        while (queue.length > 0) {
            const currentId = queue.shift()!;

            // Check for cancellation
            if (this.abortController?.signal.aborted) {
                throw new Error('Workflow cancelled');
            }

            if (executed.has(currentId)) continue;

            const parents = graph.parents[currentId];
            const allParentsExecuted =
                !parents || parents.every((p) => executed.has(p));
            if (!allParentsExecuted) {
                const recoverableParents = (parents ?? []).filter(
                    (parentId) => {
                        if (
                            executed.has(parentId) ||
                            queue.includes(parentId)
                        ) {
                            return false;
                        }
                        const grandparents = graph.parents[parentId] ?? [];
                        return (
                            grandparents.length === 0 ||
                            grandparents.every((id) => executed.has(id))
                        );
                    }
                );
                if (recoverableParents.length === 0) {
                    const missing = (parents ?? []).filter(
                        (parentId) => !executed.has(parentId)
                    );
                    throw new Error(
                        `Subgraph cannot continue because "${currentId}" is waiting for unresolved dependencies: ${missing.join(', ')}`
                    );
                }
                queue.unshift(...recoverableParents);
                queue.push(currentId);
                continue;
            }

            if (iterations >= maxIterations) {
                throw new Error(
                    `Subgraph exceeded ${maxIterations} execution waves. Check loop nodes or graph cycles.`
                );
            }
            iterations++;

            const result = await this.executeNodeWithErrorHandling(
                currentId,
                context,
                graph,
                edges,
                callbacks
            );

            executed.add(currentId);
            output = result.output;
            nextNodes = result.nextNodes;

            for (const nextId of result.nextNodes) {
                if (!executed.has(nextId)) {
                    queue.push(nextId);
                }
            }

            if (result.nextNodes.length === 0) {
                break;
            }
        }

        return { output, nextNodes };
    }

    // ==========================================================================
    // Retry Logic
    // ==========================================================================

    private shouldRetry(
        error: ExecutionError,
        config?: NodeRetryConfig
    ): boolean {
        if (!config) return false;

        // Use error's built-in retryable check with configured skipOn
        const skipOn = config.skipOn ?? DEFAULT_SKIP_ON_RETRY;
        if (!error.isRetryable(skipOn as import('./errors').ErrorCode[])) {
            return false;
        }

        // If retryOn is specified, only retry on those codes
        if (
            config.retryOn &&
            config.retryOn.length > 0 &&
            !config.retryOn.includes(error.code)
        ) {
            return false;
        }

        return true;
    }

    private async sleep(ms: number): Promise<void> {
        const signal = this.abortController?.signal;

        if (signal?.aborted) {
            throw new Error('Workflow cancelled');
        }

        return new Promise((resolve, reject) => {
            let onAbort: (() => void) | undefined;
            const timeoutId = setTimeout(() => {
                if (signal && onAbort) {
                    signal.removeEventListener('abort', onAbort);
                }
                resolve();
            }, ms);

            // Only add listener if signal exists
            if (signal) {
                onAbort = () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Workflow cancelled'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
            }
        });
    }

    private getChildNodes(nodeId: string, edges: WorkflowEdge[]): string[] {
        return edges
            .filter((e) => e.source === nodeId && e.sourceHandle !== 'error')
            .map((e) => e.target);
    }

    private serializeError(error: ExecutionError): string {
        const plain = {
            message: error.message,
            code: error.code,
            nodeId: error.nodeId,
            statusCode: error.statusCode,
            retry: error.retry,
            rateLimit: error.rateLimit,
            stack: error.stack,
        };
        try {
            return JSON.stringify(plain);
        } catch {
            return JSON.stringify({ message: error.message, code: error.code });
        }
    }

    /**
     * Compact conversation history if needed based on compaction configuration.
     * Returns the compacted messages and result if compaction was performed.
     */
    private async compactHistoryIfNeeded(
        messages: ChatMessage[],
        model: string,
        callbacks?: ExecutionCallbacks,
        nodeId = 'compaction'
    ): Promise<{ messages: ChatMessage[]; result?: CompactionResult }> {
        const config = this.options.compaction;
        if (!config) {
            return { messages };
        }

        // Early return for empty or single message
        if (messages.length <= 1) {
            return { messages };
        }

        const threshold = calculateThreshold(config, model, this.tokenCounter);
        const currentTokens = countMessageTokens(messages, this.tokenCounter);

        // No compaction needed if under threshold
        if (currentTokens <= threshold) {
            return { messages };
        }

        const { toPreserve, toCompact } = splitMessagesForCompaction(
            messages,
            config.preserveRecent
        );

        // No messages to compact
        if (toCompact.length === 0) {
            return { messages };
        }

        let compactedMessages: ChatMessage[];
        let summary: string | undefined;

        if (config.strategy === 'truncate') {
            // Simply drop older messages
            compactedMessages = toPreserve;
        } else if (config.strategy === 'custom' && config.customCompactor) {
            // Use custom compactor
            try {
                compactedMessages = await config.customCompactor(
                    messages,
                    threshold
                );
            } catch (error) {
                // Fallback to truncate on custom compactor error
                if (this.options.debug) {
                    console.error(
                        'Custom compactor failed, falling back to truncate:',
                        error
                    );
                }
                compactedMessages = toPreserve;
            }
        } else {
            // Default: summarize strategy
            const summarizeModel = config.summarizeModel || model;
            const prompt = buildSummarizationPrompt(toCompact, config);

            try {
                this.assertBudgetFn?.();
                const request: import('./gateway').ModelRequest = {
                    models: [summarizeModel],
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a helpful assistant that summarizes conversation history concisely.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    generation: {
                        temperature: 0.3,
                        maxOutputTokens: 500,
                    },
                    signal: this.abortController?.signal,
                };
                const callId = `${
                    this.options.runId ?? 'workflow'
                }:model:${++this.modelCallSequence}:${nodeId}:compaction`;
                this.modelCalls.push({
                    callId,
                    nodeId,
                    requestedModels: [...request.models],
                    transport: 'chat',
                });
                this.activeV2Emitter?.({
                    type: 'model_start',
                    callId,
                    nodeId,
                    requestedModels: [...request.models],
                    transport: 'chat',
                });
                const summarizationResult =
                    await this.gateway.generate(request);
                const record = this.modelCalls.find(
                    (item) => item.callId === callId
                )!;
                Object.assign(record, {
                    actualModel: summarizationResult.actualModel,
                    provider: summarizationResult.provider,
                    finishReason: summarizationResult.finishReason,
                    usage: summarizationResult.usage,
                    identifiers: summarizationResult.identifiers,
                    timing: summarizationResult.timing,
                    annotations: summarizationResult.annotations,
                });
                this.activeV2Emitter?.({
                    type: 'model_finish',
                    callId,
                    nodeId,
                    actualModel: summarizationResult.actualModel,
                    provider: summarizationResult.provider,
                    finishReason: summarizationResult.finishReason,
                    usage: summarizationResult.usage,
                    identifiers: summarizationResult.identifiers,
                    timing: summarizationResult.timing,
                    annotations: summarizationResult.annotations,
                });
                this.recordLlmStepFn?.(
                    summarizationResult.usage?.totalTokens,
                    summarizationResult.usage?.costUsd
                );

                summary = summarizationResult.content || '';
                const summaryMessage = createSummaryMessage(summary);
                compactedMessages = [summaryMessage, ...toPreserve];
            } catch (error) {
                // Fallback to truncate on summarization error
                if (this.options.debug) {
                    console.error(
                        'Summarization failed, falling back to truncate:',
                        error
                    );
                }
                compactedMessages = toPreserve;
            }
        }

        const tokensAfter = countMessageTokens(
            compactedMessages,
            this.tokenCounter
        );

        const result: CompactionResult = {
            compacted: true,
            messages: compactedMessages,
            tokensBefore: currentTokens,
            tokensAfter,
            messagesCompacted: toCompact.length,
            summary,
        };

        // Invoke callback if provided
        if (callbacks?.onContextCompacted) {
            callbacks.onContextCompacted(result);
        }

        return { messages: compactedMessages, result };
    }
}
