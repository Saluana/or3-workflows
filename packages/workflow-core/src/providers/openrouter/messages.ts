/**
 * Normalizes OR3 {@link ChatMessage}s into the OpenRouter SDK v1 request message
 * shape at a single boundary. The SDK request uses camelCase field names
 * (`toolCalls`, `toolCallId`, `imageUrl`, `fileData`) and converts to snake_case
 * on the wire.
 */
import type { ChatMessage, ChatMessageContentPart } from '../../types';

type ORContentPart =
    | { type: 'text'; text: string }
    | {
          type: 'image_url';
          imageUrl: { url: string; detail?: 'auto' | 'low' | 'high' };
      }
    | { type: 'file'; file: { filename: string; fileData: string } };

export interface ORRequestMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ORContentPart[];
    toolCalls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
    }>;
    toolCallId?: string;
    name?: string;
}

function normalizePart(part: ChatMessageContentPart): ORContentPart | null {
    if (part.type === 'text') {
        return typeof part.text === 'string'
            ? { type: 'text', text: part.text }
            : null;
    }
    if (part.type === 'image_url') {
        const url = part.imageUrl?.url;
        if (!url) return null;
        const imageUrl: { url: string; detail?: 'auto' | 'low' | 'high' } = {
            url,
        };
        if (part.imageUrl.detail) imageUrl.detail = part.imageUrl.detail;
        return { type: 'image_url', imageUrl };
    }
    if (part.type === 'file') {
        const fileData = part.file?.fileData;
        if (!fileData) return null;
        return {
            type: 'file',
            file: {
                filename: part.file.filename ?? 'file',
                fileData,
            },
        };
    }
    return null;
}

function normalizeContent(
    content: ChatMessage['content']
): string | ORContentPart[] {
    if (!Array.isArray(content)) return content;
    const parts = content
        .map(normalizePart)
        .filter((p): p is ORContentPart => p !== null);
    return parts.length > 0 ? parts : '';
}

export function normalizeMessages(messages: ChatMessage[]): ORRequestMessage[] {
    return messages.map((message) => {
        const normalized: ORRequestMessage = {
            role: message.role,
            content: normalizeContent(message.content),
        };
        if (message.tool_calls && message.tool_calls.length > 0) {
            normalized.toolCalls = message.tool_calls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            }));
        }
        if (message.tool_call_id) normalized.toolCallId = message.tool_call_id;
        if (message.name) normalized.name = message.name;
        return normalized;
    });
}
