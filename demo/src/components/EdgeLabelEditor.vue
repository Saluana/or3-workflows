<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Tag, Trash2 } from 'lucide-vue-next'
import type { Edge } from '@vue-flow/core'

const props = defineProps<{
  edge: Edge | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', edgeId: string, label: string): void
  (e: 'delete', edgeId: string): void
}>()

const localLabel = ref('')

watch(() => props.edge, (edge) => {
  if (edge) {
    localLabel.value = (edge.label as string) || ''
  }
}, { immediate: true })

function saveLabel() {
  if (!props.edge) return
  emit('update', props.edge.id, localLabel.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    saveLabel()
    emit('close')
  } else if (event.key === 'Escape') {
    emit('close')
  }
}

function handleDelete() {
  if (!props.edge) return
  if (confirm('Delete this connection?')) {
    emit('delete', props.edge.id)
  }
}
</script>

<template>
  <div v-if="edge" class="edge-editor" role="dialog" aria-label="Edit edge label">
    <div class="editor-header">
      <Tag :size="16" />
      <span>Edge Label</span>
      <button 
        class="btn btn-ghost close-btn" 
        @click="emit('close')"
        aria-label="Close editor"
      >
        <X :size="16" />
      </button>
    </div>
    <div class="editor-content">
      <input
        v-model="localLabel"
        type="text"
        class="label-input"
        placeholder="Enter edge label (e.g., 'Technical', 'Sales')"
        @input="saveLabel"
        @keydown="handleKeydown"
        autofocus
      />
      <p class="hint">
        This label is shown on the connection line and helps the router make decisions.
      </p>
      <button 
        class="btn btn-danger delete-btn"
        @click="handleDelete"
        aria-label="Delete connection"
      >
        <Trash2 :size="14" />
        Delete Connection
      </button>
    </div>
  </div>
</template>

<style scoped>
.edge-editor {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  min-width: 300px;
  box-shadow: var(--shadow-xl);
  z-index: 100;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  color: var(--color-text-primary);
  font-weight: 600;
}

.editor-header .close-btn {
  margin-left: auto;
}

.editor-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.label-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 14px;
}

.label-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-muted);
}

.hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: 1px solid var(--color-error);
  color: var(--color-error);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: var(--color-error);
  color: white;
}
</style>
