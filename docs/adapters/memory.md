# Memory Adapters

Integrate vector memory and RAG with workflow execution.

## Overview

Memory adapters provide vector storage for semantic search, enabling workflows to retrieve relevant context during execution.

## Interface

```typescript
interface MemoryAdapter {
    /** Store content with embedding */
    store(content: MemoryContent): Promise<string>;

    /** Search for similar content */
    search(query: string, options?: SearchOptions): Promise<MemoryResult[]>;

    /** Delete memory by ID */
    delete(id: string): Promise<void>;

    /** Clear all memories */
    clear(): Promise<void>;
}

interface MemoryContent {
    text: string;
    metadata?: Record<string, unknown>;
    namespace?: string;
}

interface SearchOptions {
    limit?: number;
    namespace?: string;
    threshold?: number;
    filter?: Record<string, unknown>;
}

interface MemoryResult {
    id: string;
    text: string;
    score: number;
    metadata?: Record<string, unknown>;
}
```

---

## Embedding Provider Abstraction

> **Important:** In production, embedding generation should be separated from storage adapters. This allows you to swap providers, add caching, handle rate limits, and control costs independently.

### EmbeddingProvider Interface

```typescript
interface EmbeddingProvider {
    /** Generate embedding for a single text */
    embed(text: string): Promise<number[]>;

    /** Generate embeddings for multiple texts (batched) */
    embedBatch(texts: string[]): Promise<number[][]>;

    /** Embedding dimension (e.g., 1536 for OpenAI) */
    readonly dimensions: number;
}
```

### OpenAI Embedding Provider

```typescript
import OpenAI from 'openai';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private client: OpenAI;
    private model: string;
    readonly dimensions: number;

    constructor(options: { apiKey: string; model?: string }) {
        this.client = new OpenAI({ apiKey: options.apiKey });
        this.model = options.model ?? 'text-embedding-3-small';
        this.dimensions = this.model.includes('3-large') ? 3072 : 1536;
    }

    async embed(text: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: this.model,
            input: text,
        });
        return response.data[0].embedding;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        // OpenAI supports up to 2048 inputs per request
        const response = await this.client.embeddings.create({
            model: this.model,
            input: texts,
        });
        return response.data.map((d) => d.embedding);
    }
}
```

### Cached Embedding Provider

Wrap any provider with caching to reduce API calls and costs:

```typescript
export class CachedEmbeddingProvider implements EmbeddingProvider {
    private cache = new Map<string, number[]>();
    readonly dimensions: number;

    constructor(
        private inner: EmbeddingProvider,
        private options?: { maxCacheSize?: number }
    ) {
        this.dimensions = inner.dimensions;
    }

    private hash(text: string): string {
        // Simple hash for cache key (use crypto.subtle in production)
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = (hash << 5) - hash + text.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }

    async embed(text: string): Promise<number[]> {
        const key = this.hash(text);

        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const embedding = await this.inner.embed(text);

        // LRU eviction
        if (this.cache.size >= (this.options?.maxCacheSize ?? 10000)) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, embedding);
        return embedding;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        const uncached: { index: number; text: string }[] = [];

        // Check cache first
        for (let i = 0; i < texts.length; i++) {
            const key = this.hash(texts[i]);
            if (this.cache.has(key)) {
                results[i] = this.cache.get(key)!;
            } else {
                uncached.push({ index: i, text: texts[i] });
            }
        }

        // Batch embed uncached texts
        if (uncached.length > 0) {
            const embeddings = await this.inner.embedBatch(
                uncached.map((u) => u.text)
            );
            for (let i = 0; i < uncached.length; i++) {
                const key = this.hash(uncached[i].text);
                this.cache.set(key, embeddings[i]);
                results[uncached[i].index] = embeddings[i];
            }
        }

        return results;
    }

    clearCache(): void {
        this.cache.clear();
    }
}
```

### Rate-Limited Provider

Add rate limiting to avoid API throttling:

