<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { WorkflowEditor, WorkflowNode } from '@or3/workflow-core';

const props = defineProps<{
  editor: WorkflowEditor;
}>();

const emit = defineEmits<{
  (e: 'delete', nodeId: string): void;
  (e: 'close'): void;
}>();

const selectedNode = ref<WorkflowNode | null>(null);

// Available models
const availableModels = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'Meta' },
];

// Update selection from editor
const updateSelection = () => {
  const selected = props.editor.getSelected().nodes;
  if (selected.length === 1) {
    selectedNode.value = props.editor.getNodes().find(n => n.id === selected[0]) || null;
  } else {
    selectedNode.value = null;
  }
};

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  updateSelection();
  unsubscribe = props.editor.on('selectionUpdate', updateSelection);
});

onUnmounted(() => {
  unsubscribe?.();
});

// Computed helpers
const isAgentNode = computed(() => selectedNode.value?.type === 'agent');
const isRouterNode = computed(() => selectedNode.value?.type === 'router');
const isParallelNode = computed(() => selectedNode.value?.type === 'parallel');
const isStartNode = computed(() => selectedNode.value?.type === 'start');
const canDelete = computed(() => selectedNode.value && selectedNode.value.type !== 'start');

const nodeData = computed(() => selectedNode.value?.data as any || {});

// Update handlers with debounce
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedUpdate = (field: string, value: unknown) => {
  if (!selectedNode.value) return;
  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    props.editor.commands.updateNodeData(selectedNode.value!.id, { [field]: value });
  }, 200);
};

const updateLabel = (event: Event) => {
  debouncedUpdate('label', (event.target as HTMLInputElement).value);
};

const updateModel = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  props.editor.commands.updateNodeData(selectedNode.value!.id, { model: value });
};

const updatePrompt = (event: Event) => {
  debouncedUpdate('prompt', (event.target as HTMLTextAreaElement).value);
};

const handleDelete = () => {
  if (!selectedNode.value || !canDelete.value) return;
  if (confirm(`Delete "${nodeData.value.label}"?`)) {
    props.editor.commands.deleteNode(selectedNode.value.id);
    emit('delete', selectedNode.value.id);
  }
};
</script>

<template>
  <div class="node-inspector" v-if="selectedNode">
    <!-- Header -->
    <div class="inspector-header">
      <div class="header-icon" :class="selectedNode.type">
        <svg v-if="isAgentNode" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="10" rx="2"></rect>
          <circle cx="12" cy="5" r="2"></circle>
          <path d="M12 7v4"></path>
        </svg>
        <svg v-else-if="isRouterNode" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
        <svg v-else-if="isParallelNode" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <path d="M6 21V9a9 9 0 0 0 9 9"></path>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </div>
      <input 
        class="label-input"
        :value="nodeData.label" 
        @input="updateLabel"
        placeholder="Node name"
      />
      <button 
        v-if="canDelete"
        class="delete-btn"
        @click="handleDelete"
        title="Delete node"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
    
    <!-- Agent fields -->
    <div v-if="isAgentNode" class="inspector-content">
      <div class="field-group">
        <label>Model</label>
        <select :value="nodeData.model || 'openai/gpt-4o-mini'" @change="updateModel">
          <option v-for="m in availableModels" :key="m.id" :value="m.id">
            {{ m.name }} ({{ m.provider }})
          </option>
        </select>
      </div>

      <div class="field-group">
        <label>System Prompt</label>
        <textarea 
          :value="nodeData.prompt || ''" 
          @input="updatePrompt" 
          rows="6"
          placeholder="Enter the system prompt for this agent..."
        ></textarea>
      </div>
    </div>
    
    <!-- Router fields -->
    <div v-else-if="isRouterNode" class="inspector-content">
      <div class="field-group">
        <label>Routing Instructions</label>
        <textarea 
          :value="nodeData.prompt || ''" 
          @input="updatePrompt" 
          rows="6"
          placeholder="Instructions for routing decisions..."
        ></textarea>
      </div>
      <div class="info-box">
        Routes are defined by the connections from this node. Add edge labels to help with routing.
      </div>
    </div>
    
    <!-- Parallel fields -->
    <div v-else-if="isParallelNode" class="inspector-content">
      <div class="field-group">
        <label>Model</label>
        <select :value="nodeData.model || 'openai/gpt-4o-mini'" @change="updateModel">
          <option v-for="m in availableModels" :key="m.id" :value="m.id">
            {{ m.name }} ({{ m.provider }})
          </option>
        </select>
      </div>
      <div class="field-group">
        <label>Merge Prompt</label>
        <textarea 
          :value="nodeData.prompt || ''" 
          @input="updatePrompt" 
          rows="6"
          placeholder="Instructions for merging parallel outputs..."
        ></textarea>
      </div>
    </div>
    
    <!-- Start node (minimal) -->
    <div v-else-if="isStartNode" class="inspector-content">
      <div class="info-box">
        The Start node is the entry point for workflow execution. Connect it to other nodes to define your workflow.
      </div>
    </div>
  </div>
  
  <!-- Empty state -->
  <div class="node-inspector empty" v-else>
    <div class="empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <p>Select a node to edit its properties</p>
  </div>
</template>

<style scoped>
.node-inspector {
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-md, 16px);
}

.node-inspector.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--or3-spacing-sm, 8px);
  padding: var(--or3-spacing-xl, 32px);
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  text-align: center;
}

.empty-icon svg {
  width: 48px;
  height: 48px;
  opacity: 0.3;
}

.empty p {
  font-size: 14px;
}

/* Header */
.inspector-header {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--or3-radius-sm, 6px);
  flex-shrink: 0;
}

.header-icon svg {
  width: 18px;
  height: 18px;
}

.header-icon.agent {
  background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
  color: var(--or3-color-accent, #8b5cf6);
}

.header-icon.router {
  background: var(--or3-color-warning-muted, rgba(245, 158, 11, 0.2));
  color: var(--or3-color-warning, #f59e0b);
}

.header-icon.parallel {
  background: var(--or3-color-info-muted, rgba(59, 130, 246, 0.2));
  color: var(--or3-color-info, #3b82f6);
}

.header-icon.start {
  background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.2));
  color: var(--or3-color-success, #22c55e);
}

.label-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
  padding: var(--or3-spacing-xs, 4px) 0;
}

.label-input:focus {
  outline: none;
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--or3-radius-sm, 6px);
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  transition: all 0.15s ease;
}

.delete-btn:hover {
  background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.2));
  color: var(--or3-color-error, #ef4444);
}

.delete-btn svg {
  width: 16px;
  height: 16px;
}

/* Content */
.inspector-content {
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-md, 16px);
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-xs, 4px);
}

.field-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-group input,
.field-group select,
.field-group textarea {
  background: var(--or3-color-bg-tertiary, #1a1a24);
  border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--or3-radius-md, 10px);
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.field-group input:focus,
.field-group select:focus,
.field-group textarea:focus {
  outline: none;
  border-color: var(--or3-color-accent, #8b5cf6);
}

.field-group textarea {
  resize: vertical;
  min-height: 100px;
  line-height: 1.5;
}

.field-group select {
  cursor: pointer;
}

.info-box {
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
  border-radius: var(--or3-radius-md, 10px);
  font-size: 12px;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  line-height: 1.5;
}
</style>
