/**
 * The environment and the information metric.
 *
 * Ported line by line from `run_action_construction_sim.py` so that the two
 * implementations cannot drift: the environment (k mechanisms, m arms, an always-run
 * baseline), the discretised normal likelihood, information gain computed in log space,
 * the cost model, the discriminability test and the two optima.
 *
 * A note on why log space is not optional: the first version of the Python instrument
 * computed the joint as a product of per-condition likelihoods over a fine outcome grid,
 * which underflowed to zero and made the *best* designs score 0.  Any re-implementation
 * that multiplies likelihoods reproduces that bug.
 */
import type { Design, Env, Optimum, ResearchState } from './types.js';
/** The reference condition (full model / no ablation).  Always run, never written down. */
export declare const BASELINE_ARM = 6;
/** Coarse effect grid: keeps the marginalisation over outcomes numerically stable. */
export declare const OBS_GRID: number[];
/** Noise of a condition's estimated effect when run with n seeds (~1/sqrt(n)). */
export declare function sigma(n: number): number;
/** The design grids the inverse design searches (the paper's `ARMS_GRID` / `N_GRID`). */
export declare const ARMS_GRID: number[][];
export declare const N_GRID: number[];
export declare function trueH(env: Env): number[];
/** The conditions actually run: the requested arms plus the baseline. */
export declare function runConditions(env: Env, arms: readonly number[]): number[];
export declare function environmentFor(state: ResearchState): Env;
export declare function envKey(env: Env): string;
export declare function logLikTable(n: number): Float64Array;
/** A run is informative iff its conditions do not all have the same outcome bin. */
export declare function conditionOk(env: Env, arms: readonly number[]): boolean;
/** Expected posterior entropy reduction on H from running this design. */
export declare function informationGain(env: Env, prior: readonly number[], arms: readonly number[], n: number): number;
/** Experiment cost over the conditions actually run (baseline included). */
export declare function costOf(arms: readonly number[], n: number, env?: Env): number;
/** Best design, optionally under a budget.  With an unbounded budget the optimum is the
 *  same for every intended target (the full factorial), which is why the paper's pointer
 *  gap is identically zero without a budget. */
export declare function bestDesign(env: Env, prior: readonly number[], budget: number): Optimum | null;
/** Best design an agent with the *same intent* could have specified: every design that
 *  includes the arm the target points to. */
export declare function bestDesignForTarget(env: Env, prior: readonly number[], target: number, budget: number): Optimum;
/** Drop every memoised quantity (tests, or long-lived processes that judge many states). */
export declare function clearMetricCaches(): void;
/** The paper's four completion rules: what an executor does with an under-specified
 *  action name.  Exported because `executor.ts` needs it and because the parameters are
 *  part of the method (they determine `R(a)`). */
export declare const DESIGN_SPECS: {
    readonly single_ablation: {
        readonly specificity: 0.18;
        readonly resolution_pressure: 0;
        readonly max_arms_default: 1;
        readonly n_default: 2;
        readonly n_generous: 4;
    };
    readonly binary_contrast: {
        readonly specificity: 0.32;
        readonly resolution_pressure: 0.2;
        readonly max_arms_default: 2;
        readonly n_default: 2;
        readonly n_generous: 8;
    };
    readonly component_scan: {
        readonly specificity: 0.55;
        readonly resolution_pressure: 0.5;
        readonly max_arms_default: 2;
        readonly n_default: 2;
        readonly n_generous: 8;
    };
    readonly factorial: {
        readonly specificity: 0.8;
        readonly resolution_pressure: 0.8;
        readonly max_arms_default: 3;
        readonly n_default: 2;
        readonly n_generous: 8;
    };
};
export type DesignSpec = (typeof DESIGN_SPECS)[keyof typeof DESIGN_SPECS];
export declare function specFor(design: Pick<Design, 'action_type'>): DesignSpec;
//# sourceMappingURL=environment.d.ts.map