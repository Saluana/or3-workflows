# Tool Node

Execute external functions and tools.

## Overview

Tool nodes call registered functions/tools and pass results to the next node. Useful for API calls, database queries, and external integrations.

## Import

```typescript
import { ToolNodeExtension, toolRegistry } from 'or3-workflow-core';
```

## Configuration

```typescript
interface ToolNodeData {
    /** Display label */
    label: string;

    /** Registered tool ID */
    toolId: string;

    /** Static arguments (merged with input) */
    arguments?: Record<string, unknown>;
}
```

## Ports

| Port     | Type   | Description    |
| -------- | ------ | -------------- |
| `input`  | Input  | Tool arguments |
| `output` | Output | Tool result    |
| `error`  | Output | Error branch   |

## Registering Tools

```typescript
import { toolRegistry } from 'or3-workflow-core';

toolRegistry.register({
    name: 'search_web',
    description: 'Search the web for information',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search query',
            },
            maxResults: {
                type: 'number',
                description: 'Maximum results to return',
                default: 5,
            },
        },
        required: ['query'],
    },
    handler: async (args) => {
        const results = await webSearch(args.query, args.maxResults);
        return JSON.stringify(results);
    },
});
```

## Usage

```typescript
editor.commands.createNode(
    'tool',
    {
        label: 'Web Search',
        toolId: 'search_web',
        arguments: {
            maxResults: 10,
        },
    },
    { x: 100, y: 200 }
);
```

## Tool Definition

```typescript
interface RegisteredTool {
    /** Unique tool name */
    name: string;

    /** Description for LLM */
    description: string;

    /** JSON Schema for parameters */
    parameters: {
        type: 'object';
        properties: Record<
            string,
            {
                type: string;
                description?: string;
                default?: unknown;
                enum?: unknown[];
            }
        >;
        required?: string[];
    };

    /** Async handler function */
    handler: (args: Record<string, unknown>) => Promise<string>;
}
```

## Tool Registry

### register()

Add a tool:

```typescript
toolRegistry.register({
  name: 'my_tool',
  description: '...',
  parameters: { ... },
  handler: async (args) => { ... },
});
```

### get()

Retrieve a tool:

```typescript
const tool = toolRegistry.get('my_tool');
if (tool) {
    const result = await tool.handler({ query: 'test' });
}
```

### list()

Get all registered tools:

```typescript
const tools = toolRegistry.list();
// ['search_web', 'send_email', 'query_database', ...]
```

### unregister()

Remove a tool:

```typescript
toolRegistry.unregister('my_tool');
```

## Execution

Tool nodes execute the registered handler:

```typescript
// Input from previous node
const input = { query: 'latest news', maxResults: 5 };

// Merged with static arguments
const args = { ...node.data.arguments, ...input };

// Handler called
const result = await tool.handler(args);

// Result passed to next node
```

## Error Handling

Tools can throw errors:

```typescript
toolRegistry.register({
    name: 'risky_operation',
    handler: async (args) => {
        if (!args.confirmed) {
            throw new Error('Operation not confirmed');
        }
        return await performOperation();
    },
});
```

Connect error path:

```typescript
editor.commands.createEdge(toolId, errorHandler, 'error');
```

## Validation

| Code               | Type  | Description          |
| ------------------ | ----- | -------------------- |
| `MISSING_TOOL_ID`  | Error | No tool ID specified |
| `UNKNOWN_TOOL`     | Error | Tool not registered  |
| `NO_INCOMING_EDGE` | Error | Node not connected   |

## Examples

### Database Query

```typescript
toolRegistry.register({
    name: 'query_users',
    description: 'Query the user database',
    parameters: {
        type: 'object',
        properties: {
            filter: { type: 'string' },
            limit: { type: 'number', default: 10 },
        },
        required: ['filter'],
    },
    handler: async (args) => {
        const users = await db.users.find(args.filter).limit(args.limit);
        return JSON.stringify(users);
    },
});
```

### Send Email

```typescript
toolRegistry.register({
    name: 'send_email',
    description: 'Send an email',
    parameters: {
        type: 'object',
        properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
        },
        required: ['to', 'subject', 'body'],
    },
    handler: async (args) => {
        await emailService.send(args);
        return 'Email sent successfully';
    },
});
```

### HTTP Request

```typescript
toolRegistry.register({
    name: 'http_get',
    description: 'Make an HTTP GET request',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string' },
            headers: { type: 'object' },
        },
        required: ['url'],
    },
    handler: async (args) => {
        const response = await fetch(args.url, {
            headers: args.headers,
        });
        return await response.text();
    },
});
```

## Agent Integration

Enable tool calling in agents:

```typescript
editor.commands.createNode('agent', {
    label: 'Assistant with Tools',
    model: 'openai/gpt-4o',
    prompt: 'You are an assistant with access to tools.',
    tools: ['search_web', 'query_users'], // Enable specific tools
});
```

The agent can then call these tools during execution.

## Best Practices

### 1. Clear Descriptions

```typescript
{
  name: 'calculate_shipping',
  description: 'Calculate shipping cost for a package. Returns cost in USD.',
}
```

### 2. Validate Input

```typescript
handler: async (args) => {
    if (!args.address?.zip) {
        throw new Error('ZIP code is required');
    }
    // ...
};
```

### 3. Return Strings

Tool handlers should return strings:

```typescript
handler: async (args) => {
    const result = await fetchData();
    return JSON.stringify(result); // Convert to string
};
```

### 4. Handle Errors Gracefully

```typescript
handler: async (args) => {
    try {
        return await riskyOperation();
    } catch (error) {
        return JSON.stringify({
            error: true,
            message: error.message,
        });
    }
};
```

## Vue Component

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="tool-node">
            <div class="icon">🔧</div>
            <div class="label">{{ node.data.label }}</div>
            <div class="tool-id">{{ node.data.toolId }}</div>
        </div>
    </NodeWrapper>
</template>
```

## Next Steps

-   [Subflow Node](./subflow.md) - Nested workflows
-   [Output Node](./output.md) - Format results
