# Human-in-the-Loop (HITL)

Pause workflow execution for human review, approval, or input.

## Import

```typescript
import {
    type HITLConfig,
    type HITLRequest,
    type HITLResponse,
    type HITLAction,
    type HITLAdapter,
    InMemoryHITLAdapter,
    createDefaultHITLConfig,
} from 'or3-workflow-core';
```

## Overview

HITL allows workflows to pause at specific nodes for human intervention:

-   **Approval Mode**: Pause BEFORE execution for approve/reject
-   **Input Mode**: Pause to collect human input
-   **Review Mode**: Pause AFTER execution to review output

## Configuration

Enable HITL on a node:

```typescript
const node = {
    type: 'agent',
    data: {
        label: 'Draft Email',
        model: 'openai/gpt-4o',
        prompt: 'Draft a professional email...',

        hitl: {
            enabled: true,
            mode: 'approval',
            prompt: 'Review this email before sending',
            timeout: 300000, // 5 minutes
            defaultAction: 'reject',
        },
    },
};
```

## HITLConfig

```typescript
interface HITLConfig {
    /** Enable HITL for this node */
    enabled: boolean;

    /** HITL mode */
    mode: 'approval' | 'input' | 'review';

    /** Prompt to show the human reviewer */
    prompt?: string;

    /** JSON Schema for input mode */
    inputSchema?: Record<string, unknown>;

    /** Custom options for approval mode */
    options?: Array<{
        id: string;
        label: string;
        action: 'approve' | 'reject' | 'custom';
    }>;

    /** Timeout in milliseconds (0 = no timeout) */
    timeout?: number;

    /** Default action when timeout is reached */
    defaultAction?: 'approve' | 'reject' | 'skip';
}
```

## Handling HITL Requests

Provide a callback to the execution adapter:

```typescript
const adapter = new OpenRouterExecutionAdapter(client, {
    onHITLRequest: async (request) => {
        // Show modal to user and wait for response
        const response = await showApprovalModal(request);
        return {
            requestId: request.id,
            action: response.action,
            data: response.modifiedContent,
            respondedAt: new Date().toISOString(),
        };
    },
});
```

## HITLRequest

The request object passed to your callback:

```typescript
interface HITLRequest {
    /** Unique request ID */
    id: string;

    /** Node requiring HITL */
    nodeId: string;

    /** Node label */
    nodeLabel: string;

    /** HITL mode */
    mode: 'approval' | 'input' | 'review';

    /** Prompt to show the user */
    prompt: string;

    /** Current execution context */
    context: {
        /** Current input to the node */
        input: string;
        /** Node output (only for review mode) */
        output?: string;
        /** Workflow name */
        workflowName: string;
        /** Session ID if available */
        sessionId?: string;
    };

    /** Available options (for approval mode) */
    options?: Array<{
        id: string;
        label: string;
        action: HITLAction;
    }>;

    /** Schema for input forms */
    inputSchema?: Record<string, unknown>;

    /** Request timestamp (ISO string) */
    createdAt: string;

    /** Expiry timestamp if timeout is set (ISO string) */
    expiresAt?: string;
}
```

## HITLResponse

Return this from your callback:

```typescript
interface HITLResponse {
    /** Request ID being responded to */
    requestId: string;

    /** Action taken */
    action: HITLAction;

    /** Data provided by the human (modified input/output or collected input) */
    data?: string | Record<string, unknown>;

    /** Identifier of the responder (optional) */
    respondedBy?: string;

    /** Response timestamp (ISO string) */
    respondedAt: string;
}

type HITLAction =
    | 'approve'
    | 'reject'
    | 'submit'
    | 'modify'
    | 'skip'
    | 'custom';
```

## Modes

### Approval Mode

Pause BEFORE node execution for approval:

```typescript
hitl: {
  enabled: true,
  mode: 'approval',
  prompt: 'Approve this action?',
  options: [
    { id: 'approve', label: 'Approve', action: 'approve' },
    { id: 'reject', label: 'Reject', action: 'reject' },
    { id: 'modify', label: 'Modify', action: 'modify' },
  ],
}
```

**Flow:**

1. Workflow reaches node
2. HITL callback is triggered
3. User approves/rejects
4. If approved, node executes
5. If rejected, execution stops or follows error path

### Input Mode

Pause to collect human input:

```typescript
hitl: {
  enabled: true,
  mode: 'input',
  prompt: 'Please provide additional details:',
  inputSchema: {
    type: 'object',
    properties: {
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      notes: { type: 'string' },
    },
    required: ['priority'],
  },
}
```

**Response:**

```typescript
{
  requestId: request.id,
  action: 'submit',
  data: {
    priority: 'high',
    notes: 'Urgent request',
  },
  respondedAt: new Date().toISOString(),
}
```

