/**
 * Phase 20 自检 — Diagram IR 的「并排泳道排布」与「线间最小间距」。
 *
 * 用法：
 *   node scripts/verify-diagram-lanes.mjs [path/to/fig-IR.json]
 *
 * 断言（全部从**布局模型**读，不靠肉眼）：
 *   A. `arrange: "lanes"`：两个顶层 group 并排（顶部对齐）、水平间距 ≈ group_gap、
 *      非分组节点全部排在两个泳道框之下。
 *   B. `edge_gap` 越界 clamp + `EDGE_TOO_CLOSE` 能被触发。
 *   C. 缺省（不带新字段）时几何与旧行为一致：新特性必须**只在显式声明时**生效。
 *
 * ⚠️ 默认走**自包含 fixture**，不读 `workspace/`：workspace 是运行数据，
 * 被 `.gitignore` 的「斜杠 + workspace 通配」规则排除，别人 clone 下来这个自检必然 ENOENT ——
 * 等于把"能否自检"绑在某台机器的本地数据上。要拿真实图跑，把路径当 `argv[2]` 传进来。
 */
import { readFileSync } from 'node:fs'
import { normalizeIr, inspectNormalized } from '../lib/research/diagram/index.js'

const LAYOUT_DIR = 'layout'
const GROUP_GAP = 110
const EDGE_GAP = 8

/**
 * 基础 IR：两条并排泳道 + 泳道外的前后节点。
 *
 * 结构刻意最小：两个顶层 group 各带两个成员，`q` 在泳道前、`tail` 在泳道后，
 * 这样 `arrange: "lanes"` 的三条几何断言（顶部对齐 / 水平间距 / 泳道外节点在下方）
 * 都有一手对象可测；同时保留跨泳道汇聚（`e_a`、`e_b` → `tail`），
 * 好让走线/标签诊断真的有机会触发。
 */
const FIXTURE_IR = {
  version: '1.0',
  type: 'method-overview',
  title: 'Lane fixture: two parallel lanes and a shared tail',
  layout: { direction: 'LR', algorithm: 'hierarchical' },
  nodes: [
    { id: 'q', type: 'input', label: 'Research question' },
    { id: 'h_a', type: 'process', label: 'Hypothesis A' },
    { id: 'e_a', type: 'result', label: 'Evidence A' },
    { id: 'h_b', type: 'process', label: 'Hypothesis B' },
    { id: 'e_b', type: 'result', label: 'Evidence B' },
    { id: 'tail', type: 'output', label: 'Paper draft' },
  ],
  groups: [
    { id: 'lane_a', label: 'Lane A', children: ['h_a', 'e_a'] },
    { id: 'lane_b', label: 'Lane B', children: ['h_b', 'e_b'] },
  ],
  edges: [
    { id: 'e1', source: 'q', target: 'h_a' },
    { id: 'e2', source: 'q', target: 'h_b' },
    { id: 'e3', source: 'h_a', target: 'e_a' },
    { id: 'e4', source: 'h_b', target: 'e_b' },
    { id: 'e5', source: 'e_a', target: 'tail' },
    { id: 'e6', source: 'e_b', target: 'tail' },
  ],
}

const irPath = process.argv[2]
const base = irPath ? JSON.parse(readFileSync(irPath, 'utf8')) : FIXTURE_IR
const clone = (o) => JSON.parse(JSON.stringify(o))

function run(ir) {
  const norm = normalizeIr(ir)
  if (norm.diagram === null) {
    console.log('  normalize errors:', norm.diagnostics.map((d) => `${d.code}: ${d.message}`).join(' | '))
    return null
  }
  const insp = inspectNormalized(norm.diagram)
  return { norm, insp }
}

function geom(res) {
  const lay = res.insp.layout
  const groupOf = new Map(res.insp.diagram.nodes.map((n) => [n.id, n.group]))
  const groups = lay.groups.map((g) => ({ id: g.id, label: g.label, rect: g.rect }))
  const nodes = lay.nodes.map((n) => ({ id: n.id, group: groupOf.get(n.id), rect: n.rect }))
  return { groups, nodes, width: lay.width, height: lay.height }
}

