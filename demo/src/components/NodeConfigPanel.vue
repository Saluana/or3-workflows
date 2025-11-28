<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Bot, Cpu, Wrench, ChevronDown, Trash2, GitMerge } from 'lucide-vue-next'
import type { Node } from '@vue-flow/core'

const props = defineProps<{
  node: Node | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', nodeId: string, data: Record<string, unknown>): void
  (e: 'delete', nodeId: string): void
}>()

// Available models (popular OpenRouter models)
const availableModels = [
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google' },
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', provider: 'Google' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'Meta' },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'Meta' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral' },
  { id: 'mistralai/mixtral-8x7b-instruct', name: 'Mixtral 8x7B', provider: 'Mistral' },
]

// Available tools (example tools)
const availableTools = [
  { id: 'web_search', name: 'Web Search', description: 'Search the web for information' },
  { id: 'calculator', name: 'Calculator', description: 'Perform mathematical calculations' },
  { id: 'code_interpreter', name: 'Code Interpreter', description: 'Execute Python code' },
  { id: 'file_reader', name: 'File Reader', description: 'Read file contents' },
  { id: 'api_call', name: 'API Call', description: 'Make HTTP API requests' },
  { id: 'database_query', name: 'Database Query', description: 'Query a database' },
]

// Local state for editing
const localLabel = ref('')
const localModel = ref('')
const localPrompt = ref('')
const localTools = ref<string[]>([])
const showModelDropdown = ref(false)
const activeTab = ref<'prompt' | 'model' | 'tools'>('prompt')

// Sync local state with selected node
watch(() => props.node, (node) => {
  if (node && (node.type === 'agent' || node.type === 'parallel')) {
    localLabel.value = node.data.label || ''
    localModel.value = node.data.model || 'openai/gpt-4o-mini'
    localPrompt.value = node.data.prompt || ''
    localTools.value = node.data.tools || []
  }
}, { immediate: true })

const selectedModelInfo = computed(() => {
  return availableModels.find(m => m.id === localModel.value)
})

const isAgentNode = computed(() => props.node?.type === 'agent')
const isParallelNode = computed(() => props.node?.type === 'parallel')
const isConfigurableNode = computed(() => isAgentNode.value || isParallelNode.value)

function selectModel(modelId: string) {
  localModel.value = modelId
  showModelDropdown.value = false
  saveChanges()
}

function toggleTool(toolId: string) {
  const index = localTools.value.indexOf(toolId)
  if (index === -1) {
    localTools.value.push(toolId)
  } else {
    localTools.value.splice(index, 1)
  }
  saveChanges()
}

function saveChanges() {
  if (!props.node) return
  
  emit('update', props.node.id, {
    label: localLabel.value,
    model: localModel.value,
    prompt: localPrompt.value,
    tools: [...localTools.value],
  })
}

// Debounced save for text inputs
let saveTimeout: ReturnType<typeof setTimeout> | null = null
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveChanges, 300)
}

// Delete node
function handleDelete() {
  if (!props.node) return
  if (confirm(`Delete "${localLabel.value}"? This cannot be undone.`)) {
    emit('delete', props.node.id)
    emit('close')
  }
}

// Check if node can be deleted (not start node)
const canDelete = computed(() => props.node?.id !== 'start')
</script>

