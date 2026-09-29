/**
 * Parsing an answer into a typed design.
 *
 * Two rules are kept verbatim from the Python instrument because the measured numbers
 * depend on them:
 *
 * 1. the **last** occurrence of each field wins — a deliberate model often emits a
 *    half-built answer inside its reasoning trace before the final one;
 * 2. a design that cannot discriminate any two hypotheses is a **failed answer**
 *    (`non_discriminating`), never a design to be repaired: no arm set is substituted.
 */
import { type Level, type ParseResult } from './types.js';
/** The format family a condition tag must be parsed in (`L1pad` -> `L1`, unknown -> `L3`). */
export declare function formatLevel(tag: string): Level;
export declare function normaliseArms(values: readonly number[]): number[];
/** Parse one answer at one level (or control tag). */
export declare function parseAnswer(text: string, level?: string): ParseResult;
//# sourceMappingURL=parse.d.ts.map