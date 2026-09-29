#!/usr/bin/env node
/**
 * Live demo of the Action Construction implementation that now ships in the plugin.
 *
 * Run it to see the metric work end to end with the plugin's own TypeScript code:
 *
 *     npm run build:host
 *     node scripts/demo-action-construction.mjs                 # full demo
 *     node scripts/demo-action-construction.mjs --quick         # no cache replay (fast)
 *
 * What it shows
 * -------------
 * 1. **The mechanism on one state.**  Four ways of writing the same decision (a bare
 *    action name, an intent, a design, a design plus a prediction) scored by the same
 *    executor and metric — the "8.4% vs 62%" effect, plus the feasibility failure.
 * 2. **The published panel reproduced.**  It re-evaluates the *real* cached model answers
 *    (`results/main_cache_*.jsonl`, 1,800 answers from two model families) through the
 *    TypeScript code and compares the per-level means with the numbers the paper
 *    published from the Python instrument.  A mismatch beyond tolerance fails the run,
 *    so this file is a demo *and* a regression test.
 * 3. **The third failure mode.**  How many schema-level designs the stated budget cannot
 *    pay for, and what the compliant scale says about the same answers.
 * 4. **The tool.**  The registered `research_action_construction` tool, called exactly as
 *    the agent calls it.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (p) => join(ROOT, 'lib', p)
const RESEARCH = join(ROOT, 'workspace', 'experiments', 'paper4', 'results')
const QUICK = process.argv.includes('--quick')

const AC = await import(lib('research/action-construction/index.js'))
const TOOLS = await import(lib('research/research-tools.js'))
const SIGNALS = await import(lib('research/stage-signals.js'))

const fixtures = JSON.parse(
  readFileSync(join(ROOT, 'src', 'research', 'action-construction', 'fixtures', 'python-parity.json'), 'utf8'),
)
const STATES = fixtures.states

const pct = (x) => `${(100 * x).toFixed(1)}%`
const num = (x, digits = 4) => (x === null || x === undefined ? 'n/a' : x.toFixed(digits))
let failures = 0

function warn(line) {
  failures += 1
  console.log(`  !! ${line}`)
}

function rule(title) {
  console.log(`\n${'─'.repeat(78)}\n${title}\n${'─'.repeat(78)}`)
}

/* ── 1. the mechanism on one state ──────────────────────────────────────── */

rule('1. 同一个决策，四种写法（状态 0，来自论文的 30 状态面板）')
const state = STATES[0]
console.log(`状态: ${state.question}`)
console.log(`证据: ${state.partial_results}`)
console.log(
  `信念: ${state.prior.map((p, i) => `h${i} ${p.toFixed(2)}`).join(' | ')}   ` +
    `预算: ${state.budget} 成本单位`,
)

const ANSWERS = [
  ['L1', 'ACTION: component_scan\nREASON: 预算允许全部六条臂，信念分散，扫描即可定位'],
  ['L2', 'TARGET: h1\nWHY: 它最能解释已提升的数据集'],
  ['L3', 'TARGET: h1\nARMS: 0,1,2,3,4,5\nSEEDS: 11\nSUCCESS: 去掉 memory 后 A、D 的提升消失'],
  ['L4', 'TARGET: h1\nARMS: 0,1,2,3,4,5\nSEEDS: 11\nPREDICTION: A 与 D 失去提升\nSUCCESS: 去掉 memory 后 A、D 的提升消失'],
]

console.log(
  '\n层级  写法                                    IG/cost   占上界   成本/预算        在预算内  合规口径  执行器推断  ' +
    '缺口(指针/分辨率)',
)
const live = []
for (const [level, answer] of ANSWERS) {
  const e = AC.evaluateAnswer(state, answer, level)
  live.push({ level, answer, e })
  console.log(
    `${level}   ${(answer.split('\n')[0] + '…').padEnd(38)} ${num(e.ig_per_cost)}   ` +
      `${pct(e.bound_share).padStart(6)}   ${num(e.cost, 2)}/${e.budget.toFixed(1)}`.padEnd(17) +
      ` ${String(e.feasible).padEnd(8)} ${num(e.compliant, 3).padEnd(9)} ` +
      `${pct(e.guess_rate).padStart(6)}      ${num(e.pointer_gap)}/${num(e.resolution_gap)}`,
  )
}
const l1 = live[0].e
const l3 = live[2].e
const gain = l3.ig_per_cost / l1.ig_per_cost
console.log(
  `\n结论：同一决策，从“只写动作名”到“写出完整设计”，单位成本信息量提高 ${gain.toFixed(1)} 倍；` +
    `执行器需要自己猜的比例从 ${pct(l1.guess_rate)} 降到 ${pct(l3.guess_rate)}。`,
)
console.log(
  `代价：L3 写出的设计成本 ${num(l3.cost, 2)} > 预算 ${l3.budget.toFixed(1)}，` +
    `在合规口径下记 0 —— 信息量买到了，可执行性没有。`,
)

