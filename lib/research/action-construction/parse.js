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
import { conditionOk } from './environment.js';
import { environmentFor } from './environment.js';
import { ACTION_TYPES, PARSE_LEVEL } from './types.js';
const VALID_TYPES = new Set(ACTION_TYPES);
const ARM_COUNT = 6;
const DEFAULT_ENV = environmentFor({
    question: '',
    method: '',
    partial_results: '',
    mechanisms: [],
    arms: [],
    prior: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6],
    budget: 6,
    truth: null,
});
/** The format family a condition tag must be parsed in (`L1pad` -> `L1`, unknown -> `L3`). */
export function formatLevel(tag) {
    return PARSE_LEVEL[String(tag)] ?? 'L3';
}
export function normaliseArms(values) {
    return [...new Set(values.filter((v) => v >= 0 && v < ARM_COUNT))].sort((a, b) => a - b);
}
/** `ACTION: <name>` for L1: the last named action wins, with a free-text fallback. */
function parseNamed(text) {
    let actionType = null;
    for (const line of text.split(/\r?\n/)) {
        if (line.trim().toUpperCase().startsWith('ACTION:')) {
            actionType = line.split(':').slice(1).join(':').trim().toLowerCase().split(/\s+/)[0] ?? null;
        }
    }
    if (!actionType || !VALID_TYPES.has(actionType)) {
        const found = [...text.matchAll(/\b(single_ablation|binary_contrast|component_scan|factorial)\b/gi)];
        actionType = found.length > 0 ? found[found.length - 1][1].toLowerCase() : null;
    }
    if (!actionType || !VALID_TYPES.has(actionType))
        return { design: null, status: 'no_action' };
    return {
        design: { action_type: actionType, target: null, arms: null, n: null },
        status: 'ok',
    };
}
/** L3/L4 field parsing: match anywhere, take the last value, accept ranges and both
 *  spellings.  The compressed control format arrives as a single line, and models write
 *  `T:3` as well as `TARGET: h3`. */
function parseFields(text) {
    const targetMatches = [
        ...text.matchAll(/TARGET\s*:\s*h?\s*([0-9]+(?:\s*-\s*[0-9]+)?)/gi),
    ].map((m) => m[1]);
    let targetValues = targetMatches;
    if (targetValues.length === 0) {
        targetValues = [...text.matchAll(/(?:^|\s)T\s*:\s*h?\s*([0-9]+)/gi)].map((m) => m[1]);
    }
    let target = null;
    if (targetValues.length > 0) {
        const digits = targetValues[targetValues.length - 1].match(/[0-9]+/g) ?? [];
        if (digits.length > 0)
            target = Number(digits[digits.length - 1]);
    }
    const seedMatches = [...text.matchAll(/(?:SEEDS?|N)\s*:\s*([0-9]+)/gi)].map((m) => Number(m[1]));
    let n = seedMatches.length > 0 ? seedMatches[seedMatches.length - 1] : null;
    const armRows = [...text.matchAll(/ARMS?\s*:\s*([0-9][0-9,\s]*)/gi)].map((m) => m[1]);
    let arms = null;
    if (armRows.length > 0) {
        const nums = (armRows[armRows.length - 1].match(/\d+/g) ?? []).map(Number);
        const kept = normaliseArms(nums);
        if (kept.length > 0)
            arms = kept;
    }
    if (target === null || arms === null || n === null)
        return { design: null, status: 'incomplete' };
    n = Math.max(2, Math.min(12, n));
    if (!conditionOk(DEFAULT_ENV, arms))
        return { design: null, status: 'non_discriminating' };
    return {
        design: { action_type: 'component_scan', target, arms, n },
        status: 'ok',
    };
}
/** L2 names the target and nothing else; the design is left to the executor on purpose. */
function parseIntent(text) {
    const values = [...text.matchAll(/^\s*TARGET\s*:\s*h?\s*(\d+)/gim)].map((m) => Number(m[1]));
    if (values.length === 0)
        return { design: null, status: 'incomplete' };
    return {
        design: {
            action_type: 'component_scan',
            target: values[values.length - 1],
            arms: null,
            n: null,
        },
        status: 'ok',
    };
}
/** Parse one answer at one level (or control tag). */
export function parseAnswer(text, level = 'L4') {
    const trimmed = (text ?? '').trim();
    const format = formatLevel(level);
    if (format === 'L1') {
        if (trimmed === '')
            return { design: null, status: 'empty' };
        return parseNamed(trimmed);
    }
    if (format === 'L2')
        return parseIntent(trimmed);
    if (trimmed === '')
        return { design: null, status: 'empty' };
    return parseFields(trimmed);
}
//# sourceMappingURL=parse.js.map