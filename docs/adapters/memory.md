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

## Custom Adapter Example

### Pinecone Adapter

```typescript
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import type {
    MemoryAdapter,
    MemoryContent,
    SearchOptions,
    MemoryResult,
} from '@or3/workflow-core';

export class PineconeMemoryAdapter implements MemoryAdapter {
    private pinecone: Pinecone;
    private openai: OpenAI;
    private indexName: string;

    constructor(options: {
        pineconeApiKey: string;
        openaiApiKey: string;
        indexName: string;
    }) {
        this.pinecone = new Pinecone({ apiKey: options.pineconeApiKey });
        this.openai = new OpenAI({ apiKey: options.openaiApiKey });
        this.indexName = options.indexName;
    }

    private async embed(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        return response.data[0].embedding;
    }

    async store(content: MemoryContent): Promise<string> {
        const index = this.pinecone.index(this.indexName);
        const id = crypto.randomUUID();
        const embedding = await this.embed(content.text);

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
        const embedding = await this.embed(query);

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
            score: 1 - (results.distances?.[0]?.[i] ?? 0), // Convert distance to similarity
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
import OpenAI from 'openai';
import type {
    MemoryAdapter,
    MemoryContent,
    SearchOptions,
    MemoryResult,
} from '@or3/workflow-core';

export class SupabaseMemoryAdapter implements MemoryAdapter {
    private supabase;
    private openai: OpenAI;

    constructor(options: {
        supabaseUrl: string;
        supabaseKey: string;
        openaiApiKey: string;
    }) {
        this.supabase = createClient(options.supabaseUrl, options.supabaseKey);
        this.openai = new OpenAI({ apiKey: options.openaiApiKey });
    }

    private async embed(text: string): Promise<number[]> {
        const response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        return response.data[0].embedding;
    }

    async store(content: MemoryContent): Promise<string> {
        const id = crypto.randomUUID();
        const embedding = await this.embed(content.text);

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
        const embedding = await this.embed(query);

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

const memory = new PineconeMemoryAdapter({
    pineconeApiKey: process.env.PINECONE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
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

## Next Steps

-   [Token Counters](./token-counter.md) - Token counting adapters
-   [Memory Node](../nodes/memory.md) - Memory node documentation
