<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Node, Edge } from '@vue-flow/core'

// Import from our v2 packages
import { 
  WorkflowEditor, 
  OpenRouterExecutionAdapter,
  LocalStorageAdapter,
  validateWorkflow,
  type WorkflowData,
} from '@or3/workflow-core'
import { 
  WorkflowCanvas, 
  NodePalette,
  NodeInspector,
  ChatPanel,
  useEditor,
  useExecutionState,
} from '@or3/workflow-vue'

// Create editor instance using the composable
const editor = useEditor()

// Execution state
const { state: executionState, setRunning, setNodeStatus, setStreamingContent, appendStreamingContent, reset: resetExecution } = useExecutionState()

// UI state
const selectedNode = ref<Node | null>(null)
const selectedEdge = ref<Edge | null>(null)
const showSidebar = ref(true)
const activePanel = ref<'palette' | 'inspector'>('palette')
const apiKey = ref(localStorage.getItem('or3-api-key') || '')
const showApiKeyModal = ref(!apiKey.value)
const chatInput = ref('')

// Storage
const storage = new LocalStorageAdapter()

// Messages for chat
const messages = ref<Array<{ role: 'user' | 'assistant'; content: string; nodeId?: string }>>([])

// Computed
const canUndo = computed(() => editor.value?.canUndo() ?? false)
const canRedo = computed(() => editor.value?.canRedo() ?? false)
const nodeStatuses = computed(() => executionState.value.nodeStatuses)

// Initialize with a default workflow
onMounted(() => {
  if (!editor.value) return
  
  // Try to load autosave
  const autosave = storage.loadAutosave()
  if (autosave) {
    editor.value.load(autosave)
  } else {
    // Create default workflow
    editor.value.commands.createNode('start', { label: 'Start' }, { x: 250, y: 50 })
    editor.value.commands.createNode('agent', { 
      label: 'Assistant', 
      model: 'openai/gpt-4o-mini',
      prompt: 'You are a helpful assistant.'
    }, { x: 200, y: 200 })
  }
})

// Autosave on changes
watch(() => editor.value?.getNodes(), () => {
  if (!editor.value) return
  storage.autosave(editor.value.getJSON())
}, { deep: true })

// Event handlers
const onNodeClick = (node: Node) => {
  selectedNode.value = node
  selectedEdge.value = null
  activePanel.value = 'inspector'
}

const onEdgeClick = (edge: Edge) => {
  selectedEdge.value = edge
  selectedNode.value = null
}

const onPaneClick = () => {
  selectedNode.value = null
  selectedEdge.value = null
}

const onUpdateNodeData = (nodeId: string, data: Record<string, unknown>) => {
  editor.value?.commands.updateNodeData(nodeId, data)
}

const onDeleteNode = (nodeId: string) => {
  editor.value?.commands.deleteNode(nodeId)
  selectedNode.value = null
}

// Execution
const sendMessage = async (content: string) => {
  if (!editor.value || !apiKey.value) {
    showApiKeyModal.value = true
    return
  }
  
  // Add user message
  messages.value.push({ role: 'user', content })
  
  // Reset node statuses
  const nodes = editor.value.getNodes()
  nodes.forEach(n => setNodeStatus(n.id, 'idle'))
  
  setRunning(true)
  setStreamingContent('')
  
  try {
    const adapter = new OpenRouterExecutionAdapter({ apiKey: apiKey.value } as any)
    const workflow = editor.value.getJSON()
    
    const result = await adapter.execute(workflow, { text: content }, {
      onNodeStart: (nodeId) => setNodeStatus(nodeId, 'active'),
      onNodeComplete: (nodeId, output) => {
        setNodeStatus(nodeId, 'completed')
        messages.value.push({ role: 'assistant', content: output, nodeId })
      },
      onNodeError: (nodeId, error) => {
        setNodeStatus(nodeId, 'error')
        messages.value.push({ role: 'assistant', content: `Error: ${error.message}`, nodeId })
      },
      onToken: (_nodeId, token) => appendStreamingContent(token),
      onStreamStart: () => setStreamingContent(''),
      onStreamEnd: () => setStreamingContent(''),
    })
    
    if (!result.success && result.error) {
      messages.value.push({ role: 'assistant', content: `Execution failed: ${result.error.message}` })
    }
  } catch (error: any) {
    messages.value.push({ role: 'assistant', content: `Error: ${error.message}` })
  } finally {
    setRunning(false)
  }
}

