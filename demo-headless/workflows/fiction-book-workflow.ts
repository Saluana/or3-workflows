import type {
    WorkflowData,
    WorkflowEdge,
    WorkflowNode,
} from 'or3-workflow-core';

import { LONGFORM_MODEL } from './longform-book-workflows';

export const FICTION_CHAPTERS = 3;

const position = (index: number) => ({
    x: (index % 4) * 280,
    y: Math.floor(index / 4) * 180,
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
        ? {
              data: {
                  inputMapping: { mode: 'json', key: inputKey },
              },
          }
        : {}),
});

const modelRequest = {
    version: 1 as const,
    models: [LONGFORM_MODEL] as [string],
    generation: { reasoning: { effort: 'none' as const } },
};

const outlineSchema = {
    type: 'object',
    properties: {
        title: { type: 'string', maxLength: 120 },
        genre: { type: 'string', maxLength: 80 },
        premise: { type: 'string', maxLength: 320 },
        tone: { type: 'string', maxLength: 160 },
        pointOfView: { type: 'string', maxLength: 100 },
        tense: { type: 'string', maxLength: 40 },
        setting: { type: 'string', maxLength: 240 },
        characters: {
            type: 'array',
            minItems: 2,
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string', maxLength: 80 },
                    role: { type: 'string', maxLength: 120 },
                    desire: { type: 'string', maxLength: 180 },
                    conflict: { type: 'string', maxLength: 180 },
                    change: { type: 'string', maxLength: 180 },
                },
                required: ['name', 'role', 'desire', 'conflict', 'change'],
                additionalProperties: false,
            },
        },
        chapters: {
            type: 'array',
            minItems: FICTION_CHAPTERS,
            maxItems: FICTION_CHAPTERS,
            items: {
                type: 'object',
                properties: {
                    number: {
                        type: 'integer',
                        minimum: 1,
                        maximum: FICTION_CHAPTERS,
                    },
                    title: { type: 'string', maxLength: 120 },
                    goal: { type: 'string', maxLength: 240 },
                    openingSituation: { type: 'string', maxLength: 240 },
                    turningPoints: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 4,
                        items: { type: 'string', maxLength: 220 },
                    },
                    endingState: { type: 'string', maxLength: 240 },
                    continuityRequirements: {
                        type: 'array',
                        maxItems: 5,
                        items: { type: 'string', maxLength: 180 },
                    },
                },
                required: [
                    'number',
                    'title',
                    'goal',
                    'openingSituation',
                    'turningPoints',
                    'endingState',
                    'continuityRequirements',
                ],
                additionalProperties: false,
            },
        },
    },
    required: [
        'title',
        'genre',
        'premise',
        'tone',
        'pointOfView',
        'tense',
        'setting',
        'characters',
        'chapters',
    ],
    additionalProperties: false,
};

/**
 * Three-chapter short-novel tournament. Each chapter is drafted by two agents
 * in the same DAG wave. A judge ranks both drafts and selects one verbatim. A
 * continuity editor then reads the outline and every accepted chapter to make
 * loose beats for the next chapter.
 */
