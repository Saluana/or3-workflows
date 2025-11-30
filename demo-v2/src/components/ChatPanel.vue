<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import type { TokenUsageDetails } from '@or3/workflow-core';
import type { ChatMessage } from '../composables';

// Branch stream type (matches App.vue)
interface BranchStream {
    nodeId: string;
    branchId: string;
    label: string;
    content: string;
    status: 'streaming' | 'completed' | 'error';
    expanded: boolean;
}

const props = defineProps<{
    messages: ChatMessage[];
    nodeStatuses: Record<string, string>;
    nodeLabels?: Record<string, string>;
    streamingContent: string;
    isRunning: boolean;
    chatInput: string;
    tokenUsage?: { nodeId: string; usage: TokenUsageDetails } | null;
    branchStreams?: Record<string, BranchStream>;
}>();

const emit = defineEmits<{
    'update:chatInput': [value: string];
    send: [];
    clear: [];
    toggleBranch: [key: string];
}>();

const messagesContainer = ref<HTMLElement | null>(null);

// Check if there are any active branch streams
const hasActiveBranches = computed(() => {
    return props.branchStreams && Object.keys(props.branchStreams).length > 0;
});

// Get display name for a node (label or fall back to truncated ID)
const getNodeDisplayName = (nodeId: string): string => {
    if (props.nodeLabels?.[nodeId]) {
        return props.nodeLabels[nodeId];
    }
    // Fall back to showing truncated ID if no label
    return nodeId.length > 12 ? `${nodeId.slice(0, 8)}...` : nodeId;
};

// Auto-scroll to bottom when new messages arrive
watch(
    () => props.messages.length,
    async () => {
        await nextTick();
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop =
                messagesContainer.value.scrollHeight;
        }
    }
);

watch(
    () => props.streamingContent,
    async () => {
        await nextTick();
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop =
                messagesContainer.value.scrollHeight;
        }
    }
);

// Count active nodes
const completedNodeCount = () => {
    return Object.values(props.nodeStatuses).filter((s) => s === 'completed')
        .length;
};

const totalNodeCount = () => {
    return Object.keys(props.nodeStatuses).length;
};

const formatNumber = (value?: number) =>
    typeof value === 'number' ? value.toLocaleString() : '—';
</script>

