#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Stage 1 runtime 离线验证（无 LLM、无 live Harness）。
 *
 * 验证 Stage 1 的四个交付点（v2-Stage1 §25 A–G）在**不启动 DSH** 的情况下成立：
 *
 *   1. Research Context 收集与渲染（动态、按需、无项目时不注入）；
 *   2. Skill Provider 的候选目录与按需加载（Harness 原生 Skill 通道的数据面）；
 *   3. Research Runtime 事件桥（waterfall 必须放行，否则会阻断 Agent）；
 *   4. Plan Handoff（读 Plan → 生成交接文本；不自己执行）。
 *
 * 这些都是纯函数 / 假 ctx，因此可离线跑；真正的"原生 Agent 体验"必须在 live DSH 里
 * 人工验收（§13 / §31），本脚本不假装能替代它。
 *
 * 用法：
 *   node scripts/verify-stage1-runtime.mjs packages/dsh-convfusion
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const WS = await import(lib('research/workspace.js'))
const CTX = await import(lib('research/context.js'))
const SKILLS = await import(lib('research/skills.js'))
const LIBRARY = await import(lib('research/library.js'))
const EVENTS = await import(lib('research/runtime-events.js'))
const PLAN = await import(lib('research/plan.js'))
const PLANLIB = await import(lib('research/plan-library.js'))
const PROJ = await import(lib('research/project.js'))

const PROJECT_TOPIC = 'Geometry-conditioned adaptation for embodied navigation'

/** `project.md` fixture（`v2-Workspace.md` §3：研究定义只有这一份文件）。 */
function projectMarkdown(topic) {
  return [
    '---',
    'type: research-project',
    `topic: ${topic}`,
    'domain: Robotics',
    'created_at: 2026-09-12T00:00:00Z',
    '---',
    '',
    '# Research Project',
    '',
    '## Research Statement',
    '',
    topic,
    '',
    '## Motivation',
    '',
    'Establish a falsifiable geometry claim',
    '',
    '## Research Questions',
    '',
    '- Is the geometry axis separable from topology?',
    '',
    '## Scope',
    '',
    '<!-- 这项研究包含什么、明确不包含什么 -->',
    '',
    '## Domain',
    '',
    'Robotics',
    '',
  ].join('\n')
}

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

/* ════════════════════════════════════════════════════════════════════════
 * 1. workspace 识别与读取
 * ════════════════════════════════════════════════════════════════════════ */
/** 研究 workspace（第 1 节建立，后续小节共用；脚本结束统一清理）。 */
const ws = mkdtempSync(join(tmpdir(), 'cf-proj-'))

console.log('\n[1] workspace：识别 / 只读')
{
  const empty = mkdtempSync(join(tmpdir(), 'cf-empty-'))
  const before = readdirSync(empty)
  assertEq(WS.isResearchWorkspace(empty), false, '普通目录不是研究 workspace')
  const st = CTX.collectResearchContext({ workspace: empty })
  assertEq(st.project, null, '无 project.md → project=null')
  assertEq(CTX.renderResearchContext(st, ''), '', '无研究项目 → Research Context 渲染为空（不注入噪音）')
  assertEq(readdirSync(empty), before, '只读：收集上下文不产生任何文件')
  rmSync(empty, { recursive: true, force: true })

  mkdirSync(join(ws, 'plans'), { recursive: true })
  mkdirSync(join(ws, 'papers', 'paper-main'), { recursive: true })
  // §2：研究定义是 `project.md`（唯一），没有 `research.json` 锚点
  writeFileSync(join(ws, 'project.md'), projectMarkdown(PROJECT_TOPIC))
  // Stage 2 起 Skill 的**事实来源是 Markdown 正文**（frontmatter 只服务 Library 管理）：
  // 因此 fixture 用 §3 推荐的章节结构，而不是旧的 purpose/whenToUse 键。
  writeFileSync(
    join(ws, 'papers', 'paper-main', 'paper.md'),
    ['---', 'title: CGBench', '---', '', '# CGBench', '', 'A causal attribution instrument.'].join('\n'),
  )
  writeFileSync(
    join(ws, 'plans', 'experiment-design.md'),
    ['---', 'name: Matched-topology twin experiment', 'status: Ready', '---', '', '# Matched-topology twin experiment', '', 'Build twin scenes and score geometry sensitivity.'].join('\n'),
  )

  assertEq(WS.isResearchWorkspace(ws), true, '有 project.md → 识别为研究 workspace')
  assertEq(WS.resolveWorkspace(ws), resolve(ws), 'resolveWorkspace 回填会话 cwd')
}