```typescript
export class RateLimitedEmbeddingProvider implements EmbeddingProvider {
    private queue: Array<() => void> = [];
    private processing = 0;
    readonly dimensions: number;

    constructor(
        private inner: EmbeddingProvider,
        private options: {
            maxConcurrent?: number;
            minDelayMs?: number;
        } = {}
    ) {
        this.dimensions = inner.dimensions;
    }

    private async withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
        const maxConcurrent = this.options.maxConcurrent ?? 5;
        const minDelay = this.options.minDelayMs ?? 100;

        // Wait if at capacity
        if (this.processing >= maxConcurrent) {
            await new Promise<void>((resolve) => this.queue.push(resolve));
        }

        this.processing++;
        try {
            const result = await fn();
            await new Promise((r) => setTimeout(r, minDelay));
            return result;
        } finally {
            this.processing--;
            const next = this.queue.shift();
            if (next) next();
        }
    }

    async embed(text: string): Promise<number[]> {
        return this.withRateLimit(() => this.inner.embed(text));
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        return this.withRateLimit(() => this.inner.embedBatch(texts));
    }
}
```

### Composing Providers

```typescript
// Production setup: cached + rate-limited
const baseProvider = new OpenAIEmbeddingProvider({
    apiKey: process.env.OPENAI_API_KEY!,
});

const cachedProvider = new CachedEmbeddingProvider(baseProvider, {
    maxCacheSize: 50000,
});

const embeddingProvider = new RateLimitedEmbeddingProvider(cachedProvider, {
    maxConcurrent: 10,
    minDelayMs: 50,
});
```

---

## Memory Adapters (Production Pattern)

With the embedding provider abstraction, memory adapters focus solely on storage:

### Pinecone Adapter

```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import type {
    MemoryAdapter,
    MemoryContent,
    SearchOptions,
    MemoryResult,
} from '@or3/workflow-core';
import type { EmbeddingProvider } from './embedding-provider';

export class PineconeMemoryAdapter implements MemoryAdapter {
    private pinecone: Pinecone;
    private indexName: string;

    constructor(
        private embeddings: EmbeddingProvider,
        options: {
            pineconeApiKey: string;
            indexName: string;
        }
    ) {
        this.pinecone = new Pinecone({ apiKey: options.pineconeApiKey });
        this.indexName = options.indexName;
    }

    async store(content: MemoryContent): Promise<string> {
        const index = this.pinecone.index(this.indexName);
        const id = crypto.randomUUID();
        const embedding = await this.embeddings.embed(content.text);

        await index.upsert([
            {
                id,
                values: embedding,
                metadata: {
                    text: content.text,
                    namespace: content.namespace,
                    ...content.metadata,
                },
            },
        ]);

        return id;
    }

    async search(
        query: string,
        options?: SearchOptions
    ): Promise<MemoryResult[]> {
        const index = this.pinecone.index(this.indexName);
        const embedding = await this.embeddings.embed(query);

        const results = await index.query({
            vector: embedding,
            topK: options?.limit ?? 5,
            includeMetadata: true,
            filter: options?.namespace
                ? { namespace: options.namespace }
                : options?.filter,
        });

        return results.matches
            .filter((m) => (options?.threshold ?? 0) <= (m.score ?? 0))
            .map((match) => ({
                id: match.id,
                text: match.metadata?.text as string,
                score: match.score ?? 0,
                metadata: match.metadata,
            }));
    }

    async delete(id: string): Promise<void> {
        const index = this.pinecone.index(this.indexName);
        await index.deleteOne(id);
    }

    async clear(): Promise<void> {
        const index = this.pinecone.index(this.indexName);
        await index.deleteAll();
    }
}
```

### Chroma Adapter

Chroma handles embeddings internally, so no provider needed:

