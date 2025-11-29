<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { useExecutionState } from '../../composables/useExecutionState';

const { state, setRunning, reset } = useExecutionState();

const messages = ref<{ role: 'user' | 'assistant'; content: string }[]>([]);
const input = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const sendMessage = async () => {
  if (!input.value.trim() || state.value.isRunning) return;

  const userMessage = input.value;
  messages.value.push({ role: 'user', content: userMessage });
  input.value = '';
  await scrollToBottom();

  setRunning(true);
  
  // Mock execution for now
  setTimeout(() => {
    messages.value.push({ role: 'assistant', content: 'This is a mock response.' });
    setRunning(false);
    scrollToBottom();
  }, 1000);
};

const clearChat = () => {
  messages.value = [];
  reset();
};
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <h3>Chat</h3>
      <button @click="clearChat" class="clear-btn">Clear</button>
    </div>
    
    <div class="messages" ref="messagesContainer">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="message-content">{{ msg.content }}</div>
      </div>
      <div v-if="state.isRunning" class="message assistant streaming">
        <div class="typing-indicator">...</div>
      </div>
    </div>
    
    <div class="input-area">
      <textarea
        v-model="input"
        @keydown.enter.prevent="sendMessage"
        placeholder="Type a message..."
        :disabled="state.isRunning"
      ></textarea>
      <button @click="sendMessage" :disabled="!input.trim() || state.isRunning">
        Send
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #252525;
  border-left: 1px solid #444;
  width: 350px;
}

.chat-header {
  padding: 12px;
  border-bottom: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h3 {
  margin: 0;
  font-size: 1rem;
  color: #fff;
}

.clear-btn {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 0.8rem;
}

.clear-btn:hover {
  color: #fff;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  line-height: 1.4;
}

.message.user {
  align-self: flex-end;
  background: #2563eb;
  color: #fff;
}

.message.assistant {
  align-self: flex-start;
  background: #333;
  color: #ddd;
}

.input-area {
  padding: 12px;
  border-top: 1px solid #444;
  display: flex;
  gap: 8px;
}

textarea {
  flex: 1;
  background: #333;
  border: 1px solid #555;
  color: #fff;
  padding: 8px;
  border-radius: 4px;
  resize: none;
  height: 40px;
  font-family: inherit;
}

textarea:focus {
  outline: none;
  border-color: #646cff;
}

button {
  background: #646cff;
  color: #fff;
  border: none;
  padding: 0 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

button:disabled {
  background: #444;
  cursor: not-allowed;
  color: #888;
}
</style>
