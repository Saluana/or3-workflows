import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    SchemaRegistry,
    stableStringify,
    projectValueToString,
    parseAndValidate,
    parseValidateRepair,
    validateStructuredValue,
    specFromJsonSchema,
    StructuredValidationError,
} from '../schema';
import type { StructuredOutputSpec } from '../schema';

describe('stableStringify / projection (R4.AC5, R4.AC6)', () => {
    it('produces deterministic key ordering', () => {
        const a = stableStringify({ b: 1, a: 2, c: { z: 1, y: 2 } });
        const b = stableStringify({ c: { y: 2, z: 1 }, a: 2, b: 1 });
        expect(a).toBe(b);
        expect(a).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
    });

    it('passes strings through unchanged', () => {
        expect(projectValueToString('hello')).toBe('hello');
        expect(projectValueToString({ x: 1 })).toBe('{"x":1}');
        expect(projectValueToString([1, 2, 3])).toBe('[1,2,3]');
    });
});

describe('SchemaRegistry round-trip (R4.AC1, R4.AC2)', () => {
    it('registers a zod schema and round-trips JSON Schema through a spec', () => {
        const registry = new SchemaRegistry();
        const schema = z.object({ name: z.string(), age: z.number() });
        registry.register('person', 1, schema);
        expect(registry.has('person', 1)).toBe(true);

        const spec = registry.toSpec('person', 1, { strict: true });
        expect(spec.schemaId).toBe('person');
        expect(spec.schemaVersion).toBe(1);
        expect(spec.jsonSchema).toBeTruthy();

        // A registered zod schema validates the same schemaId@version.
        const result = validateStructuredValue(
            { name: 'Ada', age: 36 },
            spec,
            registry
        );
        expect(result.ok).toBe(true);
    });

    it('rejects invalid values against the registered schema', () => {
        const registry = new SchemaRegistry();
        registry.register('person', 1, z.object({ age: z.number() }));
        const spec = registry.toSpec('person', 1);
        const result = validateStructuredValue(
            { age: 'not-a-number' } as never,
            spec,
            registry
        );
        expect(result.ok).toBe(false);
    });
});

describe('parse + validate + bounded repair (R4.AC3, R4.AC4)', () => {
    const registry = new SchemaRegistry();
    registry.register('answer', 1, z.object({ value: z.number() }));
    const spec: StructuredOutputSpec = {
        ...registry.toSpec('answer', 1),
        repair: { maxAttempts: 2, backend: 'retry' },
    };

    it('accepts valid JSON', () => {
        const r = parseAndValidate('{"value": 42}', spec, registry);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual({ value: 42 });
    });

    it('reports parse error on malformed JSON', () => {
        const r = parseAndValidate('{not json', spec, registry);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.parseError).toBeTruthy();
    });

    it('repairs within the budget', async () => {
        let attempt = 0;
        const r = await parseValidateRepair('garbage', spec, {
            registry,
            regenerate: async () => {
                attempt += 1;
                return attempt >= 1 ? '{"value": 7}' : 'still-bad';
            },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value).toEqual({ value: 7 });
    });

    it('exhausts bounded repair and surfaces a typed error', async () => {
        const calls: number[] = [];
        const r = await parseValidateRepair('garbage', spec, {
            registry,
            regenerate: async ({ attempt }) => {
                calls.push(attempt);
                return 'still-bad';
            },
        });
        expect(r.ok).toBe(false);
        expect(calls).toEqual([1, 2]);
        if (!r.ok) {
            const err = new StructuredValidationError(r);
            expect(err.name).toBe('StructuredValidationError');
        }
    });

    it('does not repair when no policy or regenerator', async () => {
        const noRepair = specFromJsonSchema('answer', 1, spec.jsonSchema);
        const r = await parseValidateRepair('bad', noRepair, { registry });
        expect(r.ok).toBe(false);
    });
});

describe('inline JSON Schema validation', () => {
    it('validates values when no Zod schema is registered', () => {
        const spec = specFromJsonSchema('unknown', 9, {
            type: 'object',
            properties: { answer: { type: 'number' } },
            required: ['answer'],
            additionalProperties: false,
        });
        const r = validateStructuredValue({ anything: true }, spec);
        expect(r.ok).toBe(false);
        const valid = validateStructuredValue({ answer: 42 }, spec);
        expect(valid.ok).toBe(true);
    });

    it('surfaces invalid persisted schemas as validation failures', () => {
        const spec = specFromJsonSchema('bad-schema', 1, {
            type: 'not-a-json-schema-type',
        });
        const r = validateStructuredValue({ anything: true }, spec);
        expect(r.ok).toBe(false);
    });
});
