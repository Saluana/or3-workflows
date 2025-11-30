/**
 * Extension Configuration Utilities
 *
 * Provides a TipTap-style .configure() pattern for extensions.
 * This allows extensions to be configured with options while maintaining
 * their base structure.
 *
 * @example
 * ```typescript
 * const MyExtension = createConfigurableExtension({
 *   name: 'myExtension',
 *   type: 'node',
 *   defaultOptions: { maxItems: 10, enabled: true },
 *   defaultData: { label: 'My Node' },
 * });
 *
 * // Use with defaults
 * editor.registerExtension(MyExtension);
 *
 * // Or configure with custom options
 * editor.registerExtension(MyExtension.configure({ maxItems: 20 }));
 * ```
 *
 * @module
 */

import type { Extension, NodeExtension, PortDefinition } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Options that can be passed to configure an extension.
 */
export interface ExtensionOptions {
    [key: string]: unknown;
}

/**
 * A configurable extension that supports the .configure() pattern.
 * This extends the base Extension/NodeExtension with configuration capabilities.
 */
export interface ConfigurableExtension<
    TOptions extends ExtensionOptions = ExtensionOptions
> extends NodeExtension {
    /**
     * Default options for this extension.
     */
    defaultOptions: TOptions;

    /**
     * The current options (after configuration).
     */
    options: TOptions;

    /**
     * Create a new instance of this extension with the given options.
     * Options are merged with defaultOptions.
     *
     * @param options - Partial options to override defaults
     * @returns A new extension instance with the merged options
     */
    configure(options?: Partial<TOptions>): ConfigurableExtension<TOptions>;

    /** Lifecycle: called when extension is created */
    onCreate?: () => void;

    /** Lifecycle: called when extension is destroyed */
    onDestroy?: () => void;
}

/**
 * Configuration for creating a configurable extension.
 */
export interface ExtensionConfig<
    TOptions extends ExtensionOptions = ExtensionOptions
> {
    /** Extension name */
    name: string;

    /** Extension type */
    type: 'node' | 'behavior';

    /** Default options for the extension */
    defaultOptions?: TOptions;

    /** Input port definitions */
    inputs?: PortDefinition[];

    /** Output port definitions */
    outputs?: PortDefinition[];

    /** Default data for new nodes */
    defaultData?: Record<string, unknown>;

    /** Validation function */
    validate?: NodeExtension['validate'];

    /** Execute function */
    execute?: NodeExtension['execute'];

    /** Lifecycle: called when extension is registered */
    onCreate?: (options: TOptions) => void;

    /** Lifecycle: called when extension is destroyed */
    onDestroy?: (options: TOptions) => void;

    /** Storage for extension state */
    storage?: Record<string, unknown>;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a configurable extension with the TipTap-style .configure() pattern.
 *
 * This factory function creates an extension that can be used directly or
 * configured with custom options using the .configure() method.
 *
 * @param config - The extension configuration
 * @returns A configurable extension
 *
 * @example
 * ```typescript
 * const WhileLoopExtension = createConfigurableExtension({
 *   name: 'whileLoop',
 *   type: 'node',
 *   defaultOptions: {
 *     maxIterations: 10,
 *     onMaxIterations: 'warning',
 *   },
 *   defaultData: {
 *     label: 'While Loop',
 *     conditionPrompt: 'Should we continue?',
 *   },
 *   validate(node, edges) {
 *     // validation logic
 *   },
 * });
 *
 * // Use with defaults
 * editor.use(WhileLoopExtension);
 *
 * // Or configure
 * editor.use(WhileLoopExtension.configure({
 *   maxIterations: 50,
 *   onMaxIterations: 'error',
 * }));
 * ```
 */
export function createConfigurableExtension<
    TOptions extends ExtensionOptions = ExtensionOptions
>(config: ExtensionConfig<TOptions>): ConfigurableExtension<TOptions> {
    const defaultOptions = (config.defaultOptions || {}) as TOptions;

    const createExtension = (
        options: TOptions
    ): ConfigurableExtension<TOptions> => {
        return {
            name: config.name,
            type: config.type as 'node',
            defaultOptions,
            options,
            inputs: config.inputs || [],
            outputs: config.outputs || [],
            defaultData: config.defaultData || {},
            validate: config.validate || (() => []),
            execute:
                config.execute ||
                (async () => ({ output: '', nextNodes: [] })),

            onCreate: config.onCreate
                ? () => config.onCreate!(options)
                : undefined,
            onDestroy: config.onDestroy
                ? () => config.onDestroy!(options)
                : undefined,

            configure(newOptions?: Partial<TOptions>) {
                return createExtension({
                    ...options,
                    ...newOptions,
                } as TOptions);
            },
        };
    };

    return createExtension(defaultOptions);
}

// ============================================================================
// Helper: Extend Existing Extension
// ============================================================================

/**
 * Add .configure() capability to an existing NodeExtension.
 *
 * This is useful for adding configuration to extensions that were created
 * without the createConfigurableExtension factory.
 *
 * @param extension - The base extension to make configurable
 * @param defaultOptions - Default options for the extension
 * @returns A configurable version of the extension
 *
 * @example
 * ```typescript
 * const ConfigurableAgent = makeConfigurable(AgentNodeExtension, {
 *   defaultModel: 'openai/gpt-4o',
 *   streamByDefault: true,
 * });
 *
 * editor.use(ConfigurableAgent.configure({
 *   defaultModel: 'anthropic/claude-3-opus',
 * }));
 * ```
 */
export function makeConfigurable<
    TOptions extends ExtensionOptions = ExtensionOptions
>(
    extension: NodeExtension,
    defaultOptions: TOptions
): ConfigurableExtension<TOptions> {
    const createExtension = (
        options: TOptions
    ): ConfigurableExtension<TOptions> => {
        return {
            ...extension,
            defaultOptions,
            options,

            configure(newOptions?: Partial<TOptions>) {
                return createExtension({
                    ...options,
                    ...newOptions,
                } as TOptions);
            },
        };
    };

    return createExtension(defaultOptions);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an extension is configurable.
 */
export function isConfigurableExtension(
    extension: Extension | NodeExtension
): extension is ConfigurableExtension {
    return (
        'configure' in extension &&
        typeof (extension as ConfigurableExtension).configure === 'function' &&
        'defaultOptions' in extension &&
        'options' in extension
    );
}
