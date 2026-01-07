# Error Handling

Configure retry logic and error branching for robust workflows.

## Import

```typescript
import {
    type NodeErrorConfig,
    type NodeRetryConfig,
    type ErrorCode,
    ExecutionError,
    createExecutionError,
    classifyError,
    classifyFromStatus,
    extractRateLimitInfo,
    DEFAULT_SKIP_ON,
} from 'or3-workflow-core';
```

## Error Codes

Errors are classified into these categories:

```typescript
type ErrorCode =
    | 'LLM_ERROR' // 5xx server errors
    | 'TIMEOUT' // Request timeouts
    | 'RATE_LIMIT' // 429 rate limit exceeded
    | 'AUTH' // 401/403 authentication errors
    | 'VALIDATION' // 4xx client errors
    | 'EXTENSION_VALIDATION_ERROR' // Extension-specific validation failures
    | 'NETWORK' // Network connectivity issues
    | 'UNKNOWN'; // Unclassified errors
```

### Default Non-Retryable Errors

```typescript
// These error codes are not retried by default
const DEFAULT_SKIP_ON: ErrorCode[] = ['AUTH', 'VALIDATION'];
```

## Node Error Configuration

Configure error handling per node:

```typescript
const node = {
    type: 'agent',
    data: {
        label: 'API Call',
        model: 'openai/gpt-4o',
        prompt: 'Process this data...',

        errorHandling: {
            mode: 'branch', // 'stop' | 'branch' | 'continue'
            retry: {
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 30000,
                retryOn: ['RATE_LIMIT', 'TIMEOUT', 'LLM_ERROR'],
                skipOn: ['AUTH', 'VALIDATION'],
            },
        },
    },
};
```

## NodeErrorConfig

```typescript
interface NodeErrorConfig {
    /** Error handling mode */
    mode: 'stop' | 'continue' | 'branch';

    /** Retry configuration */
    retry?: NodeRetryConfig;
}
```

## Retry Configuration

```typescript
interface NodeRetryConfig {
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
```

## Error Handling Modes

### Stop

Stop workflow execution on error:

```typescript
errorHandling: {
  mode: 'stop',
}
```

### Branch

Route to an error handling path using the `error` handle:

```typescript
// Configure node
errorHandling: {
  mode: 'branch',
}

// Connect error path in workflow (always use 'error' as sourceHandle)
edges: [
  { source: 'agent', target: 'error-handler', sourceHandle: 'error' },
]
```

### Continue

Log error and continue with empty output:

```typescript
errorHandling: {
  mode: 'continue',
}
```

## Error Classification

Errors are automatically classified from HTTP status codes or message content:

```typescript
import { classifyError, classifyFromStatus } from 'or3-workflow-core';

// Classify from status code (preferred)
const codeFromStatus = classifyFromStatus(429); // 'RATE_LIMIT'
const codeFromStatus2 = classifyFromStatus(401); // 'AUTH'
const codeFromStatus3 = classifyFromStatus(500); // 'LLM_ERROR'

// Classify from error message (fallback)
const codeFromMessage = classifyError(new Error('rate limit exceeded'));
// Returns 'RATE_LIMIT'
```

### Error Type Mapping

| Status Code | Error Code   | Retryable |
| ----------- | ------------ | --------- |
| 429         | `RATE_LIMIT` | Yes       |
| 408, 504    | `TIMEOUT`    | Yes       |
| 5xx         | `LLM_ERROR`  | Yes       |
| 401, 403    | `AUTH`       | No        |
| 4xx (other) | `VALIDATION` | No        |
| Network     | `NETWORK`    | Yes       |
| Other       | `UNKNOWN`    | No        |

## ExecutionError

The `ExecutionError` class provides structured error information with retry and rate limit context:

```typescript
class ExecutionError extends Error {
    /** Node that failed */
    readonly nodeId: string;

    /** Type of node that failed */
    readonly nodeType: string;

    /** Error classification code */
    readonly code: ErrorCode;

    /** HTTP status code (if available) */
    readonly statusCode?: number;

    /** Retry information */
    readonly retry?: RetryInfo;

    /** Rate limit information (from response headers) */
    readonly rateLimit?: RateLimitInfo;

    /** Original error */
    readonly cause?: Error;

    /** Check if this error should skip retry based on its code */
    isRetryable(skipOn?: ErrorCode[]): boolean;

    /** Get suggested retry delay (uses retryAfter if available) */
    getSuggestedDelay(
        baseDelay: number,
        attempt: number,
        maxDelay?: number
    ): number;
}

interface RetryInfo {
    attempts: number;
    maxAttempts: number;
    history: RetryHistoryEntry[];
}

interface RetryHistoryEntry {
    attempt: number;
    error: string;
    timestamp: string;
}

interface RateLimitInfo {
    limit?: number;
    remaining?: number;
    resetAt?: string;
    retryAfter?: number;
}
```

## Creating Execution Errors

Use `createExecutionError` to create structured errors from any thrown value:

```typescript
import { createExecutionError } from 'or3-workflow-core';

try {
    await callLLM();
} catch (error) {
    const execError = createExecutionError(
        error,
        nodeId,
        nodeType,
        attempt, // Current attempt number
        maxAttempts, // Max retry attempts
        retryHistory // Previous retry attempts
    );

    console.log(execError.code); // 'RATE_LIMIT', 'AUTH', etc.
    console.log(execError.isRetryable()); // true/false
    console.log(execError.getSuggestedDelay(1000, 1)); // Delay in ms
}
```

## Rate Limit Handling

Extract rate limit information from response headers:

