# Demo App Refactoring - Technical Design

## Overview

This document provides the technical design for refactoring demo-v2/src/App.vue (~2300 lines) into smaller, focused components. The refactoring follows an incremental approach with verification at each step.

## Current Structure Analysis

### App.vue Current Sections (~2300 lines)

| Section      | Lines  | Description                                   |
| ------------ | ------ | --------------------------------------------- |
| Script Setup | ~870   | Imports, state, computed, lifecycle, handlers |
| Template     | ~400   | Main layout, sidebars, canvas, modals         |
| Styles       | ~1000+ | All component styles                          |

### Already Extracted Components

-   `HeaderBar.vue` - Header toolbar with workflow name, undo/redo, actions
-   `ChatPanel.vue` - Chat interface with messages, streaming, branches
-   `modals/` - ApiKeyModal, SaveModal, LoadModal, ValidationModal, HITLModal

### Components to Extract

1. **LeftSidebar.vue** - Node palette and inspector tabs
2. **MobileNav.vue** - Mobile bottom navigation and menu overlay
3. **CanvasArea.vue** - Canvas container with expand button and overlays

## Architecture

```
App.vue (orchestrator, <500 lines)
├── HeaderBar.vue (existing)
├── LeftSidebar.vue (new)
│   ├── NodePalette (from @or3/workflow-vue)
│   └── NodeInspector (from @or3/workflow-vue)
├── CanvasArea.vue (new)
│   ├── WorkflowCanvas (from @or3/workflow-vue)
│   ├── ValidationOverlay (from @or3/workflow-vue)
│   └── EdgeLabelEditor (from @or3/workflow-vue)
├── ChatPanel.vue (existing)
├── MobileNav.vue (new)
└── modals/ (existing)
```

## Component Designs

### 1. LeftSidebar.vue

**Props:**

```typescript
interface LeftSidebarProps {
    editor: WorkflowEditor | null;
    activePanel: 'palette' | 'inspector';
    collapsed: boolean;
}
```

**Emits:**

```typescript
interface LeftSidebarEmits {
    (e: 'update:activePanel', value: 'palette' | 'inspector'): void;
    (e: 'update:collapsed', value: boolean): void;
}
```

**Template Structure:**

```vue
<aside class="sidebar left-sidebar" :class="{ collapsed }">
    <div class="sidebar-header">
        <button @click="$emit('update:collapsed', !collapsed)">...</button>
    </div>
    <div v-if="!collapsed" class="sidebar-tabs">
        <button @click="$emit('update:activePanel', 'palette')">Nodes</button>
        <button @click="$emit('update:activePanel', 'inspector')">Inspector</button>
    </div>
    <div v-if="!collapsed" class="sidebar-content">
        <NodePalette v-if="activePanel === 'palette'" />
        <NodeInspector v-else :editor="editor" @close="$emit('update:activePanel', 'palette')" />
    </div>
</aside>
```

### 2. MobileNav.vue

**Props:**

```typescript
interface MobileNavProps {
    mobileView: 'editor' | 'chat';
    messageCount: number;
    hasApiKey: boolean;
    showMenu: boolean;
}
```

**Emits:**

```typescript
interface MobileNavEmits {
    (e: 'toggle-view', view: 'editor' | 'chat'): void;
    (e: 'update:showMenu', value: boolean): void;
    (e: 'undo'): void;
    (e: 'redo'): void;
    (e: 'save'): void;
    (e: 'load'): void;
    (e: 'export'): void;
    (e: 'open-api-key'): void;
}
```

### 3. CanvasArea.vue

**Props:**

```typescript
interface CanvasAreaProps {
    editor: WorkflowEditor | null;
    nodeStatuses: Record<string, string>;
    showLeftSidebar: boolean;
    isMobile: boolean;
    selectedEdge: Edge | null;
    showEdgeEditor: boolean;
}
```

**Emits:**

```typescript
interface CanvasAreaEmits {
    (e: 'expand-sidebar'): void;
    (e: 'node-click', node: Node): void;
    (e: 'edge-click', edge: Edge): void;
    (e: 'pane-click'): void;
    (e: 'update-edge-label', edgeId: string, label: string): void;
    (e: 'delete-edge', edgeId: string): void;
    (e: 'close-edge-editor'): void;
}
```

## Refactoring Strategy

### Phase 1: Extract LeftSidebar (Lowest Risk)

1. Create `LeftSidebar.vue` with props/emits interface
2. Move sidebar template from App.vue
3. Move sidebar-specific styles
4. Update App.vue to use new component
5. **Verify**: Demo builds and sidebar works

### Phase 2: Extract MobileNav (Medium Risk)

1. Create `MobileNav.vue` with props/emits interface
2. Move mobile nav template and menu overlay
3. Move mobile-specific styles
4. Update App.vue to use new component
5. **Verify**: Demo builds and mobile nav works

### Phase 3: Extract CanvasArea (Medium Risk)

1. Create `CanvasArea.vue` with props/emits interface
2. Move canvas container template
3. Move canvas-specific styles
4. Update App.vue to use new component
5. **Verify**: Demo builds and canvas works

### Phase 4: Style Consolidation

1. Move shared styles to a separate CSS file or keep in App.vue
2. Move component-specific styles to their respective components
3. **Verify**: All styling works correctly

### Phase 5: Final Cleanup

1. Remove unused imports from App.vue
2. Organize remaining code in App.vue
3. **Verify**: App.vue is under 500 lines
4. **Verify**: All functionality works end-to-end

## Testing Strategy

### Manual Verification Checklist

After each phase, verify:

-   [ ] Demo builds without errors (`bun run build`)
-   [ ] Demo runs without console errors
-   [ ] Left sidebar tabs switch correctly
-   [ ] Left sidebar collapses/expands
-   [ ] Node palette drag-and-drop works
-   [ ] Node inspector shows selected node
-   [ ] Canvas renders workflow
-   [ ] Node selection works
-   [ ] Edge editing works
-   [ ] Chat panel sends messages
-   [ ] Workflow execution works
-   [ ] Mobile navigation works (resize browser)
-   [ ] All modals open/close correctly

## File Changes Summary

| File                                     | Action                         |
| ---------------------------------------- | ------------------------------ |
| `demo-v2/src/components/LeftSidebar.vue` | Create                         |
| `demo-v2/src/components/MobileNav.vue`   | Create                         |
| `demo-v2/src/components/CanvasArea.vue`  | Create                         |
| `demo-v2/src/components/index.ts`        | Update exports                 |
| `demo-v2/src/App.vue`                    | Refactor to use new components |

## Risk Mitigation

1. **Incremental approach**: Extract one component at a time with verification
2. **Props/emits pattern**: Use Vue's standard patterns for component communication
3. **Style isolation**: Keep styles with their components using scoped CSS
4. **No logic changes**: Only move code, don't refactor logic during extraction
5. **Git commits**: Commit after each successful phase for easy rollback
