/**
 * Tri-state capability resolution (R3.AC3, R3.AC4, R4.AC3).
 *
 * Evaluates node/request capability requirements against the local model
 * catalog. The result is `supported | unsupported | unknown` — never a boolean —
 * so an absent/stale catalog entry warns and defers to OpenRouter's authoritative
 * `require_parameters` guard rather than blocking a valid request or silently
 * weakening a strict requirement.
 */
import { ModelRegistry, type OpenRouterModel } from '../../models';
import {
    CapabilityPreflightError,
    type CapabilityCheck,
    type CapabilityEvidence,
    type CapabilitySupport,
    type ModelCapability,
    type ModelCapabilityReport,
} from '../../gateway/types';

function hasParam(model: OpenRouterModel, param: string): boolean {
    return (
        Array.isArray(model.supportedParameters) &&
        model.supportedParameters.includes(param)
    );
}

function hasInputModality(model: OpenRouterModel, modality: string): boolean {
    return (
        Array.isArray(model.architecture?.inputModalities) &&
        model.architecture.inputModalities.includes(modality)
    );
}

/** Returns tri-state support for one capability on one catalog model. */
function checkModelCapability(
    model: OpenRouterModel,
    capability: ModelCapability
): CapabilitySupport {
    switch (capability) {
        case 'tools':
        case 'parallel-tool-calls':
            return hasParam(model, 'tools') ? 'supported' : 'unsupported';
        case 'structured-output':
            return hasParam(model, 'structured_outputs')
                ? 'supported'
                : 'unsupported';
        case 'response-format':
            return hasParam(model, 'response_format') ||
                hasParam(model, 'structured_outputs')
                ? 'supported'
                : 'unsupported';
        case 'reasoning':
            return hasParam(model, 'reasoning') ||
                hasParam(model, 'include_reasoning')
                ? 'supported'
                : 'unsupported';
        case 'vision':
            return hasInputModality(model, 'image')
                ? 'supported'
                : 'unsupported';
        case 'audio-input':
            return hasInputModality(model, 'audio')
                ? 'supported'
                : 'unsupported';
        case 'video-input':
            return hasInputModality(model, 'video')
                ? 'supported'
                : 'unsupported';
        case 'file-input':
            return hasInputModality(model, 'file')
                ? 'supported'
                : 'unsupported';
        default:
            // Unknown capability keyword — the catalog cannot prove or disprove.
            return 'unknown';
    }
}

export interface PreflightResult {
    reports: ModelCapabilityReport[];
    /** Non-null when every fallback model proved a required capability unsupported. */
    blocking: CapabilityPreflightError | null;
    /** Human-readable warnings for `unknown` (deferred) capabilities. */
    warnings: string[];
}

export class CapabilityResolver {
    constructor(private readonly registry: ModelRegistry) {}

    /** Resolve a report for a single model. */
    resolveModel(
        modelId: string,
        capabilities: ModelCapability[]
    ): ModelCapabilityReport {
        const model = this.registry.get(modelId);
        const checks: CapabilityCheck[] = capabilities.map((capability) => {
            if (!model) {
                return {
                    capability,
                    support: 'unknown' as const,
                    evidence: 'none' as CapabilityEvidence,
                };
            }
            const support = checkModelCapability(model, capability);
            return {
                capability,
                support,
                evidence: (support === 'unknown'
                    ? 'none'
                    : 'catalog') as CapabilityEvidence,
            };
        });
        return {
            modelId,
            checks,
            blocked: checks.some((c) => c.support === 'unsupported'),
            deferred: checks.some((c) => c.support === 'unknown'),
        };
    }

    /**
     * Preflight a fallback chain. A required capability blocks only when *every*
     * model in the chain proves it unsupported (R3.AC4). Unknown catalog entries
     * warn and defer to the request-time `require_parameters` guard.
     */
    preflight(
        models: readonly string[],
        capabilities: ModelCapability[]
    ): PreflightResult {
        const reports = models.map((m) => this.resolveModel(m, capabilities));
        const warnings: string[] = [];
        let blocking: CapabilityPreflightError | null = null;

        for (const capability of capabilities) {
            const supports = reports.map(
                (r) =>
                    r.checks.find((c) => c.capability === capability)?.support ??
                    'unknown'
            );
            const everyUnsupported = supports.every(
                (s) => s === 'unsupported'
            );
            const anyUnknown = supports.some((s) => s === 'unknown');
            const anySupported = supports.some((s) => s === 'supported');

            if (everyUnsupported) {
                blocking ??= new CapabilityPreflightError({
                    modelId: models[0] ?? 'unknown',
                    capability,
                    evidence: 'catalog',
                    catalogUnknown: false,
                });
            } else if (anyUnknown && !anySupported) {
                warnings.push(
                    `Capability "${capability}" could not be verified against the model catalog for ${models.join(', ')}; deferring to provider require_parameters.`
                );
            } else if (anyUnknown && anySupported) {
                warnings.push(
                    `Capability "${capability}" is unverified for one or more fallback models; a weaker fallback may be selected.`
                );
            }
        }

        return { reports, blocking, warnings };
    }
}
