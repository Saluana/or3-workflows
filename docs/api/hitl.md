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
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),

    onHITLRequest: async (request) => {
        // Show modal to user and wait for response
        return await showApprovalModal(request);
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

    /** Content to review */
    content: string;

    /** Prompt to show the user */
    prompt?: string;

    /** Schema for input forms */
    inputSchema?: Record<string, unknown>;

    /** Available options */
    options?: Array<{
        id: string;
        label: string;
        action: HITLAction;
    }>;

    /** Timeout in ms */
    timeout?: number;

    /** Default action on timeout */
    defaultAction?: HITLAction;

    /** Request timestamp */
    createdAt: string;
}
```

## HITLResponse

Return this from your callback:

```typescript
interface HITLResponse {
    /** Action taken */
    action: HITLAction;

    /** Modified content (for 'modify' action) */
    modifiedContent?: string;

    /** User input data (for 'input' mode) */
    inputData?: Record<string, unknown>;

    /** Additional metadata */
    metadata?: Record<string, unknown>;
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
  action: 'submit',
  inputData: {
    priority: 'high',
    notes: 'Urgent request',
  },
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
    resolveHITL.value?.({ action: 'approve' });
    closeModal();
}

function onReject() {
    resolveHITL.value?.({ action: 'reject' });
    closeModal();
}

function onModify(content: string) {
    resolveHITL.value?.({
        action: 'modify',
        modifiedContent: content,
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
                {{ currentRequest?.content }}
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
        const response = await showModalWithTimeout(request, request.timeout);
        return response;
    } catch {
        return { action: request.defaultAction ?? 'reject' };
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
