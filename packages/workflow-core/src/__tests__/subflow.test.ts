import { describe, it, expect, beforeEach } from 'vitest';
import {
    DefaultSubflowRegistry,
    SubflowDefinition,
    SubflowInput,
    SubflowOutput,
    SubflowNodeData,
    isSubflowInput,
    isSubflowOutput,
    isSubflowDefinition,
    isSubflowNodeData,
    createSubflowDefinition,
    validateInputMappings,
} from '../subflow';
import type { WorkflowData } from '../types';

// Test fixtures
const createMockWorkflow = (): WorkflowData => ({
    meta: {
        version: '2.0.0',
        name: 'Test Workflow',
    },
    nodes: [
        {
            id: 'start-1',
            type: 'start',
            position: { x: 0, y: 0 },
            data: { label: 'Start' },
        },
    ],
    edges: [],
});

const createMockSubflow = (
    overrides?: Partial<SubflowDefinition>
): SubflowDefinition => ({
    id: 'test-subflow',
    name: 'Test Subflow',
    inputs: [
        { id: 'text', name: 'Text Input', type: 'string', required: true },
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'string' }],
    workflow: createMockWorkflow(),
    ...overrides,
});

// ============================================================================
// DefaultSubflowRegistry Tests
// ============================================================================

describe('DefaultSubflowRegistry', () => {
    let registry: DefaultSubflowRegistry;

    beforeEach(() => {
        registry = new DefaultSubflowRegistry();
    });

    describe('register', () => {
        it('should register a valid subflow', () => {
            const subflow = createMockSubflow();
            registry.register(subflow);
            expect(registry.has('test-subflow')).toBe(true);
        });

        it('should throw if subflow has no id', () => {
            const subflow = createMockSubflow({ id: '' });
            expect(() => registry.register(subflow)).toThrow(
                'Subflow must have an id'
            );
        });

        it('should throw if subflow has no name', () => {
            const subflow = createMockSubflow({ name: '' });
            expect(() => registry.register(subflow)).toThrow(
                'Subflow must have a name'
            );
        });

        it('should throw if subflow has no workflow', () => {
            const subflow = {
                ...createMockSubflow(),
                workflow: undefined as any,
            };
            expect(() => registry.register(subflow)).toThrow(
                'Subflow must have a workflow'
            );
        });

        it('should overwrite existing subflow with same id', () => {
            const subflow1 = createMockSubflow();
            const subflow2 = createMockSubflow({ name: 'Updated Subflow' });
            registry.register(subflow1);
            registry.register(subflow2);
            expect(registry.get('test-subflow')?.name).toBe('Updated Subflow');
        });
    });

    describe('get', () => {
        it('should return registered subflow', () => {
            const subflow = createMockSubflow();
            registry.register(subflow);
            expect(registry.get('test-subflow')).toEqual(subflow);
        });

        it('should return undefined for non-existent subflow', () => {
            expect(registry.get('non-existent')).toBeUndefined();
        });
    });

    describe('list', () => {
        it('should return empty array when no subflows registered', () => {
            expect(registry.list()).toEqual([]);
        });

        it('should return all registered subflows', () => {
            const subflow1 = createMockSubflow({ id: 'subflow-1' });
            const subflow2 = createMockSubflow({ id: 'subflow-2' });
            registry.register(subflow1);
            registry.register(subflow2);
            expect(registry.list()).toHaveLength(2);
        });
    });

    describe('has', () => {
        it('should return true for registered subflow', () => {
            registry.register(createMockSubflow());
            expect(registry.has('test-subflow')).toBe(true);
        });

        it('should return false for non-existent subflow', () => {
            expect(registry.has('non-existent')).toBe(false);
        });
    });

    describe('unregister', () => {
        it('should remove registered subflow', () => {
            registry.register(createMockSubflow());
            registry.unregister('test-subflow');
            expect(registry.has('test-subflow')).toBe(false);
        });

        it('should not throw for non-existent subflow', () => {
            expect(() => registry.unregister('non-existent')).not.toThrow();
        });
    });

    describe('clear', () => {
        it('should remove all subflows', () => {
            registry.register(createMockSubflow({ id: 'subflow-1' }));
            registry.register(createMockSubflow({ id: 'subflow-2' }));
            registry.clear();
            expect(registry.list()).toHaveLength(0);
        });
    });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
    describe('isSubflowInput', () => {
        it('should return true for valid input', () => {
            const input: SubflowInput = {
                id: 'test',
                name: 'Test',
                type: 'string',
            };
            expect(isSubflowInput(input)).toBe(true);
        });

        it('should return true for input with optional fields', () => {
            const input: SubflowInput = {
                id: 'test',
                name: 'Test',
                type: 'string',
                required: true,
                default: 'default value',
            };
            expect(isSubflowInput(input)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isSubflowInput(null)).toBe(false);
        });

        it('should return false for missing id', () => {
            expect(isSubflowInput({ name: 'Test', type: 'string' })).toBe(
                false
            );
        });

        it('should return false for invalid type', () => {
            expect(
                isSubflowInput({ id: 'test', name: 'Test', type: 'invalid' })
            ).toBe(false);
        });

        it('should accept all valid port types', () => {
            const types = [
                'string',
                'number',
                'object',
                'array',
                'any',
            ] as const;
            for (const type of types) {
                expect(isSubflowInput({ id: 'test', name: 'Test', type })).toBe(
                    true
                );
            }
        });
    });

    describe('isSubflowOutput', () => {
        it('should return true for valid output', () => {
            const output: SubflowOutput = {
                id: 'test',
                name: 'Test',
                type: 'string',
            };
            expect(isSubflowOutput(output)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isSubflowOutput(null)).toBe(false);
        });

        it('should return false for missing name', () => {
            expect(isSubflowOutput({ id: 'test', type: 'string' })).toBe(false);
        });
    });

    describe('isSubflowDefinition', () => {
        it('should return true for valid definition', () => {
            const def = createMockSubflow();
            expect(isSubflowDefinition(def)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isSubflowDefinition(null)).toBe(false);
        });

        it('should return false for missing id', () => {
            const def = { ...createMockSubflow(), id: undefined };
            expect(isSubflowDefinition(def)).toBe(false);
        });

        it('should return false for invalid inputs array', () => {
            const def = { ...createMockSubflow(), inputs: 'invalid' };
            expect(isSubflowDefinition(def)).toBe(false);
        });

        it('should return false for invalid outputs array', () => {
            const def = {
                ...createMockSubflow(),
                outputs: [{ invalid: true }],
            };
            expect(isSubflowDefinition(def)).toBe(false);
        });

        it('should return false for missing workflow', () => {
            const def = { ...createMockSubflow(), workflow: null };
            expect(isSubflowDefinition(def)).toBe(false);
        });
    });

    describe('isSubflowNodeData', () => {
        it('should return true for valid node data', () => {
            const data: SubflowNodeData = {
                label: 'Test',
                subflowId: 'test-subflow',
                inputMappings: { text: '{{output}}' },
            };
            expect(isSubflowNodeData(data)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isSubflowNodeData(null)).toBe(false);
        });

        it('should return false for missing subflowId', () => {
            expect(isSubflowNodeData({ inputMappings: {} })).toBe(false);
        });

        it('should return false for missing inputMappings', () => {
            expect(isSubflowNodeData({ subflowId: 'test' })).toBe(false);
        });
    });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
    describe('createSubflowDefinition', () => {
        it('should create definition with defaults', () => {
            const workflow = createMockWorkflow();
            const def = createSubflowDefinition(
                'test',
                'Test Subflow',
                workflow
            );

            expect(def.id).toBe('test');
            expect(def.name).toBe('Test Subflow');
            expect(def.workflow).toBe(workflow);
            expect(def.inputs).toHaveLength(1);
            expect(def.outputs).toHaveLength(1);
        });

        it('should use provided options', () => {
            const workflow = createMockWorkflow();
            const inputs: SubflowInput[] = [
                { id: 'input1', name: 'Input 1', type: 'string' },
                { id: 'input2', name: 'Input 2', type: 'number' },
            ];
            const outputs: SubflowOutput[] = [
                { id: 'out1', name: 'Out 1', type: 'object' },
            ];

            const def = createSubflowDefinition('test', 'Test', workflow, {
                description: 'A test subflow',
                inputs,
                outputs,
            });

            expect(def.description).toBe('A test subflow');
            expect(def.inputs).toEqual(inputs);
            expect(def.outputs).toEqual(outputs);
        });
    });

    describe('validateInputMappings', () => {
        it('should return valid for all required inputs mapped', () => {
            const subflow = createMockSubflow();
            const result = validateInputMappings(subflow, { text: 'hello' });
            expect(result.valid).toBe(true);
            expect(result.missing).toHaveLength(0);
        });

        it('should return missing for unmapped required inputs', () => {
            const subflow = createMockSubflow();
            const result = validateInputMappings(subflow, {});
            expect(result.valid).toBe(false);
            expect(result.missing).toContain('text');
        });

        it('should not require inputs with defaults', () => {
            const subflow = createMockSubflow({
                inputs: [
                    {
                        id: 'text',
                        name: 'Text',
                        type: 'string',
                        required: true,
                        default: 'default',
                    },
                ],
            });
            const result = validateInputMappings(subflow, {});
            expect(result.valid).toBe(true);
        });

        it('should not require optional inputs', () => {
            const subflow = createMockSubflow({
                inputs: [
                    {
                        id: 'optional',
                        name: 'Optional',
                        type: 'string',
                        required: false,
                    },
                ],
            });
            const result = validateInputMappings(subflow, {});
            expect(result.valid).toBe(true);
        });

        it('should report multiple missing inputs', () => {
            const subflow = createMockSubflow({
                inputs: [
                    {
                        id: 'input1',
                        name: 'Input 1',
                        type: 'string',
                        required: true,
                    },
                    {
                        id: 'input2',
                        name: 'Input 2',
                        type: 'number',
                        required: true,
                    },
                    {
                        id: 'input3',
                        name: 'Input 3',
                        type: 'any',
                        required: true,
                    },
                ],
            });
            const result = validateInputMappings(subflow, {});
            expect(result.valid).toBe(false);
            expect(result.missing).toHaveLength(3);
        });
    });
});
