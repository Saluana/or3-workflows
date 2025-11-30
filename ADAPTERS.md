# Adapter Interfaces

or3-workflows uses pluggable adapters for extensibility. This document covers the available adapter interfaces and how to implement your own.

## Table of Contents

-   [Memory Adapter](#memory-adapter)
-   [Storage Adapter](#storage-adapter)
-   [Token Counter](#token-counter)

---

## Memory Adapter

The `MemoryAdapter` interface allows you to plug in any persistence layer for workflow memory/context. The default `InMemoryAdapter` is suitable for development but won't persist across sessions.

### Interface

```typescript
interface MemoryEntry {
    id: string;
    content: string;
    metadata: {
        timestamp: string;
        source: 'user' | 'agent' | 'system';
        nodeId?: string;
        workflowId?: string;
        sessionId?: string;
        [key: string]: unknown;
    };
}

interface MemoryQuery {
    text?: string; // Text to search for
    limit?: number; // Max results (default: 10)
    filter?: Record<string, unknown>; // Metadata filters
    sessionId?: string; // Scope to session
}

interface MemoryAdapter {
    store(entry: MemoryEntry): Promise<void>;
    query(query: MemoryQuery): Promise<MemoryEntry[]>;
    delete(id: string): Promise<void>;
    clear(sessionId?: string): Promise<void>;
}
```

### Usage

```typescript
import {
    OpenRouterExecutionAdapter,
    InMemoryAdapter,
} from '@or3/workflow-core';

// Default in-memory adapter
const adapter = new OpenRouterExecutionAdapter(client, {
    memory: new InMemoryAdapter(),
});

// Or use a custom adapter
const adapter = new OpenRouterExecutionAdapter(client, {
    memory: new RedisMemoryAdapter(redisClient),
});
```

### Example: Redis Adapter

```typescript
import Redis from 'ioredis';
import type {
    MemoryAdapter,
    MemoryEntry,
    MemoryQuery,
} from '@or3/workflow-core';

export class RedisMemoryAdapter implements MemoryAdapter {
    private redis: Redis;
    private prefix: string;

    constructor(redis: Redis, prefix = 'workflow:memory:') {
        this.redis = redis;
        this.prefix = prefix;
    }

    async store(entry: MemoryEntry): Promise<void> {
        const key = `${this.prefix}${entry.id}`;
        await this.redis.hset(key, {
            content: entry.content,
            metadata: JSON.stringify(entry.metadata),
        });

        // Add to session index if sessionId exists
        if (entry.metadata.sessionId) {
            await this.redis.zadd(
                `${this.prefix}session:${entry.metadata.sessionId}`,
                Date.now(),
                entry.id
            );
        }

        // Set TTL (e.g., 24 hours)
        await this.redis.expire(key, 86400);
    }

    async query(query: MemoryQuery): Promise<MemoryEntry[]> {
        const limit = query.limit || 10;
        let ids: string[];

        if (query.sessionId) {
            // Get from session index, most recent first
            ids = await this.redis.zrevrange(
                `${this.prefix}session:${query.sessionId}`,
                0,
                limit - 1
            );
        } else {
            // Scan all keys (not recommended for production)
            const keys = await this.redis.keys(`${this.prefix}*`);
            ids = keys
                .filter((k) => !k.includes(':session:'))
                .map((k) => k.replace(this.prefix, ''))
                .slice(0, limit);
        }

        const entries: MemoryEntry[] = [];
        for (const id of ids) {
            const data = await this.redis.hgetall(`${this.prefix}${id}`);
            if (data.content) {
                const entry: MemoryEntry = {
                    id,
                    content: data.content,
                    metadata: JSON.parse(data.metadata || '{}'),
                };

                // Apply text filter
                if (
                    query.text &&
                    !entry.content
                        .toLowerCase()
                        .includes(query.text.toLowerCase())
                ) {
                    continue;
                }

                // Apply metadata filters
                if (query.filter) {
                    let matches = true;
                    for (const [key, value] of Object.entries(query.filter)) {
                        if (entry.metadata[key] !== value) {
                            matches = false;
                            break;
                        }
                    }
                    if (!matches) continue;
                }

                entries.push(entry);
            }
        }

        return entries;
    }

    async delete(id: string): Promise<void> {
        const data = await this.redis.hgetall(`${this.prefix}${id}`);
        if (data.metadata) {
            const metadata = JSON.parse(data.metadata);
            if (metadata.sessionId) {
                await this.redis.zrem(
                    `${this.prefix}session:${metadata.sessionId}`,
                    id
                );
            }
        }
        await this.redis.del(`${this.prefix}${id}`);
    }

    async clear(sessionId?: string): Promise<void> {
        if (sessionId) {
            const ids = await this.redis.zrange(
                `${this.prefix}session:${sessionId}`,
                0,
                -1
            );
            if (ids.length > 0) {
                await this.redis.del(...ids.map((id) => `${this.prefix}${id}`));
                await this.redis.del(`${this.prefix}session:${sessionId}`);
            }
        } else {
            const keys = await this.redis.keys(`${this.prefix}*`);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
    }
}
```

### Example: PostgreSQL Adapter

```typescript
import { Pool } from 'pg';
import type {
    MemoryAdapter,
    MemoryEntry,
    MemoryQuery,
} from '@or3/workflow-core';

export class PostgresMemoryAdapter implements MemoryAdapter {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    async initialize(): Promise<void> {
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workflow_memory (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_memory_session 
        ON workflow_memory ((metadata->>'sessionId'));
      CREATE INDEX IF NOT EXISTS idx_memory_content 
        ON workflow_memory USING gin (to_tsvector('english', content));
    `);
    }

    async store(entry: MemoryEntry): Promise<void> {
        await this.pool.query(
            `INSERT INTO workflow_memory (id, content, metadata)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET content = $2, metadata = $3`,
            [entry.id, entry.content, JSON.stringify(entry.metadata)]
        );
    }

    async query(query: MemoryQuery): Promise<MemoryEntry[]> {
        let sql = 'SELECT id, content, metadata FROM workflow_memory WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (query.sessionId) {
            sql += ` AND metadata->>'sessionId' = $${paramIndex++}`;
            params.push(query.sessionId);
        }

        if (query.text) {
            // Full-text search
            sql += ` AND to_tsvector('english', content) @@ plainto_tsquery('english', $${paramIndex++})`;
            params.push(query.text);
        }

        if (query.filter) {
            for (const [key, value] of Object.entries(query.filter)) {
                sql += ` AND metadata->>'${key}' = $${paramIndex++}`;
                params.push(String(value));
            }
        }

        sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
        params.push(query.limit || 10);

        const result = await this.pool.query(sql, params);
        return result.rows.map((row) => ({
            id: row.id,
            content: row.content,
            metadata: row.metadata,
        }));
    }

    async delete(id: string): Promise<void> {
        await this.pool.query('DELETE FROM workflow_memory WHERE id = $1', [
            id,
        ]);
    }

    async clear(sessionId?: string): Promise<void> {
        if (sessionId) {
            await this.pool.query(
                `DELETE FROM workflow_memory WHERE metadata->>'sessionId' = $1`,
                [sessionId]
            );
        } else {
            await this.pool.query('DELETE FROM workflow_memory');
        }
    }
}
```

### Example: Pinecone Vector Adapter

For semantic search, use a vector database like Pinecone:

```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import type {
    MemoryAdapter,
    MemoryEntry,
    MemoryQuery,
} from '@or3/workflow-core';

