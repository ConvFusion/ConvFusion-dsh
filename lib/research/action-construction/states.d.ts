/**
 * Research states: the object the metric runs on, plus a synthetic sampler.
 *
 * Two different things live here and the difference matters:
 *
 * * **validation/serialisation** of a state that the product supplies.  This is the
 *   real path: a host system has its own research state and hands it to the metric.
 * * **`sampleState`** — a synthetic panel for demos, tests and the plugin's own
 *   self-check.  It generates *its own* states with its own PRNG; it does **not** replay
 *   the Python panel (that one is MT19937-seeded, and pretending to reproduce it in
 *   TypeScript would be a lie).  Numeric parity is established against states exported
 *   from Python into `fixtures/python-parity.json`, never against this sampler.
 */
import type { ResearchState } from './types.js';
export declare const MECHANISM_NAMES: string[];
export declare const ARM_NAMES: string[];
/**
 * One synthetic research state: its own observed evidence, the belief that evidence
 * induces, its own budget, and a known true mechanism.
 *
 * `index` selects the position in the panel so that `sampleState(0)` and
 * `sampleState(5)` are different problems, not two draws of one.
 */
export declare function sampleState(index?: number, seed?: number): ResearchState;
/** Validate a host-supplied state and fill the defaults the metric needs. */
export declare function normaliseState(input: unknown): ResearchState;
//# sourceMappingURL=states.d.ts.map