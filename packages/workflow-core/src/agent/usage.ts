/**
 * Usage aggregation without fabricated values (R2.AC2, R8.AC2).
 *
 * Only fields actually reported by at least one model attempt are summed;
 * everything else stays `undefined` rather than defaulting to zero.
 */
import type { ModelUsage } from '../gateway/types';

type UsageKey = keyof ModelUsage;

const KEYS: UsageKey[] = [
    'inputTokens',
    'outputTokens',
    'reasoningTokens',
    'cachedTokens',
    'cacheWriteTokens',
    'totalTokens',
    'costUsd',
];

export function aggregateUsage(
    usages: readonly ModelUsage[]
): ModelUsage | undefined {
    if (usages.length === 0) return undefined;
    const result: ModelUsage = {};
    let any = false;
    for (const key of KEYS) {
        let sum: number | undefined;
        for (const usage of usages) {
            const value = usage[key];
            if (typeof value === 'number') {
                sum = (sum ?? 0) + value;
            }
        }
        if (sum !== undefined) {
            result[key] = sum;
            any = true;
        }
    }
    return any ? result : undefined;
}
