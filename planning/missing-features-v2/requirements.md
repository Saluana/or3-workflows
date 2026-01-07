# Core Features v2 - Requirements

## Overview

This document outlines features to add to the OR3 Workflow Builder. The design philosophy follows **TipTap's approach**: provide a powerful, extensible core with sensible defaults, but let developers bring their own implementations for persistence, storage, and integrations.

**Design Principles:**

-   🔌 **Pluggable**: Developers provide adapters for persistence, memory, etc.
-   🎛️ **Configurable**: All parameters customizable, sensible defaults
-   🧩 **Extension-based**: New features as extensions, like TipTap
-   🚀 **Zero lock-in**: No built-in database, cloud, or external dependencies

---

## 1. Memory System (Pluggable Architecture)

### Current State

-   Basic `history: ChatMessage[]` in execution context
-   No persistent memory between workflow runs
-   No way to retrieve past conversations

### Philosophy

The framework provides **interfaces and in-memory defaults**. Developers bring their own persistence (Redis, PostgreSQL, vector DB, etc.). This is the TipTap way - we don't force a storage solution.

### User Story 1.1 - Session Memory (Built-in)

**As a** workflow developer  
**I want** agents to maintain conversation context within a session  
**So that** users can have coherent multi-turn conversations

**Acceptance Criteria:**

-   WHEN a workflow executes THEN conversation history SHALL be maintained in-memory by default
-   WHEN a new message is sent THEN previous messages SHALL be included as context
-   WHEN `session.clear()` is called THEN the conversation history SHALL reset
-   WHEN the session object is accessed THEN developers SHALL have full read/write access

### User Story 1.2 - Pluggable Memory Adapter

**As a** developer integrating OR3 workflows  
**I want** to provide my own memory storage implementation  
**So that** I can use my existing infrastructure (Redis, Postgres, Pinecone, etc.)

**Acceptance Criteria:**

-   WHEN creating an ExecutionAdapter THEN I SHALL be able to pass a custom `MemoryAdapter`
-   WHEN no adapter is provided THEN an in-memory default SHALL be used
-   WHEN implementing `MemoryAdapter` THEN the interface SHALL be minimal and clear
-   WHEN storing/retrieving memories THEN the adapter SHALL handle serialization

### User Story 1.3 - Memory Retrieval in Nodes

**As a** workflow developer  
**I want** nodes to query memory during execution  
**So that** agents can access relevant past context

**Acceptance Criteria:**

-   WHEN a Memory node executes THEN it SHALL call the configured adapter's `query()` method
-   WHEN results are returned THEN they SHALL be formatted and passed to the next node
-   WHEN no results are found THEN a configurable fallback message SHALL be used

---

## 2. While Loop / Iterative Execution

### Current State

-   Pure DAG execution with cycle detection
-   `maxIterations` prevents infinite loops but doesn't enable intentional iteration
-   No way to repeat nodes until a condition is met

### Philosophy

While loops are essential for:

-   **Iterative refinement**: Keep improving output until quality threshold met
-   **Retry with modification**: Try different approaches until success
-   **Agent self-correction**: Let agent reflect and retry
-   **Data processing**: Process items until queue empty

### User Story 2.1 - While Loop Node

**As a** workflow developer  
**I want** to repeat a section of my workflow until a condition is met  
**So that** I can implement iterative refinement and retry logic

**Acceptance Criteria:**

-   WHEN a While node executes THEN it SHALL evaluate its condition using an LLM
-   IF the condition evaluates to "continue" THEN the loop body SHALL execute
-   IF the condition evaluates to "done" THEN execution SHALL proceed to the exit branch
-   WHEN `maxIterations` is reached THEN the loop SHALL exit with a configurable behavior (error/warning/continue)
-   WHEN each iteration completes THEN the iteration count SHALL be accessible

### User Story 2.2 - Loop Condition Configuration

**As a** workflow developer  
**I want** to configure how the loop decides to continue or exit  
**So that** I have control over the iteration logic

**Acceptance Criteria:**

-   WHEN configuring a While node THEN I SHALL provide a condition prompt
-   WHEN the condition is evaluated THEN the LLM SHALL respond with "continue" or "done"
-   WHEN I want deterministic behavior THEN I SHALL be able to use a custom evaluator function
-   WHEN the loop context is built THEN previous iteration outputs SHALL be available

### User Story 2.3 - Loop State Management

