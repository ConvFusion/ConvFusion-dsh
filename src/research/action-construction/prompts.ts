/**
 * The interface: what the prompt forces the agent to write down.
 *
 * In the experiments "our method" *is* these strings — the four representation levels are
 * four prompt templates, and every condition shares one state, one executor and one
 * metric.  The strings must stay byte-identical to the Python instrument
 * (`FORMATS` / `FORMATS_EXT` in the experiment modules); the parity fixture checks them.
 */

import type { Level, ResearchState } from './types.js'

/** L1 (named) and L3 (structured): the paper's base formats. */
export const FORMATS: Record<string, string> = {
  L1:
    'Decide the single next experiment and answer in exactly one line:\n' +
    'ACTION: <one of: single_ablation | binary_contrast | component_scan | factorial>\n' +
    'REASON: <at most 20 words>\n',
  L3:
    'Decide the single next experiment and answer in exactly these four lines:\n' +
    'TARGET: <h index of the mechanism you want to discriminate>\n' +
    'ARMS: <comma-separated arm indices to run>\n' +
    'SEEDS: <integer number of seeds per arm, 2..12>\n' +
    'SUCCESS: <what observation would confirm or reject the target mechanism, at most 20 words>\n',
}

/** All four levels actually run in the main matrix. */
export const FORMATS_EXT: Record<Level, string> = {
  L1: FORMATS.L1,
  L2:
    'Decide the single next experiment and answer in exactly these two lines:\n' +
    'TARGET: <h index of the mechanism you want to discriminate>\n' +
    'WHY: <why that is the mechanism to test, at most 20 words>\n',
  L3: FORMATS.L3,
  L4:
    'Decide the single next experiment and answer in exactly these five lines:\n' +
    'TARGET: <h index of the mechanism you want to discriminate>\n' +
    'ARMS: <comma-separated arm indices to run>\n' +
    'SEEDS: <integer number of seeds per arm, 2..12>\n' +
    "PREDICTION: <what each arm's outcome would be if the target is the cause, one line>\n" +
    'SUCCESS: <what observation would confirm or reject the target mechanism, at most 20 words>\n',
}

/** Length-control conditions (E3): the two ends of the "is it just longer text?" test. */
export const LENGTH_PADDED_L1 =
  'Decide the single next experiment and answer in exactly one line, then stop. ' +
  'You may restate the method and the partial results in the reason field if that ' +
  'helps; keep the whole answer to about the same length as a detailed protocol.\n' +
  'ACTION: <one of: single_ablation | binary_contrast | component_scan | factorial>\n' +
  'REASON: <why this action, and what exactly it would establish about the mechanism, ' +
  'including which arms and how many seeds you would use, in as much detail as needed>\n'

export const LENGTH_MATCHED_L3 =
  'Decide the next experiment. ANSWER EXACTLY (use these field names):\n' +
  'T:h ARMS:a,b N:k OK:<criterion, 12 words>\n'

/** The research state as the agent sees it.  The belief and the budget are stated, so
 *  the objective is knowable from the state rather than hidden in the metric. */
export function statePrompt(state: ResearchState): string {
  const mechanisms = state.mechanisms.map((m, i) => `  h${i}: ${m}`).join('\n')
  const arms = state.arms.map((a, i) => `  arm ${i}: ${a}`).join('\n')
  const belief = state.prior.map((p, i) => `h${i} ${p.toFixed(2)}`).join(' | ')
  return (
    'Research state\n' +
    `- Question: ${state.question}\n` +
    `- Method: ${state.method}\n` +
    `- Partial results: ${state.partial_results}\n` +
    `- Candidate mechanisms (arm i ablates mechanism i):\n${mechanisms}\n` +
    `- Available intervention arms:\n${arms}\n` +
    `- Current belief over mechanisms: ${belief}\n` +
    `- Experimental budget: ${state.budget.toFixed(1)} cost units, where a design costs ` +
    '1 + 0.6*(arms-1) + 0.35*seeds (arms = ablation arms run; the baseline is always run)\n'
  )
}

/** The prompt an agent at `level` receives, with an optional length control. */
export function buildPrompt(
  state: ResearchState,
  level: Level = 'L3',
  control: 'length' | '' = '',
): string {
  if (control === 'length') {
    if (level === 'L1') return statePrompt(state) + '\n' + LENGTH_PADDED_L1
    if (level === 'L3') return statePrompt(state) + '\n' + LENGTH_MATCHED_L3
  }
  return statePrompt(state) + '\n' + FORMATS_EXT[level]
}

/** What each level makes the agent emit — used by the tool's `prompt` action. */
export function levelSummary(level: Level): string {
  switch (level) {
    case 'L1':
      return 'named: the action name only; the executor invents the intent and the design'
    case 'L2':
      return 'intent: the action name and the target mechanism; the executor invents the design'
    case 'L3':
      return 'structured: target, arms and seeds; the executor invents nothing about the design'
    default:
      return 'structured + predicted: L3 plus a per-arm prediction and a success criterion'
  }
}
