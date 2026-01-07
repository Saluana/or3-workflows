/**
 * Tool Registry
 *
 * A registry for custom tools that can be used by agents or custom executors.
 * Tools are registered with a unique ID and a handler function.
 */
export class ToolRegistry {
    private tools: Map<string, RegisteredTool> = new Map();

    /**
     * Register a new tool.
     */
    register(tool: RegisteredTool): void {
        if (this.tools.has(tool.id)) {
            console.warn(`Tool ${tool.id} is already registered. Overwriting.`);
        }
        this.tools.set(tool.id, tool);
    }

    /**
     * Unregister a tool.
     */
    unregister(toolId: string): void {
        this.tools.delete(toolId);
    }

    /**
     * Get a registered tool by ID.
     */
    get(toolId: string): RegisteredTool | undefined {
        return this.tools.get(toolId);
    }

    /**
     * Get all registered tools.
     */
    getAll(): RegisteredTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Execute a tool by ID.
     */
    async execute(
        toolId: string,
        input: any,
        config?: Record<string, any>
    ): Promise<string> {
        const tool = this.tools.get(toolId);
        if (!tool) {
            throw new Error(`Tool not found: ${toolId}`);
        }
        return tool.handler(input, config);
    }
}

/**
 * Registered tool definition.
 */
export interface RegisteredTool {
    id: string;
    name: string;
    description?: string;
    category?: string;
    icon?: string;
    /** JSON Schema for configuration */
    configSchema?: Record<string, any>;
    /** The tool handler function */
    handler: (input: any, config?: Record<string, any>) => Promise<string>;
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();
