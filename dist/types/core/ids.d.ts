/**
 * Lightweight ID generation. Avoids pulling in a uuid dependency to keep
 * the bundle tiny. Not cryptographically significant - these are
 * non-sensitive, non-PII correlation identifiers only.
 */
export declare function generateId(prefix?: string): string;
export declare function now(): number;
