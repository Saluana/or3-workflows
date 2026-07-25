/**
 * Runtime schema registry (R4.AC1, R4.AC2).
 *
 * Associates a `schemaId@version` with a runtime Zod schema so validation can
 * run against the same identity that a persisted {@link StructuredOutputSpec}
 * carries as JSON Schema. Persisted workflows never contain a Zod instance.
 */
import { z } from 'zod';
import type { StructuredOutputSpec } from './types';

/** Compose the canonical registry key from id + version. */
export function schemaKey(id: string, version: number): string {
    return `${id}@${version}`;
}

/** An entry registered in the {@link SchemaRegistry}. */
export interface RegisteredSchema {
    id: string;
    version: number;
    schema: z.ZodType<unknown>;
    /** JSON Schema projection for persistence / provider requests. */
    jsonSchema: Record<string, unknown>;
}

/**
 * In-memory registry keyed by `schemaId@version`. A registered Zod schema
 * validates the same identity that round-trips through workflow storage as JSON
 * Schema.
 */
export class SchemaRegistry {
    private readonly entries = new Map<string, RegisteredSchema>();

    /**
     * Register a Zod schema under `id@version`. The JSON Schema projection is
     * derived automatically (Zod v4 `z.toJSONSchema`) unless supplied.
     */
    register(
        id: string,
        version: number,
        schema: z.ZodType<unknown>,
        jsonSchema?: Record<string, unknown>
    ): RegisteredSchema {
        const key = schemaKey(id, version);
        const entry: RegisteredSchema = {
            id,
            version,
            schema,
            jsonSchema: jsonSchema ?? this.toJsonSchema(schema),
        };
        this.entries.set(key, entry);
        return entry;
    }

    /** Look up a registered schema by id + version. */
    get(id: string, version: number): RegisteredSchema | undefined {
        return this.entries.get(schemaKey(id, version));
    }

    /** True when a schema id + version is registered. */
    has(id: string, version: number): boolean {
        return this.entries.has(schemaKey(id, version));
    }

    /** Remove a registered schema. */
    unregister(id: string, version: number): boolean {
        return this.entries.delete(schemaKey(id, version));
    }

    /** All registered schema keys. */
    keys(): string[] {
        return [...this.entries.keys()];
    }

    /**
     * Build a serializable {@link StructuredOutputSpec} for a registered schema.
     * The returned spec contains only JSON Schema and is safe to persist.
     */
    toSpec(
        id: string,
        version: number,
        options?: { strict?: boolean; repair?: StructuredOutputSpec['repair'] }
    ): StructuredOutputSpec {
        const entry = this.get(id, version);
        if (!entry) {
            throw new Error(
                `Schema "${schemaKey(id, version)}" is not registered`
            );
        }
        return {
            schemaId: entry.id,
            schemaVersion: entry.version,
            jsonSchema: entry.jsonSchema,
            strict: options?.strict ?? true,
            repair: options?.repair,
        };
    }

    private toJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
        try {
            return z.toJSONSchema(schema) as Record<string, unknown>;
        } catch {
            // Fallback: a permissive object schema keeps round-trips working
            // even for schema shapes Zod cannot serialize.
            return { type: 'object', additionalProperties: true };
        }
    }
}

/** Shared default registry instance. */
export const schemaRegistry = new SchemaRegistry();