<template>
    <aside class="chat-panel">
        <!-- Header -->
        <header class="chat-header">
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
            <button
                v-if="messages.length > 0"
                class="clear-btn"
                @click="emit('clear')"
            >
                Clear
            </button>
        </header>

        <!-- Status Bar (if running) -->
        <div
            v-if="isRunning || Object.keys(nodeStatuses).length > 0"
            class="status-bar"
        >
            <div class="status-content">
                <div v-if="isRunning" class="status-indicator running">
                    <svg
                        class="spinner"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                    </svg>
                    <span>Running workflow...</span>
                </div>
                <div v-else class="status-indicator">
                    <span class="status-dot completed"></span>
                    <span
                        >{{ completedNodeCount() }}/{{ totalNodeCount() }} nodes
                        completed</span
                    >
                </div>
            </div>
            <div v-if="tokenUsage" class="token-usage-card">
                <div class="token-usage-header">
                    <span class="token-usage-title">Token usage</span>
                    <span class="token-model">{{
                        tokenUsage.usage.model
                    }}</span>
                </div>
                <div class="token-usage-row">
                    <span>Prompt</span>
                    <span class="token-usage-value">
                        {{ formatNumber(tokenUsage.usage.promptTokens) }} /
                        {{ formatNumber(tokenUsage.usage.contextLimit) }}
                    </span>
                </div>
                <div class="token-usage-row secondary">
                    <span>
                        <template
                            v-if="
                                tokenUsage.usage.compactionThreshold !==
                                undefined
                            "
                        >
                            {{
                                formatNumber(
                                    tokenUsage.usage.remainingBeforeCompaction
                                )
                            }}
                            tokens until compaction
                        </template>
                        <template v-else>
                            {{
                                formatNumber(tokenUsage.usage.remainingContext)
                            }}
                            tokens of context left
                        </template>
                    </span>
                    <span class="token-node">Node {{ tokenUsage.nodeId }}</span>
                </div>
            </div>
            <div v-if="Object.keys(nodeStatuses).length > 0" class="node-chips">
                <span
                    v-for="(status, nodeId) in nodeStatuses"
                    :key="nodeId"
                    class="node-chip"
                    :class="status"
                    :title="nodeId"
                >
                    <span class="chip-dot"></span>
                    {{ getNodeDisplayName(nodeId as string) }}
                </span>
            </div>
        </div>

        <!-- Messages Area -->
        <div ref="messagesContainer" class="messages-area">
            <!-- Empty State -->
            <div
                v-if="messages.length === 0 && !streamingContent"
                class="empty-state"
            >
                <div class="empty-icon-wrapper">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        class="empty-icon"
                    >
                        <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                        <circle cx="12" cy="5" r="2"></circle>
                        <path d="M12 7v4"></path>
                    </svg>
                </div>
                <h4 class="empty-title">Send a message to run the workflow</h4>
                <p class="empty-description">
                    Your message will flow through the workflow nodes and
                    generate a response.
                </p>
            </div>

            <!-- Message List -->
            <template v-else>
                <div
                    v-for="msg in messages"
                    :key="msg.id"
                    class="message"
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
                            <path
                                d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
                            ></path>
                        </svg>
                    </div>
                    <div class="message-content">
                        <div class="message-bubble">{{ msg.content }}</div>
                        <div v-if="msg.nodeId" class="message-meta">
                            via <span class="node-name">{{ msg.nodeId }}</span>
                        </div>
                    </div>
                </div>

                <!-- Parallel Branch Streams -->
                <div v-if="hasActiveBranches" class="parallel-branches">
                    <div class="branches-header">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="branches-icon"
                        >
                            <path d="M6 3v12"></path>
                            <circle cx="18" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <path d="M18 9a9 9 0 0 1-9 9"></path>
                        </svg>
                        <span>Parallel Branches</span>
                    </div>
                    <div
                        v-for="(branch, key) in branchStreams"
                        :key="key"
                        class="branch-item"
                        :class="{
                            expanded: branch.expanded,
                            [branch.status]: true,
                        }"
                    >
                        <button
                            class="branch-header"
                            @click="emit('toggleBranch', key as string)"
                        >
                            <svg
                                class="branch-chevron"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                            <span class="branch-label">{{ branch.label }}</span>
                            <span class="branch-status-dot"></span>
                            <span
                                v-if="branch.status === 'streaming'"
                                class="branch-status-text"
                                >streaming...</span
                            >
                            <span v-else class="branch-status-text">done</span>
                        </button>
                        <div v-show="branch.expanded" class="branch-content">
                            <div class="branch-text">
                                {{ branch.content
                                }}<span
                                    v-if="branch.status === 'streaming'"
                                    class="typing-cursor"
                                ></span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Streaming Message -->
                <div
                    v-if="streamingContent"
                    class="message assistant streaming"
                >
                    <div class="message-avatar">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
                            ></path>
                        </svg>
                    </div>
                    <div class="message-content">
                        <div class="message-bubble">
                            {{ streamingContent
                            }}<span class="typing-cursor"></span>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <!-- Input Area -->
        <div class="input-area">
            <div class="input-wrapper">
                <textarea
                    :value="chatInput"
                    placeholder="Type a message..."
                    :disabled="isRunning"
                    rows="1"
                    @input="
                        emit(
                            'update:chatInput',
                            ($event.target as HTMLTextAreaElement).value
                        )
                    "
                    @keydown.enter.exact.prevent="
                        !isRunning && chatInput?.trim() && emit('send')
                    "
                    @keydown.enter.shift.exact=""
                ></textarea>
                <button
                    class="send-btn"
                    :disabled="!chatInput?.trim() || isRunning"
                    @click="emit('send')"
                >
                    <svg
                        v-if="isRunning"
                        class="spinner"
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
                    >
                        <path d="M22 2L11 13"></path>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
            <p class="input-hint">
                Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new
                line
            </p>
        </div>
    </aside>
</template>

<style scoped>
.chat-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 360px;
    min-width: 320px;
    max-width: 480px;
    background: var(--or3-color-bg-secondary, #111115);
    border-left: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    overflow: hidden;
}

