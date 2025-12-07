import { shallowRef, type ShallowRef, type Component } from 'vue';

/**
 * Registry for custom node Vue components.
 * Allows dynamic registration of node components for rendering in WorkflowCanvas.
 */
export interface NodeComponentRegistry {
    /**
     * Reactive map of node type to Vue component.
     * Use this to iterate over registered components in templates.
     */
    components: ShallowRef<Map<string, Component>>;

    /**
     * Register a Vue component for a node type.
     * @param type - The node type (e.g., 'agent', 'router', 'custom')
     * @param component - The Vue component to render for this node type
     */
    register: (type: string, component: Component) => void;

    /**
     * Unregister a node component.
     * @param type - The node type to unregister
     */
    unregister: (type: string) => void;

    /**
     * Get a registered component by type.
     * @param type - The node type
     * @returns The Vue component or undefined if not registered
     */
    get: (type: string) => Component | undefined;

    /**
     * Check if a node type is registered.
     * @param type - The node type
     * @returns true if registered
     */
    has: (type: string) => boolean;

    /**
     * Get all registered node types.
     * @returns Array of registered node type names
     */
    getTypes: () => string[];

    /**
     * Clear all registered components.
     */
    clear: () => void;
}

/**
 * Create a new node component registry.
 * Each registry is independent - useful for testing or multiple canvas instances.
 *
 * @example
 * ```ts
 * const registry = createNodeRegistry();
 *
 * // Register a custom node component
 * registry.register('myCustomNode', MyCustomNodeComponent);
 *
 * // Use in WorkflowCanvas
 * <WorkflowCanvas :editor="editor" :nodeRegistry="registry" />
 * ```
 */
export function createNodeRegistry(): NodeComponentRegistry {
    const components = shallowRef(new Map<string, Component>());

    return {
        components,

        register(type: string, component: Component) {
            if (!type || typeof type !== 'string') {
                console.warn('Node type must be a non-empty string');
                return;
            }

            // Create new Map to trigger reactivity
            const map = new Map(components.value);
            map.set(type, component);
            components.value = map;
        },

        unregister(type: string) {
            if (!components.value.has(type)) {
                return;
            }

            // Create new Map to trigger reactivity
            const map = new Map(components.value);
            map.delete(type);
            components.value = map;
        },

        get(type: string) {
            return components.value.get(type);
        },

        has(type: string) {
            return components.value.has(type);
        },

        getTypes() {
            return Array.from(components.value.keys());
        },

        clear() {
            components.value = new Map();
        },
    };
}

/**
 * Default global node registry.
 * Pre-populated with built-in node components when imported from @or3/workflow-vue.
 *
 * @example
 * ```ts
 * import { defaultNodeRegistry } from '@or3/workflow-vue';
 *
 * // Register a custom node
 * defaultNodeRegistry.register('myNode', MyNodeComponent);
 * ```
 */
export const defaultNodeRegistry = createNodeRegistry();

/**
 * Register built-in node components with the default registry.
 * Called automatically when importing from @or3/workflow-vue.
 *
 * @internal
 */
export function registerBuiltInNodes(registry: NodeComponentRegistry): void {
    // Import built-in node components
    // These are lazy-loaded to avoid circular dependencies
    import('./components/nodes/StartNode.vue').then((m) =>
        registry.register('start', m.default)
    );
    import('./components/nodes/AgentNode.vue').then((m) =>
        registry.register('agent', m.default)
    );
    import('./components/nodes/RouterNode.vue').then((m) =>
        registry.register('router', m.default)
    );
    import('./components/nodes/ParallelNode.vue').then((m) =>
        registry.register('parallel', m.default)
    );
    import('./components/nodes/WhileLoopNode.vue').then((m) =>
        registry.register('whileLoop', m.default)
    );
    import('./components/nodes/SubflowNode.vue').then((m) =>
        registry.register('subflow', m.default)
    );
    import('./components/nodes/OutputNode.vue').then((m) =>
        registry.register('output', m.default)
    );
}

// Auto-register built-in nodes with the default registry
registerBuiltInNodes(defaultNodeRegistry);
