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
import { bestDesign, bestDesignForTarget, environmentFor, informationGain, costOf, } from './environment.js';
import { guessRate, readingSet } from './executor.js';
import { parseAnswer } from './parse.js';
const NO_DESIGN_GUESS_RATE = 1;
function argmax(values) {
    let best = 0;
    for (let i = 1; i < values.length; i++)
        if (values[i] > values[best])
            best = i;
    return best;
}
function shareOf(igPerCost, optimum) {
    if (!optimum || optimum.cost === 0)
        return 0;
    const denominator = optimum.ig / optimum.cost;
    if (denominator === 0)
        return 0;
    return igPerCost / denominator;
}
/** Score one design against one research state. */
export function evaluateDesign(state, design) {
    const env = environmentFor(state);
    const prior = state.prior;
    const budget = env.budget;
    const starUnconstrained = bestDesign(env, prior, Number.POSITIVE_INFINITY);
    const starAffordable = bestDesign(env, prior, budget);
    const bound = starUnconstrained ? starUnconstrained.igPerCost : 0;
    const affordableBound = starAffordable ? starAffordable.igPerCost : 0;
    const igOracle = starUnconstrained ? starUnconstrained.ig : 0;
    if (!design) {
        const starIg = starAffordable ? starAffordable.ig : 0;
        return {
            status: 'no_design',
            parsed: false,
            target: null,
            ig: 0,
            cost: null,
            ig_per_cost: 0,
            bound,
            bound_share: 0,
            affordable_bound: affordableBound,
            compliant: 0,
            feasible: false,
            budget,
            guess_rate: NO_DESIGN_GUESS_RATE,
            quantifications: [],
            pointer_gap: 0,
            resolution_gap: starIg,
            construction_gap: starIg,
            ig_oracle: igOracle,
            cost_oracle: starUnconstrained ? starUnconstrained.cost : 0,
            arms_oracle: starUnconstrained ? starUnconstrained.arms : null,
            seeds_oracle: starUnconstrained ? starUnconstrained.n : null,
            ig_target_opt: 0,
            arms_target_opt: null,
            seeds_target_opt: null,
        };
    }
    const quantifications = readingSet(design, env);
    const igs = quantifications.map((q) => informationGain(env, prior, q.arms, q.n));
    const costs = quantifications.map((q) => costOf(q.arms, q.n, env));
    const ig = igs.reduce((a, b) => a + b, 0) / igs.length;
    const cost = costs.reduce((a, b) => a + b, 0) / costs.length;
    const igPerCost = cost !== 0 ? ig / cost : 0;
    const feasible = cost <= budget + 1e-9;
    const budgetedShare = shareOf(igPerCost, starAffordable);
    const target = design.target ?? argmax(prior);
    const targetOptimum = bestDesignForTarget(env, prior, target, budget);
    const starIg = starAffordable ? starAffordable.ig : 0;
    const igTargetOpt = targetOptimum.ig;
    return {
        status: 'ok',
        parsed: true,
        target,
        ig,
        cost,
        ig_per_cost: igPerCost,
        bound,
        // primary scale: share of the unconstrained bound, capped at 1 (a design that
        // ignores the budget can exceed the affordable optimum, not the upper bound)
        bound_share: Math.min(1, shareOf(igPerCost, starUnconstrained)),
        affordable_bound: affordableBound,
        compliant: feasible ? budgetedShare : 0,
        feasible,
        budget,
        guess_rate: guessRate(quantifications),
        quantifications,
        pointer_gap: Math.max(0, starIg - igTargetOpt),
        resolution_gap: Math.max(0, igTargetOpt - ig),
        construction_gap: Math.max(0, starIg - ig),
        ig_oracle: igOracle,
        cost_oracle: starUnconstrained ? starUnconstrained.cost : 0,
        arms_oracle: starUnconstrained ? starUnconstrained.arms : null,
        seeds_oracle: starUnconstrained ? starUnconstrained.n : null,
        ig_target_opt: igTargetOpt,
        arms_target_opt: targetOptimum.arms,
        seeds_target_opt: targetOptimum.n,
    };
}
/** Parse an answer and score it in one step (the path the tool exposes). */
export function evaluateAnswer(state, text, level = 'L4') {
    const parsed = parseAnswer(text, level);
    return { ...evaluateDesign(state, parsed.design), parse_status: parsed.status };
}
/** Accept either a structured design or raw answer text at the boundary. */
export function evaluate(state, input, level = 'L4') {
    if (typeof input === 'string')
        return evaluateAnswer(state, input, level);
    return evaluateDesign(state, input);
}
//# sourceMappingURL=evaluate.js.map