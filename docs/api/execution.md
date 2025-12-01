# Execution

The `OpenRouterExecutionAdapter` runs workflows using the OpenRouter API.

## Import

```typescript
import {
    OpenRouterExecutionAdapter,
    type ExecutionOptions,
    type ExecutionCallbacks,
    type ExecutionResult,
} from '@or3/workflow-core';
import OpenRouter from '@openrouter/sdk';
```

## Setup

```typescript
const client = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

const adapter = new OpenRouterExecutionAdapter(client, {
    defaultModel: 'openai/gpt-4o-mini',
});
```

## Configuration Options

```typescript
interface ExecutionOptions {
    /** Global tools available to all agents */
    tools?: ToolDefinition[];

    /** Fallback model when node doesn't specify one */
    defaultModel?: string;

    /** Maximum retry attempts for failed API calls */
    maxRetries?: number;

    /** Base delay in ms between retries */
    retryDelayMs?: number;

    /** Safety limit for graph traversal iterations */
    maxIterations?: number;

    /** Global tool call handler */
    onToolCall?: (name: string, args: any) => Promise<string>;

    /** Pluggable long-term memory adapter */
    memory?: MemoryAdapter;

    /** Provide an existing session ID to reuse */
    sessionId?: string;

    /** Registry of available subflows */
    subflowRegistry?: SubflowRegistry;

    /** Maximum nesting depth for subflows (default: 10) */
    maxSubflowDepth?: number;

    /** Configuration for automatic context compaction */
    compaction?: CompactionConfig;

    /** Token counter for measuring context size */
    tokenCounter?: TokenCounter;

    /** Enable debug logging for LLM calls */
    debug?: boolean;

    /** Run workflow validation before execution (default: true) */
    preflight?: boolean;

    /** Maximum tool call iterations for agent nodes (default: 10) */
    maxToolIterations?: number;

    /** Behavior when max tool iterations is reached */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';

    /** Custom evaluators for while loop nodes */
    customEvaluators?: Record<string, (context, loopState) => Promise<boolean>>;

    /** Callback for human-in-the-loop requests */
    onHITLRequest?: HITLCallback;
}
```

## Basic Execution

```typescript
const workflow = {
    meta: { version: '2.0.0', name: 'My Workflow' },
    nodes: editor.nodes,
    edges: editor.edges,
};

const callbacks: ExecutionCallbacks = {
    onNodeStart: (nodeId) => console.log(`Starting: ${nodeId}`),
    onNodeFinish: (nodeId, output) => console.log(`Finished: ${nodeId}`),
    onNodeError: (nodeId, error) => console.error(`Error: ${nodeId}`, error),
    onToken: (nodeId, token) => process.stdout.write(token),
};

const result = await adapter.execute(
    workflow,
    { text: 'Hello, how can you help me?' },
    callbacks
);

console.log(result.output);
```

## Preflight Validation

By default, workflows are validated before execution:

```typescript
// Validation is enabled by default
const adapter = new OpenRouterExecutionAdapter(client, {
    preflight: true, // default
});

// Disable preflight validation for performance
const adapter = new OpenRouterExecutionAdapter(client, {
    preflight: false,
});
```

When preflight validation fails, the result includes validation errors:

```typescript
const result = await adapter.execute(workflow, input, callbacks);

if (!result.success && result.error?.message.includes('validation failed')) {
    console.error('Workflow has validation errors');
}
```

## With Conversation History

```typescript
const history: ChatMessage[] = [
    { role: 'user', content: 'My name is Alice' },
    { role: 'assistant', content: 'Hello Alice! How can I help?' },
];

const result = await adapter.execute({
    nodes,
    edges,
    input: 'What is my name?',
    conversationHistory: history,
});
// Output: "Your name is Alice."
```

## Callbacks

### ExecutionCallbacks Interface

```typescript
interface ExecutionCallbacks {
    /** Called when a node begins execution */
    onNodeStart: (nodeId: string) => void;

    /** Called when a node completes successfully */
    onNodeFinish: (nodeId: string, output: string) => void;

    /** Called when a node encounters an error */
    onNodeError: (nodeId: string, error: Error) => void;

    /** Called for each streaming token from the LLM */
    onToken: (nodeId: string, token: string) => void;

    /** Called for reasoning/thinking tokens (optional) */
    onReasoning?: (nodeId: string, token: string) => void;

    /** Called when a router selects a route (optional) */
    onRouteSelected?: (nodeId: string, routeId: string) => void;

    /** Called when token usage is estimated (optional) */
    onTokenUsage?: (nodeId: string, usage: TokenUsageDetails) => void;

    /** Called when context compaction occurs (optional) */
    onContextCompacted?: (result: CompactionResult) => void;

    /** Called for parallel branch streaming (optional) */
    onBranchToken?: (nodeId: string, branchId: string, branchLabel: string, token: string) => void;

    /** Called when a parallel branch starts (optional) */
    onBranchStart?: (nodeId: string, branchId: string, branchLabel: string) => void;

    /** Called when a parallel branch completes (optional) */
    onBranchComplete?: (nodeId: string, branchId: string, branchLabel: string, output: string) => void;
}
```

### Node Status Updates

