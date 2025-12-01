import { describe, it, expect } from 'vitest';
import {
    ExecutionError,
    createExecutionError,
    classifyError,
    classifyFromStatus,
    extractRateLimitInfo,
    extractStatusCode,
    wrapError,
    DEFAULT_SKIP_ON,
    type ErrorCode,
} from '../errors';

describe('ExecutionError', () => {
    describe('construction', () => {
        it('should create error with all properties', () => {
            const error = new ExecutionError('Test error', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'LLM_ERROR',
                statusCode: 500,
                retry: { attempts: 1, maxAttempts: 3, history: [] },
                rateLimit: { retryAfter: 30 },
                cause: new Error('Original'),
            });

            expect(error.message).toBe('Test error');
            expect(error.name).toBe('ExecutionError');
            expect(error.nodeId).toBe('node-1');
            expect(error.nodeType).toBe('agent');
            expect(error.code).toBe('LLM_ERROR');
            expect(error.statusCode).toBe(500);
            expect(error.retry?.attempts).toBe(1);
            expect(error.rateLimit?.retryAfter).toBe(30);
            expect(error.cause?.message).toBe('Original');
        });
    });

    describe('isRetryable', () => {
        it('should return true for retryable errors', () => {
            const error = new ExecutionError('Rate limit', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'RATE_LIMIT',
            });

            expect(error.isRetryable()).toBe(true);
            expect(error.isRetryable(['AUTH'])).toBe(true);
        });

        it('should return false for AUTH errors', () => {
            const error = new ExecutionError('Unauthorized', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'AUTH',
            });

            expect(error.isRetryable()).toBe(false);
            expect(error.isRetryable(DEFAULT_SKIP_ON)).toBe(false);
        });

        it('should return false for VALIDATION errors', () => {
            const error = new ExecutionError('Invalid input', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'VALIDATION',
            });

            expect(error.isRetryable()).toBe(false);
        });

        it('should respect custom skipOn list', () => {
            const error = new ExecutionError('Network error', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'NETWORK',
            });

            expect(error.isRetryable()).toBe(true);
            expect(error.isRetryable(['NETWORK'])).toBe(false);
        });
    });

    describe('getSuggestedDelay', () => {
        it('should use retryAfter when available', () => {
            const error = new ExecutionError('Rate limit', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'RATE_LIMIT',
                rateLimit: { retryAfter: 20 }, // 20 seconds = 20000ms, under default 30000 max
            });

            expect(error.getSuggestedDelay(1000, 1)).toBe(20000);
        });

        it('should cap at maxDelay', () => {
            const error = new ExecutionError('Rate limit', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'RATE_LIMIT',
                rateLimit: { retryAfter: 120 },
            });

            expect(error.getSuggestedDelay(1000, 1, 30000)).toBe(30000);
        });

        it('should use exponential backoff without retryAfter', () => {
            const error = new ExecutionError('Error', {
                nodeId: 'node-1',
                nodeType: 'agent',
                code: 'LLM_ERROR',
            });

            expect(error.getSuggestedDelay(1000, 1)).toBe(1000);
            expect(error.getSuggestedDelay(1000, 2)).toBe(2000);
            expect(error.getSuggestedDelay(1000, 3)).toBe(4000);
        });
    });
});

describe('classifyError', () => {
    it('should classify rate limit errors', () => {
        expect(classifyError(new Error('rate limit exceeded'))).toBe(
            'RATE_LIMIT'
        );
        expect(classifyError(new Error('Error 429'))).toBe('RATE_LIMIT');
    });

    it('should classify timeout errors', () => {
        expect(classifyError(new Error('request timeout'))).toBe('TIMEOUT');
        expect(classifyError(new Error('operation timed out'))).toBe('TIMEOUT');
    });

    it('should classify auth errors', () => {
        expect(classifyError(new Error('unauthorized'))).toBe('AUTH');
        expect(classifyError(new Error('401 error'))).toBe('AUTH');
        expect(classifyError(new Error('403 forbidden'))).toBe('AUTH');
    });

    it('should classify network errors', () => {
        expect(classifyError(new Error('network error'))).toBe('NETWORK');
        expect(classifyError(new Error('fetch failed'))).toBe('NETWORK');
        expect(classifyError(new Error('ECONNREFUSED'))).toBe('NETWORK');
    });

    it('should classify validation errors', () => {
        expect(classifyError(new Error('validation failed'))).toBe(
            'VALIDATION'
        );
        expect(classifyError(new Error('invalid input'))).toBe('VALIDATION');
    });

    it('should return UNKNOWN for unrecognized errors', () => {
        expect(classifyError(new Error('something went wrong'))).toBe(
            'UNKNOWN'
        );
        expect(classifyError('not an error')).toBe('UNKNOWN');
    });
});

