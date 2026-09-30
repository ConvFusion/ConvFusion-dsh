#!/usr/bin/env node
/**
 * ConvFusion — C08P07 `paper-diagrams` 自检（v0.5.5）
 *
 * 覆盖 dev-note《v0.5.5-C08P07-paper-diagrams.md》§40 的七个测试，外加这个仓库里
 * 同类能力都要守的几条：
 *
 *   [1] 技能登记：C08P07 = paper-diagrams，且 C08 编号顺序为"选图 → 配图 → 修订 → 编译"
 *   [2] IR 结构：节点/组/边/样式 token/layout 的表达能力（§9–§15）
 *   [3] Test 1 简单流程 · Test 2 分支 · Test 3 Group（§40）
 *   [4] Test 4 复杂网络：residual + 多分支 + 嵌套 group + 画布扩张（§40）
 *   [5] Test 5 非法 IR：结构化 diagnostics，一个都不能少、一个都不能崩（§22/§23/§40）
 *   [6] Test 6 Repair：按 diagnostic 修 → 变有效；且校验器不是"什么都放行"
 *   [7] Test 7 Determinism：同一 IR 渲染 10 次逐字节相同（§16/§40）
 *   [8] 落盘与 last-good：坏 IR 不覆盖好图（§25/§37）
 *   [9] 工具层 research_diagram：动作齐全、能编排、坏输入不抛异常
 *
 * 用法：node scripts/verify-paper-diagrams.mjs
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = (f) => pathToFileURL(join(ROOT, 'lib', f)).href

const D = await import(lib('research/diagram/index.js'))
const CODES = await import(lib('research/skill-codes.js'))
const SKILLS = await import(lib('research/skills.js'))
const TAX = await import(lib('research/taxonomy.js'))
const T = await import(lib('research/research-tools.js'))

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
  if (Object.is(actual, expect)) passed++
  else {
    failed++
    failures.push(label)
    console.log(`  ✗ FAIL ${label}\n    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  }
}
const codes = (report) => [...report.errors, ...report.warnings].map((d) => d.code)

/**
 * 找出"被容器圈住、却不是它成员"的节点。
 *
 * 这是**泳道化**那条设计的守门断言：容器框的纵向范围必须正好是自己的泳道带，
 * 不能压到相邻泳道的节点上。它替代"肉眼看图"——看不到图的时候，这条断言证明
 * "读者能把哪些盒子归到 Encoder 里"这件事在图上是成立的。
 */
function foreignNodesInsideGroups(layout) {
  const memberOf = (groupId) => {
    const out = new Set()
    const walk = (id) => {
      const g = layout.groupById.get(id)
      if (!g) return
      for (const m of g.members) {
        if (layout.nodeById.has(m)) out.add(m)
        else walk(m)
      }
    }
    walk(groupId)
    return out
  }
  const bad = []
  for (const g of layout.groups) {
    const members = memberOf(g.id)
    for (const n of layout.nodes) {
      if (members.has(n.id)) continue
      const a = g.rect
      const b = n.rect
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        bad.push(`${n.id} inside ${g.id}`)
      }
    }
  }
  return bad
}

