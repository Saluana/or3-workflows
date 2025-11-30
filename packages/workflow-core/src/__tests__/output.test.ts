import { describe, it, expect } from 'vitest';
import {
    OutputNodeExtension,
    isOutputNodeData,
    interpolateTemplate,
} from '../extensions/OutputNodeExtension';
import type { WorkflowNode, WorkflowEdge } from '../types';

// Helper to create nodes
const createNode = (type: string, id: string, data: any): WorkflowNode => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
});

const createEdge = (
    source: string,
    target: string,
    sourceHandle?: string
): WorkflowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
});

describe('OutputNodeExtension', () => {
    describe('metadata', () => {
        it('should have correct name', () => {
            expect(OutputNodeExtension.name).toBe('output');
        });

        it('should have correct type', () => {
            expect(OutputNodeExtension.type).toBe('node');
        });

        it('should have empty outputs (terminal node)', () => {
            expect(OutputNodeExtension.outputs).toEqual([]);
        });

        it('should have one input', () => {
            expect(OutputNodeExtension.inputs).toHaveLength(1);
            expect(OutputNodeExtension.inputs![0]).toMatchObject({
                id: 'input',
                dataType: 'any',
            });
        });
    });

    describe('defaultData', () => {
        it('should return default output node data', () => {
            expect(OutputNodeExtension.defaultData).toEqual({
                label: 'Output',
                format: 'text',
                includeMetadata: false,
            });
        });
    });

    describe('validate', () => {
        it('should pass with valid output node', () => {
            const node = createNode('output', 'output-1', {
                label: 'Output',
                format: 'text',
            });
            const edges: WorkflowEdge[] = [createEdge('agent-1', 'output-1')];

            const result = OutputNodeExtension.validate!(node, edges);

            expect(result).toHaveLength(0);
        });

        it('should warn when node has no incoming edges', () => {
            const node = createNode('output', 'output-1', {
                label: 'Output',
                format: 'text',
            });
            const edges: WorkflowEdge[] = [];

            const result = OutputNodeExtension.validate!(node, edges);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                code: 'NO_INPUT',
            });
        });
    });
});

describe('isOutputNodeData', () => {
    it('should return true for valid output node data', () => {
        const data = {
            label: 'Output',
            format: 'text',
        };
        expect(isOutputNodeData(data)).toBe(true);
    });

    it('should return true with all optional fields', () => {
        const data = {
            label: 'Output',
            format: 'json',
            template: '{{summarizer}}',
            includeMetadata: true,
            schema: { type: 'object' },
        };
        expect(isOutputNodeData(data)).toBe(true);
    });

    it('should return false for data without format', () => {
        const data = {
            label: 'Output',
        };
        expect(isOutputNodeData(data)).toBe(false);
    });

    it('should return false for invalid format', () => {
        const data = {
            label: 'Output',
            format: 'invalid',
        };
        expect(isOutputNodeData(data)).toBe(false);
    });

    it('should return false for non-object data', () => {
        expect(isOutputNodeData(null)).toBe(false);
        expect(isOutputNodeData(undefined)).toBe(false);
        expect(isOutputNodeData('string')).toBe(false);
        expect(isOutputNodeData(123)).toBe(false);
    });
});

describe('interpolateTemplate', () => {
    it('should replace output references', () => {
        const template = 'Result: {{agent1}}';
        const outputs = { agent1: 'Hello World' };

        const result = interpolateTemplate(template, outputs);

        expect(result).toBe('Result: Hello World');
    });

    it('should handle multiple references', () => {
        const template = 'Summary: {{agent1}} and {{agent2}}';
        const outputs = {
            agent1: 'First',
            agent2: 'Second',
        };

        const result = interpolateTemplate(template, outputs);

        expect(result).toBe('Summary: First and Second');
    });

    it('should leave unmatched references as-is', () => {
        const template = 'Result: {{missingNode}}';
        const outputs = {};

        const result = interpolateTemplate(template, outputs);

        expect(result).toBe('Result: {{missingNode}}');
    });

    it('should handle mixed static and dynamic content', () => {
        const template = 'Hello {{name}}, your score is {{score}}!';
        const outputs = {
            name: 'Alice',
            score: '95',
        };

        const result = interpolateTemplate(template, outputs);

        expect(result).toBe('Hello Alice, your score is 95!');
    });

    it('should return empty string for empty template', () => {
        const result = interpolateTemplate('', {});
        expect(result).toBe('');
    });

    it('should handle templates with no placeholders', () => {
        const result = interpolateTemplate('Static text only', {
            node: 'value',
        });
        expect(result).toBe('Static text only');
    });
});
