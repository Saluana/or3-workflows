import { describe, it, expect, beforeEach } from 'vitest';
import {
    ApproximateTokenCounter,
    DEFAULT_COMPACTION_CONFIG,
    MODEL_CONTEXT_LIMITS,
    countMessageTokens,
    formatMessagesForSummary,
    calculateThreshold,
    splitMessagesForCompaction,
    createSummaryMessage,
    buildSummarizationPrompt,
    isCompactionConfig,
    type CompactionConfig,
} from '../compaction';
import type { ChatMessage } from '../types';

describe('ApproximateTokenCounter', () => {
    let counter: ApproximateTokenCounter;

    beforeEach(() => {
        counter = new ApproximateTokenCounter();
    });

    describe('count', () => {
        it('should count tokens based on character length', () => {
            // 4 chars per token by default
            expect(counter.count('1234')).toBe(1);
            expect(counter.count('12345678')).toBe(2);
            expect(counter.count('Hello')).toBe(2); // 5 chars = ceil(5/4) = 2
        });

        it('should return 0 for empty string', () => {
            expect(counter.count('')).toBe(0);
        });

        it('should handle long text', () => {
            const longText = 'a'.repeat(1000);
            expect(counter.count(longText)).toBe(250);
        });

        it('should round up partial tokens', () => {
            expect(counter.count('abc')).toBe(1); // ceil(3/4) = 1
            expect(counter.count('abcde')).toBe(2); // ceil(5/4) = 2
        });
    });

    describe('getLimit', () => {
        it('should return known model limits', () => {
            expect(counter.getLimit('openai/gpt-4o')).toBe(128000);
            expect(counter.getLimit('anthropic/claude-3.5-sonnet')).toBe(
                200000
            );
            expect(counter.getLimit('google/gemini-1.5-pro')).toBe(1000000);
        });

        it('should return default for unknown models', () => {
            expect(counter.getLimit('unknown/model')).toBe(8192);
        });

        it('should match partial model names', () => {
            // When model name contains a known pattern
            expect(counter.getLimit('gpt-4o')).toBe(128000);
        });
    });

    describe('custom options', () => {
        it('should use custom limits', () => {
            const customCounter = new ApproximateTokenCounter({
                customLimits: {
                    'my-custom-model': 50000,
                },
            });
            expect(customCounter.getLimit('my-custom-model')).toBe(50000);
        });

        it('should use custom chars per token ratio', () => {
            const customCounter = new ApproximateTokenCounter({
                charsPerToken: 3,
            });
            expect(customCounter.count('123456789')).toBe(3); // ceil(9/3) = 3
        });

        it('should allow setting limits dynamically', () => {
            counter.setLimit('my-new-model', 75000);
            expect(counter.getLimit('my-new-model')).toBe(75000);
        });
    });
});

describe('countMessageTokens', () => {
    const counter = new ApproximateTokenCounter();

    it('should count tokens across all messages', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '1234' }, // 1 token
            { role: 'assistant', content: '12345678' }, // 2 tokens
        ];
        expect(countMessageTokens(messages, counter)).toBe(3);
    });

    it('should handle empty message list', () => {
        expect(countMessageTokens([], counter)).toBe(0);
    });

    it('should handle messages with empty content', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '' },
            { role: 'assistant', content: '1234' },
        ];
        expect(countMessageTokens(messages, counter)).toBe(1);
    });
});

describe('formatMessagesForSummary', () => {
    it('should format messages with role labels', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ];
        const result = formatMessagesForSummary(messages);
        expect(result).toBe('User: Hello\n\nAssistant: Hi there!');
    });

    it('should capitalize role names', () => {
        const messages: ChatMessage[] = [
            { role: 'system', content: 'Be helpful' },
        ];
        const result = formatMessagesForSummary(messages);
        expect(result).toBe('System: Be helpful');
    });

    it('should handle empty messages', () => {
        expect(formatMessagesForSummary([])).toBe('');
    });
});

describe('calculateThreshold', () => {
    const counter = new ApproximateTokenCounter();

    it('should return specific number when threshold is a number', () => {
        const config: CompactionConfig = {
            threshold: 5000,
            preserveRecent: 5,
            strategy: 'summarize',
        };
        expect(calculateThreshold(config, 'openai/gpt-4o', counter)).toBe(5000);
    });

    it('should calculate auto threshold as modelLimit - 10000', () => {
        const config: CompactionConfig = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'summarize',
        };
        // gpt-4o has 128000 limit, so auto = 118000
        expect(calculateThreshold(config, 'openai/gpt-4o', counter)).toBe(
            118000
        );
    });

    it('should ensure minimum threshold of 1000 for small models', () => {
        const smallCounter = new ApproximateTokenCounter({
            customLimits: {
                'small-model': 5000,
            },
        });
        const config: CompactionConfig = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'summarize',
        };
        // 5000 - 10000 would be negative, so should return 1000
        expect(calculateThreshold(config, 'small-model', smallCounter)).toBe(
            1000
        );
    });
});

