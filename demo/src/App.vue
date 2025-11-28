<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { 
  Key, X, Github, Workflow, AlertCircle, MessageSquare, 
  PanelRightClose, PanelRight, Settings2, Save, FolderOpen,
  Download, Upload, Undo2, Redo2, AlertTriangle, CheckCircle2,
  Maximize2
} from 'lucide-vue-next'
import type { Node } from '@vue-flow/core'
import WorkflowEditor from './components/WorkflowEditor.vue'
import ChatPanel from './components/ChatPanel.vue'
import NodeConfigPanel from './components/NodeConfigPanel.vue'
import { useWorkflowExecution } from './composables/useWorkflowExecution'
import { useWorkflowStorage, type SavedWorkflow } from './composables/useWorkflowStorage'
import { useWorkflowValidation, type ValidationResult } from './composables/useWorkflowValidation'

// Persist API key in localStorage
const storedApiKey = useStorage('openrouter-api-key', '')

const {
  messages,
  isRunning,
  streamingContent,
  nodeStatuses,
  error,
  apiKey,
  executeWorkflow,
} = useWorkflowExecution()

// Sync stored key with composable
apiKey.value = storedApiKey.value

const showApiKeyModal = ref(!storedApiKey.value)
const tempApiKey = ref('')
const workflowEditor = ref<InstanceType<typeof WorkflowEditor> | null>(null)
const showChatPanel = ref(true)
const showConfigPanel = ref(false)
const selectedNode = ref<Node | null>(null)

const hasApiKey = computed(() => !!apiKey.value)

function saveApiKey() {
  if (!tempApiKey.value.trim()) return
  storedApiKey.value = tempApiKey.value.trim()
  apiKey.value = tempApiKey.value.trim()
  showApiKeyModal.value = false
  tempApiKey.value = ''
}

function clearApiKey() {
  storedApiKey.value = ''
  apiKey.value = ''
  showApiKeyModal.value = true
}

function handleSendMessage(message: string) {
  if (!workflowEditor.value) return
  
  const nodes = workflowEditor.value.getNodes()
  const edges = workflowEditor.value.getEdges()
  
  executeWorkflow(message, nodes, edges)
}

function handleNodeSelect(node: Node | null) {
  selectedNode.value = node
  if (node) {
    showConfigPanel.value = true
  }
}

function handleNodeUpdate(nodeId: string, data: Record<string, unknown>) {
  if (!workflowEditor.value) return
  workflowEditor.value.updateNodeData(nodeId, data)
}

function handleNodeDelete(nodeId: string) {
  if (!workflowEditor.value) return
  workflowEditor.value.deleteNode(nodeId)
  closeConfigPanel()
}

function closeConfigPanel() {
  showConfigPanel.value = false
  selectedNode.value = null
}

// Workflow storage
const { 
  savedWorkflows, 
  saveWorkflow, 
  loadWorkflow, 
  deleteWorkflow,
  exportWorkflow, 
  importWorkflow 
} = useWorkflowStorage()

// Workflow validation
const { validateWorkflow } = useWorkflowValidation()

// UI state for save/load
const showSaveModal = ref(false)
const showLoadModal = ref(false)
const showValidationModal = ref(false)
const workflowName = ref('My Workflow')
const validationResult = ref<ValidationResult | null>(null)

// Save workflow
function handleSave() {
  if (!workflowEditor.value) return
  const nodes = workflowEditor.value.getNodes()
  const edges = workflowEditor.value.getEdges()
  saveWorkflow(workflowName.value, nodes, edges)
  showSaveModal.value = false
}

// Load workflow
function handleLoad(workflow: SavedWorkflow) {
  if (!workflowEditor.value) return
  workflowEditor.value.loadWorkflow(workflow.nodes, workflow.edges)
  workflowName.value = workflow.name
  showLoadModal.value = false
}

// Export workflow
function handleExport() {
  if (!workflowEditor.value) return
  const nodes = workflowEditor.value.getNodes()
  const edges = workflowEditor.value.getEdges()
  exportWorkflow(nodes, edges, workflowName.value)
}

// Import workflow
async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !workflowEditor.value) return
  
  try {
    const data = await importWorkflow(file)
    workflowEditor.value.loadWorkflow(data.nodes, data.edges)
    workflowName.value = data.name
  } catch (err) {
    console.error('Failed to import workflow:', err)
    alert('Failed to import workflow. Please check the file format.')
  }
  
  // Reset input
  input.value = ''
}

