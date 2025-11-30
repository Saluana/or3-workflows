import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    BaseNodeData,
    ExecutionContext,
    ValidationError,
    ValidationWarning
} from '../types';

/**
 * Output format types.
 */
export type OutputFormat = 'text' | 'json' | 'markdown';

/**
 * Data for an Output node.
 * Output nodes are terminal nodes that format the final workflow result.
 */
export interface OutputNodeData extends BaseNodeData {
    /** Output format */
    format: OutputFormat;

    /** Template with {{nodeId}} placeholders for interpolation */
    template?: string;

    /** Include execution metadata in output */
    includeMetadata?: boolean;

    /** JSON schema to validate output against (for future use) */
    schema?: Record<string, unknown>;
}

/**
 * Type guard to check if node data is OutputNodeData.
 */
export function isOutputNodeData(data: unknown): data is OutputNodeData {
    if (typeof data !== 'object' || data === null) {
        return false;
    }

    const nodeData = data as Record<string, unknown>;

    return (
        typeof nodeData.format === 'string' &&
        ['text', 'json', 'markdown'].includes(nodeData.format)
    );
}

/**
 * Interpolate a template string with values from outputs.
 *
 * @param template Template string with {{nodeId}} placeholders
 * @param outputs Map of node IDs to their output values
 * @returns Interpolated string
 *
 * @example
 * ```typescript
 * const result = interpolateTemplate(
 *   'Summary: {{summarizer}} | Analysis: {{analyzer}}',
 *   { summarizer: 'Brief summary', analyzer: 'Key insights' }
 * );
 * // => 'Summary: Brief summary | Analysis: Key insights'
 * ```
 */
export function interpolateTemplate(
    template: string,
    outputs: Record<string, string>
): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, nodeId) => {
        return outputs[nodeId] ?? match;
    });
}

/**
 * Format output based on the specified format.
 *
 * @param content The content to format
 * @param format The output format
 * @param options Additional formatting options
 * @returns Formatted output string
 */
export function formatOutput(
    content: string,
    format: OutputFormat,
    options: {
        includeMetadata?: boolean;
        nodeChain?: string[];
    } = {}
): string {
    switch (format) {
        case 'json': {
            try {
                const parsed = JSON.parse(content);
                const output = options.includeMetadata
                    ? {
                          result: parsed,
                          metadata: {
                              nodeChain: options.nodeChain || [],
                              timestamp: new Date().toISOString(),
                          },
                      }
                    : parsed;
                return JSON.stringify(output, null, 2);
            } catch {
                // Not valid JSON, wrap it
                const output = options.includeMetadata
                    ? {
                          result: content,
                          metadata: {
                              nodeChain: options.nodeChain || [],
                              timestamp: new Date().toISOString(),
                          },
                      }
                    : { result: content };
                return JSON.stringify(output, null, 2);
            }
        }

        case 'markdown': {
            // For markdown, just pass through
            // Could add metadata as YAML frontmatter in the future
            if (options.includeMetadata) {
                const metadata = `---
nodeChain: [${(options.nodeChain || []).join(', ')}]
timestamp: ${new Date().toISOString()}
---

`;
                return metadata + content;
            }
            return content;
        }

        case 'text':
        default: {
            if (options.includeMetadata) {
                const metadata = `[Executed: ${(options.nodeChain || []).join(
                    ' → '
                )}]\n[Time: ${new Date().toISOString()}]\n\n`;
                return metadata + content;
            }
            return content;
        }
    }
}

/**
 * Output Node Extension
 *
 * Represents a terminal node that formats the final workflow output.
 * Output nodes have no outgoing connections and mark the end of a workflow branch.
 *
 * @example
 * ```typescript
 * const outputNode: WorkflowNode = {
 *   id: 'output-1',
 *   type: 'output',
 *   position: { x: 400, y: 200 },
 *   data: {
 *     label: 'Final Output',
 *     format: 'json',
 *     template: '{"summary": "{{summarizer}}", "analysis": "{{analyzer}}"}',
 *     includeMetadata: true,
 *   },
 * };
 * ```
 */
export const OutputNodeExtension: NodeExtension = {
    name: 'output',
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
    outputs: [], // Terminal node - no outputs

    // Default data for new nodes
    defaultData: {
        label: 'Output',
        format: 'text',
        includeMetadata: false,
    },

    /**
     * Execute the output node.
     *
     * @internal Execution is handled by OpenRouterExecutionAdapter.
     * Calling this directly will raise to prevent confusing placeholder data.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode
    ): Promise<{ output: string; nextNodes: string[] }> {
        const data = node.data as OutputNodeData;

        let content: string;

        // Apply template interpolation if template is provided
        if (data.template) {
            content = interpolateTemplate(data.template, context.outputs);
        } else {
            content = context.input;
        }

        // Format output based on format type
        const output = formatOutput(content, data.format, {
            includeMetadata: data.includeMetadata,
            nodeChain: context.nodeChain,
        });

        return {
            output,
            nextNodes: [], // Terminal node - no next nodes
        };
    },

    /**
     * Validate the output node.
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as OutputNodeData;

        // Check for valid format
        if (
            !data.format ||
            !['text', 'json', 'markdown'].includes(data.format)
        ) {
            errors.push({
                type: 'error',
                code: 'MISSING_REQUIRED_PORT',
                message:
                    'Output node requires a valid format (text, json, or markdown)',
                nodeId: node.id,
            });
        }

        // Check for incoming edges
        const hasIncomingEdge = edges.some((edge) => edge.target === node.id);
        if (!hasIncomingEdge) {
            errors.push({
                type: 'warning',
                code: 'NO_INPUT',
                message: 'Output node has no incoming connections',
                nodeId: node.id,
            });
        }

        // Warn if node has outgoing edges (terminal node shouldn't)
        const hasOutgoingEdge = edges.some((edge) => edge.source === node.id);
        if (hasOutgoingEdge) {
            errors.push({
                type: 'warning',
                code: 'NO_OUTPUT',
                message:
                    'Output node is a terminal node and should not have outgoing connections',
                nodeId: node.id,
            });
        }

        // Validate template if provided
        if (data.template) {
            const placeholders = data.template.match(/\{\{(\w+)\}\}/g) || [];
            if (placeholders.length === 0) {
                errors.push({
                    type: 'warning',
                    code: 'EMPTY_PROMPT',
                    message:
                        'Template has no {{nodeId}} placeholders - consider using plain text format',
                    nodeId: node.id,
                });
            }
        }

        return errors;
    },
};

/**
 * Extract placeholder node IDs from a template.
 *
 * @param template Template string with {{nodeId}} placeholders
 * @returns Array of node IDs referenced in the template
 */
export function extractTemplatePlaceholders(template: string): string[] {
    const matches = template.match(/\{\{(\w+)\}\}/g) || [];
    return matches.map((m) => m.slice(2, -2));
}
