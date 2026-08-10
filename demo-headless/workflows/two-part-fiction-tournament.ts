import type {
    ReasoningEffort,
    WorkflowData,
    WorkflowEdge,
    WorkflowNode,
} from 'or3-workflow-core';

export const TWO_PART_WRITERS = {
    deepseek: '~deepseek/deepseek-v4-flash-latest',
    glm: 'z-ai/glm-5.2',
    luna: 'openai/gpt-5.6-luna',
} as const;
export const TWO_PART_JUDGE = 'openai/gpt-5.6-luna-pro';

const position = (index: number) => ({
    x: (index % 4) * 300,
    y: Math.floor(index / 4) * 200,
});

const node = (
    id: string,
    type: string,
    data: Record<string, unknown>,
    index: number
): WorkflowNode => ({ id, type, data: data as any, position: position(index) });

const edge = (
    source: string,
    target: string,
    inputKey?: string
): WorkflowEdge => ({
    id: `${source}-${target}${inputKey ? `-${inputKey}` : ''}`,
    source,
    target,
    ...(inputKey
        ? { data: { inputMapping: { mode: 'json', key: inputKey } } }
        : {}),
});

const request = (model: string, effort: ReasoningEffort) => ({
    version: 1 as const,
    models: [model] as [string],
    generation: { reasoning: { effort } },
});

const writers = [
    {
        id: 'deepseek',
        label: 'DeepSeek',
        model: TWO_PART_WRITERS.deepseek,
        effort: 'max' as const,
        craft: 'Build atmosphere from precise observation and escalating implication. Keep the causal chain easy to follow.',
    },
    {
        id: 'glm',
        label: 'GLM',
        model: TWO_PART_WRITERS.glm,
        // OpenRouter maps GLM 5.2 xhigh to its maximum reasoning mode.
        effort: 'xhigh' as const,
        craft: 'Prioritize character pressure, vivid dialogue, emotional reversals, and a changed story state in every scene.',
    },
    {
        id: 'luna',
        label: 'Luna',
        model: TWO_PART_WRITERS.luna,
        effort: 'max' as const,
        craft: 'Use deliberate structure, clean scene transitions, and discoveries that feel earned instead of arbitrary.',
    },
] as const;

const storyOutlinePrompt = [
    'Create a compact, complete two-part speculative mystery from the user premise.',
    'Return Markdown with exactly these headings: "# Story bible", "## Part 1", and "## Part 2".',
    'Include protagonist, desire, central mystery, setting rules, recurring images, supporting characters, emotional arc, ending, and continuity facts.',
    'Give each part a title and concise scene beats. Part 1 ends with a consequential revelation; Part 2 resolves the central dramatic question.',
].join('\n');

const writerPrompt = [
    'Write one part of a two-part speculative mystery from the provided story bible, accepted earlier part when present, and current beat sheet.',
    'Return only finished story prose in Markdown, starting with the exact requested part heading.',
    'Preserve names, tense, point of view, world rules, clues, and consequences. Dramatize scenes; do not add editorial commentary.',
].join('\n');

const judgePrompt = [
    'Act as a blind fiction editor choosing one of three candidate parts for the same story.',
    'Judge continuity, plot movement, character truth, scene craft, clarity, tone, and whether the draft fulfills the supplied part beats.',
    'Your first line must be exactly "<!-- WINNER: DEEPSEEK -->", "<!-- WINNER: GLM -->", or "<!-- WINNER: LUNA -->".',
    'Your second line must be exactly "<!-- SCORES: DEEPSEEK=<number 0-10> GLM=<number 0-10> LUNA=<number 0-10> -->".',
    'After those lines, reproduce the selected candidate verbatim. Do not merge, revise, summarize, explain, or alter its heading.',
].join('\n');

const nextPartBeatsPrompt = [
    'You are the continuity editor for a two-part speculative mystery.',
    'From the story bible and accepted Part 1, produce exactly six numbered loose beats for Part 2.',
    'Each beat must preserve established facts, advance or pay off a clue, and identify a meaningful story-state change where relevant.',
    'Do not write prose, a preface, or a conclusion.',
].join('\n');