/* ══════════════════════════════════════════════════════════════════════
 * [1] 技能登记
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[1] 技能登记 C08P07')
{
  const docs = SKILLS.listSystemSkills()
  const doc = docs.find((d) => d.id === 'paper-diagrams')
  assert(doc !== undefined, 'paper-diagrams 在系统技能库里')
  assertEq(CODES.skillCode('paper-diagrams'), 'C08P07', '编号 = C08P07')
  assertEq(CODES.skillLabel('paper-diagrams'), '论文配图', '中文名 = 论文配图')
  assertEq(doc?.category, 'academic-writing/paper-diagrams', 'frontmatter category 与 taxonomy 一致')
  assertEq(doc?.type, 'system', 'type = system')
  assertEq(doc?.status, 'active', 'status = active')

  // 位置：C08P06（选图表）之后、C08P08（手稿修订）之前
  assertEq(CODES.skillCode('visual-evidence-selection'), 'C08P06', '前一个技能仍是 C08P06')
  assertEq(CODES.skillCode('manuscript-revision'), 'C08P08', '手稿修订顺移到 C08P08')
  assertEq(CODES.skillCode('submission-compile-and-format'), 'C08P09', '投稿编译顺移到 C08P09')
  assertEq(CODES.skillCode('presentation-design'), 'C08P12', '演讲设计顺移到 C08P12')

  const c08 = docs.filter((d) => (d.category ?? '').startsWith('academic-writing')).map((d) => CODES.skillCode(d.id))
  assertEq(
    c08.join(','),
    'C08P01,C08P02,C08P03,C08P04,C08P05,C08P06,C08P07,C08P08,C08P09,C08P10,C08P11,C08P12',
    'C08 编号连续且顺序正确',
  )
  const v = CODES.validateSkillCodes(docs.map((d) => d.id))
  assertEq(v.ok, true, '编号表整体校验通过')
  assertEq(v.duplicates.length, 0, '没有重复编号')

  // taxonomy：叶子分类已登记，且能由 frontmatter 的 category 反查回来
  const leafIds = TAX.SYSTEM_CATEGORIES.map((c) => c.id)
  assert(leafIds.includes('academic-writing/paper-diagrams'), 'taxonomy 分类树已登记 paper-diagrams')
  assertEq(TAX.normalizeCategoryId('academic-writing/paper-diagrams'), 'academic-writing/paper-diagrams', 'category 反查命中')
  assertEq(TAX.categoryGroup('academic-writing/paper-diagrams'), 'academic-writing', '归入 academic-writing 大类')
  // 顺序：taxonomy 里排在 visual-evidence-selection 之后
  const c08LeafIds = TAX.SYSTEM_CATEGORIES.filter((c) => c.id.startsWith('academic-writing/')).map((c) => c.id)
  assertEq(
    c08LeafIds.indexOf('academic-writing/paper-diagrams'),
    c08LeafIds.indexOf('academic-writing/visual-evidence-selection') + 1,
    'taxonomy 里排在 visual-evidence-selection 之后',
  )

  // 技能正文关键约束必须写进去（这些是"图能画对"的方法前提）
  const body = readFileSync(join(ROOT, 'skills', 'academic-writing', 'paper-diagrams.md'), 'utf8')
  assert(/requires: method-plan/.test(body), '前置依赖 = method-plan')
  assert(/Maximum|minimum sufficient|Minimum sufficient/i.test(body), '含"最小充分表示"原则')
  assert(/Never hand-write SVG|never writes SVG|does not write SVG/i.test(body) || /never write SVG/i.test(body), '明确禁止手写 SVG')
  for (const section of ['## Purpose', '## When to Use', '## Prerequisites', '## Research Method', '## Reasoning Guidance', '## Evidence Requirements', '## Expected Output']) {
    assert(body.includes(section), `含可定制章节 ${section}`)
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * [2] IR 表达能力
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[2] Diagram IR 结构')
{
  assertEq(D.DIAGRAM_TYPES.length, 7, '7 种图类型（§7）')
  assertEq(D.NODE_TYPES.length, 10, '10 种 node 角色（§10）')
  assertEq(D.EDGE_TYPES.length, 6, '6 种 edge 关系（§12）')
  assertEq(D.STYLE_TOKENS.length, 11, '11 个样式 token（§14）')
  assertEq(D.LAYOUT_DIRECTIONS.join(','), 'LR,RL,TB,BT', '4 个方向（§15）')
  assert(D.DIAGRAM_TYPES.includes('method-overview'), '含 method-overview')
  assert(!D.DIAGRAM_TYPES.includes('mindmap'), '不含 mindmap（§7 明确排除）')
  assert(!D.DIAGRAM_TYPES.includes('statistical-chart'), '不含统计图表（属于结果图，不属于本技能）')
  assertEq(D.MAX_REPAIR_ROUNDS, 3, '修复循环上限 = 3（§24）')

  // styles 可以给节点/边/组指定默认 token
  const withStyles = {
    type: 'workflow',
    styles: { node: 'process', edge: 'control-flow', group: 'container' },
    nodes: [
      { id: 's1', type: 'process', label: 'Step 1' },
      { id: 's2', type: 'process', label: 'Step 2' },
    ],
    edges: [{ source: 's1', target: 's2' }],
  }
  const insp = D.inspectDiagram(withStyles)
  assertEq(insp.report.valid, true, 'styles 默认 token 合法')
  assertEq(insp.diagram?.styleDefaults.node, 'process', 'styles.node 被记录')
  assertEq(insp.diagram?.nodes[0].style, 'process', 'node 继承默认样式')

  // 边不带 id → 合成稳定 id
  const noId = D.normalizeIr({
    type: 'workflow',
    nodes: [{ id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' }],
    edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
  })
  assertEq(noId.diagram?.edges.map((e) => e.id).join(','), 'e1,e2', '缺省 id 按声明顺序合成')
}

/* ══════════════════════════════════════════════════════════════════════
 * [3] Test 1 / 2 / 3
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[3] Test 1 简单流程 · Test 2 分支 · Test 3 Group')
const simpleFlow = {
  version: '1.0',
  type: 'workflow',
  title: 'Simple Flow',
  nodes: [
    { id: 'input', type: 'input', label: 'Input' },
    { id: 'processing', type: 'process', label: 'Processing' },
    { id: 'output', type: 'output', label: 'Output' },
  ],
  edges: [
    { id: 'e1', source: 'input', target: 'processing' },
    { id: 'e2', source: 'processing', target: 'output' },
  ],
}
{
  const build = D.buildDiagram(simpleFlow)
  assertEq(build.report.valid, true, 'Test 1: 简单流程校验通过')
  assert(build.svg !== null, 'Test 1: 产出 SVG')
  assertEq(build.layout?.nodes.length, 3, 'Test 1: 三个 Node')
  assertEq(build.layout?.edges.length, 2, 'Test 1: 两条 Edge')
  assertEq(build.layout?.nodes.map((n) => n.layer).join(','), '0,1,2', 'Test 1: LR 逐层推进')

  const nodes = build.layout.nodes
  let overlapped = false
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].rect
      const b = nodes[j].rect
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlapped = true
    }
  }
  assertEq(overlapped, false, 'Test 1: 无重叠')
  assert(build.layout.width > 0 && build.layout.height > 0, 'Test 1: 画布尺寸有效')
  assert(build.svg.startsWith('<svg ') && build.svg.trimEnd().endsWith('</svg>'), 'Test 1: SVG 首尾完整')
  assert (/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(build.svg), 'Test 1: SVG 带 xmlns（自包含）')
  assert((build.svg.match(/class="cf-node /g) ?? []).length === 3, 'Test 1: SVG 里恰好 3 个节点')
  assert(!/NaN|undefined|Infinity/.test(build.svg), 'Test 1: SVG 不含 NaN/undefined')
}

const branch = {
  type: 'module-structure',
  title: 'Branch and Fuse',
  nodes: [
    { id: 'input', type: 'input', label: 'Input' },
    { id: 'branch-a', type: 'module', label: 'Branch A' },
    { id: 'branch-b', type: 'module', label: 'Branch B' },
    { id: 'fusion', type: 'module', label: 'Fusion' },
    { id: 'output', type: 'output', label: 'Output' },
  ],
  edges: [
    { id: 'e1', source: 'input', target: 'branch-a' },
    { id: 'e2', source: 'input', target: 'branch-b' },
    { id: 'e3', source: 'branch-a', target: 'fusion' },
    { id: 'e4', source: 'branch-b', target: 'fusion' },
    { id: 'e5', source: 'fusion', target: 'output' },
  ],
}
{
  const build = D.buildDiagram(branch)
  assertEq(build.report.valid, true, 'Test 2: 分支图校验通过')
  const byId = build.layout.nodeById
  assertEq(byId.get('input').layer, 0, 'Test 2: Input 在第 0 层')
  assertEq(byId.get('branch-a').layer, 1, 'Test 2: Branch A 在第 1 层')
  assertEq(byId.get('branch-b').layer, 1, 'Test 2: Branch B 与 A 同层')
  assertEq(byId.get('fusion').layer, 2, 'Test 2: Fusion 在第 2 层')
  // 两条分支在同一层 → 沿流方向的坐标一致；Fusion 对齐在两支之间
  const uOf = (n) => (n.rect.x + n.rect.w / 2)
  assertEq(Math.round(uOf(byId.get('branch-a'))), Math.round(uOf(byId.get('branch-b'))), 'Test 2: 两条分支对齐')
  const fuseY = byId.get('fusion').rect.y + byId.get('fusion').rect.h / 2
  const aY = byId.get('branch-a').rect.y + byId.get('branch-a').rect.h / 2
  const bY = byId.get('branch-b').rect.y + byId.get('branch-b').rect.h / 2
  assert(fuseY > Math.min(aY, bY) && fuseY < Math.max(aY, bY), 'Test 2: Fusion 落在两分支之间')
  // 走线不穿盒子（正交走线只在层间空隙里转弯）
  for (const e of build.layout.edges) assertEq(e.crossesNode, false, `Test 2: 边 ${e.id} 不穿盒`)
}

const grouped = {
  type: 'architecture',
  title: 'Encoder Group',
  nodes: [
    { id: 'input', type: 'input', label: 'Input' },
    { id: 'backbone', type: 'module', label: 'Backbone', group: 'encoder' },
    { id: 'fusion', type: 'module', label: 'Feature Fusion', group: 'encoder' },
    { id: 'head', type: 'output', label: 'Prediction Head' },
  ],
  groups: [{ id: 'encoder', label: 'Encoder', children: ['backbone', 'fusion'] }],
  edges: [
    { id: 'e1', source: 'input', target: 'encoder' },
    { id: 'e2', source: 'backbone', target: 'fusion' },
    { id: 'e3', source: 'encoder', target: 'head' },
  ],
}
{
  const build = D.buildDiagram(grouped)
  assertEq(build.report.valid, true, 'Test 3: Group 图校验通过')
  const group = build.layout.groupById.get('encoder')
  assert(group !== undefined, 'Test 3: group 容器被放置')
  const bb = build.layout.nodeById.get('backbone').rect
  const ff = build.layout.nodeById.get('fusion').rect
  // padding：容器把两个成员都包住，且四周留出 groupPadding
  assert(group.rect.x <= Math.min(bb.x, ff.x) - D.LAYOUT.groupPadding + 0.01, 'Test 3: 左侧留出 padding')
  assert(
    group.rect.x + group.rect.w >= Math.max(bb.x + bb.w, ff.x + ff.w) + D.LAYOUT.groupPadding - 0.01,
    'Test 3: 右侧留出 padding',
  )
  assert(group.rect.y < Math.min(bb.y, ff.y), 'Test 3: 顶部留出标签带')
  assert((build.svg.match(/cf-group/g) ?? []).length >= 1, 'Test 3: SVG 里有容器')
  assert(build.svg.includes('>Encoder</text>'), 'Test 3: 容器标签出现在 SVG 里')
  // 边指向 group：箭头停在容器边框，而不是画进容器
  const toGroup = build.layout.edges.find((e) => e.id === 'e1')
  const end = toGroup.points[toGroup.points.length - 1]
  assertEq(Math.round(end.x), Math.round(group.rect.x), 'Test 3: 指向 group 的边停在容器左边界')
  const fromGroup = build.layout.edges.find((e) => e.id === 'e3')
  assertEq(Math.round(fromGroup.points[0].x), Math.round(group.rect.x + group.rect.w), 'Test 3: 从 group 出发的边起于容器右边界')
  // group 成员同时用 node.group 和 group.children 两种写法声明 → 不冲突
  assertEq(codes(build.report).includes('GROUP_MEMBERSHIP_CONFLICT'), false, 'Test 3: 两种成员写法不冲突')

  // ⭐ 容器**不得**圈住非成员（泳道化的回归点）：
  // 曾经的实现只在成员外接矩形上加 padding，于是跨层的 Encoder 框会把 Input / Prediction
  // 一起圈进去（实测报过两次 GROUP_OVERLAPS_FOREIGN_NODE）。现在每个 group 独占一条泳道。
  assertEq(codes(build.report).includes('GROUP_OVERLAPS_FOREIGN_NODE'), false, 'Test 3: 容器没有圈住非成员')
  assert(foreignNodesInsideGroups(build.layout).length === 0, `Test 3: 几何上也没有外来节点落在容器里${foreignNodesInsideGroups(build.layout).join('; ')}`)
}

/* ══════════════════════════════════════════════════════════════════════
 * [4] Test 4 复杂网络
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[4] Test 4 复杂网络（residual + 多分支 + 嵌套 group + 画布扩张）')
const complex = {
  type: 'architecture',
  title: 'Complex Network',
  canvas: { width: 200, height: 120 },
  nodes: [
    { id: 'input', type: 'input', label: 'Input' },
    { id: 'conv1', type: 'module', label: 'Conv Block 1', group: 'stage1' },
    { id: 'conv2', type: 'module', label: 'Conv Block 2', group: 'stage2' },
    { id: 'branch-a', type: 'process', label: 'Attention' },
    { id: 'branch-b', type: 'process', label: 'Gating' },
    { id: 'fusion', type: 'model', label: 'Feature Fusion', group: 'stage2' },
    { id: 'head', type: 'output', label: 'Prediction Head' },
    { id: 'loss', type: 'loss', label: 'Loss' },
  ],
  groups: [
    { id: 'backbone', label: 'Backbone', children: ['stage1', 'stage2'] },
    { id: 'stage1', label: 'Stage 1', children: ['conv1'] },
    { id: 'stage2', label: 'Stage 2', children: ['conv2', 'fusion'] },
  ],
  edges: [
    { id: 'e1', source: 'input', target: 'conv1' },
    { id: 'e2', source: 'conv1', target: 'conv2' },
    { id: 'e3', source: 'conv1', target: 'fusion', type: 'residual', label: 'skip' },
    { id: 'e4', source: 'conv2', target: 'branch-a' },
    { id: 'e5', source: 'conv2', target: 'branch-b' },
    { id: 'e6', source: 'branch-a', target: 'fusion' },
    { id: 'e7', source: 'branch-b', target: 'fusion' },
    { id: 'e8', source: 'fusion', target: 'head' },
    { id: 'e9', source: 'head', target: 'loss' },
    { id: 'e10', source: 'loss', target: 'conv2', type: 'feedback', label: 'grad' },
  ],
}
{
  const build = D.buildDiagram(complex)
  assertEq(build.report.valid, true, `Test 4: 复杂图校验通过（errors=${build.report.errors.map((e) => e.code).join(',')}）`)
  assertEq(build.layout.nodes.length, 8, 'Test 4: 八个节点都被放置')
  assertEq(build.layout.groups.length, 3, 'Test 4: 三个容器（含嵌套）')
  const backbone = build.layout.groupById.get('backbone')
  const stage1 = build.layout.groupById.get('stage1')
  assert(
    backbone.rect.x <= stage1.rect.x && backbone.rect.y <= stage1.rect.y &&
      backbone.rect.x + backbone.rect.w >= stage1.rect.x + stage1.rect.w &&
      backbone.rect.y + backbone.rect.h >= stage1.rect.y + stage1.rect.h,
    'Test 4: 外层 group 真包住内层 group',
  )
  // 成环的 feedback 边：不阻断分层，但要报出来
  assert(codes(build.report).includes('CYCLE_DETECTED'), 'Test 4: 反馈回边被识别并提示')
  const layers = Object.fromEntries(build.layout.nodes.map((n) => [n.id, n.layer]))
  assert(layers.conv1 < layers.fusion, 'Test 4: 残差边的起点在终点之前')
  // 画布扩张：请求 200×120 装不下 → 警告 + 实际画布更大
  assert(codes(build.report).includes('CANVAS_TOO_SMALL'), 'Test 4: 请求的画布过小被报出')
  assert(build.layout.width > 200 && build.layout.height > 120, 'Test 4: 画布自动扩张')
  for (const e of build.layout.edges) assertEq(e.crossesNode, false, `Test 4: 边 ${e.id} 不穿盒`)
  assertEq(codes(build.report).includes('GROUP_OVERLAPS_FOREIGN_NODE'), false, 'Test 4: 嵌套容器都没圈住非成员')
  assert(foreignNodesInsideGroups(build.layout).length === 0, `Test 4: 几何上也没有外来节点落在容器里${foreignNodesInsideGroups(build.layout).join('; ')}`)
  assert(build.svg.includes('marker-end="url(#cf-arrow-residual)"'), 'Test 4: 残差边用独立箭头样式')
  assert(build.svg.includes('stroke-dasharray'), 'Test 4: 回边/残差边是虚线（读者不会误读成主流程）')

  // 坐标不在 IR 里：写了 x/y 也不该被采纳
  const withXY = { ...simpleFlow, nodes: simpleFlow.nodes.map((n) => ({ ...n, x: 9999, y: 9999 })) }
  const xyBuild = D.buildDiagram(withXY)
  assert(xyBuild.layout.nodes.every((n) => n.rect.x < 9999), 'IR 里的 x/y 被忽略（坐标是布局的产物）')
}

/* ══════════════════════════════════════════════════════════════════════
 * [5] Test 5 非法 IR
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[5] Test 5 非法 IR → 结构化 diagnostics')
const broken = {
  type: 'not-a-type',
  nodes: [
    { id: 'a', type: 'module', label: 'A' },
    { id: 'a', type: 'wizard', label: 'A again' },
    { id: 'b', type: 'module' },
    { id: 'c', type: 'module', label: 'C', style: 'neon' },
    { id: 'd', type: 'module', label: 'D', group: 'ghost' },
  ],
  groups: [{ id: 'g', label: 'G', children: ['nope', 'a'] }],
  edges: [
    { id: 'e1', source: 'a', target: 'zzz' },
    { id: 'e2', target: 'a' },
    { id: 'e3', source: 'a', target: 'a' },
  ],
  labels: [{ id: 'L', text: 'x', anchor: 'nope' }],
}
{
  const build = D.buildDiagram(broken)
  assertEq(build.report.valid, false, 'Test 5: 非法 IR 判为无效')
  assertEq(build.svg, null, 'Test 5: 非法 IR 不产出 SVG（坏图出不了门）')
  const found = codes(build.report)
  for (const code of [
    'UNKNOWN_DIAGRAM_TYPE',
    'DUPLICATE_ID',
    'UNKNOWN_NODE_TYPE',
    'MISSING_FIELD',
    'UNKNOWN_STYLE_TOKEN',
    'UNKNOWN_GROUP_MEMBER',
    'MISSING_TARGET',
    'MISSING_SOURCE',
    'SELF_EDGE',
    'UNKNOWN_LABEL_ANCHOR',
  ]) {
    assert(found.includes(code), `Test 5: 报出 ${code}`)
  }
  for (const d of [...build.report.errors, ...build.report.warnings]) {
    assert(typeof d.code === 'string' && typeof d.message === 'string' && (d.severity === 'error' || d.severity === 'warning'), `Test 5: 诊断 ${d.code} 结构完整`)
  }

  // 空/畸形输入：一律结构化报错，绝不抛异常（工具层靠这个保持"能回话"）
  for (const junk of [null, undefined, 42, 'nope', [], {}, { nodes: [] }, { nodes: 'x' }, { type: 'workflow' }]) {
    let threw = null
    let out = null
    try {
      out = D.buildDiagram(junk)
    } catch (e) {
      threw = e
    }
    assert(threw === null, `Test 5: 输入 ${JSON.stringify(junk)} 不抛异常`)
    assert(out !== null && out.report.valid === false && out.svg === null, `Test 5: 输入 ${JSON.stringify(junk)} 报无效且无 SVG`)
  }

  // 组嵌套超过两层
  const deep = D.inspectDiagram({
    type: 'architecture',
    nodes: [{ id: 'n', type: 'module', label: 'N', group: 'g3' }],
    groups: [
      { id: 'g1', label: 'G1', children: ['g2'] },
      { id: 'g2', label: 'G2', children: ['g3'] },
      { id: 'g3', label: 'G3', children: ['n'] },
    ],
  })
  assert(codes(deep.report).includes('GROUP_NESTING_TOO_DEEP'), 'Test 5: 嵌套过深被报出')

  // 空泛标签（§27：凭空加 "AI Module" / "Optimization" 这一类）
  const vague = D.inspectDiagram({
    type: 'method-overview',
    nodes: [
      { id: 'real', type: 'input', label: 'Input' },
      { id: 'ai', type: 'module', label: 'AI Module' },
      { id: 'opt', type: 'process', label: 'Optimization' },
      { id: 'm1', type: 'module', label: 'Module 1' },
    ],
    edges: [
      { id: 'e1', source: 'real', target: 'ai' },
      { id: 'e2', source: 'ai', target: 'opt' },
      { id: 'e3', source: 'opt', target: 'm1' },
    ],
  })
  assertEq(vague.report.warnings.filter((d) => d.code === 'VAGUE_NODE_LABEL').length, 3, 'Test 5: 三个空泛标签都被点名')

  // 孤立节点
  const isolated = D.inspectDiagram({
    type: 'workflow',
    nodes: [
      { id: 'a', type: 'process', label: 'A' },
      { id: 'b', type: 'process', label: 'B' },
    ],
    edges: [],
  })
  assertEq(isolated.report.warnings.filter((d) => d.code === 'ISOLATED_NODE').length, 2, 'Test 5: 孤立节点被报出')
}

/* ══════════════════════════════════════════════════════════════════════
 * [6] Test 6 Repair
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[6] Test 6 按诊断修复')
{
  // 起点：四类可修缺陷
  const needsRepair = {
    type: 'method-overview',
    nodes: [
      { id: 'input', type: 'input', label: 'Input' },
      { id: 'enc', type: 'module', label: 'Encoder' },
      { id: 'enc', type: 'module', label: 'Encoder Again' }, // 重复 id
      { id: 'head', type: 'output', label: 'Head', style: 'neon' }, // 未知样式
    ],
    edges: [
      { id: 'e1', source: 'input', target: 'enc' },
      { id: 'e2', source: 'enc', target: 'fussion' }, // 目标不存在
      { id: 'e3', source: 'enc', target: 'head' },
    ],
  }
  const first = D.buildDiagram(needsRepair)
  assertEq(first.report.valid, false, 'Test 6: 第一轮无效')
  assertEq(first.svg, null, 'Test 6: 第一轮不给图')
  const firstCodes = codes(first.report)
  for (const code of ['DUPLICATE_ID', 'UNKNOWN_STYLE_TOKEN', 'MISSING_TARGET']) {
    assert(firstCodes.includes(code), `Test 6: 第一轮报出 ${code}`)
  }
  // 诊断必须给出可执行的修复方向（不是"something went wrong"）
  for (const d of first.report.errors) {
    if (['DUPLICATE_ID', 'UNKNOWN_STYLE_TOKEN', 'MISSING_TARGET'].includes(d.code)) {
      assert(typeof d.hint === 'string' && d.hint.length > 10, `Test 6: ${d.code} 带可执行的 hint`)
    }
  }

  // 按诊断修：改 id、去掉非法样式、把 fussion 改成 fusion
  const repaired = {
    type: 'method-overview',
    nodes: [
      { id: 'input', type: 'input', label: 'Input' },
      { id: 'enc', type: 'module', label: 'Encoder' },
      { id: 'enc2', type: 'module', label: 'Refinement' },
      { id: 'head', type: 'output', label: 'Head' },
    ],
    edges: [
      { id: 'e1', source: 'input', target: 'enc' },
      { id: 'e2', source: 'enc', target: 'enc2' },
      { id: 'e3', source: 'enc2', target: 'head' },
    ],
  }
  const second = D.buildDiagram(repaired)
  assertEq(second.report.valid, true, 'Test 6: 按诊断修完变有效')
  assert(second.svg !== null, 'Test 6: 修复后拿到 SVG')

  // 校验器不是"什么都放行"：把 target 拼错一个字母仍然会被抓
  const nearMiss = D.inspectDiagram({ ...repaired, edges: repaired.edges.map((e, i) => (i === 1 ? { ...e, target: 'enc3' } : e)) })
  assertEq(nearMiss.report.valid, false, 'Test 6: 拼写近似的错误仍被抓')

  // EDGE_CROSSES_NODE 是视觉层的安全网：分层布局的外绕走线在构造上不会穿盒，
  // 所以这里直接测几何判定本身（而不是等它在真实图里偶发）。
  const rect = { x: 100, y: 100, w: 50, h: 40 }
  assertEq(D.polylineIntersectsRect([{ x: 0, y: 120 }, { x: 200, y: 120 }], rect), true, 'Test 6: 折线穿过矩形被判出')
  assertEq(D.polylineIntersectsRect([{ x: 0, y: 90 }, { x: 200, y: 90 }], rect), false, 'Test 6: 折线绕开矩形不误判')
  assertEq(D.polylineIntersectsRect([{ x: 0, y: 0 }, { x: 0, y: 200 }], rect), false, 'Test 6: 竖线绕过矩形不误判')
  assertEq(D.segmentIntersectsRect({ x: 0, y: 0 }, { x: 300, y: 200 }, rect), true, 'Test 6: 斜线穿过矩形被判出')
}

/* ══════════════════════════════════════════════════════════════════════
 * [7] Test 7 Determinism
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[7] Test 7 确定性')
{
  const first = D.buildDiagram(complex).svg
  let identical = true
  for (let i = 0; i < 10; i++) {
    if (D.buildDiagram(complex).svg !== first) identical = false
  }
  assertEq(identical, true, 'Test 7: 同一 IR 渲染 10 次逐字节相同')
  assertEq(D.buildDiagram(simpleFlow).svg, D.buildDiagram(simpleFlow).svg, 'Test 7: 简单图同样稳定')

  // 诊断顺序也要稳定（否则两次 diff 不同，review 时看不出真正改了什么）
  const r1 = JSON.stringify(D.buildDiagram(broken).report)
  const r2 = JSON.stringify(D.buildDiagram(broken).report)
  assertEq(r1, r2, 'Test 7: 诊断报告顺序稳定')

  // 规范化 IR 幂等：canonical → 再规范化 → 同样 canonical
  const c1 = D.toCanonicalIr(D.normalizeIr(complex).diagram)
  const c2 = D.toCanonicalIr(D.normalizeIr(c1).diagram)
  assertEq(JSON.stringify(c2, null, 2), JSON.stringify(c1, null, 2), 'Test 7: 规范化 IR 幂等（边 id 不漂移）')

  // 不同方向/算法都稳定可渲染
  for (const direction of D.LAYOUT_DIRECTIONS) {
    for (const algorithm of D.LAYOUT_ALGORITHMS) {
      const ir = { ...complex, canvas: {}, layout: { direction, algorithm } }
      const b = D.buildDiagram(ir)
      assert(b.svg !== null, `Test 7: direction=${direction} algorithm=${algorithm} 能出图`)
      assertEq(D.buildDiagram(ir).svg, b.svg, `Test 7: direction=${direction} algorithm=${algorithm} 可复现`)
      assert(!/NaN/.test(b.svg), `Test 7: direction=${direction} algorithm=${algorithm} 无 NaN`)
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * [8] 落盘与 last-good
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[8] 落盘 / last-good / 文件名安全')
{
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-diagram-'))
  try {
    const paths = D.diagramPaths(ws, 'paper-main', 'fig1_method')
    assertEq(paths.relIr, 'papers/paper-main/figures/fig1_method.json', 'IR 落点')
    assertEq(paths.relSvg, 'papers/paper-main/figures/fig1_method.svg', 'SVG 落点')

    // 文件名安全：不许带路径、不许 ..、不许空
    assertEq(D.sanitizeDiagramName('../evil').ok, false, '拒绝 ../evil')
    assertEq(D.sanitizeDiagramName('a/b').ok, false, '拒绝 a/b')
    assertEq(D.sanitizeDiagramName('').ok, false, '拒绝空名')
    assertEq(D.sanitizeDiagramName('fig1.svg').name, 'fig1', '去掉扩展名')
    assertEq(D.sanitizeDiagramName('fig2_method').name, 'fig2_method', '合法名保留')

    // 好图落盘 → last-good 同步
    const build = D.buildDiagram(simpleFlow)
    D.writeDiagramIr(paths, D.toCanonicalIr(build.diagram))
    D.writeDiagramSvg(paths, build.svg)
    D.saveLastGood(paths, D.toCanonicalIr(build.diagram), build.svg)
    assert(existsSync(paths.irPath), 'IR 写出')
    assert(existsSync(paths.svgPath), 'SVG 写出')
    assert(existsSync(paths.lastGoodIrPath), 'last-good IR 写出')
    assert(existsSync(paths.lastGoodSvgPath), 'last-good SVG 写出')

    const read = D.readDiagramIr(paths)
    assertEq(read.ok, true, 'IR 能读回')
    assertEq(D.normalizeIr(read.raw).diagram?.nodes.length, 3, '读回的 IR 可用')

    const entries = D.listDiagramArtifacts(ws, 'paper-main')
    assertEq(entries.length, 1, 'list 只列出一张图（不把 .last-good 当图）')
    assertEq(entries[0].name, 'fig1_method', 'list 名字正确')
    assertEq(entries[0].complete, true, 'list 判定 IR+SVG 齐全')
    assertEq(entries[0].type, 'workflow', 'list 读出图类型')

    // 坏 IR：不写 SVG，好图仍在 → §25 的"保留最近一次成功生成的图"
    const before = statSync(paths.svgPath).mtimeMs
    const bad = D.buildDiagram({ type: 'workflow', nodes: [{ id: 'x', type: 'module', label: 'X' }], edges: [{ id: 'e1', source: 'x', target: 'ghost' }] })
    assertEq(bad.svg, null, '坏 IR 不产出新 SVG')
    assertEq(statSync(paths.svgPath).mtimeMs, before, '坏 IR 不覆盖已有 SVG')
    assert(readFileSync(paths.lastGoodSvgPath, 'utf8') === build.svg, 'last-good 仍是上一次成功的那张')
    assertEq(D.listDiagramArtifacts(ws, 'paper-main')[0].complete, true, '好图仍然完整')
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * [9] 工具层
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[9] 工具层 research_diagram')
{
  const ws = mkdtempSync(join(tmpdir(), 'convfusion-diagram-tool-'))
  try {
    const toolList = T.defineResearchTools(() => ws)
    const tool = toolList.find((t) => t.name === T.DIAGRAM_TOOL)
    assert(tool !== undefined, 'research_diagram 已注册')
    assertEq(
      (tool.parameters?.properties?.action?.enum ?? []).join(','),
      'create,render,export,validate,read,list',
      '动作枚举完整（含 export）',
    )
    assertEq(tool.isConcurrencySafe?.({}), false, '写文件的工具不并发安全')
    assert(/Diagram IR/.test(tool.description), '工具说明里点名 Diagram IR')
    assert(!/draw an SVG yourself/i.test(tool.description), '工具说明不鼓励手写 SVG')

    const created = await tool.execute({ action: 'create', name: 'fig1', ir: simpleFlow }, {})
    assertEq(created.ok, true, 'create 成功')
    assertEq(created.valid, true, 'create 校验通过')
    assertEq(created.svgWritten, false, 'create 不产 SVG（只固化 IR）')
    assert(existsSync(join(ws, 'papers', 'paper-main', 'figures', 'fig1.json')), 'create 写出 IR')

    const rendered = await tool.execute({ action: 'render', name: 'fig1' }, {})
    assertEq(rendered.valid, true, 'render 走 stored IR 也能校验通过')
    assertEq(rendered.svgWritten, true, 'render 写出 SVG')
    assert(rendered.nodes === 3, 'render 报节点数')

    const listed = await tool.execute({ action: 'list' }, {})
    assertEq(listed.entries?.length, 1, 'list 报出一张图')

    const readBack = await tool.execute({ action: 'read', name: 'fig1' }, {})
    assert(typeof readBack.ir === 'object', 'read 返回 IR 对象')

    const validated = await tool.execute({ action: 'validate', name: 'fig1', ir: broken }, {})
    assertEq(validated.valid, false, 'validate 对坏 IR 报无效')
    assert(validated.errorCount > 3, 'validate 报出多条错误')

    // 坏 IR render：不覆盖，且明确告知保留了上一张
    const stat0 = statSync(join(ws, 'papers', 'paper-main', 'figures', 'fig1.svg')).mtimeMs
    const badRender = await tool.execute({ action: 'render', name: 'fig1', ir: broken }, {})
    assertEq(badRender.svgWritten, false, '坏 IR render 不写 SVG')
    assert(typeof badRender.keptPrevious === 'string', '坏 IR render 明确报出保留了上一张')
    assertEq(statSync(join(ws, 'papers', 'paper-main', 'figures', 'fig1.svg')).mtimeMs, stat0, '上一张 SVG 未被覆盖')

    // 非法文件名 / 缺 ir：都返回 ok:false，不抛异常
    for (const args of [
      { action: 'render', name: '../evil', ir: simpleFlow },
      { action: 'render', name: 'x' },
      { action: 'read', name: 'missing' },
    ]) {
      let threw = null
      let out = null
      try {
        out = await tool.execute(args, {})
      } catch (e) {
        threw = e
      }
      assert(threw === null, `工具调用 ${JSON.stringify(args)} 不抛异常`)
      assert(out !== null && typeof out === 'object' && out.ok === false, `工具调用 ${JSON.stringify(args)} 返回 ok:false`)
    }

    // 动作枚举由 schema 兜底（枚举外的动作连参数校验都过不去）
    assertEq((tool.parameters?.properties?.action?.enum ?? []).includes('nope'), false, 'schema 不接受枚举外的动作')

    // IR 作为对象传入是工具契约（schema 会挡掉字符串/数字）
    const asObject = await tool.execute({ action: 'validate', name: 'fig1', ir: simpleFlow }, {})
    assertEq(asObject.valid, true, 'IR 以对象传入可校验')

    // 工具数量：新增一个，别把别的挤掉
    assert(toolList.some((t) => t.name === T.PAPER_LATEX_TOOL), '论文 LaTeX 工具仍在')
    assert(toolList.some((t) => t.name === T.EVIDENCE_TOOL), '证据工具仍在')
  } finally {
    rmSync(ws, { recursive: true, force: true })
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * [11] PDF 导出（LaTeX 交付步骤）
 *
 * 两条独立的检查：
 *   · **换算公式**（不依赖解释器，永远要跑）—— 实测校验过：342.22 单位的图按 252 pt 画，
 *     公式给 9.57 pt，编译出来的 PDF 里量到 9.54 pt；
 *   · **真实转换**（有 PyMuPDF 才跑；没有就明确跳过，不能假装通过）。
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[11] PDF 导出')
{
  // ── 可读性换算 ─────────────────────────────────────────────────
  assertEq(D.COLUMN_WIDTH_PT, 252, 'IEEE 单栏宽度常量 = 252 pt')
  assertEq(D.FULL_WIDTH_PT, 516, '跨栏宽度常量 = 516 pt')
  assertEq(D.MIN_LEGIBLE_PT, 7, '可读下限 = 7 pt')
  assertEq(D.effectiveNodeFontPt(342.22, 252), 9.57, '换算：342 单位按单栏画 → 9.57 pt（与编译实测 9.54 一致）')
  assertEq(D.effectiveNodeFontPt(1562.05, 516), 4.29, '换算：1562 单位按跨栏画 → 4.29 pt（实测 4.28）')
  assertEq(D.effectiveNodeFontPt(468, 252), 7, '刚好 7 pt 的临界宽度')
  assertEq(D.maxCanvasUnitsFor(7, 252), 468, '单栏下 7 pt 允许的最大画布宽度 = 468')
  assertEq(D.maxCanvasUnitsFor(7, 516), 958.3, '跨栏下 7 pt 允许的最大画布宽度 = 958.3')
  assert(D.effectiveNodeFontPt(0, 252) === 0, '零宽画布不除零')

  // 脚本随包发行（找不到脚本 = 部署漏了 assets）
  const script = D.findSvg2PdfScript()
  assert(typeof script === 'string' && script.endsWith('svg2pdf.py'), `随包转换脚本可定位：${script ?? '(未找到)'}`)
  assert(readFileSync(join(ROOT, 'package.json'), 'utf8').includes('"assets"'), 'package.json files 含 assets（脚本会随包发行）')

  // 环境探测：找不到解释器时必须给出**可执行**的说明，而不是沉默
  const probe = D.findDiagramPython()
  if (!probe.ok) {
    assert(/python/i.test(probe.error) && /pymupdf/i.test(probe.error), '找不到解释器时说明要装什么')
    assert(Array.isArray(probe.tried) && probe.tried.length > 0, '列出尝试过的候选解释器')
    console.log(`  (跳过真实转换：${probe.error.split('.')[0]})`)
  } else {
    console.log(`  解释器：${probe.python} (Python ${probe.version}, PyMuPDF ${probe.pymupdf})`)

    const ws = mkdtempSync(join(tmpdir(), 'convfusion-diagram-export-'))
    try {
      const paths = D.diagramPaths(ws, 'paper-main', 'fig1')
      const small = D.buildDiagram(simpleFlow)
      D.writeDiagramIr(paths, D.toCanonicalIr(small.diagram))
      D.writeDiagramSvg(paths, small.svg)
      const pdfPath = paths.svgPath.replace(/\.svg$/i, '.pdf')

      const r = D.exportDiagramPdf({ svgPath: paths.svgPath, pdfPath, targetWidthPt: D.COLUMN_WIDTH_PT })
      assertEq(r.ok, true, `导出成功${r.ok ? '' : `：${r.error}`}`)
      assert(existsSync(pdfPath), 'PDF 真的落盘了（脚本说成功不算，产物才算）')
      assert(statSync(pdfPath).size > 1000, 'PDF 非空')
      assertEq(r.allFontsEmbedded, true, '字体全部内嵌（期刊要求）')
      assert(r.textChars > 0, '文字保留为真文字（可选中可搜索）')
      assert(r.vectorDrawings > 0, '内容是矢量绘制而不是位图')
      assert(r.widthPt > 0 && r.heightPt > 0, '页面尺寸取自 SVG 画布')
      assertEq(r.effectiveNodePt, D.effectiveNodeFontPt(small.layout.width, D.COLUMN_WIDTH_PT), '导出回报的字号与换算公式一致')
      assertEq(r.legible, r.effectiveNodePt >= 7, 'legible 与阈值一致')

      // 确定性：同一 SVG 转两次逐字节相同（PDF 里没有时间戳/随机 ID）
      const pdf2 = join(dirname(pdfPath), 'twice.pdf')
      D.exportDiagramPdf({ svgPath: paths.svgPath, pdfPath: pdf2, targetWidthPt: D.COLUMN_WIDTH_PT })
      assertEq(
        readFileSync(pdfPath).equals(readFileSync(pdf2)),
        true,
        '同一 SVG 转两次逐字节相同（可进 git，改动才会产生 diff）',
      )

      // 宽图在单栏里不可读 —— 这条提示是"图能不能用"的关键判据
      const wide = D.buildDiagram(complex)
      const widePaths = D.diagramPaths(ws, 'paper-main', 'fig_wide')
      D.writeDiagramSvg(widePaths, wide.svg)
      const widePdf = widePaths.svgPath.replace(/\.svg$/i, '.pdf')
      const wr = D.exportDiagramPdf({ svgPath: widePaths.svgPath, pdfPath: widePdf, targetWidthPt: D.COLUMN_WIDTH_PT })
      assertEq(wr.ok, true, '宽图也能导出')
      assert(wr.effectiveNodePt < 7, `宽图按单栏画会太小（${wr.effectiveNodePt} pt）`)
      assertEq(wr.legible, false, '宽图被标为不可读')
      assert(wr.maxCanvasUnitsFor7pt > 0, '给出"要多窄才读得清"的数')
      assert(wr.maxCanvasUnitsFor7pt < wide.layout.width, '该数值小于当前画布宽（说明确实需要收窄）')

      // 目标宽度变了，字号随之变（不是写死的）
      const full = D.exportDiagramPdf({ svgPath: widePaths.svgPath, pdfPath: widePdf, targetWidthPt: D.FULL_WIDTH_PT })
      assert(full.effectiveNodePt > wr.effectiveNodePt, '跨栏画的字号大于单栏')

      // 失败路径：返回结构化结果而不是抛异常
      const missing = D.exportDiagramPdf({ svgPath: join(ws, 'nope.svg'), pdfPath: pdf2 })
      assertEq(missing.ok, false, 'SVG 不存在时返回 ok:false')
      assertEq(typeof missing.error, 'string', '失败带原因')

      // 工具层 export
      const toolList = T.defineResearchTools(() => ws)
      const tool = toolList.find((t) => t.name === T.DIAGRAM_TOOL)
      assertEq((tool.parameters?.properties?.action?.enum ?? []).includes('export'), true, '工具动作枚举含 export')
      const exported = await tool.execute({ action: 'export', name: 'fig1', column_width_pt: 252 }, {})
      assertEq(exported.ok, true, `工具 export 成功${exported.ok ? '' : `：${exported.error}`}`)
      assertEq(exported.svgPath, 'papers/paper-main/figures/fig1.svg', 'export 报出源 SVG')
      assertEq(exported.pdfPath, 'papers/paper-main/figures/fig1.pdf', 'export 报出 PDF 落点')
      assert(typeof exported.legible === 'boolean', 'export 报出可读性')
      const notRendered = await tool.execute({ action: 'export', name: 'never_rendered' }, {})
      assertEq(notRendered.ok, false, '没 render 过就 export → 明确失败')
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * [12] 密排与二级说明（为"忠实还原一张内容多的图"新增的两个 IR 字段）
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[12] layout.layer_gap 与 IR 级 show_descriptions')
{
  // 一张内容密的图：DCRM 是**顶层且成员全是节点**的 group，跨了若干层
  const dense = {
    type: 'method-overview', title: 'RDP',
    layout: { direction: 'TB', algorithm: 'hierarchical' },
    nodes: [
      { id: 'state_t', type: 'input', label: 'Research State S_t', description: 'Q_t, H_t, M_t, X_t, E_t, C_t, R_t' },
      { id: 'enc', type: 'model', label: 'State Encoder', group: 'dcrm', description: 'text / set / trajectory encoders' },
      { id: 'heads', type: 'model', label: 'Decision Heads', group: 'dcrm', description: 'A State · B Evidence · C Planning' },
      { id: 'calib', type: 'module', label: 'Calibration Module', group: 'dcrm' },
      { id: 'gate', type: 'decision', label: 'Abstention Gate', group: 'dcrm', description: 'threshold θ' },
      { id: 'decision_t', type: 'decision', label: 'Research Decision D_t', description: 'π(a|S_t) · confidence · abstain flag' },
      { id: 'exec', type: 'process', label: 'Direct Execution', description: 'confidence ≥ θ' },
      { id: 'action_t', type: 'output', label: 'Research Action A_t' },
    ],
    groups: [{ id: 'dcrm', label: 'DCRM (compact, calibrated)', children: ['enc', 'heads', 'calib', 'gate'] }],
    edges: [
      { id: 'e1', source: 'state_t', target: 'dcrm' },
      { id: 'e2', source: 'enc', target: 'heads' },
      { id: 'e3', source: 'heads', target: 'calib' },
      { id: 'e4', source: 'calib', target: 'gate' },
      { id: 'e5', source: 'dcrm', target: 'decision_t' },
      { id: 'e6', source: 'decision_t', target: 'exec' },
      { id: 'e7', source: 'exec', target: 'action_t' },
    ],
  }

  // (a) layer_gap 必须真的改变高度，且不改宽度
  const wide = D.buildDiagram(dense)
  const tight = D.buildDiagram({ ...dense, layout: { direction: 'TB', algorithm: 'hierarchical', layer_gap: 20 } })
  assert(tight.layout.height < wide.layout.height * 0.85, `layer_gap=20 明显更矮（${wide.layout.height.toFixed(0)} → ${tight.layout.height.toFixed(0)}）`)
  assertEq(Math.round(tight.layout.width), Math.round(wide.layout.width), 'layer_gap 不改变宽度')
  assertEq([...tight.report.errors, ...tight.report.warnings].some((d) => d.code === 'CANVAS_TOO_SMALL'), false, '密排不报画布过小')

  // (b) 越界要 clamp 并说明，不是静默
  const clamped = D.inspectDiagram({ ...dense, layout: { direction: 'TB', layer_gap: 1 } })
  assertEq(clamped.report.valid, true, '过小的 layer_gap 不致命')
  assert(clamped.report.warnings.some((w) => w.code === 'BAD_FIELD_TYPE' && /clamped/.test(w.message)), '过小的 layer_gap 被 clamp 并报出')
  const badType = D.inspectDiagram({ ...dense, layout: { direction: 'TB', layer_gap: 'wide' } })
  assert(badType.report.errors.some((e) => e.code === 'BAD_FIELD_TYPE'), 'layer_gap 类型不对 → error')

  // (c) show_descriptions 属于 IR：不靠调用参数也能复现，并写回 canonical IR
  const withDesc = D.buildDiagram({ ...dense, show_descriptions: true })
  const svgLines = (withDesc.svg.match(/font-size="11"/g) ?? []).length
  assert(svgLines > 0, 'IR 里声明 show_descriptions 后，说明文字真的画进 SVG')
  const withoutDesc = D.buildDiagram(dense)
  assertEq((withoutDesc.svg.match(/font-size="11"/g) ?? []).length, 0, '不声明则默认不画说明')
  assertEq(D.toCanonicalIr(D.normalizeIr({ ...dense, show_descriptions: true }).diagram).show_descriptions, true, 'canonical IR 保留 show_descriptions')
  assertEq(D.buildDiagram({ ...dense, show_descriptions: true }).svg, withDesc.svg, '同一 IR 重渲染一致（含说明）')

  // (d) 顶层叶子 group **就地排版**：与主流程同一列，而不是被推到侧向泳道
  const g = withDesc.layout.groupById.get('dcrm')
  const st = withDesc.layout.nodeById.get('state_t')
  assert(g !== undefined && st !== undefined, '容器与首节点都放好了')
  const gcx = g.rect.x + g.rect.w / 2
  const scx = st.rect.x + st.rect.w / 2
  assert(Math.abs(gcx - scx) < 60, `容器与主流程同列（差 ${Math.abs(gcx - scx).toFixed(0)} 单位），不是侧向泳道`)
  assertEq(foreignNodesInsideGroups(withDesc.layout).length, 0, '就地排版同样不圈住非成员')
  assertEq([...withDesc.report.errors, ...withDesc.report.warnings].some((d) => d.code === 'GROUP_OVERLAPS_FOREIGN_NODE'), false, '就地排版无 GROUP_OVERLAPS_FOREIGN_NODE')

  // (e) 嵌套 / 含子 group 的容器**仍然**走泳道（就地排版只对顶层叶子开放）
  const nested = {
    type: 'architecture',
    nodes: [
      { id: 'a', type: 'input', label: 'A' },
      { id: 'b', type: 'module', label: 'B', group: 'inner' },
      { id: 'c', type: 'module', label: 'C' },
      { id: 'd', type: 'output', label: 'D' },
    ],
    groups: [{ id: 'outer', label: 'Outer', children: ['inner'] }, { id: 'inner', label: 'Inner', children: ['b'] }],
    edges: [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'd' },
    ],
  }
  const nb = D.buildDiagram(nested)
  assertEq(nb.report.valid, true, '嵌套容器图有效')
  assertEq(foreignNodesInsideGroups(nb.layout).length, 0, '嵌套容器不圈住非成员')
  const inner = nb.layout.groupById.get('inner')
  const outer = nb.layout.groupById.get('outer')
  assert(
    outer.rect.x <= inner.rect.x && outer.rect.y <= inner.rect.y &&
      outer.rect.x + outer.rect.w >= inner.rect.x + inner.rect.w &&
      outer.rect.y + outer.rect.h >= inner.rect.y + inner.rect.h,
    '外层容器仍包住内层容器',
  )
}

/* ══════════════════════════════════════════════════════════════════════
 * [10] SVG 合法性与几何自洽
 *
 * 这一节替代"肉眼看图"：看不到图的时候，至少要证明图在几何上是自洽的
 * （都在画布里、线都落在边界上、没有外部依赖、XML 合法）。
 * ══════════════════════════════════════════════════════════════════════ */
