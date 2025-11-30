import type {
  NodeExtension,
  WorkflowNode,
  WorkflowEdge,
  WhileLoopNodeData,
} from '../types';
import type { ValidationError, ValidationWarning } from '../validation';

export interface LoopState {
  iteration: number;
  outputs: string[];
  lastOutput: string | null;
  totalIterations?: number;
  isActive: boolean;
}

/**
  * While Loop node extension definition.
  * Execution is handled by the adapter; this provides shape, defaults, and validation.
  */
export const WhileLoopExtension: NodeExtension = {
  name: 'whileLoop',
  type: 'node',

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
    { id: 'body', type: 'output', label: 'Loop Body', dataType: 'any' },
    { id: 'done', type: 'output', label: 'Exit', dataType: 'any' },
  ],

  defaultData: {
    label: 'While Loop',
    conditionPrompt:
      'Based on the current output, should we continue iterating to improve the result? Respond with only "continue" or "done".',
    maxIterations: 10,
    onMaxIterations: 'warning',
  },

  async execute() {
    throw new Error(
      'WhileLoopExtension.execute is handled by the execution adapter. Use an adapter to run workflows.'
    );
  },

  validate(node: WorkflowNode, edges: WorkflowEdge[]): (ValidationError | ValidationWarning)[] {
    const errors: (ValidationError | ValidationWarning)[] = [];
    const data = node.data as WhileLoopNodeData;

    if (!data.conditionPrompt || data.conditionPrompt.trim() === '') {
      errors.push({
        type: 'error',
        code: 'MISSING_CONDITION_PROMPT',
        message: 'While loop requires a condition prompt',
        nodeId: node.id,
      });
    }

    if (!data.maxIterations || data.maxIterations <= 0) {
      errors.push({
        type: 'error',
        code: 'INVALID_MAX_ITERATIONS',
        message: 'Max iterations must be greater than zero',
        nodeId: node.id,
      });
    }

    const outgoing = edges.filter(e => e.source === node.id);
    const hasBody = outgoing.some(e => e.sourceHandle === 'body');
    const hasExit = outgoing.some(e => e.sourceHandle === 'done');

    if (!hasBody) {
      errors.push({
        type: 'warning',
        code: 'MISSING_BODY',
        message: 'Loop body is not connected',
        nodeId: node.id,
      });
    }

    if (!hasExit) {
      errors.push({
        type: 'warning',
        code: 'MISSING_EXIT',
        message: 'Loop exit is not connected',
        nodeId: node.id,
      });
    }

    return errors;
  },
};
