/**
 * Research states: the object the metric runs on, plus a synthetic sampler.
 *
 * Two different things live here and the difference matters:
 *
 * * **validation/serialisation** of a state that the product supplies.  This is the
 *   real path: a host system has its own research state and hands it to the metric.
 * * **`sampleState`** — a synthetic panel for demos, tests and the plugin's own
 *   self-check.  It generates *its own* states with its own PRNG; it does **not** replay
 *   the Python panel (that one is MT19937-seeded, and pretending to reproduce it in
 *   TypeScript would be a lie).  Numeric parity is established against states exported
 *   from Python into `fixtures/python-parity.json`, never against this sampler.
 */

import type { ResearchState } from './types.js'

export const MECHANISM_NAMES = [
  'adaptive memory module',
  'attention re-weighting',
  'long-context positional encoding',
  'layer normalisation placement',
  'residual scaling schedule',
  'data curriculum ordering',
]

export const ARM_NAMES = [
  'memory',
  'attention',
  'positional',
  'normalisation',
  'residual',
  'curriculum',
]

const DATASET_POOL = ['A', 'B', 'C', 'D']
const BUDGET_POOL = [4, 6, 8]

/** Deterministic PRNG (mulberry32): the sampler must be reproducible in TypeScript. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function choice<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]
}

function sampleWithoutReplacement<T>(rng: () => number, values: readonly T[], count: number): T[] {
  const pool = values.slice()
  const out: T[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  }
  return out
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/**
 * One synthetic research state: its own observed evidence, the belief that evidence
 * induces, its own budget, and a known true mechanism.
 *
 * `index` selects the position in the panel so that `sampleState(0)` and
 * `sampleState(5)` are different problems, not two draws of one.
 */
export function sampleState(index = 0, seed = 11): ResearchState {
  const rng = mulberry32(seed * 1000003 + 17)
  let state: ResearchState | null = null
  for (let i = 0; i <= Math.max(0, index); i++) state = drawState(rng)
  return state as ResearchState
}

function drawState(rng: () => number): ResearchState {
  const k = MECHANISM_NAMES.length
  const datasets = DATASET_POOL.slice(0, choice(rng, [3, 4]))
  const nImproved = Math.min(choice(rng, [1, 2, 3]), datasets.length - 1)
  const improved = sampleWithoutReplacement(rng, datasets, nImproved).sort()
  const deltas: Record<string, number> = {}
  for (const d of datasets) {
    deltas[d] = improved.includes(d)
      ? round1(0.9 + rng() * (4.2 - 0.9))
      : round1(-1.4 + rng() * (0.35 + 1.4))
  }

  const signatures: Record<number, string[]> = {}
  for (let h = 0; h < k; h++) {
    const size = Math.min(choice(rng, [1, 2, 2, 3]), datasets.length)
    signatures[h] = sampleWithoutReplacement(rng, datasets, size).sort()
  }

  let covering = [...Array(k).keys()].filter((h) => improved.every((d) => signatures[h].includes(d)))
  if (covering.length === 0) {
    let best = 0
    let bestOverlap = -1
    for (let h = 0; h < k; h++) {
      const overlap = signatures[h].filter((d) => improved.includes(d)).length
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = h
      }
    }
    covering = [best]
  }
  const trueH = choice(rng, covering)

  const weights = Array.from({ length: k }, (_, h) => {
    const overlap = signatures[h].filter((d) => improved.includes(d)).length
    return 1 + 2 * overlap
  })
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const prior = weights.map((w) => Math.round((w / weightSum) * 10000) / 10000)

  const results = datasets.map((d) => `Dataset ${d}: ${deltas[d] >= 0 ? '+' : ''}${deltas[d].toFixed(1)} over baseline`)

  return {
    question: 'Which component is responsible for the observed improvement?',
    method: `A Transformer with ${k} candidate components, one ablation arm each.`,
    partial_results: `${results.join('. ')}.`,
    improved,
    deltas,
    signatures,
    mechanisms: MECHANISM_NAMES.slice(),
    arms: ARM_NAMES.slice(),
    prior,
    budget: choice(rng, BUDGET_POOL),
    true_h: trueH,
    // h -> active arm is the identity: arm i ablates mechanism i
    truth: null,
  }
}

const K = MECHANISM_NAMES.length

/** Validate a host-supplied state and fill the defaults the metric needs. */
export function normaliseState(input: unknown): ResearchState {
  const raw = (typeof input === 'string' ? JSON.parse(input) : input) as Partial<ResearchState> | null
  if (!raw || typeof raw !== 'object') throw new Error('state must be an object or a JSON object string')
  const prior = Array.isArray(raw.prior) ? raw.prior.map(Number) : null
  if (!prior || prior.length === 0) throw new Error("state.prior must be a non-empty probability vector")
  if (prior.length !== K) {
    throw new Error(
      `state.prior has ${prior.length} entries but this environment has ${K} mechanisms; ` +
        'the metric refuses to judge a state in a different mechanism space',
    )
  }
  const truth = Array.isArray(raw.truth) ? raw.truth.map(Number) : null
  if (truth && truth.length !== prior.length) {
    throw new Error('state.truth must have one entry per mechanism')
  }
  return {
    question: String(raw.question ?? ''),
    method: String(raw.method ?? ''),
    partial_results: String(raw.partial_results ?? ''),
    ...(raw.improved ? { improved: raw.improved.map(String) } : {}),
    ...(raw.deltas ? { deltas: raw.deltas } : {}),
    ...(raw.signatures ? { signatures: raw.signatures } : {}),
    mechanisms: Array.isArray(raw.mechanisms) && raw.mechanisms.length === K
      ? raw.mechanisms.map(String)
      : MECHANISM_NAMES.slice(),
    arms: Array.isArray(raw.arms) && raw.arms.length === K ? raw.arms.map(String) : ARM_NAMES.slice(),
    prior,
    budget: typeof raw.budget === 'number' && raw.budget > 0 ? raw.budget : 6,
    ...(typeof raw.true_h === 'number' ? { true_h: raw.true_h } : {}),
    truth,
  }
}
