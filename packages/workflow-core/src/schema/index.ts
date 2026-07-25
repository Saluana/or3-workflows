/**
 * Structured value runtime (R4).
 *
 * @module schema
 */
export type {
    StructuredOutputSpec,
    StructuredRepairPolicy,
    SchemaRef,
    StructuredValidationIssue,
    StructuredValidationResult,
} from './types';
export { stableStringify, projectValueToString } from './projection';
export {
    SchemaRegistry,
    schemaRegistry,
    schemaKey,
    type RegisteredSchema,
} from './SchemaRegistry';
export {
    parseJsonCandidate,
    validateStructuredValue,
    parseAndValidate,
    parseValidateRepair,
    StructuredValidationError,
    specFromJsonSchema,
    registerAndSpec,
    type RepairRegenerator,
} from './validation';
