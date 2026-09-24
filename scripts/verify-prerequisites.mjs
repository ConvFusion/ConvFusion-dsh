#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 技能前置依赖（嵌入式编排器）验证（离线）。
 *
 * 守住四件事：
 *
 *   1. **新信号有判定**：`resource-estimate`、`simulation-result` 都在词表内，
 *      且 `judgeSignal` 对它们有专门 case（不走 default）。
 *   2. **解析**：`parsePrerequisites` 取第一个 `requires:` 块；`/` = OR，多行 = AND；
 *      未知信号保留用于展示但不阻塞。
 *   3. **判定复用**：`research-process` 的阶段判定行为不变（`assessWithStages` 仍按
 *      原有 8 信号判定），且 `STAGE_SIGNALS` 仍可经 `research-process` 访问。
 *   4. **定制项**：`Prerequisites` 在 `CUSTOMIZABLE_SECTIONS` 里（用户可覆盖）。
 *   5. **定制覆盖真的生效**：用户写进 `Prerequisites` 的块**优先于**系统库的普适版
 *      （发布版放宽、研究者本地可收紧）。
 *
 * 用法：node scripts/verify-prerequisites.mjs .
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const SIG = await import(lib('research/stage-signals.js'))
const PRE = await import(lib('research/prerequisites.js'))
const PROC = await import(lib('research/research-process.js'))
const CUST = await import(lib('research/skill-customization.js'))
const LIB = await import(lib('research/library.js'))

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`)
  assert(ok, label)
}

console.log('\n[1] 新信号有判定（不走 default）')
{
  const ctx = SIG.buildSignalContext('.') // 空 workspace → 全部未落地
  // resource-estimate 与 simulation-result 在词表内
  assert(SIG.STAGE_SIGNALS.includes('resource-estimate'), 'resource-estimate 在词表内')
  assert(SIG.STAGE_SIGNALS.includes('simulation-result'), 'simulation-result 在词表内')
  // 空 workspace 下两信号都判「未落地」（有专门 case，evidence 文案非 default）
  const r = SIG.judgeSignal(ctx, 'resource-estimate')
  assert(!r.satisfied && !r.evidence.includes('该阶段未声明判定信号'), 'resource-estimate 空 ws 下未落地，且非 default 文案')
  const s = SIG.judgeSignal(ctx, 'simulation-result')
  assert(!s.satisfied && !s.evidence.includes('该阶段未声明判定信号'), 'simulation-result 空 ws 下未落地，且非 default 文案')
  // 原有 8 信号仍由 research-process 暴露（向后兼容）
  assert(PROC.STAGE_SIGNALS.includes('resource-estimate'), 'research-process 仍导出 STAGE_SIGNALS（含新信号）')
}

console.log('\n[2] 解析：取第一个 requires 块；/ = OR；多行 = AND')
{
  const content = [
    '## Prerequisites',
    '',
    '```text',
    'requires: literature-evidence | 先有文献证据',
    'requires: method-plan / resource-estimate | 方法或资源',
    '```',
  ].join('\n')
  const pre = PRE.parsePrerequisites(content)
  assert(Array.isArray(pre) && pre.length === 2, '解析出 2 行依赖')
  assertEq(pre[0].signals, ['literature-evidence'], '第 1 行单信号')
  assertEq(pre[1].signals, ['method-plan', 'resource-estimate'], '第 2 行 OR 信号组')
  assertEq(pre[0].note, '先有文献证据', '说明解析正确')
  // 取第一个块（第二个块的 requires 被忽略）
  const two = '```text\nrequires: claims\n```\n\n```text\nrequires: decisions\n```'
  const pre2 = PRE.parsePrerequisites(two)
  assert(Array.isArray(pre2) && pre2.length === 1 && pre2[0].signals[0] === 'claims', '只取第一个 requires 块')
  // 无块 → undefined
  assert(PRE.parsePrerequisites('no prerequisites here') === undefined, '无 requires 块 → undefined')
  // 说明缺省
  const noNote = PRE.parsePrerequisites('```text\nrequires: claims\n```')
  assert(noNote && noNote[0].note === '', '无说明 → note 为空串')
}

