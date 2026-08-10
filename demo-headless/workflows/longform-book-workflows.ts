import type {
    WorkflowData,
    WorkflowEdge,
    WorkflowNode,
} from 'or3-workflow-core';

export const LONGFORM_MODEL = '~deepseek/deepseek-v4-flash-latest';
export const LONGFORM_CHAPTERS = 4;

type BookWorkflowOptions = {
    researched: boolean;
};

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
    sourceHandle?: string,
    inputKey?: string
): WorkflowEdge => ({
    id: `${source}-${sourceHandle ?? 'output'}-${target}${inputKey ? `-${inputKey}` : ''}`,
    source,
    target,
    sourceHandle,
    ...(inputKey
        ? {
              data: {
                  inputMapping: { mode: 'json', key: inputKey },
              },
          }
        : {}),
});

const utilityModelRequest = {
    version: 1 as const,
    models: [LONGFORM_MODEL] as [string],
    generation: { reasoning: { effort: 'none' as const } },
};

const outlineSchema = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        audience: { type: 'string' },
        thesis: { type: 'string' },
        chapters: {
            type: 'array',
            minItems: LONGFORM_CHAPTERS,
            maxItems: LONGFORM_CHAPTERS,
            items: {
                type: 'object',
                properties: {
                    number: {
                        type: 'integer',
                        minimum: 1,
                        maximum: LONGFORM_CHAPTERS,
                    },
                    title: { type: 'string' },
                    purpose: { type: 'string' },
                    keyPoints: {
                        type: 'array',
                        minItems: 4,
                        items: { type: 'string' },
                    },
                },
                required: ['number', 'title', 'purpose', 'keyPoints'],
                additionalProperties: false,
            },
        },
    },
    required: ['title', 'subtitle', 'audience', 'thesis', 'chapters'],
    additionalProperties: false,
};