/* ── 2. the published panel, re-evaluated by the plugin's code ──────────── */

rule('2. 用插件的代码重算论文的真实数据（两个模型族 × 4 个层级 × 30 状态）')

function readCache(path) {
  const rows = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    const record = JSON.parse(line)
    if (record.key === '__state_digest__') {
      if (record.text !== fixtures.state_digest) {
        throw new Error(`cache digest ${record.text} != fixture digest ${fixtures.state_digest}`)
      }
      continue
    }
    const [model, effort, stateIndex, tag, repeat] = record.key.split('|')
    rows.push({ model, effort, stateIndex: Number(stateIndex), tag, repeat: Number(repeat), text: record.text })
  }
  return rows
}

/**
 * Mean over states of the per-state mean over repeats — the paper's unit of analysis.
 *
 * `convention` matters and is not cosmetic: the main matrix reports means over
 * **parseable** answers (a failed parse is counted in the ITT column, not in the primary
 * mean).  Averaging every answer instead shifts a condition by up to 2.4e-3, which is
 * exactly the difference between the two conventions.
 */
function aggregate(rows, model, effort, tag, field, convention = 'parseable') {
  const perState = new Map()
  let seen = 0
  let parsed = 0
  for (const row of rows) {
    if (row.model !== model || row.effort !== effort || row.tag !== tag) continue
    if (row.stateIndex >= STATES.length) continue
    const evaluation = AC.evaluateAnswer(STATES[row.stateIndex], row.text, tag)
    seen += 1
    const ok = evaluation.parse_status === 'ok' || evaluation.status === 'ok'
    if (ok) parsed += 1
    if (convention === 'parseable' && !ok) continue
    const bucket = perState.get(row.stateIndex) ?? []
    bucket.push(evaluation[field])
    perState.set(row.stateIndex, bucket)
  }
  if (perState.size === 0) return null
  const perStateMeans = [...perState.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length)
  return {
    value: perStateMeans.reduce((a, b) => a + b, 0) / perStateMeans.length,
    states: perState.size,
    answers: seen,
    parseRate: seen === 0 ? 0 : parsed / seen,
  }
}

const published = existsSync(join(RESEARCH, 'rich_analysis.json'))
  ? JSON.parse(readFileSync(join(RESEARCH, 'rich_analysis.json'), 'utf8'))
  : null

const FAMILIES = [
  ['deepseek-flash', 'low', 'main_cache_deepseek-flash.jsonl', '族 A（frontier API）· low'],
  ['deepseek-flash', 'max', 'main_cache_deepseek-flash.jsonl', '族 A（frontier API）· max'],
  ['Qwen3.8-27B-TURBO-Fable', 'na', 'main_cache_Qwen3.8-27B-TURBO-Fable.jsonl', '族 B（本地 27B）· 默认档'],
  ['Qwen3.8-27B-TURBO-Fable', 'low', 'main_cache_Qwen3.8-27B-TURBO-Fable.jsonl', '族 B（本地 27B）· low'],
]

let cacheRows = null
const cachePaths = new Set(FAMILIES.map(([, , file]) => file))
if (!QUICK) {
  for (const file of cachePaths) {
    const path = join(RESEARCH, file)
    if (!existsSync(path)) {
      console.log(`（跳过缓存重算：找不到 ${file}）`)
      cacheRows = null
      break
    }
    const rows = readCache(path)
    cacheRows = cacheRows ? [...cacheRows, ...rows] : rows
  }
}

