<script setup lang="ts">
import { ref, computed } from 'vue';
import type {
    UpstreamGroup,
    UpstreamSource,
} from '../../../composables/useUpstreamResolver';

const props = defineProps<{
    modelValue: string[];
    availableGroups: UpstreamGroup[];
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string[]): void;
}>();

// --- Data Preparation ---

const allSources = computed(() => {
    return props.availableGroups.flatMap((g) => g.sources);
});

const selectedSources = computed(() => {
    return props.modelValue
        .map((id) => allSources.value.find((s) => s.id === id))
        .filter((s): s is UpstreamSource => !!s);
});

const availableToAdd = computed(() => {
    return props.availableGroups
        .map((group) => ({
            ...group,
            sources: group.sources.filter(
                (s) => !props.modelValue.includes(s.id)
            ),
        }))
        .filter((group) => group.sources.length > 0);
});

// --- Dropdown Logic ---

const isDropdownOpen = ref(false);

function addSource(sourceId: string) {
    emit('update:modelValue', [...props.modelValue, sourceId]);
    isDropdownOpen.value = false;
}

function removeSource(sourceId: string) {
    emit(
        'update:modelValue',
        props.modelValue.filter((id) => id !== sourceId)
    );
}

// --- Drag and Drop Logic ---

const draggedIndex = ref<number | null>(null);
const dropTarget = ref<{ index: number; position: 'before' | 'after' } | null>(
    null
);

function onDragStart(event: DragEvent, index: number) {
    draggedIndex.value = index;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.dropEffect = 'move';
        // Optional: Set a custom drag image or clean up the default one
        // event.dataTransfer.setDragImage(event.target as Element, 0, 0);
    }
}

function onDragOver(event: DragEvent, index: number) {
    event.preventDefault(); // Allow dropping
    if (draggedIndex.value === null) return;

    // Don't allow dropping on itself (optional, but cleaner UI)
    if (draggedIndex.value === index) {
        dropTarget.value = null;
        return;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = event.clientY < midY ? 'before' : 'after';

    // Only update if changed to prevent reactivity thrashing
    if (
        dropTarget.value?.index !== index ||
        dropTarget.value?.position !== position
    ) {
        dropTarget.value = { index, position };
    }
}

function onDragLeave(event: DragEvent) {
    // Only clear if we are actually leaving the list item, not entering a child
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const currentTarget = event.currentTarget as HTMLElement;

    if (!currentTarget.contains(relatedTarget)) {
        // We left the item entirely.
        // However, we might be entering another item.
        // We rely on the next item's dragOver to set the new target.
        // If we leave the list entirely, we might want to clear.
        // For now, let's not aggressively clear to prevent flickering.
        // The dropTarget will be updated by the next item's dragOver.
    }
}

function onListDragLeave(event: DragEvent) {
    // Clear drop target if we leave the entire list container
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const currentTarget = event.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
        dropTarget.value = null;
    }
}

function onDrop(event: DragEvent) {
    event.preventDefault();
    if (draggedIndex.value === null || !dropTarget.value) {
        resetDrag();
        return;
    }

    const sourceItem = selectedSources.value[draggedIndex.value];
    const targetItem = selectedSources.value[dropTarget.value.index];

    if (!sourceItem || !targetItem || sourceItem.id === targetItem.id) {
        resetDrag();
        return;
    }

    const currentModelValue = [...props.modelValue];
    const fromIndex = currentModelValue.indexOf(sourceItem.id);

    // Safety check if item isn't found
    if (fromIndex === -1) {
        resetDrag();
        return;
    }

    // Remove from old position first
    const [movedId] = currentModelValue.splice(fromIndex, 1);

    // Find where the target is now (indices shift after removal)
    let newToIndex = currentModelValue.indexOf(targetItem.id);

    if (newToIndex === -1) {
        // Should not happen if targetItem is valid, but safety fallback
        // If target is gone, maybe put it back where it was?
        // For now, just aborting would lose the item from the list if we don't be careful.
        // But we are operating on a copy 'currentModelValue', so aborting is safe (no emit).
        resetDrag();
        return;
    }

    // If dropping after, increment index
    if (dropTarget.value.position === 'after') {
        newToIndex++;
    }

    currentModelValue.splice(newToIndex, 0, movedId);
    emit('update:modelValue', currentModelValue);
    resetDrag();
}

function onDragEnd() {
    resetDrag();
}

function resetDrag() {
    draggedIndex.value = null;
    dropTarget.value = null;
}
</script>

