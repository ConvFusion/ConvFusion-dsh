/**
 * The interface: what the prompt forces the agent to write down.
 *
 * In the experiments "our method" *is* these strings — the four representation levels are
 * four prompt templates, and every condition shares one state, one executor and one
 * metric.  The strings must stay byte-identical to the Python instrument
 * (`FORMATS` / `FORMATS_EXT` in the experiment modules); the parity fixture checks them.
 */
import type { Level, ResearchState } from './types.js';
/** L1 (named) and L3 (structured): the paper's base formats. */
export declare const FORMATS: Record<string, string>;
/** All four levels actually run in the main matrix. */
export declare const FORMATS_EXT: Record<Level, string>;
/** Length-control conditions (E3): the two ends of the "is it just longer text?" test. */
export declare const LENGTH_PADDED_L1: string;
export declare const LENGTH_MATCHED_L3: string;
/** The research state as the agent sees it.  The belief and the budget are stated, so
 *  the objective is knowable from the state rather than hidden in the metric. */
export declare function statePrompt(state: ResearchState): string;
/** The prompt an agent at `level` receives, with an optional length control. */
export declare function buildPrompt(state: ResearchState, level?: Level, control?: 'length' | ''): string;
/** What each level makes the agent emit — used by the tool's `prompt` action. */
export declare function levelSummary(level: Level): string;
//# sourceMappingURL=prompts.d.ts.map