export class PineconeMemoryAdapter implements MemoryAdapter {
    private pinecone: Pinecone;
    private openai: OpenAI;
    private indexName: string;

    constructor(options: {
        pinecone: Pinecone;
        openai: OpenAI;
        indexName: string;
    }) {
        this.pinecone = options.pinecone;
        this.openai = options.openai;
        this.indexName = options.indexName;
    }

    private async embed(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        return response.data[0].embedding;
    }

    async store(entry: MemoryEntry): Promise<void> {
        const index = this.pinecone.index(this.indexName);
        const embedding = await this.embed(entry.content);

        await index.upsert([
            {
                id: entry.id,
                values: embedding,
                metadata: {
                    content: entry.content,
                    ...entry.metadata,
                },
            },
        ]);
    }

    async query(query: MemoryQuery): Promise<MemoryEntry[]> {
        const index = this.pinecone.index(this.indexName);

        // Build filter
        const filter: Record<string, unknown> = {};
        if (query.sessionId) {
            filter.sessionId = query.sessionId;
        }
        if (query.filter) {
            Object.assign(filter, query.filter);
        }

        // Semantic search
        const embedding = await this.embed(query.text || '');
        const results = await index.query({
            vector: embedding,
            topK: query.limit || 10,
            includeMetadata: true,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
        });

        return results.matches.map((match) => ({
            id: match.id,
            content: (match.metadata?.content as string) || '',
            metadata: {
                timestamp:
                    (match.metadata?.timestamp as string) ||
                    new Date().toISOString(),
                source:
                    (match.metadata?.source as 'user' | 'agent' | 'system') ||
                    'system',
                ...(match.metadata as Record<string, unknown>),
            },
        }));
    }

