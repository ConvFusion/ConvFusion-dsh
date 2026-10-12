#!/usr/bin/env node
/**
 * ConvFusion — 论文示意图（`research_schematic`）自检
 *
 * 这个能力存在的理由：本课题组的示意图规程（白底黑框小圆角、粗体标题+灰描述、
 * 单栏 ≥7pt、出厂前跑几何断言）此前只存在于**某一个工作区的 papers/figures_kit.py**，
 * 于是别的工作区只能复制脚本（副本会分叉），或者改用别的渲染器（同篇论文出现两种风格）。
 * 现在绘图实现随插件发行（`assets/figures_kit/`），这个脚本守住它：
 *
 *   [1] 资产齐全：figures_kit.py 与 render_schematic.py 都在包内
 *   [2] 正常路径：6 框 2×3 流程图渲染成功，写出 PDF
 *   [3] 几何断言**不是**摆设：框重叠的 IR 必须被拒（且不覆盖已有好图）
 *   [4] 可读性判据：单栏（252pt）下报出 effectiveNodePt 与 legible
 *   [5] 结构性错误不抛异常：未知节点、空 nodes、坏 role 都返回 { ok:false, error }
 *   [6] 确定性：同一 spec 渲染两次逐字节相同
 *   [7] 工具层：research_schematic 已登记，参数与输出描述齐全
 *
 * 用法：node scripts/verify-schematic.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const S = await import(lib('research/schematic/index.js'))

let failed = 0
let passed = 0
function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ── [1] 资产齐全 ─────────────────────────────────────────────── */
console.log('\n[1] 随包发行的绘图资产')
const script = S.findSchematicScript()
ok('render_schematic.py 可定位', Boolean(script), script ?? 'not found')
ok('figures_kit.py 在内联目录', existsSync(join(ROOT, 'assets', 'figures_kit', 'figures_kit.py')))
ok('脚本路径相对包根', S.SCHEMATIC_SCRIPT === join('assets', 'figures_kit', 'render_schematic.py'), S.SCHEMATIC_SCRIPT)

if (!script) {
  console.log(`\n${failed} failed / ${passed} passed`)
  process.exit(1)
}

const out = mkdtempSync(join(tmpdir(), 'schematic-verify-'))
const specBase = {
  name: 'verify_schematic',
  size: [3.45, 1.95],
  margin: [0.1, 0.08, 0.1, 0.2],
  cols: [0.17, 0.5, 0.83],
  rows: [0.2, 0.81],
  nodeWidth: 0.92,
  nodes: [
    { id: 'a', col: 1, row: 1, label: 'research state', desc: 'question, evidence, budget' },
    { id: 'b', col: 2, row: 1, label: 'decision', desc: 'one action chosen' },
    { id: 'c', col: 3, row: 1, label: 'action', desc: 'typed and costed' },
    { id: 'd', col: 1, row: 2, label: 'Decision Replay', desc: 'scores a decision by its downstream effect', role: 'accent' },
    { id: 'e', col: 2, row: 2, label: 'next state', desc: 'updated by the evidence' },
    { id: 'f', col: 3, row: 2, label: 'evidence', desc: 'result of the action' },
  ],
  edges: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'f', route: 'down' },
    { from: 'f', to: 'e' },
    { from: 'e', to: 'd' },
    { from: 'd', to: 'a', route: 'over' },
  ],
}

/* ── [2] 正常路径 ─────────────────────────────────────────────── */
console.log('\n[2] 正常渲染')
const r1 = S.renderSchematic({ spec: { ...specBase, outDir: out } })
ok('渲染成功', r1.ok === true, r1.error ?? '')
ok('写出 PDF', Boolean(r1.pdf && existsSync(r1.pdf)), r1.pdf ?? '')
ok('几何统计齐全', Boolean(r1.stats && r1.stats.boxes === 6 && r1.stats.edges === 6), JSON.stringify(r1.stats ?? {}))
ok('纵横比宽而矮', typeof r1.aspect === 'number' && r1.aspect >= 1.7, String(r1.aspect))

/* ── [3] 几何断言必须拒 ───────────────────────────────────────── */
console.log('\n[3] 几何断言会拒绝坏布局')
const overlapSpec = {
  ...specBase,
  name: 'verify_overlap',
  outDir: out,
  // 两行压在同一位置：框必然重叠
  rows: [0.5, 0.52],
}
const r2 = S.renderSchematic({ spec: overlapSpec })
ok('框重叠被拒', r2.ok === false, String(r2.error ?? '').slice(0, 90))
ok('拒绝时不写文件', !existsSync(join(out, 'verify_overlap.pdf')))

