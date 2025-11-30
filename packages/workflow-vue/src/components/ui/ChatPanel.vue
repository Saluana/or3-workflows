<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useExecutionState, type UseExecutionStateReturn } from '../../composables/useExecutionState';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  nodeId?: string;
}

const props = defineProps<{
  messages?: ChatMessage[];
  streamingContent?: string;
  /**
   * Optional execution state instance.
   * Pass a state created via `createExecutionState()` to avoid sharing state
   * between multiple ChatPanel instances or workflows.
   * If not provided, uses a shared singleton (legacy behavior).
   */
  executionState?: UseExecutionStateReturn;
}>();

const emit = defineEmits<{
  (e: 'send', message: string): void;
  (e: 'clear'): void;
}>();

// Use provided state or fall back to shared singleton for backward compatibility
const executionStateInternal = computed(() => props.executionState ?? useExecutionState());
const state = computed(() => executionStateInternal.value.state);
const reset = () => executionStateInternal.value.reset();

const input = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

// Auto-scroll on new messages
watch(() => props.messages?.length, async () => {
  await nextTick();
  scrollToBottom();
});

watch(() => props.streamingContent, async () => {
  await nextTick();
  scrollToBottom();
});

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const sendMessage = () => {
  if (!input.value.trim() || state.value.value.isRunning) return;
  emit('send', input.value.trim());
  input.value = '';
};

const clearChat = () => {
  reset();
  emit('clear');
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <div class="header-title">
        <svg class="sparkle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"></path>
          <circle cx="12" cy="12" r="4"></circle>
        </svg>
        <span>Workflow Chat</span>
      </div>
      <button @click="clearChat" class="clear-btn">Clear</button>
    </div>
    
    <div class="messages" ref="messagesContainer">
      <div v-if="!messages?.length" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="10" rx="2"></rect>
          <circle cx="12" cy="5" r="2"></circle>
          <path d="M12 7v4"></path>
        </svg>
        <p>Send a message to start the workflow</p>
      </div>
      
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="message-avatar">
          <svg v-if="msg.role === 'user'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
          </svg>
        </div>
        <div class="message-body">
          <div class="message-content">{{ msg.content }}</div>
          <div v-if="msg.nodeId" class="message-meta">via {{ msg.nodeId }}</div>
        </div>
      </div>
      
      <!-- Streaming indicator -->
      <div v-if="streamingContent || state.value.streamingContent" class="message assistant streaming">
        <div class="message-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
          </svg>
        </div>
        <div class="message-body">
          <div class="message-content">{{ streamingContent || state.value.streamingContent }}<span class="cursor">|</span></div>
        </div>
      </div>
    </div>
    
    <div class="input-area">
      <textarea
        v-model="input"
        @keydown="handleKeydown"
        placeholder="Type a message..."
        :disabled="state.value.isRunning"
        rows="1"
      ></textarea>
      <button 
        class="send-btn" 
        @click="sendMessage" 
        :disabled="!input.trim() || state.value.isRunning"
      >
        <svg v-if="state.value.isRunning" class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-6.219-8.56"></path>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--or3-spacing-md, 16px);
  border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--or3-spacing-sm, 8px);
  font-weight: 600;
  font-size: 15px;
}

.sparkle-icon {
  width: 18px;
  height: 18px;
  color: var(--or3-color-accent, #8b5cf6);
}

.clear-btn {
  font-size: 12px;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
  padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-sm, 8px);
  border-radius: var(--or3-radius-sm, 6px);
  transition: all 0.15s ease;
}

.clear-btn:hover {
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
  background: var(--or3-color-surface-hover, rgba(34, 34, 46, 0.9));
}

/* Messages */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--or3-spacing-md, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--or3-spacing-md, 16px);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--or3-spacing-sm, 8px);
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.empty-state svg {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
}

.message {
  display: flex;
  gap: var(--or3-spacing-sm, 8px);
  animation: slideUp 0.25s ease;
}

.message-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--or3-radius-sm, 6px);
  background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
}

.message-avatar svg {
  width: 16px;
  height: 16px;
  color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

.message.user .message-avatar {
  background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.message.user .message-avatar svg {
  color: var(--or3-color-accent, #8b5cf6);
}

.message.assistant .message-avatar {
  background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.2));
}

.message.assistant .message-avatar svg {
  color: var(--or3-color-success, #22c55e);
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-content {
  background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  border-radius: var(--or3-radius-md, 10px);
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-content {
  background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.message-meta {
  margin-top: var(--or3-spacing-xs, 4px);
  font-size: 11px;
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.cursor {
  animation: blink 1s step-end infinite;
}

/* Input */
.input-area {
  display: flex;
  gap: var(--or3-spacing-sm, 8px);
  padding: var(--or3-spacing-md, 16px);
  border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.input-area textarea {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  resize: none;
  background: var(--or3-color-bg-tertiary, #1a1a24);
  border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--or3-radius-md, 10px);
  color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
  padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
  font-size: 14px;
  font-family: inherit;
}

.input-area textarea:focus {
  outline: none;
  border-color: var(--or3-color-accent, #8b5cf6);
}

.send-btn {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--or3-color-accent, #8b5cf6);
  border-radius: var(--or3-radius-md, 10px);
  transition: all 0.15s ease;
}

.send-btn:hover:not(:disabled) {
  background: var(--or3-color-accent-hover, #a78bfa);
}

.send-btn:disabled {
  background: var(--or3-color-bg-tertiary, #1a1a24);
  cursor: not-allowed;
}

.send-btn svg {
  width: 18px;
  height: 18px;
  color: white;
}

.send-btn:disabled svg {
  color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes blink {
  50% { opacity: 0; }
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
