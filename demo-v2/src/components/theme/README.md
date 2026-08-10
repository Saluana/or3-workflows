# Theme Components

This directory contains components for the Theme Settings page in or3-workflows demo-v2.

## Components

### ThemePage.vue
Main modal component that displays the theme settings interface. Features:
- Full-screen modal with organized sections
- Real-time CSS variable updates
- Save/load themes to localStorage
- Import/export theme JSON files
- Search functionality (UI ready)
- Reset to defaults

### ColorPicker.vue
Reusable component for editing individual color values:
- Visual color preview with checkerboard background
- Text input for color values (hex, rgb, rgba)
- Supports all CSS color formats
- Live preview of changes

### ColorSection.vue
Collapsible section component for grouping related colors:
- Expandable/collapsible sections
- Grid layout for color pickers
- Section title and description
- Auto-formats CSS variable names to readable labels

## Usage

The ThemePage is integrated into the main App.vue and can be opened via the theme settings button in the HeaderBar.

```vue
<ThemePage :show="showThemeModal" @close="showThemeModal = false" />
```

## Color Tokens Organized by Section

### Background Colors
- `--or3-color-bg-primary` - Main background
- `--or3-color-bg-secondary` - Panels, sidebars
- `--or3-color-bg-tertiary` - Elevated surfaces
- `--or3-color-bg-elevated` - Cards, modals

### Surface Colors
- `--or3-color-surface` - Default surface
- `--or3-color-surface-hover` - Hover state
- `--or3-color-surface-glass` - Glass effect
- `--or3-color-surface-subtle` - Subtle surfaces

### Border Colors
- `--or3-color-border` - Default border
- `--or3-color-border-hover` - Hover state
- `--or3-color-border-active` - Active/selected
- `--or3-color-border-subtle` - Subtle borders

### Text Colors
- `--or3-color-text-primary` - Main text
- `--or3-color-text-secondary` - Secondary text
- `--or3-color-text-muted` - Muted text
- `--or3-color-text-placeholder` - Placeholder text

### Accent Colors
- `--or3-color-accent` - Primary accent
- `--or3-color-accent-hover` - Accent hover
- `--or3-color-accent-active` - Accent active
- `--or3-color-accent-muted` - Accent background
- `--or3-color-accent-subtle` - Subtle accent

### Semantic Colors
Each semantic color (success, warning, error, info) includes:
- Base color
- Hover variant
- Muted background
- Subtle background

## Features

### Real-time Preview
All color changes are immediately applied to the document root, allowing instant visual feedback.

### Persistence
Themes are automatically saved to localStorage and restored on page load.

### Import/Export
Export your custom theme as a JSON file:
```json
{
  "version": "1.0.0",
  "colors": {
    "--or3-color-accent": "#8b5cf6",
    ...
  },
  "exportedAt": "2024-01-08T12:00:00.000Z"
}
```

### Reset to Defaults
Clears custom theme and restores the default CSS variables from variables.css.

## Implementation Notes

- Components use Vue 3 Composition API with `<script setup>`
- All colors are managed as a reactive state object
- CSS variables are updated using `document.documentElement.style.setProperty()`
- Collapsible sections use CSS transitions for smooth animations
- Responsive design adapts to mobile screens
