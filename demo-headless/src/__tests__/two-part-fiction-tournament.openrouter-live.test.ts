import { OpenRouter } from '@openrouter/sdk';
import { describe, expect, it } from 'vitest';
import {
    OpenRouterExecutionAdapter,
    type ExecutionResult,
} from 'or3-workflow-core';

import {
    TWO_PART_JUDGE,
    TWO_PART_WRITERS,
    twoPartFictionTournament,
} from '../../workflows/two-part-fiction-tournament';

const LIVE = process.env.RUN_OPENROUTER_TWO_PART_TOURNAMENT === '1';
const API_KEY = process.env.OPENROUTER_API_KEY;
const writerModels = Object.values(TWO_PART_WRITERS);

function judgeResult(result: ExecutionResult, part: 1 | 2) {
    const judged = result.nodeOutputs[`judge-part-${part}`]?.trim() ?? '';
    const metadata = judged.match(
        /^<!-- WINNER: (DEEPSEEK|GLM|LUNA) -->\s*\n<!-- SCORES: DEEPSEEK=(?:\d+(?:\.\d+)?) GLM=(?:\d+(?:\.\d+)?) LUNA=(?:\d+(?:\.\d+)?) -->\s*/
    );
    expect(metadata).not.toBeNull();
    const winner = metadata![1]!.toLowerCase();
    const selected = result.nodeOutputs[`writer-${winner}-part-${part}`]?.trim();
    expect(judged.slice(metadata![0].length).trim()).toBe(selected);
    expect(selected).toMatch(new RegExp(`^# Part ${part}:`, 'i'));
}

describe('two-part three-writer fiction tournament definition', () => {
    it('uses each requested writer model twice and Luna Pro for editorial decisions', () => {
        const agents = twoPartFictionTournament.nodes.filter(
            (node) => node.type === 'agent'
        );
        for (const model of writerModels) {
            expect(
                agents.filter((node) => node.data.model === model)
            ).toHaveLength(2);
        }
        expect(
            agents
                .filter((node) => /^judge-part-\d$|^outline$|^beats-part-2$/.test(node.id))
                .every((node) => node.data.model === TWO_PART_JUDGE)
        ).toBe(true);
        expect(
            agents.every((node) => node.data.maxTokens === undefined)
        ).toBe(true);
        expect(
            agents
                .every((node) => node.data.temperature === undefined)
        ).toBe(true);
    });
});

describe.skipIf(!LIVE || !API_KEY)(
    'OpenRouter two-part three-writer fiction tournament',
    () => {
        it(
            'writes two coherent, judge-selected parts without an OR3 output cap',
            async () => {
                const adapter = new OpenRouterExecutionAdapter(
                    new OpenRouter({ apiKey: API_KEY }) as any,
                    {
                        defaultModel: TWO_PART_WRITERS.deepseek,
                        maxRetries: 1,
                        retryDelayMs: 1_000,
                        maxNodeExecutions: 30,
                    }
                );
                const result = await adapter.execute(
                    twoPartFictionTournament,
                    {
                        text: "Write a restrained speculative mystery about a night-shift radio operator in an isolated coastal town who begins receiving broadcasts from a lighthouse that was demolished decades ago. Make the emotional core about whether she can trust her late father's final warning.",
                        attachments: [],
                    },
                    {
                        onNodeStart: () => undefined,
                        onNodeFinish: () => undefined,
                        onNodeError: () => undefined,
                        onToken: () => undefined,
                    }
                );

                expect(result.success, result.error?.message).toBe(true);
                expect(result.error).toBeUndefined();
                expect(result.output).toMatch(/^# Complete Two-Part Story/m);
                judgeResult(result, 1);
                judgeResult(result, 2);
                expect(result.nodeOutputs['beats-part-2']).toMatch(/(^|\n)1\.\s/);
                expect(result.nodeOutputs['beats-part-2']).toMatch(/(^|\n)6\.\s/);

                const calls = result.modelCalls ?? [];
                for (const model of writerModels) {
                    expect(
                        calls.filter((call) => call.requestedModels[0] === model)
                    ).toHaveLength(2);
                }
                expect(
                    calls.filter((call) => call.requestedModels[0] === TWO_PART_JUDGE)
                ).toHaveLength(4);
            },
            45 * 60_000
        );
    }
);
