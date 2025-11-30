# Context Compaction

Automatically summarize conversation history when approaching token limits.

## Import

```typescript
import {
    ApproximateTokenCounter,
    type CompactionConfig,
    type TokenCounter,
    MODEL_CONTEXT_LIMITS,
} from '@or3/workflow-core';
```

## Overview

Long conversations can exceed model context limits. Context compaction:

1. Monitors conversation token count
2. When threshold is reached, summarizes older messages
3. Preserves recent messages and system prompt
4. Replaces old messages with a summary

## Setup

```typescript
import {
    OpenRouterExecutionAdapter,
    ApproximateTokenCounter,
} from '@or3/workflow-core';

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

## CompactionConfig

```typescript
interface CompactionConfig {
    /** Enable automatic compaction */
    enabled: boolean;

    /** Token threshold to trigger compaction */
    maxTokens: number;

    /** Target tokens after compaction */
    targetTokens: number;

    /** Model to use for summarization */
    summaryModel?: string;

    /** Preserve system prompt in summary */
    preserveSystemPrompt?: boolean;

    /** Number of recent messages to preserve */
    preserveLastN?: number;

    /** Custom summarization prompt */
    summaryPrompt?: string;

    /** Compaction strategy */
    strategy?: 'summarize' | 'truncate' | 'custom';

    /** Custom compactor function */
    customCompactor?: (messages: ChatMessage[]) => Promise<ChatMessage[]>;
}
```

## Strategies

### Summarize (Default)

Uses an LLM to create a summary of older messages:

```typescript
compaction: {
  enabled: true,
  strategy: 'summarize',
  summaryModel: 'openai/gpt-4o-mini',
  maxTokens: 100000,
  targetTokens: 60000,
}
```

### Truncate

Simply removes oldest messages:

```typescript
compaction: {
  enabled: true,
  strategy: 'truncate',
  maxTokens: 100000,
  preserveLastN: 10,
}
```

### Custom

Provide your own compaction logic:

```typescript
compaction: {
  enabled: true,
  strategy: 'custom',
  customCompactor: async (messages) => {
    // Your custom logic
    return compactedMessages;
  },
}
```

## Token Counters

### ApproximateTokenCounter

Fast estimation based on character count:

```typescript
const counter = new ApproximateTokenCounter();

const tokens = counter.count('Hello, world!');
// ~3 tokens (based on ~4 chars per token)
```

#### Options

```typescript
const counter = new ApproximateTokenCounter({
    charsPerToken: 4, // Average characters per token
    modelLimits: {
        'openai/gpt-4o': 128000,
        'anthropic/claude-3': 200000,
    },
});
```

### Custom Token Counter

Implement `TokenCounter` for accurate counting:

```typescript
import { TokenCounter } from '@or3/workflow-core';
import { encoding_for_model } from 'tiktoken';

class TiktokenCounter implements TokenCounter {
    private encoder = encoding_for_model('gpt-4o');

    count(text: string): number {
        return this.encoder.encode(text).length;
    }

    countMessages(messages: ChatMessage[]): number {
        return messages.reduce((sum, m) => {
            const content =
                typeof m.content === 'string'
                    ? m.content
                    : JSON.stringify(m.content);
            return sum + this.count(content) + 4; // +4 for message overhead
        }, 0);
    }

    getLimit(model: string): number {
        const limits: Record<string, number> = {
            'gpt-4o': 128000,
            'gpt-4o-mini': 128000,
            'claude-3-5-sonnet': 200000,
        };
        return limits[model] ?? 128000;
    }
}
```

## TokenCounter Interface

```typescript
interface TokenCounter {
    /** Count tokens in text */
    count(text: string): number;

    /** Count tokens in message array */
    countMessages?(messages: ChatMessage[]): number;

    /** Get context limit for model */
    getLimit?(model: string): number;
}
```

## Model Context Limits

Pre-configured limits for common models:

```typescript
import { MODEL_CONTEXT_LIMITS } from '@or3/workflow-core';

console.log(MODEL_CONTEXT_LIMITS['gpt-4o']); // 128000
console.log(MODEL_CONTEXT_LIMITS['claude-3']); // 200000
```

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
import {
    countMessageTokens,
    ApproximateTokenCounter,
} from '@or3/workflow-core';

const counter = new ApproximateTokenCounter();
const tokens = countMessageTokens(messages, counter);
```

### splitMessagesForCompaction()

Split messages into preserved and to-compact:

```typescript
import { splitMessagesForCompaction } from '@or3/workflow-core';

const { preserved, toCompact } = splitMessagesForCompaction(
    messages,
    5 // preserveLastN
);
```

### formatMessagesForSummary()

Format messages for summarization prompt:

```typescript
import { formatMessagesForSummary } from '@or3/workflow-core';

const formatted = formatMessagesForSummary(messages);
// "User: Hello\nAssistant: Hi there!\n..."
```

### buildSummarizationPrompt()

Build the summarization prompt:

```typescript
import {
    buildSummarizationPrompt,
    DEFAULT_SUMMARIZE_PROMPT,
} from '@or3/workflow-core';

const prompt = buildSummarizationPrompt(messages, DEFAULT_SUMMARIZE_PROMPT);
```

### createSummaryMessage()

Create a summary system message:

```typescript
import { createSummaryMessage } from '@or3/workflow-core';

const summaryMessage = createSummaryMessage(summaryText);
// { role: 'system', content: '[Previous conversation summary]...' }
```

## Default Summarize Prompt

```typescript
const DEFAULT_SUMMARIZE_PROMPT = `
Summarize the following conversation, preserving:
1. Key facts and decisions
2. User preferences and context
3. Important outcomes

Keep the summary concise but informative.

Conversation:
{{messages}}
`;
```

Customize with `summaryPrompt`:

```typescript
compaction: {
  summaryPrompt: `
    Create a brief summary of this conversation.
    Focus on: {{messages}}
  `,
}
```

## Best Practices

### 1. Set Appropriate Thresholds

```typescript
compaction: {
  maxTokens: modelLimit * 0.8, // 80% of limit
  targetTokens: modelLimit * 0.5, // Compact to 50%
}
```

### 2. Preserve Enough Context

```typescript
compaction: {
  preserveLastN: 5, // Keep recent turns for context
  preserveSystemPrompt: true, // Keep system instructions
}
```

### 3. Use Fast Models for Summary

```typescript
compaction: {
  summaryModel: 'openai/gpt-4o-mini', // Fast and cheap
}
```

### 4. Monitor Compaction Events

```typescript
adapter.on('compaction', (result) => {
    console.log(
        `Compacted ${result.originalTokens} → ${result.compactedTokens}`
    );
});
```

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Token Counters](../adapters/token-counter.md) - Custom counters
