/**
 * The workspace side of Action Construction: the state to score against, and the record
 * of what was scored.
 *
 * The metric needs a *scoreable* state — candidate mechanisms, intervention arms, a belief
 * and a budget — while a research workspace holds prose.  The bridge is one small JSON file
 * that the agent fills once per campaign:
 *
 * ```
 * workspace/research/action-state.json      ← the scoreable state (mechanisms/arms/prior/budget)
 * workspace/research/action-construction.jsonl ← append-only evaluations, one per decision
 * ```
 *
 * Why a record and not just a number in the chat: the plugin's experiment gate can then ask
 * "was the action you are about to run written as an executable design, and can the stated
 * budget pay for it?" — and the answer is a file, not a memory.  The record is also the
 * traceability trail the paper's protocol asks for (every measurement regenerable from disk).
 */
import type { Design, Evaluation, ResearchState } from './types.js';
export declare const ACTION_STATE_FILE = "research/action-state.json";
export declare const ACTION_LOG_FILE = "research/action-construction.jsonl";
/** One evaluated construction: what was scored, and what it was worth. */
export interface ActionRecord {
    at: string;
    level: string;
    /** short excerpt of the agent's answer (traceability without bloating the file) */
    answer: string | null;
    design: {
        action_type: string;
        target: number | null;
        arms: number[] | null;
        n: number | null;
    } | null;
    ig_per_cost: number;
    bound_share: number;
    compliant: number;
    feasible: boolean;
    cost: number | null;
    budget: number;
    guess_rate: number;
    pointer_gap: number;
    resolution_gap: number;
    note?: string;
}
export declare function actionStatePath(workspace: string): string;
export declare function actionLogPath(workspace: string): string;
/** Read the scoreable state the workspace declares, or null when it has not been set. */
export declare function readActionState(workspace: string): ResearchState | null;
/** Write (or replace) the scoreable state.  Returns the workspace-relative path. */
export declare function writeActionState(workspace: string, state: unknown): string;
/** Turn an evaluation into the compact record that goes on disk. */
export declare function toRecord(evaluation: Evaluation, options: {
    level: string;
    answer?: string | null;
    design?: Design | null;
    note?: string;
}): ActionRecord;
/** Append one evaluation.  The log is append-only: history is part of the evidence. */
export declare function appendActionRecord(workspace: string, record: ActionRecord): string;
/** The most recent records, oldest first within the returned window. */
export declare function readActionRecords(workspace: string, limit?: number): ActionRecord[];
/** How many records exist, and how many of them the stated budget could pay for. */
export declare function summariseActionRecords(workspace: string): {
    count: number;
    inBudget: number;
    latest: ActionRecord | null;
};
//# sourceMappingURL=workspace.d.ts.map