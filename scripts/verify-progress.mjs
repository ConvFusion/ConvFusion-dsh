#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 研究过程 + 研究进展 验证（离线）。
 *
 * 覆盖用户提的两件事：
 *
 *   A. **基本科研过程要体现在能力选择里**，而且**过程本身是一个可定制 Skill**
 *      （用户在设置里能规定自己的研究进展过程）；
 *   B. **顶部「研究进展」按钮**（`v2-Progress.md`）：只在研究会话显示、点击看当前
 *      工作区的研究进展，且必须来自真实资产 —— 不猜。
 *
 * 用法：
 *   node scripts/verify-progress.mjs .
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const PROC = await import(lib('research/research-process.js'))
const PROG = await import(lib('research/progress.js'))
const BRIDGE = await import(lib('research/progress-bridge.js'))
const ADV = await import(lib('research/advance.js'))
const LIB = await import(lib('research/library.js'))
const RPC = await import(lib('settings-rpc.js'))
const PROTO = await import(lib('protocol.js'))
const PROGRESS_PLUGIN_NAME = 'convfusion'
const CUST = await import(lib('research/skill-customization.js'))
const CTX = await import(lib('research/context.js'))

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

/**
 * 去掉注释（回归守卫只看**代码**）。
 *
 * 为什么需要：被删掉的旧机制必须在注释里留下"别再这么做"的说明
 * （`activeSessionId` 这类名字会出现在说明文字里），但**代码里**绝不许再出现。
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const noStore = CUST.createMemoryCustomizationStore()
const baseContent = (id) => LIB.effectiveSkillContentById(id, noStore)

/* ════════════════════════════════════════════════════════════════════════
 * 1. 过程定义来自 Skill（默认过程）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1] 过程定义是能力库里的一个 Skill')
{
  const content = baseContent(PROC.PROCESS_SKILL_ID)
  assert(typeof content === 'string' && content.length > 0, '`research-process` 存在于能力库')
  const stages = PROC.parseStages(content)
  assert(Array.isArray(stages) && stages.length >= 6, `从能力正文解析出 ${stages?.length ?? 0} 个阶段`)
  assertEq(stages?.map((s) => s.id)[0], 'topics', '第一个阶段是 topics（提出话题）')
  assert(stages.every((s) => s.label && s.category), '每个阶段都有显示名与能力类别')
  assert(stages.every((s) => s.signal === undefined || PROC.STAGE_SIGNALS.includes(s.signal)), '判定信号都在固定词表内')
  // 默认过程必须覆盖"提出话题 → 文献调研 → … → 论文写作"这条基本科研过程
  const ids = stages.map((s) => s.id)
  for (const want of ['topics', 'literature', 'innovation', 'planning', 'resource', 'decision', 'experiment', 'writing']) {
    assert(ids.includes(want), `默认过程包含阶段：${want}`)
  }
  // 提示性：正文必须写明它不是流水线
  assert(/not a pipeline|不是.*流水线|not a procedure/i.test(content), 'Skill 正文写明"不是流水线/不必按序"')
}

/* ════════════════════════════════════════════════════════════════════════
 * 2. 用户可定制的过程（本次需求核心）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[2] 用户可以规定自己的研究进展过程')
{
  const userText = [
    '理论学科的过程：先形式化，再推导，最后才对照文献。',
    '',
    '```text',
    'stage: formalize | 形式化 | research-understanding | problem-defined | 形式化的问题',
    'stage: derive | 推导 | methodology | claims | 可验证的命题',
    'stage: literature | 文献 | literature | literature-evidence | 与已有理论对照',
    '```',
  ].join('\n')

  const store = CUST.createMemoryCustomizationStore({ [PROC.PROCESS_SKILL_ID]: { 'Research Method': userText } })
  const content = LIB.effectiveSkillContentById(PROC.PROCESS_SKILL_ID, store)
  const stages = PROC.parseStages(content)
  assertEq(stages?.map((s) => s.id), ['formalize', 'derive', 'literature'], '用户的阶段定义**覆盖**默认（取第一个块）')
  assertEq(stages?.[0].label, '形式化', '用户自定义的显示名生效')
  assert(content !== baseContent(PROC.PROCESS_SKILL_ID), '（前提）定制后的正文确实不同')
  // 定制能力必须在设置的允许清单里，否则用户改不了
  assert(CUST.CUSTOMIZABLE_SECTIONS.includes('Research Method'), '用户在设置里能覆盖 Research Method 章节')

  // 判定信号仍受固定词表约束：写错的信号不参与判定（不造成假缺口）
  const bad = PROC.parseStages('```text\nstage: x | 未知阶段 | literature | 我编的信号 | 说明\n```')
  assertEq(bad?.length, 1, '信号不认识时阶段仍被解析')
  assertEq(bad?.[0].signal, undefined, '未知信号被丢弃（不会伪造判定逻辑）')
  const assess = PROC.assessWithStages('.', bad ?? [])
  assertEq(assess.current, undefined, '无信号的阶段不参与"当前阶段"判定（不产生假缺口）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 3. 过程评估来自真实资产
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[3] 阶段判定看的是磁盘上的资产，不是对话内容')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-proc-'))
  const a0 = PROC.assessResearchProcess(ws, { skillContent: baseContent })
  assertEq(a0.current?.stage.id, 'topics', '空工作区 → 当前阶段是 topics（提出话题）')

  // 只写研究话题：阶段 1 的落地物是 `research/topics.md`（不是 project.md）
  mkdirSync(join(ws, 'research'), { recursive: true })
  writeFileSync(
    join(ws, 'research', 'topics.md'),
    '# Research Topics\n\n- 用 LLM 辅助科研决策（依据：某论文承认的局限）\n',
  )
  const a1 = PROC.assessResearchProcess(ws, { skillContent: baseContent })
  assertEq(a1.current?.stage.id, 'literature', '有研究话题后 → 当前阶段推进到 literature')
  assert(a1.stages[0].satisfied, '提出话题阶段判定为已落地')

  // "只有检索计划不算产出文献证据"这个区分要真的成立
  mkdirSync(join(ws, 'plans'), { recursive: true })
  writeFileSync(join(ws, 'plans', 'literature-gap-analysis.md'), '# Plan: Literature Gap Analysis\n\n## Objective\n\nsearch\n')
  const a2 = PROC.assessResearchProcess(ws, { skillContent: baseContent })
  assertEq(a2.current?.stage.id, 'literature', '只有 Plan 而没有文献证据时，literature 仍算未落地')
  rmSync(ws, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 4. 过程进入能力选择（"体现在 Skill 选择逻辑中"）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[4] 能力选择跟着过程走')
{
  // ⚠️ 必须用**研究工作区**：非研究工作区不注入任何研究上下文（会话退化为普通助手）。
  const ws = mkdtempSync(join(tmpdir(), 'cf-ctx-'))
  writeFileSync(
    join(ws, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', '', '## Research Questions', '', '- **Q1** 能不能？', ''].join('\n'),
  )
  const text = CTX.renderResearchContext(
    CTX.collectResearchContext({ workspace: ws, skillContent: baseContent }),
    '',
  )
  assert(text.includes('## Research process'), '上下文含研究过程一节')
  assert(/Current stage: \*\*.+\*\*/.test(text), '写明当前阶段')
  assert(/not a procedure to follow|不是.*流程|may work on any of them in any order/.test(text), '写明这不是必须遵循的流程')
  assert(/Landed:|Not yet:/.test(text), '列出已落地与未落地阶段')
  // 非研究工作区不注入任何上下文（普通对话不该出现研究过程）
  const plain = mkdtempSync(join(tmpdir(), 'cf-ctx-plain-'))
  const plainText = CTX.renderResearchContext(
    CTX.collectResearchContext({ workspace: plain, skillContent: baseContent }),
    '',
  )
  assertEq(plainText.trim(), '', '非研究工作区：不注入研究上下文')
  rmSync(plain, { recursive: true, force: true })
  // 不写死阶段：断言"推荐 == 当前阶段的类别"。阶段会随工作区资产变化
  // （记录一条文献证据就会从 文献 推进到 创新与假设），写死就会随环境漂移。
  const st = CTX.collectResearchContext({ workspace: ws, skillContent: baseContent })
  const proc = PROC.assessResearchProcess(ws, { skillContent: baseContent })
  assert(st.suggestedSkills.length > 0, '按阶段给出了推荐能力')
  assert(st.suggestedSkills.length <= 6, `推荐数量有上限（${st.suggestedSkills.length}）`)
  if (proc.current) {
    assert(
      st.suggestedSkills.every((s) => (s.category ?? '').startsWith(proc.current.stage.category)),
      `无具体请求时，推荐的能力都属于当前阶段（${proc.current.stage.category}）的类别`,
    )
  }
  // 反过来也要成立：换一个阶段，推荐跟着换
  const fake = '```text\nstage: writing | 写作 | academic-writing | manuscript | 论文正文\n```'
  const writingAssessment = PROC.assessWithStages(ws, PROC.parseStages(fake) ?? [])
  assertEq(writingAssessment.current?.stage.category, 'academic-writing', '自定阶段能改变"当前阶段"的类别')
  void writingAssessment
  rmSync(ws, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 4b. 研究上下文按**会话自己的工作区**解析
 *
 * 与进度卡同一类故障：过去的 provider 用入口注入的**全局**解析（`agent/pre-step`
 * 同步的一个全局 cwd），多会话并行时会被别的会话覆盖 → 研究上下文注入到普通对话里。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[4b] 研究上下文按会话自己的工作区解析（不靠全局 cwd）')
{
  const SW = await import(lib('research/session-workspace.js'))
  const WS = await import(lib('research/workspace.js'))

  // 新布局：会话工作区下再有 workspace/（研究根）
  const sessionResearch = mkdtempSync(join(tmpdir(), 'cf-sw-research-'))
  mkdirSync(join(sessionResearch, 'workspace'), { recursive: true })
  writeFileSync(
    join(sessionResearch, 'workspace', 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )
  const sessionPlain = mkdtempSync(join(tmpdir(), 'cf-sw-plain-'))
  writeFileSync(join(sessionPlain, 'notes.txt'), 'ordinary\n')

  const sessions = {
    's-research': { header: { cwd: sessionResearch } },
    's-plain': { header: { cwd: sessionPlain } },
  }
  const fakeCtx = { get: (name) => (name === 'sessions' ? { get: (id) => sessions[id] } : undefined) }

  const research = SW.researchTargetsForSession(fakeCtx, 's-research')
  assertEq(research.session, sessionResearch, '会话工作区来自会话自己的 header.cwd')
  assertEq(research.root, join(sessionResearch, 'workspace'), '新布局：研究根 = <会话工作区>/workspace')
  assertEq(WS.isResearchWorkspace(research.root), true, '该会话确实是研究项目（→ 注入研究上下文）')

  const plain = SW.researchTargetsForSession(fakeCtx, 's-plain')
  assertEq(plain.session, sessionPlain, '普通会话：工作区解析到它自己')
  assertEq(WS.isResearchWorkspace(plain.root), false, '普通会话不构成研究项目（→ 不注入任何上下文）')
  assertEq(SW.researchTargetsForSession(fakeCtx, 's-missing'), undefined, '拿不到会话 → undefined（不退化成插件进程目录）')

  // 源码守卫：两个 provider 都必须按**本次组装所属会话**解析
  const ctxCode = stripComments(readFileSync(join(PKG, 'src', 'research', 'context.ts'), 'utf8'))
  const uses = ctxCode.split('this.targetsFor(context)').length - 1
  assertEq(uses, 2, 'section 与 context 两个 provider 都走 targetsFor(context)（按会话解析）')
  assert(!/text: \(\) =>/.test(ctxCode), 'provider 不再是无参回调（那意味着只会用全局状态）')
  assert(/researchTargetsForSession\(/.test(ctxCode), '会话解析走 researchTargetsForSession（权威来源 = 会话存储）')

  rmSync(sessionResearch, { recursive: true, force: true })
  rmSync(sessionPlain, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 5. 研究进展快照：不猜、不伪造成熟度
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[5] Research Progress Snapshot 的诚实性')
{
  const snap = PROG.captureProgress('.', baseContent)
  assertEq(Object.keys(snap.maturity).length, 6, '6 个成熟度维度（Research State 的定性等级）')
  for (const [level, scale] of Object.entries(PROG.MATURITY_SCALE)) {
    assert(scale >= 0 && scale <= 1, `等级 ${level} 的折算位置在 0..1`)
  }
  assertEq(PROG.MATURITY_SCALE.Unknown, 0, 'Unknown 折算为 0（而不是假装某个中间值）')
  assert(PROG.captureProgress('.', baseContent).counts.evidence >= 0, '计数来自真实资产')

  // bar 渲染
  assertEq(PROG.renderBar(0, 4), '░░░░', '0 → 全空')
  assertEq(PROG.renderBar(1, 4), '████', '1 → 全满')
  assertEq(PROG.renderBar(0.5, 4), '██░░', '0.5 → 半满')

  // diff：真的有变化才叫变化
  const before = { ...snap, counts: { ...snap.counts, evidence: snap.counts.evidence, claims: snap.counts.claims } }
  const unchanged = PROG.diffProgress(before, snap)
  assertEq(unchanged.changed, false, '资产未变 → changed=false')
  const grown = PROG.diffProgress(before, { ...snap, counts: { ...snap.counts, evidence: snap.counts.evidence + 3 } })
  assertEq(grown.changed, true, '证据 +3 → changed=true')

  // 成熟度变化
  const matured = PROG.diffProgress(snap, {
    ...snap,
    maturity: { ...snap.maturity, Problem: 'Strong' },
  })
  assertEq(matured.maturityChanges.length, 1, '成熟度等级变化被检出')
  assertEq(matured.maturityChanges[0].dimension, 'Problem', '指出是哪个维度')
}

/* ════════════════════════════════════════════════════════════════════════
 * 5b. 工作区进度（顶部按钮面板的数据）：
 *     "现在到哪了"必须能**任何时刻**从磁盘重算，且不伪造精度
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[5b] 工作区进度：任何时刻可重算、且不伪造精度')
{
  const snap = PROG.captureProgress('.', baseContent)
  const ws = PROG.buildWorkspaceProgress(snap)
  assertEq(ws.progress.dimensions.length, 6, '面板带 6 个成熟度维度（画条用）')
  for (const d of ws.progress.dimensions) {
    assert(typeof d.level === 'string' && d.level.length > 0, `维度 ${d.dimension} 带等级名（不是只有百分比）`)
    assert(d.scale >= 0 && d.scale <= 1, `维度 ${d.dimension} 的折算位置在 0..1`)
  }
  const mean = ws.progress.dimensions.reduce((a, d) => a + d.scale, 0) / ws.progress.dimensions.length
  assert(Math.abs(ws.overall - mean) < 1e-9, '整体进度 = 各维度折算的均值（可复算，不是另算一个数）')
  assert(ws.counts.length >= 5, `面板列出 ${ws.counts.length} 项可数资产`)
  assert(ws.counts.every((r) => Number.isInteger(r.value) && r.value >= 0), '资产计数是真实整数，不是估算')
  assert(ws.counts.every((r) => !('label' in r) && !('note' in r)), '面板资产只传稳定 key/数值，不传宿主中文文案')
  assert(typeof ws.paper === 'boolean', '论文正文以"有/无"陈述，不给百分比')
  assert(Array.isArray(ws.need.gaps), '面板带当前缺口')
  assert(ws.need.gaps.every((g) => typeof g.code === 'string'), '当前缺口使用稳定 code')
  assert(typeof ws.need.basisCode === 'string', '推进依据使用稳定 code')
  assert(['clear', 'ambiguous', 'blocked', 'unknown'].includes(ws.need.clarity), '面板带推进判定三态')

  // 只有研究问题、没有任何成熟度评估的工作区：维度必须是 Unknown 且折算为 0
  const bare = mkdtempSync(join(tmpdir(), 'cf-wsprog-'))
  writeFileSync(
    join(bare, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )
  const bareReport = PROG.buildWorkspaceProgress(PROG.captureProgress(bare, baseContent))
  assert(bareReport.progress.dimensions.every((d) => d.level === 'Unknown'), '未评估 → 全部显示 Unknown（不假装中间值）')
  assertEq(bareReport.overall, 0, '未评估 → 折算为 0')
  assertEq(bareReport.counts.find((r) => r.key === 'evidence')?.value, 0, '没有证据文件 → 证据计数是 0（真实读数）')
  rmSync(bare, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6. 展示文本
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[6] 展示内容')
{
  const snap = PROG.captureProgress('.', baseContent)
  const noChange = PROG.diffProgress(snap, snap)
  const r0 = PROG.renderProgressNotice(noChange)
  assert(r0.summary.length <= 120, `summary 在 120 字符内（${r0.summary.length}）`)
  assert(r0.summary.includes('研究进展'), 'summary 说明这是研究进展')
  assert(/本轮没有形成新的可验证研究资产|本轮无资产变化/.test(r0.text), '没有推进时**明说**，不编造进度')
  assert(/非测量值/.test(r0.text), '标注成熟度是等级折算而非测量值')
  assert(/不是\*\*必须执行|不是.*必须执行/.test(r0.text), '缺口只陈述，不强制')
  assert(r0.text.includes('Unknown'), '未评估维度显示 Unknown')

  const changed = PROG.diffProgress(snap, {
    ...snap,
    maturity: { ...snap.maturity, Problem: 'Emerging' },
    counts: { ...snap.counts, evidence: snap.counts.evidence + 2, claims: snap.counts.claims + 1 },
  })
  const r1 = PROG.renderProgressNotice(changed)
  assert(/Problem/.test(r1.text) && /Unknown → Emerging/.test(r1.text), '列出成熟度变化')
  assert(/证据：.*→.*（\+2）/.test(r1.text), '列出证据计数变化')
  assert(/主张：.*→.*（\+1）/.test(r1.text), '列出主张计数变化')
  assert(PROG.renderProgressLine(snap).includes('当前阶段'), '一行摘要含当前阶段')
}

/* ════════════════════════════════════════════════════════════════════════
 * 7. 桥：把回合报告交给界面（**不再追加会话消息**），且不阻断 Agent
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[7] 进展桥（回合报告 → 界面卡片 + waterfall 必须放行）')
{
  // 回合报告存储：界面 RPC 从这里读
  const snapshotLike = PROG.captureProgress('.', baseContent)
  const report = PROG.buildTurnReport(PROG.diffProgress(snapshotLike, snapshotLike), 3)
  assertEq(report.turn, 3, '报告带回合号')
  assertEq(typeof report.summary, 'string', '报告带一行摘要')
  assertEq(report.progress.dimensions.length, 6, '报告含 6 个成熟度维度（供界面画条）')
  assert(Array.isArray(report.need.gaps), '报告含"当前缺口"列表')
  assert(report.need.gaps.every((g) => typeof g.code === 'string'), '回合报告缺口使用稳定 code')
  assert(report.changes.counts.every((c) => !('label' in c)), '回合报告计数变化不携带宿主中文标签')
  BRIDGE.rememberTurnReport('s-report', report)
  assertEq(BRIDGE.latestTurnReport('s-report')?.turn, 3, '按会话读回最近报告')
  assertEq(BRIDGE.latestTurnReport('s-unknown'), undefined, '没有报告的会话返回 undefined')
  assertEq(BRIDGE.rememberTurnReport(undefined, report), undefined, '没有会话 id 时静默忽略（不抛错）')

  // 装配桥：pre-step 必须放行，turn-stopping 必须**记录报告且不追加消息**。
  //
  // ⚠️ 两层边界（2026-09 用户拍板）：
  //   1. 只有**研究工作区**（有 `project.md` / `research-state.md`）才算进展；
  //   2. 报告**不进会话日志** —— DSH 必然把 plugin 来源的消息显示成"上下文注入"，
  //      所以展示改由客户端在会话头部的「研究进展」按钮后面渲染（见 [9]）。
  const ws = mkdtempSync(join(tmpdir(), 'cf-bridge-'))
  writeFileSync(
    join(ws, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )
  const listeners = {}
  const fakeCtx = { on: (name, fn) => { listeners[name] = fn }, logger: { warn: () => {}, info: () => {} } }
  const dispose = BRIDGE.mountProgressBridge(fakeCtx, () => ws, baseContent)
  assert(typeof listeners['agent/pre-step'] === 'function', '订阅了 agent/pre-step（记录本轮起点）')
  assert(typeof listeners['agent/turn-stopping'] === 'function', '订阅了 agent/turn-stopping（本轮结束报告）')

  let nextCalled = false
  listeners['agent/pre-step']({ turn: 1 }, () => { nextCalled = true; return 'NEXT' })
  assertEq(nextCalled, true, '⚠️ pre-step waterfall **必须放行**（否则会阻断 Agent 运行）')

  const sent = []
  listeners['agent/turn-stopping']({
    turn: 1,
    agent: { id: 's-research', session: { append: (t, d, o) => sent.push({ t, d, o }) } },
  })
  assertEq(sent.length, 0, '研究工作区：**不再**追加会话消息（避免被显示成"上下文注入"）')
  assertEq(BRIDGE.latestTurnReport('s-research')?.turn, 1, '研究工作区：本轮报告已记录给界面')
  dispose()

  // 反例：非研究工作区（普通对话）**不**产生报告
  const plain = mkdtempSync(join(tmpdir(), 'cf-bridge-plain-'))
  const plainListeners = {}
  const disposePlain = BRIDGE.mountProgressBridge(
    { on: (name, fn) => { plainListeners[name] = fn }, logger: { warn: () => {}, info: () => {} } },
    () => plain,
    baseContent,
  )
  const sentPlain = []
  plainListeners['agent/pre-step']({ turn: 1 }, () => 'NEXT')
  plainListeners['agent/turn-stopping']({
    turn: 1,
    agent: { id: 's-plain', session: { append: (t, d, o) => sentPlain.push({ t, d, o }) } },
  })
  assertEq(sentPlain.length, 0, '非研究工作区：不追加消息（普通对话不受打扰）')
  assertEq(BRIDGE.latestTurnReport('s-plain'), undefined, '非研究工作区：不产生回合报告（面板不显示"本轮变化"）')
  disposePlain()
}

/* ════════════════════════════════════════════════════════════════════════
 * 7b. `progress/workspace` 端点：判定必须按**会话自己的工作区**
 *
 * 这是 2026-09 故障的回归测试：旧客户端靠进程级全局变量猜"当前是不是研究会话"，
 * 结果进度出现在所有会话里。现在判定只在宿主做，且输入是会话自己的 cwd。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[7b] progress/workspace：按会话自己的工作区判定')
{
  const wsResearch = mkdtempSync(join(tmpdir(), 'cf-rpc-research-'))
  writeFileSync(
    join(wsResearch, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )
  const wsPlain = mkdtempSync(join(tmpdir(), 'cf-rpc-plain-'))
  writeFileSync(join(wsPlain, 'notes.txt'), 'ordinary working directory\n')

  const handler = RPC.createSettingsRpcHandler({
    getConfig: () => ({}),
    store: CUST.createMemoryCustomizationStore(),
    resolveSessionWorkspace: (id) =>
      ({ 's-rpc-research': wsResearch, 's-plain': wsPlain })[id],
  })

  const research = await handler('progress/workspace', { sessionId: 's-rpc-research' })
  assertEq(research.ok, true, '研究工作区：端点返回 ok')
  assertEq(research.value.research, true, '研究工作区：research=true（按钮显示）')
  assertEq(research.value.protocol, PROTO.HOST_PROTOCOL, '进展端点带回协议号')
  assertEq(research.value.workspace, wsResearch, '研究工作区：返回的是研究根目录')
  assertEq(research.value.report?.progress.dimensions.length, 6, '面板数据含 6 个成熟度维度')
  assert(Array.isArray(research.value.report?.counts), '面板数据含可数资产')
  // 端点算出来的必须与"纯函数 + 同一份磁盘状态"完全一致（否则就是两套判定）
  const expected = PROG.buildWorkspaceProgress(PROG.captureProgress(wsResearch, baseContent))
  assertEq(
    { ...research.value.report, at: null },
    { ...expected, at: null },
    '端点结果 == 纯函数在同一工作区上的结果（不另算一套）',
  )
  assertEq(research.value.lastTurn, null, '本会话还没有回合报告 → lastTurn=null（界面自己说明，不编造）')
  // 有回合报告的会话：端点带回来（面板的"最近一轮变化"一节）
  const snapHere = PROG.captureProgress(wsResearch, baseContent)
  const turnReport = PROG.buildTurnReport(PROG.diffProgress(snapHere, snapHere), 2)
  BRIDGE.rememberTurnReport('s-rpc-research', turnReport)
  const withTurn = await handler('progress/workspace', { sessionId: 's-rpc-research' })
  assertEq(withTurn.value.lastTurn?.turn, 2, '有回合报告 → lastTurn 带回来（且只来自**这个**会话）')
  assertEq(
    (await handler('progress/workspace', { sessionId: 's-plain' })).value.lastTurn,
    null,
    '另一个会话读不到别人的回合报告（报告按会话 id 存）',
  )

  const plain = await handler('progress/workspace', { sessionId: 's-plain' })
  assertEq(plain.value.research, false, '普通目录：research=false')
  assertEq(plain.value.report, null, '普通目录：不返回任何进度数据（按钮不显示）')
  const unknown = await handler('progress/workspace', { sessionId: 's-missing' })
  assertEq(unknown.value.research, false, '拿不到会话工作区 → 不显示（不猜、不退化到插件进程目录）')
  assertEq(unknown.value.workspace, null, '拿不到会话工作区 → workspace=null（不编一个路径）')

  // 旧的两个端点必须**删掉**：留着就会有两套判定并存，故障会从另一边回来
  const legacySession = await handler('progress/session', { sessionId: 's-research' })
  const legacyLatest = await handler('progress/latest', { sessionId: 's-research' })
  assertEq(legacySession.ok, false, '旧的 progress/session 端点已删除')
  assertEq(legacyLatest.ok, false, '旧的 progress/latest 端点已删除')

  rmSync(wsResearch, { recursive: true, force: true })
  rmSync(wsPlain, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 8. 推进判定：方向明确就自动继续，遇到抉择才问用户
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[8] 推进判定与自动继续闸门')
{
  const mk = (opts = {}) => {
    const ws = mkdtempSync(join(tmpdir(), 'cf-adv-'))
    mkdirSync(join(ws, 'research'), { recursive: true })
    const q = opts.questions ?? ['- Q1 能不能降低 ATE？']
    writeFileSync(
      join(ws, 'project.md'),
      ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '',
       '## Research Statement', '', 'T', '', '## Research Questions', '', ...q, '', '## Domain', '', 'Robotics', ''].join('\n'),
    )
    if (opts.plans) {
      mkdirSync(join(ws, 'plans'), { recursive: true })
      for (const id of opts.plans) writeFileSync(join(ws, 'plans', `${id}.md`), `# Plan: ${id}\n\n## Objective\n\n${id}\n`)
    }
    return ws
  }

  // ① 方向明确 → clear，可自动继续
  const wsClear = mk()
  const aClear = ADV.assessAdvance({ workspace: wsClear })
  assertEq(aClear.clarity, 'clear', '无阻塞/无歧义/未停滞 → clear')
  assertEq(aClear.basisCode, 'stagePending', 'clear 判定带稳定 basisCode')
  assert(typeof aClear.nextStep === 'string' && aClear.nextStep.length > 0, 'clear 时给出下一步')
  assertEq(aClear.needsUserDecision, undefined, 'clear 时不要求用户决定')
  assertEq(ADV.shouldAutoContinue(aClear, ADV.DEFAULT_AUTO_CONTINUE, 0).go, true, 'clear 且预算未用 → 自动继续')
  assertEq(
    ADV.shouldAutoContinue(aClear, ADV.DEFAULT_AUTO_CONTINUE, ADV.DEFAULT_AUTO_CONTINUE.maxRounds).go,
    false,
    '预算用尽 → 停止自动继续（防止无人值守跑飞）',
  )
  assertEq(ADV.shouldAutoContinue(aClear, { enabled: false, maxRounds: 3 }, 0).go, false, '设置里关掉 → 不自动继续')
  rmSync(wsClear, { recursive: true, force: true })

  // ② 显式阻塞标记 → blocked，必须问用户
  const wsBlocked = mk({ questions: ['- [blocking] 用哪种评测协议才公平？'] })
  const aBlocked = ADV.assessAdvance({ workspace: wsBlocked })
  assertEq(aBlocked.clarity, 'blocked', '显式标记 [blocking] → blocked')
  assertEq(aBlocked.basisCode, 'blockingQuestion', 'blocked 判定带稳定 basisCode')
  assert(aBlocked.needsUserDecision?.includes('[blocking]'), '把待决问题原文交给用户')
  assertEq(ADV.shouldAutoContinue(aBlocked, ADV.DEFAULT_AUTO_CONTINUE, 0).go, false, 'blocked 时绝不自动继续')
  // 中文写法同样识别
  const wsBlockedZh = mk({ questions: ['- Q0（阻塞项）校准指哪一件事？'] })
  assertEq(ADV.assessAdvance({ workspace: wsBlockedZh }).clarity, 'blocked', '中文「（阻塞项）」同样识别')
  assertEq(ADV.findBlockingQuestion(['- 普通问题', '- [BLOCKING] 大写也认']) !== undefined, true, '标记大小写不敏感')
  rmSync(wsBlocked, { recursive: true, force: true })
  rmSync(wsBlockedZh, { recursive: true, force: true })

  // ③ 连续停滞 → 交回用户（不自作主张换方向）
  const wsStale = mk()
  const aStale = ADV.assessAdvance({ workspace: wsStale, staleRounds: ADV.DEFAULT_STALE_THRESHOLD })
  assertEq(aStale.clarity, 'ambiguous', `连续 ${ADV.DEFAULT_STALE_THRESHOLD} 轮无资产 → ambiguous`)
  assertEq(aStale.decisionCode, 'stalled', '停滞提示带稳定 decisionCode')
  assert(/没有形成新的可验证研究资产/.test(aStale.basis), '停滞依据可核查')
  assertEq(ADV.shouldAutoContinue(aStale, ADV.DEFAULT_AUTO_CONTINUE, 0).go, false, '停滞时停止自动推进')
  rmSync(wsStale, { recursive: true, force: true })

  // ④ 多个 draft 计划 → 方向未收敛，问用户
  const wsDrafts = mk({ plans: ['alpha', 'beta'] })
  const aDrafts = ADV.assessAdvance({ workspace: wsDrafts })
  assertEq(aDrafts.clarity, 'ambiguous', '两个 draft 计划并存 → ambiguous')
  assertEq(aDrafts.decisionCode, 'draftPlans', '多计划提示带稳定 decisionCode')
  assert(/draft/.test(aDrafts.basis), '指出是草稿未定')
  rmSync(wsDrafts, { recursive: true, force: true })

  // ⑤ 判定进入快照与展示
  const snap = PROG.captureProgress('.', baseContent)
  assert(snap.advance !== undefined, '快照里带推进判定')
  const r = PROG.renderProgressNotice(PROG.diffProgress(snap, snap), snap.advance)
  assert(/推进判定/.test(r.text), '进展块里展示推进判定')
  assert(/方向明确 → 可直接推进|需要你选一个方向|等你拍板/.test(r.text), '给出三态之一的明确措辞')
  assert(/可继续|待你定/.test(r.summary), 'summary 里也带一句推进判定')

  // ⑥ 桥：clear 时自动继续；用户插话后立即停止
  const listeners2 = {}
  const followed = []
  let insertCb = null
  const fakeCtx2 = {
    on: (name, fn) => { listeners2[name] = fn },
    logger: { warn: () => {}, info: () => {} },
  }
  const wsAuto = mk()
  const dispose2 = BRIDGE.mountProgressBridge(
    fakeCtx2,
    () => wsAuto,
    undefined,
    { enabled: true, maxRounds: 2 },
  )
  insertCb = listeners2['agent/inbox/inserted']
  assert(typeof insertCb === 'function', '订阅 agent/inbox/inserted（用于识别用户接管）')

  const agentLike = {
    session: { append: () => {} },
    followup: (m) => followed.push(m),
  }
  listeners2['agent/pre-step']({ turn: 1 }, () => {})
  listeners2['agent/turn-stopping']({ turn: 1, agent: agentLike })
  assertEq(followed.length, 1, 'clear 且预算未用 → 自动继续一轮')

  // 用户插话 → 立刻停止自动推进
  insertCb({ message: { source: { kind: 'user' } } })
  listeners2['agent/pre-step']({ turn: 2 }, () => {})
  listeners2['agent/turn-stopping']({ turn: 2, agent: agentLike })
  assertEq(followed.length, 1, '用户插话后不再自动推进（用户随时可接管）')

  // 自动推进产生的消息不能被误判成"用户插话"
  const followedBefore = followed.length
  insertCb({ message: { source: { kind: 'plugin', plugin: PROGRESS_PLUGIN_NAME } } })
  assertEq(followed.length, followedBefore, '（前提）插件自身消息不改变计数')
  dispose2()
  rmSync(wsAuto, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 9. 客户端：顶部按钮（session 作用域的 list 槽位），且**没有**跨会话全局状态
 *
 * 旧故障的根因是一个进程级全局变量（`activeSessionId` + `researchSessions` 缓存）：
 * 链式槽位的 selector 拿不到会话身份，只能靠它猜，于是命中所有会话。这里既做
 * **源码/产物层面的回归守卫**（不许再出现这类状态、不许再占用对话流尾部槽位），
 * 也在 node 里求值 bundle，测真正的判定函数。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[9] 客户端：按钮只认自己会话的工作区（无跨会话全局状态）')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'progress-panel.tsx'), 'utf8')
  const bundle = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  const srcCode = stripComments(src)

  assert(
    !/activeSessionId|researchSessions/.test(srcCode),
    'progress-panel.tsx 的**代码**里不再有进程级"当前会话"状态',
  )
  assert(!/activeSessionId|researchSessions/.test(bundle), 'bundle 里没有任何跨会话缓存（旧故障根因已消失）')
  assert(bundle.includes('conversation.session.header.utilities'), 'bundle 注册在**会话头部工具槽位**（session 作用域）')
  assert(!bundle.includes('conversation.chat.turnTail'), 'bundle 不再占用对话流尾部的链式槽位（不再抢 deliverables）')
  assert(!bundle.includes('conversation.input.dock'), 'bundle 不再用预热组件（判定不再依赖"先挂载过"）')
  assert(bundle.includes('progress/workspace'), 'bundle 调的是新端点 progress/workspace')

  /* ── 图标旁的百分比（用户要求）+ 面板必须是**浅色**底 ──────────────────
   *
   * ⚠️ 面板曾经是深色的：`--dsw-alias-bg-elevated` 这个 token **不存在**，
   * 于是静默落到兜底值 `#1b1d22`（深色）。CSS 变量写错名字不会报错，只会用兜底 ——
   * 所以这里既检查"用的是真实 token"，也检查"兜底值是浅色"。
   */
  assert(bundle.includes('data-convfusion-progress-percent'), '按钮在图标旁显示百分比')
  assert(!/dsw-alias-bg-elevated|#1b1d22/.test(bundle), '不再使用不存在的 --dsw-alias-bg-elevated / 深色兜底')

  // token 名单抄自 DSH 的 `@deepseek-ai/dsh-client-ui-theme`（alias 层）；写错名字会静默失效
  const KNOWN_DSW_TOKENS = new Set([
    '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3',
    '--dsw-alias-bg-mask-1', '--dsw-alias-bg-overlay', '--dsw-alias-bg-module-platform',
    '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-border-l4',
    '--dsw-alias-brand-primary', '--dsw-alias-button-tool-bar-fill', '--dsw-alias-button-tool-bar-hover',
    '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-active',
    '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary',
    '--dsw-alias-label-dimmed', '--dsw-alias-label-caption',
    '--dsw-alias-state-business-primary', '--dsw-alias-state-error-primary', '--dsw-alias-tooltip-bg',
  ])
  const usedTokens = [...new Set([...src.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))]
  assert(usedTokens.length > 0, '面板确实使用 DSH 主题 token')
  for (const token of usedTokens) {
    assert(KNOWN_DSW_TOKENS.has(token), `token ${token} 是 DSH 真实存在的 alias token`)
  }
  assert(/--dsw-alias-bg-layer-2[^)]*,\s*#fff/i.test(src), '面板底色用 bg-layer-2，兜底值是**浅色**')

  // 在 node 里求值 bundle：顶层只注册 factory，给一个 window 桩即可拿到导出
  let mod = null
  try {
    let captured = null
    new Function('window', bundle)({ __ModuleLoader__: { load: (m) => { captured = m } } })
    mod = captured.factory(createRequire(import.meta.url))
  } catch (e) {
    assert(false, `bundle 可在 node 求值：${e instanceof Error ? e.message : String(e)}`)
  }

  if (mod) {
    assertEq(typeof mod.ResearchProgressButton, 'function', 'bundle 导出 ResearchProgressButton')
    // 判定：只有宿主明确回答 research=true 才显示按钮
    assertEq(
      mod.readProgressValue({ ok: true, value: { protocol: PROTO.HOST_PROTOCOL, research: true } }).kind,
      'shown',
      '研究工作区 → 显示按钮',
    )
    assertEq(
      mod.readProgressValue({ ok: true, value: { protocol: PROTO.HOST_PROTOCOL, research: false } }).kind,
      'hidden',
      '非研究工作区 → 不显示',
    )
    assertEq(
      mod.readProgressValue({ ok: true, value: { protocol: PROTO.HOST_PROTOCOL - 1, research: true } }).kind,
      'hidden',
      '旧宿主协议 → 隐藏按钮（不让新客户端按旧形状渲染崩溃）',
    )
    assertEq(mod.readProgressValue({ ok: false }).kind, 'hidden', '宿主出错 → 不显示（不猜）')
    assertEq(mod.readProgressValue(undefined).kind, 'hidden', '宿主没回答 → 不显示（不猜）')
    const shown = mod.readProgressValue({
      ok: true,
      value: {
        protocol: PROTO.HOST_PROTOCOL,
        research: true,
        workspace: '/a/b/workspace',
        report: { progress: { dimensions: [] } },
        lastTurn: null,
      },
    })
    assertEq(shown.workspace, '/a/b/workspace', '面板带工作区路径（用户能确认看的是哪个项目）')
    assertEq(mod.shortenPath('/a/b/c/workspace'), 'c/workspace', '路径只保留末两段')
    assertEq(mod.shortenPath(null), '', '没有路径 → 空串（不编一个）')
  }
}

rmSync(join(tmpdir(), 'nonexistent-cf-progress-'), { recursive: true, force: true })

console.log('\n[10] Research Guide：语言规定')
{
  const guide = CTX.RESEARCH_GUIDE_TEXT
  assert(typeof guide === 'string' && guide.includes('Language:'), 'Guide 有 Language 一节')
  assert(
    guide.includes('in the language of the user'),
    '规定「跟用户输入的语言回答」（而不是跟着英文系统提示走）',
  )
  assert(guide.includes('中文'), '给出中文示例（中文提问用中文回答）')
  assert(guide.includes('Never switch the user to English'), '明确禁止「因为系统提示是英文就拿英文回用户」')
  assert(guide.includes('Write paper materials and data in English'), '规定论文材料与数据用英文')
  assert(/papers\//.test(guide) && /datasets/.test(guide), '点名 `papers/` 与数据/实验结果')
  assert(guide.includes('follows the'), '写明其余工作笔记随对话语言')
}

console.log(`\n${failed === 0 ? '✅' : '❌'} progress: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