```typescript
import { ChromaClient } from 'chromadb';
import type {
    MemoryAdapter,
    MemoryContent,
    SearchOptions,
    MemoryResult,
} from '@or3/workflow-core';

export class ChromaMemoryAdapter implements MemoryAdapter {
    private client: ChromaClient;
    private collectionName: string;

    constructor(options: { path?: string; collectionName: string }) {
        this.client = new ChromaClient({ path: options.path });
        this.collectionName = options.collectionName;
    }

    private async getCollection() {
        return this.client.getOrCreateCollection({
            name: this.collectionName,
        });
    }

    async store(content: MemoryContent): Promise<string> {
        const collection = await this.getCollection();
        const id = crypto.randomUUID();

        await collection.add({
            ids: [id],
            documents: [content.text],
            metadatas: [{ namespace: content.namespace, ...content.metadata }],
        });

        return id;
    }

    async search(
        query: string,
        options?: SearchOptions
    ): Promise<MemoryResult[]> {
        const collection = await this.getCollection();

        const results = await collection.query({
            queryTexts: [query],
            nResults: options?.limit ?? 5,
            where: options?.namespace
                ? { namespace: options.namespace }
                : undefined,
        });

        return (results.ids[0] ?? []).map((id, i) => ({
            id,
            text: results.documents[0]?.[i] ?? '',
            score: 1 - (results.distances?.[0]?.[i] ?? 0),
            metadata: results.metadatas?.[0]?.[i],
        }));
    }

    async delete(id: string): Promise<void> {
        const collection = await this.getCollection();
        await collection.delete({ ids: [id] });
    }

    async clear(): Promise<void> {
        await this.client.deleteCollection({ name: this.collectionName });
    }
}
```

### Supabase pgvector Adapter

```typescript
import { createClient } from '@supabase/supabase-js';
import type {
    MemoryAdapter,
    MemoryContent,
    SearchOptions,
    MemoryResult,
} from '@or3/workflow-core';
import type { EmbeddingProvider } from './embedding-provider';

export class SupabaseMemoryAdapter implements MemoryAdapter {
    private supabase;

    constructor(
        private embeddings: EmbeddingProvider,
        options: {
            supabaseUrl: string;
            supabaseKey: string;
        }
    ) {
        this.supabase = createClient(options.supabaseUrl, options.supabaseKey);
    }

    async store(content: MemoryContent): Promise<string> {
        const id = crypto.randomUUID();
        const embedding = await this.embeddings.embed(content.text);

        const { error } = await this.supabase.from('memories').insert({
            id,
            text: content.text,
            embedding,
            namespace: content.namespace,
            metadata: content.metadata,
        });

        if (error) throw error;
        return id;
    }

    async search(
        query: string,
        options?: SearchOptions
    ): Promise<MemoryResult[]> {
        const embedding = await this.embeddings.embed(query);

        const { data, error } = await this.supabase.rpc('match_memories', {
            query_embedding: embedding,
            match_count: options?.limit ?? 5,
            match_threshold: options?.threshold ?? 0.5,
            filter_namespace: options?.namespace,
        });

        if (error) throw error;

        return (data ?? []).map((row) => ({
            id: row.id,
            text: row.text,
            score: row.similarity,
            metadata: row.metadata,
        }));
    }

    async delete(id: string): Promise<void> {
        await this.supabase.from('memories').delete().eq('id', id);
    }

    async clear(): Promise<void> {
        await this.supabase.from('memories').delete().neq('id', '');
    }
}
```

#### Required Supabase Setup

```sql
-- Enable pgvector
create extension vector;

-- Create memories table
create table memories (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  embedding vector(1536),
  namespace text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

-- Create similarity search function
create or replace function match_memories(
  query_embedding vector(1536),
  match_count int default 5,
  match_threshold float default 0.5,
  filter_namespace text default null
)
returns table (
  id uuid,
  text text,
  similarity float,
  metadata jsonb
)
language sql stable
as $$
  select
    memories.id,
    memories.text,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.metadata
  from memories
  where
    (filter_namespace is null or namespace = filter_namespace)
    and 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
$$;
```

## Usage with Memory Node

