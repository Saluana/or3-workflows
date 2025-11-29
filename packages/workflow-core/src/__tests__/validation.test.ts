import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../validation';
import type { WorkflowNode, WorkflowEdge } from '../types';

// Helper to create nodes
const startNode = (id = 'start-1'): WorkflowNode => ({
  id,
  type: 'start',
  position: { x: 0, y: 0 },
  data: { label: 'Start' },
});

const agentNode = (id: string, model = 'openai/gpt-4o-mini', prompt = 'Test'): WorkflowNode => ({
  id,
  type: 'agent',
  position: { x: 200, y: 0 },
  data: { label: 'Agent', model, prompt },
});

const routerNode = (id: string): WorkflowNode => ({
  id,
  type: 'router',
  position: { x: 200, y: 0 },
  data: { label: 'Router', routes: [{ id: 'r1', label: 'Route 1' }] },
});

const edge = (source: string, target: string, id = `${source}-${target}`): WorkflowEdge => ({
  id,
  source,
  target,
});

describe('validateWorkflow', () => {
  describe('start node validation', () => {
    it('should error when no start node exists', () => {
      const nodes: WorkflowNode[] = [agentNode('agent-1')];
      const edges: WorkflowEdge[] = [];

      const result = validateWorkflow(nodes, edges);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'NO_START_NODE' })
      );
    });

    it('should error when multiple start nodes exist', () => {
      const nodes: WorkflowNode[] = [startNode('start-1'), startNode('start-2')];
      const edges: WorkflowEdge[] = [];

      const result = validateWorkflow(nodes, edges);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'MULTIPLE_START_NODES' })
      );
    });

    it('should pass with exactly one start node', () => {
      const nodes: WorkflowNode[] = [startNode(), agentNode('agent-1')];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.errors.filter(e => e.code === 'NO_START_NODE')).toHaveLength(0);
      expect(result.errors.filter(e => e.code === 'MULTIPLE_START_NODES')).toHaveLength(0);
    });
  });

  describe('connectivity validation', () => {
    it('should error when node is disconnected from start', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        agentNode('agent-1'),
        agentNode('agent-2'), // Disconnected
      ];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'DISCONNECTED_NODE',
          nodeId: 'agent-2',
        })
      );
    });

    it('should pass when all nodes are reachable', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        agentNode('agent-1'),
        agentNode('agent-2'),
      ];
      const edges: WorkflowEdge[] = [
        edge('start-1', 'agent-1'),
        edge('agent-1', 'agent-2'),
      ];

      const result = validateWorkflow(nodes, edges);

      expect(result.errors.filter(e => e.code === 'DISCONNECTED_NODE')).toHaveLength(0);
    });

    it('should handle branching workflows', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        routerNode('router-1'),
        agentNode('agent-1'),
        agentNode('agent-2'),
      ];
      const edges: WorkflowEdge[] = [
        edge('start-1', 'router-1'),
        edge('router-1', 'agent-1'),
        edge('router-1', 'agent-2'),
      ];

      const result = validateWorkflow(nodes, edges);

      expect(result.errors.filter(e => e.code === 'DISCONNECTED_NODE')).toHaveLength(0);
    });
  });

  describe('agent node validation', () => {
    it('should error when agent has no model', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        { ...agentNode('agent-1'), data: { label: 'Agent', model: '', prompt: 'Test' } },
      ];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_MODEL',
          nodeId: 'agent-1',
        })
      );
    });

    it('should warn when agent has no prompt', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        { ...agentNode('agent-1'), data: { label: 'Agent', model: 'test', prompt: '' } },
      ];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_PROMPT',
          nodeId: 'agent-1',
        })
      );
    });

    it('should pass when agent has model and prompt', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        agentNode('agent-1', 'openai/gpt-4o-mini', 'You are helpful'),
      ];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.errors.filter(e => e.code === 'MISSING_MODEL')).toHaveLength(0);
      expect(result.warnings.filter(w => w.code === 'EMPTY_PROMPT')).toHaveLength(0);
    });
  });

  describe('overall validation', () => {
    it('should return isValid=true for valid workflow', () => {
      const nodes: WorkflowNode[] = [
        startNode(),
        agentNode('agent-1'),
      ];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return isValid=false for invalid workflow', () => {
      const nodes: WorkflowNode[] = []; // No start node
      const edges: WorkflowEdge[] = [];

      const result = validateWorkflow(nodes, edges);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should collect multiple errors', () => {
      const nodes: WorkflowNode[] = [
        startNode('start-1'),
        startNode('start-2'), // Multiple starts
        { ...agentNode('agent-1'), data: { label: 'Agent', model: '', prompt: '' } }, // No model
        agentNode('agent-2'), // Disconnected
      ];
      const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

      const result = validateWorkflow(nodes, edges);

      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('empty workflow', () => {
    it('should handle empty workflow', () => {
      const result = validateWorkflow([], []);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'NO_START_NODE' })
      );
    });
  });
});