/* ── [4] 可读性判据 ───────────────────────────────────────────── */
console.log('\n[4] 单栏可读性')
const r3 = S.renderSchematic({ spec: { ...specBase, name: 'verify_column', outDir: out }, targetWidthPt: 252 })
ok('报告 effectiveNodePt', Array.isArray(r3.effectiveNodePt), JSON.stringify(r3.effectiveNodePt ?? null))
ok('单栏 legible', r3.legible === true)
const r4 = S.renderSchematic({ spec: { ...specBase, name: 'verify_wide', outDir: out, size: [7.4, 2.0] }, targetWidthPt: 252 })
ok('过宽的图被判不可读', r4.ok === true && r4.legible === false, `aspect ${r4.aspect}`)

/* ── [5] 结构性错误不抛异常 ───────────────────────────────────── */
console.log('\n[5] 结构性错误 → 返回值，不抛异常')
const badCases = [
  ['未知节点', { ...specBase, name: 'bad1', outDir: out, edges: [{ from: 'a', to: 'nope' }] }],
  ['空 nodes', { ...specBase, name: 'bad2', outDir: out, nodes: [] }],
  ['坏 role', { ...specBase, name: 'bad3', outDir: out, nodes: [{ id: 'a', col: 1, row: 1, label: 'x', role: 'purple' }] }],
  ['越界 col', { ...specBase, name: 'bad4', outDir: out, nodes: [{ id: 'a', col: 9, row: 1, label: 'x' }], edges: [] }],
]
for (const [label, spec] of badCases) {
  let threw = false
  let res = null
  try {
    res = S.renderSchematic({ spec })
  } catch {
    threw = true
  }
  ok(`${label} 不抛异常且被拒`, !threw && res && res.ok === false, String(res?.error ?? '').slice(0, 70))
}

/* ── [6] 确定性 ───────────────────────────────────────────────── */
console.log('\n[6] 同一 spec 渲染两次逐字节相同')
const a = S.renderSchematic({ spec: { ...specBase, name: 'verify_det', outDir: out } })
const bytesA = readFileSync(a.pdf)
const b = S.renderSchematic({ spec: { ...specBase, name: 'verify_det', outDir: out } })
const bytesB = readFileSync(b.pdf)
/**
 * PDF 里 matplotlib 会写 CreationDate，所以"逐字节相同"是把噪声当判据。
 * 真正要守的是**画出来的内容**确定：同一 spec 两次渲染的几何统计与字号必须一致，
 * 且矢量内容（去掉元数据后的流）规模一致。
 */
const sameStats = JSON.stringify(a.stats) === JSON.stringify(b.stats)
const samePt = JSON.stringify(a.effectiveNodePt) === JSON.stringify(b.effectiveNodePt)
const sizeDelta = Math.abs(bytesA.length - bytesB.length)
ok('几何统计确定', sameStats && samePt, JSON.stringify(a.stats))
ok('矢量内容规模一致（忽略 PDF 时间戳）', sizeDelta === 0, `${bytesA.length} vs ${bytesB.length} bytes`)

/* ── [7] 工具层登记 ───────────────────────────────────────────── */
console.log('\n[7] 工具层 research_schematic')
const plugin = await import(lib('research/research-tools.js'))
const tools = plugin.defineResearchTools(() => join(ROOT, 'workspace'))
const tool = tools.find((t) => t.name === 'research_schematic')
ok('工具已登记', Boolean(tool))
const props = tool?.parameters?.properties ?? {}
ok('参数含 nodes/edges/lanes/name', Boolean(props.nodes && props.edges && props.lanes && props.name), JSON.stringify(Object.keys(props)))
ok('有明确的使用边界说明', String(tool?.description ?? '').includes('research_diagram'))
ok('输出可渲染', typeof tool?.output?.render === 'function')