### Review Mode

Pause AFTER node execution to review output:

```typescript
hitl: {
  enabled: true,
  mode: 'review',
  prompt: 'Review the generated response:',
}
```

**Flow:**

1. Node executes
2. HITL callback is triggered with output
3. User can approve, reject, or modify
4. Modified content continues downstream

## Vue Modal Example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { HITLRequest, HITLResponse } from 'or3-workflow-core';

const showModal = ref(false);
const currentRequest = ref<HITLRequest | null>(null);
const resolveHITL = ref<((response: HITLResponse) => void) | null>(null);

async function handleHITLRequest(request: HITLRequest): Promise<HITLResponse> {
    return new Promise((resolve) => {
        currentRequest.value = request;
        resolveHITL.value = resolve;
        showModal.value = true;
    });
}

function onApprove() {
    resolveHITL.value?.({
        requestId: currentRequest.value!.id,
        action: 'approve',
        respondedAt: new Date().toISOString(),
    });
    closeModal();
}

function onReject() {
    resolveHITL.value?.({
        requestId: currentRequest.value!.id,
        action: 'reject',
        respondedAt: new Date().toISOString(),
    });
    closeModal();
}

function onModify(content: string) {
    resolveHITL.value?.({
        requestId: currentRequest.value!.id,
        action: 'modify',
        data: content,
        respondedAt: new Date().toISOString(),
    });
    closeModal();
}

function closeModal() {
    showModal.value = false;
    currentRequest.value = null;
    resolveHITL.value = null;
}
</script>

<template>
    <div v-if="showModal" class="modal-overlay">
        <div class="modal">
            <h2>{{ currentRequest?.nodeLabel }}</h2>
            <p>{{ currentRequest?.prompt }}</p>

            <div class="content">
                <p v-if="currentRequest?.context.input">
                    Input: {{ currentRequest.context.input }}
                </p>
                <p v-if="currentRequest?.context.output">
                    Output: {{ currentRequest.context.output }}
                </p>
            </div>

            <div class="actions">
                <button @click="onApprove">Approve</button>
                <button @click="onReject">Reject</button>
            </div>
        </div>
    </div>
</template>
```

## Timeout Handling

Configure automatic action on timeout:

```typescript
hitl: {
  enabled: true,
  mode: 'approval',
  timeout: 60000, // 1 minute
  defaultAction: 'reject', // Auto-reject after timeout
}
```

## Utility Functions

### createDefaultHITLConfig()

Create a config with defaults:

```typescript
const config = createDefaultHITLConfig({
    mode: 'approval',
    prompt: 'Please review',
});
// { enabled: false, mode: 'approval', prompt: 'Please review', ... }
```

### getDefaultApprovalOptions()

Get standard approve/reject options:

```typescript
const options = getDefaultApprovalOptions();
// [
//   { id: 'approve', label: 'Approve', action: 'approve' },
//   { id: 'reject', label: 'Reject', action: 'reject' },
// ]
```

### generateHITLRequestId()

Generate a unique request ID:

```typescript
const id = generateHITLRequestId();
// 'hitl_abc123xyz789'
```

## Type Guards

```typescript
import {
    isHITLConfig,
    isHITLRequest,
    isHITLResponse,
} from 'or3-workflow-core';

if (isHITLConfig(nodeData.hitl)) {
    // Safe to use as HITLConfig
}
```

## Best Practices

### 1. Always Handle Timeouts

```typescript
onHITLRequest: async (request) => {
    try {
        const response = await showModalWithTimeout(request, request.expiresAt);
        return response;
    } catch {
        return {
            requestId: request.id,
            action: 'reject',
            respondedAt: new Date().toISOString(),
        };
    }
};
```

### 2. Provide Clear Prompts

```typescript
hitl: {
  prompt: 'This email will be sent to the customer. Please review for accuracy and tone.',
}
```

### 3. Use Appropriate Modes

-   **Approval**: For actions with consequences (sending emails, making changes)
-   **Input**: When you need additional information
-   **Review**: For quality control of generated content

## Persistent HITL Storage

For long-running workflows that need to survive process restarts (multi-day approvals, async human tasks), implement the `HITLAdapter` interface.

### HITLAdapter Interface

```typescript
interface HITLAdapter {
    /** Store a pending HITL request */
    store(request: HITLRequest): Promise<void>;

    /** Get a pending HITL request by ID */
    get(requestId: string): Promise<HITLRequest | null>;

    /** Record a response to a HITL request */
    respond(requestId: string, response: HITLResponse): Promise<void>;

