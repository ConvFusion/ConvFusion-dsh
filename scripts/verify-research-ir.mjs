#!/usr/bin/env node
/**
 * ConvFusion — Research IR Kernel 自检（v0.5.6，dev-notes/v0.5.6-ResearchIR.md）。
 *
 * 守的是 IR 内核的**确定性契约**：
 *
 *   [1] 三层验证各自拦得住：Structural(R0xx) / Scientific(R1xx) / Transition(R2xx)
 *   [2] 每条错误都带 `repair`（§16 Repair 机制 —— 没有修复提示等于没修）
 *   [3] IR Delta 只做增量、修订不覆盖（§17 / §10：旧修订归档进 .history）
 *   [4] 非法状态推进必须被拒绝（§8.3），合法推进产生 S 链 + Decision Trace（§18）
 *   [5] Evidence ↔ IR 覆盖率可计算（§11 Required → Produced → Coverage）
 *
 * 用法：node scripts/verify-research-ir.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const IR = await import(lib('research/ir/index.js'))
const EV = await import(lib('research/evidence.js'))
const CL = await import(lib('research/claims.js'))

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) passed++
  else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(actual, expect, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect)
  if (!ok) console.log(`    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  assert(ok, label)
}

/** 临时研究根。 */
function mkWs() {
  return mkdtempSync(join(tmpdir(), 'convfusion-ir-'))
}

/** 合法 IR 模板（experiment_design：含 baseline / metric / 证据要求 / 可观察结果）。 */
function validIr() {
  return {
    research: { key: 'dcr', title: 'Decision-Centric Research' },
    question: { statement: 'Does a compact calibrated model decide as well as a general LLM?' },
    hypotheses: [
      { id: 'H01', statement: 'DCRM matches the general LLM.', observableOutcome: 'top-1 within 5 points' },
      { id: 'H02', statement: 'Structured state is the mechanism.', observableOutcome: 'state ablation drops to question-only' },
    ],
    decision: {
      type: 'experiment_design',
      objective: 'discriminate_hypotheses',
      alternatives: ['continue_current_experiment', 'add_control_condition', 'replace_baseline'],
      selected: ['add_control_condition'],
      rationale: ['current evidence cannot distinguish H01 and H02'],
      baseline: ['question-only student'],
      metric: ['top1_accuracy'],
      hypotheses: ['H01', 'H02'],
    },
    plan: {
      steps: [
        { id: 'step-1', action: 'Prepare dataset split', artifact: 'experiments/dcr/data/split.json' },
        { id: 'step-2', action: 'Run control condition', artifact: 'experiments/dcr/results/control.json' },
      ],
    },
    evidenceRequirements: [
      { id: 'ER01', type: 'experimental-comparison', description: 'DCRM vs question-only on the same cases', step: 'step-2' },
      { id: 'ER02', type: 'ablation', description: 'state ablation effect', step: 'step-2' },
    ],
  }
}

/** 断言报告里出现某个错误码。 */
function hasCode(report, code, label) {
  assert(report.errors.some((e) => e.code === code), `${label}（期望错误码 ${code}，实际: ${report.errors.map((e) => e.code).join(',') || '无'}）`)
}

/** 断言报告全部通过。 */
function valid(report, label) {
  assertEq(report.status, 'valid', label)
}

