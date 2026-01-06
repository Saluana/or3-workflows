/**
 * Shared utilities and types for node extensions.
 *
 * This module consolidates common functionality used across multiple
 * node extensions to reduce code duplication.
 */

import type { Attachment, ChatMessageContentPart } from '../types';

// Re-export for backwards compatibility
export type { ChatMessageContentPart };

// Alias for clarity in extension code (identical to ChatMessageContentPart)
export type OpenRouterContentPart = ChatMessageContentPart;


// ============================================================================
// Attachment Helpers
// ============================================================================

/**
 * Resolve an attachment to a data URL.
 * Handles both direct URLs and base64-encoded content.
 *
 * @param attachment The attachment to resolve
 * @returns Data URL string or null if not resolvable
 */
export function resolveAttachmentUrl(attachment: {
    url?: string;
    content?: string;
    mimeType?: string;
}): string | null {
    if (attachment.url) return attachment.url;
    if (attachment.content && attachment.mimeType) {
        return `data:${attachment.mimeType};base64,${attachment.content}`;
    }
    return null;
}

/**
 * Build multimodal user content with attachments.
 *
 * - Images are included only if `supportsImages` is true
 * - Files (PDFs) are always included - OpenRouter handles them for all models
 *
 * @param input The text input
 * @param attachments Array of attachments
 * @param supportsImages Whether the model supports image input
 * @returns Either the plain input string or an array of content parts
 */
export function buildUserContentWithAttachments(
    input: string,
    attachments: Attachment[] | undefined,
    supportsImages: boolean
): string | OpenRouterContentPart[] {
    if (!attachments || attachments.length === 0) {
        return input;
    }

    const parts: OpenRouterContentPart[] = [{ type: 'text', text: input }];

    for (const attachment of attachments) {
        const url = resolveAttachmentUrl(attachment);
        if (!url) continue;

        if (attachment.type === 'image') {
            // Only include images if model supports them
            if (!supportsImages) continue;
            parts.push({ type: 'image_url', imageUrl: { url } });
        } else if (attachment.type === 'file') {
            // Always include files - OpenRouter handles PDFs for all models
            // Per OpenRouter docs: "This feature works on any model on OpenRouter"
            parts.push({
                type: 'file',
                file: {
                    filename: attachment.name || 'document',
                    fileData: url,
                },
            });
        }
    }

    return parts.length > 1 ? parts : input;
}

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Tool definition for LLM calls.
 */
export interface ToolForLLM {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

/**
 * Result from running a tool execution loop.
 */
export interface ToolLoopResult {
    finalContent: string;
    iterations: number;
    messages: import('../types').ChatMessage[];
}
