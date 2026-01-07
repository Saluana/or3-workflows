# Demo App Refactoring - Requirements

## Introduction

This document defines requirements for refactoring the demo-v2 App.vue component from ~2300 lines into smaller, focused components. The goal is to improve maintainability and demonstrate proper Vue architecture without breaking existing functionality.

## Glossary

-   **App.vue**: The main application component currently containing all demo functionality
-   **ChatPanel**: Existing component for chat interface (already extracted)
-   **HeaderBar**: Existing component for the header toolbar (already extracted)
-   **Sidebar**: The left panel containing node palette and inspector tabs
-   **MobileNav**: The bottom navigation bar for mobile devices
-   **Modal**: Dialog components for user interactions (API key, save, load, validation, HITL)

## Requirements

### Requirement 1: Extract Left Sidebar Component

**User Story:** As a developer, I want the left sidebar logic separated from App.vue, so that I can maintain and test it independently.

#### Acceptance Criteria

1. WHEN the LeftSidebar component is created THEN it SHALL contain the palette/inspector tab switching logic
2. WHEN the LeftSidebar component is used THEN it SHALL accept `editor`, `activePanel`, and `showLeftSidebar` as props
3. WHEN the LeftSidebar component emits events THEN App.vue SHALL handle panel changes and collapse state
4. WHEN the refactoring is complete THEN all existing sidebar functionality SHALL work identically

### Requirement 2: Extract Mobile Navigation Component

**User Story:** As a developer, I want mobile navigation logic separated from App.vue, so that mobile-specific code is isolated.

#### Acceptance Criteria

1. WHEN the MobileNav component is created THEN it SHALL contain the bottom navigation bar and mobile menu overlay
2. WHEN the MobileNav component is used THEN it SHALL accept `mobileView`, `messages`, and action handlers as props
3. WHEN mobile menu actions are triggered THEN they SHALL emit events to App.vue for handling
4. WHEN the refactoring is complete THEN all mobile navigation functionality SHALL work identically

### Requirement 3: Extract Workflow Manager Logic

**User Story:** As a developer, I want workflow management logic (save/load/export/import) separated into a composable, so that App.vue focuses on orchestration.

#### Acceptance Criteria

1. WHEN the useWorkflowManager composable is created THEN it SHALL encapsulate save, load, export, and import logic
2. WHEN the composable is used THEN it SHALL integrate with the existing useWorkflowStorage composable
3. WHEN workflow operations are performed THEN they SHALL update the editor and UI state correctly
4. WHEN the refactoring is complete THEN all workflow management functionality SHALL work identically

### Requirement 4: Maintain Backward Compatibility

**User Story:** As a user, I want the demo to work exactly as before after refactoring, so that I don't experience any regressions.

#### Acceptance Criteria

1. WHEN the refactoring is complete THEN the demo SHALL build without errors
2. WHEN the demo is run THEN all existing features SHALL function correctly
3. WHEN comparing before/after behavior THEN there SHALL be no visible differences to users
4. WHEN the refactoring is complete THEN App.vue SHALL be under 500 lines

### Requirement 5: Incremental Refactoring Approach

**User Story:** As a developer, I want to refactor incrementally with verification at each step, so that I can catch regressions early.

#### Acceptance Criteria

1. WHEN each component is extracted THEN the demo SHALL be verified to still work
2. WHEN a regression is found THEN it SHALL be fixed before proceeding to the next extraction
3. WHEN all extractions are complete THEN a final verification SHALL confirm all functionality works
