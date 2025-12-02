# Demo App Refactoring - Implementation Tasks

## Overview

Tasks are organized into phases with verification checkpoints. Each phase extracts one component and verifies the demo still works before proceeding.

**Current Status:** App.vue is ~2311 lines. Only HeaderBar and ChatPanel have been extracted. LeftSidebar, MobileNav, and CanvasArea still need to be extracted.

---

## Phase 1: Extract LeftSidebar Component

**Priority:** High  
**Risk:** Low  
**Requirements:** 1, 4, 5

### 1.1 Create LeftSidebar Component

-   [ ] 1.1.1 Create `demo-v2/src/components/LeftSidebar.vue` with TypeScript props interface
    -   Props: `editor`, `activePanel`, `collapsed`
    -   Emits: `update:activePanel`, `update:collapsed`
    -   _Requirements: 1.1, 1.2_
-   [ ] 1.1.2 Move sidebar template from App.vue (lines ~830-900 in template)
    -   Include sidebar-header with collapse button
    -   Include sidebar-tabs with Nodes/Inspector buttons
    -   Include sidebar-content with NodePalette and NodeInspector
    -   _Requirements: 1.1, 1.3_
-   [ ] 1.1.3 Move sidebar-specific styles from App.vue
    -   `.sidebar`, `.sidebar-header`, `.sidebar-collapse-btn`
    -   `.left-sidebar`, `.sidebar-tabs`, `.sidebar-tab`
    -   `.sidebar-content`, `.palette-container`
    -   _Requirements: 1.4_
-   [ ] 1.1.4 Update `demo-v2/src/components/index.ts` to export LeftSidebar
    -   _Requirements: 1.3_
-   [ ] 1.1.5 Update App.vue to import and use LeftSidebar component
    -   Replace sidebar template with `<LeftSidebar>` component
    -   Wire up v-model bindings for activePanel and collapsed
    -   _Requirements: 1.3, 1.4_

### 1.2 Verify Phase 1

-   [ ] 1.2.1 Run `bun run build` in demo-v2 - must succeed
    -   _Requirements: 4.1, 5.1_
-   [ ] 1.2.2 Manually verify sidebar functionality works identically
    -   Sidebar tabs switch between Nodes and Inspector
    -   Sidebar collapse/expand works
    -   Node palette drag-and-drop works
    -   Node inspector shows selected node details
    -   _Requirements: 4.2, 4.3, 5.1_

---

## Phase 2: Extract MobileNav Component

**Priority:** High  
**Risk:** Medium  
**Requirements:** 2, 4, 5

### 2.1 Create MobileNav Component

-   [ ] 2.1.1 Create `demo-v2/src/components/MobileNav.vue` with TypeScript props interface
    -   Props: `mobileView`, `messageCount`, `hasApiKey`, `showMenu`
    -   Emits: `toggle-view`, `update:showMenu`, `undo`, `redo`, `save`, `load`, `export`, `open-api-key`
    -   _Requirements: 2.1, 2.2_
-   [ ] 2.1.2 Move mobile nav template from App.vue
    -   Include bottom navigation bar (`<nav class="mobile-nav">`)
    -   Include mobile menu overlay with Transition
    -   _Requirements: 2.1, 2.3_
-   [ ] 2.1.3 Move mobile-specific styles from App.vue
    -   `.mobile-nav`, `.mobile-nav-btn`, `.nav-badge`
    -   `.mobile-menu-overlay`, `.mobile-menu`, `.mobile-menu-header`
    -   `.mobile-menu-items`, `.mobile-menu-item`, `.mobile-menu-divider`
    -   `.slide-up-*` transition styles
    -   _Requirements: 2.4_
-   [ ] 2.1.4 Update `demo-v2/src/components/index.ts` to export MobileNav
    -   _Requirements: 2.3_
-   [ ] 2.1.5 Update App.vue to import and use MobileNav component
    -   Replace mobile nav template with `<MobileNav>` component
    -   Wire up event handlers
    -   _Requirements: 2.3, 2.4_

### 2.2 Verify Phase 2

-   [ ] 2.2.1 Run `bun run build` in demo-v2 - must succeed
    -   _Requirements: 4.1, 5.1_
