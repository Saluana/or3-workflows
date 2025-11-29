import { describe, it, expect } from 'vitest';
import { HistoryManager } from '../history';
import type { WorkflowNode } from '../types';

// Helper to create test nodes with proper types
const node = (id: string): WorkflowNode => ({
  id,
  type: 'start',
  position: { x: 0, y: 0 },
  data: { label: 'Test' },
});

// Helper to wait for debounce
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('HistoryManager', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const h = new HistoryManager();
      expect(h.canUndo).toBe(false);
      expect(h.canRedo).toBe(false);
    });

    it('should accept custom options', () => {
      const h = new HistoryManager({ maxHistory: 10, debounceMs: 100 });
      expect(h.canUndo).toBe(false);
    });
  });

  describe('push', () => {
    it('should add state to history', () => {
      const history = new HistoryManager();
      history.push({ nodes: [], edges: [] });

      expect(history.canUndo).toBe(false); // First push is initial state
    });

    it('should enable undo after non-debounced pushes', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      history.push({ nodes: [], edges: [] });
      await wait(10); // Wait longer than debounce
      history.push({ nodes: [node('1')], edges: [] });

      expect(history.canUndo).toBe(true);
    });

    it('should respect maxHistory limit', async () => {
      const h = new HistoryManager({ maxHistory: 3, debounceMs: 5 });

      for (let i = 0; i < 5; i++) {
        await wait(10);
        h.push({ nodes: [node(`${i}`)], edges: [] });
      }

      // Should only be able to undo 2 times (3 states - 1 current = 2 undos)
      expect(h.canUndo).toBe(true);
      h.undo();
      expect(h.canUndo).toBe(true);
      h.undo();
      expect(h.canUndo).toBe(false);
    });

    it('should clear future history when pushing after undo', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      history.push({ nodes: [], edges: [] });
      await wait(10);
      history.push({ nodes: [node('1')], edges: [] });
      await wait(10);
      history.push({ nodes: [node('2')], edges: [] });

      history.undo(); // Go back to state 1
      await wait(10);
      history.push({ nodes: [node('3')], edges: [] }); // New branch

      expect(history.canRedo).toBe(false); // Future history cleared
    });
  });

  describe('debounce', () => {
    it('should debounce rapid pushes', () => {
      const h = new HistoryManager({ debounceMs: 100 });

      h.push({ nodes: [], edges: [] });
      h.push({ nodes: [node('1')], edges: [] });
      h.push({ nodes: [node('2')], edges: [] });

      // Rapid pushes should be debounced into one
      expect(h.canUndo).toBe(false); // Only one state (debounced)
    });

    it('should not debounce after delay', async () => {
      const h = new HistoryManager({ debounceMs: 10 });

      h.push({ nodes: [], edges: [] });
      await wait(20);
      h.push({ nodes: [node('1')], edges: [] });

      expect(h.canUndo).toBe(true);
    });
  });

  describe('undo', () => {
    it('should return previous state', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      const state1 = { nodes: [] as WorkflowNode[], edges: [] };
      const state2 = { nodes: [node('1')], edges: [] };

      history.push(state1);
      await wait(10);
      history.push(state2);

      const result = history.undo();

      expect(result?.nodes).toEqual(state1.nodes);
    });

    it('should return null when nothing to undo', () => {
      const history = new HistoryManager();
      const result = history.undo();

      expect(result).toBeNull();
    });

    it('should enable redo after undo', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      history.push({ nodes: [], edges: [] });
      await wait(10);
      history.push({ nodes: [node('1')], edges: [] });

      history.undo();

      expect(history.canRedo).toBe(true);
    });
  });

  describe('redo', () => {
    it('should return next state', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      const state1 = { nodes: [] as WorkflowNode[], edges: [] };
      const state2 = { nodes: [node('1')], edges: [] };

      history.push(state1);
      await wait(10);
      history.push(state2);
      history.undo();

      const result = history.redo();

      expect(result?.nodes).toEqual(state2.nodes);
    });

    it('should return null when nothing to redo', () => {
      const history = new HistoryManager();
      history.push({ nodes: [], edges: [] });

      const result = history.redo();

      expect(result).toBeNull();
    });

    it('should disable redo after redo', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      history.push({ nodes: [], edges: [] });
      await wait(10);
      history.push({ nodes: [node('1')], edges: [] });

      history.undo();
      history.redo();

      expect(history.canRedo).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all history', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      history.push({ nodes: [], edges: [] });
      await wait(10);
      history.push({ nodes: [node('1')], edges: [] });

      history.clear();

      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(false);
    });
  });

  describe('canUndo / canRedo', () => {
    it('should correctly report undo availability', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      expect(history.canUndo).toBe(false);

      history.push({ nodes: [], edges: [] });
      expect(history.canUndo).toBe(false);

      await wait(10);
      history.push({ nodes: [node('1')], edges: [] });
      expect(history.canUndo).toBe(true);
    });

    it('should correctly report redo availability', async () => {
      const history = new HistoryManager({ debounceMs: 5 });
      
      expect(history.canRedo).toBe(false);

      history.push({ nodes: [], edges: [] });
      await wait(10);
      history.push({ nodes: [node('1')], edges: [] });

      expect(history.canRedo).toBe(false);

      history.undo();
      expect(history.canRedo).toBe(true);
    });
  });
});