console.log('\n[10] SVG 合法性 / 自包含 / 几何自洽')
{
  const build = D.buildDiagram(complex)
  const svg = build.svg
  const layout = build.layout

  // 自包含：不引外部字体/图片/CSS
  assert(!/<image\b/.test(svg), '不含 <image> 外链')
  assert(!/xlink:href|href="/.test(svg), '不含 href 外链')
  assert(!/@import|<link\b|<style\b/.test(svg), '不用 <style>/@import（部分 SVG→PDF 转换器会丢样式）')
  assertEq((svg.match(/https?:\/\//g) ?? []).length, 1, '只有 xmlns 一个 URL')

  // 坐标全在画布内
  for (const n of layout.nodes) {
    assert(n.rect.x >= 0 && n.rect.y >= 0 && n.rect.x + n.rect.w <= layout.width + 0.5 && n.rect.y + n.rect.h <= layout.height + 0.5, `节点 ${n.id} 在画布内`)
  }
  for (const g of layout.groups) {
    assert(g.rect.x >= 0 && g.rect.y >= 0 && g.rect.x + g.rect.w <= layout.width + 0.5 && g.rect.y + g.rect.h <= layout.height + 0.5, `容器 ${g.id} 在画布内`)
  }
  for (const e of layout.edges) {
    assert(e.points.length >= 2, `边 ${e.id} 至少两个点`)
    assert(e.points.every((p) => p.x >= -0.5 && p.y >= -0.5 && p.x <= layout.width + 0.5 && p.y <= layout.height + 0.5), `边 ${e.id} 的折线在画布内`)
  }

  // 每条边的首尾都落在某个盒子/容器的边界上（箭头不会飘在半空、也不会画进盒子里）
  const onBorder = (p, r) => {
    const eps = 1.0
    const inX = p.x >= r.x - eps && p.x <= r.x + r.w + eps
    const inY = p.y >= r.y - eps && p.y <= r.y + r.h + eps
    if (!inX || !inY) return false
    return (
      Math.abs(p.x - r.x) <= eps ||
      Math.abs(p.x - (r.x + r.w)) <= eps ||
      Math.abs(p.y - r.y) <= eps ||
      Math.abs(p.y - (r.y + r.h)) <= eps
    )
  }
  const boxFor = (declared, resolved) => layout.groupById.get(declared)?.rect ?? layout.nodeById.get(resolved)?.rect
  for (const e of layout.edges) {
    const sBox = boxFor(e.declaredSource, e.source)
    const tBox = boxFor(e.declaredTarget, e.target)
    assert(onBorder(e.points[0], sBox), `边 ${e.id} 起点落在 ${e.declaredSource} 边界上`)
    assert(onBorder(e.points[e.points.length - 1], tBox), `边 ${e.id} 终点落在 ${e.declaredTarget} 边界上`)
  }

  // 折线没有零长度段、没有重复点（否则 orient="auto" 的箭头行为未定义）
  for (const e of layout.edges) {
    for (let i = 0; i + 1 < e.points.length; i++) {
      const a = e.points[i]
      const b = e.points[i + 1]
      assert(Math.abs(a.x - b.x) > 0.001 || Math.abs(a.y - b.y) > 0.001, `边 ${e.id} 第 ${i} 段非零长度`)
      assert(Math.abs(a.x - b.x) < 0.001 || Math.abs(a.y - b.y) < 0.001, `边 ${e.id} 第 ${i} 段是正交段`)
    }
  }

  // XML 转义：标签里的尖括号与 & 不能破坏文档
  const nasty = {
    type: 'workflow',
    title: 'A & B <test>',
    nodes: [
      { id: 'a', type: 'process', label: 'Step <1> & "two"' },
      { id: 'b', type: 'process', label: 'Step 2' },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b', label: 'x < y' }],
  }
  const nastySvg = D.buildDiagram(nasty).svg
  assert(!nastySvg.includes('<1>'), '标签里的尖括号被转义（不会变成真标签）')
  assert(nastySvg.includes('&lt;1&gt;') && nastySvg.includes('&amp;') && nastySvg.includes('&quot;'), '转义为 XML 实体')
  assert(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(nastySvg), '没有裸露的 & 符号')

  // 用系统 xmllint 兜底做一次真正的 XML 解析（没有就跳过）
  const { execFileSync } = await import('node:child_process')
  const { writeFileSync, mkdtempSync: mkd, rmSync: rms } = await import('node:fs')
  const { tmpdir: tdir } = await import('node:os')
  const dir = mkd(join(tdir(), 'convfusion-svg-'))
  try {
    for (const [name, text] of [['complex', svg], ['nasty', nastySvg], ['simple', D.buildDiagram(simpleFlow).svg]]) {
      const p = join(dir, `${name}.svg`)
      writeFileSync(p, text, 'utf8')
      let ok = true
      try {
        execFileSync('xmllint', ['--noout', p], { stdio: 'pipe' })
      } catch (e) {
        if (e?.code === 'ENOENT') {
          ok = null
          break
        }
        ok = false
      }
      if (ok === null) break
      assertEq(ok, true, `${name}.svg 通过 xmllint 解析`)
    }
  } finally {
    rms(dir, { recursive: true, force: true })
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log(`\n== paper-diagrams 自检：${passed} passed, ${failed} failed ==`)
if (failed > 0) {
  console.log('失败项：')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
