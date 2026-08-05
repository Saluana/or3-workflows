/**
 * Adapters that wrap existing tool shapes as typed {@link WorkflowTool}s
 * (R5.AC2, R5.AC6).
 *
 * Legacy tools keep their execution code; the adapter only unifies inspection,
 * events, and policy. Conservative defaults are applied: `authority`
 * `host-client` (unless the host asserts otherwise), `sideEffect: 'none'` only
 * when explicitly asserted, `approval: 'policy'`, and `parallelSafe: false`.
 */
import type {
    ExecutableToolDefinition,
    ToolParameterSchema,
} from '../types';
import type { RegisteredTool } from '../extensions/ToolNodeExtension';
import type { ModelToolDescriptor } from '../gateway/types';
import type {
    ToolAuthority,
    ToolDescriptor,
    ToolExecutionContext,
    ToolSideEffect,
    WorkflowTool,
} from './types';

export interface LegacyAdapterOptions {
    authority?: ToolAuthority;
    sideEffect?: ToolSideEffect;
    /** Explicitly assert the tool is safe to run in parallel. */
    parallelSafe?: boolean;
}

function emptyObjectSchema(): Record<string, unknown> {
    return { type: 'object', properties: {}, additionalProperties: true };
}

/** Adapt an {@link ExecutableToolDefinition} (function tool) to a WorkflowTool. */
export function adaptExecutableTool(
    tool: ExecutableToolDefinition,
    options: LegacyAdapterOptions = {}
): WorkflowTool {
    const params = tool.function.parameters as
        | ToolParameterSchema
        | Record<string, unknown>
        | undefined;
    const descriptor: ToolDescriptor = {
        name: tool.function.name,
        description: tool.function.description,
        inputSchema: (params as Record<string, unknown>) ?? emptyObjectSchema(),
        authority: options.authority ?? 'host-client',
        sideEffect: options.sideEffect ?? 'none',
        approval: 'policy',
        parallelSafe: options.parallelSafe ?? false,
    };
    return {
        descriptor,
        execute: tool.handler
            ? async (input: unknown) => {
                  const result = await tool.handler!(input);
                  return result;
              }
            : undefined,
    };
}

/** Adapt an `or3-chat`-style {@link RegisteredTool} to a WorkflowTool. */
export function adaptRegisteredTool(
    tool: RegisteredTool,
    options: LegacyAdapterOptions = {}
): WorkflowTool {
    const descriptor: ToolDescriptor = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.configSchema ?? emptyObjectSchema(),
        authority: options.authority ?? 'host-client',
        sideEffect: options.sideEffect ?? 'none',
        approval: 'policy',
        parallelSafe: options.parallelSafe ?? false,
    };
    return {
        descriptor,
        execute: async (input: unknown, _context: ToolExecutionContext) => {
            return tool.handler(input);
        },
    };
}

/**
 * Create a descriptor for an OpenRouter-managed provider server tool. It carries
 * a transport gate and never has a local `execute` (R5.AC6, R6.AC4).
 */
export function providerServerTool(params: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    transport: 'chat' | 'responses' | 'either';
    permissions?: string[];
}): WorkflowTool {
    return {
        descriptor: {
            name: params.name,
            description: params.description,
            inputSchema: params.inputSchema ?? emptyObjectSchema(),
            authority: 'provider-server',
            sideEffect: 'none',
            approval: 'never',
            parallelSafe: true,
            permissions: params.permissions,
            transport: params.transport,
        },
    };
}

/** Project a WorkflowTool descriptor to a model-callable {@link ModelToolDescriptor}. */
export function toModelToolDescriptor(
    tool: WorkflowTool
): ModelToolDescriptor {
    if (tool.descriptor.authority === 'provider-server') {
        return {
            type: 'provider-server',
            name: tool.descriptor.name,
            transport: tool.descriptor.transport ?? 'either',
        };
    }
    return {
        type: 'function',
        function: {
            name: tool.descriptor.name,
            description: tool.descriptor.description,
            parameters: tool.descriptor.inputSchema,
        },
    };
}
