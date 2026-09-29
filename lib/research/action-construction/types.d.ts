/**
 * Action Construction — typed objects at the DSH boundary.
 *
 * This is the TypeScript face of the method implemented (and validated) in Python under
 * `workspace/experiments/paper4/`.  The numbers must be identical to that implementation;
 * `fixtures/python-parity.json` plus `scripts/verify-action-construction.mjs` enforce it.
 *
 * Units: information gains are expected posterior entropy reductions on the mechanism
 * space, in nats.  Costs are the paper's cost units,
 * `1 + 0.6 * (conditions - 1) + 0.35 * seeds`, where "conditions" includes the
 * always-run baseline arm.
 */
/** The named actions the current paradigm can write down; the name selects the
 *  executor's completion rule, i.e. how much of the design the executor must invent. */
export declare const ACTION_TYPES: readonly ["single_ablation", "binary_contrast", "component_scan", "factorial"];
export type ActionType = (typeof ACTION_TYPES)[number];
/** Representation levels: which fields the prompt forces the agent to emit. */
export declare const LEVELS: readonly ["L1", "L2", "L3", "L4"];
export type Level = (typeof LEVELS)[number];
/** Condition tags map to the format an answer was *written* in (L1pad answers are written
 *  in the L1 format, L3short answers in the compressed L3 format). */
export declare const PARSE_LEVEL: Record<string, Level>;
/** A constructed action: the design an agent wrote down. */
export interface Design {
    action_type: ActionType;
    /** pointer: index of the mechanism the design intends to discriminate (null = not said) */
    target: number | null;
    /** resolution: ablation arm indices (the baseline is added by the environment) */
    arms: number[] | null;
    /** resolution: seeds per arm */
    n: number | null;
    /** belief the design was written under (informational; the metric uses the state's) */
    prior?: number[] | null;
    /** L4's fourth field: h -> predicted outcome (recorded, unused by the metric) */
    predicted?: Record<number, string> | null;
}
/** One reading of an under-specified action: what the executor would actually run. */
export interface Quantification {
    arms: number[];
    n: number;
}
/** The parsed research state the metric runs on. */
export interface ResearchState {
    question: string;
    method: string;
    partial_results: string;
    improved?: string[];
    deltas?: Record<string, number>;
    /** h index -> the datasets that mechanism would move (the state's signature) */
    signatures?: Record<string, string[]>;
    mechanisms: string[];
    arms: string[];
    prior: number[];
    budget: number;
    true_h?: number;
    /** h -> the arm that is active when h is true (null keeps the identity mapping) */
    truth: number[] | null;
}
/** The environment a state is judged in: its own budget and its own truth mapping. */
export interface Env {
    k: number;
    m: number;
    beta: number;
    budget: number;
    truth: number[] | null;
}
/** An optimum design (unconstrained upper bound, or the best affordable design). */
export interface Optimum {
    arms: number[];
    n: number;
    ig: number;
    cost: number;
    igPerCost: number;
}
/** Everything the metric reports about one constructed action.  JSON-safe: `cost` is
 *  `null` (never NaN) when no design was written down. */
export interface Evaluation {
    status: 'ok' | 'no_design';
    parsed: boolean;
    target: number | null;
    ig: number;
    cost: number | null;
    ig_per_cost: number;
    /** the unconstrained cost-efficiency optimum used as the normaliser */
    bound: number;
    /** primary scale: this answer's share of the *unconstrained* bound (capped at 1) */
    bound_share: number;
    /** the best design the state's stated budget can pay for */
    affordable_bound: number;
    /** second scale: `ig_per_cost / affordable_bound`, or exactly 0 when unaffordable */
    compliant: number;
    feasible: boolean;
    budget: number;
    /** share of the design the executor had to invent: `1 - 1/|R(a)|` */
    guess_rate: number;
    /** the reading set `R(a)` the averages were taken over */
    quantifications: Quantification[];
    pointer_gap: number;
    resolution_gap: number;
    construction_gap: number;
    ig_oracle: number;
    cost_oracle: number;
    arms_oracle: number[] | null;
    seeds_oracle: number | null;
    ig_target_opt: number;
    arms_target_opt: number[] | null;
    seeds_target_opt: number | null;
}
/** The outcome of parsing an answer. */
export interface ParseResult {
    design: Design | null;
    status: string;
}
//# sourceMappingURL=types.d.ts.map