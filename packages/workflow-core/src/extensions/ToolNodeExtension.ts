import type {
  NodeExtension,
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
  ToolNodeData,
} from '../types';
import type { ValidationError } from '../validation';

/**
 * Tool Node Extension
 * 
 * Represents a tool/action execution node. This is a placeholder for future
 * implementation of custom tool nodes that can execute arbitrary actions.
 * 
 * Tools can be:
 * - API calls
 * - Database operations
 * - File operations
 * - Custom functions
 */
export const ToolNodeExtension: NodeExtension = {
  name: 'tool',
  type: 'node',

  // Port definitions
  inputs: [
    {
      id: 'input',
      type: 'input',
      label: 'Input',
      dataType: 'any',
      required: true,
    },
  ],
  outputs: [
    {
      id: 'output',
      type: 'output',
      label: 'Output',
      dataType: 'any',
    },
    {
      id: 'error',
      type: 'output',
      label: 'Error',
      dataType: 'string',
    },
  ],

  // Default data for new nodes
  defaultData: {
    label: 'Tool',
    toolId: '',
    config: {},
  },

  /**
   * Execute the tool node.
   * This is a placeholder - actual tool execution would be implemented
   * based on the registered tool handlers.
   * 
   * @internal Called by the execution adapter or manually for custom runtimes.
   */
  async execute(context: ExecutionContext): Promise<{ output: string; error?: string; nextNodes: string[] }> {
    const data = context.node.data as ToolNodeData;

    // Validate tool configuration
    if (!data.toolId) {
      return {
        output: '',
        error: 'No tool configured',
        nextNodes: [],
      };
    }

    const tool = toolRegistry.get(data.toolId);
    if (!tool) {
      return {
        output: '',
        error: `Tool not registered: ${data.toolId}`,
        nextNodes: [],
      };
    }

    try {
      const output = await tool.handler(context.input, data.config);
      return {
        output,
        nextNodes: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: message,
        nextNodes: [],
      };
    }
  },

  /**
   * Validate the tool node.
   */
  validate(node: WorkflowNode, edges: WorkflowEdge[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const data = node.data as ToolNodeData;

    // Check for tool ID
    if (!data.toolId) {
      errors.push({
        type: 'error',
        code: 'MISSING_REQUIRED_PORT',
        message: 'Tool node requires a tool to be selected',
        nodeId: node.id,
      });
    }

    // Check for incoming connections
    const incomingEdges = edges.filter(e => e.target === node.id);
    if (incomingEdges.length === 0) {
      errors.push({
        type: 'error',
        code: 'DISCONNECTED_NODE',
        message: 'Tool node has no incoming connections',
        nodeId: node.id,
      });
    }

    return errors;
  },
};

/**
 * Tool Registry
 * 
 * A registry for custom tools that can be used with ToolNode.
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
  async execute(toolId: string, input: any, config?: Record<string, any>): Promise<string> {
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