// A deliberately large, explicit long-form workflow. The chapter stages are
// unrolled so every accepted chapter remains addressable and observable.
export function createLongformBookWorkflow(
    options: BookWorkflowOptions
): WorkflowData {
    const { researched } = options;
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    let index = 0;

    nodes.push(node('start', 'start', { label: 'Book idea' }, index++));
    nodes.push(
        node(
            'outline',
            'agent',
            {
                label: 'Book architect',
                model: LONGFORM_MODEL,
                modelRequest: utilityModelRequest,
                temperature: 0.2,
                prompt: `Design a rigorous nonfiction book from the user's idea.

Return exactly ${LONGFORM_CHAPTERS} logically progressive chapters. Each chapter needs a distinct purpose and at least four concrete key points. Avoid filler, invented quotations, invented studies, and duplicated chapter scope. The outline must form a complete argument for the stated audience.`,
                structuredOutput: {
                    name: 'nonfiction_book_outline',
                    description:
                        `A ${LONGFORM_CHAPTERS}-chapter plan for a complete short nonfiction book.`,
                    strict: true,
                    schema: outlineSchema,
                },
            },
            index++
        )
    );
    edges.push(edge('start', 'outline'));

    let previousChapter: string | undefined;
    const revisedSources: string[] = [];

    for (let chapter = 1; chapter <= LONGFORM_CHAPTERS; chapter++) {
        if (researched) {
            const researchId = `research-${chapter}`;
            nodes.push(
                node(
                    researchId,
                    'agent',
                    {
                        label: `Research chapter ${chapter}`,
                        model: LONGFORM_MODEL,
                        temperature: 0.1,
                        prompt: `Research the requested nonfiction chapter using live web search and webpage fetching.

Requirements:
- Search broadly, then open and read at least four relevant reputable pages.
- Prefer primary sources, government, universities, standards bodies, and established research organizations.
- Produce a factual dossier organized around the chapter's key points.
- Include full source URLs next to every source and distinguish evidence from inference.
- Never invent a source, statistic, quotation, author, or publication date.`,
                        task: `Research chapter ${chapter} from the structured outline and return its factual dossier.`,
                        modelRequest: {
                            version: 1,
                            models: [LONGFORM_MODEL],
                            routing: { requireParameters: true },
                            requiredCapabilities: ['tools'],
                            serverTools: [
                                {
                                    name: 'openrouter:web_search',
                                    transport: 'either',
                                },
                                {
                                    name: 'openrouter:web_fetch',
                                    transport: 'either',
                                },
                            ],
                        },
                        toolChoice: 'required',
                    },
                    index++
                )
            );
            edges.push(edge('outline', researchId, undefined, 'outline'));
            if (previousChapter) {
                edges.push(
                    edge(
                        previousChapter,
                        researchId,
                        undefined,
                        'previousChapter'
                    )
                );
            }
        }

        const writerId = `writer-${chapter}`;
        const proofId = `proofreader-${chapter}`;
        const reviseId = `reviser-${chapter}`;
        nodes.push(
            node(
                writerId,
                'agent',
                {
                    label: `Write chapter ${chapter}`,
                    model: LONGFORM_MODEL,
                    modelRequest: utilityModelRequest,
                    temperature: 0.45,
                    prompt: `Write the requested chapter of the nonfiction book from the structured outline and provided context.

Requirements:
- Return only the chapter in polished Markdown with the requested chapter number in its heading.
- Develop the chapter fully with substantive sections, examples, transitions, and a useful closing synthesis. Prioritize completeness and clarity over a guessed word count.
- Follow only the requested chapter's assigned purpose; do not steal later chapters' material.
- Maintain continuity with earlier revised chapters without repeating them.
- Be factual and explicit about uncertainty. Never invent quotations, studies, statistics, or personal anecdotes.
${
    researched
        ? '- Use the immediately preceding research dossier. Preserve its full URLs as inline Markdown citations and include a Sources section.'
        : '- This version has no live research. Avoid fragile numerical claims and attribute only facts you can state responsibly.'
}`,
                    task: `Write chapter ${chapter}. Begin with "# Chapter ${chapter}:".`,
                },
                index++
            )
        );
        nodes.push(
            node(
                proofId,
                'agent',
                {
                    label: `Proofread chapter ${chapter}`,
                    model: LONGFORM_MODEL,
                    modelRequest: utilityModelRequest,
                    temperature: 0.15,
                    prompt: `Act as a demanding nonfiction developmental and copy editor for the requested chapter.

Return an editorial memo, not a rewritten chapter. Check structure, clarity, repetition, unsupported certainty, internal contradictions, audience fit, grammar, and whether the draft fulfills the outline. Identify concrete changes in priority order.
${
    researched
        ? 'Also check that important factual claims have relevant citations, that URLs appear plausible, and that the Sources section is preserved.'
        : 'Flag claims that require sourcing or more cautious wording.'
}`,
                    task: `Proofread chapter ${chapter}.`,
                },
                index++
            )
        );
        nodes.push(
            node(
                reviseId,
                'agent',
                {
                    label: `Revise chapter ${chapter}`,
                    model: LONGFORM_MODEL,
                    modelRequest: utilityModelRequest,
                    temperature: 0.3,
                    prompt: `Rewrite the requested chapter using the draft and editorial memo in the provided input.

Return only the final chapter in Markdown with the requested chapter number in its heading. Preserve the depth needed to fulfill the outline and apply substantive corrections rather than discussing them. Remove editor commentary, avoid duplicated material, preserve continuity, and do not fabricate evidence.
${
    researched
        ? 'Preserve and improve inline Markdown citations and finish with a Sources section containing the full URLs actually used.'
        : 'Use careful, defensible language for claims that were flagged as needing sources.'
}`,
                    task: `Revise chapter ${chapter}. Begin with "# Chapter ${chapter}:".`,
                },
                index++
            )
        );

        edges.push(edge('outline', writerId, undefined, 'outline'));
        if (researched) {
            edges.push(
                edge(
                    `research-${chapter}`,
                    writerId,
                    undefined,
                    'research'
                )
            );
        }
        if (previousChapter) {
            edges.push(
                edge(
                    previousChapter,
                    writerId,
                    undefined,
                    'previousChapter'
                )
            );
        }
        edges.push(edge('outline', proofId, undefined, 'outline'));
        edges.push(edge(writerId, proofId, undefined, 'draft'));
        edges.push(edge('outline', reviseId, undefined, 'outline'));
        edges.push(edge(writerId, reviseId, undefined, 'draft'));
        edges.push(edge(proofId, reviseId, undefined, 'editorialMemo'));
        if (researched) {
            edges.push(
                edge(
                    `research-${chapter}`,
                    reviseId,
                    undefined,
                    'research'
                )
            );
        }
        previousChapter = reviseId;
        revisedSources.push(reviseId);
    }

    nodes.push(
        node(
            'manuscript',
            'output',
            {
                label: 'Complete manuscript',
                mode: 'combine',
                format: 'markdown',
                sources: revisedSources,
                introText: '# Complete Nonfiction Manuscript',
            },
            index++
        )
    );
    edges.push(edge(previousChapter!, 'manuscript'));

    return {
        meta: {
            id: researched
                ? 'researched-nonfiction-book'
                : 'nonfiction-book',
            version: '2.0.0',
            name: researched
                ? 'Researched Nonfiction Book Writer'
                : 'Nonfiction Book Writer',
            description: researched
                ? `Plans, researches, drafts, edits, and assembles a ${LONGFORM_CHAPTERS}-chapter sourced nonfiction manuscript.`
                : `Plans, drafts, edits, and assembles a ${LONGFORM_CHAPTERS}-chapter nonfiction manuscript.`,
        },
        nodes,
        edges,
    };
}

export const nonfictionBookWorkflow = createLongformBookWorkflow({
    researched: false,
});

export const researchedNonfictionBookWorkflow = createLongformBookWorkflow({
    researched: true,
});
