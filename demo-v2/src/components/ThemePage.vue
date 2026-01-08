<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import ColorSection from './theme/ColorSection.vue';

defineProps<{
    show: boolean;
}>();

const emit = defineEmits<{
    close: [];
}>();

// Theme state
interface ThemeColors {
    // Background colors
    '--or3-color-bg-primary': string;
    '--or3-color-bg-secondary': string;
    '--or3-color-bg-tertiary': string;
    '--or3-color-bg-elevated': string;
    // Surface colors
    '--or3-color-surface': string;
    '--or3-color-surface-hover': string;
    '--or3-color-surface-glass': string;
    '--or3-color-surface-subtle': string;
    // Border colors
    '--or3-color-border': string;
    '--or3-color-border-hover': string;
    '--or3-color-border-active': string;
    '--or3-color-border-subtle': string;
    // Text colors
    '--or3-color-text-primary': string;
    '--or3-color-text-secondary': string;
    '--or3-color-text-muted': string;
    '--or3-color-text-placeholder': string;
    // Accent colors
    '--or3-color-accent': string;
    '--or3-color-accent-hover': string;
    '--or3-color-accent-active': string;
    '--or3-color-accent-muted': string;
    '--or3-color-accent-subtle': string;
    // Status colors
    '--or3-color-success': string;
    '--or3-color-success-hover': string;
    '--or3-color-success-muted': string;
    '--or3-color-success-subtle': string;
    '--or3-color-warning': string;
    '--or3-color-warning-hover': string;
    '--or3-color-warning-muted': string;
    '--or3-color-warning-subtle': string;
    '--or3-color-error': string;
    '--or3-color-error-hover': string;
    '--or3-color-error-muted': string;
    '--or3-color-error-subtle': string;
    '--or3-color-info': string;
    '--or3-color-info-hover': string;
    '--or3-color-info-muted': string;
    '--or3-color-info-subtle': string;
}

const themeColors = ref<ThemeColors>({} as ThemeColors);
const searchQuery = ref('');

// Filter sections based on search query
const shouldShowSection = (colors: Record<string, string>): boolean => {
    if (!searchQuery.value.trim()) return true;
    const query = searchQuery.value.toLowerCase();
    return Object.keys(colors).some(key => {
        const label = formatLabel(key);
        return label.toLowerCase().includes(query) || key.toLowerCase().includes(query);
    });
};

