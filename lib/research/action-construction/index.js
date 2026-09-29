/**
 * Action Construction — public API for the DSH plugin.
 *
 * The method is defined and validated in Python under `workspace/experiments/paper4/`;
 * this package is the TypeScript face of the same metric so that the plugin, its
 * commands and the UI can call it without a Python process.  The two implementations are
 * held together by a calibration fixture exported from the Python library
 * (`fixtures/python-parity.json`) and checked by `scripts/verify-action-construction.mjs`.
 *
 * ```ts
 * import { evaluate, sampleState, buildPrompt } from '../research/action-construction/index.js'
 *
 * const state = sampleState(0)
 * const prompt = buildPrompt(state, 'L3')          // what an L3 agent is asked to write
 * const result = evaluate(state, 'TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11', 'L3')
 * // result.ig_per_cost, result.bound_share, result.compliant, result.feasible, ...
 * ```
 */
export { ACTION_TYPES, LEVELS, PARSE_LEVEL, } from './types.js';
export { ARMS_GRID, BASELINE_ARM, DESIGN_SPECS, N_GRID, OBS_GRID, bestDesign, bestDesignForTarget, clearMetricCaches, conditionOk, costOf, environmentFor, informationGain, runConditions, sigma, trueH, } from './environment.js';
export { guessRate, readingSet } from './executor.js';
export { FORMATS, FORMATS_EXT, LENGTH_MATCHED_L3, LENGTH_PADDED_L1, buildPrompt, levelSummary, statePrompt, } from './prompts.js';
export { formatLevel, normaliseArms, parseAnswer } from './parse.js';
export { constructFromCandidates, designCost, designInformationGain, explainConstruction, extractCandidates, materialiseDesign, } from './extract.js';
export { evaluate, evaluateAnswer, evaluateDesign } from './evaluate.js';
export { ARM_NAMES, MECHANISM_NAMES, normaliseState, sampleState } from './states.js';
export { ACTION_LOG_FILE, ACTION_STATE_FILE, actionLogPath, actionStatePath, appendActionRecord, readActionRecords, readActionState, summariseActionRecords, toRecord, writeActionState, } from './workspace.js';
//# sourceMappingURL=index.js.map