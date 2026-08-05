/**
 * OpenRouter v1 model gateway (R3).
 *
 * This is the only place the OpenRouter SDK v1 request/model shape is used.
 * Prefer {@link OpenRouterModelGateway} over the legacy `OpenRouterLLMProvider`.
 */
import type { LLMProvider } from '../../types';
import { gatewayAsLLMProvider } from '../../gateway/helpers';
import {
    OpenRouterModelGateway,
    type OpenRouterGatewayOptions,
    type OpenRouterV1Client,
} from './OpenRouterModelGateway';

export {
    OpenRouterModelGateway,
    type OpenRouterGatewayOptions,
    type OpenRouterV1Client,
    type PublicRequestOptions,
} from './OpenRouterModelGateway';
export { CapabilityResolver, type PreflightResult } from './CapabilityResolver';
export {
    mapRoutingPolicy,
    type OpenRouterProviderPreferences,
} from './routing';
export { normalizeMessages, type ORRequestMessage } from './messages';

/**
 * Construct an {@link OpenRouterModelGateway} from a public SDK v1 client and
 * explicit options. Credentials/base URL/headers come from `options`, never from
 * SDK private fields (R3.AC5).
 */
export function createOpenRouterModelGateway(
    client: OpenRouterV1Client,
    options: Omit<OpenRouterGatewayOptions, 'client'> = {}
): OpenRouterModelGateway {
    return new OpenRouterModelGateway({ client, ...options });
}

/**
 * @deprecated Prefer {@link OpenRouterModelGateway}. This thin wrapper projects
 * an OpenRouter gateway onto the legacy positional `LLMProvider.chat` surface for
 * one-minor-release source compatibility.
 */
export function createOpenRouterLLMProvider(
    client: OpenRouterV1Client,
    options: Omit<OpenRouterGatewayOptions, 'client'> = {}
): LLMProvider {
    return gatewayAsLLMProvider(createOpenRouterModelGateway(client, options));
}
