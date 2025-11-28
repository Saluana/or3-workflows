# Embeddable Workflow Builder Kit — Requirements

Goal: Deliver a lightweight, npm-installable kit (core API + Vue components) that lets any Vue app embed a visual AI-agent workflow builder, similar in spirit to TipTap for rich text editing.

## Core / Must-Have (MVP)

### 1. Package & Bundling
- **Tree-shakeable npm package**: ESM/CJS builds.
- **First-class Vue 3 support**.
- **OpenRouter SDK Integration**: Built on top of `@openrouter/sdk`.
- **Type declarations**: Full TypeScript support.
- **Zero global CSS leakage**: Scoped styles or CSS layers.

### 2. Workflow Schema & Validation
- **Typed JSON schema**: For nodes, edges, inputs/outputs, and metadata.
- **Runtime validation helpers**: Validate graph integrity (e.g., no cycles, connected nodes).
- **Migration utilities**: Helpers to upgrade saved workflows to newer schema versions.

### 3. Composable Vue Components
- **Headless + Styled Primitives**:
  - `<WorkflowCanvas>`: The main editor surface.
  - `<Node>`: Base node wrapper.
  - `<Port>`: Connection handles.
  - `<MiniMap>`: Navigation aid.
  - `<NodePalette>`: Drag-and-drop node source.
  - `<NodeInspector>`: Property editor for selected nodes.
- **Theming**: Token-based styling system.
- **Events**: Emit events for persistence (save/load) and preview.

### 4. Node Catalog for AI Agents
- **Built-in Node Definitions**:
  - `AgentNode`: LLM invocation.
    - **Model Configuration**: Pass models in OpenRouter SDK format.
    - **Mode Support**: Support for OpenRouter modes (e.g., `:online`, `:nitro`) via model suffixes or config.
  - `ToolNode`: Tool/action call.
    - **Standard Tool Format**: Tools defined using the OpenRouter/OpenAI standard (`{ type: 'function', function: ... }`).
  - `RouterNode` (Branching): Logic for conditional paths.
  - `ParallelNode`: Concurrent execution.
  - `StartNode`: Entry point.
- **Pluggable Registry**: API to register custom node types and tools.

### 5. Interaction UX
- **Editing**: Drag/drop, zoom/pan, multi-select, snap-to-grid.
- **Inline Parameter Editing**: Edit node properties directly on the canvas or in a panel.
- **History**: Undo/redo stack.
- **Validation Overlays**: Visual feedback for broken links or invalid configs.
- **Multimodal Support**: Support for multiple input modes (e.g., text, voice, vision) for node properties and workflow execution.

### 6. Execution Contract
- **Deterministic Workflow Model**: Defined execution order (BFS/DAG traversal).
- **Async Hooks**: Host apps provide the runtime.
- **OpenRouter Integration**:
  - **Native SDK Usage**: The reference executor MUST use `@openrouter/sdk`.
  - **Tool Passthrough**: Developers can pass their own tools to the executor in the standard SDK format.
  - **Model Passthrough**: Models are passed/configured using the SDK's schema.
- **Multimodal Support**:
  - **Input Modalities**: Support for text, image, file, audio, and video inputs (model-dependent).
  - **Model Capability Detection**: Query model's `inputModalities` array to determine accepted attachments.
  - **Attachment Handling**: Support both URL and base64-encoded content for all modality types.
  - **Graceful Degradation**: If model doesn't support a modality, warn user or skip attachment.
  - **UI Integration**: File picker / drag-drop in ChatPanel for attaching files.
- **Error Handling**:
  - **Graceful Failures**: Individual node failures should not crash the entire workflow.
  - **Retry Logic**: Configurable retry with exponential backoff for transient API errors.
  - **Error Reporting**: Clear error messages with node context.
- **Cancellation**: Users can stop a running workflow at any time.
- **Streaming**: Real-time token streaming for LLM responses.
- **Multi-turn Conversations**: Maintain conversation history across executions.

### 7. Persistence Interfaces
- **Save/Load Helpers**: JSON payload handling.
- **Versioning & Diffing**: Basic support for tracking changes.
- **Storage Adapters**: Interfaces for `localStorage`, REST APIs, etc.

### 8. Theming & Extension API
- **Token-based Styling**: CSS variables for colors, spacing, etc.
- **Slot Overrides**: Custom rendering for nodes and panels.
- **Extension Hooks**: Custom renderers, keyboard maps.

### 9. Docs & Quickstart
- **Copy-paste Starter**: Vite + Vue template.
- **Minimal Example**: showcasing node creation, execution wiring, and theming.
- **API Reference**: Generated docs for types and events.

### 10. Keyboard Shortcuts
- **Standard shortcuts**: Undo (Cmd/Ctrl+Z), Redo (Cmd/Ctrl+Shift+Z), Delete, Duplicate (Cmd/Ctrl+D).
- **Navigation**: Fit view, zoom in/out.
- **Extensible**: Custom shortcuts via extension API.

## Nice-to-Have / Stretch

- **Collaboration**: Presence indicators, optimistic locking.
- **AI Assist**: "Describe flow to graph" scaffolding, inline suggestions.
- **Runtime Insights**: Playback/replay view, execution timelines, analytics.
- **Template Gallery**: Curated blueprints (RAG, Planner, etc.).
- **Hosted Assets**: CDN build for zero-config embedding.
- **Accessibility**: Full keyboard navigation, screen reader support, high-contrast theme.
- **Cost Tracking**: Token usage and cost estimation per execution.
- **Offline Mode**: Graceful degradation when API is unreachable.

## Demo Priorities (for the v2 refactor)

1. **Embed Sample**: Show the builder inside a sample app with palette, wiring, and parameter editing.
2. **Execute & Replay**: Run a saved workflow (LLM -> Tool -> Branch) using the reference executor.
3. **Extensibility**: Demonstrate adding a custom node, applying a theme, and connecting a storage adapter.

## Naming Conventions

- **RouterNode** (not ConditionNode): For conditional branching nodes.
- **ParallelNode**: For concurrent execution nodes.
- **AgentNode**: For LLM invocation nodes.
- **ToolNode**: For tool/action execution nodes.
- **StartNode**: For workflow entry point.
