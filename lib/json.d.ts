/**
 * Lossless-JSON sanitizer for tool return values.
 *
 * DSH's tool registry validates every canonical value as *lossless JSON*:
 * `undefined` (and functions/symbols) are not representable, so a value
 * carrying an `undefined` field is rejected. This recursively drops undefined
 * object keys and replaces non-JSON atoms with `null`.
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
export declare function losslessJson(value: unknown): JsonValue;
//# sourceMappingURL=json.d.ts.map