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
export const ACTION_TYPES = [
    'single_ablation',
    'binary_contrast',
    'component_scan',
    'factorial',
];
/** Representation levels: which fields the prompt forces the agent to emit. */
export const LEVELS = ['L1', 'L2', 'L3', 'L4'];
/** Condition tags map to the format an answer was *written* in (L1pad answers are written
 *  in the L1 format, L3short answers in the compressed L3 format). */
export const PARSE_LEVEL = {
    L1: 'L1',
    L2: 'L2',
    L3: 'L3',
    L4: 'L4',
    L1pad: 'L1',
    L3short: 'L3',
};
//# sourceMappingURL=types.js.map