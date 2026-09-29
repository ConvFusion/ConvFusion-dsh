/**
 * Scoring: what a constructed action buys.
 *
 * Two scales are reported side by side, exactly as in the paper:
 *
 * * **primary** — `ig_per_cost`, and `bound_share` = `ig_per_cost / bound`, where the
 *   bound is the *unconstrained* cost-efficiency optimum.  A design that ignores the
 *   stated budget can score above the state's affordable optimum here, which is the
 *   point: informativeness is not feasibility.
 * * **compliant** — the same answer scored as *buying nothing* when the stated budget
 *   cannot pay for it, normalised by the state's *affordable* optimum (the same
 *   intention-to-treat convention the paper applies to parse failures).
 *
 * The gap to the oracle decomposes into a pointer gap (wrong mechanism), a resolution
 * gap (right mechanism, under-specified design) and, as the more realistic states
 * showed, a feasibility term reported through `feasible` / `compliant`.
 */
import type { Design, Evaluation, ResearchState } from './types.js';
/** Score one design against one research state. */
export declare function evaluateDesign(state: ResearchState, design: Design | null): Evaluation;
/** Parse an answer and score it in one step (the path the tool exposes). */
export declare function evaluateAnswer(state: ResearchState, text: string, level?: string): Evaluation & {
    parse_status: string;
};
/** Accept either a structured design or raw answer text at the boundary. */
export declare function evaluate(state: ResearchState, input: Design | string | null, level?: string): Evaluation & {
    parse_status?: string;
};
//# sourceMappingURL=evaluate.d.ts.map