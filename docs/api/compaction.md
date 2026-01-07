# Context Compaction

Automatically summarize conversation history when approaching token limits.

## Import

```typescript
import {
    ApproximateTokenCounter,
    type CompactionConfig,
    type CompactionResult,
    type TokenCounter,
    MODEL_CONTEXT_LIMITS,
    DEFAULT_COMPACTION_CONFIG,
    DEFAULT_SUMMARIZE_PROMPT,
    countMessageTokens,
    calculateThreshold,
    splitMessagesForCompaction,
    buildSummarizationPrompt,
    createSummaryMessage,
    estimateTokenUsage,
} from 'or3-workflow-core';
```

## Overview

Long conversations can exceed model context limits. Context compaction:

1. Monitors conversation token count
2. When threshold is reached, summarizes older messages
3. Preserves recent messages
4. Replaces old messages with a summary

## Setup

```typescript
import { OpenRouterExecutionAdapter, ApproximateTokenCounter } from 'or3-workflow-core';

const adapter = new OpenRouterExecutionAdapter(client, {
    tokenCounter: new ApproximateTokenCounter(),

    compaction: {
        threshold: 'auto', // or a specific number like 100000
        preserveRecent: 5,
        strategy: 'summarize',
        summarizeModel: 'openai/gpt-4o-mini',
    },
});
```

## CompactionConfig

```typescript
interface CompactionConfig {
    /**
     * Token threshold to trigger compaction.
     * - 'auto': Automatically calculate as modelLimit - 10000
     * - number: Specific token count threshold
     */
    threshold: 'auto' | number;

    /**
     * Number of recent messages to never compact.
     * These messages will always be preserved in full.
     * @default 5
     */
    preserveRecent: number;

    /**
     * Strategy to use when compacting messages.
     * @default 'summarize'
     */
    strategy: 'summarize' | 'truncate' | 'custom';

    /**
     * Model to use for summarization.
     * If not specified, uses the current execution model.
     */
    summarizeModel?: string;

    /**
     * Custom prompt for summarization.
     * Use {{messages}} placeholder for the messages to summarize.
     */
    summarizePrompt?: string;

    /**
     * Custom compaction function.
     * Required when strategy is 'custom'.
     */
    customCompactor?: (
        messages: ChatMessage[],
        targetTokens: number
    ) => Promise<ChatMessage[]>;
}
```

## CompactionResult

```typescript
interface CompactionResult {
    /** Whether compaction was performed */
    compacted: boolean;

    /** The resulting messages */
    messages: ChatMessage[];

    /** Token count before compaction */
    tokensBefore: number;

    /** Token count after compaction */
    tokensAfter: number;

    /** Number of messages that were compacted */
    messagesCompacted: number;

    /** Summary text if summarization was used */
    summary?: string;
}
```

## Strategies

### Summarize (Default)

Uses an LLM to create a summary of older messages:

```typescript
compaction: {
  threshold: 'auto',
  strategy: 'summarize',
  summarizeModel: 'openai/gpt-4o-mini',
  preserveRecent: 5,
}
```

### Truncate

Simply removes oldest messages:

```typescript
compaction: {
  threshold: 100000,
  strategy: 'truncate',
  preserveRecent: 10,
}
```

### Custom

Provide your own compaction logic:

```typescript
compaction: {
  threshold: 'auto',
  strategy: 'custom',
  preserveRecent: 5,
  customCompactor: async (messages, targetTokens) => {
    // Your custom logic
    return compactedMessages;
  },
}
```

## Token Counters

### ApproximateTokenCounter

Fast estimation based on character count (~4 characters per token):

```typescript
const counter = new ApproximateTokenCounter();

const tokens = counter.count('Hello, world!');
// ~3 tokens (based on ~4 chars per token)

const limit = counter.getLimit('openai/gpt-4o');
// 128000
```

#### Options

```typescript
const counter = new ApproximateTokenCounter({
    charsPerToken: 4, // Average characters per token
    customLimits: {
        'my-custom-model': 64000,
    },
});

// Add custom limit
counter.setLimit('another-model', 32000);
```

### Custom Token Counter

Implement `TokenCounter` for accurate counting:

```typescript
import { TokenCounter } from 'or3-workflow-core';
import { encoding_for_model } from 'tiktoken';

class TiktokenCounter implements TokenCounter {
    private encoder = encoding_for_model('gpt-4o');

    count(text: string): number {
        return this.encoder.encode(text).length;
    }

    getLimit(model: string): number {
        return MODEL_CONTEXT_LIMITS[model] ?? 128000;
    }
}
```

## TokenCounter Interface

```typescript
interface TokenCounter {
    /**
     * Count the approximate number of tokens in text.
     * @param text - Text to count tokens in
     * @param model - Optional model name for model-specific counting
     * @returns Approximate token count
     */
    count(text: string, model?: string): number;

    /**
     * Get the context limit for a specific model.
     * @param model - Model identifier (e.g., 'openai/gpt-4o')
     * @returns Maximum context tokens for the model
     */
    getLimit(model: string): number;
}
```

## Model Context Limits

Pre-configured limits for popular models:

```typescript
import { MODEL_CONTEXT_LIMITS } from 'or3-workflow-core';

console.log(MODEL_CONTEXT_LIMITS['openai/gpt-4o']); // 128000
console.log(MODEL_CONTEXT_LIMITS['anthropic/claude-3.5-sonnet']); // 200000
console.log(MODEL_CONTEXT_LIMITS['google/gemini-1.5-pro']); // 1000000
```

