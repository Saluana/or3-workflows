import type { ChatMessage } from './types';

export interface Session {
  /** Unique session identifier */
  id: string;
  /** Conversation messages in this session */
  messages: ChatMessage[];
  /** Add a message to the session */
  addMessage(message: ChatMessage): void;
  /** Get recent messages */
  getRecent(limit?: number): ChatMessage[];
  /** Clear all messages */
  clear(): void;
  /** Total message count */
  get messageCount(): number;
  /** Approximate token count */
  get tokenCount(): number;
}

export class ExecutionSession implements Session {
  id: string;
  messages: ChatMessage[] = [];

  constructor(id?: string) {
    const fallbackId = `session-${Date.now()}`;
    this.id =
      id ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : fallbackId);
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
  }

  getRecent(limit = 10): ChatMessage[] {
    return this.messages.slice(-limit);
  }

  clear(): void {
    this.messages = [];
  }

  get messageCount(): number {
    return this.messages.length;
  }

  get tokenCount(): number {
    // Approximate: 4 chars ≈ 1 token
    return Math.ceil(
      this.messages.reduce((sum, m) => sum + m.content.length, 0) / 4
    );
  }
}
