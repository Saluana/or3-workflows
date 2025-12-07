import {
    computed,
    Ref,
    ComputedRef,
    unref,
    ref,
    watch,
    onScopeDispose,
} from 'vue';
import { WorkflowEditor, OutputNodeData } from '@or3/workflow-core';
import { useUpstreamResolver } from './useUpstreamResolver';
import { useExecutionCache } from './useExecutionCache';

export interface PreviewData {
    assembledPreview: string;
    isComplete: boolean;
    modeHint?: string;
}

export function useOutputPreview(
    editor: Ref<WorkflowEditor | null> | ComputedRef<WorkflowEditor | null>,
    nodeData: Ref<OutputNodeData> | ComputedRef<OutputNodeData>,
    nodeId: Ref<string> | ComputedRef<string> | string
) {
    const { getOutput } = useExecutionCache();
    const upstreamGroups = useUpstreamResolver(editor, nodeId);

    const previewData = computed<PreviewData>(() => {
        const data = unref(nodeData);
        const groups = unref(upstreamGroups);

        // Flatten sources
        const allSources = groups.flatMap((g) => g.sources);

        // Determine which sources to use
        let sourcesToUse = allSources;
        if (data.sources && data.sources.length > 0) {
            sourcesToUse = data.sources
                .map((id) => allSources.find((s) => s.id === id))
                .filter((s): s is typeof s & object => !!s);
        }

        // Check completeness
        const sourceContents = new Map<string, string | null>();
        let isComplete = true;

        for (const source of sourcesToUse) {
            const output = getOutput(source.id);
            sourceContents.set(source.id, output || null);
            if (!output) isComplete = false;
        }

        let assembledPreview = '';
        let modeHint = '';

        if (data.mode === 'synthesis') {
            modeHint = 'AI will synthesize these inputs into a final document';

            const inputs = sourcesToUse.map((source) => {
                const content = sourceContents.get(source.id);
                const label = source.branchLabel || source.label;
                const preview = content
                    ? content.length > 100
                        ? content.slice(0, 100) + '...'
                        : content
                    : '(Waiting for output...)';

                return `• ${label}: ${preview}`;
            });

            if (inputs.length > 0) {
                assembledPreview = 'Inputs to AI:\n\n' + inputs.join('\n');
            } else {
                assembledPreview = '(No inputs selected)';
            }
        } else {
            // Combine mode
            const parts: string[] = [];

            if (data.introText) parts.push(data.introText);

            if (sourcesToUse.length > 0) {
                for (const source of sourcesToUse) {
                    const content = sourceContents.get(source.id);
                    if (content) {
                        parts.push(content);
                    } else {
                        parts.push(
                            `[Output from ${
                                source.branchLabel || source.label
                            } will appear here]`
                        );
                    }
                }
            } else {
                parts.push('[No sources selected]');
            }

            if (data.outroText) parts.push(data.outroText);

            assembledPreview = parts.join('\n\n');
        }

        return {
            assembledPreview,
            isComplete,
            modeHint,
        };
    });

    const debouncedPreview = ref<PreviewData>(previewData.value);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    watch(
        previewData,
        (next) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debouncedPreview.value = next;
            }, 50);
        },
        { immediate: true }
    );

    onScopeDispose(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
    });

    return computed(() => debouncedPreview.value);
}
