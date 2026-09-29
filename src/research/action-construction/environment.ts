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

import type { Design, Env, Optimum, ResearchState } from './types.js'

/** The reference condition (full model / no ablation).  Always run, never written down. */
export const BASELINE_ARM = 6

/** Coarse effect grid: keeps the marginalisation over outcomes numerically stable. */
export const OBS_GRID = [0.0, 0.25, 0.5, 0.75, 1.0]

const N_REF = 5.0
const SIGMA_REF = 0.55

/** Noise of a condition's estimated effect when run with n seeds (~1/sqrt(n)). */
export function sigma(n: number): number {
  return SIGMA_REF * Math.sqrt(N_REF / Math.max(1, n))
}

/** The design grids the inverse design searches (the paper's `ARMS_GRID` / `N_GRID`). */
export const ARMS_GRID: number[][] = [
  [0],
  [1],
  [2],
  [3],
  [0, 1],
  [2, 3],
  [2, 3, 4, 5],
  [0, 1, 2, 3, 4, 5],
]
export const N_GRID = [2, 4, 6, 8, 12]

export function trueH(env: Env): number[] {
  if (env.truth) return env.truth.slice()
  return Array.from({ length: env.k }, (_, h) => h % env.m)
}

/** The conditions actually run: the requested arms plus the baseline. */
export function runConditions(env: Env, arms: readonly number[]): number[] {
  const run = new Set<number>(arms.map((a) => Math.trunc(a)))
  run.add(BASELINE_ARM)
  return [...run].sort((a, b) => a - b)
}

export function environmentFor(state: ResearchState): Env {
  return {
    k: 6,
    m: 6,
    beta: 2.0,
    budget: typeof state.budget === 'number' && state.budget > 0 ? state.budget : Number.POSITIVE_INFINITY,
    truth: state.truth ?? null,
  }
}

export function envKey(env: Env): string {
  return `${env.k},${env.m},${env.beta},${trueH(env).join(',')}|${env.budget}`
}

/* ── likelihood ─────────────────────────────────────────────────────────── */

/** [2, |OBS_GRID|]: log likelihood for an attenuated (mu=0) and a full-effect (mu=1)
 *  condition.  Cached per seed count — this is the hot path of the metric. */
const LOG_LIK_CACHE = new Map<string, Float64Array>()

export function logLikTable(n: number): Float64Array {
  const table = LOG_LIK_CACHE.get(String(n))
  if (table) return table
  const sig = sigma(n)
  const out = new Float64Array(2 * OBS_GRID.length)
  for (let mu = 0; mu <= 1; mu++) {
    for (let yi = 0; yi < OBS_GRID.length; yi++) {
      out[mu * OBS_GRID.length + yi] = -0.5 * ((OBS_GRID[yi] - mu) / sig) ** 2
    }
  }
  LOG_LIK_CACHE.set(String(n), out)
  return out
}

/** Which bin of the coarse grid a condition's outcome falls in (the likelihood's argmax).
 *  Used only by the discriminability test. */
function likelihoodArgmax(env: Env, h: number, arm: number, n: number): number {
  const mu = arm === BASELINE_ARM || trueH(env)[h] !== arm ? 1.0 : 0.0
  let best = 0
  let bestV = -Infinity
  for (let yi = 0; yi < OBS_GRID.length; yi++) {
    const v = -0.5 * ((OBS_GRID[yi] - mu) / sigma(n)) ** 2
    if (v > bestV) {
      bestV = v
      best = yi
    }
  }
  return best
}

const COND_OK_CACHE = new Map<string, boolean>()

/** A run is informative iff its conditions do not all have the same outcome bin. */
export function conditionOk(env: Env, arms: readonly number[]): boolean {
  const run = runConditions(env, arms)
  const key = `${envKey(env)}|${run.join(',')}`
  const hit = COND_OK_CACHE.get(key)
  if (hit !== undefined) return hit
  const signatures = new Set<string>()
  for (let h = 0; h < env.k; h++) {
    signatures.add(run.map((arm) => likelihoodArgmax(env, h, arm, 4)).join(','))
  }
  const ok = signatures.size >= 2
  COND_OK_CACHE.set(key, ok)
  return ok
}