export function createFictionBookWorkflow(): WorkflowData {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    const winners: string[] = [];
    let index = 0;

    nodes.push(node('start', 'start', { label: 'Story idea' }, index++));
    nodes.push(
        node(
            'outline',
            'agent',
            {
                label: 'Story architect',
                model: LONGFORM_MODEL,
                modelRequest,
                temperature: 0.1,
                prompt: `Design a complete short novel from the user's premise.

Create exactly ${FICTION_CHAPTERS} chapters with a clear beginning, escalation, climax, and satisfying resolution. Establish a compact cast, concrete character desires, causal turning points, point of view, tense, setting, tone, and continuity facts. Every chapter must change the story state and the final chapter must resolve the central dramatic question. Avoid generic filler and leave room for dramatized scenes rather than summary.`,
                structuredOutput: {
                    name: 'short_novel_outline',
                    description:
                        `A complete ${FICTION_CHAPTERS}-chapter plan for a short novel.`,
                    strict: true,
                    schema: outlineSchema,
                    repair: {
                        maxAttempts: 1,
                        backend: 'retry',
                    },
                },
            },
            index++
        )
    );
    edges.push(edge('start', 'outline'));

    const writerPrompt = `Write one polished chapter of a short novel using the structured outline, complete accepted-chapter history, and the latest loose beat sheet.

Requirements:
- Return only the chapter in Markdown, beginning with the requested chapter heading.
- Dramatize consequential scenes with specific action, sensory detail, dialogue, interiority, and cause-and-effect progression.
- Honor the established point of view, tense, character facts, setting, tone, every accepted chapter, and the beat sheet.
- Fulfill this chapter's outline goal without consuming later chapters' events.
- Keep the novel deliberately compact, but let scenes breathe; do not target or claim an exact word count.
- Do not discuss the assignment, explain choices, or include an editorial note.`;

    const beatsPrompt = `Act as a continuity editor and story planner for a short novel.

The input contains the structured outline and every accepted chapter written so far. Produce a concise loose beat sheet for the next chapter, not prose. Preserve established facts, character motivations, unresolved questions, point of view, tense, setting, and tone.

Return exactly eight numbered beats, starting with "1." and ending with "8.". Keep each beat to one or two sentences and no more than 40 words. Each beat should state the scene purpose, obstacle or meaningful action, and resulting story-state change when applicable. Leave room for the writers to discover details. Do not add an introduction, conclusion, chapter prose, editorial commentary, or a word-count target.`;

    let previousBeatSheet: string | undefined;
    const acceptedChapters: string[] = [];
    for (let chapter = 1; chapter <= FICTION_CHAPTERS; chapter++) {
        const writerA = `writer-a-${chapter}`;
        const writerB = `writer-b-${chapter}`;
        const judge = `judge-${chapter}`;

        nodes.push(
            node(
                writerA,
                'agent',
                {
                    label: `Chapter ${chapter} · Writer A`,
                    model: LONGFORM_MODEL,
                    modelRequest,
                    temperature: 0.65,
                    prompt: writerPrompt,
                    task: `Write chapter ${chapter} using a psychological-dread approach: intimate close interiority, ordinary details that become uncanny, slow-building tension, moral pressure, sensory specificity, restraint, and frightening implications. Begin with "# Chapter ${chapter}:".`,
                },
                index++
            )
        );
        nodes.push(
            node(
                writerB,
                'agent',
                {
                    label: `Chapter ${chapter} · Writer B`,
                    model: LONGFORM_MODEL,
                    modelRequest,
                    temperature: 0.75,
                    prompt: writerPrompt,
                    task: `Write chapter ${chapter} using a propulsive cinematic-suspense approach: crisp scene movement, escalating external stakes, vivid set pieces, reversals, emotional subtext, and controlled muscular prose. Begin with "# Chapter ${chapter}:".`,
                },
                index++
            )
        );
        nodes.push(
            node(
                judge,
                'agent',
                {
                    label: `Judge chapter ${chapter}`,
                    model: LONGFORM_MODEL,
                    modelRequest,
                    temperature: 0,
                    prompt: `Act as the final fiction editor in a blind chapter competition.

Compare Draft A and Draft B against the outline and selected previous chapter. Choose the single stronger draft based on plot advancement, character continuity, scene craft, prose control, pacing, emotional effect, and whether it leaves the story in the required ending state.

Your first line must be exactly "<!-- WINNER: A -->" or "<!-- WINNER: B -->". Your second line must be exactly "<!-- SCORES: A=<number 0-10> B=<number 0-10> -->". Treat candidate order and labels as meaningless; judge craft, not position. After those two metadata lines, reproduce the selected draft verbatim. Do not merge drafts, revise the winner, add commentary, explain the decision, or alter its heading.`,
                    task: `Judge the two candidates for chapter ${chapter} and return the winning draft exactly as instructed.`,
                },
                index++
            )
        );

        for (const writer of [writerA, writerB]) {
            edges.push(edge('outline', writer, 'outline'));
            for (const [historyIndex, acceptedChapter] of acceptedChapters.entries()) {
                edges.push(
                    edge(
                        acceptedChapter,
                        writer,
                        `historyChapter${historyIndex + 1}`
                    )
                );
            }
            if (previousBeatSheet) {
                edges.push(edge(previousBeatSheet, writer, 'nextChapterBeats'));
            }
        }
        edges.push(edge('outline', judge, 'outline'));
        for (const [historyIndex, acceptedChapter] of acceptedChapters.entries()) {
            edges.push(
                edge(
                    acceptedChapter,
                    judge,
                    `historyChapter${historyIndex + 1}`
                )
            );
        }
        if (previousBeatSheet) {
            edges.push(edge(previousBeatSheet, judge, 'nextChapterBeats'));
        }
        edges.push(edge(writerA, judge, 'draftA'));
        edges.push(edge(writerB, judge, 'draftB'));

        winners.push(judge);
        acceptedChapters.push(judge);

        if (chapter < FICTION_CHAPTERS) {
            const beatId = `beats-${chapter}`;
            nodes.push(
                node(
                    beatId,
                    'agent',
                    {
                        label: `Beats for chapter ${chapter + 1}`,
                        model: LONGFORM_MODEL,
                        modelRequest,
                        temperature: 0.2,
                        prompt: beatsPrompt,
                        task: `Create loose beats for chapter ${chapter + 1} from the complete accepted story history.`,
                    },
                    index++
                )
            );
            edges.push(edge('outline', beatId, 'outline'));
            for (const [historyIndex, acceptedChapter] of acceptedChapters.entries()) {
                edges.push(
                    edge(
                        acceptedChapter,
                        beatId,
                        `historyChapter${historyIndex + 1}`
                    )
                );
            }
            previousBeatSheet = beatId;
        }
    }

    nodes.push(
        node(
            'manuscript',
            'output',
            {
                label: 'Complete short novel',
                mode: 'combine',
                format: 'markdown',
                sources: winners,
                introText: '# Complete Short Novel',
            },
            index++
        )
    );
    edges.push(edge(acceptedChapters.at(-1)!, 'manuscript'));

    return {
        meta: {
            id: 'two-writer-fiction-book',
            version: '2.0.0',
            name: 'Two-Writer Short Novel',
            description:
                `Outlines a ${FICTION_CHAPTERS}-chapter short novel, commissions two competing drafts per chapter, and carries the judge's winner into the next chapter.`,
        },
        nodes,
        edges,
    };
}

export const fictionBookWorkflow = createFictionBookWorkflow();