// Validate workflow
function handleValidate() {
  if (!workflowEditor.value) return
  const nodes = workflowEditor.value.getNodes()
  const edges = workflowEditor.value.getEdges()
  validationResult.value = validateWorkflow(nodes, edges)
  showValidationModal.value = true
}

// Undo/Redo
function handleUndo() {
  workflowEditor.value?.handleUndo()
}

function handleRedo() {
  workflowEditor.value?.handleRedo()
}

// Fit view
function handleFitView() {
  workflowEditor.value?.fitView()
}
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="header-left">
        <Workflow :size="24" class="logo-icon" />
        <h1 class="app-title">or3-workflow</h1>
        <span class="app-subtitle">Visual Workflow Editor</span>
      </div>
      
      <!-- Toolbar -->
      <div class="header-toolbar">
        <div class="toolbar-group">
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Undo (Ctrl+Z)"
            @click="handleUndo"
          >
            <Undo2 :size="16" />
          </button>
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Redo (Ctrl+Shift+Z)"
            @click="handleRedo"
          >
            <Redo2 :size="16" />
          </button>
        </div>
        
        <div class="toolbar-divider" />
        
        <div class="toolbar-group">
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Save Workflow"
            @click="showSaveModal = true"
          >
            <Save :size="16" />
          </button>
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Load Workflow"
            @click="showLoadModal = true"
          >
            <FolderOpen :size="16" />
          </button>
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Export to JSON"
            @click="handleExport"
          >
            <Download :size="16" />
          </button>
          <label class="btn btn-ghost toolbar-btn" title="Import from JSON">
            <Upload :size="16" />
            <input 
              type="file" 
              accept=".json"
              class="hidden-input"
              @change="handleImport"
            />
          </label>
        </div>
        
        <div class="toolbar-divider" />
        
        <div class="toolbar-group">
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Validate Workflow"
            @click="handleValidate"
          >
            <CheckCircle2 :size="16" />
          </button>
          <button 
            class="btn btn-ghost toolbar-btn" 
            title="Fit to View"
            @click="handleFitView"
          >
            <Maximize2 :size="16" />
          </button>
        </div>
      </div>
      
      <div class="header-right">
        <button 
          v-if="hasApiKey"
          class="btn btn-ghost api-key-btn"
          @click="showApiKeyModal = true"
        >
          <Key :size="16" />
          <span>API Key Set</span>
        </button>
        <button 
          v-else
          class="btn btn-secondary api-key-btn"
          @click="showApiKeyModal = true"
        >
          <Key :size="16" />
          <span>Set API Key</span>
        </button>
        
        <button 
          class="btn btn-ghost"
          @click="showChatPanel = !showChatPanel"
        >
          <component :is="showChatPanel ? PanelRightClose : PanelRight" :size="18" />
        </button>
        
        <a 
          href="https://github.com" 
          target="_blank"
          class="btn btn-ghost"
        >
          <Github :size="18" />
        </a>
      </div>
    </header>
    
    <!-- Main Content -->
    <main class="app-main">
      <!-- Node Config Panel (Left) -->
      <Transition name="slide-left">
        <aside v-if="showConfigPanel" class="config-sidebar">
          <NodeConfigPanel
            :node="selectedNode"
            @close="closeConfigPanel"
            @update="handleNodeUpdate"
            @delete="handleNodeDelete"
          />
        </aside>
      </Transition>
      
      <!-- Workflow Editor -->
      <div class="editor-container">
        <WorkflowEditor 
          ref="workflowEditor"
          :node-statuses="nodeStatuses"
          @node-click="handleNodeSelect"
        />
        
        <!-- Error Toast -->
        <Transition name="toast">
          <div v-if="error" class="error-toast">
            <AlertCircle :size="18" />
            <span>{{ error }}</span>
            <button class="btn btn-ghost" @click="error = null">
              <X :size="16" />
            </button>
          </div>
        </Transition>
      </div>
      
      <!-- Chat Panel (Right) -->
      <Transition name="slide">
        <aside v-if="showChatPanel" class="chat-sidebar">
          <ChatPanel
            :messages="messages"
            :is-running="isRunning"
            :node-statuses="nodeStatuses"
            :streaming-content="streamingContent"
            @send="handleSendMessage"
          />
        </aside>
      </Transition>
    </main>
    
    <!-- API Key Modal -->
    <Transition name="modal">
      <div v-if="showApiKeyModal" class="modal-overlay" @click.self="hasApiKey && (showApiKeyModal = false)">
        <div class="modal-content">
          <div class="modal-header">
            <h2>OpenRouter API Key</h2>
            <button 
              v-if="hasApiKey"
              class="btn btn-ghost modal-close"
              @click="showApiKeyModal = false"
            >
              <X :size="20" />
            </button>
          </div>
          
          <p class="modal-description">
            Enter your OpenRouter API key to run workflows. 
            <a href="https://openrouter.ai/keys" target="_blank">Get one here</a>
          </p>
          
          <div class="modal-form">
            <input
              v-model="tempApiKey"
              type="password"
              placeholder="sk-or-v1-..."
              class="api-key-input"
              @keydown.enter="saveApiKey"
            />
            
            <div class="modal-actions">
              <button 
                v-if="hasApiKey"
                class="btn btn-ghost"
                @click="clearApiKey"
              >
                Clear Key
              </button>
              <button 
                class="btn btn-primary"
                :disabled="!tempApiKey.trim()"
                @click="saveApiKey"
              >
                Save Key
              </button>
            </div>
          </div>
          
          <p class="modal-note">
            Your API key is stored locally in your browser and never sent to our servers.
          </p>
        </div>
      </div>
    </Transition>
    
    <!-- Mobile Chat Toggle -->
    <button 
      v-if="!showChatPanel"
      class="mobile-chat-toggle btn btn-primary"
      @click="showChatPanel = true"
    >
      <MessageSquare :size="20" />
      <span v-if="messages.length" class="message-badge">{{ messages.length }}</span>
    </button>
    
    <!-- Save Modal -->
    <Transition name="modal">
      <div v-if="showSaveModal" class="modal-overlay" @click.self="showSaveModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <Save :size="20" class="modal-icon" />
            <h2>Save Workflow</h2>
            <button class="btn btn-ghost modal-close" @click="showSaveModal = false">
              <X :size="20" />
            </button>
          </div>
          
          <div class="modal-form">
            <label class="form-label">Workflow Name</label>
            <input
              v-model="workflowName"
              type="text"
              placeholder="My Workflow"
              class="form-input"
              @keydown.enter="handleSave"
            />
            
            <div class="modal-actions">
              <button class="btn btn-ghost" @click="showSaveModal = false">
                Cancel
              </button>
              <button class="btn btn-primary" @click="handleSave">
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    
    <!-- Load Modal -->
    <Transition name="modal">
      <div v-if="showLoadModal" class="modal-overlay" @click.self="showLoadModal = false">
        <div class="modal-content modal-content-lg">
          <div class="modal-header">
            <FolderOpen :size="20" class="modal-icon" />
            <h2>Load Workflow</h2>
            <button class="btn btn-ghost modal-close" @click="showLoadModal = false">
              <X :size="20" />
            </button>
          </div>
          
          <div class="workflow-list" v-if="savedWorkflows.length > 0">
            <div 
              v-for="workflow in savedWorkflows" 
              :key="workflow.id"
              class="workflow-item"
            >
              <div class="workflow-info">
                <span class="workflow-name">{{ workflow.name }}</span>
                <span class="workflow-date">
                  {{ new Date(workflow.updatedAt).toLocaleDateString() }}
                </span>
              </div>
              <div class="workflow-actions">
                <button 
                  class="btn btn-primary btn-sm"
                  @click="handleLoad(workflow)"
                >
                  Load
                </button>
                <button 
                  class="btn btn-ghost btn-sm"
                  @click="deleteWorkflow(workflow.id)"
                >
                  <X :size="14" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            <p>No saved workflows yet.</p>
          </div>
        </div>
      </div>
    </Transition>
    
    <!-- Validation Modal -->
    <Transition name="modal">
      <div v-if="showValidationModal" class="modal-overlay" @click.self="showValidationModal = false">
        <div class="modal-content">
          <div class="modal-header">
            <component 
              :is="validationResult?.isValid ? CheckCircle2 : AlertTriangle" 
              :size="20" 
              :class="validationResult?.isValid ? 'text-success' : 'text-warning'"
            />
            <h2>Workflow Validation</h2>
            <button class="btn btn-ghost modal-close" @click="showValidationModal = false">
              <X :size="20" />
            </button>
          </div>
          
          <div class="validation-result" v-if="validationResult">
            <div v-if="validationResult.isValid && validationResult.warnings.length === 0" class="validation-success">
              <CheckCircle2 :size="48" class="text-success" />
              <p>Workflow is valid and ready to run!</p>
            </div>
            
            <div v-if="validationResult.errors.length > 0" class="validation-section">
              <h3 class="text-error">Errors</h3>
              <ul class="validation-list">
                <li v-for="(err, i) in validationResult.errors" :key="'err-' + i">
                  <AlertCircle :size="14" class="text-error" />
                  {{ err.message }}
                </li>
              </ul>
            </div>
            
            <div v-if="validationResult.warnings.length > 0" class="validation-section">
              <h3 class="text-warning">Warnings</h3>
              <ul class="validation-list">
                <li v-for="(warn, i) in validationResult.warnings" :key="'warn-' + i">
                  <AlertTriangle :size="14" class="text-warning" />
                  {{ warn.message }}
                </li>
              </ul>
            </div>
          </div>
          
          <div class="modal-actions">
            <button class="btn btn-primary" @click="showValidationModal = false">
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* Header */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  height: 56px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.logo-icon {
  color: var(--color-accent);
}

