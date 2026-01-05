<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { NodeData, WorkflowEditor } from '@or3/workflow-core';
import IconAgent from '../icons/IconAgent.vue';
import IconRouter from '../icons/IconRouter.vue';
import IconParallel from '../icons/IconParallel.vue';
import IconWhileLoop from '../icons/IconWhileLoop.vue';
import IconSubflow from '../icons/IconSubflow.vue';
import IconOutput from '../icons/IconOutput.vue';
import IconPlus from '../icons/IconPlus.vue';
import IconDragHandle from '../icons/IconDragHandle.vue';
import IconInfoCircle from '../icons/IconInfoCircle.vue';

const props = defineProps<{
    editor?: WorkflowEditor;
    canvasId?: string;
}>();

const emit = defineEmits<{
    (e: 'quick-add'): void;
}>();

const isMobile = ref(false);

const syncIsMobile = () => {
    isMobile.value = window.innerWidth <= 768;
};

onMounted(() => {
    syncIsMobile();
    window.addEventListener('resize', syncIsMobile);
});

onUnmounted(() => {
    window.removeEventListener('resize', syncIsMobile);
});

const nodeTypes = [
    {
        type: 'agent',
        label: 'AI Agent',
        description:
            'Connect to an AI model to process and respond to messages',
        colorVar: '--or3-color-accent',
        icon: IconAgent,
        defaultData: {
            label: 'New Agent',
            model: 'z-ai/glm-4.6:exacto',
            prompt: '',
        },
    },
    {
        type: 'router',
        label: 'Decision',
        description:
            'Route messages to different paths based on intent',
        colorVar: '--or3-color-warning',
        icon: IconRouter,
        defaultData: {
            label: 'Decision',
            // Routes are derived from connected edges
        },
    },
    {
        type: 'parallel',
        label: 'Parallel',
        description:
            'Run multiple tasks at once and combine results',
        colorVar: '--or3-color-info',
        icon: IconParallel,
        defaultData: {
            label: 'Parallel',
            model: 'z-ai/glm-4.6:exacto',
            prompt: 'Combine the outputs into a coherent response.',
            branches: [],
        },
    },
    {
        type: 'whileLoop',
        label: 'Loop',
        description: 'Repeat a sequence until a condition is met',
        colorVar: '--or3-color-info',
        icon: IconWhileLoop,
        defaultData: {
            label: 'Loop',
            conditionPrompt:
                'Should we continue iterating? Respond with "continue" or "done".',
            maxIterations: 10,
            onMaxIterations: 'warning',
        },
    },
    {
        type: 'subflow',
        label: 'Sub-workflow',
        description: 'Embed another workflow as a single node',
        colorVar: '--or3-color-secondary',
        icon: IconSubflow,
        defaultData: {
            label: 'Sub-workflow',
            subflowId: '',
            inputMappings: {},
            shareSession: true,
        },
    },
    {
        type: 'output',
        label: 'Output',
        description: 'Define the final output format',
        colorVar: '--or3-color-success',
        icon: IconOutput,
        defaultData: {
            label: 'Output',
            format: 'text',
            template: '',
            includeMetadata: false,
        },
    },
];

const getCanvasElement = () => {
    const selector = props.canvasId
        ? `[data-workflow-canvas="${props.canvasId}"] .vue-flow`
        : '.vue-flow';
    return document.querySelector(selector) as HTMLElement | null;
};

// Note: Start node is intentionally omitted as it should be added programmatically
// when creating a new workflow. Only one start node should exist per workflow.

const onDragStart = (
    event: DragEvent,
    nodeType: string,
    defaultData: NodeData
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

// Touch event handling for mobile devices
let touchData: {
    nodeType: string;
    defaultData: NodeData;
} | null = null;
let dropFiredFromTouch = false;

const onTouchStart = (
    event: TouchEvent,
    nodeType: string,
    defaultData: NodeData
) => {
    touchData = { nodeType, defaultData };
    const target = event.currentTarget as HTMLElement;
    target.classList.add('dragging-touch');
};

const onTouchEnd = (event: TouchEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('dragging-touch');
    
    if (!touchData) return;
    
    const touch = event.changedTouches[0];
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Check if dropped on the canvas
    const canvas = getCanvasElement();
    if (canvas && (canvas === dropTarget || canvas.contains(dropTarget))) {
        // Create a custom event to pass to the canvas
        const customEvent = new CustomEvent('mobileNodeDrop', {
            detail: {
                nodeType: touchData.nodeType,
                defaultData: touchData.defaultData,
                x: touch.clientX,
                y: touch.clientY,
            },
        });
        canvas.dispatchEvent(customEvent);

        dropFiredFromTouch = true;
        // Prevent the synthetic click after touchend from double-adding
        setTimeout(() => {
            dropFiredFromTouch = false;
        }, 0);
    }
    
    touchData = null;
};

const dropNodeOnCanvas = (
    nodeType: string,
    defaultData: NodeData
) => {
    const canvas = getCanvasElement();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const customEvent = new CustomEvent('mobileNodeDrop', {
        detail: {
            nodeType,
            defaultData,
            x: centerX,
            y: centerY,
        },
    });

    canvas.dispatchEvent(customEvent);
};

const handleNodeTap = (
    event: MouseEvent,
    nodeType: string,
    defaultData: NodeData
) => {
    if (dropFiredFromTouch) {
        dropFiredFromTouch = false;
        return;
    }

    if (!isMobile.value) return;
    event.preventDefault();
    dropNodeOnCanvas(nodeType, defaultData);
    emit('quick-add');
};
</script>

<template>
    <div class="node-palette">
        <div class="palette-header">
            <IconPlus class="plus-icon" />
            <span>Add Nodes</span>
        </div>

        <div class="palette-nodes">
            <div
                v-for="node in nodeTypes"
                :key="node.type"
                class="palette-node"
                draggable="true"
                @dragstart="onDragStart($event, node.type, node.defaultData)"
                @touchstart="onTouchStart($event, node.type, node.defaultData)"
                @touchend="onTouchEnd($event)"
                @click="handleNodeTap($event, node.type, node.defaultData)"
            >
                <div
                    class="node-icon"
                    :style="{
                        '--node-color': `var(${node.colorVar}, #8b5cf6)`,
                    }"
                >
                    <component :is="node.icon" />
                </div>
                <div class="node-info">
                    <span class="node-name">{{ node.label }}</span>
                    <span class="node-desc">{{ node.description }}</span>
                </div>
                <IconDragHandle class="drag-handle" />
            </div>
        </div>

        <div class="palette-hint">
            <IconInfoCircle class="hint-icon" />
            <p>
                Drag nodes onto the canvas to build your workflow. Connect nodes
                by dragging from output to input handles.
            </p>
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

/* Touch dragging state for mobile */
.palette-node.dragging-touch {
    opacity: 0.7;
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
    border-color: var(--or3-color-accent, #8b5cf6);
}

/* Mobile-specific touch improvements */
@media (max-width: 768px) {
    .palette-nodes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--or3-spacing-sm, 8px);
    }

    .palette-node {
        padding: var(--or3-spacing-md, 12px);
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        min-height: 64px;
    }
    
    .node-icon {
        width: 40px;
        height: 40px;
    }
    
    .node-icon svg {
        width: 20px;
        height: 20px;
    }
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
    background: color-mix(in srgb, var(--node-color) 16%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--node-color) 15%, transparent);
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
    width: 18px;
    height: 18px;
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
