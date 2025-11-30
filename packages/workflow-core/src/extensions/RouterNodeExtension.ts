import type {
  NodeExtension,
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
  RouterNodeData,
  RouteDefinition,
} from '../types';
import type { ValidationError, ValidationWarning } from '../validation';

/**
 * Router Node Extension
 * 
 * A conditional branching node that uses LLM classification to determine
 * which route to take based on the input content.
 */
export const RouterNodeExtension: NodeExtension = {
  name: 'router',
  type: 'node',

  // Port definitions - outputs are dynamic based on routes
  inputs: [
    {
      id: 'input',
      type: 'input',
      label: 'Input',
      dataType: 'any',
      required: true,
    },
  ],
  outputs: [
    // Dynamic outputs based on routes - these are defaults
    {
      id: 'route-1',
      type: 'output',
      label: 'Route 1',
      dataType: 'any',
    },
    {
      id: 'route-2',
      type: 'output',
      label: 'Route 2',
      dataType: 'any',
    },
  ],

  // Default data for new nodes
  defaultData: {
    label: 'Router',
    model: undefined, // Uses default model if not specified
    prompt: '', // Custom routing instructions
    routes: [
      { id: 'route-1', label: 'Option A' },
      { id: 'route-2', label: 'Option B' },
    ] as RouteDefinition[],
  },

  /**
   * Execute the router node.
   * Actual routing is handled by OpenRouterExecutionAdapter.
   */
  async execute(context: ExecutionContext): Promise<{ output: string; selectedRoute: string; nextNodes: string[] }> {
    const data = context.node.data as RouterNodeData;
    const routeCount = (data.routes || []).length;
    throw new Error(
      `RouterNodeExtension.execute is handled by OpenRouterExecutionAdapter (configured ${routeCount} routes). ` +
      'Use the adapter to run workflows instead of calling the extension directly.'
    );
  },

  /**
   * Validate the router node.
   */
  validate(node: WorkflowNode, edges: WorkflowEdge[]): (ValidationError | ValidationWarning)[] {
    const errors: (ValidationError | ValidationWarning)[] = [];
    const data = node.data as RouterNodeData;
    const routes = data.routes || [];

    // Check for at least one route
    if (routes.length === 0) {
      errors.push({
        type: 'error',
        code: 'MISSING_REQUIRED_PORT',
        message: 'Router node must have at least one route defined',
        nodeId: node.id,
      });
    }

    // Check for incoming connections
    const incomingEdges = edges.filter(e => e.target === node.id);
    if (incomingEdges.length === 0) {
      errors.push({
        type: 'error',
        code: 'DISCONNECTED_NODE',
        message: 'Router node has no incoming connections',
        nodeId: node.id,
      });
    }

    // Check that each route has an outgoing edge
    const outgoingEdges = edges.filter(e => e.source === node.id);
    routes.forEach((route: RouteDefinition) => {
      const hasEdge = outgoingEdges.some(e => e.sourceHandle === route.id);
      if (!hasEdge) {
        errors.push({
          type: 'warning',
          code: 'MISSING_EDGE_LABEL',
          message: `Route "${route.label}" has no connected node`,
          nodeId: node.id,
        });
      }
    });

    // Check for edges without labels
    outgoingEdges.forEach(edge => {
      if (!edge.label && !edge.sourceHandle) {
        errors.push({
          type: 'warning',
          code: 'MISSING_EDGE_LABEL',
          message: 'Router edge is missing a label',
          nodeId: node.id,
          edgeId: edge.id,
        });
      }
    });

    return errors;
  },

  /**
   * Get dynamic outputs based on routes configuration.
   */
  getDynamicOutputs(node: WorkflowNode): { id: string; label: string }[] {
    const data = node.data as RouterNodeData;
    const routes = data.routes || [];
    
    return routes.map((route: RouteDefinition) => ({
      id: route.id,
      label: route.label,
    }));
  },
};

// Type augmentation for dynamic outputs
declare module '../types' {
  interface NodeExtension {
    getDynamicOutputs?: (node: WorkflowNode) => { id: string; label: string }[];
  }
}
