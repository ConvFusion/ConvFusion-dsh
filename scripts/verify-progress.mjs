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
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
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
const CL = await import(lib('research/claims.js'))
const EV = await import(lib('research/evidence.js'))

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
  assertEq(bareReport.works.length, 0, '没有论文目录 → 0 个工作（界面不出 tab）')
  rmSync(bare, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 5c. 多个研究工作：一个工作 = 一篇论文，每个工作只报**自己的**事实
 *
 * 工作区同时跑多篇论文时，"论文正文：已有"这种聚合陈述分不清是哪一篇。
 * 所以 `works` 必须逐工作给数（章节/主张/证据/缺口/成熟度），并且**不能**把
 * 聚合值当成分工作的值；同时聚合字段一个都不能少（向后兼容）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[5c] 多个研究工作：每个工作只报自己的事实')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-works-'))
  writeFileSync(
    join(ws, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )
  mkdirSync(join(ws, 'papers', 'paper-alpha'), { recursive: true })
  writeFileSync(
    join(ws, 'papers', 'paper-alpha', 'paper.md'),
    ['# Alpha Work', '', '## Abstract', '', 'a'.repeat(80), '', '## Method', '', 'b'.repeat(80), ''].join('\n'),
  )
  mkdirSync(join(ws, 'papers', 'paper-beta'), { recursive: true })
  writeFileSync(
    join(ws, 'papers', 'paper-beta', 'paper.md'),
    ['# Beta Work', '', '## Abstract', '', 'c'.repeat(80), ''].join('\n'),
  )
  // 真实工作区里 `papers/__pycache__` 存在 —— 它不是一篇论文，不能算一个工作
  mkdirSync(join(ws, 'papers', '__pycache__'), { recursive: true })

  const report = PROG.buildWorkspaceProgress(PROG.captureProgress(ws, baseContent))
  assertEq(report.works.length, 2, '两个论文目录 → 两个工作（papers/__pycache__ 不算）')
  assertEq(report.works.map((w) => w.id), ['paper-alpha', 'paper-beta'], '工作按 id 稳定排序')
  assert(report.works.every((w) => w.title && w.short), '每个工作都有标题与短标题（tab 用）')
  assertEq(report.works[0].counts.sections, 2, '章节数只数**这个工作**自己的正文')
  assertEq(report.works[1].counts.sections, 1, '另一个工作的章节数独立（不是聚合值）')
  assertEq(report.works[0].maturity.length, 9, '工作成熟度是 9 个论文维度')
  assertEq(report.works[1].maturity.length, 9, '（同上）')
  assert(['recorded', 'derived'].includes(report.works[0].maturitySource), '成熟度标明来源（记录值 / 按资产推定）')
  const mean = report.works[0].maturity.reduce((a, d) => a + d.scale, 0) / 9
  assert(Math.abs(report.works[0].overall - mean) < 1e-9, '工作的整体折算 = 它自己 9 个维度的均值')
  assert(report.works[0].counts.gaps >= 1, '规则检查的缺口被计入（实时检测，不依赖 gaps.md）')
  assert(Boolean(report.works[0].next?.code), '最高优先级缺口成为"下一步"')
  assert(!/[\u4e00-\u9fff]/.test(JSON.stringify(report.works)), '工作数据只带稳定 key/数值，不带宿主中文文案')
  // 聚合字段一个都不能少
  assertEq(report.progress.dimensions.length, 6, '聚合成熟度仍是 6 个 Research State 维度')
  assert(report.counts.some((r) => r.key === 'evidence'), '聚合可数资产仍在')
  assert(typeof report.paper === 'boolean', '聚合"论文正文有/无"仍在')

  // ── 回归（2026-10-05）：正文判定**不得**锚定硬编码的 `paper-main` ────────────
  // 本夹具只有 `paper-alpha` / `paper-beta`，正是**多论文工作区**的形态（真实工作区里
  // 论文叫 `paper-d2-method`、`paper-d-research-ir-method`）。修复前 `hasManuscript` 与
  // `paperPresent` 都只看 `DEFAULT_PAPER_ID`，于是这类工作区被判成"尚无论文正文" ——
  // 进度面板与阶段判定同时出错，而旧断言从没覆盖过它。
  assertEq(report.paper, true, '有论文正文的多论文工作区：聚合"论文正文有/无"为真（不锚定 paper-main）')
  assertEq(PROG.captureProgress(ws, baseContent).counts.paperPresent, true,
    '项目级 paperPresent 为真（不锚定 paper-main）')
  {
    const assessed = PROC.assessResearchProcess(ws)
    const writing = assessed.stages.find((x) => x.stage.id === 'writing')
    assertEq(writing?.satisfied, true, '论文写作阶段：存在论文正文即落地（不锚定 paper-main）')
    assertEq(assessed.missing.some((x) => x.stage.id === 'writing'), false,
      '论文写作不应出现在 missing 里（否则"当前阶段"会被错报成写作）')
  }
  // ── 多论文进度汇总：逐篇一行 + 合计，且共享证据**不相加** ────────────────────
  {
    const works2 = PROG.captureWorkProgress(ws)
    const agg = PROG.aggregateWorks(works2)
    assertEq(works2.length, 2, '两个论文目录 → 两个工作')
    assertEq(agg?.works, 2, '合计的参与工作数为 2')
    assertEq(agg?.rows.length, 2, '合计里每个工作一行（顺序与工作 tab 一致）')
    assertEq(agg?.rows[0].counts.sections, 2, '行内计数是该工作自己的（第一篇 2 章）')
    assertEq(agg?.rows[1].counts.sections, 1, '行内计数是该工作自己的（第二篇 1 章）')
    assertEq(agg?.totals.evidence, PROG.sharedEvidenceCount(works2),
      '共享证据库只报一份，不按工作数相加（相加会与项目级读数当场矛盾）')
    assertEq(PROG.aggregateWorks(works2.slice(0, 1)), null, '只有一个工作时不出合计（界面不出总览 tab）')
  }

  rmSync(join(ws, 'papers', 'paper-beta'), { recursive: true, force: true })
  assertEq(PROG.captureProgress(ws, baseContent).works.length, 1, '删掉一篇 → 只剩一个工作（界面不出 tab）')
  rmSync(ws, { recursive: true, force: true })
  const gone = mkdtempSync(join(tmpdir(), 'cf-works-gone-'))
  assertEq(PROG.captureProgress(gone, baseContent).works.length, 0, '工作区不存在时 0 个工作（不抛错）')
  rmSync(gone, { recursive: true, force: true })

  // 短标题收缩：tab 不能被长标题撑爆，但完整标题仍保留在 title 里
  assertEq(
    PROG.shortWorkTitle('Harnessing Scientific Reasoning with a Typed Research IR', 'p'),
    'Harnessing Scientific',
    '长标题收成前两个词',
  )
  assertEq(
    PROG.shortWorkTitle('Verifying Research Commitments: State-Transition Gating', 'p'),
    'Verifying Research',
    '优先取副标题之前的部分',
  )
  assertEq(PROG.shortWorkTitle('', 'paper-x'), 'paper-x', '没有标题 → 退回 id')

  // 工作面板只传缺口**类型**，短语在客户端本地化 —— 所以每种类型都必须有中英双语，
  // 否则界面会退化成显示原始 code（提示词纪律：宿主不传成品文案，客户端不许缺词条）。
  const union = /export type PaperGapType =([\s\S]*?)\n\nexport/.exec(
    readFileSync(join(PKG, 'src', 'research', 'paper-data.ts'), 'utf8'),
  )?.[1] ?? ''
  const gapTypes = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])
  assert(gapTypes.length >= 10, `从源码解析出 ${gapTypes.length} 种缺口类型`)
  const en = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
  const zh = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const untranslated = gapTypes.filter((type) => !( `progress.work.gap.${type}` in en && `progress.work.gap.${type}` in zh))
  assertEq(untranslated, [], '每种缺口类型都有中英双语短语（不会退化成显示 code）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 5d. 总览（多工作）：汇总 = 各工作逐项之和；单工作路径一字不变（v2）
 *
 * 用户反馈：加了工作 tab 之后，「总览」仍然只重复某一个工作的内容。修法是让总览
 * 概括**所有**工作（逐工作一行 + 合计）。这里守两件事：
 *   ① 合计只能**做加法** —— 同一个数字不能在总览与工作 tab 上不同（同一来源，不重算）；
 *   ② 工作数 ≤ 1 时报告**不带**汇总字段 —— 单工作的行为与加汇总之前完全一致。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[5d] 总览（多工作）：汇总 = 各工作逐项之和，单工作路径不变')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-agg-'))
  writeFileSync(
    join(ws, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )

  // Alpha：两个章节（都有实质内容）、正文引用了 E001、一个**有证据**的主张
  mkdirSync(join(ws, 'papers', 'paper-alpha'), { recursive: true })
  writeFileSync(
    join(ws, 'papers', 'paper-alpha', 'paper.md'),
    ['# Alpha Work', '', '## Abstract', '', 'a'.repeat(80), '', '## Method', '', `uses E001. ${'b'.repeat(80)}`, ''].join('\n'),
  )
  writeFileSync(join(ws, 'papers', 'paper-alpha', 'claims.md'), ['## C001', '', 'Alpha claim.', ''].join('\n'))
  CL.createClaim(ws, { id: 'C001', statement: 'Alpha claim.', evidence: ['E001'], paper: 'paper-alpha' })
  // 两条真实证据（工作区证据库是**共用**的，见下面的合计例外）
  EV.createEvidence(ws, { name: 'Alpha run', sourceKind: 'experiment', rawArtifacts: ['alpha.json'], claim: 'Alpha claim.' })
  EV.createEvidence(ws, { name: 'Beta run', sourceKind: 'experiment', rawArtifacts: ['beta.json'] })

  // Beta：一个章节、一个**无证据**的主张、一个待修订提案 —— 两个工作明显不同量
  mkdirSync(join(ws, 'papers', 'paper-beta', 'proposals'), { recursive: true })
  writeFileSync(
    join(ws, 'papers', 'paper-beta', 'paper.md'),
    ['# Beta Work', '', '## Abstract', '', 'c'.repeat(80), ''].join('\n'),
  )
  writeFileSync(join(ws, 'papers', 'paper-beta', 'claims.md'), ['## C002', '', 'Beta claim.', ''].join('\n'))
  CL.createClaim(ws, { id: 'C002', statement: 'Beta claim.', paper: 'paper-beta' })
  writeFileSync(
    join(ws, 'papers', 'paper-beta', 'proposals', 'RP001.md'),
    ['---', 'id: RP001', 'type: paper-revision-proposal', 'status: proposed', 'trigger: test', '---', '',
     '# Revision Proposal RP001', '', '## Reason', '', 'test', ''].join('\n'),
  )

  const snap = PROG.captureProgress(ws, baseContent)
  const report = PROG.buildWorkspaceProgress(snap, new Date(0))
  assertEq(report.works.length, 2, '（前提）两个工作')
  assert(Boolean(report.aggregate), '多于一个工作 → 报告带汇总（总览有东西可概括）')
  const agg = report.aggregate

  assertEq(agg.works, 2, '汇总写明参与合计的工作数')
  assertEq(agg.rows.map((r) => r.id), report.works.map((w) => w.id), '汇总行与工作 tab 同序同 id')
  assert(
    agg.rows.every((r) => r.title && r.short && typeof r.overall === 'number' && typeof r.active === 'boolean'),
    '每行带短标题 / 全标题 / 成熟度折算 / 激活标记',
  )
  assert(agg.rows.every((r) => ['recorded', 'derived'].includes(r.maturitySource)), '每行标明成熟度来源（记录值 / 推定）')

  const KEYS = [
    'sections', 'sectionsWithContent', 'claims', 'claimsWithoutEvidence', 'evidence',
    'evidenceUsedInManuscript', 'gaps', 'gapsHigh', 'openProposals',
  ]
  assertEq(Object.keys(agg.totals).sort(), [...KEYS].sort(), '合计的键与工作计数键完全一致（没有漏项、没有多算）')
  for (const key of KEYS.filter((k) => k !== 'evidence')) {
    assertEq(
      agg.rows.map((r) => r.counts[key]),
      report.works.map((w) => w.counts[key]),
      `行内 ${key} 就是这个工作自己的数（照搬，不另算一套）`,
    )
    assertEq(
      agg.totals[key],
      report.works.reduce((a, w) => a + w.counts[key], 0),
      `合计 ${key} = 各工作之和`,
    )
  }
  // ⚠️ 唯一的例外：`evidence` 是**全工作区共用**的一份证据库（`paperStatusSummary` 里
  // `evidence.total = listEvidence(workspace).length`），每个工作报的都是同一个读数。
  // 相加会把同一批证据按工作数重复计（2 个工作 × 2 条 → 4），与同一面板里项目级 A2 的
  // 「证据 2」当场矛盾 —— 所以合计只报**一份**，并且这条断言要能抓住"改回相加"。
  const evidenceSum = report.works.reduce((a, w) => a + w.counts.evidence, 0)
  assert(evidenceSum > agg.totals.evidence, `（前提）证据库共用，相加确实会多计（${evidenceSum} > ${agg.totals.evidence}）`)
  assertEq(agg.totals.evidence, PROG.sharedEvidenceCount(snap.works), '证据合计 = 各工作共享的那**一份**证据库读数')
  assertEq(
    report.works.map((w) => w.counts.evidence),
    report.works.map(() => agg.totals.evidence),
    '（依据）每个工作的证据总数是同一个共享读数，不是各自独立的数',
  )
  assertEq(
    agg.totals.evidenceUsedInManuscript,
    report.works.reduce((a, w) => a + w.counts.evidenceUsedInManuscript, 0),
    '「正文引用」确实是分工作的 → 照旧相加',
  )
  assertEq(agg.rows.map((r) => r.overall), report.works.map((w) => w.overall), '行内成熟度就是该工作的成熟度折算')
  assertEq(agg.rows.map((r) => r.active), report.works.map((w) => w.active), '激活标记逐行照搬')

  // 非空洞性：这些合计不是"一串 0 相加"（否则上面每条求和断言都自动成立）
  assert(
    agg.totals.sectionsWithContent >= 3 && agg.totals.claims >= 2,
    `合计非平凡（章节 ${agg.totals.sectionsWithContent}/${agg.totals.sections}，主张 ${agg.totals.claims}）`,
  )
  assert(agg.totals.claimsWithoutEvidence >= 1, '合计里带"无支撑"子集（不是只数总数）')
  assert(agg.totals.evidenceUsedInManuscript >= 1, '合计里带"正文引用"子集')
  assert(agg.totals.gaps >= 2, '合计里带未解决缺口')
  assert(agg.totals.openProposals >= 1, '合计里带待修订提案')
  assertEq(
    agg.totals.claims,
    agg.rows.reduce((a, r) => a + r.counts.claims, 0),
    '合计也能由**行**复算（表格与合计自洽）',
  )

  // 单一来源 + 纯函数：同一份快照必得同一份汇总
  assertEq(PROG.aggregateWorks(snap.works), agg, 'aggregateWorks(快照里的 works) == 报告里的汇总')
  assertEq(
    { ...PROG.sumWorkCounts(report.works.map((w) => w.counts)), evidence: agg.totals.evidence },
    agg.totals,
    'sumWorkCounts 与汇总合计一致（证据一项按共用读数覆盖，见上面的例外）',
  )
  assertEq(PROG.buildWorkspaceProgress(snap, new Date(0)), report, '同一份磁盘状态 → 同一份报告（汇总不引入随机性）')
  assertEq(PROG.aggregateWorks([]), null, '0 个工作 → 没有汇总')
  assertEq(PROG.aggregateWorks([report.works[0]]), null, '1 个工作 → 没有汇总（单工作没有"合计"可言）')
  assert(!/[\u4e00-\u9fff]/.test(JSON.stringify(agg)), '汇总只带稳定 key/数值，不带宿主中文文案（短语由客户端本地化）')

  // 端点 == 纯函数（多工作时同样成立）
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () => ({}),
    store: CUST.createMemoryCustomizationStore(),
    resolveSessionWorkspace: () => ws,
  })
  const res = await handler('progress/workspace', { sessionId: 's-agg' })
  assertEq(res.value.research, true, '（前提）多工作工作区是研究项目')
  assertEq({ ...res.value.report, at: null }, { ...report, at: null }, '端点结果 == 纯函数结果（多工作也一样）')
  assertEq(res.value.report?.aggregate, agg, '端点带回汇总（面板拿到的就是这一个）')

  // 单工作：**连字段都不带** —— 面板行为与加汇总之前一字不变
  rmSync(join(ws, 'papers', 'paper-beta'), { recursive: true, force: true })
  const one = PROG.buildWorkspaceProgress(PROG.captureProgress(ws, baseContent), new Date(0))
  assertEq(one.works.length, 1, '（前提）删掉一篇后只剩一个工作')
  assert(!('aggregate' in one), '单工作 → 报告里没有汇总字段')
  assertEq(
    Object.keys(one),
    ['at', 'stateVersion', 'overall', 'works', 'progress', 'counts', 'paper', 'need'],
    '单工作的字段集合与加汇总之前完全一致（旧客户端不会看到多余字段）',
  )

  /* ── 渲染（离线，无 DOM）：汇总块**真的**被画出来，而不只是源码里有 ──────────
   *
   * 把组件当普通函数跑，hooks 打桩、JSX 返回普通对象树 → 可以遍历出"面板实际渲染了
   * 什么"。这条断言比源码正则强：它证明 props → 输出这条链真的通（组合错、条件写反、
   * 数字传错都会在这里现形），也是在没有浏览器的情况下能做的最接近"看一眼"的检查。
   * ──────────────────────────────────────────────────────────────────── */
  console.log('\n[5e] 总览渲染（离线）：两个工作画出汇总块，单工作 / 工作 tab 不画')
  const dict = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
  const mkT = (d) => (key, params) => {
    const tpl = d[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in params ? String(params[n]) : m)) : tpl
  }
  const bundleSource = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  let capturedModule = null
  new Function('window', bundleSource)({ __ModuleLoader__: { load: (m) => { capturedModule = m } } })
  /**
   * 把面板"渲染"成一棵普通对象树（hooks 打桩；不做 DOM、不装 react-dom）。
   *
   * 面板本体（`ResearchProgressPanel`）现在的 state 顺序是 `probe / busy / workId`
   * —— 它不再有"打开/关闭"（那是浮层时代的事，现在这一页就是 tab 的正文）。
   */
  const render = (rep, workId = '') => {
    const initial = [{ kind: 'shown', workspace: '/a/b/workspace', report: rep, lastTurn: null }, false, workId]
    let hook = 0
    const noop = () => {}
    const ReactStub = {
      Fragment: Symbol.for('react.fragment'),
      createElement: (type, props, ...children) => ({
        type,
        props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] },
      }),
      useState: (v) => [hook < initial.length ? initial[hook++] : v, noop],
      useEffect: noop,
      useLayoutEffect: noop,
      useRef: () => ({ current: null }),
      useCallback: (fn) => fn,
    }
    const jsxStub = (type, props) => ({ type, props: props ?? {} })
    const fakeRequire = (id) => {
      if (id === 'react') return ReactStub
      if (id === 'react/jsx-runtime') return { jsx: jsxStub, jsxs: jsxStub, Fragment: ReactStub.Fragment }
      throw new Error(`客户端 bundle 只该 require react / react/jsx-runtime，却要了 ${id}`)
    }
    return capturedModule.factory(fakeRequire).ResearchProgressPanel({ sessionId: 's-render', t: mkT(dict) })
  }
  const texts = (node, out = []) => {
    if (node === null || node === undefined || typeof node === 'boolean') return out
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
    if (Array.isArray(node)) { for (const n of node) texts(n, out); return out }
    if (typeof node === 'object' && 'props' in node) texts(node.props?.children, out)
    return out
  }
  const find = (node, pred, out = []) => {
    if (!node || typeof node !== 'object') return out
    if (Array.isArray(node)) { for (const n of node) find(n, pred, out); return out }
    if ('props' in node) {
      if (pred(node)) out.push(node)
      find(node.props?.children, pred, out)
    }
    return out
  }
  const aggBlocksIn = (tree) => find(tree, (n) => n.props?.['data-convfusion-progress-aggregate'] !== undefined)
  const tabsIn = (tree) => find(tree, (n) => n.props?.['data-convfusion-progress-tabs'] !== undefined)

  const overview = render(report)
  assertEq(aggBlocksIn(overview).length, 1, '两个工作 + 总览 → 汇总块真的渲染出来')
  assertEq(tabsIn(overview).length, 1, '（前提）两个工作 → 有 tab 条')
  const aggText = texts(aggBlocksIn(overview)[0]).join(' | ')
  assert(
    aggText.includes(dict['progress.works.totals'].replace('{count}', '2')),
    '合计行写明确实是 2 个工作',
  )
  assert(
    aggText.includes(report.works[0].short) && aggText.includes(report.works[1].short),
    '两个工作各占一行（总览概括**所有**工作，不是复述某一个）',
  )
  assert(
    aggText.includes(`${agg.totals.sectionsWithContent}/${agg.totals.sections}`),
    `合计行的章节数 = 各工作之和（${agg.totals.sectionsWithContent}/${agg.totals.sections}）`,
  )
  assert(aggText.includes('1 (1)'), '某一行的"无支撑主张"以括号子集画出（不是只给总数）')
  const hint = find(aggBlocksIn(overview)[0], (n) =>
    String(n.props?.title ?? '') === dict['progress.work.count.claimsWithoutEvidence'].replace('{count}', '1'),
  )
  assert(hint.length >= 1, '括号里的子集含义有悬停说明（面板里不塞解释文字）')
  // 证据列：共用证据库只报一份，且每格都带"共用证据库"的悬停说明（否则会被看成漏加了）
  const sharedEvidenceCells = find(aggBlocksIn(overview)[0], (n) =>
    String(n.props?.title ?? '').includes(dict['progress.works.evidenceShared']),
  )
  const evidenceCellText = (n) => (n > 0 ? `${agg.totals.evidence} (${n})` : String(agg.totals.evidence))
  assertEq(
    sharedEvidenceCells.map((n) => texts(n).join('')),
    [
      ...report.works.map((w) => evidenceCellText(w.counts.evidenceUsedInManuscript)),
      evidenceCellText(agg.totals.evidenceUsedInManuscript),
    ],
    '证据列：两个工作各一份共享读数，合计也是**一份**（不相加），并带悬停说明',
  )
  assert(
    aggText.includes(`${Math.round(report.works[0].overall * 100)}%`),
    '每行带该工作自己的成熟度折算',
  )
  // 总览仍然保留**项目级**的 A / A2 / B / C（它们不是分工作的读数）
  const overviewText = texts(overview).join(' | ')
  assert(overviewText.includes(dict['progress.section.maturity']), '总览仍保留项目级 A（Research State 成熟度）')
  assert(overviewText.includes(dict['progress.section.assets']), '总览仍保留项目级 A2（可数资产）')
  assert(overviewText.includes(dict['progress.section.need']), '总览仍保留项目级 C（缺口与推进判定）')

  const onWork = render(report, report.works[0].id)
  assertEq(aggBlocksIn(onWork).length, 0, '工作 tab → 不画汇总块（汇总只属于总览）')
  assertEq(tabsIn(onWork).length, 1, '工作 tab 仍在 tab 条里（切换没被汇总块挡住）')
  assert(
    texts(onWork).includes(dict['progress.work.section.assets']),
    '工作 tab 渲染的是该工作自己的资产一段（原行为未变）',
  )

  const only = render(one)
  assertEq(aggBlocksIn(only).length, 0, '单工作 → 不画汇总块（行为与加汇总之前一致）')
  assertEq(tabsIn(only).length, 0, '单工作 → 也没有 tab 条')

  const zero = mkdtempSync(join(tmpdir(), 'cf-agg-zero-'))
  assert(!('aggregate' in PROG.buildWorkspaceProgress(PROG.captureProgress(zero, baseContent))), '0 个工作 → 也没有汇总字段')
  rmSync(zero, { recursive: true, force: true })
  rmSync(ws, { recursive: true, force: true })

  // 汇总用的每个词条都必须中英双语（宿主不传成品文案 → 客户端不能缺词条）
  const enDict = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
  const zhDict = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const aggKeys = [
    'progress.works.section.aggregate',
    'progress.works.col.work', 'progress.works.col.maturity', 'progress.works.col.sections',
    'progress.works.col.claims', 'progress.works.col.evidence', 'progress.works.col.gaps',
    'progress.works.col.proposals', 'progress.works.totals', 'progress.works.derived',
    'progress.works.evidenceShared',
  ]
  assertEq(aggKeys.filter((k) => !(k in enDict) || !(k in zhDict)), [], '汇总用到的每个 key 都有中英双语')
  assert(
    /\{count\}/.test(enDict['progress.works.totals']) && /\{count\}/.test(zhDict['progress.works.totals']),
    '「合计」一行两种语言都带 {count} 占位符（同 key 同占位符）',
  )
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

