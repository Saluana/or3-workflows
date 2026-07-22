/**
 * MCP (Model Context Protocol) adapter.
 *
 * Converts MCP server tools / resources / prompts into workflow-usable surfaces
 * without hard-depending on the MCP SDK.
 *
 * Pass any client that implements {@link McpClientLike} (e.g. a thin wrapper
 * around `@modelcontextprotocol/sdk` Client, or a custom HTTP MCP client).
 *
 * @module mcp
 */

import type { ExecutableToolDefinition } from './types';
import {
    ToolRegistry,
    toolRegistry,
    type RegisteredTool,
} from './extensions/ToolNodeExtension';

/**
 * Minimal MCP tool descriptor (subset of MCP ListTools result).
 */
export interface McpToolDescriptor {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

/** MCP resource descriptor (ListResources). */
export interface McpResourceDescriptor {
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
}

/** MCP prompt descriptor (ListPrompts). */
export interface McpPromptDescriptor {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

/**
 * Minimal MCP client surface needed to import tools/resources/prompts.
 * Compatible with `@modelcontextprotocol/sdk` Client after a thin wrap.
 */
export interface McpClientLike {
    listTools(): Promise<{ tools: McpToolDescriptor[] }>;
    callTool(
        name: string,
        args: Record<string, unknown>
    ): Promise<unknown>;
    listResources?(): Promise<{ resources: McpResourceDescriptor[] }>;
    readResource?(uri: string): Promise<unknown>;
    listPrompts?(): Promise<{ prompts: McpPromptDescriptor[] }>;
    getPrompt?(
        name: string,
        args?: Record<string, string>
    ): Promise<unknown>;
    /** Optional session teardown (close transport / disconnect). */
    close?(): Promise<void> | void;
}

export interface McpToolsOptions {
    /** Prefix tool function names (e.g. "mcp_") to avoid collisions */
    prefix?: string;
    /** Only include tools whose names match (exact) */
    include?: string[];
    /** Exclude tools by exact name */
    exclude?: string[];
    /** Namespace used when registering into ToolRegistry ids */
    registryNamespace?: string;
}

export interface McpSessionOptions extends McpToolsOptions {
    /**
     * Scope id for this session (e.g. workflow sessionId). Used for
     * namespacing registry entries and diagnostics.
     */
    sessionId?: string;
    /** When true, unregister session tools on close (default: true) */
    unregisterOnClose?: boolean;
}

function formatMcpResult(result: unknown): string {
    if (result == null) {
        return '';
    }
    if (typeof result === 'string') {
        return result;
    }
    // MCP CallToolResult typically has { content: Array<{ type, text }> }
    if (
        typeof result === 'object' &&
        result !== null &&
        'content' in result &&
        Array.isArray((result as { content: unknown }).content)
    ) {
        const parts = (
            result as {
                content: Array<{ type?: string; text?: string }>;
            }
        ).content;
        return parts
            .map((p) =>
                typeof p.text === 'string' ? p.text : JSON.stringify(p)
            )
            .join('\n');
    }
    try {
        return JSON.stringify(result);
    } catch {
        return String(result);
    }
}

function shouldIncludeTool(
    name: string,
    options?: McpToolsOptions
): boolean {
    if (options?.include && !options.include.includes(name)) {
        return false;
    }
    if (options?.exclude?.includes(name)) {
        return false;
    }
    return true;
}

/**
 * List tools from an MCP client and convert them to executable tool definitions
 * for use in `ExecutionOptions.tools`.
 *
 * @example
 * ```typescript
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 * import { mcpToolsToExecutable, OpenRouterExecutionAdapter } from 'or3-workflow-core';
 *
 * // Wrap official SDK to match McpClientLike
 * const mcp: McpClientLike = {
 *   listTools: () => client.listTools(),
 *   callTool: (name, args) => client.callTool({ name, arguments: args }),
 * };
 *
 * const tools = await mcpToolsToExecutable(mcp, { prefix: 'mcp_' });
 * const adapter = new OpenRouterExecutionAdapter(llm, { tools });
 * ```
 */
export async function mcpToolsToExecutable(
    client: McpClientLike,
    options?: McpToolsOptions
): Promise<ExecutableToolDefinition[]> {
    const { tools } = await client.listTools();
    const prefix = options?.prefix ?? '';

    return tools
        .filter((tool) => shouldIncludeTool(tool.name, options))
        .map((tool) => {
            const functionName = `${prefix}${tool.name}`;
            return {
                type: 'function' as const,
                function: {
                    name: functionName,
                    description: tool.description || `MCP tool: ${tool.name}`,
                    parameters: (tool.inputSchema ?? {
                        type: 'object',
                        properties: {},
                    }) as ExecutableToolDefinition['function']['parameters'],
                },
                handler: async (args: unknown) => {
                    const argObj =
                        args && typeof args === 'object'
                            ? (args as Record<string, unknown>)
                            : {};
                    const result = await client.callTool(tool.name, argObj);
                    return formatMcpResult(result);
                },
            };
        });
}

/**
 * List resources from an MCP client (empty array if unsupported).
 */
export async function mcpListResources(
    client: McpClientLike
): Promise<McpResourceDescriptor[]> {
    if (!client.listResources) return [];
    const { resources } = await client.listResources();
    return resources ?? [];
}

/**
 * Read a resource URI and return a string payload.
 */
export async function mcpReadResource(
    client: McpClientLike,
    uri: string
): Promise<string> {
    if (!client.readResource) {
        throw new Error('MCP client does not support readResource');
    }
    const result = await client.readResource(uri);
    return formatMcpResult(result);
}

/**
 * List prompts from an MCP client (empty array if unsupported).
 */
export async function mcpListPrompts(
    client: McpClientLike
): Promise<McpPromptDescriptor[]> {
    if (!client.listPrompts) return [];
    const { prompts } = await client.listPrompts();
    return prompts ?? [];
}

/**
 * Fetch a prompt template/messages from the MCP server.
 */
export async function mcpGetPrompt(
    client: McpClientLike,
    name: string,
    args?: Record<string, string>
): Promise<string> {
    if (!client.getPrompt) {
        throw new Error('MCP client does not support getPrompt');
    }
    const result = await client.getPrompt(name, args);
    return formatMcpResult(result);
}

/**
 * Convert MCP tools and register them on a {@link ToolRegistry}.
 * Also returns the ExecutableToolDefinition[] for ExecutionOptions.tools.
 */
export async function registerMcpTools(
    client: McpClientLike,
    options?: McpToolsOptions & { registry?: ToolRegistry }
): Promise<ExecutableToolDefinition[]> {
    const executable = await mcpToolsToExecutable(client, options);
    const registry = options?.registry ?? toolRegistry;
    const ns = options?.registryNamespace ?? 'mcp';

    for (const tool of executable) {
        const registered: RegisteredTool = {
            id: `${ns}:${tool.function.name}`,
            name: tool.function.name,
            description: tool.function.description,
            configSchema: tool.function.parameters as Record<string, unknown>,
            handler: async (input, _config) => {
                if (!tool.handler) {
                    throw new Error(
                        `No handler for tool ${tool.function.name}`
                    );
                }
                return tool.handler(input);
            },
        };
        registry.register(registered);
    }

    return executable;
}

/**
 * Adapter class that caches listed tools and exposes helpers.
 */
export class McpToolAdapter {
    private cached: ExecutableToolDefinition[] | null = null;

