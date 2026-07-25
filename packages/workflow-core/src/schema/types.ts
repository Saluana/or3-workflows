/**
 * Structured value runtime types (R4).
 *
 * Workflows persist JSON Schema (never a Zod instance). A runtime
 * {@link SchemaRegistry} optionally associates a `schemaId@version` with a Zod
 * schema for validation. Node results carry an additive typed `value` plus a
 * stable string projection so legacy consumers that read only `output` are
 * unaffected (R4.AC5, R4.AC6).
 */
import type { JsonValue } from '../gateway/types';

/**
 * Serializable, versioned structured-output specification. Safe to persist in a
 * `WorkflowData` document — it contains only JSON Schema, never runtime code.
 */
export interface StructuredOutputSpec {
    schemaId: string;
    schemaVersion: number;
    /** JSON Schema describing the expected value. */
    jsonSchema: Record<string, unknown>;
    /** When true, unknown/extra fields are rejected. */
    strict: boolean;
    /** Optional bounded repair policy applied on validation failure. */
    repair?: StructuredRepairPolicy;
}

/** Bounded repair policy for malformed/invalid structured output (R4.AC4). */
export interface StructuredRepairPolicy {
    /** Maximum repair attempts (bounded; 0 disables repair). */
    maxAttempts: number;
    /**
     * Repair backend:
     * - `retry`: re-request a fresh candidate (model regeneration).
     * - `response-healing`: provider-side healing (non-streaming Chat only).
     */
    backend: 'retry' | 'response-healing';
}

/** Reference to the schema that validated a value. */
export interface SchemaRef {
    id: string;
    version: number;
}

/** A single structured validation issue (bounded, serializable). */
export interface StructuredValidationIssue {
    path: string;
    message: string;
    code?: string;
}

/** Discriminated result of a structured validation attempt. */
export type StructuredValidationResult<T = JsonValue> =
    | { ok: true; value: T; schema: SchemaRef }
    | {
          ok: false;
          issues: StructuredValidationIssue[];
          schema: SchemaRef;
          /** Present when the raw candidate was not even valid JSON. */
          parseError?: string;
      };