.app-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, var(--color-accent), #c084fc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.app-subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-left: var(--spacing-sm);
  padding-left: var(--spacing-sm);
  border-left: 1px solid var(--color-border);
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 var(--spacing-xs);
}

.hidden-input {
  display: none;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.api-key-btn span {
  display: none;
}

@media (min-width: 640px) {
  .api-key-btn span {
    display: inline;
  }
}

@media (max-width: 768px) {
  .header-toolbar {
    display: none;
  }
}

/* Main Content */
.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.config-sidebar {
  width: 340px;
  flex-shrink: 0;
  overflow: hidden;
}

.chat-sidebar {
  width: 380px;
  flex-shrink: 0;
  overflow: hidden;
}

@media (max-width: 1200px) {
  .config-sidebar {
    position: absolute;
    top: 56px;
    left: 0;
    bottom: 0;
    width: 100%;
    max-width: 340px;
    z-index: var(--z-dropdown);
    box-shadow: var(--shadow-lg);
  }
}

@media (max-width: 768px) {
  .chat-sidebar {
    position: absolute;
    top: 56px;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 380px;
    z-index: var(--z-dropdown);
    box-shadow: var(--shadow-lg);
  }
}

/* Error Toast */
.error-toast {
  position: absolute;
  bottom: var(--spacing-lg);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-error-muted);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 13px;
  z-index: var(--z-toast);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--spacing-md);
}

