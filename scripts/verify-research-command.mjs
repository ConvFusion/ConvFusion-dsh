#!/usr/bin/env node
/**
 * ConvFusion 2.0 — `/research` 命令的行为验证（无 DSH、无 LLM）。
 *
 * ## 为什么需要它
 *
 * 2026-09-12 实测：用户输入 `/research 基于视觉-LiDAR 跨模态共同刚体一致性的 UAV 定位误差校准`，
 * **界面没有任何反应**。事后查证：命令确实跑了（`project.md` 落盘、`plans/`+`research/` 建好），
 * 但"首次创建项目"这条分支只返回了一段静态说明就结束了 —— **它从不启动 Agent**。
 * 于是用户看到项目被建了，却什么都没开始跑。
 *
 * 原生体验的要求是"说完就开始干活"：`/research <主题>` 必须像普通请求一样把任务交给
 * 原生 Agent（Think / 工具 / 编码全部原生）。所以这里钉住的不是文案，而是**副作用**：
 *
 *   1. 首次调用 → 建项目 **且** `agent.followup()` 被调用一次（带主题）；
 *   2. 再次调用 → 同样交给 Agent（继续推进），不是只回话；
 *   3. `agent.followup` 不可用时 → **明确报错**，绝不假装已开始；
 *   4. 交给 Agent 的文本：含主题、指向 `project.md`、**不规定步骤**。
 *
 * 用法：
 *   node scripts/verify-research-command.mjs packages/dsh-convfusion
 */
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const CMD = await import(lib('research/commands.js'))
const WS = await import(lib('research/workspace.js'))

/**
 * 研究根目录。
 *
 * ⚠️ 不能直接拼 `join(rootOf(ws), 'project.md')`：v2 的研究数据收在会话工作区下的
 * `workspace/` 子目录（`380c175` 引入的布局，`workspace.ts` 的 `researchWorkspaceOf`）。
 * 这个脚本原先假设 project.md 就在工作区根，布局改了之后它一直在误报失败。
 */
const rootOf = (ws) => WS.researchWorkspaceOf(ws)

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

/** 用假 ctx 抓住注册的 CommandDefinition。 */
function mountCommand() {
  let definition = null
  const ctx = {
    get: (name) => (name === 'commands' ? { register: (d) => { definition = d; return () => {} } } : undefined),
    inject: (deps, cb) => { void deps; void cb; return () => {} },
    effect: () => () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  const disposers = CMD.defineResearchCommand(ctx, () => process.cwd())
  assert(disposers !== null && definition !== null, '命令注册成功（拿到 CommandDefinition）')
  return definition
}

/**
 * 假 invocation：记录 followup 收到的消息。
 *
 * ⚠️ cwd 必须挂在 `agent.session.header.cwd` —— 那才是 `workspaceOf()` 读的位置。
 * 放到别处会让命令**回退到 process.cwd()**，于是测试悄悄跑在真实工作区上
 * （那里已经有 project.md，测试会误判成"已有项目"分支）。
 */
function makeInvocation({ rawInput, cwd, withFollowup = true }) {
  const sent = []
  const agent = {
    ...(withFollowup ? { followup: (m) => sent.push(m) } : {}),
    session: { header: { cwd } },
  }
  return {
    invocation: { rawInput, agent, commandId: 'c1', attachments: [], signal: new AbortController().signal },
    sent,
  }
}

const definition = mountCommand()

/* ── 1. 首次：建项目 **并且** 开跑 ─────────────────────────────────── */
console.log('\n[1] 首次 `/research <主题>`：建项目 + 启动 Agent')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-cmd-new-'))
  const { invocation, sent } = makeInvocation({ rawInput: '基于视觉-LiDAR 跨模态共同刚体一致性的 UAV 定位误差校准', cwd: ws })
  const res = await definition.handler(invocation)

  assertEq(res.kind, 'success', '命令返回 success（界面能显示）')
  assert(typeof res.text === 'string' && res.text.length > 0, '返回文本非空（不是"没有反应"）')
  assert(existsSync(join(rootOf(ws), 'project.md')), 'project.md 已创建')
  assertEq(sent.length, 1, 'agent.followup 被调用**恰好一次**（这是"开始运行"的定义）')

  const msg = sent[0]
  const text = msg?.content?.map((b) => b.text ?? '').join('\n') ?? ''
  assert(text.includes('基于视觉-LiDAR 跨模态共同刚体一致性的 UAV 定位误差校准'), '交给 Agent 的文本含研究主题')
  assert(text.includes('project.md'), '文本指向 project.md（研究定义已落盘，不用猜）')
  assert(/不用按固定流程|没有固定流程|不规定步骤|不是固定流程/.test(text), '明确告诉 Agent 没有固定流程')
  assertEq(msg?.source?.kind, 'plugin', '消息来源标记为插件（走已知的 user/message 通道）')

  const project = readFileSync(join(rootOf(ws), 'project.md'), 'utf8')
  assert(project.includes('基于视觉-LiDAR'), 'project.md 记录了主题')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 2. 再次：继续推进（也要交给 Agent）──────────────────────────────── */
console.log('\n[2] 已有项目：`/research <意图>` 同样交给 Agent')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-cmd-cont-'))
  const first = makeInvocation({ rawInput: '跨模态标定', cwd: ws })
  await definition.handler(first.invocation)
  assertEq(first.sent.length, 1, '第一次已开跑')

  const second = makeInvocation({ rawInput: '先做一个消融实验', cwd: ws })
  const res = await definition.handler(second.invocation)
  assertEq(res.kind, 'success', '再次调用返回 success')
  assertEq(second.sent.length, 1, '再次调用也交给 Agent（不是只回话）')
  const text = second.sent[0]?.content?.map((b) => b.text ?? '').join('\n') ?? ''
  assert(text.includes('先做一个消融实验'), 'Agent 收到用户这次的具体意图')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 3. 无参数：只看状态，不启动 Agent ──────────────────────────────── */
console.log('\n[3] 无参数 `/research`：只报告状态')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-cmd-status-'))
  const seed = makeInvocation({ rawInput: '某个研究', cwd: ws })
  await definition.handler(seed.invocation)

  const view = makeInvocation({ rawInput: '', cwd: ws })
  const res = await definition.handler(view.invocation)
  assertEq(res.kind, 'success', '无参数返回 success')
  assert(res.text.includes('某个研究'), '状态里含研究主题')
  assertEq(view.sent.length, 0, '查看状态**不**启动 Agent（不产生副作用）')
  rmSync(ws, { recursive: true, force: true })
}

/* ── 4. followup 不可得：明确报错，不假装 ───────────────────────────── */
console.log('\n[4] 没有 agent.followup()：明确报错')
{
  const ws = mkdtempSync(join(tmpdir(), 'cf-cmd-nofu-'))
  const { invocation } = makeInvocation({ rawInput: '某个研究', cwd: ws, withFollowup: false })
  const res = await definition.handler(invocation)
  assertEq(res.kind, 'error', '返回 error（而不是假装已开始）')
  assert(/followup/.test(res.text), '错误信息说明缺的是 agent.followup()')
  rmSync(ws, { recursive: true, force: true })
}

console.log(`\n${failed === 0 ? '✅' : '❌'} research-command: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
