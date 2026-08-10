import { OpenRouter } from '@openrouter/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    OpenRouterExecutionAdapter,
    type ExecutionCallbacks,
    type ExecutionResult,
    type WorkflowData,
} from 'or3-workflow-core';

import {
    LONGFORM_CHAPTERS,
    LONGFORM_MODEL,
    nonfictionBookWorkflow,
    researchedNonfictionBookWorkflow,
} from '../../workflows/longform-book-workflows';
import {
    FICTION_CHAPTERS,
    fictionBookWorkflow,
} from '../../workflows/fiction-book-workflow';

const LIVE = process.env.RUN_OPENROUTER_LONGFORM === '1';
const API_KEY = process.env.OPENROUTER_API_KEY;

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function chapterHeadings(text: string): number[] {
    return [...text.matchAll(/^# Chapter\s+(\d+):/gim)].map((match) =>
        Number(match[1])
    );
}

function urls(text: string): string[] {
    return [...text.matchAll(/https?:\/\/[^\s)\]>]+/g)].map((match) =>
        match[0].replace(/[.,;]+$/, '')
    );
}

async function writeBook(
    label: string,
    workflow: WorkflowData,
    idea: string,
    expectedChapterStages: number
): Promise<ExecutionResult> {
    if (!API_KEY) throw new Error('OPENROUTER_API_KEY is required');
    const chapterStarts = new Set<string>();
    const startedAt = Date.now();
    const callbacks: ExecutionCallbacks = {
        onNodeStart: (nodeId) => {
            if (
                /^(research|writer|proofreader|reviser)-\d+$/.test(nodeId) ||
                /^(writer-[ab]|judge|beats)-\d+$/.test(nodeId)
            ) {
                chapterStarts.add(nodeId);
                console.info(
                    `[longform:${label}] start ${nodeId} (${Math.round((Date.now() - startedAt) / 1000)}s)`
                );
            }
        },
        onNodeFinish: (nodeId, output) => {
            if (
                /^(writer|proofreader|reviser)-\d+$/.test(nodeId) ||
                /^(writer-[ab]|judge|beats)-\d+$/.test(nodeId)
            ) {
                console.info(
                    `[longform:${label}] finish ${nodeId}: ${countWords(output)} words`
                );
            }
        },
        onNodeError: (nodeId, error) => {
            console.info(
                `[longform:${label}] error ${nodeId}: ${error.message}`
            );
        },
        onToken: () => undefined,
    };
    const adapter = new OpenRouterExecutionAdapter(
        new OpenRouter({ apiKey: API_KEY }) as any,
        {
            defaultModel: LONGFORM_MODEL,
            maxRetries: 1,
            retryDelayMs: 1_000,
            maxNodeExecutions: 100,
        }
    );
    const result = await adapter.execute(
        workflow,
        { text: idea, attachments: [] },
        callbacks
    );
    console.info(
        `[longform:${label}] success=${result.success} duration=${Math.round(result.duration / 1000)}s words=${countWords(result.output)} calls=${result.modelCalls?.length ?? 0} cost=${result.costUsd ?? 'unreported'}`
    );
    const generatedDir = resolve(
        process.cwd(),
        'demo-headless',
        'generated',
        'longform'
    );
    await mkdir(generatedDir, { recursive: true });
    await writeFile(
        resolve(generatedDir, `${label}-manuscript.md`),
        result.output,
        'utf8'
    );
    await writeFile(
        resolve(generatedDir, `${label}-report.json`),
        JSON.stringify(
            {
                success: result.success,
                error: result.error?.message,
                durationMs: result.duration,
                words: countWords(result.output),
                executionOrder: result.executionOrder,
                modelCalls: result.modelCalls,
                costUsd: result.costUsd,
            },
            null,
            2
        ),
        'utf8'
    );
    if (result.success) {
        expect(chapterStarts.size).toBe(expectedChapterStages);
    }
    return result;
}

