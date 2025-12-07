# Output Node UX Redesign - Implementation Tasks

## Overview

Implementation plan for redesigning the Output Node inspector to be beginner-friendly with visual source picking, mode selection, and live preview. Total estimated effort: ~5-7 days.

---

## Phase 1: Core Data Model & Extension Updates

### 1. Extend OutputNodeData Type
**Requirements**: 1.1, 1.2, 1.5, 2.6, 4.1, 5.1

- [ ] 1.1 Add `mode: 'combine' | 'synthesis'` field to `OutputNodeData`
- [ ] 1.2 Add `sources?: string[]` field for ordered source selection
- [ ] 1.3 Add `introText?: string` and `outroText?: string` fields
- [ ] 1.4 Add `synthesis?: { prompt?: string; model?: string }` config object
- [ ] 1.5 Add `useRawTemplate?: boolean` flag for legacy compatibility
- [ ] 1.6 Update type exports in `packages/workflow-core/src/extensions/OutputNodeExtension.ts`
- [ ] 1.7 Update default data to include `mode: 'combine'`

### 2. Update OutputNodeExtension Execution Logic
**Requirements**: 1.2, 1.3, 4.2, 4.3, 5.2

- [ ] 2.1 Refactor `execute()` to check `mode` field first
- [ ] 2.2 Implement `executeCombineMode()` - concatenation without LLM
  - [ ] 2.2.1 Handle intro/outro text prepending/appending
  - [ ] 2.2.2 Respect `sources` ordering if provided
  - [ ] 2.2.3 Fall back to all upstream outputs in execution order if sources empty
- [ ] 2.3 Implement `executeSynthesisMode()` - LLM-based synthesis
  - [ ] 2.3.1 Build system prompt from `synthesis.prompt` or default
  - [ ] 2.3.2 Use `synthesis.model` or context default model
  - [ ] 2.3.3 Support streaming output
- [ ] 2.4 Preserve legacy behavior when `useRawTemplate === true` (use existing `template` interpolation)
- [ ] 2.5 Add unit tests for new execution modes

### 3. Data Migration Utility
**Requirements**: 9.1, 9.2, 9.3

- [ ] 3.1 Create `migrateOutputNodeData(data)` function
- [ ] 3.2 Detect legacy format (has `template`, no `mode`)
- [ ] 3.3 Set `useRawTemplate: true` for legacy nodes
- [ ] 3.4 Add migration to node loading pipeline
- [ ] 3.5 Add unit tests for migration scenarios

---

## Phase 2: Upstream Source Resolution

### 4. Create useUpstreamResolver Composable
**Requirements**: 2.1, 3.1, 3.2, 3.4, 3.5

- [ ] 4.1 Create `packages/workflow-vue/src/composables/useUpstreamResolver.ts`
- [ ] 4.2 Implement graph traversal to find all upstream nodes
- [ ] 4.3 Group parallel branch outputs under parent node
- [ ] 4.4 Extract branch labels from parallel node data
- [ ] 4.5 Calculate execution order for default sorting
- [ ] 4.6 Return `UpstreamGroup[]` with grouped sources
- [ ] 4.7 Add unit tests for:
  - [ ] 4.7.1 Single linear upstream
  - [ ] 4.7.2 Multiple upstream nodes
  - [ ] 4.7.3 Parallel branches grouping
  - [ ] 4.7.4 Complex graph with mixed nodes

### 5. Create Execution Cache System
**Requirements**: 6.2, 6.3

- [ ] 5.1 Create `useExecutionCache` composable or extend existing state
- [ ] 5.2 Store last execution outputs per node ID
- [ ] 5.3 Clear cache on workflow reset/close
- [ ] 5.4 Provide method to get cached output for preview

---

## Phase 3: Vue Components

### 6. Create OutputModeSelector Component
**Requirements**: 1.1, 1.4

