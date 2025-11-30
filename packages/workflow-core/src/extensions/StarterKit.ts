/**
 * StarterKit Extension
 *
 * A convenience bundle that includes all core workflow node extensions.
 * Inspired by TipTap's StarterKit pattern, this provides an easy way to
 * get started with all essential nodes while allowing configuration.
 *
 * @example Basic usage
 * ```typescript
 * import { WorkflowEditor, StarterKit } from '@or3/workflow-core';
 *
 * const editor = new WorkflowEditor({
 *   extensions: StarterKit.configure(),
 * });
 * ```
 *
 * @example With configuration
 * ```typescript
 * const editor = new WorkflowEditor({
 *   extensions: StarterKit.configure({
 *     // Disable specific nodes
 *     whileLoop: false,
 *     parallel: false,
 *
 *     // Configure specific nodes
 *     subflow: {
 *       maxNestingDepth: 3,
 *     },
 *
 *     // Include optional nodes
 *     memory: true,
 *     output: true,
 *   }),
 * });
 * ```
 *
 * @module
 */

import type { Extension, NodeExtension } from '../types';

// Core node extensions (always included by default)
import { StartNodeExtension } from './StartNodeExtension';
import { AgentNodeExtension } from './AgentNodeExtension';
import { RouterNodeExtension } from './RouterNodeExtension';
import { ParallelNodeExtension } from './ParallelNodeExtension';
import { ToolNodeExtension } from './ToolNodeExtension';

// Optional node extensions
import { WhileLoopExtension } from './WhileLoopExtension';
import { MemoryNodeExtension } from './MemoryNodeExtension';
import { SubflowExtension } from './SubflowExtension';
import { OutputNodeExtension } from './OutputNodeExtension';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for individual extensions within StarterKit.
 */
export interface SubflowOptions {
    /** Maximum nesting depth for subflows (default: 10) */
    maxNestingDepth?: number;
}

export interface WhileLoopOptions {
    /** Default maximum iterations (default: 10) */
    defaultMaxIterations?: number;
    /** Default behavior when max iterations reached */
    defaultOnMaxIterations?: 'error' | 'warning' | 'continue';
}

export interface AgentOptions {
    /** Default model for new agent nodes */
    defaultModel?: string;
}

/**
 * Configuration options for StarterKit.
 *
 * Each property can be:
 * - `true` or omitted: Include with defaults
 * - `false`: Exclude the extension
 * - An options object: Include with custom configuration
 */
export interface StarterKitOptions {
    // ========================================================================
    // Core Nodes (included by default)
    // ========================================================================

    /**
     * Start node - entry point for workflows.
     * Cannot be disabled (required for all workflows).
     */
    start?: boolean;

    /**
     * Agent node - LLM-powered processing node.
     * @default true
     */
    agent?: boolean | AgentOptions;

    /**
     * Router node - conditional branching.
     * @default true
     */
    router?: boolean;

    /**
     * Parallel node - concurrent execution branches.
     * @default true
     */
    parallel?: boolean;

    /**
     * Tool node - external tool/function execution.
     * @default true
     */
    tool?: boolean;

    // ========================================================================
    // Optional Nodes
    // ========================================================================

    /**
     * While Loop node - iterative execution with LLM condition.
     * @default true
     */
    whileLoop?: boolean | WhileLoopOptions;

    /**
     * Memory node - vector memory storage/retrieval.
     * @default true
     */
    memory?: boolean;

    /**
     * Subflow node - reusable workflow components.
     * @default true
     */
    subflow?: boolean | SubflowOptions;

