# Token Counter Adapters

Count tokens for context window management and compaction.

## Overview

Token counter adapters provide accurate token counting for different LLM providers, enabling context compaction to work correctly.

## Interface

```typescript
interface TokenCounterAdapter {
    /** Count tokens in text */
    count(text: string): Promise<number> | number;

    /** Count tokens in messages */
    countMessages(messages: Message[]): Promise<number> | number;

    /** Get model's context window size */
    getContextLimit(): number;
}

interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
```

## Built-in Adapters

### SimpleTokenCounter

Fast approximation (4 characters ≈ 1 token):

```typescript
import { SimpleTokenCounter } from '@or3/workflow-core';

const counter = new SimpleTokenCounter();

const count = counter.count('Hello, world!');
// ~3 tokens
```

Good for development and testing, but not accurate enough for production.

### TiktokenCounter

Accurate OpenAI-compatible counting using tiktoken:

```typescript
import { TiktokenCounter } from '@or3/workflow-core';

const counter = new TiktokenCounter({
    model: 'gpt-4', // Uses cl100k_base encoding
});

const count = await counter.count('Hello, world!');
// Exact token count
```

#### Options

```typescript
const counter = new TiktokenCounter({
    model: 'gpt-4', // Model for encoding selection
    encoding: 'cl100k_base', // Or specify encoding directly
});
```

## Custom Adapters

### Claude Token Counter

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { TokenCounterAdapter, Message } from '@or3/workflow-core';

export class ClaudeTokenCounter implements TokenCounterAdapter {
    private anthropic: Anthropic;
    private model: string;
    private contextLimit: number;

    constructor(options: { apiKey: string; model?: string }) {
        this.anthropic = new Anthropic({ apiKey: options.apiKey });
        this.model = options.model ?? 'claude-sonnet-4-20250514';
        this.contextLimit = this.getModelContextLimit(this.model);
    }

    private getModelContextLimit(model: string): number {
        if (model.includes('claude-3-opus')) return 200_000;
        if (model.includes('claude-sonnet-4')) return 200_000;
        if (model.includes('claude-3-haiku')) return 200_000;
        return 100_000; // Default
    }

    async count(text: string): Promise<number> {
        const response = await this.anthropic.messages.countTokens({
            model: this.model,
            messages: [{ role: 'user', content: text }],
        });
        return response.input_tokens;
    }

    async countMessages(messages: Message[]): Promise<number> {
        const response = await this.anthropic.messages.countTokens({
            model: this.model,
            messages: messages.map((m) => ({
                role: m.role === 'system' ? 'user' : m.role,
                content: m.content,
            })),
        });
        return response.input_tokens;
    }

    getContextLimit(): number {
        return this.contextLimit;
    }
}
```

### Cached Token Counter

Wrap any counter with caching for performance:

```typescript
import type { TokenCounterAdapter, Message } from '@or3/workflow-core';

export class CachedTokenCounter implements TokenCounterAdapter {
    private cache = new Map<string, number>();
    private maxCacheSize: number;

    constructor(
        private inner: TokenCounterAdapter,
        options?: { maxCacheSize?: number }
    ) {
        this.maxCacheSize = options?.maxCacheSize ?? 10000;
    }

    async count(text: string): Promise<number> {
        // Use hash for long texts
        const key = text.length > 100 ? await this.hash(text) : text;

        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const count = await this.inner.count(text);

        // LRU-style: remove oldest if at capacity
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, count);
        return count;
    }

    async countMessages(messages: Message[]): Promise<number> {
        const key = JSON.stringify(messages);

        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const count = await this.inner.countMessages(messages);
        this.cache.set(key, count);
        return count;
    }

    getContextLimit(): number {
        return this.inner.getContextLimit();
    }

    private async hash(text: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    clearCache(): void {
        this.cache.clear();
    }
}
```

### Multi-Model Counter

Route to appropriate counter based on model:

```typescript
import type { TokenCounterAdapter, Message } from '@or3/workflow-core';
import { TiktokenCounter } from '@or3/workflow-core';
import { ClaudeTokenCounter } from './claude-counter';

export class MultiModelTokenCounter implements TokenCounterAdapter {
    private counters: Map<string, TokenCounterAdapter>;
    private currentModel: string;

