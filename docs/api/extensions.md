# Extensions

Extensions define node types with their behavior, validation, and execution logic. The extension system follows a TipTap-style architecture.

## Import

```typescript
import {
    StarterKit,
    AgentNodeExtension,
    createConfigurableExtension,
    makeConfigurable,
} from 'or3-workflow-core';
```

## Extension Interface

```typescript
interface NodeExtension {
    /** Unique type identifier for the node (e.g., 'agent', 'router') */
    name: string;

    /** The type of extension */
    type: 'node';

    /** Label to display in the palette */
    label?: string;

    /** Description to display in the palette */
    description?: string;

    /** Category for grouping in the palette */
    category?: string;

    /** Icon to display (lucide icon name) */
    icon?: string;

    /** Input handles definition */
    inputs: PortDefinition[];

    /** Output handles definition */
    outputs: PortDefinition[];

    /** Default data when creating a new node */
    defaultData: Record<string, any>;

    /** Add custom commands to the editor */
    addCommands?: () => Record<string, Command>;

    /** Lifecycle hook called when extension is registered */
    onCreate?: () => void;

    /** Lifecycle hook called when extension is destroyed */
    onDestroy?: () => void;

    /**
     * Execute the node logic.
     * @param context - The execution context
     * @param node - The node being executed
     * @param provider - The LLM provider (optional)
     */
    execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult>;

    /**
     * Validate the node configuration.
     * @param node - The node to validate
     * @param edges - All edges in the workflow
     * @param context - Optional validation context with registries
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[],
        context?: ValidationContext
    ): (ValidationError | ValidationWarning)[];
}
```

## Built-in Extensions

| Extension               | Type        | Description            |
| ----------------------- | ----------- | ---------------------- |
| `StartNodeExtension`    | `start`     | Workflow entry point   |
| `AgentNodeExtension`    | `agent`     | LLM-powered processing |
| `RouterNodeExtension`   | `router`    | Conditional branching  |
| `ParallelNodeExtension` | `parallel`  | Concurrent execution   |
| `WhileLoopExtension`    | `whileLoop` | Iterative loops        |
| `MemoryNodeExtension`   | `memory`    | Vector memory          |
| `ToolNodeExtension`     | `tool`      | External tools         |
| `SubflowExtension`      | `subflow`   | Nested workflows       |
| `OutputNodeExtension`   | `output`    | Formatted output       |

## Using Extensions

### StarterKit

The easiest way to use all built-in extensions:

```typescript
import { WorkflowEditor, StarterKit } from 'or3-workflow-core';

const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});
```

### Individual Extensions

```typescript
import {
    WorkflowEditor,
    StartNodeExtension,
    AgentNodeExtension,
    RouterNodeExtension,
} from 'or3-workflow-core';

const editor = new WorkflowEditor({
    extensions: [StartNodeExtension, AgentNodeExtension, RouterNodeExtension],
});
```

### Configuring Extensions

Extensions can be configured using `configure()`:

```typescript
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        // Disable specific extensions
        whileLoop: false,
        parallel: false,

        // Configure specific extensions
        agent: {
            defaultModel: 'anthropic/claude-3.5-sonnet',
        },
        subflow: {
            maxNestingDepth: 5,
        },
    }),
});
```

## Creating Custom Extensions

### Basic Extension

```typescript
const NotificationExtension: Extension = {
    name: 'notification',
    type: 'notification',

    getDefaultData: () => ({
        label: 'Send Notification',
        channel: 'email',
        template: '',
    }),

    inputs: [{ id: 'input', label: 'Input' }],
    outputs: [{ id: 'output', label: 'Output' }],

    validate(node, workflow) {
        const issues = [];
        if (!node.data.template) {
            issues.push({
                type: 'warning',
                code: 'MISSING_TEMPLATE',
                nodeId: node.id,
                message: 'Notification template is empty',
            });
        }
        return issues;
    },

    async execute(node, input, context) {
        const { channel, template } = node.data;

        // Send notification
        await sendNotification(channel, template, input);

        return { output: input };
    },
};
```