console.log('\n[3] 未知信号不阻塞（不造成假的未满足）')
{
  const content = '```text\nrequires: i-made-this-up\n```'
  const pre = PRE.parsePrerequisites(content)
  assert(pre && pre[0].signals[0] === 'i-made-this-up', '未知信号保留用于展示')
  const ctx = SIG.buildSignalContext('.')
  const statuses = PRE.assessPrerequisites([{ id: 'x', content }], ctx)
  assert(statuses[0].satisfied === true, '只有未知信号 → satisfied（不阻塞）')
  assert(statuses[0].unmet.length === 0, '只有未知信号 → 无 unmet')
}

console.log('\n[4] 评估：AND/OR 语义')
{
  const ctx = SIG.buildSignalContext('.') // 空_workspace → 已知信号全未落地
  const skills = [
    { id: 'and-skill', content: '```text\nrequires: claims\nrequires: decisions\n```' }, // 两行 AND
    { id: 'or-skill', content: '```text\nrequires: claims / decisions\n```' }, // 一行 OR
    { id: 'free-skill', content: 'no prerequisites' }, // 无前置
  ]
  const statuses = PRE.assessPrerequisites(skills, ctx)
  // AND：两行都未满足 → unmet=2
  assert(statuses[0].unmet.length === 2, 'AND 两行全未满足 → unmet=2')
  // OR：一行内两信号都未满足 → unmet=1（整行算一条）
  assert(statuses[1].unmet.length === 1, 'OR 一行全未满足 → unmet=1')
  // 无前置 → satisfied
  assert(statuses[2].satisfied === true && statuses[2].unmet.length === 0, '无前置 → satisfied')
}

console.log('\n[5] 阶段判定行为（research-process 按固定 8 信号判定）')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-pre-'))
  try {
    // 空 workspace：阶段 1（提出话题）未落地（无 research/topics.md）
    const a = PROC.assessResearchProcess(ws)
    assert(a.current !== undefined, '空 ws 有当前阶段缺口')
    assert(a.stages.length === 8, '默认 8 阶段')
    assert(a.current?.stage.id === 'topics', '空 ws 当前阶段是提出话题（问题随主题在检索之后确定）')
    // 写入阶段 1 的真实落地物：研究话题落盘文件
    mkdirSync(join(ws, 'research'), { recursive: true })
    writeFileSync(join(ws, 'research', 'topics.md'), '# Research Topics\n\n- 一个松散的研究话题\n')
    const b = PROC.assessResearchProcess(ws)
    assert(b.stages[0].satisfied === true, '有 research/topics.md → 提出话题阶段落地')
    assert(b.stages[0].evidence.includes('条研究话题'), '提出话题证据文案可核查')
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
}

console.log('\n[6] 定制项')
{
  assert(CUST.CUSTOMIZABLE_SECTIONS.includes('Prerequisites'), 'Prerequisites 在 CUSTOMIZABLE_SECTIONS')
}

console.log('\n[7] 定制层可覆盖 Prerequisites（用户块优先 → 发布版可被本地收紧）')
{
  const empty = CUST.createMemoryCustomizationStore()
  const base = PRE.parsePrerequisites(LIB.effectiveSkillContentById('baseline-selection', empty))
  assertEq(
    base?.map((l) => l.signals.join('/')),
    ['method-plan'],
    '基线（普适版）：baseline-selection 只要求 method-plan',
  )

  const store = CUST.createMemoryCustomizationStore()
  store.set(
    'baseline-selection',
    'Prerequisites',
    ['```text', 'requires: method-plan | 基线要与方法可比', 'requires: fulltext-analyzed | 选 SOTA 基线必须读全文', '```'].join('\n'),
  )
  const custom = PRE.parsePrerequisites(LIB.effectiveSkillContentById('baseline-selection', store))
  assertEq(
    custom?.map((l) => l.signals.join('/')),
    ['method-plan', 'fulltext-analyzed'],
    '定制后：用户块覆盖基线（收紧为两行 AND）',
  )

  // 收紧后的判定真的会拦住（空 workspace 下 fulltext-analyzed 未落地）
  const ws = mkdtempSync(join(tmpdir(), 'cf-pre7-'))
  try {
    const st = PRE.assessPrerequisitesForSkill(ws, {
      id: 'baseline-selection',
      content: LIB.effectiveSkillContentById('baseline-selection', store),
    })
    assert(st.satisfied === false, '定制后的前置在空 ws 下未满足（不是只改了展示）')
    assert(
      PRE.renderUnmetPrerequisites(st).includes('fulltext-analyzed'),
      '未满足项含定制新增的 fulltext-analyzed',
    )
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('Failures:', failures)
  process.exit(1)
}
