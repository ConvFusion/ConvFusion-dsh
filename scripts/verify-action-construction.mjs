/**
 * Verify the DSH (TypeScript) implementation against the Python instrument.
 *
 * The method is defined and measured in Python under `workspace/experiments/paper4/`.
 * The plugin re-implements the same metric in TypeScript; two implementations of one
 * metric drift unless something forces them together.  This script is that something:
 * it replays every case of `src/research/action-construction/fixtures/python-parity.json`
 * (exported from the released Python library by
 * `workspace/experiments/paper4/export_dsh_fixture.py`) and requires the TypeScript side
 * to reproduce every field.
 *
 *     npm run build:host && node scripts/verify-action-construction.mjs
 *
 * Floats: |ts - py| <= 1e-9 * max(1, |py|).  Everything else — parse status, feasible,
 * quantifications, arms, prompts — must match exactly.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const FIXTURE = join(ROOT, 'src', 'research', 'action-construction', 'fixtures', 'python-parity.json')
const LIB = join(ROOT, 'lib', 'research', 'action-construction', 'index.js')

const FLOAT_FIELDS = [
  'ig', 'ig_per_cost', 'bound', 'bound_share', 'affordable_bound', 'compliant', 'budget',
  'guess_rate', 'pointer_gap', 'resolution_gap', 'construction_gap', 'ig_oracle',
  'cost_oracle', 'ig_target_opt',
]
const EXACT_FIELDS = [
  'status', 'parsed', 'target', 'feasible', 'arms_oracle', 'seeds_oracle',
  'arms_target_opt', 'seeds_target_opt',
]

function close(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return a === b
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

let failures = 0

function report(scope, detail) {
  failures += 1
  if (failures <= 25) console.log(`  FAIL ${scope}: ${detail}`)
}

async function main() {
  let ac
  try {
    ac = await import(LIB)
  } catch (error) {
    console.log(`!! cannot import ${LIB} — run "npm run build:host" first`)
    console.log(String(error))
    process.exit(1)
  }

  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  console.log(
    `fixture: ${fixture.states.length} states, ${fixture.cases.length} cases, ` +
      `${fixture.prompts.length} prompts (${fixture.source})`,
  )

  /* ── 1. prompts must be byte-identical ─────────────────────────────────── */
  let promptsChecked = 0
  for (const entry of fixture.prompts) {
    const state = fixture.states[entry.state_index]
    const control = entry.level === 'L1pad' || entry.level === 'L3short' ? 'length' : ''
    const level = entry.level === 'L1pad' ? 'L1' : entry.level === 'L3short' ? 'L3' : entry.level
    const prompt = ac.buildPrompt(state, level, control)
    promptsChecked += 1
    if (prompt !== entry.prompt) {
      report(`prompt s${entry.state_index}/${entry.level}`, 'differs from the Python prompt')
    }
  }

  /* ── 2. every evaluation field, for every case ──────────────────────────── */
  let casesChecked = 0
  for (const testCase of fixture.cases) {
    const state = fixture.states[testCase.state_index]
    const evaluation =
      testCase.answer !== null && testCase.answer !== undefined
        ? ac.evaluateAnswer(state, testCase.answer, testCase.level)
        : ac.evaluateDesign(state, testCase.design ?? null)
    casesChecked += 1

    for (const field of FLOAT_FIELDS) {
      const expected = testCase.expected[field]
      const actual = evaluation[field]
      if (typeof expected === 'number' && !close(actual, expected)) {
        report(`${testCase.id}.${field}`, `ts=${actual} py=${expected}`)
      }
    }
    for (const field of EXACT_FIELDS) {
      const expected = testCase.expected[field]
      const actual = evaluation[field]
      if (field === 'status' && testCase.expected.status === 'no_design') {
        // the Python library reports `no_design` for an absent design; both sides must agree
        if (actual !== 'no_design') report(`${testCase.id}.status`, `ts=${actual} py=${expected}`)
        continue
      }
      if (!sameJson(actual, expected)) {
        report(`${testCase.id}.${field}`, `ts=${JSON.stringify(actual)} py=${JSON.stringify(expected)}`)
      }
    }
    // cost is null exactly when there is no design
    if (!close(evaluation.cost, testCase.expected.cost)) {
      report(`${testCase.id}.cost`, `ts=${evaluation.cost} py=${testCase.expected.cost}`)
    }
    // the reading set R(a) must be identical, not merely similar
    const expectedQuants = (testCase.expected.quantifications ?? []).map((q) => ({
      arms: q.arms,
      n: q.n,
    }))
    if (!sameJson(evaluation.quantifications, expectedQuants)) {
      report(
        `${testCase.id}.quantifications`,
        `ts=${JSON.stringify(evaluation.quantifications)} py=${JSON.stringify(expectedQuants)}`,
      )
    }
    // parse status is part of the interface contract
    if (testCase.answer !== null && testCase.answer !== undefined) {
      const status = 'parse_status' in evaluation ? evaluation.parse_status : undefined
      if (status !== testCase.expected.parse_status) {
        report(`${testCase.id}.parse_status`, `ts=${status} py=${testCase.expected.parse_status}`)
      }
    }
  }

  /* ── 3. the worked example quoted in the paper and the deck ────────────── */
  const example = fixture.worked_example
  const exampleState = fixture.states[example.state_index]
  const exampleResult = ac.evaluateAnswer(exampleState, example.answer, 'L3')
  const exampleChecks = [
    ['ig_per_cost', 0.13881799446578577],
    ['cost', 8.45],
    ['feasible', false],
    ['compliant', 0],
  ]
  for (const [field, expected] of exampleChecks) {
    const actual = exampleResult[field]
    const ok = typeof expected === 'number' && typeof actual === 'number'
      ? close(actual, expected)
      : actual === expected
    if (!ok) report(`worked-example.${field}`, `ts=${actual} expected=${expected}`)
  }
  if (!close(exampleResult.bound_share, 0.9683218059518228)) {
    report('worked-example.bound_share', `ts=${exampleResult.bound_share}`)
  }

  /* ── 4. the named level, which the paper quotes as 8.4% ────────────────── */
  const named = ac.evaluateAnswer(exampleState, 'ACTION: component_scan\nREASON: budget allows', 'L1')
  if (!close(named.ig_per_cost, 0.01166295283032064)) {
    report('named-example.ig_per_cost', `ts=${named.ig_per_cost}`)
  }
  if (named.guess_rate !== 0.75) report('named-example.guess_rate', `ts=${named.guess_rate}`)
  if (named.feasible !== true) report('named-example.feasible', `ts=${named.feasible}`)

  /* ── 5. the sampler still produces distinct problems ───────────────────── */
  const a0 = ac.sampleState(0)
  const a1 = ac.sampleState(1)
  if (a0.partial_results === a1.partial_results && sameJson(a0.prior, a1.prior)) {
    report('sampleState', 'index 0 and 1 produced the same state')
  }
  if (Math.abs(a0.prior.reduce((x, y) => x + y, 0) - 1) > 1e-9) {
    report('sampleState.prior', 'prior does not sum to 1')
  }

  /* ── 6. the tool the plugin actually calls ─────────────────────────────── */
  const tools = await import(join(ROOT, 'lib', 'research', 'research-tools.js'))
  const signals = await import(join(ROOT, 'lib', 'research', 'stage-signals.js'))
  const registered = tools.defineResearchTools(() => '/tmp')
  const tool = registered.find((t) => t.name === tools.ACTION_CONSTRUCTION_TOOL)
  if (!tool) {
    report('tool registration', 'research_action_construction is not in the tool list')
  } else {
    const sample = await tool.execute({ action: 'sample', state_index: 3 }, {})
    if (sample.ok !== true || !sample.state || sample.state.mechanisms.length !== 6) {
      report('tool sample', JSON.stringify(sample).slice(0, 160))
    }
    const prompt = await tool.execute({ action: 'prompt', state_index: 3, level: 'L4' }, {})
    if (prompt.ok !== true || typeof prompt.prompt !== 'string' || !prompt.prompt.includes('TARGET:')) {
      report('tool prompt', JSON.stringify(prompt).slice(0, 160))
    }
    // NOTE: pass the fixture state explicitly.  `state_index` selects the *TypeScript*
    // synthetic panel, which is a different set of problems from the Python panel (the
    // sampler is deliberately not a replay of MT19937) — the product path is `state`.
    const evaluated = await tool.execute(
      {
        action: 'evaluate',
        state: exampleState,
        level: 'L3',
        answer: example.answer,
      },
      {},
    )
    if (evaluated.ok !== true || !close(evaluated.evaluation?.ig_per_cost, 0.13881799446578577)) {
      report('tool evaluate', JSON.stringify(evaluated).slice(0, 200))
    }
    const structured = await tool.execute(
      {
        action: 'evaluate',
        state: exampleState,
        design: { action_type: 'component_scan', target: 1, arms: [0, 1, 2, 3, 4, 5], n: 11 },
      },
      {},
    )
    if (structured.ok !== true || !close(structured.evaluation?.ig_per_cost, 0.13881799446578577)) {
      report('tool evaluate (design)', JSON.stringify(structured).slice(0, 200))
    }
    const bad = await tool.execute({ action: 'evaluate', state: exampleState }, {})
    if (bad.ok !== false) report('tool guard', 'evaluate without answer/design should fail loudly')
    const rendered = tool.output.render({ action: 'evaluate' }, evaluated)
    console.log(`tool render: ${rendered[0].text}`)
  }

  /* ── 7. the workspace flow inside /research: set_state → record → gate ──── */
  const ws = mkdtempSync(join(tmpdir(), 'ac-flow-'))
  try {
    mkdirSync(join(ws, 'research'), { recursive: true })
    const flowTool = tools.defineResearchTools(() => ws).find((t) => t.name === tools.ACTION_CONSTRUCTION_TOOL)
    const signalOk = () => signals.judgeSignal(signals.buildSignalContext(ws), 'action-construction').satisfied

    if (signalOk() !== false) report('flow.gate', 'a workspace with no action state must not pass the gate')
    const notSet = await flowTool.execute({ action: 'state' }, {})
    if (notSet.ok !== true || notSet.configured !== false) report('flow.state', 'unset state should report configured=false')

    const setResult = await flowTool.execute({ action: 'set_state', state: fixture.states[0] }, {})
    if (setResult.ok !== true || setResult.path !== 'research/action-state.json') {
      report('flow.set_state', JSON.stringify(setResult).slice(0, 160))
    }

    const overBudget = await flowTool.execute(
      { action: 'record', level: 'L3', answer: 'TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11', note: 'as written' },
      {},
    )
    if (overBudget.ok !== true || overBudget.evaluation?.feasible !== false) {
      report('flow.record', 'the six-arm design is expected to be over budget on state 0')
    }
    if (signalOk() !== false) report('flow.gate', 'an unaffordable design must not pass the gate')

    const affordable = await flowTool.execute(
      { action: 'record', level: 'L3', answer: 'TARGET: h1 | ARMS: 2,3,4,5 | SEEDS: 12', note: 'trimmed' },
      {},
    )
    if (affordable.ok !== true || affordable.evaluation?.feasible !== true) {
      report('flow.record (trimmed)', JSON.stringify(affordable.evaluation ?? {}).slice(0, 160))
    }
    if (signalOk() !== true) report('flow.gate', 'an affordable design should pass the gate')

    const reportResult = await flowTool.execute({ action: 'report' }, {})
    if (reportResult.count !== 2 || reportResult.inBudget !== 1) {
      report('flow.report', `count=${reportResult.count} inBudget=${reportResult.inBudget}`)
    }
    // the `/research` status block is rendered from the same files
    const records = ac.readActionRecords(ws, 5)
    if (records.length !== 2) report('flow.log', `expected 2 records on disk, found ${records.length}`)
    const commands = await import(join(ROOT, 'lib', 'research', 'commands.js'))
    const status = commands.actionConstructionStatus(ws)
    const statusText = status.join('\n')
    if (!statusText.includes('Action construction: 2 evaluation(s), 1 within the stated budget')) {
      report('flow.status', statusText.replace(/\n/g, ' | ').slice(0, 200))
    }
    if (!statusText.includes('OVER BUDGET')) report('flow.status', 'the log line should mark the over-budget record')
    const emptyStatus = commands.actionConstructionStatus(mkdtempSync(join(tmpdir(), 'ac-empty-')))
    if (emptyStatus.length !== 0) report('flow.status (unconfigured)', 'an untouched workspace must add no status lines')
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }

  /* ── 8. constructing objects for actions that already exist ────────────── */
  {
    const KNOWN = [
      ['A1', 'TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11', 'component_scan', [0, 1, 2, 3, 4, 5], 11],
      ['A2', '做一次 memory 模块的消融实验，跑一条臂，2 个 seeds', 'single_ablation', [0], 2],
      ['A3', '对比 memory 与 attention 两个模块（两两对比），8 seeds', 'binary_contrast', [0, 1], 8],
      ['A4', '全臂扫描：0,1,2,3,4,5，4 seeds', 'component_scan', [0, 1, 2, 3], 4],
    ]
    const markdown = KNOWN.map(([id, text]) => `- [ ] ${id} ${text}`).join('\n')
    const candidates = ac.extractCandidates(markdown, 'verify')
    const constructed = ac.constructFromCandidates(fixture.states[0], candidates)
    if (constructed.length !== KNOWN.length) {
      report('extract.count', `expected ${KNOWN.length} constructed objects, got ${constructed.length}`)
    }
    for (const [id, , type, arms, n] of KNOWN) {
      const item = constructed.find((c) => c.candidate.id === id)
      if (!item) {
        report(`extract.${id}`, 'not extracted')
        continue
      }
      if (item.candidate.actionType !== type) {
        report(`extract.${id}.type`, `ts=${item.candidate.actionType} expected=${type}`)
      }
      if (!sameJson(item.design.arms, arms) || item.design.n !== n) {
        report(`extract.${id}.design`, `ts=${JSON.stringify(item.design)} expected arms=${JSON.stringify(arms)} n=${n}`)
      }
      if (item.materialisedFrom !== 'text fields') {
        report(`extract.${id}.source`, `materialised from ${item.materialisedFrom}, expected the stated fields`)
      }
    }
    // a step that is an action but not an ablation-design action must be reported, not scored
    const prose = ac.extractCandidates('- [ ] A5 撰写相关工作并补 12 条参考文献', 'verify')
    if (prose.length !== 1 || prose[0].measurable !== false || !prose[0].reason) {
      report('extract.not-measurable', JSON.stringify(prose).slice(0, 160))
    }
    if (ac.constructFromCandidates(fixture.states[0], prose).length !== 0) {
      report('extract.not-measurable', 'a drafting step must not produce a scored object')
    }
  }

  const ok = failures === 0
  console.log(
    `\naction construction parity: ${ok ? 'OK' : `${failures} mismatch(es)`}  ` +
      `(${casesChecked} cases, ${promptsChecked} prompts, tool ${tool ? 'registered' : 'MISSING'})`,
  )
  process.exit(ok ? 0 : 1)
}

await main()