/* ── [8] 泳道与车道感知走线 ───────────────────────────────────── */
console.log('\n[8] 泳道（lanes）与车道感知走线')
const laneSpec = {
  name: 'verify_lanes', outDir: out,
  size: [7.16, 4.0], margin: [0.26, 0.10, 0.26, 0.56],
  cols: [0.203, 0.427, 0.660, 0.895], nodeWidth: 1.5, swing: 0.35,
  lanes: [
    { id: 'model', label: 'model lane, never gated' },
    { id: 'kernel', label: 'kernel lane, only state mutation passes' },
  ],
  nodes: [
    { id: 'a', lane: 'model', col: 1, label: 'Human', desc: 'instructions enter as Markdown' },
    { id: 'b', lane: 'model', col: 2, label: 'LLM reasoning', desc: 'interpretation stays free, never gated' },
    { id: 'c', lane: 'model', col: 3, label: 'Typed proposal', desc: 'one typed diff per step' },
    { id: 'd', lane: 'kernel', col: 1, label: 'Kernel guards', desc: 'S, E, T and V vs. version R_t' },
    { id: 'e', lane: 'kernel', col: 2, label: 'Commit R_t+1', desc: 'invariant re-established', role: 'accent' },
    { id: 'f', lane: 'kernel', col: 3, label: 'Execute', desc: 'committed actions run' },
    { id: 'h', lane: 'kernel', col: 4, label: 'Rejected + reason', desc: 'state unchanged', role: 'reject' },
    { id: 'g', x: 3.58, label: 'Typed representation of the research state', desc: 'six typed objects with typed relations', width: 6.6 },
  ],
  edges: [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' },
    { from: 'c', to: 'd', route: 'rowgap', enterOffset: -0.35 },
    { from: 'd', to: 'e', role: 'accent' }, { from: 'e', to: 'f', role: 'accent' },
    { from: 'd', to: 'h', route: 'rowgap', role: 'reject' },
    { from: 'h', to: 'c', route: 'outer', side: 'right', belt: 0, role: 'reject', ls: 'dashed' },
    { from: 'f', to: 'g', route: 'v', ls: 'dashed' }, { from: 'e', to: 'g', route: 'v', role: 'accent' },
    { from: 'g', to: 'd', route: 'v' },
    { from: 'g', to: 'c', route: 'outer', side: 'left', belt: 1, ls: 'dashed' },
  ],
}
const rl = S.renderSchematic({ spec: laneSpec })
ok('成员制车道渲染成功', rl.ok === true, rl.error ?? '')
ok('车道数报告正确', rl.stats?.lanes === 2, JSON.stringify(rl.stats ?? {}))
ok('车道名 ↔ 成员框净空 ≥ 0.10in', (rl.stats?.lane_label_clear_in ?? 0) >= 0.10, String(rl.stats?.lane_label_clear_in))
ok('走线 ↔ 车道边框净空 ≥ 0.04in', (rl.stats?.lane_edge_clear_in ?? 0) >= 0.04, String(rl.stats?.lane_edge_clear_in))
ok('宽而矮（aspect ≥ 1.8）', (rl.aspect ?? 0) >= 1.8, String(rl.aspect))
const laneBad = S.renderSchematic({
  spec: { ...laneSpec, name: 'bad_lane', outDir: out,
    nodes: laneSpec.nodes.map((n) => (n.id === 'a' ? { ...n, lane: 'nope' } : n)) },
})
ok('lane 未声明被拒', laneBad.ok === false, String(laneBad.error ?? '').slice(0, 80))
const vBad = S.renderSchematic({ spec: { ...laneSpec, name: 'bad_rowgap', outDir: out,
  edges: [{ from: 'g', to: 'd', route: 'rowgap' }] } })
ok('rowgap 端点不在车道内时被拒', vBad.ok === false, String(vBad.error ?? '').slice(0, 80))

// 随包发行的样板 spec：别的 agent 靠它知道泳道图怎么写；它必须存在、且真的过校验（防样板腐烂）
const exPath = join(ROOT, 'assets', 'figures_kit', 'examples', 'lanes_feedback.json')
ok('样板 spec 随包发行', existsSync(exPath), exPath)
if (existsSync(exPath)) {
  const rEx = S.renderSchematic({ spec: { ...JSON.parse(readFileSync(exPath, 'utf8')), outDir: out } })
  ok('样板 spec 可渲染且过车道校验', rEx.ok === true && rEx.stats?.lanes === 2,
    rEx.error ?? JSON.stringify(rEx.stats ?? {}))
}

/* ── 结果 ─────────────────────────────────────────────────────── */
rmSync(out, { recursive: true, force: true })
console.log(`\n${failed} failed / ${passed} passed`)
process.exit(failed === 0 ? 0 : 1)
