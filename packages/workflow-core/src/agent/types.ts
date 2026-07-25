/**
 * Agent-loop backend abstraction (R6.AC1, R6.AC2).
 *
 * A backend runs a bounded tool-calling loop against a {@link ModelGateway}. The
 * native backend is the reference implementation and default; optional backends
 * (e.g. `@openrouter/agent`) are lazily loaded and must pass parity tests before
 * they can be selected.
 */
import type { ChatMessage } from '../types';
import type {
    GenerationSettings,
    ModelGateway,
    ModelToolDescriptor,
    ModelUsage,
    NonEmptyModels,
    ToolChoice,
} from '../gateway/types';

/** A tool call the loop wants the host to execute. */
export interface AgentToolInvocation {
    callId: string;
    toolName: string;
    /** Raw JSON arguments string as emitted by the model. */
    argumentsJson: string;
}

/** Host callback that executes a single tool call and returns its result text. */
export type AgentToolExecutor = (
    invocation: AgentToolInvocation
) => Promise<string>;

export interface AgentLoopInput {
    gateway: ModelGateway;
    models: NonEmptyModels;
    messages: ChatMessage[];
    tools?: ModelToolDescriptor[];
    toolChoice?: ToolChoice;
    parallelToolCalls?: boolean;
    generation?: GenerationSettings;
    /** Maximum model turns before the loop stops (budget). */
    maxIterations: number;
    signal?: AbortSignal;
    onTextDelta?: (delta: string) => void;
    onReasoningDelta?: (delta: string) => void;
    /** Executes local tool calls. Omit for provider-managed-only loops. */
    executeTool?: AgentToolExecutor;
}

export interface AgentLoopResult {
    finalContent: string;
    messages: ChatMessage[];
    iterations: number;
    usage?: ModelUsage;
    /** True when the loop stopped because it hit `maxIterations`. */
    stoppedOnMaxIterations: boolean;
    actualModel?: string;
    provider?: string;
}

/** Pluggable agent-loop backend. */
export interface AgentLoopBackend {
    readonly id: 'native' | 'openrouter-agent' | (string & {});
    run(input: AgentLoopInput): Promise<AgentLoopResult>;
}