.modal-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  width: 100%;
  max-width: 420px;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  margin: -8px;
}

.modal-description {
  color: var(--color-text-secondary);
  font-size: 14px;
  margin-bottom: var(--spacing-lg);
}

.modal-description a {
  color: var(--color-accent);
  text-decoration: none;
}

.modal-description a:hover {
  text-decoration: underline;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.api-key-input {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 13px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.modal-note {
  margin-top: var(--spacing-md);
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Mobile Chat Toggle */
.mobile-chat-toggle {
  position: fixed;
  bottom: var(--spacing-lg);
  right: var(--spacing-lg);
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-dropdown);
}

.message-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  background: var(--color-error);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (min-width: 769px) {
  .mobile-chat-toggle {
    display: none;
  }
}

/* Transitions */
.slide-enter-active,
.slide-leave-active {
  transition: transform var(--transition-normal), opacity var(--transition-normal);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform var(--transition-normal), opacity var(--transition-normal);
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform var(--transition-normal), opacity var(--transition-normal);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
  opacity: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: all var(--transition-normal);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* Form styles */
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xs);
}

.form-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

/* Workflow list */
.workflow-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  max-height: 300px;
  overflow-y: auto;
}

.workflow-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.workflow-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workflow-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.workflow-date {
  font-size: 12px;
  color: var(--color-text-muted);
}

.workflow-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.btn-sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 12px;
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--color-text-muted);
}

.modal-content-lg {
  max-width: 500px;
}

/* Validation styles */
.validation-result {
  margin: var(--spacing-md) 0;
}

.validation-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  text-align: center;
}

.validation-section {
  margin-bottom: var(--spacing-md);
}

.validation-section h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.validation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.validation-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.text-success {
  color: var(--color-success);
}

.text-warning {
  color: var(--color-warning);
}

.text-error {
  color: var(--color-error);
}
</style>