```typescript
const callbacks: ExecutionCallbacks = {
    onNodeStart: (nodeId) => {
        setNodeStatus(nodeId, 'active');
    },

    onNodeFinish: (nodeId, output) => {
        setNodeStatus(nodeId, 'completed');
        console.log(`Node ${nodeId} output:`, output);
    },

    onNodeError: (nodeId, error) => {
        setNodeStatus(nodeId, 'error');
        console.error(`Node ${nodeId} failed:`, error);
    },

    onToken: (nodeId, token) => {
        appendStreamingContent(token);
    },
};
```

### Token Usage Tracking

```typescript
const callbacks: ExecutionCallbacks = {
    // ... other callbacks
    onTokenUsage: (nodeId, usage) => {
        console.log(`Node ${nodeId} used ${usage.totalTokens} tokens`);
        console.log(`Remaining context: ${usage.remainingContext}`);
    },
};
```

## Stopping Execution

```typescript
// Start execution
const promise = adapter.execute({ nodes, edges, input });

// Stop after some time
setTimeout(() => {
    adapter.stop();
}, 5000);

// Wait for result (will be partial)
const result = await promise;
console.log(result.cancelled); // true
```

## Checking Status

```typescript
if (adapter.isRunning()) {
    console.log('Workflow is executing');
}
```

## ExecutionResult

```typescript
interface ExecutionResult {
    /** Whether execution completed successfully */
    success: boolean;

    /** Final output text */
    output: string;

    /** Output from each executed node, keyed by node ID */
    nodeOutputs: Record<string, string>;

    /** Error that caused execution to fail (if success is false) */
    error?: Error;

    /** Total execution duration in milliseconds */
    duration: number;

    /** Token usage statistics */
    usage?: TokenUsage;

    /** Per-request token usage details */
    tokenUsageDetails?: Array<TokenUsageDetails & { nodeId: string }>;
}

interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

interface TokenUsageDetails extends TokenUsage {
    /** Model used for the request */
    model: string;
    /** Maximum context window for the model */
    contextLimit: number;
    /** Compaction threshold in tokens (if enabled) */
    compactionThreshold?: number;
    /** Remaining tokens before compaction would trigger */
    remainingBeforeCompaction?: number;
    /** Remaining tokens before hitting model context limit */
    remainingContext: number;
}
```

## Error Handling

```typescript
import { ExecutionError } from '@or3/workflow-core';

const result = await adapter.execute(workflow, input, callbacks);

if (!result.success) {
    if (result.error instanceof ExecutionError) {
        console.error('Node:', result.error.nodeId);
        console.error('Code:', result.error.code);
        console.error('Message:', result.error.message);

        if (result.error.retry) {
            console.error('Retry attempts:', result.error.retry.attempts);
        }
    }
}
```

## With HITL

```typescript
const adapter = new OpenRouterExecutionAdapter(client, {
    onHITLRequest: async (request) => {
        // Show modal to user
        const userResponse = await showApprovalModal(request);

        return {
            requestId: request.id,
            action: userResponse.action, // 'approve' | 'reject' | 'skip' | 'modify'
            data: userResponse.content,
            respondedAt: new Date().toISOString(),
        };
    },
});
```

See [Human-in-the-Loop](./hitl.md) for details.

## With Context Compaction

```typescript
import { ApproximateTokenCounter } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter(client, {
    tokenCounter: new ApproximateTokenCounter(),

    compaction: {
        strategy: 'summarize', // 'summarize' | 'truncate' | 'custom'
        threshold: 0.8, // Trigger at 80% of context limit
        preserveRecent: 5, // Keep last 5 messages
        summarizeModel: 'openai/gpt-4o-mini',
    },
});
```

See [Context Compaction](./compaction.md) for details.

## With Memory

```typescript
import { InMemoryAdapter } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter(client, {
    memory: new InMemoryAdapter(),
});
```

## Execution Flow

```
1. Start Node
   └─ Pass input to first connected node

2. Agent Nodes
   ├─ HITL check (before execution if approval mode)
   ├─ Call OpenRouter API
   ├─ Stream response (if enabled)
   ├─ HITL check (after execution if review mode)
   └─ Pass output to next node

3. Router Nodes
   ├─ Call LLM for classification
   └─ Route to matching branch

4. Parallel Nodes
   ├─ Execute all branches concurrently
   └─ Merge results

5. While Loop Nodes
   ├─ Evaluate condition
   ├─ Execute body if true
   └─ Repeat until false or max iterations

6. Output Nodes
   └─ Format and return final output
```

## Model Capabilities

Check what a model supports:

```typescript
const capabilities = await adapter.getModelCapabilities('openai/gpt-4o');
console.log(capabilities.inputModalities); // ['text', 'image']
console.log(capabilities.contextLength); // 128000
```

## Multimodal Input

```typescript
const result = await adapter.execute({
    nodes,
    edges,
    input: {
        text: 'What is in this image?',
        attachments: [
            {
                id: 'img1',
                type: 'image',
                name: 'photo.jpg',
                mimeType: 'image/jpeg',
                url: 'data:image/jpeg;base64,...',
            },
        ],
    },
});
```

## Next Steps

-   [Human-in-the-Loop](./hitl.md) - Pause for human review
-   [Context Compaction](./compaction.md) - Handle long conversations
-   [Error Handling](./errors.md) - Retry and error branching