    constructor(
        private readonly client: McpClientLike,
        private readonly options?: McpToolsOptions
    ) {}

    /** List + convert tools (cached after first call). */
    async getTools(forceRefresh = false): Promise<ExecutableToolDefinition[]> {
        if (!this.cached || forceRefresh) {
            this.cached = await mcpToolsToExecutable(
                this.client,
                this.options
            );
        }
        return this.cached;
    }

    /** Register tools onto a registry (defaults to global toolRegistry). */
    async register(
        registry?: ToolRegistry
    ): Promise<ExecutableToolDefinition[]> {
        return registerMcpTools(this.client, {
            ...this.options,
            registry,
        });
    }

    async listResources(): Promise<McpResourceDescriptor[]> {
        return mcpListResources(this.client);
    }

    async readResource(uri: string): Promise<string> {
        return mcpReadResource(this.client, uri);
    }

    async listPrompts(): Promise<McpPromptDescriptor[]> {
        return mcpListPrompts(this.client);
    }

    async getPrompt(
        name: string,
        args?: Record<string, string>
    ): Promise<string> {
        return mcpGetPrompt(this.client, name, args);
    }
}

/**
 * Session-scoped MCP lifecycle: load tools (optionally register), then close
 * and unregister when the workflow run ends.
 */
export class McpSession {
    private tools: ExecutableToolDefinition[] | null = null;
    private registeredIds: string[] = [];
    private closed = false;

    constructor(
        private readonly client: McpClientLike,
        private readonly options: McpSessionOptions = {}
    ) {}

    get sessionId(): string | undefined {
        return this.options.sessionId;
    }

    /** Load tools for this session (cached). */
    async getTools(forceRefresh = false): Promise<ExecutableToolDefinition[]> {
        this.ensureOpen();
        if (!this.tools || forceRefresh) {
            this.tools = await mcpToolsToExecutable(this.client, this.options);
        }
        return this.tools;
    }

    /** Register tools into a registry under a session-scoped namespace. */
    async register(
        registry: ToolRegistry = toolRegistry
    ): Promise<ExecutableToolDefinition[]> {
        this.ensureOpen();
        const ns =
            this.options.registryNamespace ??
            (this.options.sessionId
                ? `mcp:${this.options.sessionId}`
                : 'mcp');
        const tools = await registerMcpTools(this.client, {
            ...this.options,
            registryNamespace: ns,
            registry,
        });
        this.tools = tools;
        this.registeredIds = tools.map((t) => `${ns}:${t.function.name}`);
        return tools;
    }

    async listResources(): Promise<McpResourceDescriptor[]> {
        this.ensureOpen();
        return mcpListResources(this.client);
    }

    async readResource(uri: string): Promise<string> {
        this.ensureOpen();
        return mcpReadResource(this.client, uri);
    }

    async listPrompts(): Promise<McpPromptDescriptor[]> {
        this.ensureOpen();
        return mcpListPrompts(this.client);
    }

    async getPrompt(
        name: string,
        args?: Record<string, string>
    ): Promise<string> {
        this.ensureOpen();
        return mcpGetPrompt(this.client, name, args);
    }

    /**
     * Tear down the session: unregister tools and optionally close the client.
     */
    async close(registry: ToolRegistry = toolRegistry): Promise<void> {
        if (this.closed) return;
        this.closed = true;

        const shouldUnregister = this.options.unregisterOnClose !== false;
        if (shouldUnregister) {
            for (const id of this.registeredIds) {
                try {
                    registry.unregister(id);
                } catch {
                    // Best-effort cleanup
                }
            }
        }
        this.registeredIds = [];
        this.tools = null;

        await this.client.close?.();
    }

    private ensureOpen(): void {
        if (this.closed) {
            throw new Error('McpSession is closed');
        }
    }
}
