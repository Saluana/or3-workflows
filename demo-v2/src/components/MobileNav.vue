<script setup lang="ts">
// Props interface
interface Props {
    mobileView: 'editor' | 'chat';
    messageCount: number;
    hasApiKey: boolean;
    showMenu: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
    (e: 'toggle-view', view: 'editor' | 'chat'): void;
    (e: 'update:showMenu', value: boolean): void;
    (e: 'undo'): void;
    (e: 'redo'): void;
    (e: 'save'): void;
    (e: 'load'): void;
    (e: 'export'): void;
    (e: 'open-api-key'): void;
}>();
</script>

<template>
    <!-- Mobile Bottom Navigation -->
    <nav class="mobile-nav">
        <button
            class="mobile-nav-btn"
            :class="{ active: mobileView === 'editor' }"
            @click="emit('toggle-view', 'editor')"
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span>Editor</span>
        </button>
        <button
            class="mobile-nav-btn"
            :class="{ active: mobileView === 'chat' }"
            @click="emit('toggle-view', 'chat')"
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
            </svg>
            <span>Chat</span>
            <span v-if="messageCount > 0" class="nav-badge">{{
                messageCount
            }}</span>
        </button>
        <button
            class="mobile-nav-btn"
            @click="emit('update:showMenu', !showMenu)"
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
            <span>More</span>
        </button>
    </nav>

    <!-- Mobile Menu Overlay -->
    <Transition name="slide-up">
        <div
            v-if="showMenu"
            class="mobile-menu-overlay"
            @click.self="emit('update:showMenu', false)"
        >
            <div class="mobile-menu">
                <div class="mobile-menu-header">
                    <span>Actions</span>
                    <button
                        class="btn btn-ghost"
                        @click="emit('update:showMenu', false)"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="mobile-menu-items">
                    <button
                        class="mobile-menu-item"
                        @click="
                            emit('undo');
                            emit('update:showMenu', false);
                        "
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <path d="M3 7v6h6"></path>
                            <path
                                d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
                            ></path>
                        </svg>
                        <span>Undo</span>
                    </button>
                    <button
                        class="mobile-menu-item"
                        @click="
                            emit('redo');
                            emit('update:showMenu', false);
                        "
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <path d="M21 7v6h-6"></path>
                            <path
                                d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"
                            ></path>
                        </svg>
                        <span>Redo</span>
                    </button>
                    <div class="mobile-menu-divider"></div>
                    <button
                        class="mobile-menu-item"
                        @click="
                            emit('save');
                            emit('update:showMenu', false);
                        "
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <path
                                d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                            ></path>
                            <path
                                d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
                            ></path>
                            <path d="M7 3v4a1 1 0 0 0 1 1h7"></path>
                        </svg>
                        <span>Save Workflow</span>
                    </button>
                    <button
                        class="mobile-menu-item"
                        @click="
                            emit('load');
                            emit('update:showMenu', false);
                        "
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <path
                                d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
                            ></path>
                        </svg>
                        <span>Load Workflow</span>
                    </button>
                    <button
                        class="mobile-menu-item"
                        @click="
                            emit('export');
                            emit('update:showMenu', false);
                        "
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <path
                                d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                            ></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" x2="12" y1="15" y2="3"></line>
                        </svg>
                        <span>Export JSON</span>
                    </button>
                    <div class="mobile-menu-divider"></div>
                    <button
                        class="mobile-menu-item"
                        @click="
                            emit('open-api-key');
                            emit('update:showMenu', false);
                        "
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <path
                                d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
                            ></path>
                        </svg>
                        <span>{{
                            hasApiKey ? 'Change API Key' : 'Set API Key'
                        }}</span>
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* Mobile Navigation */
.mobile-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--or3-color-bg-secondary, #111115);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    padding-bottom: calc(var(--or3-spacing-sm, 8px) + env(safe-area-inset-bottom, 0));
    z-index: 200;
    justify-content: space-around;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.35);
}

.mobile-nav-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: none;
    border: none;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-medium, 500);
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
    border-radius: var(--or3-radius-md, 10px);
    position: relative;
}

.mobile-nav-btn:hover,
.mobile-nav-btn.active {
    color: var(--or3-color-accent, #8b5cf6);
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
}

.mobile-nav-btn svg {
    width: 22px;
    height: 22px;
}

.nav-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    width: 8px;
    height: 8px;
    background: var(--or3-color-accent, #8b5cf6);
    border-radius: 50%;
    box-shadow: 0 0 8px var(--or3-color-accent, #8b5cf6);
}

/* Mobile Menu Overlay */
.mobile-menu-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 300;
    animation: fadeIn 0.2s ease;
}

.mobile-menu {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--or3-color-bg-secondary, #111115);
    border-radius: var(--or3-radius-xl, 20px) var(--or3-radius-xl, 20px) 0 0;
    padding: var(--or3-spacing-xl, 24px);
    padding-bottom: calc(var(--or3-spacing-2xl, 32px) + env(safe-area-inset-bottom, 0));
    z-index: 301;
    max-height: 78vh;
    overflow-y: auto;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.4);
}

.mobile-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--or3-spacing-lg, 16px);
    margin-bottom: var(--or3-spacing-lg, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    font-size: var(--or3-text-base, 14px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.mobile-menu-items {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.mobile-menu-divider {
    height: 1px;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.12));
    margin: var(--or3-spacing-md, 12px) 0;
}

.mobile-menu-item {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-md, 16px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 10px);
    margin-bottom: var(--or3-spacing-sm, 8px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
    width: 100%;
    text-align: left;
    font-size: var(--or3-text-sm, 13px);
    font-weight: var(--or3-font-medium, 500);
    min-height: 48px;
}

.mobile-menu-item:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    border-color: var(--or3-color-accent, #8b5cf6);
}

.mobile-menu-item svg {
    width: 20px;
    height: 20px;
    color: var(--or3-color-accent, #8b5cf6);
}

.btn-ghost {
    background: transparent;
    border: none;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    padding: 4px;
    border-radius: var(--or3-radius-sm, 6px);
}

.btn-ghost:hover {
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
}

.icon {
    width: 16px;
    height: 16px;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

/* Vue Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
    transition: opacity 0.3s ease;
}

.slide-up-enter-active .mobile-menu,
.slide-up-leave-active .mobile-menu {
    transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    opacity: 0;
}

.slide-up-enter-from .mobile-menu,
.slide-up-leave-to .mobile-menu {
    transform: translateY(100%);
}
</style>