// token 名单抄自 DSH 的 `@deepseek-ai/dsh-client-ui-theme`（alias 层）；写错名字会静默失效
// （`[9]` 的进展面板与 `[9b]` 的 ConvFusion.com 浮层共用这一份）。
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
console.log('\n[9] 客户端：研究进展 tab 只认自己会话的工作区（无跨会话全局状态）')
{
  const src = readFileSync(join(PKG, 'src', 'client', 'progress-panel.tsx'), 'utf8')
  const bundle = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  const srcCode = stripComments(src)

  assert(
    !/activeSessionId|researchSessions/.test(srcCode),
    'progress-panel.tsx 的**代码**里不再有进程级"当前会话"状态',
  )
  assert(!/activeSessionId|researchSessions/.test(bundle), 'bundle 里没有任何跨会话缓存（旧故障根因已消失）')
  assert(bundle.includes('conversation.view'), 'bundle 注册在**会话 tab 的 roster 槽位**（conversation.view）')
  assert(!bundle.includes('conversation.session.header.utilities'), '顶部不再挂任何 ConvFusion 入口（只留 tab）')
  assert(!bundle.includes('conversation.chat.turnTail'), 'bundle 不再占用对话流尾部的链式槽位（不再抢 deliverables）')
  assert(!bundle.includes('conversation.input.dock'), 'bundle 不再用预热组件（判定不再依赖"先挂载过"）')
  assert(bundle.includes('progress/workspace'), 'bundle 调的是新端点 progress/workspace')
  // 多研究工作：tab 条**只在多于一个**工作时出现（单工作必须与从前完全一致）
  assert(/works\.length > 1/.test(srcCode), 'tab 判定 = 工作数 > 1（单工作不加一层切换）')
  assert(bundle.includes('data-convfusion-progress-tabs'), '多工作时渲染工作 tab 条')
  assert(/report\?\.works \?\? \[\]/.test(srcCode), 'works 按可选读（老宿主缺字段时退回聚合视图）')
  // 总览（多工作）：汇总块只在「总览 + 多于一个工作」时出现，行/合计都来自宿主那一个字段
  assert(/multi && report\.aggregate/.test(srcCode), '汇总块的条件 = 总览 + 多于一个工作（单工作不渲染）')
  assert(/report\.aggregate\.rows\.map/.test(srcCode), '工作行来自宿主的汇总（界面不自己聚合）')
  assert(/report\.aggregate\.totals/.test(srcCode), '合计行来自宿主的汇总（界面不自己求和）')
  assert(
    !/\.reduce\(\(a, w\) => a \+ w\.counts/.test(srcCode),
    '界面不对各工作计数求和（求和只有宿主一处，避免两处漂移）',
  )
  assert(bundle.includes('data-convfusion-progress-aggregate'), '多工作的总览渲染汇总块（带标记属性，便于人工与离线确认）')

  /* ── 百分比挪到 **tab 文案**（用户 2026-10 拍板）+ 页面必须是**浅色**底 ──
   *
   * 百分比不再在 header 的徽章上，而是写进 tab 文案（「研究进展 62%」）：数值来自闸门
   * 对宿主的那一次探针，所以**面板没挂载时 tab 上也有数**；roster 只在槽位/语言变化时
   * 重读 label，因此数值变化必须让闸门**重注册**（见 [9c] 的断言）。
   *
   * ⚠️ 这些页面曾经是深色的：`--dsw-alias-bg-elevated` 这个 token **不存在**，
   * 于是静默落到兜底值 `#1b1d22`（深色）。CSS 变量写错名字不会报错，只会用兜底 ——
   * 所以这里既检查"用的是真实 token"，也检查"兜底值是浅色"。
   */
  assert(bundle.includes('progress.tab.label'), 'tab 文案带百分比（progress.tab.label）')
  assert(/percentText/.test(bundle), '百分比由闸门从宿主答案里格式化（面板没挂载也有数）')
  assert(!/dsw-alias-bg-elevated|#1b1d22/.test(bundle), '不再使用不存在的 --dsw-alias-bg-elevated / 深色兜底')

  // token 名单见本节前的 KNOWN_DSW_TOKENS（与 [9b] 共用）
  const usedTokens = [...new Set([...src.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))]
  assert(usedTokens.length > 0, '面板确实使用 DSH 主题 token')
  for (const token of usedTokens) {
    assert(KNOWN_DSW_TOKENS.has(token), `token ${token} 是 DSH 真实存在的 alias token`)
  }
  // 整页容器（tab 正文）自己给底色与滚动：会话正文容器没有 overflow，中心列还是 hidden
  const viewSrc = readFileSync(join(PKG, 'src', 'client', 'progress-panel.tsx'), 'utf8')
  assert(/--dsw-alias-bg-base[^)]*,\s*#fff/i.test(viewSrc), '整页容器的底色用 bg-base，兜底值是**浅色**')
  assert(/overflowY: 'auto'/.test(viewSrc), '整页容器自己是滚动容器（viewArea 没有 overflow）')

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
    assertEq(typeof mod.ResearchProgressView, 'function', 'bundle 导出 ResearchProgressView（tab 正文）')
    // 判定：只有宿主明确回答 research=true 才算"研究工作区"（tab 的注册条件）
    assertEq(
      mod.readProgressValue({ ok: true, value: { protocol: PROTO.HOST_PROTOCOL, research: true } }).kind,
      'shown',
      '研究工作区 → 显示',
    )
    assertEq(
      mod.readProgressValue({ ok: true, value: { protocol: PROTO.HOST_PROTOCOL, research: false } }).kind,
      'hidden',
      '非研究工作区 → 不显示',
    )
    assertEq(
      mod.readProgressValue({ ok: true, value: { protocol: PROTO.HOST_PROTOCOL - 1, research: true } }).kind,
      'hidden',
      '旧宿主协议 → 隐藏（不让新客户端按旧形状渲染崩溃）',
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

/* ════════════════════════════════════════════════════════════════════════
 * 9b. 客户端：**只留 tab** —— 顶部不再有 ConvFusion 入口，两个 tab 的声明正确
 *
 * 用户 2026-10 拍板：顶部那两个按钮（研究进展 / 科V社区）全部移除，改成会话 Tab。
 * 这里守住三件事：
 *   ① 顶部工具槽位里**没有任何** ConvFusion 条目（残留会变成"两处入口"）；
 *   ② 两个 tab 的声明：id / order / 文案，且**研究进展排在科V社区之前**（19 < 20）；
 *   ③ 复用与边界：内容与设置页是同一份实现；不在浏览器里缓存凭据、不写死服务器地址。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[9b] 客户端：只留 tab（顶部无入口；两个 tab 的声明与顺序）')
{
  const settingsSrc = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const indexSrc = readFileSync(join(PKG, 'src', 'client', 'index.tsx'), 'utf8')
  const gateSrc = readFileSync(join(PKG, 'src', 'client', 'convfusion-tab.ts'), 'utf8')
  const bundle = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')

  // ① 顶部不再挂任何 ConvFusion 入口，浮层实现文件也不在（残留 = 两处入口）
  assert(!bundle.includes('conversation.session.header.utilities'), '顶部工具槽位里没有 ConvFusion 条目')
  assert(!existsSync(join(PKG, 'src', 'client', 'community-panel.tsx')), '浮层实现文件已删除')

  // ② 两个 tab 的声明与顺序（顺序即用户要求的「研究进展在科V社区之前」）
  assert(bundle.includes('convfusion-progress'), '注册了研究进展 tab（id = convfusion-progress）')
  assert(bundle.includes('convfusion-community'), '注册了科V社区 tab（id = convfusion-community）')
  assert(/PROGRESS_VIEW_ORDER = 19/.test(gateSrc), '研究进展 order = 19')
  assert(/COMMUNITY_VIEW_ORDER = 20/.test(gateSrc), '科V社区 order = 20')
  const specsSrc = gateSrc.slice(gateSrc.indexOf('export function convfusionTabSpecs'))
  assert(
    specsSrc.indexOf('PROGRESS_VIEW_ID') < specsSrc.indexOf('COMMUNITY_VIEW_ID'),
    '声明顺序 = 研究进展在前（与 order 一致，谁先谁后一眼可读）',
  )
  assert(/ResearchProgressView as unknown as React\.ComponentType/.test(gateSrc), '研究进展 tab 的正文是 ResearchProgressView')
  assert(
    /CommunityView as unknown as React\.ComponentType/.test(gateSrc),
    '科V社区 tab 的正文是 CommunityView',
  )

  // ③ 复用与静态边界
  assert(/export function CommunityTab\(/.test(settingsSrc), '设置页把 CommunityTab 导出（可被 tab 复用）')
  const viewSrc = readFileSync(join(PKG, 'src', 'client', 'community-view.tsx'), 'utf8')
  assert(
    /import \{ CommunityTab[^}]*\} from '\.\/settings\.js'/.test(viewSrc),
    '科V社区 tab 正文 import 的是设置页那一个 CommunityTab（不是另写一份）',
  )
  assert(!/https?:\/\//.test(viewSrc + gateSrc), 'tab 与闸门都不写死服务器地址（全部经宿主 account/*）')
  assert(!/localStorage|sessionStorage/.test(viewSrc + gateSrc + indexSrc), '不在浏览器里缓存凭据')

  // 入口名与设置页标题**必须是两个 key**（用户 2026-09 拍板，仍然有效）
  const zh = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const en = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
  assertEq(zh['community.entry.label'], '科V社区', '中文界面 tab 叫「科V社区」')
  assertEq(en['community.entry.label'], 'ConvFusion.com', '英文界面 tab 仍是 ConvFusion.com')
  assertEq(zh['community.title'], 'ConvFusion.com', '设置页那一页的名字未被改动')
  assertEq(zh['progress.tab.label'], '研究进展 {percent}', '研究进展 tab 的文案带百分比')
  assertEq(en['progress.tab.label'], 'Progress {percent}', '英文同样带百分比')

  // 只有一份 CommunityTab 实现（重复实现会各带一份）
  const communityTabDefs = bundle.split('function CommunityTab(').length - 1
  assertEq(communityTabDefs, 1, 'bundle 里只有一份 CommunityTab 实现')
}

/* ════════════════════════════════════════════════════════════════════════
 * 9c. 客户端：两个会话 Tab（研究进展 19 / 科V社区 20）—— 只在研究工作区出现
 *
 * `conversation.view` 的 roster 是**全局**的（所有会话共用；唯一的按会话过滤是官方硬编码的
 * trajectory + 开发者工具开关），所以"只在研究工作区显示"只能靠**随当前显示的会话注册 / 注销
 * **实现。这里用桩 ctx（录注册项）+ 桩会话服务 + 桩 fetch 求值真 bundle，钉住六件事：
 *   ① 只有宿主明确回答 research=true 才注册，而且**两个 tab 一起注册 / 一起注销**；
 *   ② id 与 order 正确（研究进展 19 → 科V社区 20；> trajectory 10 ⇒ 两个一起在最右）；
 *   ③ 研究进展的**文案带百分比**（面板没挂载时 tab 上也有数），且数值变化会重注册刷文案、
 *      没变化则不抖 roster；
 *   ④ 会话切换会跟着注册/注销；**再次进入已知研究会话是同步注册**（不等探针，避免闪一下对话）；
 *   ⑤ 失败即隐藏：无会话服务 / 端点报错 / 协议过旧 → 一条都不注册；
 *   ⑥ 纯函数：当前显示会话的判据、百分比格式化。
 * 另外钉住"内容复用"：科V社区 tab 的正文 import 的是设置页那一个 CommunityTab（不是另写一份）。
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[9c] 客户端：两个会话 Tab（研究进展 19 / 科V社区 20，条件注册：只在研究工作区）')
{
  const indexSrc = readFileSync(join(PKG, 'src', 'client', 'index.tsx'), 'utf8')
  const viewSrc = readFileSync(join(PKG, 'src', 'client', 'community-view.tsx'), 'utf8')
  const gateSrc = readFileSync(join(PKG, 'src', 'client', 'convfusion-tab.ts'), 'utf8')
  const bundle = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')

  /* ── 静态边界：复用、最右、不碰别人的槽位 ───────────────────────────── */
  assert(
    /import \{ CommunityTab[^}]*\} from '\.\/settings\.js'/.test(viewSrc),
    'tab 正文 import 的是设置页那一个 CommunityTab（不是另写一份）',
  )
  assert(/<CommunityTab\s/.test(viewSrc), 'tab 正文真的渲染 CommunityTab')
  assert(bundle.includes('data-convfusion-community-view'), 'tab 正文带自己的标记属性')
  assert(/overflowY: 'auto'/.test(viewSrc), 'tab 正文自己是滚动容器（viewArea 没有 overflow）')
  // roster 是全局的：所以显隐只能靠注册/注销，而且判据不能是"猜一个研究工作区出来"
  assert(/conversation\.view/.test(gateSrc), '闸门注册的是 conversation.view（会话 tab 的 roster 槽位）')
  // 冷启动回归（2026-10 实测：两个 tab 静默消失）：cordis 的 `ctx.get` 默认 strict，
  // 提供者 fiber 未 ACTIVE 时返回 undefined —— 所以必须①写成 inject 依赖，②读不到要"等"。
  assert(
    /export const inject = \[[^\]]*'sessions'/.test(indexSrc),
    'index.tsx 把 sessions 写成 inject 依赖（不是 get 一次就放弃）',
  )
  assert(
    /host\.inject\(\['sessions'\]/.test(gateSrc),
    '闸门读不到会话服务时用 ctx.inject 等它就绪（而不是直接 return）',
  )
  assert(/retainedBy\?\.mainView|retainedBy\.mainView/.test(gateSrc), '「当前显示的会话」用 DSH 自己的判据：retainedBy.mainView')
  assert(!/activeSessionId|researchSessions/.test(gateSrc), '没有进程级的"当前会话"缓存（旧故障根因）')
  assert(/progress\/workspace/.test(gateSrc), '判据复用宿主 progress/workspace（与「研究进展」按钮同一个）')
  assert(/registry|localStorage/.test(viewSrc + gateSrc) === false, 'tab 与闸门都不在浏览器里缓存状态')

  /* ── 求值真 bundle：桩 ctx + 桩会话服务 + 桩 fetch ───────────────────── */
  let mod = null
  try {
    let captured = null
    new Function('window', bundle)({ __ModuleLoader__: { load: (m) => { captured = m } } })
    mod = captured.factory(createRequire(import.meta.url))
  } catch (e) {
    assert(false, `bundle 可在 node 求值：${e instanceof Error ? e.message : String(e)}`)
  }

  const tick = () => new Promise((r) => setTimeout(r, 0))

  /** 假会话服务：`select(id)` 模拟"保留态转移到该会话"并推送新快照。 */
  const createSessions = (ids) => {
    const byId = {}
    for (const id of ids) byId[id] = { id, retainedBy: {} }
    const listeners = new Set()
    return {
      service: {
        list: {
          getSnapshot: () => ({ byId }),
          subscribe: (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
          },
        },
      },
      select(id) {
        for (const key of Object.keys(byId)) byId[key] = { ...byId[key], retainedBy: key === id ? { mainView: 1 } : {} }
        for (const l of [...listeners]) l()
      },
      clear() {
        for (const key of Object.keys(byId)) byId[key] = { ...byId[key], retainedBy: {} }
        for (const l of [...listeners]) l()
      },
    }
  }

  /**
   * 桩 ctx：录注册项（按槽位分组）、桩 locale、可用 `get('sessions')` 注入会话服务。
   *
   * 还录下 `ctx.inject(deps, cb)`（cordis 的**作用域注入**）——冷启动时服务可能还没 ACTIVE，
   * 闸门要靠它等服务（见 createCtx 返回的 `fireServiceInject`）。
   */
  const createCtx = (sessions) => {
    const registered = []
    const injects = []
    const serviceInjects = []
    const disposers = []
    const ctx = {
      locale: {
        register: () => () => {},
        bind: () => (key, params) =>
          params === undefined
            ? key
            : `${key}:${Object.entries(params)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(',')}`,
      },
      configForms: {
        get: () => ({
          getSnapshot: () => ({ status: 'ready' }),
          subscribe: () => () => {},
          set: async () => true,
          unset: async () => true,
        }),
      },
      slots: {
        inject: (key, callback) => {
          injects.push(key)
          const dispose = callback()
          if (typeof dispose === 'function') disposers.push(dispose)
          return () => {}
        },
        register: (options, component) => {
          const record = { options, component }
          registered.push(record)
          return () => {
            const at = registered.indexOf(record)
            if (at >= 0) registered.splice(at, 1)
          }
        },
      },
      effect: (callback) => callback(),
      get: (name) => (name === 'sessions' ? sessions : undefined),
      inject: (deps, callback) => {
        serviceInjects.push({ deps, callback })
        return () => {}
      },
    }
    return {
      ctx,
      registered,
      injects,
      serviceInjects,
      /**
       * 触发 cordis 作用域注入的回调：模拟"服务终于 ACTIVE 了"。
       *
       * @param service - 该作用域里 `get('sessions')` 会返回的东西。
       */
      fireServiceInject: (service) => {
        for (const { callback } of serviceInjects.splice(0)) {
          callback({ slots: ctx.slots, inject: ctx.inject, get: (name) => (name === 'sessions' ? service : undefined) })
        }
      },
      list: () => registered.filter((r) => r.options.name === 'conversation.view'),
      /**
       * 卸载：跑一遍 `slots.inject` 回调返回的 disposer。
       *
       * ⚠️ 必须做：闸门注册期间挂了一个低频轮询（`setInterval`），不清理的话 node 的事件
       * 循环永远不空，脚本会一直挂着（实测踩过）。真宿主在插件卸载时就会调用它。
       */
      disposeAll: () => {
        for (const dispose of disposers.splice(0)) dispose()
      },
    }
  }

  const originals = {
    fetch: globalThis.fetch,
    document: globalThis.document,
  }
  /**
   * 假 document：只为让闸门挂上 visibilitychange（离线覆盖"工作区变了"那条路）。
   *
   * ⚠️ 必须**每个 apply 一份**：桩 ctx 不会卸载上一次的闸门，共用一个 document 会让
   * `fireVisible()` 同时叫醒前面所有子用例的处理器（实测踩过：调用次数 2 ≠ 1）。
   */
  const makeDoc = () => {
    const handlers = new Set()
    const doc = {
      visibilityState: 'visible',
      addEventListener: (type, handler) => {
        if (type === 'visibilitychange') handlers.add(handler)
      },
      removeEventListener: (type, handler) => {
        if (type === 'visibilitychange') handlers.delete(handler)
      },
    }
    return {
      doc,
      fireVisible: () => {
        for (const handler of [...handlers]) handler()
      },
    }
  }
  globalThis.document = makeDoc().doc

  /** 桩宿主：`answer` 是 progress/workspace 的返回值（null = 抛错）。 */
  let answer = null
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), payload: JSON.parse(init.body).payload })
    if (answer === null) throw new Error('host unreachable')
    return { ok: true, json: async () => answer }
  }
  const research = (isResearch, overall = 0.62) => ({
    ok: true,
    value: {
      protocol: PROTO.HOST_PROTOCOL,
      sessionId: 'A',
      workspace: isResearch ? '/w/workspace' : null,
      research: isResearch,
      report: isResearch ? { overall } : null,
      lastTurn: null,
    },
  })

  /** 已建过的桩 ctx：退出前必须卸载（闸门注册期间挂着低频轮询定时器）。 */
  const created = []
  const newCtx = (sessions) => {
    const fake = createCtx(sessions)
    created.push(fake)
    return fake
  }
  /** 按 tab id 取一条注册项。 */
  const byId = (fake, id) => fake.list().find((r) => r.options.id === id)

  try {
    /* ── ① 没有会话被显示 → 不注册；也没有会话服务 → 不注册（fail closed）── */
    {
      const s = createSessions(['A', 'B'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()
      assertEq(fake.list().length, 0, '没有会话被显示 → 不注册 tab')
      assert(fake.injects.includes('conversation.view'), '闸门等在 conversation.view 声明上')

      // 服务还没就绪（冷启动的真实情形：`ctx.get` 默认 strict，提供者未 ACTIVE 就是 undefined）
      const noSessions = newCtx(undefined)
      mod.apply(noSessions.ctx)
      await tick()
      assertEq(noSessions.list().length, 0, '服务还没就绪 → 先不注册（不猜）')
      assertEq(noSessions.serviceInjects.length, 1, '也不放弃：改成**等**会话服务（ctx.inject）')
      assertEq(noSessions.serviceInjects[0].deps[0], 'sessions', '等的是 sessions 服务')
    }

    /* ── ①b 冷启动路径：服务稍后才就绪 → 一等它就装上（tab 不再静默消失）── */
    {
      const s = createSessions(['A'])
      const fake = newCtx(undefined)
      mod.apply(fake.ctx)
      await tick()
      assertEq(fake.list().length, 0, '（前提）服务未就绪时没有 tab')

      answer = research(true, 0.5)
      s.select('A')
      await tick()
      assertEq(fake.list().length, 0, '服务没就绪期间，会话切换也不会凭空出现 tab')

      fake.fireServiceInject(s.service)
      await tick()
      assertEq(fake.list().length, 2, '服务就绪 → 两个 tab 装上（这是 2026-10 那次冷启动丢 tab 的回归点）')
      assertEq(fake.serviceInjects.length, 0, '就绪后不再重复等')
    }

    /* ── ② 会话 A = 研究 → 两个 tab 一起注册，id / order / 文案正确 ─────── */
    {
      const s = createSessions(['A', 'B'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()

      calls.length = 0
      answer = research(true, 0.62)
      s.select('A')
      await tick()
      assertEq(fake.list().length, 2, '研究工作区的会话 → 一次注册**两个** tab')

      const progress = byId(fake, 'convfusion-progress')
      const community = byId(fake, 'convfusion-community')
      assert(progress !== undefined && community !== undefined, '两个 tab 都在 roster 里')

      // 顺序：研究进展 19 → 科V社区 20（用户 2026-10 指定"研究进展在科V社区之前"）
      assertEq(progress.options.order, mod.PROGRESS_VIEW_ORDER, `研究进展 order = ${mod.PROGRESS_VIEW_ORDER}`)
      assertEq(community.options.order, mod.COMMUNITY_VIEW_ORDER, `科V社区 order = ${mod.COMMUNITY_VIEW_ORDER}`)
      assert(progress.options.order < community.options.order, '研究进展排在科V社区之前')
      assertEq(progress.options.order, 19, '研究进展 order 字面量 = 19')
      assertEq(community.options.order, 20, '科V社区 order 字面量 = 20（> trajectory 10，一起在最右）')

      assertEq(progress.options.name, 'conversation.view', '注册进会话 tab 的 roster 槽位')
      assertEq(progress.options.locale, 'convfusion', '声明自己的 locale（tab 文案跟随语言）')
      assertEq(progress.options.id, 'convfusion-progress', 'id = convfusion-progress')
      assertEq(community.options.id, 'convfusion-community', 'id = convfusion-community')
      assertEq(progress.component, mod.ResearchProgressView, '研究进展 tab 的正文是导出的 ResearchProgressView')
      assertEq(community.component, mod.CommunityView, '科V社区 tab 的正文是导出的 CommunityView')

      // 文案：研究进展**带百分比**（面板没挂载时 tab 上也有数），科V社区是固定名
      assert(progress.options.label().startsWith('progress.tab.label'), '研究进展 tab 文案走 progress.tab.label')
      assert(progress.options.label().includes('percent=62%'), '研究进展 tab 文案里带上了百分比（62%）')
      assertEq(community.options.label(), 'community.entry.label', '科V社区 tab 文案取 community.entry.label')

      assertEq(calls.length, 1, '一次会话切换只问一次宿主（两个 tab 共用同一次判定）')
      assertEq(calls[0].url, '/dsh-convfusion/progress/workspace', '问的是宿主 progress/workspace')
      assertEq(calls[0].payload.sessionId, 'A', '带上被显示会话的 id（判定按会话，不靠猜）')
    }

    /* ── ③ 会话切换：B 非研究 → 两个一起注销；切回 A（缓存命中）→ **同步**注册 ── */
    {
      const s = createSessions(['A', 'B'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()

      answer = research(true)
      s.select('A')
      await tick()
      assertEq(fake.list().length, 2, 'A（研究）→ 两个 tab 一起注册')

      calls.length = 0
      answer = research(false)
      s.select('B')
      await tick()
      assertEq(fake.list().length, 0, 'B（非研究）→ 两个一起注销')
      assertEq(calls.length, 1, 'B 也判一次（每个会话各自判定）')

      calls.length = 0
      s.select('A')
      assertEq(fake.list().length, 2, '切回 A：已知研究 → **同步**注册（不等探针，不闪对话）')
      assertEq(calls.length, 0, '缓存命中时不再调用宿主')

      // 没有会话被显示（例如归档了当前会话）→ 注销
      s.clear()
      await tick()
      assertEq(fake.list().length, 0, '没有会话被显示 → 注销 tab')
    }

    /* ── ④ 工作区变了：窗口重新可见时重判（force）→ 注销 ───────────────── */
    {
      const visibility = makeDoc()
      globalThis.document = visibility.doc
      const s = createSessions(['A'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()
      answer = research(true)
      s.select('A')
      await tick()
      assertEq(fake.list().length, 2, 'A（研究）→ 两个 tab 一起注册')

      calls.length = 0
      answer = research(false)
      visibility.fireVisible()
      await tick()
      assertEq(calls.length, 1, '窗口重新可见 → 忽略缓存重问一次（工作区可能刚被改动）')
      assertEq(fake.list().length, 0, '工作区不再是研究工作区 → 两个一起注销')
    }

    /* ── ⑤ 百分比变了 → 重注册一次，让 roster 重读 label（tab 文案跟着变）── */
    {
      const visibility = makeDoc()
      globalThis.document = visibility.doc
      const s = createSessions(['A'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()
      answer = research(true, 0.62)
      s.select('A')
      await tick()
      assert(byId(fake, 'convfusion-progress').options.label().includes('percent=62%'), '（前提）tab 文案是 62%')

      calls.length = 0
      answer = research(true, 0.71)
      visibility.fireVisible()
      await tick()
      assertEq(fake.list().length, 2, '百分比变化后仍然是两个 tab（重注册，不是消失）')
      assertEq(calls.length, 1, '重判一次（百分比的新值只能从宿主拿）')
      const label = byId(fake, 'convfusion-progress').options.label()
      assert(label.includes('percent=71%'), 'tab 文案跟到新值（71%）')
      assert(!label.includes('62%'), '旧值不再留在文案里')

      // 百分比没变时不重注册（否则每次轮询都会抖一次 roster）
      const before = byId(fake, 'convfusion-progress')
      visibility.fireVisible()
      await tick()
      assertEq(byId(fake, 'convfusion-progress'), before, '百分比没变 → 注册项不动（不抖 roster）')
    }

    /* ── ⑥ 失败即隐藏：端点报错 / 协议过旧 都不注册 ─────────────────────── */
    {
      const s = createSessions(['A'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()
      answer = null // 抛错
      s.select('A')
      await tick()
      assertEq(fake.list().length, 0, '宿主不可达 → 不注册 tab')

      const s2 = createSessions(['A'])
      const fake2 = newCtx(s2.service)
      mod.apply(fake2.ctx)
      await tick()
      answer = { ok: true, value: { protocol: PROTO.HOST_PROTOCOL - 1, research: true } }
      s2.select('A')
      await tick()
      assertEq(fake2.list().length, 0, '旧宿主协议（形状不可信）→ 不注册 tab')
    }

    /* ── ⑦ research=true 但宿主没给报告 → 注册，文案退回不带百分比 ──────── */
    {
      const s = createSessions(['A'])
      const fake = newCtx(s.service)
      mod.apply(fake.ctx)
      await tick()
      answer = { ok: true, value: { protocol: PROTO.HOST_PROTOCOL, research: true, report: null } }
      s.select('A')
      await tick()
      assertEq(fake.list().length, 2, 'research=true 就算没有报告也注册（会话确实是研究工作区）')
      assertEq(
        byId(fake, 'convfusion-progress').options.label(),
        'progress.name',
        '没有报告 → 文案退回不带百分比的 progress.name（不编一个数）',
      )
    }

    /* ── ⑧ 纯函数 ───────────────────────────────────────────────────────── */
    assertEq(
      mod.currentMainSessionId({ byId: { A: { id: 'A', retainedBy: {} }, B: { id: 'B', retainedBy: { other: 2 } } } }),
      undefined,
      '没有任何会话带 mainView 保留 → undefined（不猜一个）',
    )
    assertEq(
      mod.currentMainSessionId({ byId: { A: { id: 'A', retainedBy: {} }, B: { id: 'B', retainedBy: { mainView: 1 } } } }),
      'B',
      'retainedBy.mainView > 0 的那个就是当前显示的会话',
    )
    assertEq(mod.currentMainSessionId(undefined), undefined, '拿不到会话列表 → undefined')
    assertEq(mod.percentText(0.623), '62%', '百分比文本四舍五入到整数（与面板同一个口径）')
    assertEq(mod.percentText(1), '100%', '1 → 100%')
    assertEq(mod.percentText(undefined), undefined, '没有值 → undefined（tab 文案退回名字）')
    assertEq(mod.percentText(Number.NaN), undefined, 'NaN → undefined（不编一个数）')

    // 两个 tab 的声明（顺序即 order）：直接调纯函数核对一遍
    const specs = mod.convfusionTabSpecs((key, params) => (params ? `${key} ${JSON.stringify(params)}` : key))
    assertEq(specs.length, 2, 'convfusionTabSpecs 声明两个 tab')
    assertEq(specs[0].id, 'convfusion-progress', '声明顺序：第一个是研究进展')
    assertEq(specs[1].id, 'convfusion-community', '声明顺序：第二个是科V社区')
    assertEq(specs[0].order, 19, '研究进展 order = 19')
    assertEq(specs[1].order, 20, '科V社区 order = 20')
  } finally {
    globalThis.fetch = originals.fetch
    if (originals.document === undefined) delete globalThis.document
    else globalThis.document = originals.document
    // 卸载所有桩 ctx：闸门的低频轮询不清掉，node 的事件循环永远不空（脚本会挂住）
    for (const fake of created) fake.disposeAll()
  }
}

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

console.log('\n[11] C00 全局能力：研究者自定义流程被注入')
{
  // 不注入的话，这段流程只在"按需加载技能"时才可见 → 模型看不到，就得靠用户每轮提醒才推进。
  const baseSkill = (id) => LIB.effectiveSkillContentById(id, CUST.createMemoryCustomizationStore())
  assertEq(
    CTX.extractProcessGuidance(baseSkill(PROC.PROCESS_SKILL_ID)),
    undefined,
    '没写自定义 → 不注入流程（默认仍是：只描述阶段、不规定顺序）',
  )

  const store = CUST.createMemoryCustomizationStore()
  store.set(PROC.PROCESS_SKILL_ID, 'Research Method', '先快速产出论文草稿（草稿导向）。')
  assertEq(
    CTX.extractProcessGuidance(LIB.effectiveSkillContentById(PROC.PROCESS_SKILL_ID, store)),
    '先快速产出论文草稿（草稿导向）。',
    '只取用户写的那一段（不含系统默认正文）',
  )

  const onlyOther = CUST.createMemoryCustomizationStore()
  onlyOther.set(PROC.PROCESS_SKILL_ID, 'Purpose', '只改了用途。')
  assertEq(
    CTX.extractProcessGuidance(LIB.effectiveSkillContentById(PROC.PROCESS_SKILL_ID, onlyOther)),
    undefined,
    '只改了别的章节 → 不当作流程注入',
  )

  // ⚠️ 「研究方法」这一章**同时承载机器可读的阶段块**（技能正文允许用户在那里改研究过程）：
  // 那一段必须被剔掉 —— 阶段定义已由上面的阶段列表渲染，原文再注入只是重复。
  const stageBlock = ['```text', 'stage: data | 数据审计 | research-understanding | topic-proposed | 报告', '```'].join('\n')
  const withStages = CUST.createMemoryCustomizationStore()
  withStages.set(PROC.PROCESS_SKILL_ID, 'Research Method', `我的过程：\n\n${stageBlock}\n\n先做数据审计，再建模。`)
  const effStages = LIB.effectiveSkillContentById(PROC.PROCESS_SKILL_ID, withStages)
  const guidance = CTX.extractProcessGuidance(effStages)
  assertEq(guidance, '先做数据审计，再建模。', '注入的流程里剔掉了 stage 块与只剩标签的残行')
  assert(
    PROC.parseStages(effStages)?.some((s) => s.id === 'data'),
    '阶段块本身仍按用户定义生效（注入剔除不影响过程解析）',
  )

  const onlyStages = CUST.createMemoryCustomizationStore()
  onlyStages.set(PROC.PROCESS_SKILL_ID, 'Research Method', stageBlock)
  assertEq(
    CTX.extractProcessGuidance(LIB.effectiveSkillContentById(PROC.PROCESS_SKILL_ID, onlyStages)),
    undefined,
    '只写了阶段块（相当于只定制过程定义）→ 不注入流程',
  )

  // 端到端：注入后上下文出现「本项目自己的流程」，且原「阶段不是流水线」的边界仍在
  const ws = mkdtempSync(join(tmpdir(), 'cf-c00-'))
  // ⚠️ 必须是**研究工作区**（有 project.md）：非研究工作区整体不注入任何上下文
  writeFileSync(
    join(ws, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', ''].join('\n'),
  )
  const sc = (id) => LIB.effectiveSkillContentById(id, store)
  const text = CTX.renderResearchContext(CTX.collectResearchContext({ workspace: ws, skillContent: sc }), '')
  assert(text.includes("## Research process (this project's own flow)"), '上下文有「本项目自己的流程」一节')
  assert(text.includes('先快速产出论文草稿（草稿导向）。'), '用户流程原文被注入')
  assert(text.includes('follow it when choosing the next step'), '声明该流程优先')
  assert(text.includes('not a procedure to follow'), '仍保留「阶段不是流水线」的边界说明')

  const plain = CTX.renderResearchContext(
    CTX.collectResearchContext({ workspace: ws, skillContent: baseSkill }),
    '',
  )
  assert(!plain.includes("this project's own flow"), '没有自定义流程的项目 → 不出现该节')
  rmSync(ws, { recursive: true, force: true })
}

console.log(`\n${failed === 0 ? '✅' : '❌'} progress: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
