/**
 * Typed tool registry (R5.AC1, R5.AC2).
 */
import type { ModelToolDescriptor } from '../gateway/types';
import { toModelToolDescriptor } from './adapters';
import type { WorkflowTool } from './types';

/** In-memory registry of typed tools keyed by descriptor name. */
export class WorkflowToolRegistry {
    private readonly tools = new Map<string, WorkflowTool>();

    register(tool: WorkflowTool): void {
        this.tools.set(tool.descriptor.name, tool);
    }

    registerAll(tools: WorkflowTool[]): void {
        for (const tool of tools) this.register(tool);
    }

    unregister(name: string): boolean {
        return this.tools.delete(name);
    }

    get(name: string): WorkflowTool | undefined {
        return this.tools.get(name);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    getAll(): WorkflowTool[] {
        return [...this.tools.values()];
    }

    /** Model-callable descriptors for a subset of tools (or all). */
    toModelToolDescriptors(names?: string[]): ModelToolDescriptor[] {
        const selected = names
            ? names
                  .map((n) => this.tools.get(n))
                  .filter((t): t is WorkflowTool => t !== undefined)
            : this.getAll();
        return selected.map(toModelToolDescriptor);
    }
}