describe('splitMessagesForCompaction', () => {
    const messages: ChatMessage[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Message 2' },
        { role: 'user', content: 'Message 3' },
        { role: 'assistant', content: 'Message 4' },
        { role: 'user', content: 'Message 5' },
    ];

    it('should preserve recent messages and compact older ones', () => {
        const result = splitMessagesForCompaction(messages, 2);
        expect(result.toPreserve).toHaveLength(2);
        expect(result.toCompact).toHaveLength(3);
        expect(result.toPreserve[0].content).toBe('Message 4');
        expect(result.toPreserve[1].content).toBe('Message 5');
    });

    it('should return all messages as preserved when count equals length', () => {
        const result = splitMessagesForCompaction(messages, 5);
        expect(result.toPreserve).toHaveLength(5);
        expect(result.toCompact).toHaveLength(0);
    });

    it('should return all messages as preserved when count exceeds length', () => {
        const result = splitMessagesForCompaction(messages, 10);
        expect(result.toPreserve).toHaveLength(5);
        expect(result.toCompact).toHaveLength(0);
    });

    it('should handle empty messages', () => {
        const result = splitMessagesForCompaction([], 3);
        expect(result.toPreserve).toHaveLength(0);
        expect(result.toCompact).toHaveLength(0);
    });
});

describe('createSummaryMessage', () => {
    it('should create a system message with summary', () => {
        const message = createSummaryMessage('This is a summary');
        expect(message.role).toBe('system');
        expect(message.content).toBe(
            '[Previous conversation summary]: This is a summary'
        );
    });
});

describe('buildSummarizationPrompt', () => {
    it('should replace {{messages}} placeholder with formatted messages', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi!' },
        ];
        const config: CompactionConfig = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'summarize',
            summarizePrompt: 'Summarize: {{messages}}',
        };

        const result = buildSummarizationPrompt(messages, config);
        expect(result).toBe('Summarize: User: Hello\n\nAssistant: Hi!');
    });

    it('should use default prompt when none provided', () => {
        const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];
        const config: CompactionConfig = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'summarize',
        };

        const result = buildSummarizationPrompt(messages, config);
        expect(result).toContain('User: Test');
        expect(result).toContain('Summarize the following');
    });
});

describe('isCompactionConfig', () => {
    it('should return true for valid config', () => {
        const config: CompactionConfig = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'summarize',
        };
        expect(isCompactionConfig(config)).toBe(true);
    });

    it('should return true for numeric threshold', () => {
        const config = {
            threshold: 10000,
            preserveRecent: 3,
            strategy: 'truncate',
        };
        expect(isCompactionConfig(config)).toBe(true);
    });

    it('should return true for custom strategy with compactor', () => {
        const config = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'custom',
            customCompactor: async () => [],
        };
        expect(isCompactionConfig(config)).toBe(true);
    });

    it('should return false for invalid threshold', () => {
        const config = {
            threshold: 'manual', // not 'auto' or number
            preserveRecent: 5,
            strategy: 'summarize',
        };
        expect(isCompactionConfig(config)).toBe(false);
    });

    it('should return false for negative preserveRecent', () => {
        const config = {
            threshold: 'auto',
            preserveRecent: -1,
            strategy: 'summarize',
        };
        expect(isCompactionConfig(config)).toBe(false);
    });

    it('should return false for invalid strategy', () => {
        const config = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'invalid',
        };
        expect(isCompactionConfig(config)).toBe(false);
    });

    it('should return false for custom strategy without compactor', () => {
        const config = {
            threshold: 'auto',
            preserveRecent: 5,
            strategy: 'custom',
        };
        expect(isCompactionConfig(config)).toBe(false);
    });

    it('should return false for non-object values', () => {
        expect(isCompactionConfig(null)).toBe(false);
        expect(isCompactionConfig(undefined)).toBe(false);
        expect(isCompactionConfig('config')).toBe(false);
        expect(isCompactionConfig(123)).toBe(false);
    });
});

describe('DEFAULT_COMPACTION_CONFIG', () => {
    it('should have sensible defaults', () => {
        expect(DEFAULT_COMPACTION_CONFIG.threshold).toBe('auto');
        expect(DEFAULT_COMPACTION_CONFIG.preserveRecent).toBe(5);
        expect(DEFAULT_COMPACTION_CONFIG.strategy).toBe('summarize');
        expect(DEFAULT_COMPACTION_CONFIG.summarizePrompt).toBeDefined();
    });
});

describe('MODEL_CONTEXT_LIMITS', () => {
    it('should have default limit', () => {
        expect(MODEL_CONTEXT_LIMITS['default']).toBe(8192);
    });

    it('should have common model limits', () => {
        expect(MODEL_CONTEXT_LIMITS['openai/gpt-4o']).toBe(128000);
        expect(MODEL_CONTEXT_LIMITS['anthropic/claude-3.5-sonnet']).toBe(
            200000
        );
        expect(MODEL_CONTEXT_LIMITS['google/gemini-1.5-pro']).toBe(1000000);
    });
});