    /**
     * Output node - terminal node for workflow results.
     * @default true
     */
    output?: boolean;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_STARTER_KIT_OPTIONS: Required<StarterKitOptions> = {
    start: true,
    agent: true,
    router: true,
    parallel: true,
    tool: true,
    whileLoop: true,
    memory: true,
    subflow: true,
    output: true,
};

// ============================================================================
// StarterKit
// ============================================================================

/**
 * StarterKit - All essential workflow nodes in one bundle.
 *
 * This is the recommended way to get started with workflow-core.
 * It includes all core and optional node types with sensible defaults.
 *
 * @example
 * ```typescript
 * import { WorkflowEditor, StarterKit } from '@or3/workflow-core';
 *
 * // Basic usage - includes all nodes
 * const editor = new WorkflowEditor({
 *   extensions: StarterKit.configure(),
 * });
 *
 * // Custom configuration
 * const editor = new WorkflowEditor({
 *   extensions: StarterKit.configure({
 *     whileLoop: false, // Disable while loops
 *     subflow: { maxNestingDepth: 5 }, // Configure subflows
 *   }),
 * });
 * ```
 */
export const StarterKit = {
    name: 'starterKit',

    /**
     * Configure and return all StarterKit extensions.
     *
     * @param options - Configuration options for included extensions
     * @returns Array of configured extensions
     */
    configure(options: StarterKitOptions = {}): (Extension | NodeExtension)[] {
        const opts = { ...DEFAULT_STARTER_KIT_OPTIONS, ...options };
        const extensions: (Extension | NodeExtension)[] = [];

        // ====================================================================
        // Core Nodes (always include Start, it's required)
        // ====================================================================

        // Start node is always included (can't have a workflow without it)
        extensions.push(StartNodeExtension);

        // Agent node
        if (opts.agent !== false) {
            if (typeof opts.agent === 'object') {
                // Apply agent options to defaultData
                const agentExt = {
                    ...AgentNodeExtension,
                    defaultData: {
                        ...AgentNodeExtension.defaultData,
                        model:
                            opts.agent.defaultModel ||
                            AgentNodeExtension.defaultData?.model,
                    },
                };
                extensions.push(agentExt);
            } else {
                extensions.push(AgentNodeExtension);
            }
        }

        // Router node
        if (opts.router !== false) {
            extensions.push(RouterNodeExtension);
        }

        // Parallel node
        if (opts.parallel !== false) {
            extensions.push(ParallelNodeExtension);
        }

        // Tool node
        if (opts.tool !== false) {
            extensions.push(ToolNodeExtension);
        }

        // ====================================================================
        // Optional Nodes
        // ====================================================================

        // While Loop node
        if (opts.whileLoop !== false) {
            if (typeof opts.whileLoop === 'object') {
                const loopExt = {
                    ...WhileLoopExtension,
                    defaultData: {
                        ...WhileLoopExtension.defaultData,
                        maxIterations:
                            opts.whileLoop.defaultMaxIterations ||
                            WhileLoopExtension.defaultData?.maxIterations,
                        onMaxIterations:
                            opts.whileLoop.defaultOnMaxIterations ||
                            WhileLoopExtension.defaultData?.onMaxIterations,
                    },
                };
                extensions.push(loopExt);
            } else {
                extensions.push(WhileLoopExtension);
            }
        }

        // Memory node
        if (opts.memory !== false) {
            extensions.push(MemoryNodeExtension);
        }

        // Subflow node
        if (opts.subflow !== false) {
            if (typeof opts.subflow === 'object') {
                // Subflow options are used by the execution adapter, not the extension
                // We include the extension and store options for later use
                const subflowExt = {
                    ...SubflowExtension,
                    storage: {
                        ...SubflowExtension.storage,
                        maxNestingDepth: opts.subflow.maxNestingDepth || 10,
                    },
                };
                extensions.push(subflowExt);
            } else {
                extensions.push(SubflowExtension);
            }
        }

        // Output node
        if (opts.output !== false) {
            extensions.push(OutputNodeExtension);
        }

        return extensions;
    },

    /**
     * Get the list of all available extension names in StarterKit.
     */
    getAvailableExtensions(): string[] {
        return [
            'start',
            'agent',
            'router',
            'parallel',
            'tool',
            'whileLoop',
            'memory',
            'subflow',
            'output',
        ];
    },

    /**
     * Get the default options for StarterKit.
     */
    getDefaultOptions(): Required<StarterKitOptions> {
        return { ...DEFAULT_STARTER_KIT_OPTIONS };
    },
};

// ============================================================================
// Type Export
// ============================================================================

export type { StarterKitOptions as StarterKitConfig };
