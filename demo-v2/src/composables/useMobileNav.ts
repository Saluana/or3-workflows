import { ref, onMounted, onUnmounted, type Ref } from 'vue';

interface MobileNavOptions {
    showChatPanel?: Ref<boolean>;
    showLeftSidebar?: Ref<boolean>;
}

export function useMobileNav(options: MobileNavOptions = {}) {
    const isMobile = ref(false);
    const mobileView = ref<'editor' | 'chat'>('editor');
    const showMobileMenu = ref(false);

    function checkMobile(): void {
        isMobile.value = window.innerWidth <= 768;
        if (isMobile.value) {
            if (options.showChatPanel) {
                options.showChatPanel.value = mobileView.value === 'chat';
            }
            if (options.showLeftSidebar) {
                options.showLeftSidebar.value = false;
            }
        } else {
            if (options.showLeftSidebar) {
                options.showLeftSidebar.value = true;
            }
        }
    }

    function toggleMobileView(view: 'editor' | 'chat'): void {
        mobileView.value = view;
        if (options.showChatPanel) {
            options.showChatPanel.value = view === 'chat';
        }
        showMobileMenu.value = false;
    }

    onMounted(() => {
        checkMobile();
        window.addEventListener('resize', checkMobile);
    });

    onUnmounted(() => {
        window.removeEventListener('resize', checkMobile);
    });

    return {
        isMobile,
        mobileView,
        showMobileMenu,
        toggleMobileView,
    };
}
