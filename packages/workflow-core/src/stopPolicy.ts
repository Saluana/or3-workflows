/**
 * Execution stop / budget policies.
 *
 * @module stopPolicy
 */

export interface StopPolicy {
    /** Max LLM chat rounds across the whole run (default: unlimited) */
    maxSteps?: number;
    /** Max wall-clock duration for the run in ms */
    maxDurationMs?: number;
    /** Max total tokens (prompt + completion estimates/actual) */
    maxTokens?: number;
    /** Max provider-reported cost across model calls in USD. */
    maxCostUsd?: number;
}

export interface StopPolicyState {
    steps: number;
    tokens: number;
    costUsd: number;
    startedAt: number;
}

export function createStopPolicyState(): StopPolicyState {
    return { steps: 0, tokens: 0, costUsd: 0, startedAt: Date.now() };
}

export type BudgetExhaustedReason =
    | 'max_steps'
    | 'max_duration'
    | 'max_tokens'
    | 'max_cost';

export function checkStopPolicy(
    policy: StopPolicy | undefined,
    state: StopPolicyState
): { exceeded: false } | { exceeded: true; reason: BudgetExhaustedReason; message: string } {
    if (!policy) return { exceeded: false };

    if (policy.maxSteps != null && state.steps >= policy.maxSteps) {
        return {
            exceeded: true,
            reason: 'max_steps',
            message: `Stop policy: maxSteps (${policy.maxSteps}) reached`,
        };
    }

    if (policy.maxDurationMs != null) {
        const elapsed = Date.now() - state.startedAt;
        if (elapsed >= policy.maxDurationMs) {
            return {
                exceeded: true,
                reason: 'max_duration',
                message: `Stop policy: maxDurationMs (${policy.maxDurationMs}) exceeded`,
            };
        }
    }

    if (policy.maxTokens != null && state.tokens >= policy.maxTokens) {
        return {
            exceeded: true,
            reason: 'max_tokens',
            message: `Stop policy: maxTokens (${policy.maxTokens}) reached`,
        };
    }

    if (policy.maxCostUsd != null && state.costUsd >= policy.maxCostUsd) {
        return {
            exceeded: true,
            reason: 'max_cost',
            message: `Stop policy: maxCostUsd (${policy.maxCostUsd}) reached`,
        };
    }

    return { exceeded: false };
}

/**
 * Thrown when a stop/budget policy is exceeded mid-run.
 * Converted into a paused or failed ExecutionResult by the adapter.
 */
export class BudgetExceededError extends Error {
    readonly name = 'BudgetExceededError';
    constructor(
        public readonly reason: BudgetExhaustedReason,
        message: string
    ) {
        super(message);
    }
}

export function isBudgetExceededError(
    error: unknown
): error is BudgetExceededError {
    return error instanceof BudgetExceededError;
}