function verifyFictionBook(result: ExecutionResult) {
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    const expectedChapterNumbers = Array.from(
        { length: FICTION_CHAPTERS },
        (_, index) => index + 1
    );
    expect(chapterHeadings(result.output)).toEqual(expectedChapterNumbers);

    const outline = JSON.parse(result.nodeOutputs.outline);
    expect(outline.chapters).toHaveLength(FICTION_CHAPTERS);

    for (let chapter = 1; chapter <= FICTION_CHAPTERS; chapter++) {
        const judged = result.nodeOutputs[`judge-${chapter}`].trim();
        const metadata = judged.match(
            /^<!-- WINNER: ([AB]) -->\s*\n<!-- SCORES: A=(?:\d+(?:\.\d+)?) B=(?:\d+(?:\.\d+)?) -->\s*/
        );
        const winner = metadata?.[1];
        expect(winner).toMatch(/^[AB]$/);
        const selected = result.nodeOutputs[
            `writer-${winner!.toLowerCase()}-${chapter}`
        ].trim();
        const winningBody = judged.slice(metadata![0].length).trim();
        expect(winningBody).toBe(selected);
        expect(winningBody).toMatch(
            new RegExp(`^# Chapter\\s+${chapter}:`, 'i')
        );
    }

    for (let chapter = 1; chapter < FICTION_CHAPTERS; chapter++) {
        const beats = result.nodeOutputs[`beats-${chapter}`].trim();
        expect(beats.length).toBeGreaterThan(80);
        expect(beats).toMatch(/(^|\n)1\.\s/);
        expect(beats).toMatch(/(^|\n)8\.\s/);
        expect(
            result.modelCalls?.find((call) => call.nodeId === `beats-${chapter}`)
                ?.finishReason
        ).not.toBe('length');
    }
}

function verifyBook(result: ExecutionResult) {
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    const headings = chapterHeadings(result.output);
    const expectedChapterNumbers = Array.from(
        { length: LONGFORM_CHAPTERS },
        (_, index) => index + 1
    );
    expect(headings).toEqual(expectedChapterNumbers);
    expect(new Set(headings).size).toBe(LONGFORM_CHAPTERS);

    const outline = JSON.parse(result.nodeOutputs.outline);
    expect(outline.chapters).toHaveLength(LONGFORM_CHAPTERS);
    expect(outline.chapters.map((chapter: any) => chapter.number)).toEqual(
        expectedChapterNumbers
    );

    for (let chapter = 1; chapter <= LONGFORM_CHAPTERS; chapter++) {
        const revised = result.nodeOutputs[`reviser-${chapter}`];
        expect(revised).toMatch(
            new RegExp(`^# Chapter\\s+${chapter}:`, 'i')
        );
        expect(revised.toLowerCase()).not.toContain('editorial memo');
    }
}

