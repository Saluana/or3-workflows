<script setup lang="ts">
import { WorkflowEditor } from '@or3/workflow-core';

defineProps<{
    editor?: WorkflowEditor;
}>();

const nodeTypes = [
    {
        type: 'agent',
        label: 'Agent Node',
        description: 'Connect to any LLM model to process and respond to messages',
        colorVar: '--or3-color-accent',
        defaultData: {
            label: 'New Agent',
            model: 'openai/gpt-4o-mini',
            prompt: '',
        },
    },
    {
        type: 'router',
        label: 'Router Node',
        description: 'Intelligently route messages to different paths based on intent',
        colorVar: '--or3-color-warning',
        defaultData: {
            label: 'Router',
            // Routes are derived from connected edges
        },
    },
    {
        type: 'parallel',
        label: 'Parallel Node',
        description: 'Execute multiple branches simultaneously and combine results',
        colorVar: '--or3-color-info',
        defaultData: {
            label: 'Parallel',
            model: 'openai/gpt-4o-mini',
            prompt: 'Combine the outputs into a coherent response.',
        },
    },
    {
        type: 'tool',
        label: 'Tool Node',
        description: 'Call external APIs, functions, or custom tools',
        colorVar: '--or3-color-secondary',
        defaultData: {
            label: 'Tool',
            toolId: '',
        },
    },
    {
        type: 'memory',
        label: 'Memory Node',
        description: 'Store and retrieve long-term context across conversations',
        colorVar: '--or3-color-info',
        defaultData: {
            label: 'Memory',
            operation: 'query',
            limit: 5,
            fallback: 'No memories found.',
        },
    },
    {
        type: 'whileLoop',
        label: 'While Loop',
        description: 'Repeat a sequence until a condition is met',
        colorVar: '--or3-color-info',
        defaultData: {
            label: 'While Loop',
            conditionPrompt:
                'Should we continue iterating? Respond with "continue" or "done".',
            maxIterations: 10,
            onMaxIterations: 'warning',
        },
    },
    {
        type: 'subflow',
        label: 'Subflow',
        description: 'Embed and reuse another workflow as a single node',
        colorVar: '--or3-color-secondary',
        defaultData: {
            label: 'Subflow',
            subflowId: '',
            inputMappings: {},
            shareSession: true,
        },
    },
    {
        type: 'output',
        label: 'Output Node',
        description: 'Define the final output format and structure',
        colorVar: '--or3-color-success',
        defaultData: {
            label: 'Output',
            format: 'text',
            template: '',
            includeMetadata: false,
        },
    },
];

// Note: Start node is intentionally omitted as it should be added programmatically
// when creating a new workflow. Only one start node should exist per workflow.

const onDragStart = (
    event: DragEvent,
    nodeType: string,
    defaultData: Record<string, unknown>
) => {
    if (event.dataTransfer) {
        event.dataTransfer.setData('application/vueflow', nodeType);
        event.dataTransfer.setData(
            'application/json',
            JSON.stringify(defaultData)
        );
        event.dataTransfer.effectAllowed = 'move';
    }
};
</script>

