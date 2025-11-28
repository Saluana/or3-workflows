import { OpenRouter } from '@openrouter/sdk';
import { StepConfig, RunInput, RunOptions, WorkflowResult, WorkflowEvent, WorkflowDefinition } from './types';
import { Executor } from './executor';

/**
 * Fluent builder for creating and executing workflows.
 */
export class WorkflowBuilder {
  private steps: any[] = [];

  constructor(private client: OpenRouter) {}

  /**
   * Adds a sequential step to the workflow.
   * @param config Configuration for the step.
   */
  step(config: StepConfig): this {
    this.steps.push({ type: 'step', config });
    return this;
  }

  /**
   * Adds a parallel step to the workflow, where multiple models run concurrently.
   * @param configs List of configurations for each parallel branch.
   */
  parallel(configs: StepConfig[]): this {
    this.steps.push({ type: 'parallel', configs });
    return this;
  }

  /**
   * Executes the workflow.
   * @param input Initial input string or RunInput object.
   * @param options Execution options.
   * @returns Promise resolving to the workflow result.
   */
  async run(input: string | RunInput, options?: RunOptions): Promise<WorkflowResult> {
    const executor = new Executor(this.client, this.steps);
    return executor.run(input, options);
  }

  /**
   * Executes the workflow in streaming mode.
   * @param input Initial input string or RunInput object.
   * @param options Execution options.
   * @returns Async generator yielding workflow events.
   */
  async *stream(input: string | RunInput, options?: RunOptions): AsyncGenerator<WorkflowEvent> {
    const executor = new Executor(this.client, this.steps);
    yield* executor.stream(input, options);
  }

  /**
   * Serializes the workflow definition to JSON.
   */
  toJSON(): WorkflowDefinition {
    return { steps: this.steps };
  }

  /**
   * Creates a WorkflowBuilder from a JSON definition.
   * @param client OpenRouter client instance.
   * @param definition Workflow definition object.
   */
  static fromJSON(client: OpenRouter, definition: WorkflowDefinition): WorkflowBuilder {
    const builder = new WorkflowBuilder(client);
    builder.steps = definition.steps;
    return builder;
  }
}

/**
 * Factory function to create a new WorkflowBuilder.
 * @param client OpenRouter client instance.
 */
export function workflow(client: OpenRouter): WorkflowBuilder {
  return new WorkflowBuilder(client);
}