// API Key handling
const saveApiKey = () => {
  localStorage.setItem('or3-api-key', apiKey.value)
  showApiKeyModal.value = false
}

// Toolbar actions
const undo = () => editor.value?.commands.undo()
const redo = () => editor.value?.commands.redo()
const validate = () => {
  if (!editor.value) return
  const result = validateWorkflow(editor.value.getNodes(), editor.value.getEdges())
  if (result.isValid) {
    alert('Workflow is valid!')
  } else {
    alert(`Validation errors:\n${result.errors.map(e => e.message).join('\n')}`)
  }
}
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1 class="logo">or3-workflow</h1>
        <span class="version">v2</span>
      </div>
      
      <div class="header-center">
        <button class="btn btn-ghost" :disabled="!canUndo" @click="undo" title="Undo (Ctrl+Z)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
            <path d="M3 7v6h6"></path>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
          </svg>
        </button>
        <button class="btn btn-ghost" :disabled="!canRedo" @click="redo" title="Redo (Ctrl+Shift+Z)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
            <path d="M21 7v6h-6"></path>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path>
          </svg>
        </button>
        <div class="divider"></div>
        <button class="btn btn-ghost" @click="validate" title="Validate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Validate
        </button>
      </div>
      
      <div class="header-right">
        <button class="btn btn-ghost" @click="showApiKeyModal = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
          </svg>
          API Key
        </button>
      </div>
    </header>
    
    <!-- Main content -->
    <main class="main">
      <!-- Left sidebar -->
      <aside class="sidebar left-sidebar" v-if="showSidebar">
        <div class="sidebar-tabs">
          <button 
            class="sidebar-tab" 
            :class="{ active: activePanel === 'palette' }"
            @click="activePanel = 'palette'"
          >
            Nodes
          </button>
          <button 
            class="sidebar-tab" 
            :class="{ active: activePanel === 'inspector' }"
            @click="activePanel = 'inspector'"
          >
            Inspector
          </button>
        </div>
        
        <div class="sidebar-content">
          <NodePalette v-if="activePanel === 'palette'" />
          <NodeInspector 
            v-else-if="activePanel === 'inspector' && editor" 
            :editor="editor" 
          />
        </div>
      </aside>
      
      <!-- Canvas -->
      <div class="canvas-container">
        <WorkflowCanvas 
          v-if="editor"
          :editor="editor"
          :node-statuses="nodeStatuses"
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
        />
      </div>
      
      <!-- Right sidebar - Chat -->
      <aside class="sidebar right-sidebar">
        <div class="chat-wrapper">
          <div class="chat-header">
            <h3>Chat</h3>
            <button class="btn btn-ghost btn-sm" @click="messages = []; resetExecution()">
              Clear
            </button>
          </div>
          
          <div class="chat-messages">
            <div v-if="messages.length === 0" class="chat-empty">
              Send a message to run the workflow
            </div>
            <div 
              v-for="(msg, i) in messages" 
              :key="i" 
              class="chat-message"
              :class="msg.role"
            >
              <div class="message-content">{{ msg.content }}</div>
              <div v-if="msg.nodeId" class="message-meta">via {{ msg.nodeId }}</div>
            </div>
            <div v-if="executionState.streamingContent" class="chat-message assistant streaming">
              <div class="message-content">{{ executionState.streamingContent }}<span class="cursor">|</span></div>
            </div>
          </div>
          
          <div class="chat-input">
            <textarea 
              v-model="chatInput"
              placeholder="Type a message..."
              :disabled="executionState.isRunning"
              @keydown.enter.prevent="sendMessage(chatInput); chatInput = ''"
            ></textarea>
            <button 
              class="btn btn-primary" 
              :disabled="!chatInput?.trim() || executionState.isRunning"
              @click="sendMessage(chatInput); chatInput = ''"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </main>
    
    <!-- API Key Modal -->
    <div v-if="showApiKeyModal" class="modal-overlay" @click.self="showApiKeyModal = false">
      <div class="modal">
        <h2>OpenRouter API Key</h2>
        <p>Enter your OpenRouter API key to enable workflow execution.</p>
        <input 
          v-model="apiKey" 
          type="password" 
          placeholder="sk-or-..."
          @keydown.enter="saveApiKey"
        />
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="showApiKeyModal = false">Cancel</button>
          <button class="btn btn-primary" @click="saveApiKey">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--or3-spacing-md, 16px);
  height: 56px;
  background: var(--or3-color-bg-secondary, #12121a);
  border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.header-left, .header-center, .header-right {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
}

.logo {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--or3-color-accent, #8b5cf6), #a78bfa);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.version {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
  color: var(--or3-color-accent, #8b5cf6);
  border-radius: var(--or3-radius-sm, 6px);
  font-weight: 600;
}

.icon {
  width: 18px;
  height: 18px;
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--or3-color-border, rgba(255, 255, 255, 0.08));
  margin: 0 var(--or3-spacing-xs, 4px);
}

/* Main */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebars */
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--or3-color-bg-secondary, #12121a);
  border-color: var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.left-sidebar {
  width: 280px;
  border-right: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.right-sidebar {
  width: 350px;
  border-left: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.sidebar-tab {
  flex: 1;
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  font-size: 13px;
  font-weight: 500;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s ease;
}

.sidebar-tab:hover {
  color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

.sidebar-tab.active {
  color: var(--or3-color-accent, #8b5cf6);
  border-bottom-color: var(--or3-color-accent, #8b5cf6);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--or3-spacing-md, 16px);
}

/* Canvas */
.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* Chat */
.chat-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--or3-spacing-md, 16px);
  border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.chat-header h3 {
  font-size: 15px;
  font-weight: 600;
}

.btn-sm {
  padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-sm, 8px);
  font-size: 12px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--or3-spacing-md, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-md, 16px);
}

.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  font-size: 14px;
}

.chat-message {
  max-width: 85%;
}

.chat-message.user {
  align-self: flex-end;
}

.chat-message.user .message-content {
  background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.chat-message.assistant {
  align-self: flex-start;
}

.message-content {
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
  border-radius: var(--or3-radius-md, 10px);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.message-meta {
  margin-top: var(--or3-spacing-xs, 4px);
  font-size: 11px;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.cursor {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.chat-input {
  display: flex;
  gap: var(--or3-spacing-sm, 8px);
  padding: var(--or3-spacing-md, 16px);
  border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.chat-input textarea {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  resize: none;
}

.chat-input .btn {
  width: 40px;
  height: 40px;
  padding: 0;
  flex-shrink: 0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--or3-color-bg-secondary, #12121a);
  border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--or3-radius-lg, 16px);
  padding: var(--or3-spacing-lg, 24px);
  width: 400px;
  max-width: 90vw;
}

.modal h2 {
  font-size: 18px;
  margin-bottom: var(--or3-spacing-sm, 8px);
}

.modal p {
  color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
  font-size: 14px;
  margin-bottom: var(--or3-spacing-md, 16px);
}

.modal input {
  width: 100%;
  margin-bottom: var(--or3-spacing-md, 16px);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--or3-spacing-sm, 8px);
}
</style>
