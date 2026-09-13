#!/usr/bin/env node
/**
 * ConvFusion 2.0 — Stage 3 Plan System 离线验证（无 LLM、无 DSH）。
 *
 * 覆盖 v2-Stage3 §32 编程任务与 §34 验收标准：
 *   A. Plan Data Layer（Create/Read/Update/Save/Delete/Archive）
 *   B. Plan Metadata（轻量，不构成 DSL）
 *   C. Skill → Plan（+ Research Context + Paper + Intent）
 *   D. Plan Editor（按章节修改）
 *   E. Plan Review（Draft/Reviewed/Ready + Edit/Approve）
 *   F. Plan Versioning（历史版本不可被覆盖）
 *   G. Plan → Harness（只有 ready/refined 可交接；不建第二套 Runtime）
 *   H. Plan → Evidence（Expected Evidence 声明）
 *   I. Plan → Paper（关联）
 *   J. Plan Library（Search / Filter / Recent）
 *   并验证 §3 / §27 / §33 的**禁止项**
 *
 * 用法：
 *   node scripts/verify-stage3-plan-system.mjs packages/dsh-convfusion
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const P = await import(lib('research/plans.js'))
const PL = await import(lib('research/plan-library.js'))
const HANDOFF = await import(lib('research/plan.js'))

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

const ws = mkdtempSync(join(tmpdir(), 'cf-plans-'))

/* ════════════════════════════════════════════════════════════════════════
 * A / B. Plan Data Layer + Metadata
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[A/B] Plan 数据层与 Metadata')
{
  assertEq(P.PLANS_DIR, 'plans', 'Plan 目录 = plans/（一级研究资产）')

  const created = PL.createPlan(ws, {
    name: 'Experiment Design',
    objective: 'Define a reproducible experimental design for the current research problem.',
    strategy: '1. Fix the research question.\n2. Choose datasets and baselines.\n3. Pre-register metrics and ablations.',
    expectedEvidence: 'Comparative results under a fixed protocol; ablation isolating the claimed factor.',
    completionCriteria: 'A protocol another group can rerun, plus the measured differences.',
    sourceSkill: 'experiment-design',
    sourceSkillVersion: '1.2',
    paper: 'CGBench',
  })
  assert(!PL.isPlanWriteError(created), 'createPlan 成功')
  assertEq(created.id, 'experiment-design', 'id 由 name 派生为 kebab-case')
  assertEq(created.type, 'research-plan', 'type=research-plan')
  assertEq(created.status, 'draft', '新建 Plan 默认 draft（执行前必须有人看过）')
  assertEq(created.version, '1.0', '默认版本 1.0')
  assertEq(created.sourceSkill, 'experiment-design', 'source_skill 记录（Provenance）')
  assertEq(created.sourceSkillVersion, '1.2', 'source_skill_version 记录（§19）')
  assertEq(created.paper, 'CGBench', 'paper 关联记录')
  assert(created.createdAt !== undefined && created.updatedAt !== undefined, 'created_at / updated_at 记录')
  assertEq(created.relPath, 'plans/experiment-design.md', '落盘在 plans/<id>.md（无 step 层级）')
  assert(existsSync(created.path), '文件真实存在（§4：持久化资产，不是临时 Prompt）')

  // §5 弱结构：章节齐备
  const titles = created.sections.map((s) => s.title)
  for (const want of ['Objective', 'Context', 'Execution Strategy', 'Expected Evidence', 'Completion Criteria']) {
    assert(titles.includes(want), `含章节 ${want}`)
  }
  assertEq(P.planObjective(created).slice(0, 8), 'Define a', 'planObjective 读取')
  assert(P.planExpectedEvidence(created).includes('Comparative results'), 'planExpectedEvidence 读取')
  assert(P.planCompletionCriteria(created).includes('rerun'), 'planCompletionCriteria 读取')

  // frontmatter 轻量（§6）：只有 Identity/Lifecycle/Provenance/Indexing/Versioning
  const raw = readFileSync(created.path, 'utf8')
  const fmKeys = Object.keys(P.parsePlanFrontmatter(raw))
  const allowed = new Set([
    'name', 'type', 'status', 'version', 'source_skill', 'source_skill_version',
    'paper', 'research_context', 'review_policy', 'created_at', 'updated_at',
  ])
  assert(fmKeys.every((k) => allowed.has(k)), `frontmatter 只含许可键（${fmKeys.join(', ')}）`)

  // 重名拒绝
  assert(PL.isPlanWriteError(PL.createPlan(ws, { name: 'Experiment Design' })), '同名创建被拒绝（不覆盖）')
}

/* ════════════════════════════════════════════════════════════════════════
 * §3 / §27 禁止项
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[§3/§27] Plan 不是 Workflow 的边界')
{
  const stepish = PL.createPlan(ws, { name: 'step1' })
  assert(PL.isPlanWriteError(stepish), '拒绝 step 风格命名（step1）')
  assert(stepish.error.includes('能力/任务命名'), '拒绝理由说明改用能力/任务命名')
  assert(PL.isPlanWriteError(PL.createPlan(ws, { name: 'module3 plan' })), '拒绝 moduleN 风格命名')
  assert(P.isLegacyStylePlanId('discovery-step-plan'), '识别 discovery-step-plan 为旧风格')
  assert(!P.isLegacyStylePlanId('literature-gap-analysis'), '能力命名不被误判')

  // Plan 类型里没有可执行结构（没有 steps[] / next / engine）
  const doc = P.readPlan(ws, 'experiment-design')
  const keys = Object.keys(doc)
  assert(
    !keys.some((k) => ['steps', 'next', 'engine', 'runner', 'workflow', 'stage'].includes(k)),
    'Plan 类型无可执行结构（无 steps/next/engine/stage）',
  )

  // 章节里出现 1. 2. 3. 也不算 workflow —— 我们不做任何由此生成的调度
  const planModule = readFileSync(join(PKG, 'lib', 'research', 'plans.js'), 'utf8')
  assert(
    !/setInterval|setTimeout|while\s*\(true\)/.test(planModule),
    'plans.ts 内无任何调度循环（Plan 不驱动执行）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * E. Plan Review / Lifecycle
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[E] Plan Review 与生命周期')
{
  const id = 'experiment-design'
  assertEq(P.canTransition('draft', 'ready'), true, 'draft → ready 合法（§11 auto 场景）')
  assertEq(P.canTransition('archived', 'executing'), false, 'archived → executing 非法')
  assertEq(P.canTransition('draft', 'executing'), false, 'draft → executing 非法（必须先 ready）')

  const reviewed = PL.reviewPlan(ws, id)
  assertEq(reviewed.status, 'reviewed', 'reviewPlan → reviewed（用户已检查）')
  const ready = PL.approvePlan(ws, id)
  assertEq(ready.status, 'ready', 'approvePlan → ready（用户明确允许执行）')

  const illegal = PL.setPlanStatus(ws, id, 'archived')
  assert(!PL.isPlanWriteError(illegal), 'ready → archived 合法')
  const back = PL.setPlanStatus(ws, id, 'executing')
  assert(PL.isPlanWriteError(back), 'archived → executing 被拒绝')
  assert(back.error.includes('已归档'), '拒绝理由可读')
  // 复位
  PL.setPlanStatus(ws, id, 'ready')
  void readdirSync(ws)
}

/* ════════════════════════════════════════════════════════════════════════
 * D. Plan Editor（按章节修改；其余内容不动）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[D] Plan Editor')
{
  const id = 'experiment-design'
  const before = P.readPlan(ws, id)
  const objectiveBefore = P.planObjective(before)

  const edited = PL.updatePlanSection(ws, id, 'Execution Strategy', 'REWRITTEN strategy by the user.')
  assert(!PL.isPlanWriteError(edited), 'updatePlanSection 成功')
  assertEq(P.planExecutionStrategy(edited), 'REWRITTEN strategy by the user.', '该章节已替换')
  assertEq(P.planObjective(edited), objectiveBefore, '其它章节原样保留（只动目标章节）')

  // 用户自加章节不被丢弃
  const added = PL.updatePlanSection(ws, id, 'My Private Notes', 'Only I care about this.')
  assert(added.sections.some((s) => s.title === 'My Private Notes'), '用户自加章节被保留')
  assertEq(P.planObjective(added), objectiveBefore, '自加章节不影响既有内容')

  // 整体保存正文
  const whole = ['---', 'name: Experiment Design', 'type: research-plan', 'status: ready', 'version: 1.0', '---', '', '# Plan: Experiment Design', '', '## Objective', '', 'Whole-body save.', ''].join('\n')
  const saved = PL.savePlanBody(ws, id, whole)
  assert(!PL.isPlanWriteError(saved), 'savePlanBody 成功')
  assertEq(P.planObjective(saved), 'Whole-body save.', '整体保存生效')
  assertEq(saved.status, 'ready', '整体保存不改 frontmatter 状态')
}

/* ════════════════════════════════════════════════════════════════════════
 * F. Plan Versioning
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[F] Plan Versioning')
{
  assertEq(PL.bumpPlanVersion('1.0'), '1.1', 'bumpPlanVersion 1.0 → 1.1')
  assertEq(PL.bumpPlanVersion('1.2'), '1.3', 'bumpPlanVersion 1.2 → 1.3')
  assertEq(PL.bumpPlanVersion('1.2', 'major'), '2.0', 'bumpPlanVersion major → 2.0')

  const id = 'experiment-design'
  const revisedBody = [
    '---', 'name: Experiment Design', 'type: research-plan', 'status: ready', 'version: 1.0', '---', '',
    '# Plan: Experiment Design', '',
    '## Objective', '', 'Pre-register the protocol before running anything.', '',
    '## Execution Strategy', '', '1. Fix the question. 2. Pre-register metrics.', '',
    '## Expected Evidence', '', 'Ablation table isolating the geometry factor.', '',
    '## Completion Criteria', '', 'A protocol another group can rerun, plus the measured differences.', '',
  ].join('\n')
  const r1 = PL.revisePlan(ws, id, { body: revisedBody, note: '增加"必须预注册指标"' })
  assert(!PL.isPlanWriteError(r1), 'revisePlan 成功')
  assertEq(r1.version, '1.1', '修订后版本 → 1.1')
  assert(P.planCompletionCriteria(r1).includes('another group can rerun'), '修订后新正文生效')

  const r2 = PL.revisePlan(ws, id, { note: 'second revision' })
  assertEq(r2.version, '1.2', '再次修订 → 1.2')

  const versions = PL.listPlanVersions(ws, id)
  assert(versions.length >= 2, `历史版本被保留（${versions.map((v) => v.path).join(', ')}）`)
  const v001 = PL.readPlanVersion(ws, id, '001')
  // 第一次 revise 时归档的正是 savePlanBody 写入的原文 —— 历史版本**保留**它，
  // 而当前版本已被后续 revise 覆盖（这就是"历史不可被当前版本覆盖"）。
  assert(v001 !== undefined && v001.includes('Whole-body save'), 'v001 快照保留当时的原文')
  assert(!P.readPlan(ws, id).body.includes('Whole-body save'), '当前版本已不再含 v001 的旧正文')
  assert(v001.includes('<!-- archived:'), '快照带归档时间戳')
  // §19：快照落在 Plan 资产**内部**（plans/history/），不是工作区顶层概念
  assert(versions.every((v) => v.path.startsWith('plans/history/')), '快照路径在 plans/history/ 内')
  assertEq(versions.map((v) => v.version), versions.map((v) => v.version).slice().sort(), '快照按序号升序')
  assert(versions.some((v) => v.planVersion === '1.0'), '快照记录 Plan 自己的语义版本')
  assert(!existsSync(join(ws, 'plan-versions')), '不再有 plan-versions/ 顶层目录')
  assert(!P.listPlanDocuments(ws).some((d) => d.id === 'history'), 'plans/history/ 不被当成 Plan 扫描到')

  // 幂等：同一内容重复归档不追加
  const cur = P.readPlan(ws, id)
  PL.archivePlanVersion(ws, cur, 'snap')
  const countAfterSnap = PL.listPlanVersions(ws, id).length
  const again = PL.archivePlanVersion(ws, P.readPlan(ws, id), 'snap again')
  assertEq(again, undefined, '同一内容重复归档是幂等的')
  assertEq(PL.listPlanVersions(ws, id).length, countAfterSnap, '幂等时不新增快照文件')

  // 快照不被当成 Plan
  const allIds = P.listPlanDocuments(ws).map((d) => d.id)
  assert(!allIds.some((x) => /^v\d/.test(x)), '版本快照不被当成 Plan 扫描到')
  assert(existsSync(join(ws, 'plans', 'history', id)), '快照目录在 plans/history/<id>/ 内')

  // 版本演化记录（§19 Change History）—— 权威来源是快照本身，不是外部状态文件
  const prov = PL.planProvenance(ws, id)
  assert(prov.versions.length >= 2, 'provenance 汇总历史快照（§19 Change History）')
  assert(prov.versions.every((v) => v.id === id && v.path.startsWith('plans/history/')), '每条快照都指向该 Plan')
  assert(!('evolution' in prov), 'provenance 不再依赖外部状态文件')
}

/* ════════════════════════════════════════════════════════════════════════
 * H / I. Plan → Evidence / Paper
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[H/I] Plan → Evidence / Paper')
{
  const id = 'experiment-design'
  const ev = PL.setPlanExpectedEvidence(ws, id, 'Ablation table isolating the geometry factor.')
  assert(!PL.isPlanWriteError(ev), 'setPlanExpectedEvidence 成功')
  assert(P.planExpectedEvidence(ev).includes('Ablation table'), 'Expected Evidence 落盘（§32-H 声明，非证据本身）')

  const linked = PL.linkPlanToPaper(ws, id, 'CGBench-v2')
  assert(!PL.isPlanWriteError(linked), 'linkPlanToPaper 成功')
  assertEq(linked.paper, 'CGBench-v2', 'paper 关联更新（§32-I）')

  const prov = PL.planProvenance(ws, id)
  assertEq(prov.hasExpectedEvidence, true, 'provenance 标注已有 Expected Evidence')
  assertEq(prov.hasCompletionCriteria, true, 'provenance 标注已有 Completion Criteria')
  assertEq(prov.paper, 'CGBench-v2', 'provenance 记录 paper')
}

/* ════════════════════════════════════════════════════════════════════════
 * J. Plan Library（Search / Filter / Recent）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[J] Plan Library')
{
  PL.createPlan(ws, { name: 'Literature Gap Analysis', sourceSkill: 'research-gap', paper: 'CGBench-v2' })
  PL.createPlan(ws, { name: 'Paper Revision', sourceSkill: 'revision' })

  const all = PL.discoverPlans(ws)
  assert(all.length >= 3, `discoverPlans 返回全部（${all.length}）`)

  const bySearch = PL.discoverPlans(ws, { search: 'ablation' })
  assert(bySearch.length >= 1, 'Search 命中（含正文章节内容）')

  const bySkill = PL.discoverPlans(ws, { skill: 'research-gap' })
  assertEq(bySkill.map((e) => e.document.id), ['literature-gap-analysis'], 'Skill 过滤')

  const byPaper = PL.discoverPlans(ws, { paper: 'CGBench-v2' })
  assert(byPaper.every((e) => e.document.paper === 'CGBench-v2'), 'Paper 过滤')

  const byStatus = PL.discoverPlans(ws, { status: ['ready'] })
  assert(byStatus.every((e) => e.document.status === 'ready'), 'Status 过滤')

  const view = PL.loadPlanLibrary(ws)
  assert(view.counts.total >= 3, 'Library 视图统计各状态数量')
  assertEq(typeof view.counts.draft, 'number', 'counts 含 draft 计数')
  assert(view.entries.every((e) => typeof e.versionCount === 'number'), '每个 Plan 带历史快照数')
  assert(!('favorite' in view.entries[0]) && !('usageCount' in view.entries[0]), 'Entry 不含收藏/使用字段')

  // Library 是**纯投影**：状态由 plans/*.md 的 status 算出，不落状态文件
  const raw = readFileSync(join(ws, 'plans', 'paper-revision.md'), 'utf8')
  assert(!raw.includes('favorite') && !raw.includes('usage'), '收藏/使用不污染 Plan Markdown')
  assert(!existsSync(join(ws, 'plan-library.json')), '不再产生 plan-library.json（§28 由 frontmatter 投影）')
}

/* ════════════════════════════════════════════════════════════════════════
 * §19 自动同步：Agent 直接用原生工具改 Plan，也不丢历史
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[X] §19 Plan 历史自动同步（原生编辑路径）')
{
  // 模拟 Agent 用原生工具直接改 `plans/*.md` —— 不经过 revisePlan，插件截不到这次写入
  const before = PL.listPlanVersions(ws, 'paper-revision').length
  appendFileSync(
    join(ws, 'plans', 'paper-revision.md'),
    '\n## Agent Added\n\nEdited directly with native tools, not via revisePlan.\n',
  )
  const created = PL.syncPlanHistory(ws)
  assert(created.length >= 1, '发现盘上变化 → 补快照')
  assert(created.every((p) => p.startsWith('plans/history/')), '补的快照也在 plans/history/ 内')
  assertEq(PL.listPlanVersions(ws, 'paper-revision').length, before + 1, '该 Plan 快照数 +1')
  assertEq(PL.syncPlanHistory(ws), [], '无变化 → 不再补（幂等）')

  const latest = PL.listPlanVersions(ws, 'paper-revision').slice(-1)[0]
  const content = PL.readPlanVersion(ws, 'paper-revision', latest.version)
  assert(content.includes('Edited directly with native tools'), '最新快照就是当前内容')
}

/* ════════════════════════════════════════════════════════════════════════
 * C. Skill → Plan（生成请求，不替模型写内容）
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[C] Skill → Plan')
{
  const req = PL.buildPlanGenerationText(
    ws,
    { skillId: 'experiment-design', intent: 'Design the matched-topology twin experiment.', paper: 'CGBench' },
    {
      id: 'experiment-design',
      name: 'Experiment Design',
      version: '1.2',
      method: '1. Fix the question.\n2. Pre-register metrics.',
    },
  )
  assert(req.suggestedId.length > 0 && /^[a-z0-9-]+$/.test(req.suggestedId), '建议 id 是合法 kebab-case')
  assert(req.suggestedPath.startsWith('plans/'), '建议落盘路径在 plans/ 下')
  assert(req.text.includes('source_skill: experiment-design'), '任务文本要求写入 source_skill（Provenance 可靠）')
  assert(req.text.includes('source_skill_version: 1.2'), '任务文本要求写入 source_skill_version')
  assert(req.text.includes('status: draft'), '任务文本要求 draft（执行前需审核）')
  assert(req.text.includes('## User intent'), '任务文本带上用户意图')
  assert(req.text.includes('Pre-register metrics'), '任务文本包含 Skill 方法论')
  assert(
    /you own the step order|owns the step order|do not encode a workflow/i.test(req.text),
    '任务文本明确"执行顺序归 Agent"，不要求模型编排 workflow',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * G. Plan → Harness Handoff
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[G] Plan → Harness')
{
  const id = 'experiment-design'

  // ready → 可交接
  PL.setPlanStatus(ws, id, 'ready')
  const h = HANDOFF.loadPlanHandoff(ws, id)
  assert(!('error' in h), 'ready 的 Plan 可交接')
  assertEq(h.planId, id, 'handoff.planId 正确')
  assert(h.text.includes('Execute the research plan'), '交接文本声明执行该计划')
  assert(h.text.includes('you own the execution order'), '交接文本把执行顺序交给 Agent')
  assert(h.text.includes('Completion criteria'), '交接文本强调完成判据（§21）')
  assert(h.text.includes('Evidence to produce'), '交接文本强调应产出的证据（§21）')

  // draft → 拒绝
  PL.createPlan(ws, { name: 'Draft Only Plan' })
  const draftRes = HANDOFF.loadPlanHandoff(ws, 'draft-only-plan')
  assert('error' in draftRes, 'draft 的 Plan 拒绝交接')
  assert(draftRes.error.includes('还不能执行'), '拒绝理由说明原因')
  assert(draftRes.available.length >= 1, '拒绝时列出候选与状态')

  // auto-execute 策略允许 draft 直接执行（§11）
  const auto = PL.createPlan(ws, { name: 'Auto Plan', reviewPolicy: 'auto-execute' })
  assertEq(auto.reviewPolicy, 'auto-execute', 'review_policy 记录')
  assert(!('error' in HANDOFF.loadPlanHandoff(ws, 'auto-plan')), 'auto-execute 的 draft 允许交接（§11）')

  // 提交路径：只调 Harness 原生 followup
  const calls = []
  const fakeAgent = { followup: (m) => calls.push(m) }
  const res = HANDOFF.handoffPlan(ws, fakeAgent, id)
  assert('ok' in res && res.planId === id, 'handoffPlan 成功')
  assertEq(calls.length, 1, '只调用了一次 agent.followup（Harness 原生通道）')
  const msg = calls[0]
  assertEq(msg.role, 'user', '消息是 user role')
  assertEq(msg.source.kind, 'plugin', 'source.kind=plugin（已知 surface 通道）')
  assertEq(msg.source.plugin, 'convfusion', 'source.plugin=convfusion')
  assertEq(msg.content[0].type, 'text', '消息内容为 text 块')

  // §33：不存在"ConvFusion 执行 Plan"的路径
  const libFiles = readdirSync(join(PKG, 'lib', 'research'))
  assert(libFiles.includes('plan.js') && libFiles.includes('plans.js'), 'Plan 模块存在')
  const handoffSrc = readFileSync(join(PKG, 'lib', 'research', 'plan.js'), 'utf8')
  assert(
    !/ctx\.llm|agents\.create|createAgentDriver/.test(handoffSrc),
    '交接模块不创建 Agent / 不直接调 LLM（§33：Plan → Harness，不是 Plan → ConvFusion Agent）',
  )
  assert(
    !/session\.append\(/.test(handoffSrc),
    '交接模块不写自定义会话事件（外部插件不能新增事件类型）',
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * A. Delete / Archive
 * ════════════════════════════════════════════════════════════════════════ */
console.log('\n[A] Delete / Archive')
{
  const del = PL.deletePlan(ws, 'auto-plan')
  assert('ok' in del, 'deletePlan 成功')
  assert(!existsSync(join(ws, 'plans', 'auto-plan.md')), '文件已删除')

  const arch = PL.archivePlan(ws, 'draft-only-plan')
  assertEq(arch.status, 'archived', 'archivePlan → archived')
  assert(PL.isPlanWriteError(PL.setPlanStatus(ws, 'draft-only-plan', 'ready')), '归档后不能再变 ready')

  const id = 'experiment-design'
  PL.archivePlanVersion(ws, P.readPlan(ws, id), 'final')
  PL.deletePlan(ws, id)
  assert(!existsSync(join(ws, 'plans', 'history', id)), '删除 Plan 时清理其历史快照')
}

rmSync(ws, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} stage3-plan-system: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
