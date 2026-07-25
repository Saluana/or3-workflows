/**
 * Maps the provider-neutral {@link ProviderRoutingPolicy} onto OpenRouter's
 * public `ProviderPreferences` request shape (R3.AC2). Uses only documented,
 * camelCase SDK request fields — never SDK private state.
 */
import type { ProviderRoutingPolicy } from '../../gateway/types';

type PercentileCutoffs = {
    p50?: number;
    p75?: number;
    p90?: number;
    p99?: number;
};

/**
 * OpenRouter provider preferences (camelCase request form). Kept structural so
 * this module does not hard-depend on the exact SDK version's optional/nullable
 * decorations while still matching the documented request contract.
 */
export interface OpenRouterProviderPreferences {
    order?: string[];
    only?: string[];
    ignore?: string[];
    allowFallbacks?: boolean;
    requireParameters?: boolean;
    dataCollection?: 'allow' | 'deny';
    maxPrice?: {
        prompt?: string;
        completion?: string;
        request?: string;
        image?: string;
        audio?: string;
    };
    sort?: string | { by?: string; partition?: string };
    preferredMaxLatency?: number | PercentileCutoffs;
    preferredMinThroughput?: number | PercentileCutoffs;
    quantizations?: string[];
    zdr?: boolean;
}

function priceToString(value: number | undefined): string | undefined {
    return value === undefined ? undefined : String(value);
}

/**
 * @param policy the provider-neutral routing policy
 * @param requireParametersDefault when the caller declared required
 *   capabilities, `require_parameters` defaults to true unless explicitly
 *   disabled (R3.AC3).
 */
export function mapRoutingPolicy(
    policy: ProviderRoutingPolicy | undefined,
    requireParametersDefault: boolean
): OpenRouterProviderPreferences | undefined {
    if (!policy && !requireParametersDefault) return undefined;

    const prefs: OpenRouterProviderPreferences = {};

    if (policy?.order && policy.order.length > 0) prefs.order = [...policy.order];
    if (policy?.allow && policy.allow.length > 0) prefs.only = [...policy.allow];
    if (policy?.deny && policy.deny.length > 0) prefs.ignore = [...policy.deny];
    if (policy?.allowFallbacks !== undefined)
        prefs.allowFallbacks = policy.allowFallbacks;

    // requireParameters: explicit policy wins; otherwise default from capabilities.
    if (policy?.requireParameters !== undefined) {
        prefs.requireParameters = policy.requireParameters;
    } else if (requireParametersDefault) {
        prefs.requireParameters = true;
    }

    // Data collection and ZDR are distinct OpenRouter controls.
    if (policy?.dataCollection) {
        prefs.dataCollection = policy.dataCollection;
    }
    const zdr = policy?.zdr ?? policy?.zeroDataRetention;
    if (zdr !== undefined) {
        prefs.zdr = zdr;
    }

    if (policy?.maxPrice) {
        const maxPrice = {
            prompt: priceToString(policy.maxPrice.prompt),
            completion: priceToString(policy.maxPrice.completion),
            request: priceToString(policy.maxPrice.request),
            image: priceToString(policy.maxPrice.image),
            audio: priceToString(policy.maxPrice.audio),
        };
        // Only attach if at least one field is set.
        if (Object.values(maxPrice).some((v) => v !== undefined)) {
            prefs.maxPrice = maxPrice;
        }
    }

    if (policy?.sort) prefs.sort = policy.sort;

    // Latency/throughput are *preferences* (soft), not hard exclusions (design).
    const preferredMaxLatency =
        policy?.preferredMaxLatency ?? policy?.preferredMaxLatencySeconds;
    if (preferredMaxLatency !== undefined)
        prefs.preferredMaxLatency = preferredMaxLatency;
    if (policy?.preferredMinThroughput !== undefined)
        prefs.preferredMinThroughput = policy.preferredMinThroughput;
    if (policy?.quantizations && policy.quantizations.length > 0)
        prefs.quantizations = [...policy.quantizations];

    return Object.keys(prefs).length > 0 ? prefs : undefined;
}
