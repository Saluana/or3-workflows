<script setup lang="ts">
import type { ChatMessage } from '../composables';

defineProps<{
    messages: ChatMessage[];
    nodeStatuses: Record<string, string>;
    streamingContent: string;
    isRunning: boolean;
    chatInput: string;
}>();

const emit = defineEmits<{
    'update:chatInput': [value: string];
    send: [];
    clear: [];
}>();
</script>

<template>
    <aside class="sidebar right-sidebar">
        <div class="chat-wrapper">
            <div class="chat-header">
                <div class="chat-title">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="chat-icon"
                    >
                        <path
                            d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
                        ></path>
                    </svg>
                    <h3>Workflow Chat</h3>
                </div>
                <button class="btn btn-ghost btn-sm" @click="emit('clear')">
                    Clear
                </button>
            </div>

            <!-- Process Flow -->
            <div
                v-if="Object.keys(nodeStatuses).length > 0"
                class="process-flow"
            >
                <div class="flow-header">Process Flow</div>
                <div class="flow-steps">
                    <div
                        v-for="(status, nodeId) in nodeStatuses"
                        :key="nodeId"
                        class="flow-step"
                        :class="`status-${status}`"
                    >
                        <div class="step-indicator">
                            <svg
                                v-if="status === 'active'"
                                class="spinning"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                            </svg>
                            <div v-else class="step-dot" />
                        </div>
                        <span class="step-label">{{ nodeId }}</span>
                    </div>
                </div>
            </div>

            <div class="chat-messages">
                <div v-if="messages.length === 0" class="chat-empty">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="empty-icon"
                    >
                        <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                        <circle cx="12" cy="5" r="2"></circle>
                        <path d="M12 7v4"></path>
                    </svg>
                    <p>Send a message to run the workflow</p>
                </div>
                <div
                    v-for="msg in messages"
                    :key="msg.id"
                    class="chat-message"
                    :class="msg.role"
                >
                    <div class="message-avatar">
                        <svg
                            v-if="msg.role === 'user'"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
                            ></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <svg
                            v-else
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <rect
                                x="3"
                                y="11"
                                width="18"
                                height="10"
                                rx="2"
                            ></rect>
                            <circle cx="12" cy="5" r="2"></circle>
                            <path d="M12 7v4"></path>
                        </svg>
                    </div>
                    <div class="message-body">
                        <div class="message-content">{{ msg.content }}</div>
                        <div v-if="msg.nodeId" class="message-meta">
                            via {{ msg.nodeId }}
                        </div>
                    </div>
                </div>
                <div
                    v-if="streamingContent"
                    class="chat-message assistant streaming"
                >
                    <div class="message-avatar">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <rect
                                x="3"
                                y="11"
                                width="18"
                                height="10"
                                rx="2"
                            ></rect>
                            <circle cx="12" cy="5" r="2"></circle>
                            <path d="M12 7v4"></path>
                        </svg>
                    </div>
                    <div class="message-body">
                        <div class="message-content">
                            {{ streamingContent }}<span class="cursor">|</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="chat-input">
                <textarea
                    :value="chatInput"
                    placeholder="Type a message..."
                    :disabled="isRunning"
                    @input="
                        emit(
                            'update:chatInput',
                            ($event.target as HTMLTextAreaElement).value
                        )
                    "
                    @keydown.enter.prevent="emit('send')"
                ></textarea>
                <button
                    class="btn btn-primary send-btn"
                    :disabled="!chatInput?.trim() || isRunning"
                    @click="emit('send')"
                >
                    <svg
                        v-if="isRunning"
                        class="spinning"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                    </svg>
                    <svg
                        v-else
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="icon"
                    >
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.sidebar {
    height: 100%;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.right-sidebar {
    width: 360px;
    min-width: 300px;
    max-width: 500px;
    resize: horizontal;
}

.chat-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

.chat-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.chat-title h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
}

.chat-icon {
    width: 18px;
    height: 18px;
    color: var(--accent-color);
}

.process-flow {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
}

.flow-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
}

.flow-steps {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.flow-step {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--bg-tertiary);
    border-radius: 12px;
    font-size: 12px;
    color: var(--text-secondary);
}

.flow-step.status-active {
    background: var(--accent-color);
    color: white;
}

.flow-step.status-completed {
    background: var(--success-color);
    color: white;
}

.flow-step.status-error {
    background: var(--error-color);
    color: white;
}

.step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
}

.step-indicator svg {
    width: 14px;
    height: 14px;
}

.step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.5;
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.chat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-tertiary);
    text-align: center;
    gap: 12px;
}

.empty-icon {
    width: 48px;
    height: 48px;
    opacity: 0.5;
}

.chat-message {
    display: flex;
    gap: 12px;
    max-width: 100%;
}

.chat-message.user {
    flex-direction: row-reverse;
}

.message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.message-avatar svg {
    width: 18px;
    height: 18px;
    color: var(--text-secondary);
}

.chat-message.user .message-avatar {
    background: var(--accent-color);
}

.chat-message.user .message-avatar svg {
    color: white;
}

.message-body {
    flex: 1;
    min-width: 0;
}

.message-content {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    word-wrap: break-word;
    white-space: pre-wrap;
}

.chat-message.user .message-content {
    background: var(--accent-color);
    color: white;
    border-bottom-right-radius: 4px;
}

.chat-message.assistant .message-content {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-bottom-left-radius: 4px;
}

.message-meta {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 4px;
    padding-left: 14px;
}

.streaming .cursor {
    animation: blink 1s infinite;
}

@keyframes blink {
    0%,
    50% {
        opacity: 1;
    }
    51%,
    100% {
        opacity: 0;
    }
}

.chat-input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
}

.chat-input textarea {
    flex: 1;
    min-height: 44px;
    max-height: 120px;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    resize: none;
    font-family: inherit;
}

.chat-input textarea:focus {
    outline: none;
    border-color: var(--accent-color);
}

.chat-input textarea:disabled {
    opacity: 0.6;
}

.send-btn {
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 8px;
    flex-shrink: 0;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.btn-ghost {
    background: transparent;
    color: var(--text-secondary);
}

.btn-ghost:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.btn-sm {
    padding: 4px 8px;
    font-size: 12px;
}

.btn-primary {
    background: var(--accent-color);
    color: white;
}

.btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.icon {
    width: 18px;
    height: 18px;
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 768px) {
    .right-sidebar {
        width: 100%;
        max-width: none;
        resize: none;
    }
}
</style>