<template>
    <div class="space-y-3 source-picker">
        <div class="flex items-center justify-between">
            <label class="sources-label">Sources</label>

            <div class="relative">
                <button
                    @click="isDropdownOpen = !isDropdownOpen"
                    :disabled="disabled || availableToAdd.length === 0"
                    class="add-source-btn"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Source
                </button>

                <!-- Dropdown -->
                <div
                    v-if="isDropdownOpen"
                    class="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-60 overflow-y-auto"
                >
                    <div
                        v-if="availableToAdd.length === 0"
                        class="p-3 text-xs text-gray-500 text-center"
                    >
                        No more sources available
                    </div>
                    <div v-else class="py-1">
                        <div
                            v-for="(group, gIndex) in availableToAdd"
                            :key="gIndex"
                        >
                            <div
                                v-if="group.type === 'parallel'"
                                class="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-gray-700/50"
                            >
                                {{ group.label }}
                            </div>
                            <button
                                v-for="source in group.sources"
                                :key="source.id"
                                @click="addSource(source.id)"
                                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between group"
                            >
                                <span class="truncate">{{
                                    source.branchLabel || source.label
                                }}</span>
                                <span class="text-xs text-gray-400">{{
                                    source.type
                                }}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Backdrop -->
                <div
                    v-if="isDropdownOpen"
                    @click="isDropdownOpen = false"
                    class="fixed inset-0 z-40"
                ></div>
            </div>
        </div>

        <!-- Selected Sources List -->
        <div
            v-if="selectedSources.length > 0"
            class="space-y-2 relative"
            @dragleave="onListDragLeave"
        >
            <div
                v-for="(source, index) in selectedSources"
                :key="source.id"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover="onDragOver($event, index)"
                @dragleave="onDragLeave"
                @drop="onDrop"
                @dragend="onDragEnd"
                class="source-card group"
                :class="{
                    'is-dragging': draggedIndex === index,
                }"
            >
                <!-- Drop Indicators -->
                <div
                    v-if="
                        dropTarget?.index === index &&
                        dropTarget.position === 'before'
                    "
                    class="drop-indicator before"
                ></div>
                <div
                    v-if="
                        dropTarget?.index === index &&
                        dropTarget.position === 'after'
                    "
                    class="drop-indicator after"
                ></div>

                <!-- Drag Handle -->
                <div class="drag-handle" title="Drag to reorder">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </div>

                <div class="flex-1 min-w-0 pointer-events-none">
                    <div class="text-sm font-semibold truncate">
                        {{ source.branchLabel || source.label }}
                    </div>
                    <div
                        v-if="source.parallelParentId"
                        class="text-xs source-subtext truncate"
                    >
                        from {{ source.label }}
                    </div>
                </div>

                <button
                    @click="removeSource(source.id)"
                    class="remove-btn"
                    title="Remove source"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>

        <div v-else class="empty-state">
            No sources selected.
            <br />
            <span class="text-xs">Output will be empty.</span>
        </div>
    </div>
</template>

<style scoped>
.source-picker {
    --sp-accent: var(--or3-color-accent, #2563eb);
    --sp-surface: var(--or3-color-surface, #ffffff);
    --sp-surface-hover: var(--or3-color-surface-hover, rgba(15, 23, 42, 0.06));
    --sp-border: var(--or3-color-border, rgba(15, 23, 42, 0.12));
    --sp-text: var(--or3-color-text-primary, #0f172a);
    --sp-text-strong: var(--or3-color-text-primary, #0f172a);
    --sp-text-muted: var(--or3-color-text-secondary, #475569);
    --sp-button-bg: rgba(37, 99, 235, 0.15);
    --sp-button-border: rgba(37, 99, 235, 0.4);
    --sp-button-text: #1e40af;
}

@media (prefers-color-scheme: dark) {
    .source-picker {
        --sp-surface: var(--or3-color-surface, #0b1220);
        --sp-surface-hover: var(
            --or3-color-surface-hover,
            rgba(255, 255, 255, 0.08)
        );
        --sp-border: var(--or3-color-border, rgba(255, 255, 255, 0.16));
        --sp-text: var(--or3-color-text-primary, #e2e8f0);
        --sp-text-strong: var(--or3-color-text-primary, #f8fafc);
        --sp-text-muted: var(--or3-color-text-secondary, #cbd5e1);
        --sp-button-bg: rgba(59, 130, 246, 0.25);
        --sp-button-border: rgba(59, 130, 246, 0.6);
        --sp-button-text: #dbeafe;
    }
}

.add-source-btn {
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--sp-button-bg);
    color: var(--sp-button-text);
    border: 1px solid var(--sp-button-border);
    transition: all 0.15s ease;
}

.add-source-btn:hover:not(:disabled) {
    background: rgba(37, 99, 235, 0.18);
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2);
}

.add-source-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.source-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--sp-surface);
    border: 1px solid var(--sp-border);
    border-radius: 10px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease,
        opacity 0.15s ease;
    color: var(--sp-text);
    user-select: none;
}

.source-card:hover {
    border-color: rgba(37, 99, 235, 0.45);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.source-card.is-dragging {
    opacity: 0.3;
    border-style: dashed;
    background: transparent;
}

/* Drop Indicator */
.drop-indicator {
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--sp-accent);
    border-radius: 2px;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 0 8px rgba(37, 99, 235, 0.5);
}

.drop-indicator.before {
    top: -5px;
}

.drop-indicator.after {
    bottom: -5px;
}

/* Add little circles to the ends of the indicator for extra polish */
.drop-indicator::before,
.drop-indicator::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 5px;
    height: 5px;
    background: var(--sp-accent);
    border-radius: 50%;
    transform: translateY(-50%);
}

.drop-indicator::before {
    left: -2px;
}

.drop-indicator::after {
    right: -2px;
}

.drag-handle {
    color: var(--sp-text-muted);
    cursor: grab;
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s ease;
}

.drag-handle:hover {
    color: var(--sp-accent);
    background: var(--sp-surface-hover);
}

.drag-handle:active {
    cursor: grabbing;
}

.source-subtext {
    color: var(--sp-text-muted);
}

.remove-btn {
    color: var(--sp-text-muted);
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s ease;
}

.remove-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
}

.empty-state {
    padding: 16px;
    border: 2px dashed var(--sp-border);
    border-radius: 10px;
    text-align: center;
    font-size: 14px;
    color: var(--sp-text-muted);
    background: rgba(255, 255, 255, 0.02);
}

.sources-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--sp-text-strong);
}
</style>