/* ════════════════════════════════════════════════════════════════════════
 * [1] 合法 IR 走通三层 + propose 落盘
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· 合法 IR 与 propose 落盘')
{
  const ws = mkWs()
  const { report } = IR.parseIR(validIr())
  valid(report, '合法 IR 校验通过')

  const saved = IR.saveIR(ws, { ...IR.normalizeIR(validIr()), id: '', provenance: { createdAt: new Date().toISOString(), source: 'proposal' } })
  assert(!IR.isIRWriteError(saved) && saved.id === 'IR001', '首个 IR 分配 id IR001')
  assertEq(IR.nextIrId(ws), 'IR002', '下一个 id 是 IR002')
  assertEq(IR.listIRs(ws).length, 1, 'listIRs 收录 1 个 IR')
  const read = IR.readIR(ws, 'IR001')
  assert(read?.decision.type === 'experiment_design', 'readIR 读回决策类型')
  rmSync(ws, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * [2] Structural（R0xx）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· Structural R0xx')
{
  const cases = [
    ['R001', (ir) => { ir.question = {} }, '缺研究问题'],
    ['R002', (ir) => { ir.decision.type = 'send_email' }, '非法决策类型'],
    ['R003', (ir) => { ir.decision.selected = [] }, '缺 selected'],
    ['R004', (ir) => { ir.evidenceRequirements = [{ id: 'ER01', type: 'vibes', description: '' }] }, '非法证据要求'],
    ['R005', (ir) => { ir.research = { key: '', title: '' } }, '缺研究身份'],
    ['R006', (ir) => { ir.plan.steps = [] }, '计划无执行步'],
    ['R007', (ir) => { delete ir.decision.objective }, '缺 objective'],
    ['R008', (ir) => { ir.decision.rationale = [] }, '缺 rationale'],
    ['R009', (ir) => { ir.hypotheses[1].id = 'H01' }, '重复 id'],
    ['R010', (ir) => { ir.hypotheses[0].statement = '' }, '假设无陈述'],
    ['R011', (ir) => { ir.decision.hypotheses = ['H99'] }, '引用不存在的假设'],
  ]
  for (const [code, mutate, label] of cases) {
    const ir = validIr()
    mutate(ir)
    hasCode(IR.parseIR(ir).report, code, label)
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * [3] Scientific（R1xx）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· Scientific R1xx')
{
  // R101 假设无可观察结果
  {
    const ir = validIr()
    ir.decision.type = 'hypothesis_discrimination'
    delete ir.hypotheses[0].observableOutcome
    hasCode(IR.parseIR(ir).report, 'R101', '假设无可观察结果')
  }
  // R102 实验无 baseline
  {
    const ir = validIr()
    ir.decision.type = 'compare_methods'
    ir.decision.baseline = []
    hasCode(IR.parseIR(ir).report, 'R102', '实验无 baseline')
  }
  // R103 主张/证据类决策无证据要求
  {
    const ir = validIr()
    ir.decision.type = 'evidence_sufficiency'
    ir.evidenceRequirements = []
    hasCode(IR.parseIR(ir).report, 'R103', '无证据要求')
  }
  // R104 决策无备选项
  {
    const ir = validIr()
    ir.decision.alternatives = []
    hasCode(IR.parseIR(ir).report, 'R104', '决策无备选项')
  }
  // R105 证据要求引用不存在的计划步
  {
    const ir = validIr()
    ir.evidenceRequirements[0].step = 'step-99'
    hasCode(IR.parseIR(ir).report, 'R105', '证据要求不可满足')
  }
  // R106 selected 不在 alternatives 里
  {
    const ir = validIr()
    ir.decision.selected = ['replace_baseline']
    ir.decision.alternatives = ['add_control_condition']
    hasCode(IR.parseIR(ir).report, 'R106', 'selected 不在备选项内')
  }
  // R107 结果不可测量
  {
    const ir = validIr()
    ir.decision.type = 'method_selection'
    ir.decision.metric = []
    ir.plan.steps = [{ id: 'step-1', action: 'Pick a model' }]
    hasCode(IR.parseIR(ir).report, 'R107', '结果不可测量')
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * [4] 每条错误都有 repair（§16）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· Repair 提示')
{
  const ir = validIr()
  ir.question = {}
  ir.decision.type = 'send_email'
  ir.decision.selected = []
  ir.hypotheses[1].id = 'H01'
  const { report } = IR.parseIR(ir)
  assert(report.errors.length >= 4, '组合错误全部报出')
  assert(
    report.errors.every((e) => typeof e.repair === 'string' && e.repair.length > 0),
    '每条错误都带非空 repair',
  )
  assert(report.errors.every((e) => e.code && e.field && e.message), '错误结构完整（code/field/message）')
}

/* ════════════════════════════════════════════════════════════════════════
 * [5] IR Delta：增量变更 + 修订归档（§17 / §10）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· IR Delta')
{
  const ws = mkWs()
  const saved = IR.saveIR(ws, { ...IR.normalizeIR(validIr()), id: '', provenance: { createdAt: new Date().toISOString(), source: 'proposal' } })
  const id = saved.id

  // 合法：update 既有字段 → 修订 2
  const d1 = IR.applyDelta(saved, {
    change: 'update_experiment',
    target: 'decision',
    operations: [{ update: { metric: ['decision_consistency'] } }],
    reason: 'metric too coarse',
  })
  assert(d1.ok === true, 'delta update 通过')
  if (d1.ok) {
    assertEq(d1.ir.revision, 2, '修订号 +1')
    assertEq(d1.ir.decision.metric, ['decision_consistency'], '字段被更新')
    const saved2 = IR.saveIR(ws, d1.ir)
    assert(!IR.isIRWriteError(saved2), '新修订落盘')
    assert(existsSync(join(ws, 'research/ir/.history/IR001.rev-001.json')), '旧修订归档进 .history')
    const old = IR.readIRRevision(ws, id, 1)
    assertEq(old?.decision.metric, ['top1_accuracy'], '旧修订可读且内容是旧值')
    assertEq(IR.listIRRevisions(ws, id), [1], '历史修订号列表')
  }

  // 非法：add 已存在字段 → R303
  const d2 = IR.applyDelta(saved, {
    change: 'add_note',
    target: 'decision',
    operations: [{ add: { objective: 'x' } }],
  })
  assert(d2.ok === false && d2.errors.some((e) => e.code === 'R303'), 'add 已存在字段被拒（R303）')

  // 非法：update 不存在字段 → R304
  const d3 = IR.applyDelta(saved, {
    change: 'update_x',
    target: 'decision',
    operations: [{ update: { nonExisting: 1 } }],
  })
  assert(d3.ok === false && d3.errors.some((e) => e.code === 'R304'), 'update 不存在字段被拒（R304）')

  // 非法：未知目标 → R301
  const d4 = IR.applyDelta(saved, { change: 'x', target: 'foo.bar', operations: [{ add: { a: 1 } }] })
  assert(d4.ok === false && d4.errors.some((e) => e.code === 'R301'), '未知目标被拒（R301）')

  // 合法：数组追加元素 + 元素级 update
  const d5 = IR.applyDelta(saved, {
    change: 'add_hypothesis',
    target: 'hypotheses',
    operations: [{ add: {}, items: [{ id: 'H03', statement: 'Capacity saturates at 0.6B.', observableOutcome: '1.5B does not beat 0.6B' }] }],
  })
  assert(d5.ok === true && d5.ir.hypotheses.length === 3, '数组追加元素')
  const d6 = IR.applyDelta(saved, {
    change: 'update_requirement',
    target: 'evidence_requirements.ER01',
    operations: [{ update: { description: 'tightened wording' } }],
  })
  assert(d6.ok === true && d6.ir.evidenceRequirements[0].description === 'tightened wording', '元素级 update')

  // 非法 delta 不产生新修订
  assertEq(IR.readIR(ws, id)?.revision, 2, '失败的 delta 不改盘上修订')
  rmSync(ws, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * [6] Transition：R2xx 拒绝非法推进 + S 链 / Trace（§8.3 / §9 / §18）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· State Transition')
{
  const ws = mkWs()
  const saved = IR.saveIR(ws, { ...IR.normalizeIR(validIr()), id: '', provenance: { createdAt: new Date().toISOString(), source: 'proposal' } })
  const id = saved.id

  // 证据与产物准备
  const e1 = EV.createEvidence(ws, { name: 'Control run', sourceKind: 'experiment', result: '0.307 vs 0.823' })
  assert(Boolean(e1 && e1.id === 'E001'), 'E001 证据建立')
  const c1 = CL.createClaim(ws, { statement: 'The structured state is the mechanism.' })
  assert(Boolean(c1 && c1.id === 'C001'), 'C001 主张建立')

  // R202：不存在的证据
  const t1 = IR.validateTransition(ws, { irId: id, satisfies: [{ requirement: 'ER01', evidence: 'E999' }] })
  hasCode(t1, 'R202', '要求被不存在的证据满足')

  // R204：不存在的要求
  const t2 = IR.validateTransition(ws, { irId: id, satisfies: [{ requirement: 'ER99', evidence: e1.id }] })
  hasCode(t2, 'R204', '引用不存在的证据要求')

  // R203：完成步没有产物
  const t3 = IR.validateTransition(ws, { irId: id, completed: [{ step: 'step-2' }] })
  hasCode(t3, 'R203', '完成步缺产物')

  // R205：过期修订
  const t4 = IR.validateTransition(ws, { irId: id, revision: 99 })
  hasCode(t4, 'R205', '基于过期修订推进')

  // R201：claim 标 supported 但无证据
  const t5 = IR.validateTransition(ws, { irId: id, claims: [{ claim: c1.id, status: 'supported' }] })
  hasCode(t5, 'R201', '主张无证据却标 supported')

  // 合法转移 1：step-1 完成（有产物）+ ER01 被 E001 满足
  mkdirSync(join(ws, 'experiments/dcr/data'), { recursive: true })
  writeFileSync(join(ws, 'experiments/dcr/data/split.json'), '{"seed":11}', 'utf8')
  const ok1 = IR.applyTransition(ws, {
    irId: id,
    revision: 1,
    satisfies: [{ requirement: 'ER01', evidence: e1.id }],
    completed: [{ step: 'step-1', artifact: 'experiments/dcr/data/split.json' }],
    agent: 'verify-research-ir',
    note: 'first transition',
  })
  assert(ok1.ok === true, '合法转移 1 通过')
  if (ok1.ok) {
    assertEq(ok1.state.stateId, 'S001', '首个状态 S001')
    assertEq(ok1.state.parentStateId, undefined, '首状态无父')
    assertEq(ok1.ir.revision, 2, '转移后修订 +1')
    assertEq(ok1.ir.evidenceRequirements[0].satisfiedBy, ['E001'], 'satisfies 写回 IR')
    assertEq(ok1.ir.plan.steps[0].status, 'completed', '完成状态写回 IR')
    assertEq(IR.readTrace(ws).length, 1, 'trace 追加一行')
    assertEq(ok1.state.pendingActions, ['step-2'], 'pendingActions 记录未完成步')
  }

  // 合法转移 2：E002 支持 C001 → claim 可标 supported；S002.parent = S001
  const e2 = EV.createEvidence(ws, { name: 'State ablation', sourceKind: 'experiment', supports: [c1.id], result: 'ablation drops to question-only' })
  assert(Boolean(e2 && e2.id === 'E002'), 'E002 证据建立（supports C001）')
  mkdirSync(join(ws, 'experiments/dcr/results'), { recursive: true })
  writeFileSync(join(ws, 'experiments/dcr/results/control.json'), '{"top1":0.221}', 'utf8')
  const ok2 = IR.applyTransition(ws, {
    irId: id,
    revision: 2,
    decisionId: 'D001',
    satisfies: [{ requirement: 'ER02', evidence: e2.id }],
    completed: [{ step: 'step-2', artifact: 'experiments/dcr/results/control.json' }],
    claims: [{ claim: c1.id, status: 'supported' }],
    agent: 'verify-research-ir',
    note: 'second transition',
  })
  assert(ok2.ok === true, '合法转移 2 通过')
  if (ok2.ok) {
    assertEq(ok2.state.stateId, 'S002', '第二个状态 S002')
    assertEq(ok2.state.parentStateId, 'S001', 'S002.parent = S001（provenance graph）')
    assertEq(ok2.state.decisionId, 'D001', '关联决策记入状态')
    assertEq(ok2.state.claimsUpdated, [{ claim: c1.id, status: 'supported' }], 'claim 裁定记入状态')
    assertEq(IR.readTrace(ws).length, 2, 'trace 两行')
    assertEq(IR.readTrace(ws)[1].parentStateId, 'S001', 'trace 带 parent 链')
  }

  // coverage（§11）：ER01 + ER02 各有在档证据 → 2/2
  const cov = IR.evidenceCoverage(ws, id)
  assert(cov.ok === true, 'coverage 可计算')
  if (cov.ok) {
    assertEq(cov.required, 2, '要求 2 项')
    assertEq(cov.satisfied, 2, '满足 2 项')
    assertEq(cov.coverage, 1, '覆盖率 1.0')
    assertEq(cov.items[0].inStore, ['E001'], 'ER01 的在档证据')
  }

  rmSync(ws, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * [7] coverage：部分满足 + 悬空引用
 * ════════════════════════════════════════════════════════════════════════ */
