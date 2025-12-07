# Output Node UX Redesign - Requirements

## Purpose

Redesign the Output Node inspector panel to be intuitive for non-technical users while retaining power-user capabilities. The current implementation requires understanding of templating syntax (`{{outputs.nodeId}}`) which creates a significant barrier for beginners.

## Problem Statement

The current Output Node inspector has several usability issues:

1. **Template Syntax Barrier**: Users must understand `{{outputs.nodeId}}` syntax to reference upstream outputs
2. **No Visual Guidance**: No way to see which outputs are available or easily select them
3. **Single Mode**: No distinction between "combine existing outputs" vs "generate new content"
4. **Parallel Branch Confusion**: No clear way to order/select outputs from parallel branches
5. **Hidden Capabilities**: Advanced features (metadata) mixed with basic features
6. **No Preview**: Cannot see what the final output will look like before running

## Target User Personas

### Beginner User (Primary Focus)
- Building their first AI workflow
- Creating multi-step content pipelines (articles, reports, newsletters)
- Does not know programming or templating syntax
- Expects visual, drag-and-drop interactions

### Power User (Secondary)
- Comfortable with code and templating
- Needs quick access to advanced features
- May prefer typing `{{nodeId}}` directly
- Wants metadata, JSON output, custom formatting

## Core Use Case: Article Generation Workflow

> "I'm creating an agent that makes long-form articles. The first agent builds the outline breaking it into sections A, B, C, D. A parallel node has branches doing research separately. All branches are passed to agents one by one to write parts. I should be able to combine all agent outputs into the final draft using the output node without forcing it to stream again. I should also be able to pass it all and have it stream a final draft."

---

## Functional Requirements

### 1. Output Mode Selection
**User Story**: As a user, I want to choose between combining existing outputs OR generating a new synthesis, so I can control whether the AI processes my content again.

**Acceptance Criteria**:
- 1.1 WHEN the user opens the output node inspector THEN they shall see a clear toggle/selector between two modes: "Combine Outputs" and "AI Synthesis"
- 1.2 WHEN "Combine Outputs" mode is selected THEN the node shall concatenate inputs without making any LLM calls
- 1.3 WHEN "AI Synthesis" mode is selected THEN the node shall stream a final output through the LLM
- 1.4 WHEN switching modes THEN only relevant controls for that mode shall be displayed
- 1.5 IF no mode is explicitly set THEN "Combine Outputs" shall be the default (faster, no extra cost)

### 2. Visual Source Picker (No Templating Required)
**User Story**: As a beginner, I want to select which upstream outputs to include by clicking or dragging, without learning template syntax.

**Acceptance Criteria**:
- 2.1 WHEN the output node inspector is open THEN the user shall see a list of all connected upstream nodes with their labels
- 2.2 WHEN the user clicks an upstream node THEN its output shall be added to an ordered "Sources" list
- 2.3 WHEN multiple sources are added THEN the user shall be able to drag-and-drop to reorder them
- 2.4 WHEN a source is in the list THEN the user shall be able to remove it with a single click (X button)
- 2.5 IF no sources are explicitly selected THEN all connected upstream outputs shall be used in execution order
- 2.6 WHEN sources are selected THEN the resulting template shall be auto-generated internally (user never sees `{{}}`)

### 3. Parallel Branch Handling
**User Story**: As a user with parallel branches, I want to easily select and order outputs from different branches.

**Acceptance Criteria**:
- 3.1 WHEN upstream includes a parallel node THEN all branch outputs shall be shown grouped together with a "Parallel: [Node Name]" header
- 3.2 WHEN branch outputs are displayed THEN they shall show their branch labels (e.g., "Section A", "Section B")
- 3.3 WHEN the user selects branch outputs THEN they can select all branches at once OR individual branches
- 3.4 WHEN multiple branches are selected THEN default order shall match execution order
- 3.5 IF the parallel node used labels THEN those labels shall be displayed instead of generic "Branch 1, Branch 2"

### 4. Free Text Fields (Intro/Outro)
**User Story**: As a user, I want to add custom intro and outro text around my combined outputs.

