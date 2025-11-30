# Extensions

Extensions define node types with their behavior, validation, and execution logic. The extension system follows a TipTap-style architecture.

## Import

```typescript
import {
    StarterKit,
    AgentNodeExtension,
    createConfigurableExtension,
    makeConfigurable,
} from '@or3/workflow-core';
```

## Extension Interface

```typescript
interface Extension {
    /** Unique name */
    name: string;

    /** Node type for registration */
    type: string;

    /** Default data for new nodes */
    getDefaultData?: () => NodeData;

    /** Input port definitions */
    inputs?: PortDefinition[];

    /** Output port definitions */
    outputs?: PortDefinition[];

    /** Dynamic outputs based on node data */
    getDynamicOutputs?: (node: WorkflowNode) => PortDefinition[];

    /** Validation rules */
    validate?: (
        node: WorkflowNode,
        workflow: WorkflowData
    ) => ValidationIssue[];

    /** Execution logic */
    execute?: (
        node: WorkflowNode,
        input: string,
        context: ExecutionContext
    ) => Promise<ExecutionResult>;

    /** Lifecycle hooks */
    onCreate?: () => void;
    onDestroy?: () => void;

    /** Custom commands */
    addCommands?: () => Record<string, Command>;
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
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';

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
} from '@or3/workflow-core';

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
import { createConfigurableExtension } from '@or3/workflow-core';

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
import { makeConfigurable } from '@or3/workflow-core';

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
validate(node: WorkflowNode, workflow: { nodes: WorkflowNode[], edges: WorkflowEdge[] }) {
  const issues: ValidationIssue[] = [];

  // Check for errors
  if (!node.data.requiredField) {
    issues.push({
      type: 'error',
      code: 'MISSING_FIELD',
      nodeId: node.id,
      message: 'Required field is missing',
    });
  }

  // Check for warnings
  if (!node.data.optionalField) {
    issues.push({
      type: 'warning',
      code: 'EMPTY_FIELD',
      nodeId: node.id,
      message: 'Optional field is empty',
    });
  }

  return issues;
}
```

### execute()

Executes the node logic:

```typescript
async execute(
  node: WorkflowNode,
  input: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // Access context
  const { session, memory, client, signal, callbacks } = context;

  // Check for cancellation
  if (signal?.aborted) {
    return { output: '', cancelled: true };
  }

  // Process input
  const result = await processInput(input, node.data);

  // Return result
  return {
    output: result,
    nextHandleId: 'success', // For multi-output nodes
    metadata: { tokens: 100 },
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
    /** OpenRouter client */
    client: OpenRouter;

    /** Abort signal for cancellation */
    signal?: AbortSignal;

    /** Execution callbacks */
    callbacks?: ExecutionCallbacks;

    /** Session state */
    session: Session;

    /** Memory adapter */
    memory?: MemoryAdapter;

    /** Request HITL pause */
    requestHITL: (request: HITLRequest) => Promise<HITLResponse>;

    /** Other nodes in workflow */
    nodes: WorkflowNode[];

    /** Edges in workflow */
    edges: WorkflowEdge[];
}
```

## Port Definitions

```typescript
interface PortDefinition {
    /** Unique port ID */
    id: string;

    /** Display label */
    label: string;

    /** Port type (for styling) */
    type?: 'default' | 'error' | 'success';
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
} from '@or3/workflow-core';

if (isAgentNodeData(node.data)) {
    console.log(node.data.model); // Type-safe access
}
```

## Next Steps

-   [StarterKit](./starter-kit.md) - Pre-configured bundle
-   [Custom Extensions](../custom-extensions.md) - Full guide
-   [Node Types](../nodes/agent.md) - Built-in nodes