/* ── information gain ───────────────────────────────────────────────────── */

function entropy(p: ArrayLike<number>): number {
  let acc = 0
  for (let i = 0; i < p.length; i++) {
    const x = p[i]
    if (x > 0) acc -= x * Math.log(x)
  }
  return acc
}

function normalise(p: readonly number[]): Float64Array {
  const out = Float64Array.from(p)
  let sum = 0
  for (const x of out) sum += x
  if (sum !== 0) for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}

/** Scratch buffer for the joint: reused across calls because a six-arm design has
 *  5^7 = 78k outcome tuples and allocating that per candidate design is pure GC churn. */
let jointScratch = new Float64Array(0)
let logPoScratch = new Float64Array(0)
let maxScratch = new Float64Array(0)

function ensureScratch(k: number, nOut: number): void {
  if (jointScratch.length < k * nOut) jointScratch = new Float64Array(k * nOut)
  if (logPoScratch.length < nOut) {
    logPoScratch = new Float64Array(nOut)
    maxScratch = new Float64Array(nOut)
  }
}

const IG_CACHE = new Map<string, number>()

/** Expected posterior entropy reduction on H from running this design. */
export function informationGain(
  env: Env,
  prior: readonly number[],
  arms: readonly number[],
  n: number,
): number {
  const run = runConditions(env, arms)
  if (run.length === 0 || !conditionOk(env, run)) return 0
  const priorKey = prior.map((x) => x.toFixed(12)).join(',')
  const key = `${envKey(env)}|${priorKey}|${run.join(',')}|${n}`
  const hit = IG_CACHE.get(key)
  if (hit !== undefined) return hit

  const k = env.k
  const nY = OBS_GRID.length
  const p = normalise(prior)
  const h0 = entropy(p)
  const table = logLikTable(n)
  const nOut = nY ** run.length
  ensureScratch(k, nOut)
  const joint = jointScratch.subarray(0, k * nOut)
  joint.fill(0)

  const th = trueH(env)
  let stride = 1
  for (let ci = run.length - 1; ci >= 0; ci--) {
    const arm = run[ci]
    for (let o = 0; o < nOut; o++) {
      const bin = Math.floor(o / stride) % nY
      for (let h = 0; h < k; h++) {
        const attenuated = th[h] === arm ? 1 : 0
        joint[h * nOut + o] += table[attenuated * nY + bin]
      }
    }
    stride *= nY
  }

  // log posterior over outcomes, with the max-shift trick (np.logsumexp)
  const logPo = logPoScratch.subarray(0, nOut)
  const maxO = maxScratch.subarray(0, nOut)
  for (let o = 0; o < nOut; o++) {
    let m = -Infinity
    for (let h = 0; h < k; h++) {
      const v = Math.log(p[h]) + joint[h * nOut + o]
      if (v > m) m = v
    }
    let sum = 0
    for (let h = 0; h < k; h++) sum += Math.exp(Math.log(p[h]) + joint[h * nOut + o] - m)
    const v = m + Math.log(sum)
    logPo[o] = v
    maxO[o] = v
  }
  let shift = -Infinity
  for (let o = 0; o < nOut; o++) if (logPo[o] > shift) shift = logPo[o]
  let total = 0
  for (let o = 0; o < nOut; o++) {
    logPo[o] = Math.exp(logPo[o] - shift)
    total += logPo[o]
  }
  if (total > 0) for (let o = 0; o < nOut; o++) logPo[o] /= total

  // expected posterior entropy, over outcomes that matter
  let acc = 0
  for (let o = 0; o < nOut; o++) {
    const pO = logPo[o]
    if (pO <= 1e-10) continue
    let m = -Infinity
    for (let h = 0; h < k; h++) {
      const v = Math.log(p[h]) + joint[h * nOut + o]
      if (v > m) m = v
    }
    let sum = 0
    const post = new Float64Array(k)
    for (let h = 0; h < k; h++) {
      post[h] = Math.exp(Math.log(p[h]) + joint[h * nOut + o] - m)
      sum += post[h]
    }
    let ent = 0
    for (let h = 0; h < k; h++) {
      const q = post[h] / sum
      if (q > 0) ent -= q * Math.log(q)
    }
    acc += pO * ent
  }

  const ig = Math.max(0, h0 - acc)
  IG_CACHE.set(key, ig)
  return ig
}