Memory adapters are used with Memory Nodes in workflows:

```typescript
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';
import { PineconeMemoryAdapter } from './adapters/pinecone';
import {
    OpenAIEmbeddingProvider,
    CachedEmbeddingProvider,
} from './embedding-provider';

// Create embedding provider with caching
const embeddings = new CachedEmbeddingProvider(
    new OpenAIEmbeddingProvider({
        apiKey: process.env.OPENAI_API_KEY!,
    }),
    { maxCacheSize: 10000 }
);

// Create memory adapter with injected provider
const memory = new PineconeMemoryAdapter(embeddings, {
    pineconeApiKey: process.env.PINECONE_API_KEY!,
    indexName: 'workflow-memories',
});

const editor = new WorkflowEditor({
    extensions: [StarterKit.configure()],
});

// Memory node retrieves context
editor.commands.addNode({
    id: 'memory-1',
    type: 'memory',
    data: {
        label: 'Retrieve Knowledge',
        query: 'What are the refund policies?',
        topK: 5,
        threshold: 0.7,
    },
});
```

### During Execution

```typescript
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';

const executor = new OpenRouterExecutionAdapter({
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultModel: 'anthropic/claude-sonnet-4',
    memoryAdapter: memory, // Inject memory adapter
});

// Memory results are injected into context
const result = await executor.execute(workflow, {
    input: 'How do I get a refund?',
});
```

## In-Memory Adapter (Testing)

For testing and development:

```typescript
import type {
    MemoryAdapter,
    MemoryContent,
    SearchOptions,
    MemoryResult,
} from '@or3/workflow-core';

export class InMemoryAdapter implements MemoryAdapter {
    private memories: Map<string, MemoryContent & { id: string }> = new Map();

    async store(content: MemoryContent): Promise<string> {
        const id = crypto.randomUUID();
        this.memories.set(id, { ...content, id });
        return id;
    }

    async search(
        query: string,
        options?: SearchOptions
    ): Promise<MemoryResult[]> {
        const queryLower = query.toLowerCase();
        const results: MemoryResult[] = [];

        for (const [id, memory] of this.memories) {
            if (options?.namespace && memory.namespace !== options.namespace) {
                continue;
            }

            // Simple keyword matching (use embeddings in production)
            const text = memory.text.toLowerCase();
            const words = queryLower.split(/\s+/);
            const matches = words.filter((w) => text.includes(w)).length;
            const score = matches / words.length;

            if (score >= (options?.threshold ?? 0)) {
                results.push({
                    id,
                    text: memory.text,
                    score,
                    metadata: memory.metadata,
                });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, options?.limit ?? 5);
    }

    async delete(id: string): Promise<void> {
        this.memories.delete(id);
    }

    async clear(): Promise<void> {
        this.memories.clear();
    }
}
```

## Best Practices

### 1. Use Namespaces

```typescript
// Separate memories by type
await memory.store({
    text: 'Product documentation...',
    namespace: 'docs',
});

await memory.store({
    text: 'Support ticket history...',
    namespace: 'tickets',
});

// Search specific namespace
const results = await memory.search(query, {
    namespace: 'docs',
});
```

### 2. Add Rich Metadata

```typescript
await memory.store({
    text: content,
    metadata: {
        source: 'knowledge-base',
        category: 'billing',
        lastUpdated: new Date().toISOString(),
        author: 'support-team',
    },
});
```

### 3. Tune Thresholds

```typescript
// High threshold for precise matches
const precise = await memory.search(query, {
    threshold: 0.85,
    limit: 3,
});

// Lower threshold for exploratory search
const exploratory = await memory.search(query, {
    threshold: 0.5,
    limit: 10,
});
```

### 4. Chunk Long Content