```typescript
import { extractRateLimitInfo } from 'or3-workflow-core';

const rateLimitInfo = extractRateLimitInfo(error);
// Returns: { limit: 100, remaining: 0, resetAt: '...', retryAfter: 60 }

if (rateLimitInfo?.retryAfter) {
    await sleep(rateLimitInfo.retryAfter * 1000);
}
```

## Retry Flow

```
Attempt 1 → Error → Classify → Retryable?
    │                              │
    │                         Yes ─┤─ Get suggested delay
    │                              │   (respects retry-after header)
    │                              │
    ▼                         Attempt 2 → Error
                                   │
                              Retryable?
                                   │
                              Yes ─┤─ Wait (exponential backoff)
                                   │
                              Attempt 3 → Error
                                   │
                              Retryable?
                                   │
                              No ──┤─ Max attempts reached
                                   │
                              Handle Error (stop/branch/continue)
```

## Exponential Backoff with Rate Limit Support

```typescript
// ExecutionError.getSuggestedDelay respects rate limit headers
const delay = error.getSuggestedDelay(baseDelay, attempt, maxDelay);

// If retryAfter header is present, it takes precedence:
// - retryAfter: 60 → delay = min(60000, maxDelay)
// Otherwise exponential backoff:
// - Attempt 1: baseDelay * 2^0 = 1000ms
// - Attempt 2: baseDelay * 2^1 = 2000ms
// - Attempt 3: baseDelay * 2^2 = 4000ms
```

## Error Branching Example

Create a workflow with error handling:

```typescript
const nodes = [
  { id: 'start', type: 'start', ... },
  {
    id: 'risky-agent',
    type: 'agent',
    data: {
      label: 'Risky Operation',
      model: 'openai/gpt-4o',
      prompt: 'Process this data...',
      errorHandling: {
        mode: 'branch',
        retry: {
          maxRetries: 2,
          baseDelay: 1000,
          skipOn: ['AUTH', 'VALIDATION'],
        },
      },
    },
  },
  { id: 'success-handler', type: 'agent', ... },
  { id: 'error-handler', type: 'agent', ... },
];

const edges = [
  { id: 'e1', source: 'start', target: 'risky-agent' },
  { id: 'e2', source: 'risky-agent', target: 'success-handler' }, // Default output
  { id: 'e3', source: 'risky-agent', target: 'error-handler', sourceHandle: 'error' },
];
```

## Catching Errors

Handle errors in your application:

```typescript
try {
    const result = await adapter.execute(workflow, input, callbacks);
} catch (error) {
    if (error instanceof ExecutionError) {
        console.error(
            `Node ${error.nodeId} (${error.nodeType}) failed:`,
            error.message
        );
        console.error(`Code: ${error.code}`);
        console.error(`Status: ${error.statusCode}`);
        console.error(`Retryable: ${error.isRetryable()}`);

        if (error.retry) {
            console.error(
                `Attempts: ${error.retry.attempts}/${error.retry.maxAttempts}`
            );
            console.error('Retry history:', error.retry.history);
        }

        if (error.rateLimit) {
            console.error('Rate limit info:', error.rateLimit);
        }

        if (error.cause) {
            console.error('Original error:', error.cause);
        }
    }
}
```

## With Callbacks

```typescript
const callbacks: ExecutionCallbacks = {
    onNodeStart: (nodeId) => setNodeStatus(nodeId, 'active'),
    onNodeFinish: (nodeId, output) => setNodeStatus(nodeId, 'completed'),
    onNodeError: (nodeId, error) => {
        // Update UI
        setNodeStatus(nodeId, 'error');

        // Log with full context
        if (error instanceof ExecutionError) {
            console.error(
                `[${error.code}] Node ${nodeId} failed:`,
                error.message
            );

            if (error.rateLimit?.retryAfter) {
                console.log(
                    `Rate limited, retry after ${error.rateLimit.retryAfter}s`
                );
            }
        }

        // Notify user
        showErrorToast(error.message);
    },
    onToken: (nodeId, token) => appendStreamingContent(token),
};

const result = await adapter.execute(workflow, input, callbacks);
```

## Default Retry Behavior

The adapter applies default retry settings:

```typescript
// Default settings (can be overridden per-node)
const defaults = {
    maxRetries: 2, // 3 total attempts
    retryDelayMs: 1000, // 1 second base delay
    // DEFAULT_SKIP_ON: ['AUTH', 'VALIDATION']
};
```

## Best Practices

### 1. Configure Critical Nodes

```typescript
// For important nodes, add retry and branching
errorHandling: {
  mode: 'branch',
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
  },
}
```

### 2. Use Appropriate Skip Lists

```typescript
// Don't retry auth or validation errors
retry: {
  skipOn: ['AUTH', 'VALIDATION'],
  // Or only retry specific errors
  retryOn: ['RATE_LIMIT', 'TIMEOUT'],
}
```

### 3. Respect Rate Limits

```typescript
// The adapter automatically uses retryAfter from rate limit headers
// You can also set a max delay to cap wait times
retry: {
  maxDelay: 60000, // Never wait more than 60 seconds
}
```

### 4. Connect Error Branches

```typescript
// Always connect error branches to handler nodes
edges: [
    {
        id: 'error-edge',
        source: 'risky',
        target: 'fallback',
        sourceHandle: 'error',
    },
];
```

### 5. Serialize Errors for Context

When using error branching, the error is serialized and available to the error handler:

```typescript
// In error handler node, access via outputs
const errorInfo = JSON.parse(context.outputs['riskyNode_error']);
console.log(errorInfo.code); // 'RATE_LIMIT'
console.log(errorInfo.retry.attempts); // 3
```

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Agent Node](../nodes/agent.md) - Node configuration
