/**
 * Provider-neutral model gateway (R2).
 *
 * @see ./types for the request/result/error contracts.
 */
export * from './types';
export {
    LegacyLLMProviderGateway,
    type LegacyLLMProviderGatewayOptions,
} from './LegacyLLMProviderGateway';
export {
    isModelGateway,
    isLLMProvider,
    resolveToModelGateway,
    gatewayAsLLMProvider,
} from './helpers';