```typescript
function chunkText(text: string, maxTokens: number = 500): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
        if ((current + sentence).length > maxTokens * 4) {
            chunks.push(current.trim());
            current = sentence;
        } else {
            current += ' ' + sentence;
        }
    }

    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}

// Store chunked content
const chunks = chunkText(longDocument);
for (const chunk of chunks) {
    await memory.store({
        text: chunk,
        metadata: { documentId, chunkIndex: chunks.indexOf(chunk) },
    });
}
```

---

## Production Best Practices

### 1. Separate Embedding from Storage

**Don't do this:**

```typescript
// ❌ Embedding logic coupled to storage adapter
class BadAdapter implements MemoryAdapter {
    private openai = new OpenAI({ apiKey: '...' });

    async store(content: MemoryContent) {
        // Embedding call hidden inside storage
        const embedding = await this.openai.embeddings.create({...});
        // ...
    }
}
```

**Do this instead:**

```typescript
// ✅ Embedding provider injected as dependency
class GoodAdapter implements MemoryAdapter {
    constructor(private embeddings: EmbeddingProvider) {}

    async store(content: MemoryContent) {
        const embedding = await this.embeddings.embed(content.text);
        // ...
    }
}
```

This separation allows you to:

-   Swap embedding providers without changing storage code
-   Add caching, rate limiting, and batching transparently
-   Monitor embedding costs separately from storage costs
-   Test storage logic with mock embeddings

### 2. Always Cache Embeddings

Embedding API calls are expensive (both latency and cost). Cache aggressively:

```typescript
// Shared cached provider across all adapters
const embeddingProvider = new CachedEmbeddingProvider(
    new OpenAIEmbeddingProvider({ apiKey }),
    { maxCacheSize: 100000 } // ~100K embeddings cached
);

// Same provider for multiple adapters
const pineconeAdapter = new PineconeMemoryAdapter(embeddingProvider, {...});
const supabaseAdapter = new SupabaseMemoryAdapter(embeddingProvider, {...});
```

### 3. Batch Operations When Possible

```typescript
// ❌ N API calls for N documents
for (const doc of documents) {
    const embedding = await provider.embed(doc.text);
    await store(doc, embedding);
}

// ✅ 1 API call for N documents (up to batch limit)
const texts = documents.map((d) => d.text);
const embeddings = await provider.embedBatch(texts);
for (let i = 0; i < documents.length; i++) {
    await store(documents[i], embeddings[i]);
}
```

### 4. Handle Rate Limits Gracefully

```typescript
const provider = new RateLimitedEmbeddingProvider(
    new CachedEmbeddingProvider(new OpenAIEmbeddingProvider({ apiKey })),
    {
        maxConcurrent: 5, // Max parallel requests
        minDelayMs: 100, // Minimum delay between requests
    }
);
```

### 5. Monitor Costs

```typescript
class MonitoredEmbeddingProvider implements EmbeddingProvider {
    private callCount = 0;
    private tokenCount = 0;

    constructor(private inner: EmbeddingProvider) {}

    async embed(text: string): Promise<number[]> {
        this.callCount++;
        this.tokenCount += Math.ceil(text.length / 4); // Approximate
        return this.inner.embed(text);
    }

    getStats() {
        return {
            calls: this.callCount,
            estimatedTokens: this.tokenCount,
            estimatedCost: this.tokenCount * 0.00002, // ~$0.02/1M tokens
        };
    }
}
```

### 6. Use Persistent Cache for Production

```typescript
// Redis-backed cache for production
class RedisEmbeddingCache implements EmbeddingProvider {
    constructor(private inner: EmbeddingProvider, private redis: Redis) {}

    async embed(text: string): Promise<number[]> {
        const key = `emb:${this.hash(text)}`;
        const cached = await this.redis.get(key);

        if (cached) {
            return JSON.parse(cached);
        }

        const embedding = await this.inner.embed(text);
        await this.redis.setex(key, 86400 * 7, JSON.stringify(embedding)); // 7 day TTL
        return embedding;
    }
}
```

## Next Steps

-   [Token Counters](./token-counter.md) - Token counting adapters
-   [Memory Node](../nodes/memory.md) - Memory node documentation
