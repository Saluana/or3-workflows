/**
 * Memory system interfaces and default in-memory adapter.
 * 
 * The interfaces are intentionally minimal so developers can bring their own
 * persistence layer (Redis, Postgres, vector DBs, etc.).
 */
export interface MemoryEntry {
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

export interface MemoryQuery {
  /** Text to search for (semantic or keyword based on adapter) */
  text?: string;
  /** Maximum results to return */
  limit?: number;
  /** Filter by metadata fields */
  filter?: Record<string, unknown>;
  /** Session ID to scope query */
  sessionId?: string;
}

export interface MemoryAdapter {
  /** Store a memory entry */
  store(entry: MemoryEntry): Promise<void>;

  /** Query for relevant memories */
  query(query: MemoryQuery): Promise<MemoryEntry[]>;

  /** Delete a specific memory */
  delete(id: string): Promise<void>;

  /** Clear all memories (optionally filtered by session) */
  clear(sessionId?: string): Promise<void>;
}

/**
 * Default in-memory adapter for development/testing.
 * NOT suitable for production - use a persistent adapter.
 */
export class InMemoryAdapter implements MemoryAdapter {
  private entries: Map<string, MemoryEntry> = new Map();

  async store(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async query(query: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values());

    if (query.sessionId) {
      results = results.filter(e => e.metadata.sessionId === query.sessionId);
    }

    if (query.text) {
      const searchText = query.text.toLowerCase();
      results = results.filter(e =>
        e.content.toLowerCase().includes(searchText)
      );
    }

    if (query.filter) {
      results = results.filter(e => {
        for (const [key, value] of Object.entries(query.filter!)) {
          if (e.metadata[key] !== value) return false;
        }
        return true;
      });
    }

    results.sort(
      (a, b) =>
        new Date(b.metadata.timestamp).getTime() -
        new Date(a.metadata.timestamp).getTime()
    );

    return results.slice(0, query.limit || 10);
  }

  async delete(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async clear(sessionId?: string): Promise<void> {
    if (!sessionId) {
      this.entries.clear();
      return;
    }

    for (const [id, entry] of this.entries.entries()) {
      if (entry.metadata.sessionId === sessionId) {
        this.entries.delete(id);
      }
    }
  }
}

/**
 * Example Redis implementation
 * ```typescript
 * class RedisMemoryAdapter implements MemoryAdapter {
 *   constructor(private redis: Redis) {}
 *
 *   async store(entry: MemoryEntry): Promise<void> {
 *     await this.redis.hset(`memory:${entry.id}`, entry);
 *   }
 *
 *   async query(query: MemoryQuery): Promise<MemoryEntry[]> {
 *     // Implement your search logic
 *     return [];
 *   }
 * }
 * ```
 */