- [ ] 6.1 Create `packages/workflow-vue/src/components/ui/output/OutputModeSelector.vue`
- [ ] 6.2 Implement two-button toggle (Combine / AI Synthesis)
- [ ] 6.3 Add icons for each mode (⚡ and 🤖 or SVG equivalents)
- [ ] 6.4 Add tooltip explanations on hover
- [ ] 6.5 Emit `update:modelValue` on selection change
- [ ] 6.6 Style to match existing inspector components

### 7. Create OutputSourcePicker Component
**Requirements**: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3

- [ ] 7.1 Create `packages/workflow-vue/src/components/ui/output/OutputSourcePicker.vue`
- [ ] 7.2 Display available sources grouped by type (single/parallel)
- [ ] 7.3 Show parallel groups with collapsible header
- [ ] 7.4 Implement "Add" dropdown/popover to select sources
- [ ] 7.5 Display selected sources as ordered list with:
  - [ ] 7.5.1 Drag handle for reordering
  - [ ] 7.5.2 Remove (X) button
  - [ ] 7.5.3 Node label and type indicator
- [ ] 7.6 Implement drag-and-drop reordering with `@vueuse/core` or custom
- [ ] 7.7 Add keyboard navigation (arrow keys, enter, delete)
- [ ] 7.8 Emit `update:modelValue` with ordered source IDs
- [ ] 7.9 Add empty state: "Click + Add to select sources"

### 8. Create OutputPreview Component
**Requirements**: 6.1, 6.2, 6.3, 6.4, 6.5

- [ ] 8.1 Create `packages/workflow-vue/src/components/ui/output/OutputPreview.vue`
- [ ] 8.2 Accept `PreviewData` prop with assembled content
- [ ] 8.3 Render markdown preview (reuse existing markdown component)
- [ ] 8.4 Style placeholder text differently (dashed border, muted color)
- [ ] 8.5 Show mode-specific hint at bottom of preview
- [ ] 8.6 Add max-height with overflow scroll
- [ ] 8.7 Add "expand/collapse" toggle if content exceeds max height

### 9. Create useOutputPreview Composable
**Requirements**: 6.1, 6.2, 6.3, 6.4, 6.5

- [ ] 9.1 Create `packages/workflow-vue/src/composables/useOutputPreview.ts`
- [ ] 9.2 Watch node data and execution cache for changes
- [ ] 9.3 Generate preview content based on mode:
  - [ ] 9.3.1 Combine: intro + source outputs/placeholders + outro
  - [ ] 9.3.2 Synthesis: list inputs with "AI will synthesize" note
- [ ] 9.4 Debounce updates by 50ms
- [ ] 9.5 Return `PreviewData` reactive object

---

## Phase 4: Inspector Integration

### 10. Refactor NodeInspector Output Tab
**Requirements**: 1.1, 1.4, 2.1, 4.1, 5.1, 6.1, 7.1, 8.1

- [ ] 10.1 Replace current output tab content in `NodeInspector.vue`
- [ ] 10.2 Add `OutputModeSelector` at top of tab
- [ ] 10.3 Add `OutputSourcePicker` below mode selector
- [ ] 10.4 Conditionally show intro/outro textareas (Combine mode only)
- [ ] 10.5 Conditionally show synthesis config (Synthesis mode only):
  - [ ] 10.5.1 Synthesis instructions textarea
  - [ ] 10.5.2 Model selector dropdown
- [ ] 10.6 Add `OutputPreview` component
- [ ] 10.7 Move metadata toggle to Advanced accordion
- [ ] 10.8 Add Raw Template Editor toggle in Advanced accordion
- [ ] 10.9 Show "Using custom template" badge when `useRawTemplate` is true
- [ ] 10.10 Wire up all update handlers with debouncing

### 11. Implement Empty State & Guardrails
**Requirements**: 7.1, 7.2, 7.3, 7.4

- [ ] 11.1 Show blocking warning when no upstream connections
- [ ] 11.2 Style warning with icon and clear call-to-action
- [ ] 11.3 Add tooltip to input handle explaining connection
- [ ] 11.4 Auto-remove sources that become disconnected
- [ ] 11.5 Show toast notification when sources are auto-removed