<template>
  <div v-if="node && isConfigurableNode" class="config-panel">
    <div class="panel-header">
      <div class="header-title">
        <GitMerge v-if="isParallelNode" :size="18" class="icon-parallel" />
        <Bot v-else :size="18" />
        <input 
          v-model="localLabel"
          class="label-input"
          placeholder="Node name"
          @input="debouncedSave"
        />
      </div>
      <div class="header-actions">
        <button 
          v-if="canDelete"
          class="btn btn-ghost delete-btn" 
          title="Delete node"
          @click="handleDelete"
        >
          <Trash2 :size="16" />
        </button>
        <button class="btn btn-ghost close-btn" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>
    </div>
    
    <!-- Tabs -->
    <div class="tabs">
      <button 
        class="tab" 
        :class="{ active: activeTab === 'prompt' }"
        @click="activeTab = 'prompt'"
      >
        <Bot :size="14" />
        {{ isParallelNode ? 'Merge Prompt' : 'Prompt' }}
      </button>
      <button 
        class="tab" 
        :class="{ active: activeTab === 'model' }"
        @click="activeTab = 'model'"
      >
        <Cpu :size="14" />
        Model
      </button>
      <button 
        v-if="isAgentNode"
        class="tab" 
        :class="{ active: activeTab === 'tools' }"
        @click="activeTab = 'tools'"
      >
        <Wrench :size="14" />
        Tools
        <span v-if="localTools.length" class="tool-count">{{ localTools.length }}</span>
      </button>
    </div>
    
    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Prompt Tab -->
      <div v-if="activeTab === 'prompt'" class="prompt-tab">
        <label class="field-label">{{ isParallelNode ? 'Merge/Summary Prompt' : 'System Prompt' }}</label>
        <textarea
          v-model="localPrompt"
          class="prompt-textarea"
          :placeholder="isParallelNode 
            ? 'Enter a prompt for merging parallel outputs...\n\nExample:\nYou are a synthesis assistant. Combine the following outputs from multiple agents into a coherent, unified response. Highlight key points from each and resolve any contradictions.'
            : 'Enter the system prompt for this agent...\n\nExample:\nYou are a helpful technical support specialist. You help users troubleshoot issues with their software and hardware. Be patient, thorough, and always verify the problem is resolved before ending the conversation.'"
          @input="debouncedSave"
        />
        <p class="field-hint">
          {{ isParallelNode 
            ? 'This prompt is used to merge/summarize the outputs from all parallel branches.' 
            : 'This prompt defines the agent\'s behavior and personality.' }}
        </p>
      </div>
      
      <!-- Model Tab -->
      <div v-if="activeTab === 'model'" class="model-tab">
        <label class="field-label">Select Model</label>
        
        <div class="model-selector">
          <button 
            class="model-button"
            @click="showModelDropdown = !showModelDropdown"
          >
            <div class="model-info">
              <span class="model-name">{{ selectedModelInfo?.name || 'Select a model' }}</span>
              <span class="model-provider">{{ selectedModelInfo?.provider }}</span>
            </div>
            <ChevronDown :size="16" :class="{ rotated: showModelDropdown }" />
          </button>
          
          <div v-if="showModelDropdown" class="model-dropdown">
            <div 
              v-for="model in availableModels" 
              :key="model.id"
              class="model-option"
              :class="{ selected: model.id === localModel }"
              @click="selectModel(model.id)"
            >
              <div class="model-option-info">
                <span class="model-option-name">{{ model.name }}</span>
                <span class="model-option-provider">{{ model.provider }}</span>
              </div>
              <span class="model-option-id">{{ model.id }}</span>
            </div>
          </div>
        </div>
        
        <div class="model-id-display">
          <label class="field-label">Model ID</label>
          <code class="model-id-code">{{ localModel }}</code>
        </div>
      </div>
      
      <!-- Tools Tab -->
      <div v-if="activeTab === 'tools'" class="tools-tab">
        <label class="field-label">Available Tools</label>
        <p class="field-hint">Select which tools this agent can use during execution.</p>
        
        <div class="tools-list">
          <label 
            v-for="tool in availableTools" 
            :key="tool.id"
            class="tool-item"
            :class="{ enabled: localTools.includes(tool.id) }"
          >
            <input
              type="checkbox"
              :checked="localTools.includes(tool.id)"
              @change="toggleTool(tool.id)"
            />
            <div class="tool-info">
              <span class="tool-name">{{ tool.name }}</span>
              <span class="tool-description">{{ tool.description }}</span>
            </div>
          </label>
        </div>
        
        <div v-if="localTools.length > 0" class="selected-tools">
          <label class="field-label">Enabled Tools ({{ localTools.length }})</label>
          <div class="tool-chips">
            <span 
              v-for="toolId in localTools" 
              :key="toolId"
              class="tool-chip"
            >
              {{ availableTools.find(t => t.id === toolId)?.name }}
              <button class="chip-remove" @click="toggleTool(toolId)">
                <X :size="12" />
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Non-agent node message -->
  <div v-else-if="node" class="config-panel config-panel-empty">
    <div class="panel-header">
      <span class="header-title">{{ node.data.label }}</span>
      <button class="btn btn-ghost close-btn" @click="emit('close')">
        <X :size="18" />
      </button>
    </div>
    <div class="empty-message">
      <p>This node type doesn't have configurable options.</p>
    </div>
  </div>
</template>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  overflow: hidden;
}

.config-panel-empty {
  justify-content: flex-start;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  gap: var(--spacing-sm);
}

.header-title {
  display: flex;
  align-items: center;
  color: var(--color-accent);
}

.header-title .icon-parallel {
  color: var(--color-info);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.delete-btn {
  color: var(--color-text-muted);
}

.delete-btn:hover {
  color: var(--color-error);
  background: var(--color-error-muted);
}

.header-title-text {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
  min-width: 0;
  color: var(--color-accent);
}

.label-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  padding: var(--spacing-xs) 0;
  min-width: 0;
}

.label-input:focus {
  outline: none;
  box-shadow: none;
}

.close-btn {
  flex-shrink: 0;
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--spacing-sm);
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all var(--transition-fast);
}

.tab:hover {
  color: var(--color-text-primary);
}

.tab.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.tool-count {
  background: var(--color-accent);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

/* Tab Content */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--spacing-sm);
}

.field-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: var(--spacing-sm);
}

/* Prompt Tab */
.prompt-textarea {
  width: 100%;
  min-height: 200px;
  resize: vertical;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.6;
  padding: var(--spacing-md);
}

/* Model Tab */
.model-selector {
  position: relative;
  margin-bottom: var(--spacing-lg);
}

.model-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-button:hover {
  border-color: var(--color-border-hover);
}

.model-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.model-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.model-provider {
  font-size: 11px;
  color: var(--color-text-muted);
}

.model-button svg {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.model-button svg.rotated {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: var(--spacing-xs);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 300px;
  overflow-y: auto;
  z-index: 10;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.model-option:hover {
  background: var(--color-surface-hover);
}

.model-option.selected {
  background: var(--color-accent-muted);
}

.model-option-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-option-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.model-option-provider {
  font-size: 11px;
  color: var(--color-text-muted);
}

.model-option-id {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.model-id-display {
  margin-top: var(--spacing-md);
}

.model-id-code {
  display: block;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* Tools Tab */
.tools-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
}

.tool-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tool-item:hover {
  border-color: var(--color-border-hover);
}

.tool-item.enabled {
  border-color: var(--color-accent);
  background: var(--color-accent-muted);
}

.tool-item input[type="checkbox"] {
  margin-top: 2px;
  accent-color: var(--color-accent);
}

.tool-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-name {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 13px;
}

.tool-description {
  font-size: 12px;
  color: var(--color-text-muted);
}

.selected-tools {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

.tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.tool-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--color-accent-muted);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--color-accent);
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 50%;
  color: var(--color-accent);
  transition: all var(--transition-fast);
}

.chip-remove:hover {
  background: var(--color-accent);
  color: white;
}

/* Empty state */
.empty-message {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-muted);
}
</style>
