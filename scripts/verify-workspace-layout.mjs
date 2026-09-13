#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Workspace 布局一致性验证（对照 `v2-Workspace.md`）。
 *
 * 这是**数据文件规范**的验收测试：跑一遍完整研究流程，然后检查真实产物结构
 * 是否与规范一致（目录名、文件位置、边界）。
 *
 * 检查的核心结论：
 *   1. Research Definition 在**根目录**（project.md · research-state.md）；
 *   2. `outputs/` 用**复数目录名**且**每个成果一个子目录**（含 provenance.md）；
 *   3. Paper 在 `papers/<id>/` 且含 history/latex/figures，**不在 outputs/ 下**；
 *   4. 按需目录不会被凭空造出来（没有实验就没有 experiments/）；
 *   5. 边界：Skill Library 不在 workspace 内。
 *
 * 用法：
 *   node scripts/verify-workspace-layout.mjs packages/dsh-convfusion
 */
import { mkdtempSync, existsSync, readdirSync, rmSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const LAY = await import(lib('research/workspace-layout.js'))
const PROJ = await import(lib('research/project.js'))
const RS = await import(lib('research/research-state.js'))
const P = await import(lib('research/paper.js'))
const O = await import(lib('research/output.js'))
const EV = await import(lib('research/evidence.js'))
const CL = await import(lib('research/claims.js'))
const SK = await import(lib('research/skills.js'))

let passed = 0, failed = 0
const failures = []
const assert = (c, l) => { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ FAIL ${l}`) } }
const assertEq = (a, b, l) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`); assert(ok, l) }

const ws = mkdtempSync(join(tmpdir(), 'cf-ws-'))
const top = () => readdirSync(ws).filter((f) => !f.startsWith('.')).sort()
/**
 * 列出一个目录的内容（深度优先、目录在前，深度最多 3 层）。
 *
 * 早先的实现先按名字排序再递归，导致同一目录下的条目顺序混乱；这里改为
 * 先分「目录 / 文件」，各自按名字排序后再拼接。
 */
const tree = (rel, maxDepth = 3) => {
  const out = []
  const walk = (r, depth) => {
    const abs = r ? join(ws, r) : ws
    if (!existsSync(abs) || !statSync(abs).isDirectory() || depth > maxDepth) return
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries.filter((e) => !e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name))
    for (const d of dirs) {
      out.push(`${'  '.repeat(depth)}${d.name}/`)
      walk(r ? `${r}/${d.name}` : d.name, depth + 1)
    }
    for (const f of files) out.push(`${'  '.repeat(depth)}${f.name}`)
  }
  walk(rel, 0)
  return out
}

/** 只列一个目录的**直接**子项（目录带 `/`），按名字排序。 */
const children = (rel) => {
  const abs = rel ? join(ws, rel) : ws
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return []
  const entries = readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => `${e.name}/`).sort()
  const files = entries.filter((e) => !e.isDirectory()).map((e) => e.name).sort()
  return [...dirs, ...files]
}

/* ── 1. 规范清单自身 ─────────────────────────────────────────────── */
console.log('\n[1] 规范清单（v2-Workspace.md §2）')
{
  const entries = LAY.WORKSPACE_LAYOUT
  const paths = entries.map((e) => e.path)
  for (const want of [
    'project.md', 'research-state.md',
    'attachments', 'plans', 'experiments', 'harness', 'papers', 'outputs',
    'research', 'research/evidence', 'research/claims', 'research/decisions', 'research/state-history',
    'outputs/patents', 'outputs/reports', 'outputs/slides',
  ]) {
    assert(paths.includes(want), `清单含 ${want}`)
  }
  // §2：不能出现 workspace/ work_xxxxx/ skills/
  assert(!paths.some((p) => p.includes('work_')), '清单不含 work_xxxxx')
  assert(!paths.includes('skills'), '清单不含 skills（§16：Skill 不属于 Workspace）')
  assert(!paths.includes('workspace'), '不是 workspace/workspace 双层结构')
  // 五类数据都有
  const cats = new Set(entries.map((e) => e.category))
  for (const c of ['definition', 'inputs', 'assets', 'outputs', 'runtime']) assert(cats.has(c), `含 ${c} 类数据`)
}

