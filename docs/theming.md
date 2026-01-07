# Theming

Customize the look and feel of or3-workflows using CSS variables.

## Overview

or3-workflows uses CSS custom properties (variables) for theming. Override these variables to match your application's design system.

## Default Theme

The default theme is a dark, premium glassmorphism design:

```css
@import 'or3-workflow-vue/style.css';
```

## CSS Variables

### Colors

#### Background Colors

```css
:root {
    --or3-color-bg-primary: #0a0a0f; /* Main background */
    --or3-color-bg-secondary: #12121a; /* Panels, sidebars */
    --or3-color-bg-tertiary: #1a1a24; /* Elevated surfaces */
    --or3-color-bg-elevated: #22222e; /* Cards, modals */
}
```

#### Surface Colors

```css
:root {
    --or3-color-surface: rgba(26, 26, 36, 0.8); /* Default surface */
    --or3-color-surface-hover: rgba(34, 34, 46, 0.9); /* Hover state */
    --or3-color-surface-glass: rgba(255, 255, 255, 0.03); /* Glass effect */
}
```

#### Border Colors

```css
:root {
    --or3-color-border: rgba(255, 255, 255, 0.08); /* Default border */
    --or3-color-border-hover: rgba(255, 255, 255, 0.15); /* Hover state */
    --or3-color-border-active: rgba(139, 92, 246, 0.5); /* Active/selected */
}
```

#### Text Colors

```css
:root {
    --or3-color-text-primary: rgba(255, 255, 255, 0.95); /* Main text */
    --or3-color-text-secondary: rgba(255, 255, 255, 0.65); /* Secondary text */
    --or3-color-text-muted: rgba(255, 255, 255, 0.4); /* Muted text */
}
```

#### Accent Colors

```css
:root {
    --or3-color-accent: #8b5cf6; /* Primary accent (purple) */
    --or3-color-accent-hover: #a78bfa; /* Accent hover */
    --or3-color-accent-muted: rgba(139, 92, 246, 0.2); /* Accent background */
}
```

#### Status Colors

```css
:root {
    /* Success (green) */
    --or3-color-success: #22c55e;
    --or3-color-success-muted: rgba(34, 197, 94, 0.2);

    /* Warning (amber) */
    --or3-color-warning: #f59e0b;
    --or3-color-warning-muted: rgba(245, 158, 11, 0.2);

    /* Error (red) */
    --or3-color-error: #ef4444;
    --or3-color-error-muted: rgba(239, 68, 68, 0.2);

    /* Info (blue) */
    --or3-color-info: #3b82f6;
    --or3-color-info-muted: rgba(59, 130, 246, 0.2);
}
```

### Shadows

```css
:root {
    --or3-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --or3-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --or3-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
    --or3-shadow-glow: 0 0 20px rgba(139, 92, 246, 0.3); /* Accent glow */
}
```

### Spacing

```css
:root {
    --or3-spacing-xs: 4px;
    --or3-spacing-sm: 8px;
    --or3-spacing-md: 16px;
    --or3-spacing-lg: 24px;
    --or3-spacing-xl: 32px;
}
```

### Border Radius

```css
:root {
    --or3-radius-sm: 6px;
    --or3-radius-md: 10px;
    --or3-radius-lg: 16px;
    --or3-radius-full: 9999px; /* Fully rounded (pills) */
}
```

### Typography

```css
:root {
    --or3-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        sans-serif;
    --or3-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

### Transitions

```css
:root {
    --or3-transition-fast: 150ms ease;
    --or3-transition-normal: 250ms ease;
}
```

## Light Theme

Create a light theme by overriding the variables:

```css
:root.light-theme,
[data-theme='light'] {
    /* Background */
    --or3-color-bg-primary: #ffffff;
    --or3-color-bg-secondary: #f8f9fa;
    --or3-color-bg-tertiary: #f1f3f5;
    --or3-color-bg-elevated: #ffffff;

    /* Surfaces */
    --or3-color-surface: rgba(255, 255, 255, 0.9);
    --or3-color-surface-hover: rgba(248, 249, 250, 1);
    --or3-color-surface-glass: rgba(0, 0, 0, 0.02);

    /* Borders */
    --or3-color-border: rgba(0, 0, 0, 0.1);
    --or3-color-border-hover: rgba(0, 0, 0, 0.2);
    --or3-color-border-active: rgba(139, 92, 246, 0.5);

    /* Text */
    --or3-color-text-primary: rgba(0, 0, 0, 0.9);
    --or3-color-text-secondary: rgba(0, 0, 0, 0.6);
    --or3-color-text-muted: rgba(0, 0, 0, 0.4);

    /* Shadows */
    --or3-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --or3-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
    --or3-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.15);
    --or3-shadow-glow: 0 0 20px rgba(139, 92, 246, 0.2);
}
```

## Custom Theme Example

### Purple Accent (Default)

The default theme uses purple as the accent:

```css
:root {
    --or3-color-accent: #8b5cf6;
    --or3-color-accent-hover: #a78bfa;
    --or3-color-accent-muted: rgba(139, 92, 246, 0.2);
}
```

### Blue Accent

```css
:root {
    --or3-color-accent: #3b82f6;
    --or3-color-accent-hover: #60a5fa;
    --or3-color-accent-muted: rgba(59, 130, 246, 0.2);
    --or3-shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
}
```

### Green Accent

```css
:root {
    --or3-color-accent: #10b981;
    --or3-color-accent-hover: #34d399;
    --or3-color-accent-muted: rgba(16, 185, 129, 0.2);
    --or3-shadow-glow: 0 0 20px rgba(16, 185, 129, 0.3);
}
```

### Orange Accent

```css
:root {
    --or3-color-accent: #f97316;
    --or3-color-accent-hover: #fb923c;
    --or3-color-accent-muted: rgba(249, 115, 22, 0.2);
    --or3-shadow-glow: 0 0 20px rgba(249, 115, 22, 0.3);
}
```

## Node Status Styling

Nodes display different styles based on execution status:

```css
/* Active node (currently executing) */
.node-status-active {
    border-color: var(--or3-color-accent);
    box-shadow: var(--or3-shadow-glow);
}