/**
 * Live integration workflow: three independent writers compete on each of two
 * connected parts, while one judge chooses the verbatim winner for continuity.
 */
export function createTwoPartFictionTournament(): WorkflowData {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    let index = 0;

    nodes.push(node('start', 'start', { label: 'Story premise' }, index++));
    nodes.push(
        node(
            'outline',
            'agent',
            {
                label: 'Story architect',
                model: TWO_PART_JUDGE,
                modelRequest: request(TWO_PART_JUDGE, 'max'),
                prompt: storyOutlinePrompt,
                task: 'Create the two-part story bible from the supplied premise.',
            },
            index++
        )
    );
    edges.push(edge('start', 'outline'));

    for (const part of [1, 2] as const) {
        const writerIds: string[] = [];
        for (const writer of writers) {
            const id = `writer-${writer.id}-part-${part}`;
            writerIds.push(id);
            nodes.push(
                node(
                    id,
                    'agent',
                    {
                        label: `Part ${part} · ${writer.label}`,
                        model: writer.model,
                        modelRequest: request(writer.model, writer.effort),
                        prompt: `${writerPrompt}\n\nCraft direction:\n${writer.craft}`,
                        task: `Write Part ${part}. Begin exactly with "# Part ${part}:".`,
                    },
                    index++
                )
            );
            edges.push(edge('outline', id, 'storyBible'));
            if (part === 2) {
                edges.push(edge('judge-part-1', id, 'acceptedPart1'));
                edges.push(edge('beats-part-2', id, 'part2Beats'));
            }
        }

        const judge = `judge-part-${part}`;
        nodes.push(
            node(
                judge,
                'agent',
                {
                    label: `Judge Part ${part}`,
                    model: TWO_PART_JUDGE,
                    modelRequest: request(TWO_PART_JUDGE, 'max'),
                    prompt: judgePrompt,
                    task: `Choose the best candidate for Part ${part} and return it exactly as instructed.`,
                },
                index++
            )
        );
        edges.push(edge('outline', judge, 'storyBible'));
        if (part === 2) {
            edges.push(edge('judge-part-1', judge, 'acceptedPart1'));
            edges.push(edge('beats-part-2', judge, 'part2Beats'));
        }
        for (const id of writerIds) {
            const key = id.includes('deepseek')
                ? 'draftDeepseek'
                : id.includes('glm')
                  ? 'draftGlm'
                  : 'draftLuna';
            edges.push(edge(id, judge, key));
        }

        if (part === 1) {
            nodes.push(
                node(
                    'beats-part-2',
                    'agent',
                    {
                        label: 'Beats for Part 2',
                        model: TWO_PART_JUDGE,
                        modelRequest: request(TWO_PART_JUDGE, 'max'),
                        prompt: nextPartBeatsPrompt,
                        task: 'Create the Part 2 beat sheet.',
                    },
                    index++
                )
            );
            edges.push(edge('outline', 'beats-part-2', 'storyBible'));
            edges.push(edge('judge-part-1', 'beats-part-2', 'acceptedPart1'));
        }
    }

    nodes.push(
        node(
            'manuscript',
            'output',
            {
                label: 'Complete two-part story',
                mode: 'combine',
                format: 'markdown',
                sources: ['judge-part-1', 'judge-part-2'],
                introText: '# Complete Two-Part Story',
            },
            index++
        )
    );
    edges.push(edge('judge-part-1', 'manuscript'));
    edges.push(edge('judge-part-2', 'manuscript'));

    return {
        meta: {
            id: 'two-part-three-writer-tournament',
            version: '2.0.0',
            name: 'Two-Part Three-Writer Fiction Tournament',
            description:
                'Builds a two-part story bible, has three writers draft each part, and carries each judge-selected winner forward.',
        },
        nodes,
        edges,
    };
}

export const twoPartFictionTournament = createTwoPartFictionTournament();