console.log('· Coverage 部分满足')
{
  const ws = mkWs()
  const base = validIr()
  const saved = IR.saveIR(ws, { ...IR.normalizeIR(base), id: '', provenance: { createdAt: new Date().toISOString(), source: 'proposal' } })
  const e1 = EV.createEvidence(ws, { name: 'Comparison', sourceKind: 'experiment', result: 'x' })
  // 直接构造：ER01 由 E001 满足；ER02 声称由 E999（悬空）满足
  const next = IR.readIR(ws, saved.id)
  next.evidenceRequirements[0].satisfiedBy = [e1.id]
  next.evidenceRequirements[1].satisfiedBy = ['E999']
  next.revision = 2
  IR.saveIR(ws, next)
  const cov = IR.evidenceCoverage(ws, saved.id)
  assert(cov.ok === true, 'coverage 计算成功')
  if (cov.ok) {
    assertEq(cov.satisfied, 1, '只有 ER01 真被满足')
    assertEq(cov.coverage, 0.5, '覆盖率 0.5')
    assertEq(cov.items[1].claimed, ['E999'], '悬空引用保留在 claimed')
    assertEq(cov.items[1].inStore, [], '悬空引用不计入 inStore')
    assertEq(cov.items[1].satisfied, false, '悬空引用不算满足')
  }
  rmSync(ws, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 汇总
 * ════════════════════════════════════════════════════════════════════════ */
console.log('')
if (failed) {
  console.log(`✗ verify-research-ir: ${failed} failed / ${passed + failed}`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ verify-research-ir: ${passed} passed`)
