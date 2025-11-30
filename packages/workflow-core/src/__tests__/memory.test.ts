import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter, type MemoryEntry } from '../memory';
import { ExecutionSession } from '../session';

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter;
  let baseEntry: MemoryEntry;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    baseEntry = {
      id: '1',
      content: 'First memory about testing',
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'user',
        sessionId: 'session-1',
      },
    };
  });

  it('stores and retrieves entries by text', async () => {
    await adapter.store(baseEntry);
    await adapter.store({
      ...baseEntry,
      id: '2',
      content: 'Second memory: vitest',
    });

    const results = await adapter.query({ text: 'vitest', limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('respects session scoping and limit', async () => {
    await adapter.store(baseEntry);
    await adapter.store({
      ...baseEntry,
      id: '2',
      metadata: { ...baseEntry.metadata, sessionId: 'session-2' },
    });

    const session1 = await adapter.query({ sessionId: 'session-1', limit: 10 });
    expect(session1).toHaveLength(1);
    expect(session1[0]?.metadata.sessionId).toBe('session-1');
  });

  it('applies metadata filters and deletes entries', async () => {
    await adapter.store(baseEntry);
    await adapter.store({
      ...baseEntry,
      id: '2',
      metadata: { ...baseEntry.metadata, nodeId: 'node-1' },
    });

    const filtered = await adapter.query({ filter: { nodeId: 'node-1' } });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('2');

    await adapter.delete('2');
    const remaining = await adapter.query({ text: 'memory' });
    expect(remaining.map(r => r.id)).toEqual(['1']);
  });

  it('clears by session or entirely', async () => {
    await adapter.store(baseEntry);
    await adapter.store({
      ...baseEntry,
      id: '2',
      metadata: { ...baseEntry.metadata, sessionId: 'session-2' },
    });

    await adapter.clear('session-1');
    const afterSessionClear = await adapter.query({ text: 'memory', limit: 10 });
    expect(afterSessionClear.map(r => r.id)).toEqual(['2']);

    await adapter.clear();
    const empty = await adapter.query({ text: 'memory' });
    expect(empty).toHaveLength(0);
  });
});

describe('ExecutionSession', () => {
  it('tracks messages, recency, and token counts', () => {
    const session = new ExecutionSession('sess-1');
    session.addMessage({ role: 'user', content: 'Hello world' });
    session.addMessage({ role: 'assistant', content: 'Hi there' });
    session.addMessage({ role: 'user', content: 'Another message' });

    expect(session.messageCount).toBe(3);
    expect(session.getRecent(2).length).toBe(2);
    expect(session.tokenCount).toBeGreaterThan(0);

    session.clear();
    expect(session.messageCount).toBe(0);
  });
});
