# Agent Node

LLM-powered processing node using OpenRouter.

## Overview

Agent nodes are the core building blocks of AI workflows. They process input using a configured LLM model and system prompt.

## Import

```typescript
import { AgentNodeExtension } from 'or3-workflow-core';
```

## Configuration

```typescript
interface AgentNodeData {
    /** Display label */
    label: string;

    /** OpenRouter model ID */
    model: string;

    /** System prompt */
    prompt?: string;

    /** Temperature (0-2, default: 1) */
    temperature?: number;

    /** Maximum tokens in response */
    maxTokens?: number;

    /** Enabled tool IDs */
    tools?: string[];

    /** HITL configuration */
    hitl?: HITLConfig;

    /** Error handling */
    errorHandling?: NodeErrorConfig;

    /** Maximum tool call iterations for this node */
    maxToolIterations?: number;

    /**
     * Behavior when max tool iterations is reached.
     * - 'warning': Add a warning to output and continue (default)
     * - 'error': Throw an error
     * - 'hitl': Trigger human-in-the-loop for approval to continue
     */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';

    /** Multimodal capabilities */
    acceptsImages?: boolean;
    acceptsAudio?: boolean;
    acceptsVideo?: boolean;
    acceptsFiles?: boolean;
}
```

## Ports

| Port       | Type   | Description                       |
| ---------- | ------ | --------------------------------- |
| `input`    | Input  | Receives input from previous node |
| `output`   | Output | LLM response                      |
| `error`    | Output | Error branch (if configured)      |
| `rejected` | Output | HITL rejection branch             |

## Usage

```typescript
editor.commands.createNode(
    'agent',
    {
        label: 'Assistant',
        model: 'openai/gpt-4o',
        prompt: 'You are a helpful assistant. Be concise.',
        temperature: 0.7,
    },
    { x: 100, y: 200 }
);
```

## Models

Use any model from [OpenRouter](https://openrouter.ai/models):

```typescript
// OpenAI
model: 'openai/gpt-4o';
model: 'openai/gpt-4o-mini';

// Anthropic
model: 'anthropic/claude-3.5-sonnet';
model: 'anthropic/claude-3-opus';

// Google
model: 'google/gemini-pro-1.5';

// Meta
model: 'meta-llama/llama-3.1-405b-instruct';
```

## Prompts

The system prompt defines the agent's behavior:

```typescript
{
    prompt: `You are a customer service agent for TechCorp.

Rules:
- Be polite and professional
- Answer only questions about our products
- Escalate billing issues to a human

Products: Widget Pro, Widget Plus, Widget Enterprise`;
}
```

### Prompt Variables

Use template syntax for dynamic prompts:

```typescript
{
    prompt: `You are helping {{user_name}} with {{topic}}.`;
}
```

## Temperature

Controls randomness:

| Value | Behavior               |
| ----- | ---------------------- |
| 0.0   | Deterministic, focused |
| 0.5   | Balanced               |
| 1.0   | Default, creative      |
| 2.0   | Very random            |

```typescript
// For classification tasks
{
    temperature: 0;
}

// For creative writing
{
    temperature: 1.2;
}
```

## Max Tokens

Limit response length:

```typescript
{
  maxTokens: 500, // Short responses
}
```

## HITL Integration

Enable human review:

```typescript
{
  hitl: {
    enabled: true,
    mode: 'review',
    prompt: 'Review this response before sending to customer',
  },
}
```

See [Human-in-the-Loop](../api/hitl.md) for details.

## Error Handling

Configure retry and branching:

```typescript
{
  errorHandling: {
    mode: 'branch',
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      skipOn: ['AUTH', 'VALIDATION'],
    },
  },
}
```

See [Error Handling](../api/errors.md) for details.

## Tool Iteration Limits

Control how many tool call iterations are allowed:

```typescript
{
  // Maximum iterations (default: 10)
  maxToolIterations: 5,

  // What to do when limit is reached
  onMaxToolIterations: 'warning', // 'warning' | 'error' | 'hitl'
}
```

When `hitl` is selected, the agent pauses for human approval to continue.

## Tools

Enable function calling:

```typescript
import { toolRegistry } from 'or3-workflow-core';

// Register a tool
toolRegistry.register({
  name: 'search',
  description: 'Search the knowledge base',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    return await searchKnowledgeBase(args.query);
  },
});

// Enable on node
{
  tools: ['search'],
}
```

## Multimodal

Accept images, audio, or files:

```typescript
{
  model: 'openai/gpt-4o', // Must support vision
  acceptsImages: true,
}
```

Usage:

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
                mimeType: 'image/jpeg',
                url: 'data:image/jpeg;base64,...',
            },
        ],
    },
});
```

## Validation

| Code               | Type    | Description        |
| ------------------ | ------- | ------------------ |
| `MISSING_MODEL`    | Error   | No model selected  |
| `NO_INCOMING_EDGE` | Error   | Node not connected |
| `EMPTY_PROMPT`     | Warning | No system prompt   |

## Execution Flow

```
1. Receive input from previous node
2. Check HITL (approval mode)
3. Retry loop:
   a. Build messages (history + input)
   b. Call OpenRouter API
   c. Stream response
   d. Handle errors/retry
4. Check HITL (review mode)
5. Pass output to next node
```

## Streaming

Responses stream by default:

```typescript
const callbacks: ExecutionCallbacks = {
    onToken: (nodeId, token) => {
        streamingContent.value += token;
    },
    onReasoning: (nodeId, token) => {
        // For models that support thinking/reasoning
        reasoningContent.value += token;
    },
};

const result = await adapter.execute(workflow, input, callbacks);
```

## StarterKit Configuration

```typescript
StarterKit.configure({
    agent: {
        defaultModel: 'anthropic/claude-3.5-sonnet',
        defaultTemperature: 0.7,
    },
});
```

## Best Practices

### 1. Write Clear Prompts

```typescript
{
    prompt: `You are a product classifier.

Input: A customer query
Output: One of: billing, technical, sales, general

Respond with ONLY the category name.`;
}
```

### 2. Use Appropriate Models

-   **GPT-4o**: Complex reasoning, long context
-   **GPT-4o-mini**: Fast, cost-effective
-   **Claude 3.5 Sonnet**: Balanced performance
-   **Llama 3.1**: Open source option

### 3. Set Temperature by Task

-   Classification: 0
-   Q&A: 0.3
-   Conversation: 0.7
-   Creative: 1.0+

### 4. Handle Errors

Always configure error handling for production:

```typescript
{
  errorHandling: {
    mode: 'branch',
    retry: {
      maxRetries: 2,
      baseDelay: 1000,
    },
  },
}
```

## Vue Component

The `AgentNode.vue` component shows the label, model, and handles.

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="agent-node">
            <div class="label">{{ node.data.label }}</div>
            <div class="model">{{ node.data.model }}</div>
        </div>
    </NodeWrapper>
</template>
```

## Next Steps

-   [Router Node](./router.md) - Conditional branching
-   [Parallel Node](./parallel.md) - Concurrent execution
-   [Human-in-the-Loop](../api/hitl.md) - Human review
