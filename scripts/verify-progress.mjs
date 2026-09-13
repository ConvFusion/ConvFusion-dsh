#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 研究过程 + 研究进展 验证（离线）。
 *
 * 覆盖用户提的两件事：
 *
 *   A. **基本科研过程要体现在能力选择里**，而且**过程本身是一个可定制 Skill**
 *      （用户在设置里能规定自己的研究进展过程）；
 *   B. **每轮结束展示研究进展**（`v2-Progress.md`），且必须来自真实资产 —— 不猜。
 *
 * 用法：
 *   node scripts/verify-progress.mjs packages/dsh-convfusion
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const PROC = await import(lib('research/research-process.js'))
const PROG = await import(lib('research/progress.js'))
const BRIDGE = await import(lib('research/progress-bridge.js'))
const ADV = await import(lib('research/advance.js'))
const LIB = await import(lib('research/library.js'))
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
  assertEq(stages?.map((s) => s.id)[0], 'problem', '第一个阶段是 problem')
  assert(stages.every((s) => s.label && s.category), '每个阶段都有显示名与能力类别')
  assert(stages.every((s) => s.signal === undefined || PROC.STAGE_SIGNALS.includes(s.signal)), '判定信号都在固定词表内')
  // 默认过程必须覆盖"理解问题 → 文献 → …"这条基本科研过程
  const ids = stages.map((s) => s.id)
  for (const want of ['problem', 'literature', 'innovation', 'method', 'experiment', 'analysis', 'decision', 'writing']) {
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
  assertEq(a0.current?.stage.id, 'problem', '空工作区 → 当前阶段是 problem')

  // 只写研究问题：
  writeFileSync(
    join(ws, 'project.md'),
    ['---', 'type: research-project', 'topic: T', 'domain: Robotics', '---', '', '## Research Statement', '', 'T', '', '## Research Questions', '', '- **Q1** 能不能？', ''].join('\n'),
  )
  const a1 = PROC.assessResearchProcess(ws, { skillContent: baseContent })
  assertEq(a1.current?.stage.id, 'literature', '有研究问题后 → 当前阶段推进到 literature')
  assert(a1.stages[0].satisfied, 'problem 阶段判定为已落地')

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
  BRIDGE.rememberTurnReport('s-report', report)
  assertEq(BRIDGE.latestTurnReport('s-report')?.turn, 3, '按会话读回最近报告')
  assertEq(BRIDGE.latestTurnReport('s-unknown'), undefined, '没有报告的会话返回 undefined')
  assertEq(BRIDGE.rememberTurnReport(undefined, report), undefined, '没有会话 id 时静默忽略（不抛错）')

  // 装配桥：pre-step 必须放行，turn-stopping 必须**记录报告且不追加消息**。
  //
  // ⚠️ 两层边界（2026-09 用户拍板）：
  //   1. 只有**研究工作区**（有 `project.md` / `research-state.md`）才算进展；
  //   2. 报告**不进会话日志** —— DSH 必然把 plugin 来源的消息显示成"上下文注入"，
  //      所以展示改由客户端在 `conversation.chat.turnTail` 渲染。
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
  assertEq(BRIDGE.latestTurnReport('s-plain'), undefined, '非研究工作区：不产生报告（界面不显示进度卡）')
  disposePlain()
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
  assert(/没有形成新的可验证研究资产/.test(aStale.basis), '停滞依据可核查')
  assertEq(ADV.shouldAutoContinue(aStale, ADV.DEFAULT_AUTO_CONTINUE, 0).go, false, '停滞时停止自动推进')
  rmSync(wsStale, { recursive: true, force: true })

  // ④ 多个 draft 计划 → 方向未收敛，问用户
  const wsDrafts = mk({ plans: ['alpha', 'beta'] })
  const aDrafts = ADV.assessAdvance({ workspace: wsDrafts })
  assertEq(aDrafts.clarity, 'ambiguous', '两个 draft 计划并存 → ambiguous')
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

rmSync(join(tmpdir(), 'nonexistent-cf-progress-'), { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} progress: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
