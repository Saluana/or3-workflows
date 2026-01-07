/**
 * Subflow types and registry for reusable workflow components.
 *
 * Subflows are workflows marked as reusable with defined input/output contracts.
 * They execute with isolated context but can optionally share session memory.
 *
 * @module subflow
 */

import type { WorkflowData, BaseNodeData } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Port type for subflow inputs and outputs.
 */
export type SubflowPortType = 'string' | 'number' | 'object' | 'array' | 'any';

/**
 * Input port definition for a subflow.
 */
export interface SubflowInput {
    /** Unique identifier for the input */
    id: string;
    /** Display name */
    name: string;
    /** Data type */
    type: SubflowPortType;
    /** Whether this input is required */
    required?: boolean;
    /** Default value if not provided */
    default?: unknown;
}

/**
 * Output port definition for a subflow.
 */
export interface SubflowOutput {
    /** Unique identifier for the output */
    id: string;
    /** Display name */
    name: string;
    /** Data type */
    type: SubflowPortType;
}

/**
 * Complete definition of a reusable subflow.
 *
 * @example
 * ```typescript
 * const emailSubflow: SubflowDefinition = {
 *   id: 'email-composer',
 *   name: 'Email Composer',
 *   inputs: [
 *     { id: 'recipient', name: 'Recipient', type: 'string', required: true },
 *     { id: 'subject', name: 'Subject', type: 'string', required: true },
 *     { id: 'context', name: 'Context', type: 'string' },
 *   ],
 *   outputs: [
 *     { id: 'email', name: 'Composed Email', type: 'string' },
 *   ],
 *   workflow: emailWorkflowData,
 * };
 * ```
 */
export interface SubflowDefinition {
    /** Unique identifier for the subflow */
    id: string;

    /** Display name */
    name: string;

    /** Description of what the subflow does */
    description?: string;

    /** Input ports */
    inputs: SubflowInput[];

    /** Output ports */
    outputs: SubflowOutput[];

    /** The workflow data */
    workflow: WorkflowData;
}

/**
 * Data for a Subflow node.
 * References a subflow definition and configures input mappings.
 */
export interface SubflowNodeData extends BaseNodeData {
    /** Reference to subflow definition ID */
    subflowId: string;

    /**
     * Input mappings: subflow input ID -> expression or value.
     * Expressions starting with {{ are evaluated against context.
     */
    inputMappings: Record<string, string | unknown>;

    /** Whether to share parent session with subflow (default: true) */
    shareSession?: boolean;
}

// ============================================================================
// Registry Interface
// ============================================================================

/**
 * Registry for managing subflow definitions.
 *
 * @example
 * ```typescript
 * const registry = new DefaultSubflowRegistry();
 * registry.register(emailSubflow);
 * registry.register(summarizerSubflow);
 *
 * const adapter = new OpenRouterExecutionAdapter(client, {
 *   subflowRegistry: registry,
 * });
 * ```
 */
export interface SubflowRegistry {
    /** Register a subflow definition */
    register(subflow: SubflowDefinition): void;

    /** Get a subflow by ID */
    get(id: string): SubflowDefinition | undefined;

    /** List all registered subflows */
    list(): SubflowDefinition[];

    /** Check if a subflow exists */
    has(id: string): boolean;

    /** Unregister a subflow */
    unregister(id: string): void;

    /** Clear all registered subflows */
    clear(): void;
}

// ============================================================================
// Default Implementation
// ============================================================================

/**
 * Default in-memory subflow registry.
 *
 * @example
 * ```typescript
 * const registry = new DefaultSubflowRegistry();
 *
 * // Register subflows
 * registry.register({
 *   id: 'summarizer',
 *   name: 'Text Summarizer',
 *   inputs: [{ id: 'text', name: 'Text', type: 'string', required: true }],
 *   outputs: [{ id: 'summary', name: 'Summary', type: 'string' }],
 *   workflow: summarizerWorkflow,
 * });
 *
 * // Use in execution
 * const subflow = registry.get('summarizer');
 * ```
 */
export class DefaultSubflowRegistry implements SubflowRegistry {
    private subflows = new Map<string, SubflowDefinition>();

    register(subflow: SubflowDefinition): void {
        if (!subflow.id) {
            throw new Error('Subflow must have an id');
        }
        if (!subflow.name) {
            throw new Error('Subflow must have a name');
        }
        if (!subflow.workflow) {
            throw new Error('Subflow must have a workflow');
        }
        this.subflows.set(subflow.id, subflow);
    }

    get(id: string): SubflowDefinition | undefined {
        return this.subflows.get(id);
    }

    list(): SubflowDefinition[] {
        return Array.from(this.subflows.values());
    }

    has(id: string): boolean {
        return this.subflows.has(id);
    }

    unregister(id: string): void {
        this.subflows.delete(id);
    }

    clear(): void {
        this.subflows.clear();
    }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid SubflowInput.
 */
export function isSubflowInput(value: unknown): value is SubflowInput {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const input = value as Record<string, unknown>;

    return (
        typeof input.id === 'string' &&
        typeof input.name === 'string' &&
        typeof input.type === 'string' &&
        ['string', 'number', 'object', 'array', 'any'].includes(input.type)
    );
}

/**
 * Type guard to check if a value is a valid SubflowOutput.
 */
export function isSubflowOutput(value: unknown): value is SubflowOutput {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const output = value as Record<string, unknown>;

    return (
        typeof output.id === 'string' &&
        typeof output.name === 'string' &&
        typeof output.type === 'string' &&
        ['string', 'number', 'object', 'array', 'any'].includes(output.type)
    );
}

/**
 * Type guard to check if a value is a valid SubflowDefinition.
 */
export function isSubflowDefinition(
    value: unknown
): value is SubflowDefinition {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const def = value as Record<string, unknown>;

    if (typeof def.id !== 'string' || typeof def.name !== 'string') {
        return false;
    }

    if (!Array.isArray(def.inputs) || !def.inputs.every(isSubflowInput)) {
        return false;
    }

    if (!Array.isArray(def.outputs) || !def.outputs.every(isSubflowOutput)) {
        return false;
    }

    if (typeof def.workflow !== 'object' || def.workflow === null) {
        return false;
    }

    return true;
}

/**
 * Type guard to check if node data is SubflowNodeData.
 */
export function isSubflowNodeData(data: unknown): data is SubflowNodeData {
    if (typeof data !== 'object' || data === null) {
        return false;
    }

    const nodeData = data as Record<string, unknown>;

    return (
        typeof nodeData.subflowId === 'string' &&
        typeof nodeData.inputMappings === 'object' &&
        nodeData.inputMappings !== null
    );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a subflow definition from a workflow.
 */
export function createSubflowDefinition(
    id: string,
    name: string,
    workflow: WorkflowData,
    options?: {
        description?: string;
        inputs?: SubflowInput[];
        outputs?: SubflowOutput[];
    }
): SubflowDefinition {
    return {
        id,
        name,
        description: options?.description,
        inputs: options?.inputs || [
            { id: 'input', name: 'Input', type: 'any', required: true },
        ],
        outputs: options?.outputs || [
            { id: 'output', name: 'Output', type: 'any' },
        ],
        workflow,
    };
}

/**
 * Validate that all required inputs have mappings.
 */
export function validateInputMappings(
    subflow: SubflowDefinition,
    mappings: Record<string, unknown>
): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const input of subflow.inputs) {
        if (
            input.required &&
            !(input.id in mappings) &&
            input.default === undefined
        ) {
            missing.push(input.id);
        }
    }

    return {
        valid: missing.length === 0,
        missing,
    };
}