### Configurable Extension

Use `createConfigurableExtension` for extensions with options:

```typescript
import { createConfigurableExtension } from 'or3-workflow-core';

interface NotificationOptions {
    defaultChannel?: 'email' | 'slack' | 'sms';
    requireApproval?: boolean;
}

const NotificationExtension = createConfigurableExtension<NotificationOptions>({
    name: 'notification',
    type: 'notification',

    getDefaultData(options) {
        return {
            label: 'Send Notification',
            channel: options.defaultChannel ?? 'email',
            requireApproval: options.requireApproval ?? false,
        };
    },

    // ... rest of extension
});

// Use with configuration
const editor = new WorkflowEditor({
    extensions: [
        NotificationExtension.configure({
            defaultChannel: 'slack',
            requireApproval: true,
        }),
    ],
});
```

### Making Existing Extensions Configurable

```typescript
import { makeConfigurable } from 'or3-workflow-core';

const ConfigurableExtension = makeConfigurable(MyExtension, {
    defaultOption: 'value',
});
```

## Extension Methods

### getDefaultData()

Returns default data for new nodes of this type:

```typescript
getDefaultData(options?: ExtensionOptions) {
  return {
    label: 'New Node',
    customField: options?.defaultValue ?? '',
  };
}
```

### validate()

Returns validation issues for a node:

```typescript
validate(
    node: WorkflowNode,
    edges: WorkflowEdge[],
    context?: ValidationContext
): (ValidationError | ValidationWarning)[] {
    const issues: (ValidationError | ValidationWarning)[] = [];

    // Check for errors
    if (!node.data.requiredField) {
        issues.push({
            type: 'error',
            code: 'INVALID_CONNECTION',
            nodeId: node.id,
            message: 'Required field is missing',
        });
    }

    // Check for warnings
    if (!node.data.optionalField) {
        issues.push({
            type: 'warning',
            code: 'EMPTY_PROMPT',
            nodeId: node.id,
            message: 'Optional field is empty',
        });
    }

    // Use context for deep validation
    if (context?.subflowRegistry && node.data.subflowId) {
        if (!context.subflowRegistry.has(node.data.subflowId)) {
            issues.push({
                type: 'error',
                code: 'SUBFLOW_NOT_FOUND',
                nodeId: node.id,
                message: `Subflow not found: ${node.data.subflowId}`,
            });
        }
    }

    return issues;
}
```

### execute()

Executes the node logic:

```typescript
async execute(
  context: ExecutionContext,
  node: WorkflowNode,
  provider?: LLMProvider
): Promise<NodeExecutionResult> {
  // Access context
  const { input, history, memory, signal, outputs, nodeChain } = context;

  // Check for cancellation
  if (signal?.aborted) {
    return { output: '', nextNodes: [] };
  }

  // Use streaming callback
  if (context.onToken) {
    context.onToken('Streaming...');
  }

  // Process with LLM
  if (provider) {
    const result = await provider.chat(
      node.data.model,
      [...history, { role: 'user', content: input }],
      {
        onToken: context.onToken,
        signal,
      }
    );
    return {
      output: result.content || '',
      nextNodes: context.getOutgoingEdges(node.id).map(e => e.target),
    };
  }

  // Return result
  return {
    output: input,
    nextNodes: context.getOutgoingEdges(node.id).map(e => e.target),
    metadata: { processed: true },
  };
}
```

### getDynamicOutputs()

Returns dynamic output ports based on node configuration:

```typescript
getDynamicOutputs(node: WorkflowNode) {
  const routes = node.data.routes as RouteDefinition[];

  return routes.map(route => ({
    id: `route-${route.id}`,
    label: route.label,
  }));
}
```

## Execution Context

The context passed to `execute()`:

```typescript
interface ExecutionContext {
    /** Input text for the current execution step */
    input: string;

    /** Conversation history */
    history: ChatMessage[];

    /** Long-term memory adapter */
    memory: MemoryAdapter;

    /** Multimodal attachments for this execution */
    attachments?: Attachment[];

    /** Callback for streaming tokens */
    onToken?: (token: string) => void;

    /** Callback for streaming reasoning/thinking tokens */
    onReasoning?: (token: string) => void;

    /** Outputs from previous nodes, keyed by node ID */
    outputs: Record<string, string>;

    /** Chain of executed node IDs */
    nodeChain: string[];

    /** Abort signal for cancellation */
    signal?: AbortSignal;

    /** Get a node by ID */
    getNode: (id: string) => WorkflowNode | undefined;

    /** Get outgoing edges from a node */
    getOutgoingEdges: (nodeId: string, sourceHandle?: string) => WorkflowEdge[];

    /** Global tool call handler */
    onToolCall?: (name: string, args: any) => Promise<string>;

    /** Session ID for the current execution */
    sessionId?: string;

    /** Execute a subgraph (for loops) */
    executeSubgraph?: (startNodeId: string, input: string) => Promise<{ output: string }>;

    /** Execute a complete workflow (for subflows) */
    executeWorkflow?: (workflow: WorkflowData, input: ExecutionInput) => Promise<ExecutionResult>;

    /** Registry for subflows */
    subflowRegistry?: SubflowRegistry;

    /** Custom evaluators for while loops */
    customEvaluators?: Record<string, (context, loopState) => Promise<boolean>>;

    /** Enable debug logging */
    debug?: boolean;

    /** Default model to use */
    defaultModel?: string;

    /** Current subflow nesting depth */
    subflowDepth?: number;

    /** Maximum subflow nesting depth */
    maxSubflowDepth?: number;

    /** Global tools available to all agents */
    tools?: ToolDefinition[];

    /** Maximum tool call iterations */
    maxToolIterations?: number;

    /** Behavior when max tool iterations is reached */
    onMaxToolIterations?: 'warning' | 'error' | 'hitl';

    /** HITL callback for human-in-the-loop requests */
    onHITLRequest?: (request: HITLRequest) => Promise<HITLResponse>;

    /** Token counter instance */
    tokenCounter?: TokenCounter;

    /** Compaction configuration */
    compaction?: CompactionConfig;

    /** Callback to report token usage */
    onTokenUsage?: (usage: TokenUsageDetails) => void;

    /** Callbacks for parallel branch streaming */
    onBranchToken?: (branchId: string, branchLabel: string, token: string) => void;
    onBranchStart?: (branchId: string, branchLabel: string) => void;
    onBranchComplete?: (branchId: string, branchLabel: string, output: string) => void;
}
```

## Port Definitions

```typescript
interface PortDefinition {
    /** Unique port ID */
    id: string;

    /** Display label */
    label?: string;

    /** Port type (input or output) */
    type: 'input' | 'output';

    /** Data type for the port */
    dataType?: 'any' | 'string' | 'object' | 'array';

    /** Whether this port is required (for inputs) */
    required?: boolean;

    /** Whether multiple connections are allowed */
    multiple?: boolean;
}
```

## Lifecycle Hooks

### onCreate()

Called when the extension is registered:

```typescript
onCreate() {
  console.log('Extension registered');
  // Initialize resources
}
```

### onDestroy()

Called when the editor is destroyed:

```typescript
onDestroy() {
  console.log('Cleaning up');
  // Release resources
}
```

## Custom Commands

Extensions can add custom commands:

```typescript
addCommands() {
  return {
    doCustomThing: (arg: string) => {
      // Custom logic
      this.editor.emit('customEvent', arg);
      return true;
    },
  };
}

// Usage
editor.extensionCommands.doCustomThing('value');
```

## Type Guards

Check node data types:

```typescript
import {
    isAgentNodeData,
    isRouterNodeData,
    isOutputNodeData,
} from 'or3-workflow-core';

if (isAgentNodeData(node.data)) {
    console.log(node.data.model); // Type-safe access
}
```

## Next Steps

-   [StarterKit](./starter-kit.md) - Pre-configured bundle
-   [Custom Extensions](../custom-extensions.md) - Full guide
-   [Node Types](../nodes/agent.md) - Built-in nodes
