export interface NodeRetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay in ms (doubled each retry) */
  baseDelay: number;
  /** Maximum delay in ms */
  maxDelay?: number;
  /** Only retry on these error codes (empty = retry all) */
  retryOn?: string[];
  /** Don't retry on these error codes */
  skipOn?: string[];
}

export type ErrorCode =
  | 'LLM_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export interface ExecutionError extends Error {
  nodeId: string;
  code: ErrorCode;
  statusCode?: number;
  retry?: {
    attempts: number;
    maxAttempts: number;
    history: Array<{
      attempt: number;
      error: string;
      timestamp: string;
    }>;
  };
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt: string;
  };
  cause?: Error;
}

export type ErrorHandlingMode = 'stop' | 'continue' | 'branch';

export interface NodeErrorConfig {
  mode: ErrorHandlingMode;
  retry?: NodeRetryConfig;
}

export function classifyError(error: unknown): ErrorCode {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate limit')) return 'RATE_LIMIT';
    if (msg.includes('timeout')) return 'TIMEOUT';
    if (msg.includes('network') || msg.includes('fetch')) return 'NETWORK';
    if (msg.includes('validation')) return 'VALIDATION';
  }
  return 'UNKNOWN';
}

export function wrapError(
  error: unknown,
  nodeId: string,
  attempt: number,
  maxAttempts: number,
  history: Array<{ attempt: number; error: string; timestamp: string }>
): ExecutionError {
  const base = error instanceof Error ? error : new Error(String(error));
  const execError = base as ExecutionError;

  execError.nodeId = nodeId;
  execError.code = classifyError(error);
  execError.retry = { attempts: attempt, maxAttempts, history };
  execError.cause = base;

  return execError;
}
