import { ref, readonly, inject, provide, type InjectionKey, type Ref } from 'vue';

type ExecutionCache = Map<string, string>;

const EXECUTION_CACHE_KEY: InjectionKey<Ref<ExecutionCache>> =
    Symbol('or3-execution-cache');

/**
 * Create an isolated execution output cache and provide it to descendants.
 * Call once near the editor root so multiple editor instances don't share state.
 */
export function createExecutionCache() {
    const cache = ref<ExecutionCache>(new Map());
    provide(EXECUTION_CACHE_KEY, cache);
    return useExecutionCacheFrom(cache);
}

/**
 * Composable to manage execution output cache.
 * Used for live preview in the Output Node inspector.
 *
 * Prefer calling `createExecutionCache()` at the editor root. Falls back to a
 * module-level cache only when no provider is present (backwards compatible).
 */
const fallbackCache = ref<ExecutionCache>(new Map());

function useExecutionCacheFrom(cache: Ref<ExecutionCache>) {
    const setOutput = (nodeId: string, output: string) => {
        cache.value.set(nodeId, output);
    };

    const getOutput = (nodeId: string) => {
        return cache.value.get(nodeId);
    };

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

export function useExecutionCache() {
    const cache = inject(EXECUTION_CACHE_KEY, fallbackCache);
    return useExecutionCacheFrom(cache);
}
