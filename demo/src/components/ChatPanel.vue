<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { Send, Loader2, ChevronDown, ChevronUp, Bot, User, Sparkles } from 'lucide-vue-next'
import type { ChatMessage, NodeStatus } from '@/types/workflow'

const props = defineProps<{
  messages: ChatMessage[]
  isRunning: boolean
  nodeStatuses?: Record<string, NodeStatus>
  streamingContent?: string
}>()

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const showProcessFlow = ref(true)

// Auto-scroll to bottom when new messages arrive
watch(() => props.messages.length, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})

// Also scroll when streaming content updates
watch(() => props.streamingContent, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})

const handleSend = () => {
  const text = inputText.value.trim()
  if (!text || props.isRunning) return
  
  emit('send', text)
  inputText.value = ''
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Process flow steps for display
const processSteps = computed(() => {
  if (!props.nodeStatuses) return []
  
  return Object.entries(props.nodeStatuses)
    .filter(([id]) => id !== 'start')
    .map(([id, status]) => ({
      id,
      label: id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      status
    }))
})
</script>

<template>
  <div class="chat-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-content">
        <Sparkles :size="18" class="header-icon" />
        <span class="header-title">Workflow Chat</span>
      </div>
    </div>
    
    <!-- Process Flow Collapsible -->
    <div v-if="processSteps.length > 0" class="process-flow">
      <button class="flow-toggle" @click="showProcessFlow = !showProcessFlow">
        <span>Process Flow</span>
        <component :is="showProcessFlow ? ChevronUp : ChevronDown" :size="16" />
      </button>
      
      <div v-if="showProcessFlow" class="flow-steps">
        <div 
          v-for="step in processSteps" 
          :key="step.id"
          class="flow-step"
          :class="`status-${step.status}`"
        >
          <div class="step-indicator">
            <Loader2 v-if="step.status === 'active'" :size="12" class="spinning" />
            <div v-else class="step-dot" />
          </div>
          <span class="step-label">{{ step.label }}</span>
        </div>
      </div>
    </div>
    
    <!-- Messages -->
    <div ref="messagesContainer" class="messages-container">
      <div v-if="messages.length === 0" class="empty-state">
        <Bot :size="32" class="empty-icon" />
        <p>Send a message to start the workflow</p>
      </div>
      
      <div 
        v-for="message in messages" 
        :key="message.id"
        class="message"
        :class="message.role"
      >
        <div class="message-avatar">
          <User v-if="message.role === 'user'" :size="16" />
          <Bot v-else :size="16" />
        </div>
        <div class="message-content">
          <div class="message-text">{{ message.content }}</div>
          <div v-if="message.nodeId" class="message-meta">
            via {{ message.nodeId }}
          </div>
        </div>
      </div>
      
      <!-- Streaming indicator -->
      <div v-if="streamingContent" class="message assistant streaming">
        <div class="message-avatar">
          <Bot :size="16" />
        </div>
        <div class="message-content">
          <div class="message-text">{{ streamingContent }}<span class="cursor">|</span></div>
        </div>
      </div>
    </div>
    
    <!-- Input -->
    <div class="input-container">
      <div class="input-wrapper">
        <textarea
          v-model="inputText"
          placeholder="Type your message..."
          :disabled="isRunning"
          @keydown="handleKeydown"
          rows="1"
        />
        <button 
          class="send-button btn btn-primary"
          :disabled="!inputText.trim() || isRunning"
          @click="handleSend"
        >
          <Loader2 v-if="isRunning" :size="18" class="spinning" />
          <Send v-else :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
}

/* Mobile: full width, no border */
@media (max-width: 768px) {
  .chat-panel {
    border-left: none;
  }
}

/* Header */
.panel-header {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
}

.header-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.header-icon {
  color: var(--color-accent);
}

.header-title {
  font-weight: 600;
  font-size: 15px;
}

/* Process Flow */
.process-flow {
  border-bottom: 1px solid var(--color-border);
}

.flow-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.flow-toggle:hover {
  background: var(--color-surface);
}

.flow-steps {
  padding: 0 var(--spacing-md) var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.flow-step {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border);
}

.flow-step.status-active {
  color: var(--color-accent);
}

.flow-step.status-active .step-dot {
  background: var(--color-accent);
}

.flow-step.status-completed {
  color: var(--color-success);
}

.flow-step.status-completed .step-dot {
  background: var(--color-success);
}

.flow-step.status-error {
  color: var(--color-error);
}

.flow-step.status-error .step-dot {
  background: var(--color-error);
}

.spinning {
  animation: spin 1s linear infinite;
}

/* Messages */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  color: var(--color-text-muted);
  text-align: center;
}

.empty-icon {
  opacity: 0.5;
}

.message {
  display: flex;
  gap: var(--spacing-sm);
  animation: slideUp var(--transition-normal) ease-out;
}

.message-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.message.user .message-avatar {
  background: var(--color-accent-muted);
  color: var(--color-accent);
}

.message.assistant .message-avatar {
  background: var(--color-success-muted);
  color: var(--color-success);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-text {
  background: var(--color-surface);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-text {
  background: var(--color-accent-muted);
}

.message-meta {
  margin-top: var(--spacing-xs);
  font-size: 11px;
  color: var(--color-text-muted);
}

.streaming .cursor {
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* Input */
.input-container {
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.input-wrapper {
  display: flex;
  gap: var(--spacing-sm);
  align-items: flex-end;
}

.input-wrapper textarea {
  flex: 1;
  resize: none;
  min-height: 40px;
  max-height: 120px;
  padding: var(--spacing-sm) var(--spacing-md);
}

.send-button {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  padding: 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