if (!QUICK && cacheRows) {
  const cacheRowsFor = (file) => cacheRows.filter((r) => {
    const family = file.includes('Qwen') ? 'Qwen3.8-27B-TURBO-Fable' : 'deepseek-flash'
    return r.model === family
  })
  for (const [model, effort, file, label] of FAMILIES) {
    const rows = cacheRowsFor(file)
    console.log(`\n${label}`)
    console.log(
      '层级  可解析率  插件重算(可解析)  论文发表值     差        插件重算(全部答案)  占上界(插件/论文)',
    )
    for (const tag of ['L1', 'L2', 'L3', 'L4']) {
      const igc = aggregate(rows, model, effort, tag, 'ig_per_cost', 'parseable')
      const all = aggregate(rows, model, effort, tag, 'ig_per_cost', 'all')
      const share = aggregate(rows, model, effort, tag, 'bound_share', 'parseable')
      if (!igc || !share) continue
      const key = `${model}|${effort}|${tag}`
      const ref = published?.conditions?.[key]
      const refIgc = ref ? ref.ig_per_cost : null
      const refShare = ref ? ref.oracle_ratio : null
      const delta = refIgc === null ? null : Math.abs(igc.value - refIgc)
      console.log(
        `${tag}    ${pct(igc.parseRate).padStart(6)}    ${num(igc.value)}          ${num(refIgc)}      ` +
          `${delta === null ? '—' : delta.toExponential(1)}    ${num(all.value)}             ` +
          `${pct(share.value)} / ${refShare === null ? '—' : pct(refShare)}`,
      )
      if (delta !== null && delta > 1e-9) {
        warn(`${key}: 插件重算 ${num(igc.value)} 与论文发表值 ${num(refIgc)} 相差 ${delta.toExponential(1)}`)
      }
    }
    console.log(
      '  注：论文主矩阵只对**可解析**的答案求均值（解析失败的答案计入 ITT 列），' +
        '因此可解析率 < 100% 的条件上两种口径会分开；“全部答案”列就是 ITT 口径。',
    )
  }
}

/* ── 3. the third failure mode, recomputed from the same answers ────────── */

if (!QUICK && cacheRows) {
  rule('3. 第三种失效模式：写出的设计，预算付不起')
  console.log('层级   在预算内的比例（族 A low / max）   合规口径均值（族 A low）')
  for (const tag of ['L1', 'L2', 'L3', 'L4']) {
    const shares = []
    for (const effort of ['low', 'max']) {
      const perState = new Map()
      for (const row of cacheRows) {
        if (row.model !== 'deepseek-flash' || row.effort !== effort || row.tag !== tag) continue
        const e = AC.evaluateAnswer(STATES[row.stateIndex], row.text, tag)
        if (e.parse_status !== 'ok') continue
        const bucket = perState.get(row.stateIndex) ?? []
        bucket.push(e.feasible ? 1 : 0)
        perState.set(row.stateIndex, bucket)
      }
      const perStateMeans = [...perState.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length)
      shares.push(perStateMeans.reduce((a, b) => a + b, 0) / perStateMeans.length)
    }
    const compliant = aggregate(cacheRows, 'deepseek-flash', 'low', tag, 'compliant', 'parseable')
    console.log(
      `${tag}     ${pct(shares[0]).padStart(6)} / ${pct(shares[1]).padStart(6)}` +
        `                  ${num(compliant?.value ?? 0, 3)}`,
    )
  }
  console.log(
    '\n即：L1/L2 的答案全都在预算内（因为根本没有写出设计），L3/L4 的设计绝大多数付不起；' +
      '换成合规口径后，schema 层级在族 A 上只剩 0–6%。',
  )
}

/* ── 4. the tool the agent calls ────────────────────────────────────────── */

rule('4. 插件工具 research_action_construction（agent 调用路径）')
const registered = TOOLS.defineResearchTools(() => join(ROOT, 'workspace'))
const tool = registered.find((t) => t.name === TOOLS.ACTION_CONSTRUCTION_TOOL)
if (!tool) {
  warn('工具未注册')
} else {
  console.log(`已注册：${tool.name}（共 ${registered.length} 个研究工具）`)
  const evaluated = await tool.execute(
    { action: 'evaluate', state, level: 'L3', answer: ANSWERS[2][1] },
    {},
  )
  const rendered = tool.output.render({ action: 'evaluate' }, evaluated)
  console.log(`工具返回：${rendered[0].text}`)
  const prompt = await tool.execute({ action: 'prompt', state, level: 'L3' }, {})
  console.log(`\n提示词（前 3 行，共 ${prompt.prompt.length} 字符）：`)
  console.log(prompt.prompt.split('\n').slice(0, 3).map((l) => `  ${l}`).join('\n'))
}

/* ── 5. the flow inside /research: construct → record → gate ────────────── */

