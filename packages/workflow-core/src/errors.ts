export interface NodeRetryConfig {
    /** Maximum retry attempts */
    maxRetries: number;
    /** Base delay in ms (doubled each retry) */
    baseDelay: number;
    /** Maximum delay in ms */
    maxDelay?: number;
    /** Only retry on these error codes (empty = retry all) */
    retryOn?: ErrorCode[];
    /** Don't retry on these error codes */
    skipOn?: ErrorCode[];
}

/** Default skipOn codes for non-retryable errors */
export const DEFAULT_SKIP_ON: ErrorCode[] = ['AUTH', 'VALIDATION'];

export type ErrorCode =
    | 'LLM_ERROR'
    | 'TIMEOUT'
    | 'RATE_LIMIT'
    | 'AUTH'
    | 'VALIDATION'
    | 'NETWORK'
    | 'UNKNOWN';

export interface RetryHistoryEntry {
    attempt: number;
    error: string;
    timestamp: string;
}

export interface RateLimitInfo {
    limit?: number;
    remaining?: number;
    resetAt?: string;
    retryAfter?: number;
}

export interface RetryInfo {
    attempts: number;
    maxAttempts: number;
    history: RetryHistoryEntry[];
}

/**
 * Structured execution error with full context for debugging and retry logic.
 * Created via createExecutionError factory - do not construct directly.
 */
export class ExecutionError extends Error {
    readonly nodeId: string;
    readonly nodeType: string;
    readonly code: ErrorCode;
    readonly statusCode?: number;
    readonly retry?: RetryInfo;
    readonly rateLimit?: RateLimitInfo;
    readonly cause?: Error;

    constructor(
        message: string,
        options: {
            nodeId: string;
            nodeType: string;
            code: ErrorCode;
            statusCode?: number;
            retry?: RetryInfo;
            rateLimit?: RateLimitInfo;
            cause?: Error;
        }
    ) {
        super(message);
        this.name = 'ExecutionError';
        this.nodeId = options.nodeId;
        this.nodeType = options.nodeType;
        this.code = options.code;
        this.statusCode = options.statusCode;
        this.retry = options.retry;
        this.rateLimit = options.rateLimit;
        this.cause = options.cause;

        // Maintain proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ExecutionError);
        }
    }

    /** Check if this error should skip retry based on its code */
    isRetryable(skipOn: ErrorCode[] = DEFAULT_SKIP_ON): boolean {
        return !skipOn.includes(this.code);
    }

    /** Get suggested retry delay (uses retryAfter if available) */
    getSuggestedDelay(
        baseDelay: number,
        attempt: number,
        maxDelay = 30000
    ): number {
        if (this.rateLimit?.retryAfter) {
            return Math.min(this.rateLimit.retryAfter * 1000, maxDelay);
        }
        return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    }
}

export type ErrorHandlingMode = 'stop' | 'continue' | 'branch';

export interface NodeErrorConfig {
    mode: ErrorHandlingMode;
    retry?: NodeRetryConfig;
}

/**
 * Classify error from message content (fallback when status code unavailable).
 */
export function classifyError(error: unknown): ErrorCode {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('rate limit') || msg.includes('429'))
            return 'RATE_LIMIT';
        if (msg.includes('timeout') || msg.includes('timed out'))
            return 'TIMEOUT';
        if (
            msg.includes('unauthorized') ||
            msg.includes('401') ||
            msg.includes('403')
        )
            return 'AUTH';
        if (
            msg.includes('network') ||
            msg.includes('fetch') ||
            msg.includes('econnrefused')
        )
            return 'NETWORK';
        if (msg.includes('validation') || msg.includes('invalid'))
            return 'VALIDATION';
    }
    return 'UNKNOWN';
}

/**
 * Classify error from HTTP status code (preferred over message parsing).
 */
export function classifyFromStatus(statusCode: number): ErrorCode {
    if (statusCode === 429) return 'RATE_LIMIT';
    if (statusCode === 401 || statusCode === 403) return 'AUTH';
    if (statusCode === 408 || statusCode === 504) return 'TIMEOUT';
    if (statusCode >= 400 && statusCode < 500) return 'VALIDATION';
    if (statusCode >= 500) return 'LLM_ERROR';
    return 'UNKNOWN';
}

/**
 * Extract rate limit info from response headers or error object.
 */
export function extractRateLimitInfo(
    error: unknown
): RateLimitInfo | undefined {
    // Check for Response-like object with headers
    const resp = error as {
        headers?: Headers | Record<string, string>;
        status?: number;
    };
    if (!resp.headers) return undefined;

    const getHeader = (name: string): string | null => {
        if (resp.headers instanceof Headers) {
            return resp.headers.get(name);
        }
        if (typeof resp.headers === 'object') {
            return (resp.headers as Record<string, string>)[name] ?? null;
        }
        return null;
    };

    const retryAfterHeader =
        getHeader('retry-after') || getHeader('Retry-After');
    const limitHeader =
        getHeader('x-ratelimit-limit') || getHeader('X-RateLimit-Limit');
    const remainingHeader =
        getHeader('x-ratelimit-remaining') ||
        getHeader('X-RateLimit-Remaining');
    const resetHeader =
        getHeader('x-ratelimit-reset') || getHeader('X-RateLimit-Reset');

    if (!retryAfterHeader && !limitHeader) return undefined;

    return {
        retryAfter: retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : undefined,
        limit: limitHeader ? parseInt(limitHeader, 10) : undefined,
        remaining: remainingHeader ? parseInt(remainingHeader, 10) : undefined,
        resetAt: resetHeader || undefined,
    };
}

/**
 * Extract status code from various error shapes.
 */
export function extractStatusCode(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null) {
        const obj = error as Record<string, unknown>;
        if (typeof obj.status === 'number') return obj.status;
        if (typeof obj.statusCode === 'number') return obj.statusCode;
        if (typeof obj.response === 'object' && obj.response !== null) {
            const resp = obj.response as Record<string, unknown>;
            if (typeof resp.status === 'number') return resp.status;
        }
    }
    return undefined;
}

/**
 * Create a structured ExecutionError from any thrown value.
 * Does NOT mutate the original error - creates a fresh instance.
 */
export function createExecutionError(
    error: unknown,
    nodeId: string,
    nodeType: string,
    attempt: number,
    maxAttempts: number,
    history: RetryHistoryEntry[]
): ExecutionError {
    const cause = error instanceof Error ? error : new Error(String(error));
    const statusCode = extractStatusCode(error);
    const rateLimit = extractRateLimitInfo(error);

    // Prefer status code classification, fall back to message parsing
    const code = statusCode
        ? classifyFromStatus(statusCode)
        : classifyError(error);

    return new ExecutionError(cause.message, {
        nodeId,
        nodeType,
        code,
        statusCode,
        retry: { attempts: attempt, maxAttempts, history },
        rateLimit,
        cause,
    });
}

/**
 * @deprecated Use createExecutionError instead. This mutates the original error.
 */
export function wrapError(
    error: unknown,
    nodeId: string,
    attempt: number,
    maxAttempts: number,
    history: RetryHistoryEntry[]
): ExecutionError {
    // Delegate to new factory for backwards compatibility
    return createExecutionError(
        error,
        nodeId,
        '',
        attempt,
        maxAttempts,
        history
    );
}