/* Completed node */
.node-status-completed {
    border-color: var(--or3-color-success);
}

/* Error node */
.node-status-error {
    border-color: var(--or3-color-error);
}

/* Pending node */
.node-status-pending {
    opacity: 0.7;
}
```

## Node Type Colors

Each node type has a distinctive color:

```css
/* Start node - green */
.node-start {
    --node-accent: var(--or3-color-success);
}

/* Agent node - purple (default) */
.node-agent {
    --node-accent: var(--or3-color-accent);
}

/* Router node - blue */
.node-router {
    --node-accent: var(--or3-color-info);
}

/* Parallel node - amber */
.node-parallel {
    --node-accent: var(--or3-color-warning);
}

/* Tool node - cyan */
.node-tool {
    --node-accent: #06b6d4;
}

/* Memory node - pink */
.node-memory {
    --node-accent: #ec4899;
}

/* While loop - orange */
.node-whileLoop {
    --node-accent: #f97316;
}

/* Output node - green */
.node-output {
    --node-accent: var(--or3-color-success);
}
```

## Component Styling

### Workflow Canvas

```css
.vue-flow {
    background-color: var(--or3-color-bg-primary);
}

.vue-flow__background {
    background-color: var(--or3-color-bg-primary);
}

.vue-flow__background-pattern {
    stroke: var(--or3-color-border);
}
```

### Node Palette

```css
.node-palette {
    background: var(--or3-color-bg-secondary);
    border-right: 1px solid var(--or3-color-border);
}

.node-palette-item {
    background: var(--or3-color-surface);
    border: 1px solid var(--or3-color-border);
    border-radius: var(--or3-radius-md);
    transition: all var(--or3-transition-fast);
}

.node-palette-item:hover {
    background: var(--or3-color-surface-hover);
    border-color: var(--or3-color-border-hover);
}
```

### Node Inspector

```css
.node-inspector {
    background: var(--or3-color-bg-secondary);
    border-left: 1px solid var(--or3-color-border);
}

.inspector-section {
    border-bottom: 1px solid var(--or3-color-border);
    padding: var(--or3-spacing-md);
}

.inspector-label {
    color: var(--or3-color-text-secondary);
    font-size: 12px;
}

.inspector-input {
    background: var(--or3-color-bg-tertiary);
    border: 1px solid var(--or3-color-border);
    border-radius: var(--or3-radius-sm);
    color: var(--or3-color-text-primary);
}
```

### Chat Panel

```css
.chat-panel {
    background: var(--or3-color-bg-secondary);
}

.chat-message {
    padding: var(--or3-spacing-md);
    border-radius: var(--or3-radius-md);
}

.chat-message-user {
    background: var(--or3-color-accent-muted);
}

.chat-message-assistant {
    background: var(--or3-color-surface);
}
```

## Dark Mode Toggle

Implement dark/light mode switching:

```typescript
// Toggle theme
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') ?? 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
```

```vue
<template>
    <button @click="toggleTheme">
        {{ isDark ? '☀️' : '🌙' }}
    </button>
</template>
```

## Custom Fonts

Load and apply custom fonts:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');

:root {
    --or3-font-sans: 'Inter', sans-serif;
    --or3-font-mono: 'JetBrains Mono', monospace;
}
```

## Tailwind CSS Integration

Use Tailwind colors with CSS variables:

```css
:root {
    --or3-color-accent: theme('colors.violet.500');
    --or3-color-accent-hover: theme('colors.violet.400');
    --or3-color-success: theme('colors.green.500');
    --or3-color-warning: theme('colors.amber.500');
    --or3-color-error: theme('colors.red.500');
}
```

## Best Practices

### 1. Use Variables Consistently

Always use CSS variables instead of hardcoded colors:

```css
/* ✅ Good */
.my-component {
    background: var(--or3-color-surface);
    color: var(--or3-color-text-primary);
}

/* ❌ Avoid */
.my-component {
    background: #1a1a24;
    color: white;
}
```

### 2. Maintain Contrast

Ensure text remains readable:

```css
/* Use appropriate text color for backgrounds */
.dark-bg {
    color: var(--or3-color-text-primary);
} /* Light text */
.light-bg {
    color: var(--or3-color-text-primary);
} /* Update for light theme */
```

### 3. Test Both Themes

Always test customizations in both light and dark modes.

### 4. Keep Accessibility

Ensure sufficient color contrast for accessibility (WCAG 2.1):

-   Normal text: 4.5:1 contrast ratio
-   Large text: 3:1 contrast ratio

## Next Steps

-   [Vue Components](./vue/overview.md) - Component reference
-   [Custom Extensions](./custom-extensions.md) - Node styling
