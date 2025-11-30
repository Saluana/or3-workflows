# Error Handling

Configure retry logic and error branching for robust workflows.

## Import

```typescript
import {
    type NodeErrorConfig,
    type NodeRetryConfig,
    type ExecutionError,
    classifyError,
    wrapError,
} from '@or3/workflow-core';
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

        errorConfig: {
            retry: {
                maxAttempts: 3,
                delayMs: 1000,
                backoffMultiplier: 2,
                retryableErrors: ['rate_limit', 'timeout', 'server_error'],
            },
            onError: 'branch', // 'stop' | 'branch' | 'continue'
            errorHandleId: 'error-output',
        },
    },
};
```

## NodeErrorConfig

```typescript
interface NodeErrorConfig {
    /** Retry configuration */
    retry?: NodeRetryConfig;

    /** Error handling mode */
    onError?: 'stop' | 'branch' | 'continue';

    /** Handle ID to use for error branching */
    errorHandleId?: string;

    /** Custom error handler */
    handler?: (error: Error, context: ExecutionContext) => Promise<void>;
}
```

## Retry Configuration

```typescript
interface NodeRetryConfig {
    /** Maximum retry attempts (default: 2) */
    maxAttempts: number;

    /** Initial delay between retries in ms (default: 1000) */
    delayMs: number;

    /** Backoff multiplier (default: 2) */
    backoffMultiplier: number;

    /** Error types to retry */
    retryableErrors?: ErrorType[];
}

type ErrorType =
    | 'rate_limit'
    | 'timeout'
    | 'server_error'
    | 'network'
    | 'invalid_request'
    | 'authentication'
    | 'unknown';
```

## Error Handling Modes

### Stop

Stop workflow execution on error:

```typescript
errorConfig: {
  onError: 'stop',
}
```

### Branch

Route to an error handling path:

```typescript
// Configure node
errorConfig: {
  onError: 'branch',
  errorHandleId: 'error-output',
}

// Connect error path in workflow
edges: [
  { source: 'agent', target: 'error-handler', sourceHandle: 'error-output' },
]
```

### Continue

Log error and continue with empty output:

```typescript
errorConfig: {
  onError: 'continue',
}
```

## Error Classification

Errors are automatically classified:

```typescript
import { classifyError } from '@or3/workflow-core';

try {
    await callAPI();
} catch (error) {
    const type = classifyError(error);

    switch (type) {
        case 'rate_limit':
            // Wait and retry
            break;
        case 'authentication':
            // Check API key
            break;
        case 'invalid_request':
            // Fix request
            break;
    }
}
```

### Error Types

| Type              | Description                | Retryable |
| ----------------- | -------------------------- | --------- |
| `rate_limit`      | Rate limit exceeded        | Yes       |
| `timeout`         | Request timed out          | Yes       |
| `server_error`    | 5xx server error           | Yes       |
| `network`         | Network connectivity issue | Yes       |
| `invalid_request` | 4xx client error           | No        |
| `authentication`  | Auth failure               | No        |
| `unknown`         | Unclassified error         | No        |

## ExecutionError

Wrapped errors with context:

```typescript
interface ExecutionError extends Error {
    /** Node that failed */
    nodeId: string;

    /** Error type classification */
    type: ErrorType;

    /** Whether error is retryable */
    retryable: boolean;

    /** Retry attempt number */
    attempt?: number;

    /** Original error */
    cause?: Error;
}
```

## Retry Flow

```
Attempt 1 → Error → Classify → Retryable?
    │                              │
    │                         Yes ─┤─ Wait (1000ms)
    │                              │
    ▼                         Attempt 2 → Error
Attempt 1 → Error → Classify → Retryable?
    │                              │
    │                         Yes ─┤─ Wait (2000ms)
    │                              │
    ▼                         Attempt 3 → Error
Attempt 1 → Error → Classify → Retryable?
    │                              │
    │                         No ──┤─ Max attempts reached
    │                              │
    ▼                         Handle Error (stop/branch/continue)
```

## Exponential Backoff

```typescript
const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);

// Example with delayMs: 1000, backoffMultiplier: 2
// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 4000ms
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
      errorConfig: {
        retry: { maxAttempts: 2 },
        onError: 'branch',
        errorHandleId: 'error',
      },
    },
  },
  { id: 'success-handler', type: 'agent', ... },
  { id: 'error-handler', type: 'agent', ... },
];

const edges = [
  { source: 'start', target: 'risky-agent' },
  { source: 'risky-agent', target: 'success-handler' }, // Default output
  { source: 'risky-agent', target: 'error-handler', sourceHandle: 'error' },
];
```

## Catching Errors

Handle errors in your application:

```typescript
try {
    const result = await adapter.execute({ nodes, edges, input });
} catch (error) {
    if (error instanceof ExecutionError) {
        console.error(`Node ${error.nodeId} failed:`, error.message);
        console.error(`Type: ${error.type}`);
        console.error(`Retryable: ${error.retryable}`);
        console.error(`Attempt: ${error.attempt}`);

        if (error.cause) {
            console.error('Original error:', error.cause);
        }
    }
}
```

## With Callbacks

```typescript
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),

    onNodeError: (nodeId, error) => {
        // Update UI
        setNodeStatus(nodeId, 'error');

        // Log for debugging
        console.error(`Node ${nodeId} failed:`, error);

        // Notify user
        showErrorToast(error.message);
    },
});
```

## Default Error Handler

The default behavior:

```typescript
// Default error config
const defaultErrorConfig: NodeErrorConfig = {
    retry: {
        maxAttempts: 2,
        delayMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['rate_limit', 'timeout', 'server_error'],
    },
    onError: 'stop',
};
```

## Best Practices

### 1. Configure Critical Nodes

```typescript
// For important nodes, add retry and branching
errorConfig: {
  retry: { maxAttempts: 3 },
  onError: 'branch',
}
```

### 2. Don't Retry Invalid Requests

```typescript
// Only retry transient errors
retry: {
  retryableErrors: ['rate_limit', 'timeout', 'server_error'],
  // NOT: 'invalid_request', 'authentication'
}
```

### 3. Use Appropriate Delays

```typescript
// Start with 1 second, exponential backoff
retry: {
  delayMs: 1000,
  backoffMultiplier: 2,
}
```

### 4. Add Error Handlers for Branching

```typescript
// Always connect error branches to handler nodes
edges: [{ source: 'risky', target: 'fallback', sourceHandle: 'error' }];
```

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Agent Node](../nodes/agent.md) - Node configuration