<template>
    <div class="node-palette">
        <div class="palette-header">
            <svg
                class="plus-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Nodes</span>
        </div>

        <div class="palette-nodes">
            <div
                v-for="node in nodeTypes"
                :key="node.type"
                class="palette-node"
                draggable="true"
                @dragstart="onDragStart($event, node.type, node.defaultData)"
            >
                <div
                    class="node-icon"
                    :style="{
                        '--node-color': `var(${node.colorVar}, #8b5cf6)`,
                    }"
                >
                    <svg
                        v-if="node.type === 'agent'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                        <circle cx="12" cy="5" r="2"></circle>
                        <path d="M12 7v4"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'router'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <line x1="6" y1="3" x2="6" y2="15"></line>
                        <circle cx="18" cy="6" r="3"></circle>
                        <circle cx="6" cy="18" r="3"></circle>
                        <path d="M18 9a9 9 0 0 1-9 9"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'parallel'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <circle cx="18" cy="18" r="3"></circle>
                        <circle cx="6" cy="6" r="3"></circle>
                        <path d="M6 21V9a9 9 0 0 0 9 9"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'tool'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'memory'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="4" y="4" width="16" height="16" rx="3"></rect>
                        <path d="M8 9h8M8 12h8M8 15h6"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'whileLoop'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M5 12h4"></path>
                        <path d="M15 12h4"></path>
                        <path d="M9 12c0-4 6-4 6 0s-6 4-6 0Z"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'subflow'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                        <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                        <rect x="8.5" y="14" width="7" height="7" rx="1"></rect>
                        <path d="M6.5 10v2a2 2 0 002 2h1"></path>
                        <path d="M17.5 10v2a2 2 0 01-2 2h-1"></path>
                    </svg>
                    <svg
                        v-else-if="node.type === 'output'"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
                        ></path>
                        <line x1="4" y1="22" x2="4" y2="15"></line>
                    </svg>
                </div>
                <div class="node-info">
                    <span class="node-name">{{ node.label }}</span>
                    <span class="node-desc">{{ node.description }}</span>
                </div>
                <svg class="drag-handle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="5" r="1"></circle>
                    <circle cx="9" cy="12" r="1"></circle>
                    <circle cx="9" cy="19" r="1"></circle>
                    <circle cx="15" cy="5" r="1"></circle>
                    <circle cx="15" cy="12" r="1"></circle>
                    <circle cx="15" cy="19" r="1"></circle>
                </svg>
            </div>
        </div>

        <div class="palette-hint">
            <svg class="hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <p>Drag nodes onto the canvas to build your workflow. Connect nodes by dragging from output to input handles.</p>
        </div>
    </div>
</template>

<style scoped>
.node-palette {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 12px);
}

.palette-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 var(--or3-spacing-xs, 4px);
}

.plus-icon {
    width: 14px;
    height: 14px;
    color: var(--or3-color-accent, #8b5cf6);
}

.palette-nodes {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.palette-node {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 12px);
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 8px);
    cursor: grab;
    transition: all var(--or3-transition-fast, 120ms);
}

.palette-node:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.12));
    background: var(--or3-color-surface-hover, rgba(31, 31, 38, 0.95));
    transform: translateX(2px);
}

.palette-node:hover .drag-handle {
    opacity: 0.5;
}

.palette-node:active {
    cursor: grabbing;
    transform: scale(0.98);
}

.node-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--or3-radius-sm, 6px);
    flex-shrink: 0;
    background: color-mix(in srgb, var(--node-color) 12%, transparent);
    color: var(--node-color);
    transition: all var(--or3-transition-fast, 120ms);
}

.palette-node:hover .node-icon {
    background: color-mix(in srgb, var(--node-color) 20%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--node-color) 25%, transparent);
}

.node-icon svg {
    width: 18px;
    height: 18px;
}

.node-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}

.node-name {
    font-weight: var(--or3-font-medium, 500);
    font-size: var(--or3-text-sm, 12px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.node-desc {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    line-height: var(--or3-leading-normal, 1.5);
}

.drag-handle {
    width: 14px;
    height: 14px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--or3-transition-fast, 120ms);
}

.palette-hint {
    display: flex;
    align-items: flex-start;
    gap: var(--or3-spacing-sm, 8px);
    padding: var(--or3-spacing-md, 12px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border-subtle, rgba(255, 255, 255, 0.03));
    border-radius: var(--or3-radius-md, 8px);
    margin-top: var(--or3-spacing-sm, 8px);
}

.hint-icon {
    width: 14px;
    height: 14px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
    margin-top: 1px;
}

.palette-hint p {
    margin: 0;
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    line-height: var(--or3-leading-relaxed, 1.65);
}
</style>
