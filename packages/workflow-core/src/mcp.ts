/**
 * MCP (Model Context Protocol) tool adapter.
 *
 * Converts MCP server tools into ExecutableToolDefinition[] that agents can
 * call via the existing tool loop — without hard-depending on the MCP SDK.
 *
 * Pass any client that implements {@link McpClientLike} (e.g. a thin wrapper
 * around `@modelcontextprotocol/sdk` Client, or a custom HTTP MCP client).
 *
 * @module mcp
 */

import type { ExecutableToolDefinition } from './types';
import { ToolRegistry, toolRegistry, type RegisteredTool } from './extensions/ToolNodeExtension';

/**
 * Minimal MCP tool descriptor (subset of MCP ListTools result).
 */
export interface McpToolDescriptor {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

/**
 * Minimal MCP client surface needed to import tools.
 * Compatible with `@modelcontextprotocol/sdk` Client after a thin wrap.
 */
export interface McpClientLike {
    listTools(): Promise<{ tools: McpToolDescriptor[] }>;
    callTool(
        name: string,
        args: Record<string, unknown>
    ): Promise<unknown>;
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
            .map((p) => (typeof p.text === 'string' ? p.text : JSON.stringify(p)))
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
                    throw new Error(`No handler for tool ${tool.function.name}`);
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
    async register(registry?: ToolRegistry): Promise<ExecutableToolDefinition[]> {
        return registerMcpTools(this.client, {
            ...this.options,
            registry,
        });
    }
}