    async delete(id: string): Promise<void> {
        const index = this.pinecone.index(this.indexName);
        await index.deleteOne(id);
    }

    async clear(sessionId?: string): Promise<void> {
        const index = this.pinecone.index(this.indexName);
        if (sessionId) {
            await index.deleteMany({ sessionId });
        } else {
            await index.deleteAll();
        }
    }
}
```

---

## Storage Adapter

The `StorageAdapter` interface handles workflow persistence. The default `LocalStorageAdapter` uses browser localStorage.

### Interface

```typescript
interface StorageAdapter {
    save(workflow: WorkflowData): Promise<string>; // Returns ID
    load(id: string): Promise<WorkflowData>;
    delete(id: string): Promise<void>;
    list(): Promise<WorkflowSummary[]>;
    export(workflow: WorkflowData): string; // JSON string
    import(json: string): WorkflowData; // Parse and validate
}

interface WorkflowSummary {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    nodeCount: number;
}
```

### Usage

```typescript
import { LocalStorageAdapter } from '@or3/workflow-core';

const storage = new LocalStorageAdapter('my-app-workflows');

// Save
const id = await storage.save(editor.getJSON());

// Load
const workflow = await storage.load(id);

// List all
const workflows = await storage.list();

// Delete
await storage.delete(id);

// Export/Import
const json = storage.export(workflow);
const imported = storage.import(json);
```

---

## Token Counter

The `TokenCounter` interface is used for context compaction to estimate token usage.

### Interface

```typescript
interface TokenCounter {
    count(text: string, model?: string): number;
    getLimit(model: string): number;
}
```

### Default Implementation

```typescript
import { ApproximateTokenCounter } from '@or3/workflow-core';

// Uses ~4 chars per token approximation
const counter = new ApproximateTokenCounter();

counter.count('Hello, world!'); // ~3 tokens
counter.getLimit('openai/gpt-4o'); // 128000
```

### Custom Implementation

For more accurate counting, implement your own using tiktoken or similar:

```typescript
import { encoding_for_model } from 'tiktoken';
import type { TokenCounter } from '@or3/workflow-core';

export class TiktokenCounter implements TokenCounter {
    private encoders = new Map<string, ReturnType<typeof encoding_for_model>>();

    private getEncoder(model: string) {
        if (!this.encoders.has(model)) {
            try {
                this.encoders.set(model, encoding_for_model(model as any));
            } catch {
                // Fall back to gpt-4 encoder for unknown models
                this.encoders.set(model, encoding_for_model('gpt-4'));
            }
        }
        return this.encoders.get(model)!;
    }

    count(text: string, model = 'gpt-4'): number {
        const encoder = this.getEncoder(model);
        return encoder.encode(text).length;
    }

    getLimit(model: string): number {
        const limits: Record<string, number> = {
            'gpt-4': 8192,
            'gpt-4-turbo': 128000,
            'gpt-4o': 128000,
            'gpt-3.5-turbo': 16385,
            'claude-3-opus': 200000,
            'claude-3-sonnet': 200000,
        };
        return limits[model] || 8192;
    }
}
```

### Usage with Execution

```typescript
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter(client, {
    tokenCounter: new TiktokenCounter(),
    compaction: {
        threshold: 'auto',
        strategy: 'summarize',
        preserveRecent: 5,
    },
});
```

---

## Best Practices

1. **Memory Adapters**

    - Use `InMemoryAdapter` only for development/testing
    - For production, use Redis, PostgreSQL, or a vector database
    - Set appropriate TTLs to prevent unbounded growth
    - Index by `sessionId` for efficient queries

2. **Storage Adapters**

    - Use `LocalStorageAdapter` for single-user apps
    - Implement a REST-based adapter for multi-user apps
    - Always validate imported workflows

3. **Token Counters**
    - The approximate counter (4 chars ≈ 1 token) is usually sufficient
    - Use tiktoken for precise OpenAI model counting
    - Set compaction threshold slightly below model limit to leave room for responses
