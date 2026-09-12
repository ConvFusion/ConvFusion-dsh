/**
 * Lossless-JSON sanitizer for tool return values.
 *
 * DSH's tool registry validates every canonical value as *lossless JSON*:
 * `undefined` (and functions/symbols) are not representable, so a value
 * carrying an `undefined` field is rejected. This recursively drops undefined
 * object keys and replaces non-JSON atoms with `null`.
 */
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export function losslessJson(value: unknown): JsonValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') return null
  if (Array.isArray(value)) return value.map((item) => losslessJson(item))
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue
      out[key] = losslessJson(item)
    }
    return out
  }
  return null
}
