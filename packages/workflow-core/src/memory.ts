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
 *
 * Features:
 * - Token-based scoring for better relevance matching
 * - Stop word filtering for more meaningful matches
 * - Recency weighting for search results
 */
export class InMemoryAdapter implements MemoryAdapter {
    private entries: Map<string, MemoryEntry> = new Map();

    // Common stop words to filter out for better matching
    private static STOP_WORDS = new Set([
        'a',
        'an',
        'the',
        'and',
        'or',
        'but',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'shall',
        'to',
        'of',
        'in',
        'for',
        'on',
        'with',
        'at',
        'by',
        'from',
        'as',
        'into',
        'through',
        'during',
        'before',
        'after',
        'above',
        'below',
        'up',
        'down',
        'out',
        'off',
        'over',
        'under',
        'again',
        'further',
        'then',
        'once',
        'here',
        'there',
        'when',
        'where',
        'why',
        'how',
        'all',
        'each',
        'few',
        'more',
        'most',
        'other',
        'some',
        'such',
        'no',
        'nor',
        'not',
        'only',
        'own',
        'same',
        'so',
        'than',
        'too',
        'very',
        'just',
        'can',
        'now',
        'i',
        'you',
        'he',
        'she',
        'it',
        'we',
        'they',
        'what',
        'which',
        'who',
        'this',
        'that',
        'these',
        'those',
        'am',
    ]);

    /**
     * Tokenize text into meaningful words, filtering stop words.
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
            .split(/\s+/)
            .filter(
                (word) =>
                    word.length > 2 && !InMemoryAdapter.STOP_WORDS.has(word)
            );
    }

    /**
     * Calculate relevance score based on token overlap.
     * Uses Jaccard similarity with term frequency weighting.
     */
    private calculateRelevance(
        queryTokens: string[],
        entryContent: string
    ): number {
        if (queryTokens.length === 0) return 0;

        const entryTokens = this.tokenize(entryContent);
        if (entryTokens.length === 0) return 0;

        // Count token frequencies in entry
        const entryFreq = new Map<string, number>();
        for (const token of entryTokens) {
            entryFreq.set(token, (entryFreq.get(token) || 0) + 1);
        }

        // Calculate weighted overlap score
        let matchScore = 0;
        let totalQueryWeight = 0;

        for (const queryToken of queryTokens) {
            totalQueryWeight += 1;

            // Exact match
            if (entryFreq.has(queryToken)) {
                matchScore += 1 + Math.log(1 + entryFreq.get(queryToken)!);
                continue;
            }

            // Partial match - require at least 4 characters and 70% overlap
            for (const [entryToken, freq] of entryFreq) {
                const minLen = Math.min(queryToken.length, entryToken.length);
                const maxLen = Math.max(queryToken.length, entryToken.length);

                // Skip if too short for meaningful partial matching
                if (minLen < 4) continue;

                // Check if one is prefix of the other with sufficient overlap
                const isPrefix =
                    entryToken.startsWith(queryToken) ||
                    queryToken.startsWith(entryToken);
                const overlapRatio = minLen / maxLen;

                if (isPrefix && overlapRatio >= 0.7) {
                    matchScore += 0.5 * (1 + Math.log(1 + freq));
                    break;
                }
            }
        }

        // Normalize by query length
        return matchScore / totalQueryWeight;
    }

    async store(entry: MemoryEntry): Promise<void> {
        this.entries.set(entry.id, entry);
    }

    async query(query: MemoryQuery): Promise<MemoryEntry[]> {
        let results = Array.from(this.entries.values());

        // Apply session filter
        if (query.sessionId) {
            results = results.filter(
                (e) => e.metadata.sessionId === query.sessionId
            );
        }

        // Apply metadata filter
        if (query.filter) {
            results = results.filter((e) => {
                for (const [key, value] of Object.entries(query.filter!)) {
                    if (e.metadata[key] !== value) return false;
                }
                return true;
            });
        }

        // Apply text search with scoring
        if (query.text) {
            const queryTokens = this.tokenize(query.text);
            const searchText = query.text.toLowerCase();

            // Score each entry
            const scored = results.map((entry) => {
                let relevanceScore = 0;

                // Exact substring match gets highest score
                if (entry.content.toLowerCase().includes(searchText)) {
                    relevanceScore += 10;
                }

                // Token-based relevance score
                relevanceScore += this.calculateRelevance(
                    queryTokens,
                    entry.content
                );

                // Only apply recency bonus if there's some relevance
                let totalScore = relevanceScore;
                if (relevanceScore > 0) {
                    const age =
                        Date.now() -
                        new Date(entry.metadata.timestamp).getTime();
                    const hoursSince = age / (1000 * 60 * 60);
                    const recencyBonus = Math.max(0, 1 - hoursSince / 24); // Decay over 24 hours
                    totalScore += recencyBonus * 0.5;
                }

                return { entry, score: totalScore };
            });

            // Filter out zero-score entries and sort by score
            results = scored
                .filter((s) => s.score > 0)
                .sort((a, b) => b.score - a.score)
                .map((s) => s.entry);
        } else {
            // No text search - sort by recency
            results.sort(
                (a, b) =>
                    new Date(b.metadata.timestamp).getTime() -
                    new Date(a.metadata.timestamp).getTime()
            );
        }

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