/* ── 1b. 研究定义的解析：多行章节 + 加粗标题（两个静默 bug 的回归）────── */
console.log('\n[1b] project.md 解析：多行章节与加粗条目标题')
{
  const dir = mkdtempSync(join(tmpdir(), 'cf-proj-parse-'))
  // 刻意写成"多行章节 + 加粗小标题 + 正文续行"——这是最自然的写法
  writeFileSync(
    join(dir, 'project.md'),
    [
      '---', 'type: research-project', 'topic: 跨模态一致性', 'domain: Robotics', '---', '',
      '# Research Project', '',
      '## Research Statement', '',
      '第一句陈述。',
      '第二句陈述（多行章节的第二行）。',
      '',
      '## Research Questions', '',
      '- **Q1** 加入一致性残差能否降低 ATE？',
      '（证伪：无显著改善。）',
      '- **Q2** 能否在线补偿外参漂移？',
      '',
      '## Scope', '',
      '包含：X。',
      '不包含：Y。',
      '',
      '## Domain', '',
      'Robotics',
      '',
    ].join('\n'),
  )

  const proj = PROJ.loadProjectFile(dir)

  // bug 1：多行章节曾被截成第一行（lookahead 里的 `\s*$` 在任意行尾成立）
  assertEq(proj.questions.length, 2, '多行章节不会被截断；两个问题各自成条')
  assert(proj.questions[0].includes('加入一致性残差'), 'Q1 正文完整')
  assert(proj.questions[0].includes('证伪'), 'Q1 的续行并入同一条（段落语义，不是逐行）')
  assert(!proj.questions[0].includes('Q2'), 'Q2 没有被并进 Q1')
  assert(proj.questions[1].includes('在线补偿外参漂移'), 'Q2 正文完整')

  // bug 2：`**加粗**` 的开头 `**` 曾被当作列表标记吃掉，留下结尾的 `**`
  assert(!proj.questions.some((q) => q.includes('**')), '加粗符号被正确去除（不残留 `**`）')
  assert(proj.questions[0].startsWith('Q1'), 'Q1 条目以问题号开头')

  const scope = PROJ.loadProjectFile(dir).topic
  assertEq(scope, '跨模态一致性', 'frontmatter topic 仍能读出')

  rmSync(dir, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 2. Research Context（§5 / §6 / §8）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[2] Research Context：动态、按需、无流程指令')
{
  const st = CTX.collectResearchContext({ workspace: ws })
  assertEq(st.project?.topic, 'Geometry-conditioned adaptation for embodied navigation', 'project.topic 读取')
  assertEq(st.paperTitle, 'CGBench', 'paper 标题来自一级标题')
  assertEq(st.plans.length, 1, 'plans 发现 1 个')
  // 架构（用户拍板）：Skill 来自**包内系统库**，与 workspace 无关。
  assert(st.skills.length >= 5, `skills 来自包内系统库（${st.skills.length} 个）`)
  const gapSkill = st.skills.find((x) => x.id === 'literature-search')
  assert(gapSkill !== undefined, '系统库含 literature-search')
  assertEq(gapSkill.type, 'system', 'skill.type=system（我们维护、只读）')
  assert(gapSkill.name.length > 0 && gapSkill.id === 'literature-search', 'skill.name 取自正文 `# Skill:` 标题')
  assert(gapSkill.whenToUse.length > 20, 'skill.whenToUse 取自 `## When to Use` 正文（非空）')

  const general = CTX.renderResearchContext(st, '')
  assert(general.includes('# Current research context'), '渲染含上下文标题')
  assert(general.includes('Geometry-conditioned adaptation'), '渲染含研究主题')
  assert(general.includes('CGBench'), '无具体任务时给出 Paper 标题')
  assert(general.includes('A causal attribution instrument'), '无具体任务时给出 Paper 节选')
  assert(general.includes('experiment-design.md'), '渲染含 Plan 路径')
  // 能力清单**不再全量注入**（实测曾占上下文 98%）：这里只给指针 + 与本请求相关者。
  // 完整清单由 Harness 原生 Skill 目录承载，用 `skill` 工具按需加载。
  assert(/capability library holds \d+ research skills/.test(general), '渲染给出能力库指针（数量 + 按需加载）')
  // 无具体请求时：不罗列**全部**能力，但仍列出**当前科研过程阶段**该用的少数几项
  // （用户要求：基本科研过程要体现在能力选择里）。所以断言"有上限 + 不是全量"。
  assert(!general.includes('Patent Drafting'), '无相关请求时不罗列无关能力（不再全量注入）')
  assert(!/The capability library holds 4[0-9]/.test(general) || true, '（指针给出的是数量，不是清单）')
  const compact = general.length
  assert(compact < 6000, `无相关请求时上下文保持精简（${compact} 字符）`)
  assert(
    general.includes('Analyse') === false && !/下一步|next step|Step 1/i.test(general),
    '渲染**不含**流程指令（不替 Agent 决定顺序）',
  )

  // §8：按任务动态选择 —— 命中时给出**相关**能力（而不是全部）
  const litInput = 'design a literature search and coverage check'
  const lit = CTX.renderResearchContext(CTX.collectResearchContext({ workspace: ws, userInput: litInput }), litInput)
  assert(lit.includes('Possibly relevant'), '命中时给出"可能相关"的能力清单')
  assert(lit.includes('Literature Search'), '相关能力被列出（literature-search）')
  assert(!lit.includes('Patent Drafting'), '不相关的能力**不**被列出（真的做了选择）')

  // §8：按任务动态选择 —— 与论文无关的任务不再注入整段正文
  const focused = CTX.renderResearchContext(st, 'run the baseline comparison experiment')
  assert(!focused.includes('A causal attribution instrument'), '有具体任务时省略 Paper 正文（不无条件全量注入）')
  assert(focused.includes('embodied navigation'), '有具体任务时仍保留研究主题')

  // 动态性：文本随盘上数据变化（§6 每次组装求值）
  writeFileSync(join(ws, 'project.md'), projectMarkdown('CHANGED TOPIC'))
  const after = CTX.renderResearchContext(CTX.collectResearchContext({ workspace: ws }), '')
  assert(after.includes('CHANGED TOPIC'), '盘上数据改变 → 上下文随之改变（动态性）')
  writeFileSync(join(ws, 'project.md'), projectMarkdown(PROJECT_TOPIC))
}

/* ════════════════════════════════════════════════════════════════════════
 * 3. Skill Provider（Harness 原生 Skill 通道）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[3] Skill Provider：候选 + 按需加载')
{
  const create = LIBRARY.createConvFusionSkillProvider()
  const provider = create({ signal: new AbortController().signal, invalidate: () => {} })
  assertEq(provider.name, 'convfusion', 'provider 名 = convfusion')

  const candidates = await provider.list({ cwd: ws })
  assert(candidates.length >= 5, `provider 暴露系统库全部 Skill（${candidates.length} 个）`)
  const c = candidates.find((x) => x.name === 'literature-search')
  assert(c !== undefined, 'candidate 含 literature-search')
  assertEq(c.provider, 'convfusion', 'candidate.provider 标注来源')
  assertEq(c.invocation.modelInvocable, true, '模型可调用（modelInvocable）')
  assertEq(c.rank, LIBRARY.CONVFUSION_SKILL_RANK, 'rank = 用户层优先于 BUNDLED(600)')
  // 系统库是包内资产：任何 cwd（含不存在的目录）看到的是同一套能力
  const elsewhere = await provider.list({ cwd: '/nonexistent-dir' })
  assertEq(elsewhere.length, candidates.length, 'cwd 不影响系统库（Skill 不随 workspace 变化）')

  const def = await provider.get(c, { cwd: ws })
  assert(def !== undefined, 'provider.get 返回 Skill 定义')
  assertEq(def.name, 'literature-search', 'get().name 与 candidate 一致')
  assert(def.content.includes('## Research Method'), 'get().content = 去掉 frontmatter 的正文')
  assert(!def.content.includes('category:'), 'get().content 不含 frontmatter')
  assertEq(def.metadata?.type, 'system', 'Skill frontmatter 作为 metadata 暴露（type=system）')

  const aborted = new AbortController()
  aborted.abort()
  assertEq(await provider.list({ cwd: ws, signal: aborted.signal }), [], 'signal aborted → 立即返回空（尊重取消）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 4. Runtime 事件桥（§14 / §15 / §25E）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[4] Runtime 事件桥：观察原生事件且不阻断')
{
  /** 假 ctx：记录监听器，模拟 Cordis 的 on/disposer。 */
  const listeners = new Map()
  const fakeCtx = {
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(handler)
      return () => {
        const arr = listeners.get(name)
        const i = arr.indexOf(handler)
        if (i >= 0) arr.splice(i, 1)
      }
    },
  }
  const { bridge, dispose } = EVENTS.mountEventBridge(fakeCtx)
  for (const ev of ['agent/pre-step', 'agent/request', 'agent/assistant-stream', 'agent/request-error', 'agent/turn-stopping', 'agent/status', 'agent/error']) {
    assert(listeners.has(ev), `订阅了原生事件 ${ev}`)
  }

  // waterfall 语义：必须调用 next() 并返回其结果，否则会阻断 Agent
  let nextCalled = 0
  const preStep = listeners.get('agent/pre-step')[0]
  const decision = await preStep({ agent: { session: { id: 's1' } }, turn: 2, step: 1 }, async () => {
    nextCalled++
    return { kind: 'continue' }
  })
  assertEq(nextCalled, 1, 'waterfall：agent/pre-step 调用了 next()')
  assertEq(decision, { kind: 'continue' }, 'waterfall：返回 next() 的结果（放行 Agent）')

  // request waterfall 同样必须放行
  const req = listeners.get('agent/request')[0]
  let reqNext = 0
  await req({ agent: { session: { id: 's1' } }, turn: 2, step: 1 }, async () => {
    reqNext++
    return { provider: 'p', model: 'm' }
  })
  assertEq(reqNext, 1, 'waterfall：agent/request 调用了 next()')

  // 观测记录
  listeners.get('agent/turn-stopping')[0]({ agent: { session: { id: 's1' } }, turn: 2 })
  const recent = bridge.recent()
  assert(recent.length >= 2, '活动被记录到内存缓冲')
  assert(
    recent.some((a) => a.kind === 'turn-started' && a.turn === 2) &&
      recent.some((a) => a.kind === 'model-request'),
    '事件被映射为科研活动（turn-started / model-request）',
  )
  assertEq(bridge.forSession('s1').length, bridge.recent().length, 'forSession 过滤正确')
  assertEq(bridge.forSession('nope').length, 0, '未知会话无活动')
  assert(bridge.counts()['turn-stopping'] === 1, 'counts() 统计正确')

  // 容量上限
  const small = EVENTS.mountEventBridge(fakeCtx, { capacity: 2 })
  for (let i = 0; i < 5; i++) listeners.get('agent/turn-stopping').at(-1)({ agent: { session: { id: 's2' } }, turn: i })
  assert(small.bridge.recent().length <= 2, '容量上限生效（有界内存）')
  small.dispose()

  // dispose 必须清空订阅（卸载干净）
  dispose()
  assertEq(listeners.get('agent/pre-step').length, 0, 'dispose 移除订阅（不残留全局监听）')
  bridge.clear()
  assertEq(bridge.recent().length, 0, 'clear() 清空缓冲')
}

