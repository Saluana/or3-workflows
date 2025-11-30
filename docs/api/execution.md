# Execution

The `OpenRouterExecutionAdapter` runs workflows using the OpenRouter API.

## Import

```typescript
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';
import OpenRouter from '@openrouter/sdk';
```

## Setup

```typescript
const client = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
});

const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
});
```

## Configuration Options

```typescript
interface ExecutionOptions {
    /** OpenRouter client instance */
    client: OpenRouter;

    /** Extensions for node execution */
    extensions: Extension[];

    /** Memory adapter for memory nodes */
    memoryAdapter?: MemoryAdapter;

    /** Token counter for compaction */
    tokenCounter?: TokenCounter;

    /** Context compaction config */
    compaction?: CompactionConfig;

    /** Subflow registry */
    subflowRegistry?: SubflowRegistry;

    /** Callbacks for execution events */
    onNodeStart?: (nodeId: string) => void;
    onNodeComplete?: (nodeId: string, result: any) => void;
    onNodeError?: (nodeId: string, error: Error) => void;
    onStreamChunk?: (chunk: string) => void;
    onHITLRequest?: (request: HITLRequest) => Promise<HITLResponse>;
}
```

## Basic Execution

```typescript
const result = await adapter.execute({
    nodes: editor.nodes,
    edges: editor.edges,
    input: 'Hello, how can you help me?',
});

console.log(result.output);
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

### Node Status Updates

```typescript
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),

    onNodeStart: (nodeId) => {
        setNodeStatus(nodeId, 'active');
    },

    onNodeComplete: (nodeId, result) => {
        setNodeStatus(nodeId, 'completed');
        console.log(`Node ${nodeId} output:`, result);
    },

    onNodeError: (nodeId, error) => {
        setNodeStatus(nodeId, 'error');
        console.error(`Node ${nodeId} failed:`, error);
    },
});
```

### Streaming

```typescript
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),

    onStreamChunk: (chunk) => {
        // Append streaming content
        streamingContent.value += chunk;
    },
});
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
    /** Final output text */
    output: string;

    /** Whether execution was cancelled */
    cancelled?: boolean;

    /** Total tokens used */
    totalTokens?: number;

    /** Model used */
    model?: string;

    /** Execution metadata */
    metadata?: Record<string, unknown>;

    /** Output node result (if output node was used) */
    formattedOutput?: string;
}
```

## Error Handling

```typescript
try {
    const result = await adapter.execute({ nodes, edges, input });
} catch (error) {
    if (error instanceof ExecutionError) {
        console.error('Node:', error.nodeId);
        console.error('Message:', error.message);
        console.error('Original:', error.cause);
    }
}
```

## With HITL

```typescript
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),

    onHITLRequest: async (request) => {
        // Show modal to user
        const userResponse = await showApprovalModal(request);

        return {
            action: userResponse.action,
            modifiedContent: userResponse.content,
        };
    },
});
```

See [Human-in-the-Loop](./hitl.md) for details.

## With Context Compaction

```typescript
import { ApproximateTokenCounter } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
    tokenCounter: new ApproximateTokenCounter(),

    compaction: {
        enabled: true,
        maxTokens: 100000,
        targetTokens: 60000,
        summaryModel: 'openai/gpt-4o-mini',
        preserveSystemPrompt: true,
        preserveLastN: 5,
    },
});
```

See [Context Compaction](./compaction.md) for details.

## With Memory

```typescript
import { InMemoryAdapter } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
    memoryAdapter: new InMemoryAdapter(),
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