/* Header */
.chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-md, 12px) var(--or3-spacing-lg, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    flex-shrink: 0;
}

.chat-title {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.chat-title h3 {
    font-size: var(--or3-text-md, 14px);
    font-weight: var(--or3-font-semibold, 600);
    margin: 0;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.chat-icon {
    width: 18px;
    height: 18px;
    color: var(--or3-color-accent, #8b5cf6);
}

.clear-btn {
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-medium, 500);
    padding: 4px 10px;
    border-radius: var(--or3-radius-sm, 6px);
    background: transparent;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    border: none;
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.clear-btn:hover {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
}

/* Status Bar */
.status-bar {
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-lg, 16px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    flex-shrink: 0;
}

.status-content {
    display: flex;
    align-items: center;
    margin-bottom: var(--or3-spacing-sm, 8px);
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.status-indicator.running {
    color: var(--or3-color-accent, #8b5cf6);
}

.spinner {
    width: 14px;
    height: 14px;
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

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.status-dot.completed {
    background: var(--or3-color-success, #10b981);
}

.node-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-xs, 4px);
}

.node-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border-radius: var(--or3-radius-full, 9999px);
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.node-chip .chip-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
}

.node-chip.active {
    background: var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
    color: var(--or3-color-accent, #8b5cf6);
}

.node-chip.completed {
    background: var(--or3-color-success-subtle, rgba(16, 185, 129, 0.08));
    color: var(--or3-color-success, #10b981);
}

.node-chip.error {
    background: var(--or3-color-error-subtle, rgba(239, 68, 68, 0.08));
    color: var(--or3-color-error, #ef4444);
}

.token-usage-card {
    margin-top: var(--or3-spacing-xs, 6px);
    padding: 12px 14px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0f172a, #0b2f3a);
    border: 1px solid rgba(59, 130, 246, 0.25);
    color: #e5e7eb;
}

.token-usage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}

.token-usage-title {
    font-size: var(--or3-text-sm, 13px);
    font-weight: 600;
    letter-spacing: 0.01em;
}

.token-model {
    font-size: var(--or3-text-xs, 11px);
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.15);
    color: #93c5fd;
}

.token-usage-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--or3-text-xs, 11px);
    color: rgba(229, 231, 235, 0.85);
}

.token-usage-row.secondary {
    margin-top: 4px;
    color: rgba(229, 231, 235, 0.7);
}

.token-usage-value {
    font-weight: 600;
    color: #a5f3fc;
}

.token-node {
    font-weight: 600;
    color: #7dd3fc;
}

/* Messages Area */
.messages-area {
    flex: 1;
    overflow-y: auto;
    padding: var(--or3-spacing-lg, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-lg, 16px);
}

/* Empty State */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: var(--or3-spacing-xl, 24px);
}

.empty-icon-wrapper {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-lg, 12px);
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.empty-icon {
    width: 28px;
    height: 28px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.empty-title {
    font-size: var(--or3-text-md, 14px);
    font-weight: var(--or3-font-medium, 500);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    margin: 0 0 var(--or3-spacing-sm, 8px) 0;
}

.empty-description {
    font-size: var(--or3-text-sm, 12px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
    max-width: 240px;
    line-height: var(--or3-leading-relaxed, 1.65);
}

/* Messages */
.message {
    display: flex;
    gap: var(--or3-spacing-sm, 8px);
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.message-avatar {
    width: 28px;
    height: 28px;
    border-radius: var(--or3-radius-sm, 6px);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.message-avatar svg {
    width: 14px;
    height: 14px;
}

.message.user .message-avatar {
    background: var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
    color: var(--or3-color-accent, #8b5cf6);
}

.message.assistant .message-avatar {
    background: var(--or3-color-success-subtle, rgba(16, 185, 129, 0.08));
    color: var(--or3-color-success, #10b981);
}

.message-content {
    flex: 1;
    min-width: 0;
}

.message-bubble {
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    border-radius: var(--or3-radius-md, 8px);
    font-size: var(--or3-text-base, 13px);
    line-height: var(--or3-leading-relaxed, 1.65);
    white-space: pre-wrap;
    word-break: break-word;
}

.message.user .message-bubble {
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.message.assistant .message-bubble {
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.message-meta {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    margin-top: var(--or3-spacing-xs, 4px);
    padding-left: var(--or3-spacing-md, 12px);
}

.node-name {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

/* Typing cursor */
.typing-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--or3-color-accent, #8b5cf6);
    margin-left: 2px;
    animation: blink 1s step-end infinite;
    vertical-align: text-bottom;
}

@keyframes blink {
    50% {
        opacity: 0;
    }
}

/* Parallel Branch Streams */
.parallel-branches {
    margin: var(--or3-spacing-md, 12px) var(--or3-spacing-lg, 16px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.04));
    border-radius: var(--or3-radius-md, 8px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    overflow: hidden;
}

.branches-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    background: var(--or3-color-bg-tertiary, rgba(0, 0, 0, 0.2));
}

.branches-icon {
    width: 14px;
    height: 14px;
}

.branch-item {
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.06));
}

.branch-item:last-child {
    border-bottom: none;
}

.branch-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    width: 100%;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    font-size: var(--or3-text-sm, 12px);
    text-align: left;
    transition: background var(--or3-transition-fast, 120ms);
}

.branch-header:hover {
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
}

.branch-chevron {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: transform var(--or3-transition-fast, 120ms);
}

.branch-item.expanded .branch-chevron {
    transform: rotate(90deg);
}

.branch-label {
    flex: 1;
    font-weight: var(--or3-font-medium, 500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.branch-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.branch-item.streaming .branch-status-dot {
    background: var(--or3-color-accent, #8b5cf6);
    animation: pulse-dot 1.5s ease-in-out infinite;
}

.branch-item.completed .branch-status-dot {
    background: var(--or3-color-success, #22c55e);
}

.branch-item.error .branch-status-dot {
    background: var(--or3-color-error, #ef4444);
}

@keyframes pulse-dot {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.4;
    }
}

.branch-status-text {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.branch-content {
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    padding-left: calc(var(--or3-spacing-md, 12px) + 22px);
    background: var(--or3-color-bg-tertiary, rgba(0, 0, 0, 0.15));
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.06));
}

.branch-text {
    font-size: var(--or3-text-sm, 12px);
    line-height: 1.6;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
}

/* Input Area */
.input-area {
    padding: var(--or3-spacing-md, 12px) var(--or3-spacing-lg, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    flex-shrink: 0;
}

.input-wrapper {
    display: flex;
    gap: var(--or3-spacing-sm, 8px);
    align-items: flex-end;
}

.input-wrapper textarea {
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    padding: 10px var(--or3-spacing-md, 12px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 8px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: var(--or3-text-base, 13px);
    font-family: inherit;
    line-height: var(--or3-leading-normal, 1.5);
    resize: none;
    transition: all var(--or3-transition-fast, 120ms);
}

.input-wrapper textarea::placeholder {
    color: var(--or3-color-text-placeholder, rgba(255, 255, 255, 0.38));
}

.input-wrapper textarea:hover:not(:disabled) {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.12));
}

.input-wrapper textarea:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px
        var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
}

.input-wrapper textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.send-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(
        --or3-gradient-accent,
        linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)
    );
    border: none;
    border-radius: var(--or3-radius-md, 8px);
    color: white;
    cursor: pointer;
    flex-shrink: 0;
    transition: all var(--or3-transition-fast, 120ms);
}

.send-btn:hover:not(:disabled) {
    box-shadow: var(--or3-shadow-glow, 0 0 24px rgba(139, 92, 246, 0.25));
    transform: scale(1.02);
}

.send-btn:active:not(:disabled) {
    transform: scale(0.98);
}

.send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--or3-color-bg-tertiary, #18181d);
    box-shadow: none;
}

.send-btn svg {
    width: 16px;
    height: 16px;
}

.input-hint {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    margin: var(--or3-spacing-sm, 8px) 0 0 0;
    text-align: center;
}

.input-hint kbd {
    display: inline-block;
    padding: 1px 4px;
    font-family: inherit;
    font-size: 10px;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-xs, 4px);
}

/* Responsive */
@media (max-width: 768px) {
    .chat-panel {
        width: 100%;
        max-width: none;
    }

    .input-hint {
        display: none;
    }
}
</style>