// Format key into readable label
function formatLabel(key: string): string {
    return key
        .replace(/^--or3-color-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

// Get current CSS variable value
function getCSSVariable(variable: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variable)
        .trim();
}

// Load current theme values
function loadCurrentTheme() {
    const keys = [
        '--or3-color-bg-primary',
        '--or3-color-bg-secondary',
        '--or3-color-bg-tertiary',
        '--or3-color-bg-elevated',
        '--or3-color-surface',
        '--or3-color-surface-hover',
        '--or3-color-surface-glass',
        '--or3-color-surface-subtle',
        '--or3-color-border',
        '--or3-color-border-hover',
        '--or3-color-border-active',
        '--or3-color-border-subtle',
        '--or3-color-text-primary',
        '--or3-color-text-secondary',
        '--or3-color-text-muted',
        '--or3-color-text-placeholder',
        '--or3-color-accent',
        '--or3-color-accent-hover',
        '--or3-color-accent-active',
        '--or3-color-accent-muted',
        '--or3-color-accent-subtle',
        '--or3-color-success',
        '--or3-color-success-hover',
        '--or3-color-success-muted',
        '--or3-color-success-subtle',
        '--or3-color-warning',
        '--or3-color-warning-hover',
        '--or3-color-warning-muted',
        '--or3-color-warning-subtle',
        '--or3-color-error',
        '--or3-color-error-hover',
        '--or3-color-error-muted',
        '--or3-color-error-subtle',
        '--or3-color-info',
        '--or3-color-info-hover',
        '--or3-color-info-muted',
        '--or3-color-info-subtle',
    ] as const;

    const colors: Partial<ThemeColors> = {};
    keys.forEach((key) => {
        colors[key] = getCSSVariable(key);
    });
    themeColors.value = colors as ThemeColors;
}

// Update CSS variable
function updateCSSVariable(variable: string, value: string) {
    document.documentElement.style.setProperty(variable, value);
}

// Watch for color changes and apply them
watch(
    themeColors,
    (newColors) => {
        Object.entries(newColors).forEach(([key, value]) => {
            if (value) {
                updateCSSVariable(key, value);
            }
        });
        // Save to localStorage
        localStorage.setItem('or3-custom-theme', JSON.stringify(newColors));
    },
    { deep: true }
);

// Update a specific color
function updateColor(key: string, value: string) {
    themeColors.value = {
        ...themeColors.value,
        [key]: value,
    };
}

// Reset to defaults
function resetToDefaults() {
    // Using browser confirm for now - consider custom modal in future
    if (
        confirm(
            'Are you sure you want to reset all colors to their default values? This cannot be undone.'
        )
    ) {
        localStorage.removeItem('or3-custom-theme');
        // Remove all custom properties
        Object.keys(themeColors.value).forEach((key) => {
            document.documentElement.style.removeProperty(key);
        });
        // Reload current theme
        loadCurrentTheme();
    }
}

// Export theme
function exportTheme() {
    const themeData = {
        version: '1.0.0',
        colors: themeColors.value,
        exportedAt: new Date().toISOString(),
    };
    const dataStr = JSON.stringify(themeData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `or3-theme-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

// Import theme
function importTheme(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target?.result as string);
            
            // Validate structure
            if (!data.colors || typeof data.colors !== 'object') {
                alert('Invalid theme file: Missing or invalid "colors" property. Expected a JSON object with a "colors" key containing color definitions.');
                return;
            }
            
            // Validate that imported colors match expected keys
            const validKeys = Object.keys(themeColors.value);
            const importedKeys = Object.keys(data.colors);
            const invalidKeys = importedKeys.filter(key => !validKeys.includes(key));
            
            if (invalidKeys.length > 0) {
                console.warn('Theme file contains unrecognized color keys:', invalidKeys);
            }
            
            // Filter to only valid keys and apply
            const validColors: Partial<ThemeColors> = {};
            importedKeys.forEach(key => {
                if (validKeys.includes(key) && typeof data.colors[key] === 'string') {
                    validColors[key as keyof ThemeColors] = data.colors[key];
                }
            });
            
            if (Object.keys(validColors).length === 0) {
                alert('Invalid theme file: No valid color definitions found. Theme file should contain CSS color values for or3 theme tokens.');
                return;
            }
            
            themeColors.value = { ...themeColors.value, ...validColors };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            alert(`Failed to import theme: ${errorMsg}\n\nExpected JSON format:\n{\n  "colors": {\n    "--or3-color-accent": "#8b5cf6",\n    ...\n  }\n}`);
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// Initialize on mount
onMounted(() => {
    // Try to load saved theme
    const saved = localStorage.getItem('or3-custom-theme');
    if (saved) {
        try {
            const savedColors = JSON.parse(saved);
            themeColors.value = savedColors;
            // Apply saved colors
            Object.entries(savedColors).forEach(([key, value]) => {
                updateCSSVariable(key, value as string);
            });
        } catch (error) {
            console.error('Failed to load saved theme:', error);
        }
    }
    // Load current values
    loadCurrentTheme();
});

// Organized color sections
const backgroundColors = computed(() => {
    return {
        '--or3-color-bg-primary': themeColors.value['--or3-color-bg-primary'],
        '--or3-color-bg-secondary': themeColors.value['--or3-color-bg-secondary'],
        '--or3-color-bg-tertiary': themeColors.value['--or3-color-bg-tertiary'],
        '--or3-color-bg-elevated': themeColors.value['--or3-color-bg-elevated'],
    };
});

const surfaceColors = computed(() => {
    return {
        '--or3-color-surface': themeColors.value['--or3-color-surface'],
        '--or3-color-surface-hover': themeColors.value['--or3-color-surface-hover'],
        '--or3-color-surface-glass': themeColors.value['--or3-color-surface-glass'],
        '--or3-color-surface-subtle': themeColors.value['--or3-color-surface-subtle'],
    };
});

const borderColors = computed(() => {
    return {
        '--or3-color-border': themeColors.value['--or3-color-border'],
        '--or3-color-border-hover': themeColors.value['--or3-color-border-hover'],
        '--or3-color-border-active': themeColors.value['--or3-color-border-active'],
        '--or3-color-border-subtle': themeColors.value['--or3-color-border-subtle'],
    };
});

const textColors = computed(() => {
    return {
        '--or3-color-text-primary': themeColors.value['--or3-color-text-primary'],
        '--or3-color-text-secondary': themeColors.value['--or3-color-text-secondary'],
        '--or3-color-text-muted': themeColors.value['--or3-color-text-muted'],
        '--or3-color-text-placeholder': themeColors.value['--or3-color-text-placeholder'],
    };
});

const accentColors = computed(() => {
    return {
        '--or3-color-accent': themeColors.value['--or3-color-accent'],
        '--or3-color-accent-hover': themeColors.value['--or3-color-accent-hover'],
        '--or3-color-accent-active': themeColors.value['--or3-color-accent-active'],
        '--or3-color-accent-muted': themeColors.value['--or3-color-accent-muted'],
        '--or3-color-accent-subtle': themeColors.value['--or3-color-accent-subtle'],
    };
});

const successColors = computed(() => {
    return {
        '--or3-color-success': themeColors.value['--or3-color-success'],
        '--or3-color-success-hover': themeColors.value['--or3-color-success-hover'],
        '--or3-color-success-muted': themeColors.value['--or3-color-success-muted'],
        '--or3-color-success-subtle': themeColors.value['--or3-color-success-subtle'],
    };
});

const warningColors = computed(() => {
    return {
        '--or3-color-warning': themeColors.value['--or3-color-warning'],
        '--or3-color-warning-hover': themeColors.value['--or3-color-warning-hover'],
        '--or3-color-warning-muted': themeColors.value['--or3-color-warning-muted'],
        '--or3-color-warning-subtle': themeColors.value['--or3-color-warning-subtle'],
    };
});

const errorColors = computed(() => {
    return {
        '--or3-color-error': themeColors.value['--or3-color-error'],
        '--or3-color-error-hover': themeColors.value['--or3-color-error-hover'],
        '--or3-color-error-muted': themeColors.value['--or3-color-error-muted'],
        '--or3-color-error-subtle': themeColors.value['--or3-color-error-subtle'],
    };
});

const infoColors = computed(() => {
    return {
        '--or3-color-info': themeColors.value['--or3-color-info'],
        '--or3-color-info-hover': themeColors.value['--or3-color-info-hover'],
        '--or3-color-info-muted': themeColors.value['--or3-color-info-muted'],
        '--or3-color-info-subtle': themeColors.value['--or3-color-info-subtle'],
    };
});

// Check if any sections are visible after filtering
const hasVisibleSections = computed(() => {
    if (!searchQuery.value.trim()) return true;
    return (
        shouldShowSection(backgroundColors.value) ||
        shouldShowSection(surfaceColors.value) ||
        shouldShowSection(borderColors.value) ||
        shouldShowSection(textColors.value) ||
        shouldShowSection(accentColors.value) ||
        shouldShowSection(successColors.value) ||
        shouldShowSection(warningColors.value) ||
        shouldShowSection(errorColors.value) ||
        shouldShowSection(infoColors.value)
    );
});
</script>

<template>
    <Transition name="modal">
        <div v-if="show" class="modal-overlay" @click.self="emit('close')">
            <div class="modal theme-modal">
                <!-- Header -->
                <div class="modal-header">
                    <div class="header-main">
                        <div class="modal-icon">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
                                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
                                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
                                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
                                <path
                                    d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z"
                                ></path>
                            </svg>
                        </div>
                        <div>
                            <h2>Theme Settings</h2>
                            <p class="modal-subtitle">Customize the appearance of your workflow editor</p>
                        </div>
                    </div>
                    <button class="close-btn" @click="emit('close')" title="Close">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Search and Actions -->
                <div class="modal-toolbar">
                    <div class="search-box">
                        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Search colors..."
                            class="search-input"
                        />
                    </div>
                    <div class="toolbar-actions">
                        <button class="btn btn-ghost btn-sm" @click="resetToDefaults">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                <path d="M21 3v5h-5"></path>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                <path d="M8 16H3v5"></path>
                            </svg>
                            Reset
                        </button>
                        <button class="btn btn-ghost btn-sm" @click="exportTheme">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" x2="12" y1="15" y2="3"></line>
                            </svg>
                            Export
                        </button>
                        <label class="btn btn-ghost btn-sm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" x2="12" y1="3" y2="15"></line>
                            </svg>
                            Import
                            <input
                                type="file"
                                accept=".json"
                                class="sr-only"
                                @change="importTheme"
                            />
                        </label>
                    </div>
                </div>

                <!-- Content -->
                <div class="modal-content">
                    <div class="sections-container">
                        <ColorSection
                            v-if="shouldShowSection(backgroundColors)"
                            title="Background Colors"
                            description="Main background colors for different surfaces"
                            :colors="backgroundColors"
                            @update:color="updateColor"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(surfaceColors)"
                            title="Surface Colors"
                            description="Glass effects and layered surfaces"
                            :colors="surfaceColors"
                            @update:color="updateColor"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(borderColors)"
                            title="Border Colors"
                            description="Borders, dividers, and separators"
                            :colors="borderColors"
                            @update:color="updateColor"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(textColors)"
                            title="Text Colors"
                            description="Typography colors for different text hierarchies"
                            :colors="textColors"
                            @update:color="updateColor"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(accentColors)"
                            title="Accent Colors"
                            description="Primary brand colors and interactive elements"
                            :colors="accentColors"
                            @update:color="updateColor"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(successColors)"
                            title="Success Colors"
                            description="Positive states, confirmations, and completions"
                            :colors="successColors"
                            @update:color="updateColor"
                            :expanded="false"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(warningColors)"
                            title="Warning Colors"
                            description="Cautions, alerts, and important notices"
                            :colors="warningColors"
                            @update:color="updateColor"
                            :expanded="false"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(errorColors)"
                            title="Error Colors"
                            description="Errors, failures, and destructive actions"
                            :colors="errorColors"
                            @update:color="updateColor"
                            :expanded="false"
                        />
                        
                        <ColorSection
                            v-if="shouldShowSection(infoColors)"
                            title="Info Colors"
                            description="Informational states and neutral alerts"
                            :colors="infoColors"
                            @update:color="updateColor"
                            :expanded="false"
                        />
                        
                        <div v-if="searchQuery.trim() && !hasVisibleSections" class="no-results">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                            <p>No colors match "{{ searchQuery }}"</p>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="modal-footer">
                    <p class="footer-note">
                        Changes are saved automatically and applied in real-time
                    </p>
                    <button class="btn btn-primary" @click="emit('close')">Done</button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--or3-spacing-lg, 16px);
}

.theme-modal {
    background: var(--or3-color-bg-primary, #09090c);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-xl, 16px);
    width: 900px;
    max-width: 95vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--or3-shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.5));
    overflow: hidden;
}

.modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--or3-spacing-xl, 24px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    gap: var(--or3-spacing-lg, 16px);
}

.header-main {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-lg, 16px);
    flex: 1;
    min-width: 0;
}

.modal-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
    border-radius: var(--or3-radius-md, 12px);
    flex-shrink: 0;
}

.modal-icon svg {
    width: 24px;
    height: 24px;
    color: var(--or3-color-accent, #8b5cf6);
}

.modal-header h2 {
    margin: 0 0 var(--or3-spacing-2xs, 2px) 0;
    font-size: var(--or3-text-xl, 18px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.modal-subtitle {
    margin: 0;
    font-size: var(--or3-text-sm, 12px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--or3-radius-sm, 6px);
    border: none;
    background: transparent;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
    flex-shrink: 0;
}

.close-btn:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.close-btn svg {
    width: 18px;
    height: 18px;
}

.modal-toolbar {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 12px);
    padding: var(--or3-spacing-lg, 16px) var(--or3-spacing-xl, 24px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    background: var(--or3-color-bg-secondary, #111115);
}

.search-box {
    flex: 1;
    position: relative;
    min-width: 0;
}

.search-icon {
    position: absolute;
    left: var(--or3-spacing-md, 12px);
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    pointer-events: none;
}

.search-input {
    width: 100%;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px) var(--or3-spacing-sm, 8px)
        40px;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 8px);
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: var(--or3-text-sm, 12px);
    transition: all var(--or3-transition-fast, 120ms);
}

.search-input:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
}

.toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.modal-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--or3-spacing-xl, 24px);
    min-height: 0;
}

.sections-container {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-lg, 16px);
}

.no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--or3-spacing-3xl, 48px) var(--or3-spacing-xl, 24px);
    text-align: center;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.no-results svg {
    width: 48px;
    height: 48px;
    margin-bottom: var(--or3-spacing-lg, 16px);
    opacity: 0.5;
}

.no-results p {
    margin: 0;
    font-size: var(--or3-text-sm, 12px);
}

.modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-lg, 16px) var(--or3-spacing-xl, 24px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    background: var(--or3-color-bg-secondary, #111115);
}

.footer-note {
    margin: 0;
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--or3-spacing-sm, 6px);
    padding: var(--or3-spacing-sm, 10px) var(--or3-spacing-lg, 16px);
    border: none;
    border-radius: var(--or3-radius-md, 8px);
    font-size: var(--or3-text-sm, 12px);
    font-weight: var(--or3-font-semibold, 600);
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
    white-space: nowrap;
}

.btn svg {
    width: 14px;
    height: 14px;
}

.btn-ghost {
    background: transparent;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.btn-ghost:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.btn-sm {
    padding: var(--or3-spacing-xs, 6px) var(--or3-spacing-md, 12px);
}

.btn-primary {
    background: var(--or3-color-accent, #8b5cf6);
    color: white;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}

.btn-primary:hover {
    background: var(--or3-color-accent-hover, #a78bfa);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.2s ease;
}

.modal-enter-active .theme-modal,
.modal-leave-active .theme-modal {
    transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from .theme-modal,
.modal-leave-to .theme-modal {
    transform: translateY(16px) scale(0.98);
    opacity: 0;
}

/* Responsive */
@media (max-width: 768px) {
    .theme-modal {
        width: 100%;
        max-width: 100%;
        max-height: 100vh;
        border-radius: 0;
    }

    .modal-toolbar {
        flex-direction: column;
        align-items: stretch;
    }

    .toolbar-actions {
        justify-content: space-between;
    }

    .modal-footer {
        flex-direction: column;
        gap: var(--or3-spacing-md, 12px);
        align-items: stretch;
    }

    .btn {
        width: 100%;
    }
}
</style>
