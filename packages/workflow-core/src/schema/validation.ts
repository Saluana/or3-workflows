/**
 * Structured response parsing, validation, and bounded repair (R4.AC3, R4.AC4).
 *
 * The runtime parses a candidate string as JSON, validates it against a
 * registered Zod schema (when available), and — when a bounded repair policy is
 * configured — attempts a limited number of regenerations before surfacing a
 * typed error. Missing repair budget never loops forever.
 */
import { z } from 'zod';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import type { JsonValue } from '../gateway/types';
import type {
    SchemaRef,
    StructuredOutputSpec,
    StructuredValidationIssue,
    StructuredValidationResult,
} from './types';
import { SchemaRegistry, schemaRegistry } from './SchemaRegistry';

const MAX_ISSUES = 20;
const jsonSchemaValidator = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
});
const compiledSchemas = new WeakMap<object, ValidateFunction>();

function validateJsonSchema(
    value: JsonValue,
    schema: Record<string, unknown>
): { ok: true } | { ok: false; issues: StructuredValidationIssue[] } {
    try {
        let validate = compiledSchemas.get(schema);
        if (!validate) {
            validate = jsonSchemaValidator.compile(schema);
            compiledSchemas.set(schema, validate);
        }
        if (validate(value)) return { ok: true };
        return {
            ok: false,
            issues: boundIssues(
                (validate.errors ?? []).map((issue) => ({
                    path: issue.instancePath
                        .replace(/^\//, '')
                        .replace(/\//g, '.'),
                    message: issue.message ?? 'JSON Schema validation failed',
                    code: issue.keyword,
                }))
            ),
        };
    } catch (error) {
        return {
            ok: false,
            issues: [
                {
                    path: '',
                    message:
                        error instanceof Error
                            ? `Invalid JSON Schema: ${error.message}`
                            : 'Invalid JSON Schema',
                    code: 'invalid_schema',
                },
            ],
        };
    }
}

function boundIssues(
    issues: StructuredValidationIssue[]
): StructuredValidationIssue[] {
    return issues.slice(0, MAX_ISSUES);
}

/** Parse a candidate string as JSON, returning a typed parse error on failure. */
export function parseJsonCandidate(
    candidate: string
): { ok: true; value: JsonValue } | { ok: false; error: string } {
    try {
        return { ok: true, value: JSON.parse(candidate) as JsonValue };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid JSON',
        };
    }
}

/**
 * Validate an already-parsed JSON value against the schema referenced by a spec.
 *
 * When no Zod schema is registered for `schemaId@version`, the serializable
 * JSON Schema is validated with Ajv. Inline/schema-only workflows therefore
 * retain the same runtime guarantee as code-first Zod workflows.
 */
export function validateStructuredValue(
    value: JsonValue,
    spec: StructuredOutputSpec,
    registry: SchemaRegistry = schemaRegistry
): StructuredValidationResult {
    const schema: SchemaRef = {
        id: spec.schemaId,
        version: spec.schemaVersion,
    };
    const registered = registry.get(spec.schemaId, spec.schemaVersion);
    if (!registered) {
        const validated = validateJsonSchema(value, spec.jsonSchema);
        return validated.ok
            ? { ok: true, value, schema }
            : { ok: false, schema, issues: validated.issues };
    }
    const parsed = registered.schema.safeParse(value);
    if (parsed.success) {
        return { ok: true, value: parsed.data as JsonValue, schema };
    }
    return {
        ok: false,
        schema,
        issues: boundIssues(
            parsed.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
                code: issue.code,
            }))
        ),
    };
}

/**
 * Parse + validate a candidate string against a spec.
 */
export function parseAndValidate(
    candidate: string,
    spec: StructuredOutputSpec,
    registry: SchemaRegistry = schemaRegistry
): StructuredValidationResult {
    const parsed = parseJsonCandidate(candidate);
    if (!parsed.ok) {
        return {
            ok: false,
            schema: { id: spec.schemaId, version: spec.schemaVersion },
            issues: [{ path: '', message: parsed.error, code: 'invalid_json' }],
            parseError: parsed.error,
        };
    }
    return validateStructuredValue(parsed.value, spec, registry);
}

/** Callback that regenerates a candidate given prior validation feedback. */
export type RepairRegenerator = (context: {
    attempt: number;
    previous: string;
    issues: StructuredValidationIssue[];
    parseError?: string;
}) => Promise<string>;

/**
 * Parse, validate, and — if configured — apply bounded repair.
 *
 * Repair attempts are capped by `spec.repair.maxAttempts`. `retry` requests a
 * fresh candidate via `regenerate`; `response-healing` is only meaningful for
 * non-streaming Chat and, absent a `regenerate`, surfaces the last error.
 */
export async function parseValidateRepair(
    candidate: string,
    spec: StructuredOutputSpec,
    options: {
        registry?: SchemaRegistry;
        regenerate?: RepairRegenerator;
    } = {}
): Promise<StructuredValidationResult> {
    const registry = options.registry ?? schemaRegistry;
    let current = candidate;
    let result = parseAndValidate(current, spec, registry);
    if (result.ok) return result;

    const maxAttempts = spec.repair?.maxAttempts ?? 0;
    if (maxAttempts <= 0 || !options.regenerate) {
        return result;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const previous = current;
        const issues = result.ok ? [] : result.issues;
        const parseError = result.ok ? undefined : result.parseError;
        current = await options.regenerate({
            attempt,
            previous,
            issues,
            parseError,
        });
        result = parseAndValidate(current, spec, registry);
        if (result.ok) return result;
    }

    return result;
}

/** Typed error thrown when structured validation/repair is exhausted. */
export class StructuredValidationError extends Error {
    readonly schema: SchemaRef;
    readonly issues: StructuredValidationIssue[];
    readonly parseError?: string;

    constructor(result: Extract<StructuredValidationResult, { ok: false }>) {
        super(
            `Structured output failed validation for schema "${result.schema.id}@${result.schema.version}": ` +
                result.issues.map((i) => `${i.path} ${i.message}`).join('; ')
        );
        this.name = 'StructuredValidationError';
        this.schema = result.schema;
        this.issues = result.issues;
        this.parseError = result.parseError;
    }
}

/** Build a {@link StructuredOutputSpec} from an inline JSON Schema (no registry). */
export function specFromJsonSchema(
    schemaId: string,
    schemaVersion: number,
    jsonSchema: Record<string, unknown>,
    options?: { strict?: boolean; repair?: StructuredOutputSpec['repair'] }
): StructuredOutputSpec {
    return {
        schemaId,
        schemaVersion,
        jsonSchema,
        strict: options?.strict ?? true,
        repair: options?.repair,
    };
}

/** Convenience: register a Zod schema and return its spec in one call. */
export function registerAndSpec(
    registry: SchemaRegistry,
    id: string,
    version: number,
    schema: z.ZodType<unknown>,
    options?: { strict?: boolean; repair?: StructuredOutputSpec['repair'] }
): StructuredOutputSpec {
    registry.register(id, version, schema);
    return registry.toSpec(id, version, options);
}