Available models include:

| Model                              | Context Limit |
| ---------------------------------- | ------------- |
| `openai/gpt-4o`                    | 128,000       |
| `openai/gpt-4o-mini`               | 128,000       |
| `openai/o1`                        | 200,000       |
| `anthropic/claude-3.5-sonnet`      | 200,000       |
| `anthropic/claude-3-opus`          | 200,000       |
| `google/gemini-1.5-pro`            | 1,000,000     |
| `meta-llama/llama-3.1-405b-instruct` | 128,000     |
| `mistralai/mistral-large`          | 128,000       |

## How Compaction Works

```
Before Compaction:
┌─────────────────────────────────────────────┐
│ System Prompt                               │
│ User: Message 1                             │
│ Assistant: Response 1                       │
│ User: Message 2                             │
│ Assistant: Response 2                       │
│ ... (many more messages) ...                │
│ User: Message N-2                           │
│ Assistant: Response N-2                     │
│ User: Message N-1                           │
│ Assistant: Response N-1                     │
│ User: Latest message                        │
└─────────────────────────────────────────────┘
Total: 150,000 tokens (exceeds limit!)

After Compaction:
┌─────────────────────────────────────────────┐
│ System Prompt                               │
│ System: [Summary of older conversation]     │
│ User: Message N-2                           │  ← preserveLastN
│ Assistant: Response N-2                     │
│ User: Message N-1                           │
│ Assistant: Response N-1                     │
│ User: Latest message                        │
└─────────────────────────────────────────────┘
Total: 60,000 tokens ✓
```

## Utility Functions

### countMessageTokens()

Count tokens in a message array:

```typescript
import { countMessageTokens, ApproximateTokenCounter } from 'or3-workflow-core';

const counter = new ApproximateTokenCounter();
const tokens = countMessageTokens(messages, counter);
```

### calculateThreshold()

Calculate the compaction threshold for a model:

```typescript
import { calculateThreshold } from 'or3-workflow-core';

const threshold = calculateThreshold(compactionConfig, 'openai/gpt-4o', counter);
// Returns modelLimit - 10000 for 'auto', or the specified threshold
```

### splitMessagesForCompaction()

Split messages into preserved and to-compact:

```typescript
import { splitMessagesForCompaction } from 'or3-workflow-core';

const { toPreserve, toCompact } = splitMessagesForCompaction(
    messages,
    5 // preserveRecent
);
```

### formatMessagesForSummary()

Format messages for summarization prompt:

```typescript
import { formatMessagesForSummary } from 'or3-workflow-core';

const formatted = formatMessagesForSummary(messages);
// "User: Hello\n\nAssistant: Hi there!\n\n..."
```

### buildSummarizationPrompt()

Build the summarization prompt:

```typescript
import { buildSummarizationPrompt } from 'or3-workflow-core';

const prompt = buildSummarizationPrompt(messages, compactionConfig);
```

### createSummaryMessage()

Create a summary system message:

```typescript
import { createSummaryMessage } from 'or3-workflow-core';

const summaryMessage = createSummaryMessage(summaryText);
// { role: 'system', content: '[Previous conversation summary]: ...' }
```

### estimateTokenUsage()

Estimate token usage for an LLM request:

```typescript
import { estimateTokenUsage } from 'or3-workflow-core';

const usage = estimateTokenUsage({
    model: 'openai/gpt-4o',
    messages: conversationHistory,
    output: 'LLM response text',
    tokenCounter: counter,
    compaction: compactionConfig,
});

console.log(usage.promptTokens);
console.log(usage.completionTokens);
console.log(usage.remainingContext);
console.log(usage.remainingBeforeCompaction);
```

## Default Summarize Prompt

```typescript
import { DEFAULT_SUMMARIZE_PROMPT } from 'or3-workflow-core';

// The default prompt:
const prompt = `Summarize the following conversation history concisely, preserving key information, decisions, and context that would be important for continuing the conversation:

{{messages}}

Provide a concise summary that captures the essential context. Focus on:
- Key decisions made
- Important information shared
- Current state of the task
- Any pending questions or actions`;
```

Customize with `summarizePrompt`:

```typescript
compaction: {
  summarizePrompt: `
    Create a brief summary of this conversation.
    Focus on: {{messages}}
  `,
}
```

## Listening for Compaction Events

Use the `onContextCompacted` callback to track when compaction occurs:

```typescript
const callbacks: ExecutionCallbacks = {
    onContextCompacted: (result) => {
        console.log(`Compacted: ${result.tokensBefore} → ${result.tokensAfter} tokens`);
        console.log(`Messages compacted: ${result.messagesCompacted}`);
        if (result.summary) {
            console.log('Summary:', result.summary);
        }
    },
    // ... other callbacks
};
```

## Best Practices

### 1. Use Auto Threshold

```typescript
compaction: {
  threshold: 'auto', // Automatically calculates modelLimit - 10000
  preserveRecent: 5,
}
```

### 2. Preserve Enough Context

```typescript
compaction: {
  preserveRecent: 5, // Keep recent turns for context
}
```

### 3. Use Fast Models for Summary

```typescript
compaction: {
  summarizeModel: 'openai/gpt-4o-mini', // Fast and cheap
}
```

### 4. Monitor Compaction Events

```typescript
const callbacks: ExecutionCallbacks = {
    onContextCompacted: (result) => {
        console.log(
            `Compacted ${result.tokensBefore} → ${result.tokensAfter} tokens`
        );
    },
};
```

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Token Counters](../adapters/token-counter.md) - Custom counters