**Acceptance Criteria**:
- 4.1 WHEN in "Combine Outputs" mode THEN the user shall see optional "Introduction" and "Conclusion" text areas
- 4.2 WHEN intro text is provided THEN it shall appear before all source outputs in the final result
- 4.3 WHEN outro text is provided THEN it shall appear after all source outputs in the final result
- 4.4 IF intro/outro are empty THEN no extra text shall be added (no blank lines or placeholders)

### 5. AI Synthesis Mode Controls
**User Story**: As a user, I want to provide guidance to the AI when synthesizing my content.

**Acceptance Criteria**:
- 5.1 WHEN "AI Synthesis" mode is selected THEN a "Synthesis Instructions" textarea shall appear
- 5.2 WHEN synthesis instructions are provided THEN they shall be sent as a system/user prompt guiding the AI
- 5.3 WHEN in AI Synthesis mode THEN the user shall be able to select which model to use
- 5.4 IF no synthesis instructions are provided THEN a sensible default shall be used (e.g., "Combine the following sections into a cohesive document")

### 6. Live Preview
**User Story**: As a user, I want to see what my final output will look like before running the workflow.

**Acceptance Criteria**:
- 6.1 WHEN sources are configured THEN a "Preview" section shall show the assembled output structure
- 6.2 WHEN the workflow has previous execution data THEN preview shall use actual output content
- 6.3 IF no execution data exists THEN preview shall show placeholder text (e.g., "[Output from Agent 1 will appear here]")
- 6.4 WHEN in Combine mode THEN preview shall show the exact concatenation (intro + sources + outro)
- 6.5 WHEN in AI Synthesis mode THEN preview shall show the inputs that will be sent to the AI with a note: "AI will synthesize these inputs"

### 7. Empty State & Guardrails
**User Story**: As a user, I want clear guidance when my output node isn't properly configured.

**Acceptance Criteria**:
- 7.1 IF no upstream nodes are connected THEN display a blocking warning: "Connect an upstream node to provide input"
- 7.2 IF connected nodes haven't been executed THEN preview shall show placeholder indicators
- 7.3 WHEN hovering over an unconnected input THEN tooltip shall explain what to do
- 7.4 IF user selects sources that aren't connected THEN those sources shall be removed and a notification shown

### 8. Advanced Settings (Accordion)
**User Story**: As a power user, I want quick access to advanced features without cluttering the beginner experience.

**Acceptance Criteria**:
- 8.1 Advanced settings shall be collapsed by default in an "Advanced" accordion
- 8.2 Advanced settings shall include:
  - Include Metadata toggle (timing, tokens, execution info)
  - Raw Template Editor (allows direct `{{nodeId}}` editing)
  - JSON output format toggle (for structured outputs)
- 8.3 WHEN Raw Template Editor is enabled THEN it shall override the visual source picker
- 8.4 IF user has used Raw Template THEN a badge/indicator shall show in the collapsed accordion

### 9. Backwards Compatibility
**User Story**: As an existing user, I want my current workflows with templates to continue working.

**Acceptance Criteria**:
- 9.1 IF a node already has a `template` field THEN the Raw Template Editor shall be shown expanded
- 9.2 WHEN a node has legacy template syntax THEN existing behavior shall be preserved
- 9.3 WHEN saving a node configured via visual picker THEN internal template shall be generated correctly

---

## Non-Functional Requirements

### Performance
- Preview updates shall occur with < 100ms latency after changes
- Source picker shall handle 20+ upstream nodes without lag
- Drag-and-drop reordering shall feel responsive (60fps)

### Accessibility
- All controls shall be keyboard accessible
- Screen readers shall announce source list changes
- Color shall not be the only indicator of state

### Consistency
- UI patterns shall match existing inspector panels (Agent, Router, etc.)
- Theming/CSS variables shall be reused from existing components
- Icons shall come from existing icon set

---

## Out of Scope (Future Considerations)

- Conditional output (if/else logic within output node)
- Multiple output formats in same node
- Output to external destinations (API, file, etc.)
- Custom JavaScript transformations
