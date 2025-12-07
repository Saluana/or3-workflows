import { ref, readonly } from 'vue';

// Global cache for the current session
// Note: In a multi-instance scenario, this should be provided via dependency injection
const cache = ref<Map<string, string>>(new Map());

/**
 * Composable to manage execution output cache.
 * Used for live preview in the Output Node inspector.
 */
export function useExecutionCache() {
    /**
     * Store an output for a node.
     */
    const setOutput = (nodeId: string, output: string) => {
        cache.value.set(nodeId, output);
    };

    /**
     * Get cached output for a node.
     */
    const getOutput = (nodeId: string) => {
        return cache.value.get(nodeId);
    };

    /**
     * Clear the entire cache.
     */
    const clear = () => {
        cache.value.clear();
    };

    return {
        outputs: readonly(cache),
        setOutput,
        getOutput,
        clear,
    };
}
