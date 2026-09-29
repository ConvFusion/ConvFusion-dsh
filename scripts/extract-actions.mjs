#!/usr/bin/env node
/**
 * Build action objects from actions that already exist — plan steps, a list of texts, or
 * the actions an agent proposed — and score them.
 *
 * This is the path that works *before* the decision layer (paper 1) exists: the actions are
 * already written down, they are just not written in a measurable form.  The script
 * extracts them, constructs the object (using the fields the text states, else the
 * executor's completion rule), scores both, and — optionally — records the ones you are
 * about to run so the experiment gate can see them.
 *
 *     # a plan's steps
 *     node scripts/extract-actions.mjs --plan workspace/plans/paper4-e6-human-anchor-spec.md
 *
 *     # explicit known actions
 *     node scripts/extract-actions.mjs \
 *       --actions "TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11" \
 *       --actions "对比 memory 与 attention 两个模块（两两对比），8 seeds"
 *
 *     # against your own workspace state, and record the first affordable one
 *     node scripts/extract-actions.mjs --workspace workspace --plan plans/xxx.md --record
 *
 * State: by default the script scores against `workspace/research/action-state.json`.  Use
 * `--state-fixture <index>` to score against a state from the Python panel instead (demo /
 * testing only — it is not the project's own state).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AC = await import(join(ROOT, 'lib', 'research', 'action-construction', 'index.js'))
const TOOLS = await import(join(ROOT, 'lib', 'research', 'research-tools.js'))

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (process.argv[i + 1] ?? true)
}
function argAll(name) {
  const out = []
  process.argv.forEach((value, i) => {
    if (value === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

const workspaceArg = arg('workspace', null)
const planArg = arg('plan', null)
const actionsArg = argAll('actions')
const actionsFile = arg('actions-file', null)
const stateFixture = arg('state-fixture', null)
const record = process.argv.includes('--record')
const ids = arg('ids', null)

if (!planArg && actionsArg.length === 0 && !actionsFile) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].split('/**')[1].trim())
  process.exit(0)
}

/* ── workspace + state ──────────────────────────────────────────────────── */

let workspace = workspaceArg ? resolve(workspaceArg) : join(ROOT, 'workspace')
let temp = null
if (!existsSync(join(workspace, 'research'))) {
  temp = mkdtempSync(join(tmpdir(), 'ac-extract-'))
  workspace = temp
}
if (stateFixture !== null) {
  const fixtures = JSON.parse(
    readFileSync(join(ROOT, 'src', 'research', 'action-construction', 'fixtures', 'python-parity.json'), 'utf8'),
  )
  const index = Number(stateFixture)
  AC.writeActionState(workspace, fixtures.states[index])
  console.log(`state: Python panel state #${index} (demo only — not the project's own state)\n`)
}

/* ── inputs ─────────────────────────────────────────────────────────────── */

const markdownParts = []
if (planArg) {
  const path = isAbsolute(planArg) ? planArg : join(ROOT, planArg)
  if (!existsSync(path)) {
    console.error(`plan not found: ${path}`)
    process.exit(1)
  }
  markdownParts.push(readFileSync(path, 'utf8'))
  console.log(`plan: ${planArg}`)
}
if (actionsFile) {
  const path = isAbsolute(actionsFile) ? actionsFile : join(ROOT, actionsFile)
  markdownParts.push(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `- [ ] ${line.trim()}`)
      .join('\n'),
  )
  console.log(`actions file: ${actionsFile}`)
}
// `--actions` travel as their own parameter: sending them twice (here and in `actions`)
// would extract every one of them twice.
const markdown = markdownParts.join('\n')

/* ── run through the tool so this script exercises the shipped path ─────── */

const tool = TOOLS.defineResearchTools(() => workspace).find((t) => t.name === TOOLS.ACTION_CONSTRUCTION_TOOL)
const args = {
  action: 'extract',
  level: 'L3',
  ...(markdown.trim() ? { text: markdown } : {}),
  ...(actionsArg.length > 0 ? { actions: actionsArg } : {}),
  ...(record ? { record: true } : {}),
  ...(ids ? { ids: String(ids).split(',').map((s) => s.trim()) } : {}),
}
// a plan is read from disk by the tool; explicit text/actions are passed inline
if (planArg) {
  const planPath = isAbsolute(planArg) ? planArg : join(ROOT, planArg)
  args.plan = planPath
  delete args.text
  // the tool resolves `plan` relative to the workspace; hand it an absolute path instead
  args.plan = planPath
}

// The tool wants a lossless JSON object: never pass `undefined` fields through.
const cleanArgs = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined))
let result
if (planArg) {
  // the plan may live outside the workspace (`workspace/plans/...`), so inline its text
  const text = readFileSync(isAbsolute(planArg) ? planArg : join(ROOT, planArg), 'utf8')
  delete cleanArgs.plan            // the text is passed inline; the tool need not resolve a path
  result = await tool.execute({ ...cleanArgs, text }, {})
} else {
  result = await tool.execute(cleanArgs, {})
}

console.log()
console.log(tool.output.render(cleanArgs, result)[0].text)

if (temp) {
  rmSync(temp, { recursive: true, force: true })
  console.log(
    '\n(note: no research workspace was found, so this ran in a temporary one — nothing was written)',
  )
}
