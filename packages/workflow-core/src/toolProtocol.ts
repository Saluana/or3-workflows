/**
 * Tool-calling protocol helpers: Zod/JSON-Schema validation, parallel
 * execution, and stable tool_call_id generation.
 *
 * @module toolProtocol
 */

import { z } from 'zod';
import type { ToolCallResult, ToolParameterSchema } from './types';

export interface ToolArgValidationSuccess {
    success: true;
    data: unknown;
}

export interface ToolArgValidationFailure {
    success: false;
    error: string;
    issues?: Array<{ path: string; message: string }>;
}

export type ToolArgValidationResult =
    | ToolArgValidationSuccess
    | ToolArgValidationFailure;

/**
 * Validate tool arguments against an optional Zod schema or JSON Schema
 * `parameters` object (required fields + basic type checks).
 */
export function validateToolArgs(
    args: unknown,
    options?: {
        zodSchema?: z.ZodType;
        parameters?: ToolParameterSchema | Record<string, unknown>;
    }
): ToolArgValidationResult {
    if (options?.zodSchema) {
        const parsed = options.zodSchema.safeParse(args);
        if (parsed.success) {
            return { success: true, data: parsed.data };
        }
        return {
            success: false,
            error: parsed.error.issues
                .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
                .join('; '),
            issues: parsed.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
            })),
        };
    }

    const parameters = options?.parameters;
    if (!parameters || typeof parameters !== 'object') {
        return { success: true, data: args };
    }

    const schema = parameters as ToolParameterSchema;
    const required = schema.required ?? [];
    const properties = schema.properties ?? {};

    if (args == null || typeof args !== 'object' || Array.isArray(args)) {
        if (required.length === 0) {
            return { success: true, data: args ?? {} };
        }
        return {
            success: false,
            error: 'Tool arguments must be a JSON object',
        };
    }

    const obj = args as Record<string, unknown>;
    const issues: Array<{ path: string; message: string }> = [];

    for (const key of required) {
        if (obj[key] === undefined || obj[key] === null) {
            issues.push({ path: key, message: 'Required' });
        }
    }

    for (const [key, propSchema] of Object.entries(properties)) {
        if (obj[key] === undefined) continue;
        const expectedType = propSchema?.type;
        if (typeof expectedType !== 'string') continue;
        const value = obj[key];
        const actual =
            value === null
                ? 'null'
                : Array.isArray(value)
                  ? 'array'
                  : typeof value;
        const ok =
            (expectedType === 'integer' && actual === 'number') ||
            expectedType === actual ||
            (expectedType === 'number' && actual === 'number');
        if (!ok) {
            issues.push({
                path: key,
                message: `Expected ${expectedType}, got ${actual}`,
            });
        }
    }

    if (issues.length > 0) {
        return {
            success: false,
            error: issues.map((i) => `${i.path}: ${i.message}`).join('; '),
            issues,
        };
    }

    return { success: true, data: args };
}

/**
 * Stable tool_call_id for resume/retry idempotency.
 * Prefers the provider-supplied id; otherwise derives a deterministic id from
 * node + tool + args + iteration.
 */
export function stableToolCallId(options: {
    providerId?: string;
    nodeId: string;
    toolName: string;
    argsJson: string;
    iteration: number;
}): string {
    if (options.providerId && options.providerId.length > 0) {
        return options.providerId;
    }
    const material = [
        options.nodeId,
        options.toolName,
        options.argsJson,
        String(options.iteration),
    ].join('|');
    return `tc_${fnv1a(material)}`;
}

/** Simple non-crypto hash for stable ids (browser + node safe). */
function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface ExecutableToolCall {
    toolCall: ToolCallResult;
    toolName: string;
    toolCallId: string;
    parsedArgs: unknown;
    validationError?: string;
}

/**
 * Normalize provider tool calls: ensure ids, parse args, validate.
 */
export function prepareToolCalls(
    toolCalls: ToolCallResult[],
    options: {
        nodeId: string;
        iteration: number;
        getZodSchema?: (toolName: string) => z.ZodType | undefined;
        getParameters?: (
            toolName: string
        ) => ToolParameterSchema | Record<string, unknown> | undefined;
    }
): ExecutableToolCall[] {
    return toolCalls.map((toolCall, index) => {
        const toolName = toolCall.function?.name || 'unknown_tool';
        const argsJson =
            typeof toolCall.function?.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function?.arguments ?? {});

        let parsedArgs: unknown;
        try {
            parsedArgs = JSON.parse(argsJson);
        } catch {
            parsedArgs = argsJson;
        }

        const toolCallId = stableToolCallId({
            providerId: toolCall.id,
            nodeId: options.nodeId,
            toolName,
            argsJson,
            iteration: options.iteration * 1000 + index,
        });

        const validation = validateToolArgs(parsedArgs, {
            zodSchema: options.getZodSchema?.(toolName),
            parameters: options.getParameters?.(toolName),
        });

        return {
            toolCall: {
                ...toolCall,
                id: toolCallId,
                type: 'function' as const,
                function: {
                    name: toolName,
                    arguments: argsJson,
                },
            },
            toolName,
            toolCallId,
            parsedArgs: validation.success ? validation.data : parsedArgs,
            validationError: validation.success ? undefined : validation.error,
        };
    });
}

/**
 * Execute prepared tool calls in parallel (independent tools in one turn).
 */
export async function executeToolCallsParallel(
    prepared: ExecutableToolCall[],
    executeOne: (call: ExecutableToolCall) => Promise<string>
): Promise<Array<{ call: ExecutableToolCall; result: string; error?: string }>> {
    return Promise.all(
        prepared.map(async (call) => {
            if (call.validationError) {
                return {
                    call,
                    result: `Tool argument validation failed: ${call.validationError}`,
                    error: call.validationError,
                };
            }
            try {
                const result = await executeOne(call);
                return { call, result };
            } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                return {
                    call,
                    result: `Error executing tool ${call.toolName}: ${error}`,
                    error,
                };
            }
        })
    );
}
