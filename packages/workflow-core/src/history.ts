import { WorkflowNode, WorkflowEdge } from './types';

export interface HistoryState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  timestamp: number;
}

export interface HistoryOptions {
  maxHistory?: number;
  debounceMs?: number;
}

export class HistoryManager {
  private stack: HistoryState[] = [];
  private currentIndex: number = -1;
  private maxHistory: number;
  private debounceMs: number;
  private lastPushTime: number = 0;

  constructor(options: HistoryOptions = {}) {
    this.maxHistory = options.maxHistory || 50;
    this.debounceMs = options.debounceMs || 300;
  }

  public get canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public get canRedo(): boolean {
    return this.currentIndex < this.stack.length - 1;
  }

  public push(state: Omit<HistoryState, 'timestamp'>) {
    const now = Date.now();
    
    // Debounce logic: if close to last push, replace top of stack
    if (now - this.lastPushTime < this.debounceMs && this.currentIndex >= 0) {
      this.stack[this.currentIndex] = { ...state, timestamp: now };
      this.lastPushTime = now;
      return;
    }

    // Remove future history if we pushed in the middle
    if (this.currentIndex < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.currentIndex + 1);
    }

    this.stack.push({ ...state, timestamp: now });
    this.currentIndex++;

    // Limit history size
    if (this.stack.length > this.maxHistory) {
      this.stack.shift();
      this.currentIndex--;
    }

    this.lastPushTime = now;
  }

  public undo(): HistoryState | null {
    if (!this.canUndo) return null;
    this.currentIndex--;
    return this.stack[this.currentIndex];
  }

  public redo(): HistoryState | null {
    if (!this.canRedo) return null;
    this.currentIndex++;
    return this.stack[this.currentIndex];
  }

  public clear() {
    this.stack = [];
    this.currentIndex = -1;
  }
}