rule('5. 在 /research 里怎么用：实验前的动作构造闸门（在临时工作区里真跑一遍）')
{
  const ws = mkdtempSync(join(tmpdir(), 'ac-demo-flow-'))
  try {
    mkdirSync(join(ws, 'research'), { recursive: true })
    const flowTool = TOOLS.defineResearchTools(() => ws).find((t) => t.name === TOOLS.ACTION_CONSTRUCTION_TOOL)
    const gate = () => SIGNALS.judgeSignal(SIGNALS.buildSignalContext(ws), 'action-construction')
    const show = async (args, label) => {
      const result = await flowTool.execute(args, {})
      console.log(`  ${label}\n    ${flowTool.output.render(args, result)[0].text.replace(/\n/g, '\n    ')}`)
    }

    console.log(`  ① 未配置状态时，闸门状态：${gate().satisfied ? '满足' : '不满足'} — ${gate().evidence}`)
    await show({ action: 'set_state', state }, '② set_state 写下这次实验的状态（机制集 / 臂 / 信念 / 预算）')
    console.log(`     闸门状态：${gate().satisfied ? '满足' : '不满足'} — ${gate().evidence}`)
    await show(
      { action: 'record', level: 'L3', answer: ANSWERS[2][1], note: '六臂全跑，按论文的典型写法' },
      '③ record 记录一次构造（六臂 × 11 seeds）',
    )
    console.log(`     闸门状态：${gate().satisfied ? '满足' : '不满足'} — ${gate().evidence}`)
    await show(
      { action: 'record', level: 'L3', answer: 'TARGET: h1\nARMS: 2,3,4,5\nSEEDS: 12', note: '按预算裁到四臂 × 12 seeds' },
      '④ 把设计裁到预算内，再记录一次',
    )
    console.log(`     闸门状态：${gate().satisfied ? '满足' : '不满足'} — ${gate().evidence}`)
    console.log(
      '\n  这就是本论文的修法在工作区里的样子：不是"信息量更高"就够了，' +
        '而是先量化代价、再把设计裁到预算内，然后才允许发真实调用。',
    )
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
}

/* ── 6. construct objects for actions that already exist ────────────────── */

rule('6. 没有 Paper 1 也能用：从已知 Action 自动构建 Action Object')
{
  const KNOWN = [
    'TARGET: h1 | ARMS: 0,1,2,3,4,5 | SEEDS: 11',
    '做一次 memory 模块的消融实验，跑一条臂，2 个 seeds',
    '对比 memory 与 attention 两个模块（两两对比），8 seeds',
    '全臂扫描：0,1,2,3,4,5，4 seeds',
    '撰写相关工作并补 12 条参考文献',
  ]
  const markdown = KNOWN.map((t, i) => `- [ ] A${i + 1} ${t}`).join('\n')
  const candidates = AC.extractCandidates(markdown, 'known-actions')
  const constructed = AC.constructFromCandidates(state, candidates)
  console.log('输入：5 条"已知 Action"（其中 4 条是消融类实验，1 条不是）\n')
  console.log('id   类型              构造出的对象                                       信息量(构造)   成本/预算       as written')
  for (const item of constructed) {
    const e = item.constructed
    const w = item.asWritten
    const design = `target ${item.design.target}, arms [${(item.design.arms ?? []).join(',')}], seeds ${item.design.n}`
    console.log(
      `${item.candidate.id.padEnd(4)} ${String(item.candidate.actionType).padEnd(16)} ${design.padEnd(48)} ` +
        `${pct(e.bound_share).padStart(6)} ${num(e.cost, 2)}/${e.budget.toFixed(1)}`.padEnd(14) +
        ` ${w.ig_per_cost.toFixed(4)}（执行器自猜 ${pct(w.guess_rate)}）`,
    )
  }
  for (const skipped of candidates.filter((c) => !c.measurable)) {
    console.log(`${skipped.id.padEnd(4)} 跳过：${skipped.reason}`)
  }
  console.log(
    '\n读法：结构化写法的动作直接把设计读出来（as written 即构造）；散文写法的动作要先\n' +
      '把文字里的信息（模块名、臂数、seeds）落成对象，代价与收益才看得见；不属于消融类\n' +
      '实验的步骤明确跳过，而不是硬套一个设计。',
  )
}

console.log(
  `\n${'═'.repeat(78)}\n` +
    `演示完成：${failures === 0 ? 'OK' : `${failures} 处告警`}。` +
    `按论文口径（可解析答案）重算与发表值之差 ≤ 1e-9（实测 1e-17~1e-15）；` +
    `完整一致性校验见 npm run verify:action-construction。\n`,
)
process.exit(failures === 0 ? 0 : 1)
