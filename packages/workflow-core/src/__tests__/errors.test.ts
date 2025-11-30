import { describe, it, expect } from 'vitest';
import { classifyError, wrapError } from '../errors';

describe('errors helpers', () => {
  it('classifies common errors', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('RATE_LIMIT');
    expect(classifyError(new Error('request timeout'))).toBe('TIMEOUT');
    expect(classifyError(new Error('network failed'))).toBe('NETWORK');
    expect(classifyError(new Error('validation issue'))).toBe('VALIDATION');
    expect(classifyError(new Error('something else'))).toBe('UNKNOWN');
  });

  it('wraps errors with execution metadata', () => {
    const history: Array<{ attempt: number; error: string; timestamp: string }> = [];
    const wrapped = wrapError(new Error('oops'), 'node-1', 1, 2, history);
    expect(wrapped.nodeId).toBe('node-1');
    expect(wrapped.retry?.attempts).toBe(1);
    expect(wrapped.retry?.maxAttempts).toBe(2);
    expect(wrapped.code).toBeDefined();
  });
});
