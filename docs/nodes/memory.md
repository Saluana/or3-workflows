# Memory Node

Query and store information in vector memory.

## Overview

Memory nodes integrate with vector databases for RAG (Retrieval-Augmented Generation) workflows. Query relevant context or store information for later retrieval.

## Import

```typescript
import { MemoryNodeExtension, InMemoryAdapter } from '@or3/workflow-core';
```

## Configuration

```typescript
interface MemoryNodeData {
    /** Display label */
    label: string;

    /** Operation type */
    operation: 'query' | 'store';

    /** Number of results to retrieve (query) */
    topK?: number;

    /** Similarity threshold (query) */
    threshold?: number;

    /** Metadata to attach (store) */
    metadata?: Record<string, unknown>;

    /** Collection/namespace */
    collection?: string;
}
```

## Ports

| Port     | Type   | Description                    |
| -------- | ------ | ------------------------------ |
| `input`  | Input  | Query text or content to store |
| `output` | Output | Query results or confirmation  |

## Setup

Provide a memory adapter to the execution adapter:

```typescript
import {
    OpenRouterExecutionAdapter,
    InMemoryAdapter,
} from '@or3/workflow-core';

const memoryAdapter = new InMemoryAdapter();

const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
    memoryAdapter,
});
```

## Query Operation

Retrieve relevant context:

```typescript
editor.commands.createNode(
    'memory',
    {
        label: 'Search Knowledge Base',
        operation: 'query',
        topK: 5,
        threshold: 0.7,
        collection: 'documentation',
    },
    { x: 100, y: 200 }
);
```

### Query Flow

```
Input: "How do I reset my password?"
          │
          ▼
   ┌────────────────┐
   │ Memory Node    │
   │ (Query)        │
   └────────┬───────┘
            │
            ▼
   ┌────────────────────────────────┐
   │ Results:                       │
   │ 1. "Password reset guide..."   │
   │ 2. "Account recovery steps..." │
   │ 3. "Security settings..."      │
   └────────────────────────────────┘
```

## Store Operation

Save information for later retrieval:

```typescript
editor.commands.createNode(
    'memory',
    {
        label: 'Save to Memory',
        operation: 'store',
        metadata: {
            source: 'user-conversation',
            timestamp: new Date().toISOString(),
        },
        collection: 'conversation-history',
    },
    { x: 100, y: 200 }
);
```

## Memory Adapters

### InMemoryAdapter

Simple in-memory storage for development:

```typescript
import { InMemoryAdapter } from '@or3/workflow-core';

const adapter = new InMemoryAdapter({
    similarity: 'cosine', // or 'euclidean'
});
```

### Custom Adapter

Implement `MemoryAdapter` for production:

```typescript
interface MemoryAdapter {
    /** Search for similar entries */
    query(params: MemoryQuery): Promise<MemoryEntry[]>;

    /** Store a new entry */
    store(entry: MemoryEntry): Promise<void>;

    /** Delete entries */
    delete(filter: MemoryFilter): Promise<void>;

    /** Clear all entries */
    clear(): Promise<void>;
}
```

See [Memory Adapters](../adapters/memory.md) for Redis, Pinecone, etc.

## MemoryEntry

```typescript
interface MemoryEntry {
    /** Unique entry ID */
    id: string;

    /** Text content */
    text: string;

    /** Vector embedding (optional, computed if missing) */
    embedding?: number[];

    /** Metadata */
    metadata?: Record<string, unknown>;

    /** Collection/namespace */
    collection?: string;

    /** Session ID for scoping */
    sessionId?: string;

    /** Creation timestamp */
    createdAt?: string;
}
```

## MemoryQuery

```typescript
interface MemoryQuery {
    /** Query text */
    text: string;

    /** Number of results */
    topK?: number;

    /** Similarity threshold (0-1) */
    threshold?: number;

    /** Filter by collection */
    collection?: string;

    /** Metadata filters */
    filter?: Record<string, unknown>;

    /** Session scope */
    sessionId?: string;
}
```

## Validation

| Code                | Type  | Description            |
| ------------------- | ----- | ---------------------- |
| `NO_INCOMING_EDGE`  | Error | Node not connected     |
| `MISSING_OPERATION` | Error | No operation specified |

## RAG Workflow Example

```typescript
// 1. Query memory for context
editor.commands.createNode(
    'memory',
    {
        label: 'Search Docs',
        operation: 'query',
        topK: 3,
    },
    { x: 200, y: 100 }
);

// 2. Use context in agent
editor.commands.createNode(
    'agent',
    {
        label: 'Answer with Context',
        prompt: `Use this context to answer the question:

Context:
{{memory_results}}

Answer the user's question accurately based on the context.`,
    },
    { x: 200, y: 250 }
);

// Connect
editor.commands.createEdge('memory-node', 'agent-node');
```

## Best Practices

### 1. Use Collections

Organize memory by type:

```typescript
// Different collections for different purposes
{
    collection: 'product-docs';
}
{
    collection: 'user-preferences';
}
{
    collection: 'conversation-history';
}
```

### 2. Set Appropriate topK

```typescript
// For focused retrieval
{
    topK: 3;
}

// For comprehensive search
{
    topK: 10;
}
```

### 3. Use Thresholds

Filter low-relevance results:

```typescript
{
  topK: 5,
  threshold: 0.7, // Only results with 70%+ similarity
}
```

### 4. Add Metadata

Enable filtering and organization:

```typescript
{
  metadata: {
    source: 'documentation',
    version: '2.0',
    category: 'api-reference',
  },
}
```

## Session Scoping

Scope memory to a session:

```typescript
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
    memoryAdapter,
    sessionId: 'user-123-session-456',
});
```

## Vue Component

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="memory-node">
            <div class="icon">
                {{ node.data.operation === 'query' ? '🔍' : '💾' }}
            </div>
            <div class="label">{{ node.data.label }}</div>
            <div class="operation">{{ node.data.operation }}</div>
        </div>
    </NodeWrapper>
</template>
```

## Next Steps

-   [Memory Adapters](../adapters/memory.md) - Custom implementations
-   [Tool Node](./tool.md) - External function calls