/* ── 2. 建立研究工作区 ───────────────────────────────────────────── */
console.log('\n[2] 建立研究工作区（模拟 /research <topic>）')
{
  PROJ.saveProjectFile(ws, { topic: 'Cross-modal localization calibration', domain: 'Robotics' })
  LAY.ensureWorkspaceLayout(ws)
  RS.createResearchState(ws, { dimensions: { Problem: 'Calibration error under perception mismatch.' } })

  const t = top()
  assert(t.includes('project.md'), 'Research Definition: project.md 在根目录')
  assert(t.includes('research-state.md'), 'Research Definition: research-state.md 在根目录（不是 research/ 下）')
  assert(!existsSync(join(ws, 'research', 'research-state.md')), 'research-state.md **不在** research/ 下')
  assert(t.includes('plans'), '核心目录 plans/ 已建立')
  assert(t.includes('research'), '核心目录 research/ 已建立')
  assertEq(children('research'), ['claims/', 'decisions/', 'evidence/', 'state-history/'], 'research/ 含四个规范子目录')

  // §2：optional 目录**不该**被凭空造出来
  assert(!existsSync(join(ws, 'experiments')), '未做实验 → 没有 experiments/（按需产生）')
  assert(!existsSync(join(ws, 'attachments')), '无附件 → 没有 attachments/（按需产生）')
  assert(!existsSync(join(ws, 'harness')), '无运行记录 → 没有 harness/（按需产生）')

  // project.md 内容
  const proj = PROJ.loadProjectFile(ws)
  assertEq(proj.topic, 'Cross-modal localization calibration', 'project.md 可解析出研究主题')
  assertEq(proj.domain, 'Robotics', 'project.md 记录领域')
  assert(PROJ.hasProjectDefinition(ws), 'hasProjectDefinition 为真')

  // §2 最终结构里没有 research.json：workspace 路径本身就是研究身份
  assert(!existsSync(join(ws, 'research.json')), '不产生 research.json（§2 最终结构中没有它）')
}

/* ── 3. 研究资产 ─────────────────────────────────────────────────── */
console.log('\n[3] research/ 结构化资产')
{
  const e = EV.createEvidence(ws, { name: 'Calibration run', sourceKind: 'experiment', rawArtifacts: ['experiments/x/results/run.json'] })
  const c = CL.createClaim(ws, { statement: 'Calibration reduces error.' })
  EV.linkEvidenceToClaim(ws, e.id, c.id, 'supports')
  CL.reconcileClaimEvidence(ws, c.id)

  assert(existsSync(join(ws, 'research', 'evidence', `${e.id}.md`)), 'Evidence 落 research/evidence/E00N.md')
  assert(existsSync(join(ws, 'research', 'claims', `${c.id}.md`)), 'Claim 落 research/claims/C00N.md')
  assert(!existsSync(join(ws, 'research', 'evidence.json')), '不产生额外的聚合文件（规范未要求）')
}

/* ── 4. 实验工作空间（§6）────────────────────────────────────────── */
console.log('\n[4] experiments/（§6）')
{
  LAY.ensureExperimentLayout(ws, 'localization_calibration')
  assertEq(
    children('experiments/localization_calibration'),
    ['data/', 'figures/', 'results/', 'scripts/', 'src/'],
    '实验目录含 data/src/scripts/results/figures（§6）',
  )
  // 代码不是 Evidence（§6）
  assert(!existsSync(join(ws, 'research', 'evidence', 'src')), '实验代码不进入 research/evidence（代码 ≠ Evidence）')
}

/* ── 5. Paper（§8 / §9）─────────────────────────────────────────── */
console.log('\n[5] papers/（§8：Paper 是核心 Research Output）')
{
  P.createPaper(ws, { title: 'Cross-Modal Calibration' })
  const pt = children('papers/paper-main')
  for (const want of ['paper.md', 'metadata.md', 'history/', 'latex/', 'figures/']) {
    assert(pt.includes(want), `paper-main 含 ${want}`)
  }
  assert(existsSync(join(ws, 'papers', 'paper-main', 'paper.md')), 'paper.md 在 Paper 目录内')
  // §8：Paper **不在** outputs/ 下
  assert(!existsSync(join(ws, 'outputs', 'papers')), 'Paper 不在 outputs/ 下（§8 单独放 papers/）')
}