describe('fiction book workflow definition', () => {
    it('unrolls exactly three two-writer competitions with one judge each', () => {
        const writerIds = fictionBookWorkflow.nodes
            .filter((node) => /^writer-[ab]-\d+$/.test(node.id))
            .map((node) => node.id);
        const judgeIds = fictionBookWorkflow.nodes
            .filter((node) => /^judge-\d+$/.test(node.id))
            .map((node) => node.id);

        expect(FICTION_CHAPTERS).toBe(3);
        expect(writerIds).toHaveLength(FICTION_CHAPTERS * 2);
        expect(judgeIds).toEqual(['judge-1', 'judge-2', 'judge-3']);
        expect(
            fictionBookWorkflow.nodes
                .filter((node) => /^beats-\d+$/.test(node.id))
                .map((node) => node.id)
        ).toEqual(['beats-1', 'beats-2']);
        expect(
            fictionBookWorkflow.nodes.some((node) => /-4$/.test(node.id))
        ).toBe(false);

        for (let chapter = 1; chapter <= FICTION_CHAPTERS; chapter++) {
            expect(fictionBookWorkflow.edges).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        source: `writer-a-${chapter}`,
                        target: `judge-${chapter}`,
                    }),
                    expect.objectContaining({
                        source: `writer-b-${chapter}`,
                        target: `judge-${chapter}`,
                    }),
                ])
            );
            expect(
                fictionBookWorkflow.edges.some(
                    (edge) =>
                        edge.source === `writer-a-${chapter}` &&
                        edge.target === `writer-b-${chapter}`
                )
            ).toBe(false);
            if (chapter > 1) {
                expect(fictionBookWorkflow.edges).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            source: `judge-${chapter - 1}`,
                            target: `writer-a-${chapter}`,
                        }),
                        expect.objectContaining({
                            source: `judge-${chapter - 1}`,
                            target: `writer-b-${chapter}`,
                        }),
                        expect.objectContaining({
                            source: `beats-${chapter - 1}`,
                            target: `writer-a-${chapter}`,
                        }),
                        expect.objectContaining({
                            source: `beats-${chapter - 1}`,
                            target: `writer-b-${chapter}`,
                        }),
                    ])
                );
            }
        }
    });
});

describe.skipIf(!LIVE || !API_KEY)(
    `OpenRouter long-form book workflows (${LONGFORM_MODEL})`,
    () => {
        it('writes and revises a complete practical nonfiction book', async () => {
            const result = await writeBook(
                'plain',
                nonfictionBookWorkflow,
                `Write a practical nonfiction book for leaders of small nonprofit organizations about building resilient volunteer programs without burning people out. Cover volunteer motivation, role design, onboarding, communication, conflict, recognition, measurement, and succession. The tone should be candid, humane, operationally useful, and suitable for a first-time executive director.`,
                LONGFORM_CHAPTERS * 3
            );

            verifyBook(result);
            expect(result.modelCalls?.length).toBeGreaterThanOrEqual(13);
        }, 30 * 60_000);

        it('researches the web and writes a cited nonfiction book', async () => {
            const result = await writeBook(
                'researched',
                researchedNonfictionBookWorkflow,
                `Write an evidence-based nonfiction book for city officials and engaged residents about urban heat islands, their unequal public-health effects, and practical city responses. Cover heat measurement, vulnerable populations, trees and shade, cool roofs and pavement, housing and energy policy, transit and public space, implementation tradeoffs, and how cities can measure whether interventions work.`,
                LONGFORM_CHAPTERS * 4
            );

            verifyBook(result);
            const sourceUrls = urls(result.output);
            expect(new Set(sourceUrls).size).toBeGreaterThanOrEqual(12);
            for (let chapter = 1; chapter <= LONGFORM_CHAPTERS; chapter++) {
                const dossier = result.nodeOutputs[`research-${chapter}`];
                expect(new Set(urls(dossier)).size).toBeGreaterThanOrEqual(4);
                expect(result.nodeOutputs[`reviser-${chapter}`]).toMatch(
                    /## Sources/i
                );
            }
            expect(result.modelCalls?.length).toBeGreaterThanOrEqual(17);
        }, 45 * 60_000);

        it('writes a three-chapter short novel with two writers and a judge', async () => {
            const result = await writeBook(
                'fiction-tournament',
                fictionBookWorkflow,
                `Write a restrained speculative mystery about a night-shift radio operator in an isolated desert town who begins receiving tomorrow's emergency broadcasts. The messages implicate her estranged brother in a disaster that has not happened yet. Use close third-person, an eerie but humane tone, and resolve both the mystery and the siblings' emotional conflict.`,
                FICTION_CHAPTERS * 3 + (FICTION_CHAPTERS - 1)
            );

            verifyFictionBook(result);
            expect(result.modelCalls?.length).toBeGreaterThanOrEqual(12);
        }, 30 * 60_000);
    }
);