/** Experiment cost over the conditions actually run (baseline included). */
export function costOf(arms: readonly number[], n: number, env?: Env): number {
  const run = env ? runConditions(env, arms) : [...new Set(arms)].sort((a, b) => a - b)
  return 1.0 + 0.6 * (run.length - 1) + 0.35 * n
}

/* ── inverse design ─────────────────────────────────────────────────────── */

const BEST_CACHE = new Map<string, Optimum | null>()
const BEST_TARGET_CACHE = new Map<string, Optimum>()

/** Best design, optionally under a budget.  With an unbounded budget the optimum is the
 *  same for every intended target (the full factorial), which is why the paper's pointer
 *  gap is identically zero without a budget. */
export function bestDesign(env: Env, prior: readonly number[], budget: number): Optimum | null {
  const key = `${envKey(env)}|${prior.map((x) => x.toFixed(12)).join(',')}|${budget}`
  const hit = BEST_CACHE.get(key)
  if (hit !== undefined) return hit
  let best: Optimum | null = null
  let bestV = -1e9
  for (const arms of ARMS_GRID) {
    for (const n of N_GRID) {
      const cost = costOf(arms, n, env)
      if (cost > budget) continue
      const ig = informationGain(env, prior, arms, n)
      const v = ig / cost
      if (v > bestV) {
        bestV = v
        best = { arms: arms.slice(), n, ig, cost, igPerCost: v }
      }
    }
  }
  BEST_CACHE.set(key, best)
  return best
}

/** Best design an agent with the *same intent* could have specified: every design that
 *  includes the arm the target points to. */
export function bestDesignForTarget(
  env: Env,
  prior: readonly number[],
  target: number,
  budget: number,
): Optimum {
  const key = `${envKey(env)}|${prior.map((x) => x.toFixed(12)).join(',')}|${target}|${budget}`
  const hit = BEST_TARGET_CACHE.get(key)
  if (hit !== undefined) return hit
  const tArm = trueH(env)[target]
  let best: Optimum | null = null
  let bestV = -1e9
  for (const arms of ARMS_GRID) {
    if (!conditionOk(env, arms) || !arms.includes(tArm)) continue
    for (const n of N_GRID) {
      const cost = costOf(arms, n, env)
      if (cost > budget) continue
      const ig = informationGain(env, prior, arms, n)
      const v = ig / cost
      if (v > bestV) {
        bestV = v
        best = { arms: arms.slice(), n, ig, cost, igPerCost: v }
      }
    }
  }
  const out: Optimum =
    best ?? {
      arms: [tArm],
      n: 2,
      ig: 0.0,
      cost: costOf([tArm], 2, env),
      igPerCost: 0.0,
    }
  BEST_TARGET_CACHE.set(key, out)
  return out
}

/** Drop every memoised quantity (tests, or long-lived processes that judge many states). */
export function clearMetricCaches(): void {
  IG_CACHE.clear()
  BEST_CACHE.clear()
  BEST_TARGET_CACHE.clear()
  COND_OK_CACHE.clear()
}

/** The paper's four completion rules: what an executor does with an under-specified
 *  action name.  Exported because `executor.ts` needs it and because the parameters are
 *  part of the method (they determine `R(a)`). */
export const DESIGN_SPECS = {
  single_ablation: { specificity: 0.18, resolution_pressure: 0.0, max_arms_default: 1, n_default: 2, n_generous: 4 },
  binary_contrast: { specificity: 0.32, resolution_pressure: 0.2, max_arms_default: 2, n_default: 2, n_generous: 8 },
  component_scan: { specificity: 0.55, resolution_pressure: 0.5, max_arms_default: 2, n_default: 2, n_generous: 8 },
  factorial: { specificity: 0.80, resolution_pressure: 0.8, max_arms_default: 3, n_default: 2, n_generous: 8 },
} as const

export type DesignSpec = (typeof DESIGN_SPECS)[keyof typeof DESIGN_SPECS]

export function specFor(design: Pick<Design, 'action_type'>): DesignSpec {
  return DESIGN_SPECS[design.action_type] ?? DESIGN_SPECS.single_ablation
}