/* ── 6. Outputs（§10 / §14）─────────────────────────────────────── */
console.log('\n[6] outputs/（§10 复数目录 + §14 provenance）')
{
  const patent = O.createOutput(ws, { type: 'patent', title: 'Calibration method', source: { paper: 'paper-main', claims: ['C001'], evidence: ['E001'] } })
  const report = O.createOutput(ws, { type: 'technical-report', title: 'Reproduction report' })
  const slides = O.createOutput(ws, { type: 'slides', title: 'Group talk' })

  assertEq(children('outputs'), ['patents/', 'reports/', 'slides/'], 'outputs/ 用复数目录名（patents/reports/slides）')
  assert(!existsSync(join(ws, 'outputs', 'patent')), '不含单数目录 patent/')
  assert(!existsSync(join(ws, 'outputs', 'technical-report')), '不含 technical-report/（应为 reports/）')

  // §14：每个成果一个子目录，含主文档与 provenance
  const pdir = children(`outputs/patents/${patent.id}`)
  assert(pdir.includes('patent.md'), '成果主文档为 patent.md（§11：主文档不重复 id）')
  assert(pdir.includes('metadata.md'), '成果目录含 metadata.md（§11）')
  assert(pdir.includes('claims.md'), 'patent 目录含 claims.md（§11：Patent Claim ≠ Research Claim）')
  assert(pdir.includes('provenance.md'), '成果目录含 provenance.md（§14）')
  const prov = readFileSyncSafe(join(ws, 'outputs', 'patents', patent.id, 'provenance.md'))
  assert(prov.includes('Chain'), 'provenance.md 含追溯链')
  assert(prov.includes('C001') && prov.includes('E001'), 'provenance.md 记录 claims/evidence 引用')
  assert(prov.includes('paper-main'), 'provenance.md 记录来源 paper')

  // 三个类型都在各自目录下
  assert(existsSync(join(ws, 'outputs', 'reports', report.id, 'report.md')), 'Report 落 outputs/reports/<id>/report.md')
  assert(existsSync(join(ws, 'outputs', 'slides', slides.id, 'slides.md')), 'Slides 落 outputs/slides/<id>/slides.md')
  assert(existsSync(join(ws, 'outputs', 'slides', slides.id, 'assets')), 'Slides 目录含 assets/（§13）')

  // 注册表视图跨类型可读
  assert(O.listAllOutputs(ws).length === 3, '统一注册表可读全部 3 个成果（不含 Paper）')
  // §14 的依赖图能回答"谁依赖 C001"
  const map = O.buildOutputDependencyMap(ws)
  assert(map.some((d) => d.dependsOn === 'C001' && d.outputs.some((o) => o.id === patent.id)), '依赖图含 C001 → patent')
}

/* ── 7. 与规范的差异检查 ────────────────────────────────────────── */
console.log('\n[7] inspectWorkspace：与规范的一致性')
{
  const insp = LAY.inspectWorkspace(ws)
  assert(insp.isResearch, '识别为研究工作区')
  assertEq(insp.unexpectedOutputDirs, [], 'outputs/ 下无规范外的子目录')
  const coreDirsSpec = LAY.coreDirs()
  const missingCore = coreDirsSpec.filter((d) => !existsSync(join(ws, d)))
  assertEq(missingCore, [], `核心目录都已建立（${coreDirsSpec.join(', ')}）`)
  // 顶层不应出现 work_xxxxx / skills
  assert(!insp.unexpectedTopLevel.includes('work_x'), '无 work_xxxxx 顶层条目')
  // 完整树（供人工核对）
  console.log('\n  —— 最终 Workspace 结构 ——')
  for (const line of ['project.md', 'research-state.md', ...tree('', 0)]) {
    if (typeof line === 'string' && !line.startsWith('  ') && !line.endsWith('/')) continue
    console.log('    ' + line)
  }
  for (const d of ['plans', 'research', 'experiments', 'harness', 'papers', 'outputs', 'attachments']) {
    if (!existsSync(join(ws, d))) continue
    console.log(`    ${d}/`)
    for (const l of tree(d, 1)) console.log('      ' + l)
  }
}

/* ── 8. 边界（§16）───────────────────────────────────────────────── */
console.log('\n[8] 三个边界（§16）')
{
  // 第一：Skill 不属于 Workspace
  assert(!existsSync(join(ws, 'skills')), 'workspace 内没有 skills/（Skill 属系统能力层）')
  const root = SK.systemSkillRoot()
  assert(!root.startsWith(ws), `Skill Library 在包内而非 workspace（${root.replace(PKG, '<pkg>')}）`)

  // 第二：Plan 属于 Workspace
  const planMod = await import(lib('research/plan-library.js'))
  const plan = planMod.createPlan(ws, { name: 'Experiment Design' })
  assert(!planMod.isPlanWriteError(plan), 'Plan 可创建')
  assert(plan.relPath.startsWith('plans/'), 'Plan 落 workspace 的 plans/（§16 第二）')

  // 第三：Output 属于 Workspace
  assert(existsSync(join(ws, 'outputs')), 'Output 落 workspace 的 outputs/（§16 第三）')
}

function readFileSyncSafe(p) {
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

rmSync(ws, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '✅' : '❌'} workspace-layout: ${passed} passed, ${failed} failed`)
if (failed > 0) { console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n')); process.exit(1) }