-   [ ] 2.2.2 Manually verify mobile navigation works identically (resize browser to mobile width)
    -   Bottom navigation shows Editor/Chat/More buttons
    -   View switching works between editor and chat
    -   Mobile menu opens and closes
    -   Menu actions (undo, redo, save, load, export, API key) work
    -   _Requirements: 4.2, 4.3, 5.1_

---

## Phase 3: Extract CanvasArea Component

**Priority:** High  
**Risk:** Medium  
**Requirements:** 4, 5

### 3.1 Create CanvasArea Component

-   [ ] 3.1.1 Create `demo-v2/src/components/CanvasArea.vue` with TypeScript props interface
    -   Props: `editor`, `nodeStatuses`, `showLeftSidebar`, `isMobile`, `selectedEdge`, `showEdgeEditor`
    -   Emits: `expand-sidebar`, `node-click`, `edge-click`, `pane-click`, `update-edge-label`, `delete-edge`, `close-edge-editor`
    -   _Requirements: 4.2, 4.3_
-   [ ] 3.1.2 Move canvas container template from App.vue
    -   Include expand sidebar button
    -   Include WorkflowCanvas component
    -   Include ValidationOverlay
    -   Include EdgeLabelEditor
    -   _Requirements: 4.2, 4.3_
-   [ ] 3.1.3 Move canvas-specific styles from App.vue
    -   `.canvas-container`, `.canvas-overlay`
    -   `.sidebar-expand-btn` (if not already moved)
    -   _Requirements: 4.3_
-   [ ] 3.1.4 Update `demo-v2/src/components/index.ts` to export CanvasArea
    -   _Requirements: 4.2_
-   [ ] 3.1.5 Update App.vue to import and use CanvasArea component
    -   Replace canvas container template with `<CanvasArea>` component
    -   Wire up event handlers
    -   _Requirements: 4.2, 4.3_

### 3.2 Verify Phase 3

-   [ ] 3.2.1 Run `bun run build` in demo-v2 - must succeed
    -   _Requirements: 4.1, 5.1_
-   [ ] 3.2.2 Manually verify canvas functionality works identically
    -   Canvas renders workflow correctly
    -   Node click selects node and opens inspector
    -   Edge click opens edge editor
    -   Pane click deselects
    -   Edge label editing works
    -   Edge deletion works
    -   Expand sidebar button works when sidebar is collapsed
    -   _Requirements: 4.2, 4.3, 5.1_

---

## Phase 4: Final Cleanup and Verification

**Priority:** High  
**Risk:** Low  
**Requirements:** 4

### 4.1 Clean Up App.vue

-   [ ] 4.1.1 Remove unused imports from App.vue
    -   _Requirements: 4.4_
-   [ ] 4.1.2 Remove styles that were moved to extracted components
    -   _Requirements: 4.4_
-   [ ] 4.1.3 Organize remaining code with clear section comments
    -   _Requirements: 4.4_
-   [ ] 4.1.4 Verify App.vue is under 500 lines
    -   _Requirements: 4.4_

### 4.2 Final Verification

-   [ ] 4.2.1 Run `bun run build` in demo-v2 - must succeed
    -   _Requirements: 4.1, 5.3_
-   [ ] 4.2.2 Complete end-to-end manual verification
    -   Create new workflow from scratch
    -   Add nodes via drag-and-drop
    -   Connect nodes with edges
    -   Edit node properties in inspector
    -   Edit edge labels
    -   Send chat message and receive response
    -   Verify streaming works
    -   Save workflow
    -   Load workflow
    -   Export workflow as JSON
    -   Undo/redo operations
    -   Mobile navigation (resize browser)
    -   All modals work correctly
    -   Check for console errors during all operations
    -   _Requirements: 4.2, 4.3, 5.3_

---

## Summary

| Phase | Component     | Risk   | Status      |
| ----- | ------------- | ------ | ----------- |
| 1     | LeftSidebar   | Low    | Not Started |
| 2     | MobileNav     | Medium | Not Started |
| 3     | CanvasArea    | Medium | Not Started |
| 4     | Final Cleanup | Low    | Not Started |

## Rollback Plan

If any phase fails verification:

1. Revert changes using git
2. Analyze what went wrong
3. Fix the issue before re-attempting
4. Consider smaller extraction steps if needed
