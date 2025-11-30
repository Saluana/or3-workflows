import type {
  NodeExtension,
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
  AgentNodeData,
} from '../types';
import type { ValidationError, ValidationWarning } from '../validation';

/** Default model for agent nodes */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/**
 * Agent Node Extension
 * 
 * Represents an LLM agent that processes input and generates output.
 * Supports model selection, custom prompts, temperature, and tool usage.
 */
export const AgentNodeExtension: NodeExtension = {
  name: 'agent',
  type: 'node',

  // Port definitions
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
    {
      id: 'output',
      type: 'output',
      label: 'Output',
      dataType: 'string',
      multiple: true,
    },
  ],

  // Default data for new nodes
  defaultData: {
    label: 'Agent',
    model: DEFAULT_MODEL,
    prompt: '',
    temperature: undefined,
    maxTokens: undefined,
    tools: [],
  },

  /**
   * Execute the agent node.
   * 
   * @internal Execution is handled by OpenRouterExecutionAdapter.
   * Calling this directly will raise to prevent confusing placeholder data.
   */
  async execute(context: ExecutionContext): Promise<{ output: string; nextNodes: string[] }> {
    throw new Error(
      'AgentNodeExtension.execute is handled by OpenRouterExecutionAdapter. ' +
      'Use the execution adapter to run workflows instead of calling extensions directly.'
    );
  },

  /**
   * Validate the agent node.
   */
  validate(node: WorkflowNode, edges: WorkflowEdge[]): (ValidationError | ValidationWarning)[] {
    const errors: (ValidationError | ValidationWarning)[] = [];
    const data = node.data as AgentNodeData;

    // Check for model
    if (!data.model) {
      errors.push({
        type: 'error',
        code: 'MISSING_MODEL',
        message: 'Agent node requires a model to be selected',
        nodeId: node.id,
      });
    }

    // Warn if prompt is empty
    if (!data.prompt || data.prompt.trim() === '') {
      errors.push({
        type: 'warning',
        code: 'EMPTY_PROMPT',
        message: 'Agent node has no system prompt configured',
        nodeId: node.id,
      });
    }

    // Check for incoming connections
    const incomingEdges = edges.filter(e => e.target === node.id);
    if (incomingEdges.length === 0) {
      errors.push({
        type: 'error',
        code: 'DISCONNECTED_NODE',
        message: 'Agent node has no incoming connections',
        nodeId: node.id,
      });
    }

    return errors;
  },
};
