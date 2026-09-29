/**
 * Constructing action objects from actions that already exist in the workspace.
 *
 * ## Why this exists
 *
 * The decision layer (paper 1) is not built yet, so nothing in the plugin *produces* a
 * typed action.  But actions are already written down everywhere — as plan steps, as
 * checklist items, as rows of a budget table ("T3 场景复核：60 场景 × 10–20 min",
 * "面板正式评测 1,080 次调用").  Those are *named* actions: exactly the L1 condition the
 * paper measures.  So the method can be applied today, without the decision layer:
 *
 * 1. **extract** the action-like items from a plan (checklist / numbered steps / table rows);
 * 2. **infer** the action type from the wording (heuristic, and labelled as such);
 * 3. **construct** the object two ways — as written (the executor must invent the design)
 *    and materialised (the executor's completion rule supplies target/arms/seeds), so the
 *    agent can accept, edit or reject it before running anything;
 * 4. **measure** both with the same metric, and record the accepted one.
 *
 * The honest boundary: steps 1–2 are heuristic text handling, not the paper's measurement
 * of a model.  That is why every candidate carries `confidence` and why nothing is written
 * to the workspace unless the caller asks for it.  What the *metric* reports (guess rate,
 * bound share, cost vs budget) is exact for the object that was constructed.
 */
import type { ActionType, Design, Evaluation, ResearchState } from './types.js';
export interface ActionCandidate {
    /** stable id: the step label when the plan has one (T2, 步骤 3), else `line-<n>` */
    id: string;
    text: string;
    /**
     * Whether this metric applies to the item at all.
     *
     * The environment is the **ablation-identification task family**: an action is a design
     * that discriminates a mechanism from an observed effect.  A plan step such as "LLM 起草
     * 60 场景" or "论文改写" is an action, but it is not *this* kind of action — the paper
     * says so in its own limitations.  Reporting those as `measurable: false` with a reason
     * is the honest outcome; inventing a design for them would be the opposite.
     */
    measurable: boolean;
    actionType: ActionType | null;
    confidence: 'structured' | 'keyword' | 'none';
    /** call count mentioned in the same item ("120 次调用"), when present */
    calls: number | null;
    source: string;
    reason?: string;
}
export interface ConstructedAction {
    candidate: ActionCandidate;
    /** what the item says, read the way an executor would have to read it */
    asWritten: Evaluation;
    /** the same item with the design materialised (executor's reading set) */
    design: Design;
    constructed: Evaluation;
    /** whether the object used fields the text stated, or fell back to the completion rule */
    materialisedFrom?: string;
}
/**
 * Extract the action-like items from a plan or any Markdown.
 *
 * Recognised shapes: checklist items (`- [ ] …`), numbered steps (`1. …`), table rows
 * whose first cell carries a step label, and `T1 … T9` style step tokens.  Everything else
 * is ignored — a plan is mostly prose, and treating prose as an action would be noise.
 */
export declare function extractCandidates(markdown: string, source?: string): ActionCandidate[];
/** The design an executor would settle on for a named action (first reading of `R(a)`),
 *  using any fields the text itself states before falling back to the completion rule. */
export declare function materialiseDesign(candidate: ActionCandidate, state: ResearchState): Design & {
    materialisedFrom?: string;
};
/** Score an extracted item both ways. */
export declare function constructFromCandidates(state: ResearchState, candidates: readonly ActionCandidate[]): ConstructedAction[];
/** A plain-text reason for the tool result: why this type, and what is still missing. */
export declare function explainConstruction(item: ConstructedAction): string;
/** Cost of a design, exported for callers that want it without duplicating the formula. */
export declare function designCost(design: Design, state: ResearchState): number;
/** Information gain of a design, for callers that only need the raw quantity. */
export declare function designInformationGain(design: Design, state: ResearchState): number;
//# sourceMappingURL=extract.d.ts.map