/** 全部 diagnostics（errors + warnings）的 code 列表。 */
function codesOf(res) {
  return [...res.insp.report.errors, ...res.insp.report.warnings].map((d) => d.code)
}

let failures = 0
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures += 1
}

/* ── A. arrange: lanes ─────────────────────────────────────────────── */
console.log('\n[A] arrange = "lanes"')
const lanesIr = clone(base)
lanesIr[LAYOUT_DIR] = { ...(base[LAYOUT_DIR] ?? {}), arrange: 'lanes', group_gap: GROUP_GAP, edge_gap: EDGE_GAP }
const lanes = run(lanesIr)
if (lanes === null) {
  failures += 1
} else {
  const { groups, nodes } = geom(lanes)
  const codes = codesOf(lanes)
  const plot = (d) => d.filter((g) => g.rect !== undefined)
  const laneA = plot(groups)[0]
  const laneB = plot(groups)[1]
  if (laneA === undefined || laneB === undefined) {
    check('two group boxes present', false, `found ${plot(groups).length}`)
  } else {
    const [l, r] = laneA.rect.x <= laneB.rect.x ? [laneA, laneB] : [laneB, laneA]
    check('lanes top-aligned (|Δy| ≤ 4)', Math.abs(l.rect.y - r.rect.y) <= 4, `Δy = ${(r.rect.y - l.rect.y).toFixed(2)}`)
    const gap = r.rect.x - (l.rect.x + l.rect.w)
    check(`horizontal gap ≈ group_gap (${GROUP_GAP} ±10%)`, Math.abs(gap - GROUP_GAP) <= GROUP_GAP * 0.1, `gap = ${gap.toFixed(1)}`)
    const laneBottom = Math.max(l.rect.y + l.rect.h, r.rect.y + r.rect.h)
    const inLane = new Set(nodes.filter((n) => n.group !== undefined).map((n) => n.id))
    const loose = nodes.filter((n) => !inLane.has(n.id))
    const looseTop = Math.min(...loose.map((n) => n.rect.y))
    check('non-group nodes below both lanes', looseTop >= laneBottom - 1, `lane bottom ${laneBottom.toFixed(1)} vs loose top ${looseTop.toFixed(1)} (${loose.map((n) => n.id).join(', ')})`)
  }
  check('no EDGE_OVERLAP', !codes.includes('EDGE_OVERLAP'))
  check('no EDGE_TOO_CLOSE', !codes.includes('EDGE_TOO_CLOSE'))
  check('no LABEL_OVERLAP', !codes.includes('LABEL_OVERLAP'))
  const { width, height } = geom(lanes)
  console.log(`  info: canvas ${width.toFixed(1)}×${height.toFixed(1)} → node text ≈ ${(516 / width * 14).toFixed(2)} pt @516pt (approx)`)
  console.log(`  info: diagnostics ${JSON.stringify(codes)}`)
}

/* ── B. edge_gap clamp + trigger ───────────────────────────────────── */
console.log('\n[B] edge_gap 越界与触发')
const clampIr = clone(base)
clampIr[LAYOUT_DIR] = { ...(base[LAYOUT_DIR] ?? {}), edge_gap: 999 }
const clamped = normalizeIr(clampIr)
const clampWarn = clamped.diagnostics.filter((d) => /edge_gap/.test(d.message))
check('edge_gap 越界被 clamp 并 warning', clampWarn.length > 0, clampWarn[0]?.message?.slice(0, 80))

/* ── C. 缺省 = 旧行为 ──────────────────────────────────────────────── */
console.log('\n[C] 缺省不改变既有几何')
const plain = run(clone(base))
if (plain === null) {
  failures += 1
} else {
  const codes = codesOf(plain)
  check('默认不产生 EDGE_TOO_CLOSE', !codes.includes('EDGE_TOO_CLOSE'))
  check('默认无 UNSUPPORTED_IN_MODE(arrange)', !codes.includes('UNSUPPORTED_IN_MODE'))
  const pg = geom(plain)
  console.log(`  info: 缺省 canvas ${pg.width.toFixed(1)}×${pg.height.toFixed(1)}`)
}

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAILURE(S) ❌`)
process.exit(failures === 0 ? 0 : 1)