### 12. Advanced Settings Accordion
**Requirements**: 8.1, 8.2, 8.3, 8.4

- [ ] 12.1 Create collapsible "Advanced" section
- [ ] 12.2 Add "Include Metadata" toggle
- [ ] 12.3 Add "Use Raw Template" toggle with warning
- [ ] 12.4 Show template textarea when raw mode enabled
- [ ] 12.5 Disable visual source picker when raw mode enabled
- [ ] 12.6 Add "JSON Output" format toggle for structured output
- [ ] 12.7 Show badge on collapsed accordion when advanced settings active

---

## Phase 5: Testing & Polish

### 13. Unit Tests
**Requirements**: All

- [ ] 13.1 Test `OutputModeSelector` interactions
- [ ] 13.2 Test `OutputSourcePicker` add/remove/reorder
- [ ] 13.3 Test `OutputPreview` rendering modes
- [ ] 13.4 Test `useUpstreamResolver` graph traversal
- [ ] 13.5 Test `useOutputPreview` debouncing and content generation
- [ ] 13.6 Test execution mode branching in `OutputNodeExtension`
- [ ] 13.7 Test data migration function

### 14. Integration Tests
**Requirements**: All

- [ ] 14.1 Test inspector mode switching persists data
- [ ] 14.2 Test source picker updates flow to preview
- [ ] 14.3 Test backwards compatibility with legacy templates
- [ ] 14.4 Test parallel branch grouping in real workflow

### 15. E2E Tests
**Requirements**: Core use case

- [ ] 15.1 Create "Article Generation" test workflow
- [ ] 15.2 Test Combine mode concatenates without LLM call
- [ ] 15.3 Test Synthesis mode streams final output
- [ ] 15.4 Test source reordering affects final output order

### 16. Accessibility Audit
**Requirements**: NFR Accessibility

- [ ] 16.1 Test keyboard navigation through all controls
- [ ] 16.2 Verify screen reader announcements
- [ ] 16.3 Check color contrast for all states
- [ ] 16.4 Test with `prefers-reduced-motion`

### 17. Documentation
**Requirements**: N/A (DX)

- [ ] 17.1 Update `docs/nodes/output.md` with new features
- [ ] 17.2 Add visual guide for source picker usage
- [ ] 17.3 Document migration from template to visual mode
- [ ] 17.4 Add examples for Combine vs Synthesis modes

---

## Phase 6: Performance & Optimization

### 18. Performance Tuning
**Requirements**: NFR Performance

- [ ] 18.1 Verify preview updates < 100ms
- [ ] 18.2 Profile source picker with 20+ nodes
- [ ] 18.3 Ensure drag-and-drop runs at 60fps
- [ ] 18.4 Add lazy loading for model selector in Synthesis mode

---

## Dependency Graph

```
Phase 1 (Data Model)
    └── Phase 2 (Upstream Resolver)
        └── Phase 3 (Components)
            └── Phase 4 (Integration)
                └── Phase 5 (Testing)
                    └── Phase 6 (Performance)

Parallel Work Possible:
- 1.* and 3.* (migration) can run in parallel
- 6.*, 7.*, 8.* (components) can be built in parallel
- 13.*, 14.* (tests) can run alongside 10.* (integration)
```

---

## Estimated Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 1 | 1 day | Core data model changes |
| Phase 2 | 0.5 day | Graph traversal composable |
| Phase 3 | 2 days | Three new Vue components |
| Phase 4 | 1.5 days | Inspector refactor |
| Phase 5 | 1 day | Testing & docs |
| Phase 6 | 0.5 day | Performance verification |

**Total: ~6.5 days**

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing workflows | Legacy detection + `useRawTemplate` flag |
| Complex parallel branch resolution | Thorough unit tests + graph visualization |
| Drag-and-drop performance | Use lightweight library, fallback to click-based |
| Preview delay perception | Debounce + optimistic UI updates |