    /** Get all pending (unanswered) HITL requests */
    getPending(workflowId?: string, sessionId?: string): Promise<HITLRequest[]>;

    /** Get the response for a request, if it exists */
    getResponse(requestId: string): Promise<HITLResponse | null>;

    /** Delete a request and its response */
    delete(requestId: string): Promise<void>;

    /** Clear all pending requests */
    clear(workflowId?: string, sessionId?: string): Promise<void>;
}
```

### InMemoryHITLAdapter

The default in-memory implementation is suitable for interactive workflows where the process stays alive:

```typescript
import { InMemoryHITLAdapter } from 'or3-workflow-core';

const hitlAdapter = new InMemoryHITLAdapter();

// Store a request
await hitlAdapter.store(request);

// Get pending requests for a workflow
const pending = await hitlAdapter.getPending('my-workflow');

// Record a response
await hitlAdapter.respond(request.id, response);
```

### Redis-backed Implementation Example

For production with long-running workflows:

```typescript
import type {
    HITLAdapter,
    HITLRequest,
    HITLResponse,
} from 'or3-workflow-core';
import Redis from 'ioredis';

export class RedisHITLAdapter implements HITLAdapter {
    constructor(private redis: Redis) {}

    async store(request: HITLRequest): Promise<void> {
        const key = `hitl:requests:${request.id}`;
        await this.redis.set(key, JSON.stringify(request));

        // Set expiry if configured
        if (request.expiresAt) {
            const ttl = Math.max(
                0,
                new Date(request.expiresAt).getTime() - Date.now()
            );
            await this.redis.pexpire(key, ttl);
        }

        // Index by workflow for getPending queries
        await this.redis.sadd(
            `hitl:workflow:${request.context.workflowName}`,
            request.id
        );
    }

    async get(requestId: string): Promise<HITLRequest | null> {
        const data = await this.redis.get(`hitl:requests:${requestId}`);
        return data ? JSON.parse(data) : null;
    }

    async respond(requestId: string, response: HITLResponse): Promise<void> {
        // Get request to find workflow for cleanup
        const request = await this.get(requestId);

        // Store response
        await this.redis.set(
            `hitl:responses:${requestId}`,
            JSON.stringify(response)
        );

        // Remove from pending
        await this.redis.del(`hitl:requests:${requestId}`);
        if (request) {
            await this.redis.srem(
                `hitl:workflow:${request.context.workflowName}`,
                requestId
            );
        }
    }

    async getPending(workflowId?: string): Promise<HITLRequest[]> {
        if (workflowId) {
            const ids = await this.redis.smembers(
                `hitl:workflow:${workflowId}`
            );
            const requests = await Promise.all(ids.map((id) => this.get(id)));
            return requests.filter((r): r is HITLRequest => r !== null);
        }

        // Get all pending (use SCAN in production for large datasets)
        const keys = await this.redis.keys('hitl:requests:*');
        const requests = await Promise.all(
            keys.map(async (key) => {
                const data = await this.redis.get(key);
                return data ? JSON.parse(data) : null;
            })
        );
        return requests.filter((r): r is HITLRequest => r !== null);
    }

    async getResponse(requestId: string): Promise<HITLResponse | null> {
        const data = await this.redis.get(`hitl:responses:${requestId}`);
        return data ? JSON.parse(data) : null;
    }

    async delete(requestId: string): Promise<void> {
        const request = await this.get(requestId);
        await this.redis.del(`hitl:requests:${requestId}`);
        await this.redis.del(`hitl:responses:${requestId}`);
        if (request) {
            await this.redis.srem(
                `hitl:workflow:${request.context.workflowName}`,
                requestId
            );
        }
    }

    async clear(workflowId?: string): Promise<void> {
        if (workflowId) {
            const ids = await this.redis.smembers(
                `hitl:workflow:${workflowId}`
            );
            for (const id of ids) {
                await this.delete(id);
            }
            await this.redis.del(`hitl:workflow:${workflowId}`);
        } else {
            // Clear all (use SCAN in production)
            const keys = await this.redis.keys('hitl:*');
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
    }
}
```

### Usage with Persistent Adapter

```typescript
import { RedisHITLAdapter } from './adapters/redis-hitl';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const hitlAdapter = new RedisHITLAdapter(redis);

// Resume workflow after process restart
const pending = await hitlAdapter.getPending('my-workflow');
for (const request of pending) {
    // Check if response exists (user may have responded while we were down)
    const response = await hitlAdapter.getResponse(request.id);
    if (response) {
        // Resume workflow with the response
        await resumeWorkflow(request, response);
    } else {
        // Re-show the HITL UI
        await showApprovalModal(request);
    }
}
```

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Error Handling](./errors.md) - Error branching