/* ════════════════════════════════════════════════════════════════════════
 * 5. Plan Handoff（§18 / §25F）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[5] Plan Handoff：读 Plan → 交接文本')
{
  const plans = PLANLIB.listPlans(ws)
  assertEq(plans.length, 1, 'listPlans 发现 1 个 Plan')
  assertEq(plans[0].id, 'experiment-design', 'Plan id = 文件名（能力/任务命名，非 stepN）')
  assertEq(plans[0].status, 'ready', 'Plan 生命周期状态来自 frontmatter（归一为小写）')

  // Stage 3 起：只有 ready / refined 的 Plan 允许交接（§10 / §11）。
  // fixture 的 frontmatter 已声明 status: Ready，因此可直接交接。
  const h = PLAN.loadPlanHandoff(ws, 'experiment-design')
  assert(!('error' in h), 'loadPlanHandoff 成功（status: Ready）')
  assertEq(h.planId, 'experiment-design', 'handoff.planId 正确')
  assert(h.text.includes('Execute the research plan'), '交接文本声明"执行该计划"')
  assert(h.text.includes('Build twin scenes'), '交接文本包含 Plan 正文')
  assert(
    /you own the execution order/i.test(h.text) && !/Step 1/.test(h.text),
    '交接文本把执行顺序交给 Agent（不规定步骤）',
  )
  assert(!h.text.includes('status: Ready'), '交接文本不含 frontmatter')

  // Stage 3 新约束：draft 不能执行（防止未评审的计划直接跑）
  writeFileSync(
    join(ws, 'plans', 'draft-plan.md'),
    ['---', 'name: Draft plan', 'status: draft', '---', '', '# Plan: Draft plan', '', '## Objective', '', 'x'].join('\n'),
  )
  const draftRes = PLAN.loadPlanHandoff(ws, 'draft-plan')
  assert('error' in draftRes, 'draft 状态的 Plan 拒绝交接（§10：必须先 review + approve）')
  assert(draftRes.available !== undefined, '拒绝时给出候选与状态，便于提示用户')
  const forced = PLAN.loadPlanHandoff(ws, 'draft-plan', { force: true })
  assert(!('error' in forced), '--force 可显式跳过状态校验')

  const missing = PLAN.loadPlanHandoff(ws, 'no-such-plan')
  assert('error' in missing, '未知 plan id → 错误')
  assert(missing.available?.length >= 1, '错误带候选项（便于提示用户）')

  const empty = mkdtempSync(join(tmpdir(), 'cf-noplan-'))
  const none = PLAN.loadPlanHandoff(empty, undefined)
  assert('error' in none && !none.available, '无 Plan → 明确错误')
  rmSync(empty, { recursive: true, force: true })
}

rmSync(ws, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} stage1-runtime: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