**As a** workflow developer  
**I want** to track and access loop state during execution  
**So that** I can make decisions based on iteration history

**Acceptance Criteria:**

-   WHEN inside a loop THEN `loop.iteration` SHALL return the current iteration number (0-indexed)
-   WHEN inside a loop THEN `loop.outputs` SHALL return an array of all previous iteration outputs
-   WHEN inside a loop THEN `loop.lastOutput` SHALL return the most recent iteration output
-   WHEN the loop exits THEN `loop.totalIterations` SHALL be available

---

## 3. Hardened Error Handling

### Current State

-   Errors bubble up and stop execution
-   `onNodeError` callback exists but limited
-   Basic retry in adapter but not configurable per-node

### Philosophy

Production workflows need resilient error handling. Errors should be catchable, retryable, and recoverable. Developers need visibility into what went wrong and control over recovery.

### User Story 3.1 - Per-Node Retry Configuration

**As a** workflow developer  
**I want** to configure retry behavior on individual nodes  
**So that** transient failures are handled automatically

**Acceptance Criteria:**

-   WHEN a node has `retry` configured THEN it SHALL retry on failure up to `maxRetries` times
-   WHEN retrying THEN exponential backoff SHALL be applied with configurable `baseDelay` and `maxDelay`
-   WHEN specific error types are configured THEN only those errors SHALL trigger retries
-   WHEN all retries fail THEN the error SHALL propagate with full retry history

### User Story 3.2 - Error Recovery Branches

**As a** workflow developer  
**I want** nodes to have an error output branch  
**So that** I can handle failures gracefully in my workflow

**Acceptance Criteria:**

-   WHEN a node has an `onError` output connected THEN errors SHALL route there instead of stopping
-   WHEN the error branch executes THEN error details SHALL be available as context
-   WHEN no error branch is connected THEN errors SHALL propagate normally
-   WHEN configuring error handling THEN I SHALL choose between "stop", "continue", or "branch"

### User Story 3.3 - Structured Error Context

**As a** workflow developer  
**I want** detailed error information when things fail  
**So that** I can debug and handle errors appropriately

**Acceptance Criteria:**

-   WHEN an error occurs THEN it SHALL include `nodeId`, `errorCode`, `message`, and `stack`
-   WHEN a retry was attempted THEN error SHALL include `retryCount` and `retryHistory`
-   WHEN the error is from an LLM THEN it SHALL include `model`, `statusCode`, and `rateLimitInfo`
-   WHEN the error context is passed to an error branch THEN all fields SHALL be accessible

---

## 4. Human-in-the-Loop (HITL) - Opt-in Per Node

### Current State

-   No pause/resume capabilities
-   No approval gates
-   No human review steps

### Philosophy

HITL is **opt-in and per-node**, not workflow-wide. Developers explicitly mark nodes that need human intervention. The framework provides the pause/resume mechanism; developers provide the UI.

### User Story 4.1 - HITL-Enabled Nodes

**As a** workflow developer  
**I want** to mark specific nodes as requiring human approval  
**So that** critical steps can be reviewed before proceeding

**Acceptance Criteria:**

-   WHEN a node has `hitl: true` configured THEN execution SHALL pause before that node
-   WHEN execution pauses THEN `onHITLRequest` callback SHALL be called with context
-   WHEN the callback resolves THEN execution SHALL continue with the provided input
-   WHEN `hitl` is not set THEN the node SHALL execute normally (default: off)

### User Story 4.2 - Approval Mode

**As a** workflow developer  
**I want** nodes to pause for approval before executing  
**So that** I can review the input before the LLM processes it

**Acceptance Criteria:**

-   WHEN `hitl.mode` is "approval" THEN execution SHALL pause with approve/reject options
-   WHEN approved THEN the node SHALL execute with original or modified input
-   WHEN rejected THEN execution SHALL route to the rejection branch or stop
-   WHEN timeout is configured THEN the default action SHALL be taken after timeout

### User Story 4.3 - Input Mode

**As a** workflow developer  
**I want** nodes to pause and collect human input  
**So that** workflows can incorporate human knowledge mid-execution

**Acceptance Criteria:**

-   WHEN `hitl.mode` is "input" THEN execution SHALL pause waiting for human input
-   WHEN input is provided THEN it SHALL be used as the node's input (replacing or augmenting)
-   WHEN `hitl.schema` is provided THEN the UI SHALL know what fields to collect
-   WHEN the callback provides input THEN execution SHALL continue

