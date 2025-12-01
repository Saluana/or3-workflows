# Human-in-the-Loop (HITL)

Pause workflow execution for human review, approval, or input.

## Import

```typescript
import {
    type HITLConfig,
    type HITLRequest,
    type HITLResponse,
    type HITLAction,
    createDefaultHITLConfig,
} from '@or3/workflow-core';
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
import type { HITLRequest, HITLResponse } from '@or3/workflow-core';

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
} from '@or3/workflow-core';

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

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Error Handling](./errors.md) - Error branching
