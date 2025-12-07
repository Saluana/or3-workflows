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

// Flatten available sources for easier lookup
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

// Simple drag and drop implementation
const draggedIndex = ref<number | null>(null);

function onDragStart(event: DragEvent, index: number) {
    draggedIndex.value = index;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.dropEffect = 'move';
    }
}

function onDragOver(event: DragEvent) {
    event.preventDefault(); // Necessary to allow dropping
}

function onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (draggedIndex.value === null) return;

    const fromIndex = draggedIndex.value;
    const toIndex = dropIndex;

    if (fromIndex === toIndex) return;

    const newSources = [...props.modelValue];
    const [movedItem] = newSources.splice(fromIndex, 1);
    newSources.splice(toIndex, 0, movedItem);

    emit('update:modelValue', newSources);
    draggedIndex.value = null;
}
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300"
                >Sources</label
            >

            <div class="relative">
                <button
                    @click="isDropdownOpen = !isDropdownOpen"
                    :disabled="disabled || availableToAdd.length === 0"
                    class="text-xs flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        <div v-if="selectedSources.length > 0" class="space-y-2">
            <div
                v-for="(source, index) in selectedSources"
                :key="source.id"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover="onDragOver"
                @drop="onDrop($event, index)"
                class="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md group cursor-move hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                :class="{ 'opacity-50': draggedIndex === index }"
            >
                <!-- Drag Handle -->
                <div class="text-gray-400 cursor-move">
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

                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">
                        {{ source.branchLabel || source.label }}
                    </div>
                    <div
                        v-if="source.parallelParentId"
                        class="text-xs text-gray-500 truncate"
                    >
                        from {{ source.label }}
                    </div>
                </div>

                <button
                    @click="removeSource(source.id)"
                    class="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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

        <div
            v-else
            class="p-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center text-sm text-gray-500"
        >
            No sources selected.
            <br />
            <span class="text-xs">Output will be empty.</span>
        </div>
    </div>
</template>