    constructor(options: {
        openaiApiKey?: string;
        anthropicApiKey?: string;
        defaultModel: string;
    }) {
        this.counters = new Map();
        this.currentModel = options.defaultModel;

        // OpenAI/GPT models
        this.counters.set('openai', new TiktokenCounter({ model: 'gpt-4' }));

        // Claude models
        if (options.anthropicApiKey) {
            this.counters.set(
                'claude',
                new ClaudeTokenCounter({
                    apiKey: options.anthropicApiKey,
                })
            );
        }
    }

    setModel(model: string): void {
        this.currentModel = model;
    }

    private getCounter(): TokenCounterAdapter {
        if (this.currentModel.includes('claude')) {
            return this.counters.get('claude') ?? this.counters.get('openai')!;
        }
        return this.counters.get('openai')!;
    }

    count(text: string): Promise<number> | number {
        return this.getCounter().count(text);
    }

    countMessages(messages: Message[]): Promise<number> | number {
        return this.getCounter().countMessages(messages);
    }

    getContextLimit(): number {
        // Model-specific limits
        const model = this.currentModel.toLowerCase();

        if (model.includes('gpt-4-turbo')) return 128_000;
        if (model.includes('gpt-4')) return 8_192;
        if (model.includes('gpt-3.5-turbo-16k')) return 16_384;
        if (model.includes('gpt-3.5')) return 4_096;
        if (model.includes('claude-3')) return 200_000;
        if (model.includes('claude-2')) return 100_000;

        return 4_096; // Conservative default
    }
}
```

## Usage with Context Compaction

Token counters enable automatic context compaction:

```typescript
import {
    OpenRouterExecutionAdapter,
    TiktokenCounter,
} from '@or3/workflow-core';

const tokenCounter = new TiktokenCounter({ model: 'gpt-4' });

const executor = new OpenRouterExecutionAdapter({
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'openai/gpt-4-turbo',
    tokenCounter,
    compaction: {
        enabled: true,
        threshold: 0.8, // Compact when 80% of context used
        strategy: 'summarize',
        preserveRecent: 5,
    },
});
```

### How It Works

1. Before each LLM call, count current context tokens
2. Compare to model's context limit
3. If above threshold, trigger compaction
4. Summarize older messages to reduce token count
5. Continue with compacted context

```typescript
// Example compaction flow
const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage1 },
    { role: 'assistant', content: longResponse1 },
    { role: 'user', content: userMessage2 },
    { role: 'assistant', content: longResponse2 },
    // ... many more messages
];

const tokenCount = await tokenCounter.countMessages(messages);
const limit = tokenCounter.getContextLimit();

if (tokenCount > limit * 0.8) {
    // Compact older messages
    const compactedMessages = await compact(messages);
}
```

## Best Practices

### 1. Choose Appropriate Counter

```typescript
// Development: fast approximation
const devCounter = new SimpleTokenCounter();

// Production: accurate counting
const prodCounter = new TiktokenCounter({ model: 'gpt-4' });

const counter =
    process.env.NODE_ENV === 'production' ? prodCounter : devCounter;
```

### 2. Cache Expensive Counts

```typescript
const counter = new CachedTokenCounter(
    new TiktokenCounter({ model: 'gpt-4' }),
    { maxCacheSize: 10000 }
);
```

### 3. Account for Response Tokens

```typescript
const inputTokens = await counter.countMessages(messages);
const reservedForOutput = 4096; // Reserve for response
const available = counter.getContextLimit() - inputTokens - reservedForOutput;

if (available < 0) {
    // Must compact context
}
```

### 4. Monitor Token Usage

```typescript
class MonitoredTokenCounter implements TokenCounterAdapter {
    private totalCounted = 0;

    constructor(private inner: TokenCounterAdapter) {}

    async count(text: string): Promise<number> {
        const count = await this.inner.count(text);
        this.totalCounted += count;
        return count;
    }

    // ... other methods

    getStats() {
        return { totalCounted: this.totalCounted };
    }
}
```

## Next Steps

-   [Context Compaction](../api/compaction.md) - Automatic context management
-   [Execution](../api/execution.md) - Workflow execution