describe('classifyFromStatus', () => {
    it('should classify 429 as RATE_LIMIT', () => {
        expect(classifyFromStatus(429)).toBe('RATE_LIMIT');
    });

    it('should classify 401/403 as AUTH', () => {
        expect(classifyFromStatus(401)).toBe('AUTH');
        expect(classifyFromStatus(403)).toBe('AUTH');
    });

    it('should classify 408/504 as TIMEOUT', () => {
        expect(classifyFromStatus(408)).toBe('TIMEOUT');
        expect(classifyFromStatus(504)).toBe('TIMEOUT');
    });

    it('should classify 4xx as VALIDATION', () => {
        expect(classifyFromStatus(400)).toBe('VALIDATION');
        expect(classifyFromStatus(422)).toBe('VALIDATION');
    });

    it('should classify 5xx as LLM_ERROR', () => {
        expect(classifyFromStatus(500)).toBe('LLM_ERROR');
        expect(classifyFromStatus(502)).toBe('LLM_ERROR');
        expect(classifyFromStatus(503)).toBe('LLM_ERROR');
    });

    it('should return UNKNOWN for other codes', () => {
        expect(classifyFromStatus(200)).toBe('UNKNOWN');
        expect(classifyFromStatus(301)).toBe('UNKNOWN');
    });
});

describe('extractRateLimitInfo', () => {
    it('should extract from Headers object', () => {
        const headers = new Headers({
            'retry-after': '30',
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '2024-01-01T00:00:00Z',
        });

        const info = extractRateLimitInfo({ headers });

        expect(info?.retryAfter).toBe(30);
        expect(info?.limit).toBe(100);
        expect(info?.remaining).toBe(0);
        expect(info?.resetAt).toBe('2024-01-01T00:00:00Z');
    });

    it('should extract from plain object headers', () => {
        const info = extractRateLimitInfo({
            headers: {
                'Retry-After': '60',
                'X-RateLimit-Limit': '50',
            },
        });

        expect(info?.retryAfter).toBe(60);
        expect(info?.limit).toBe(50);
    });

    it('should return undefined without headers', () => {
        expect(extractRateLimitInfo({})).toBeUndefined();
        expect(extractRateLimitInfo({ headers: {} })).toBeUndefined();
    });
});

describe('extractStatusCode', () => {
    it('should extract status from response-like object', () => {
        expect(extractStatusCode({ status: 429 })).toBe(429);
        expect(extractStatusCode({ statusCode: 500 })).toBe(500);
    });

    it('should extract from nested response', () => {
        expect(extractStatusCode({ response: { status: 401 } })).toBe(401);
    });

    it('should return undefined for non-objects', () => {
        expect(extractStatusCode(null)).toBeUndefined();
        expect(extractStatusCode('error')).toBeUndefined();
        expect(extractStatusCode(123)).toBeUndefined();
    });
});

describe('createExecutionError', () => {
    it('should create error from thrown Error', () => {
        const cause = new Error('Original error');
        const error = createExecutionError(cause, 'node-1', 'agent', 2, 3, [
            {
                attempt: 1,
                error: 'First try',
                timestamp: '2024-01-01T00:00:00Z',
            },
        ]);

        expect(error).toBeInstanceOf(ExecutionError);
        expect(error.message).toBe('Original error');
        expect(error.nodeId).toBe('node-1');
        expect(error.nodeType).toBe('agent');
        expect(error.retry?.attempts).toBe(2);
        expect(error.retry?.maxAttempts).toBe(3);
        expect(error.retry?.history).toHaveLength(1);
        expect(error.cause).toBe(cause);
    });

    it('should create error from string', () => {
        const error = createExecutionError(
            'String error',
            'node-1',
            'router',
            1,
            1,
            []
        );

        expect(error.message).toBe('String error');
    });

    it('should classify from status code when available', () => {
        const error = createExecutionError(
            { message: 'Error', status: 429 },
            'node-1',
            'agent',
            1,
            1,
            []
        );

        expect(error.code).toBe('RATE_LIMIT');
        expect(error.statusCode).toBe(429);
    });

    it('should extract rate limit info from response', () => {
        const headers = new Headers({ 'retry-after': '30' });
        const error = createExecutionError(
            { message: 'Rate limited', status: 429, headers },
            'node-1',
            'agent',
            1,
            1,
            []
        );

        expect(error.rateLimit?.retryAfter).toBe(30);
    });

    it('should not mutate original error', () => {
        const original = new Error('Original');
        const exec = createExecutionError(
            original,
            'node-1',
            'agent',
            1,
            1,
            []
        );

        expect(original).not.toHaveProperty('nodeId');
        expect(original).not.toHaveProperty('code');
        expect(exec.cause).toBe(original);
    });
});

describe('wrapError (deprecated)', () => {
    it('should still work for backwards compatibility', () => {
        const wrapped = wrapError(new Error('oops'), 'node-1', 1, 2, []);

        expect(wrapped.nodeId).toBe('node-1');
        expect(wrapped.retry?.attempts).toBe(1);
        expect(wrapped.retry?.maxAttempts).toBe(2);
        expect(wrapped.code).toBeDefined();
    });
});

describe('DEFAULT_SKIP_ON', () => {
    it('should include AUTH and VALIDATION', () => {
        expect(DEFAULT_SKIP_ON).toContain('AUTH');
        expect(DEFAULT_SKIP_ON).toContain('VALIDATION');
        expect(DEFAULT_SKIP_ON).not.toContain('RATE_LIMIT');
        expect(DEFAULT_SKIP_ON).not.toContain('NETWORK');
    });
});