### User Story 4.4 - Review Mode

**As a** workflow developer  
**I want** nodes to pause after execution for human review  
**So that** I can validate outputs before they propagate

**Acceptance Criteria:**

-   WHEN `hitl.mode` is "review" THEN execution SHALL pause after the node completes
-   WHEN reviewing THEN the human SHALL see the node's output
-   WHEN approved THEN the output SHALL propagate normally
-   WHEN modified THEN the modified output SHALL propagate instead
-   WHEN rejected THEN the node SHALL re-execute or route to error branch

---

## 5. Subflows / Reusable Workflow Components

### Current State

-   No way to nest workflows
-   No reusable workflow components
-   Each workflow is standalone

### Philosophy

Subflows are **first-class citizens**, like components in a UI framework. They have defined inputs/outputs and can be composed. This enables:

-   **Reusability**: Define once, use everywhere
-   **Encapsulation**: Hide complexity behind a clean interface
-   **Testing**: Test subflows in isolation
-   **Sharing**: Publish subflows as packages

### User Story 5.1 - Subflow Definition

**As a** workflow developer  
**I want** to define a workflow as a reusable subflow  
**So that** I can use it as a building block in other workflows

**Acceptance Criteria:**

-   WHEN defining a workflow THEN I SHALL be able to mark it as a "subflow"
-   WHEN a workflow is a subflow THEN it SHALL have defined input/output ports
-   WHEN a subflow has inputs THEN they SHALL be accessible as context in the subflow
-   WHEN a subflow completes THEN its output SHALL be returned to the parent

### User Story 5.2 - Subflow Node

**As a** workflow developer  
**I want** to embed a subflow inside my workflow  
**So that** I can compose complex workflows from reusable parts

**Acceptance Criteria:**

-   WHEN I add a Subflow node THEN I SHALL select which subflow to embed
-   WHEN the Subflow node executes THEN the referenced subflow SHALL execute
-   WHEN the subflow completes THEN its output SHALL flow to the next node
-   WHEN the subflow has inputs THEN I SHALL map parent context to subflow inputs

### User Story 5.3 - Subflow Isolation

**As a** workflow developer  
**I want** subflows to have isolated execution contexts  
**So that** they don't unexpectedly affect parent workflow state

**Acceptance Criteria:**

-   WHEN a subflow executes THEN it SHALL have its own execution context
-   WHEN the subflow accesses session memory THEN it SHALL see parent's session (configurable)
-   WHEN the subflow errors THEN the error SHALL propagate to the parent's error handling
-   WHEN the subflow is cancelled THEN it SHALL stop cleanly

### User Story 5.4 - Inline Subflow Editing

**As a** workflow developer  
**I want** to edit subflows inline or in a separate view  
**So that** I can work efficiently with nested workflows

**Acceptance Criteria:**

-   WHEN I double-click a Subflow node THEN I SHALL see the subflow's internal structure
-   WHEN editing inline THEN changes SHALL affect all uses of that subflow
-   WHEN I want a unique copy THEN I SHALL be able to "detach" the subflow
-   WHEN viewing a subflow THEN I SHALL see its input/output contract

---

## 6. Output Node

### Current State

-   No explicit end node type
-   Final output is the last executed node's output
-   No way to format or structure the final response

### Philosophy

Output nodes make workflow endpoints explicit. They can format, transform, and validate the final output. Multiple output nodes = multiple valid endpoints.

### User Story 6.1 - Explicit Output Node

**As a** workflow developer  
**I want** to explicitly define the output of my workflow  
**So that** I have control over the final response format

**Acceptance Criteria:**

-   WHEN an Output node is reached THEN it SHALL be treated as a terminal node
-   WHEN the Output node executes THEN its output SHALL be the workflow's final output
-   WHEN multiple Output nodes exist THEN any of them can be a valid endpoint
-   WHEN no Output node is reached THEN the last node's output SHALL be used (backward compatible)

### User Story 6.2 - Output Formatting

**As a** workflow developer  
**I want** to format and transform the output  
**So that** I can ensure consistent response structure

**Acceptance Criteria:**

-   WHEN an Output node has a template THEN the output SHALL be formatted using that template
-   WHEN the template uses `{{nodeId}}` THEN it SHALL interpolate that node's output
-   WHEN `format` is "json" THEN the output SHALL be valid JSON
-   WHEN `format` is "markdown" THEN the output SHALL be formatted markdown

---

## 7. Context Window Management (Auto-Compaction)

