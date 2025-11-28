<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStorage } from '@vueuse/core'
import { Key, X, Github, Workflow, AlertCircle, MessageSquare, PanelRightClose, PanelRight } from 'lucide-vue-next'
import WorkflowEditor from './components/WorkflowEditor.vue'
import ChatPanel from './components/ChatPanel.vue'
import { useWorkflowExecution } from './composables/useWorkflowExecution'

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
      <!-- Workflow Editor -->
      <div class="editor-container">
        <WorkflowEditor 
          ref="workflowEditor"
          :node-statuses="nodeStatuses"
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
      
      <!-- Chat Panel -->
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

.chat-sidebar {
  width: 380px;
  flex-shrink: 0;
  overflow: hidden;
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
</style>
