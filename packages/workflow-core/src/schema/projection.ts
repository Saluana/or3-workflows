/**
 * Stable string projection for typed values (R4.AC5, R4.AC6).
 *
 * `stableStringify` produces deterministic JSON with lexicographically ordered
 * object keys so the legacy `output` string is byte-stable across runs,
 * checkpoints, callbacks, and UI status regardless of key insertion order.
 */
import type { JsonValue } from '../gateway/types';

/** Deterministically serialize a JSON value with sorted object keys. */
export function stableStringify(value: JsonValue): string {
    return serialize(value);
}

function serialize(value: JsonValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
        return `[${value.map((item) => serialize(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const entries = keys.map(
            (key) => `${JSON.stringify(key)}:${serialize(value[key]!)}`
        );
        return `{${entries.join(',')}}`;
    }
    // primitive: string | number | boolean
    return JSON.stringify(value);
}

/**
 * Project a typed value to the stable legacy `output` string.
 *
 * Strings pass through unchanged so plain-text nodes keep their exact output;
 * everything else uses the deterministic JSON projection.
 */
export function projectValueToString(value: JsonValue): string {
    if (typeof value === 'string') return value;
    return stableStringify(value);
}