### Current State

-   No automatic context truncation
-   No summarization of long contexts
-   Could easily exceed model context limits

### Philosophy

Context management should be **automatic but configurable**. The system knows model context limits and can intelligently compact history. Recent context is preserved in full; older context is summarized.

### User Story 7.1 - Automatic Context Compaction

**As a** workflow developer  
**I want** the system to automatically manage context length  
**So that** workflows don't fail due to context overflow

**Acceptance Criteria:**

-   WHEN context length approaches the model's limit THEN compaction SHALL trigger
-   WHEN compaction triggers THEN older messages SHALL be summarized using an LLM
-   WHEN summarizing THEN the `compactionModel` SHALL be used (configurable, defaults to current model)
-   WHEN the compacted context is used THEN execution SHALL continue normally

### User Story 7.2 - Configurable Compaction Threshold

**As a** workflow developer  
**I want** to configure when compaction triggers  
**So that** I can balance context preservation vs. safety margin

**Acceptance Criteria:**

-   WHEN `compaction.threshold` is set THEN compaction SHALL trigger at that token count
-   WHEN `compaction.threshold` is "auto" THEN it SHALL trigger at (modelLimit - 10000) tokens
-   WHEN `compaction.preserveRecent` is set THEN that many recent messages SHALL never be compacted
-   WHEN `compaction.preserveRecent` defaults THEN the last 5 messages SHALL be preserved

### User Story 7.3 - Compaction Strategy

**As a** workflow developer  
**I want** to configure how context is compacted  
**So that** I can preserve the most relevant information

**Acceptance Criteria:**

-   WHEN `compaction.strategy` is "summarize" THEN an LLM SHALL create a summary
-   WHEN `compaction.strategy` is "truncate" THEN older messages SHALL be dropped
-   WHEN `compaction.strategy` is "custom" THEN my custom function SHALL be called
-   WHEN summarizing THEN the summary prompt SHALL be configurable

### User Story 7.4 - Token Counting

**As a** workflow developer  
**I want** accurate token counting for context management  
**So that** compaction triggers at the right time

**Acceptance Criteria:**

-   WHEN counting tokens THEN the model's tokenizer SHALL be used (or approximation)
-   WHEN `execution.tokenCount` is accessed THEN current context token count SHALL be returned
-   WHEN `execution.tokenLimit` is accessed THEN current model's limit SHALL be returned
-   WHEN token counting fails THEN a conservative estimate SHALL be used

---

## Summary

| Feature            | Priority | Complexity | Default State         |
| ------------------ | -------- | ---------- | --------------------- |
| Memory System      | High     | Medium     | In-memory (pluggable) |
| While Loops        | High     | Medium     | N/A (new node type)   |
| Error Handling     | Critical | Low        | Basic retry           |
| HITL               | High     | Medium     | **Off** per node      |
| Subflows           | High     | High       | N/A (new feature)     |
| Output Node        | Medium   | Low        | N/A (new node type)   |
| Context Compaction | High     | Medium     | Auto at limit-10k     |

---

## API Design Philosophy (TipTap-style)

### Extension Registration

```typescript
const editor = new WorkflowEditor({
    extensions: [
        StarterKit, // Includes all standard nodes
        WhileLoopExtension,
        SubflowExtension.configure({
            maxNestingDepth: 3,
        }),
        HITLExtension.configure({
            defaultMode: 'approval',
            timeout: 30000,
        }),
    ],
});
```

### Adapter Configuration

```typescript
const adapter = new OpenRouterExecutionAdapter(client, {
    // Memory - bring your own or use default
    memory: new RedisMemoryAdapter(redisClient),

    // Error handling
    defaultRetry: { maxRetries: 2, baseDelay: 1000 },

    // Context management
    compaction: {
        threshold: 'auto',
        preserveRecent: 5,
        strategy: 'summarize',
        model: 'openai/gpt-4o-mini',
    },

    // HITL callback - you provide the UI
    onHITLRequest: async (request) => {
        return await showApprovalDialog(request);
    },
});
```

### Node Configuration

```typescript
// In workflow JSON or via editor
{
  type: 'agent',
  data: {
    label: 'Critical Decision',
    model: 'anthropic/claude-3-opus',
    hitl: {
      enabled: true,
      mode: 'approval',
      prompt: 'Review this decision before proceeding',
    },
    retry: {
      maxRetries: 3,
      baseDelay: 2000,
    },
  },
}
```
