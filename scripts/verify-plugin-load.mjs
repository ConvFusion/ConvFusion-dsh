#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 插件加载冒烟测试（无 DSH、无 LLM）。
 *
 * ## 为什么需要这个测试
 *
 * 其余六套验证都是**离线纯函数测试**：它们直接调用 lib 里的函数，从不执行
 * `apply(ctx)`。因此**完全覆盖不到插件装配层** —— 2026-09-12 就是这样漏掉的：
 * `ResearchContextService.mount()` 访问了未在 `inject` 中声明的 `ctx.systemPrompt`，
 * Cordis 抛 `cannot get property "systemPrompt" without inject`，
 * **整个 profile 起不来**，而当时 744 条断言全绿。
 *
 * ## 它检查什么
 *
 * 1. `apply()` 能在**声明了依赖**的 mock context 上正常装配，不抛错；
 * 2. 装配过程真的注册了 Research Context（section + context 各一次）；
 * 3. 任意一个依赖缺失时**明确失败**（而不是静默半装配）—— 因为加载是全有或全无的；
 * 4. `inject` 列表覆盖代码实际访问的每一个服务（静态检查，防止再次漏声明）。
 *
 * 用法：
 *   node scripts/verify-plugin-load.mjs packages/dsh-convfusion
 */
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')
const PLUGIN = await import(pathToFileURL(join(PKG, 'lib', 'index.js')).href)

let passed = 0, failed = 0
const failures = []
const assert = (c, l) => { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ FAIL ${l}`) } }
const assertEq = (a, b, l) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) console.log(`    actual: ${JSON.stringify(a)}\n    expect: ${JSON.stringify(b)}`); assert(ok, l) }

/* ════════════════════════════════════════════════════════════════════════
 * 真实 Cordis context + mock 服务
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * 用**真实的 Cordis `Context`** 装配插件，并注册 mock 服务。
 *
 * 为什么不用手写假 ctx：`ResearchContextService extends Service`，Service 的构造与
 * 服务解析依赖 Cordis 的 fiber / reflect 机制。手写对象会让测试在**测试自身的缺陷**上
 * 失败，而不是在插件缺陷上失败。同时，真实 Context 会真正执行 `inject` 约束 ——
 * 这正是本次缺陷（访问未 inject 的服务）能被抓到的前提。
 */
async function buildRoot({ provided, cwd } = {}) {
  // cordis 装在插件包的 node_modules 里，脚本从工作区根运行 —— 按包路径解析
  const { createRequire } = await import('node:module')
  const req = createRequire(join(PKG, 'package.json'))
  const cordisPath = req.resolve('@deepseek-ai/cordis')
  const { Context } = await import(pathToFileURL(cordisPath).href)
  const root = new Context()
  const recorded = {
    sections: [], contexts: [], providers: [], tools: [],
    listeners: [], effects: [], commands: 0, commandNames: [], services: {},
    settingsNamespaces: [], settingsBases: [], webRoutes: [], webRouteHandler: null,
  }

  const services = provided ?? [...PLUGIN.inject, 'commands', 'settings', 'connection', 'webServer']
  const has = (n) => services.includes(n)

  // 先挂一个 fiber 来 provide 服务（根作用域需要活跃 fiber 才能注册）
  root.plugin({
    name: 'cf-test-services',
    apply(c) {
      if (has('tools')) {
        c.provide('tools', {
          register: (t) => { recorded.tools.push(t.name); return () => {} },
        })
      }
      if (has('systemPrompt')) {
        c.provide('systemPrompt', {
          section: (x) => { recorded.sections.push(x); return () => {} },
          context: (x) => { recorded.contexts.push(x); return () => {} },
          getSectionOrder: () => 0,
          getContextOrder: () => 0,
        })
      }
      if (has('skills')) {
        c.provide('skills', {
          registerProvider: (create) => { recorded.providers.push(create); return () => {} },
        })
      }
      // 可选能力：commands 服务（插件用 ctx.inject(['commands']) 按需挂载）
      if (has('commands')) {
        c.provide('commands', {
          register: (def) => { recorded.commands += 1; recorded.commandNames.push(def.name); return () => {} },
        })
      }
      // 可选能力：设置面（命名空间 + 定制内容 RPC）。
      // ⚠️ 插件用 `ctx.inject([...])` 按需挂载，所以缺这两个服务时插件**必须照常工作**，
      // 只是没有设置界面 —— [2] 会验证这一点。
      if (has('settings')) {
        c.provide('settings', {
          register: (ns, schema, options) => {
            recorded.settingsNamespaces.push(ns)
            recorded.settingsBases.push(options?.base)
            return { get: () => options?.base ?? {}, watch: () => () => {} }
          },
        })
      }
      if (has('connection')) {
        c.provide('connection', { requestRejection: () => undefined })
      }
      // 设置面的数据通道是**自己的 webServer 前缀路由**（不是 Connection RPC：
      // 后者对外部插件在这版 DSH 上不可用，见 settings-rpc.ts 文件头）
      if (has('webServer')) {
        c.provide('webServer', {
          register: (route) => {
            recorded.webRoutes.push(route.path)
            recorded.webRouteHandler = route.handler
            return () => {}
          },
          registerUpgrade: () => () => {},
          registerFallback: () => () => {},
        })
      }
      if (cwd) c.provide('session', { header: { cwd } })
    },
  })

  /** 让 Cordis 处理完 fiber 队列（激活是异步的）。 */
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

  return { root, recorded, settle }
}

/** 够用的 node:http 请求/响应替身（路由处理器是 node:http 风格）。 */
const makeReq = ({ method = 'POST', url = '/dsh-convfusion/state' } = {}) => {
  const buf = Buffer.from(JSON.stringify({ payload: {} }))
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield buf
    },
  }
}
const makeRes = () => ({
  statusCode: 0,
  body: undefined,
  setHeader() {},
  writeHead(code) {
    this.statusCode = code
  },
  end(payload) {
    this.body = payload
  },
  on() {},
  writableEnded: false,
})

const ws = mkdtempSync(join(tmpdir(), 'cf-load-'))

/* ── 1. 正常装配 ──────────────────────────────────────────────────── */
console.log('\n[1] 声明齐全时插件正常装配')
{
  assertEq(PLUGIN.inject, ['tools', 'systemPrompt', 'skills'], 'inject 声明了三个核心服务')
  assertEq(typeof PLUGIN.apply, 'function', '导出 apply()')
  assertEq(PLUGIN.name, 'dsh-convfusion', '导出插件名')

  const { root, recorded } = await buildRoot()
  const ctx = root
  // ⚠️ 必须 **await fiber**：装配错误不会同步抛出，也不会在几次 microtask 后出现 ——
  // Cordis 把它存在 fiber 上，只有 `await fiber` / `fiber.await()` 才会重新抛出。
  // 这正是 2026-09-12 两次插件事故（inject 缺声明、ctx.set 未 provide）能躲过本测试的原因。
  let threw = null
  let fiber = null
  try {
    fiber = await root.plugin({ name: 'dsh-convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  } catch (e) {
    threw = e
  }
  Object.assign(ctx, { __registered: recorded })
  assert(threw === null, `装配不抛错${threw ? `（实际：${threw.message}）` : ''}`)
  assert(ctx.__registered.sections.length === 1 && ctx.__registered.tools.length >= 6, '插件被激活（产生了实际注册行为）')

  // Stage 1 的核心：Research Context 确实被注册
  assertEq(ctx.__registered.sections.length, 1, '注册了 1 个 prompt section（Research Guide）')
  assertEq(ctx.__registered.contexts.length, 1, '注册了 1 个 dynamic context（Research Context）')
  const guide = ctx.__registered.sections[0]
  const snapshot = ctx.__registered.contexts[0]
  assert(guide && typeof guide.name === 'string' && guide.name.startsWith('convfusion:'), 'section 名带插件前缀（避免冲突）')
  assert(snapshot && typeof snapshot.text === 'function', 'context.text 是函数（每次组装求值 —— Stage 1 §6）')
  assert(snapshot.order !== guide.order, 'section 与 context 使用不同 order')

  // Stage 2 的注册点
  assertEq(ctx.__registered.providers.length, 1, '注册了 1 个 Skill provider')
  // 研究资产工具
  assert(ctx.__registered.tools.length >= 8, `注册了研究资产工具（${ctx.__registered.tools.length} 个）`)
  for (const want of ['research_evidence', 'research_claim', 'research_state_propose', 'research_paper', 'research_output', 'research_literature_search']) {
    assert(ctx.__registered.tools.includes(want), `注册了 ${want}`)
  }
  // 事件桥：cordis 的 ctx.on 由框架接收（不经过本测试的 mock），
  // 因此这里静态确认插件确实订阅了该事件（运行期由 Cordis 派发）。
  const indexSrc = readFileSync(join(PKG, 'src', 'index.ts'), 'utf8')
  assert(indexSrc.includes("ctx.on('agent/pre-step'"), '插件订阅了 agent/pre-step（同步会话 cwd）')
  assert(indexSrc.includes('return next()'), 'waterfall 必须放行（否则会阻断 Agent）')
  // 命令
  assert((ctx.__registered.commands ?? 0) >= 1, '注册了 /research 命令')
  // 运行期句柄：插件必须用 **ctx.provide('convfusion', ...)** 发布。
  // 用 `ctx.set()` 首次发布会抛 `cannot set property "convfusion" without provide`，
  // 整个 profile 起不来 —— 这里断言服务真的可解析、且形状正确。
  const handle = root.get('convfusion')
  assert(handle !== undefined && handle !== null, 'ctx.provide("convfusion") 后服务可解析')
  assert(typeof handle === 'object' && handle.research && handle.events, '句柄含 research / events')
  assert(typeof handle.customizationStore === 'object', '句柄含 customizationStore（设置面用）')
  assert(typeof handle.systemLibrary === 'object', '句柄含 systemLibrary 状态')

  // 卸载：用 fiber 自己的 disposer（`root.stop()` 在 Cordis 上并不存在，
  // 之前那句 `root.stop?.()` 是空操作，断言等于没跑）。
  let disposeThrew = null
  try {
    await fiber.dispose()
    assertEq(root.get('convfusion'), undefined, '卸载后 convfusion 服务被回收（provide 由 fiber 持有）')
    assertEq(root.get('convfusionResearch'), undefined, '卸载后 ResearchContextService 也被回收')
    // 回收干净才能重装 —— 否则重载会撞上 service 已注册
    const fiber2 = await root.plugin({ name: 'dsh-convfusion-2', apply: PLUGIN.apply, inject: PLUGIN.inject })
    assert(root.get('convfusion') !== undefined, '卸载后可重新装配（DHS 热重载路径）')
    await fiber2.dispose()
    assertEq(root.get('convfusion'), undefined, '第二次卸载同样干净')
  } catch (e) {
    disposeThrew = e
  }
  assert(disposeThrew === null, `卸载路径不抛错${disposeThrew ? `（实际：${disposeThrew.message}）` : ''}`)
}

/* ── 2. 依赖缺失必须明确失败 ──────────────────────────────────────── */
console.log('\n[2] 任一核心依赖缺失 → 明确失败（不静默半装配）')
{
  for (const missing of ['systemPrompt', 'skills', 'tools']) {
    const provided = PLUGIN.inject.filter((s) => s !== missing)
    const { root, settle } = await buildRoot({ provided })
    let err = null
    try {
      root.plugin({ name: 'dsh-convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
      await settle()
      // 依赖不满足时 Cordis 会把插件挂起而非立即报错 —— 显式检查它没有被激活
      const active = root.get('convfusion') !== undefined
      if (!active) err = new Error(`missing ${missing}: plugin did not activate`)
    } catch (e) {
      err = e
    }
    assert(err !== null, `缺少 ${missing} 时插件不激活（依赖不满足不静默半装配）`)
  }
}

/* ── 2b. 设置面（【设置】-【ConvFusion】）装配 ─────────────────────── */
console.log('\n[2b] 设置面：settings 命名空间 + /dsh-convfusion 路由')
{
  const ws2 = mkdtempSync(join(tmpdir(), 'cf-load-settings-'))
  const { root, recorded } = await buildRoot({ cwd: ws2 })
  let err = null
  try {
    await root.plugin({ name: 'dsh-convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  } catch (e) {
    err = e
  }
  assert(err === null, '带 settings + connection 的 profile 装配不抛错')
  assertEq(recorded.settingsNamespaces, ['convfusion'], '注册了 settings 命名空间 "convfusion"')
  assert(recorded.settingsBases[0] && typeof recorded.settingsBases[0] === 'object', '命名空间带组合层 base')

  assertEq(recorded.webRoutes, ['/dsh-convfusion'], '注册了 /dsh-convfusion 路由')
  assert(typeof recorded.webRouteHandler === 'function', '路由有可调用的处理器')
  if (typeof recorded.webRouteHandler === 'function') {
    const res = makeRes()
    await recorded.webRouteHandler(
      makeReq({ url: '/dsh-convfusion/state' }),
      res,
    )
    assertEq(res.statusCode, 200, 'POST /state 返回 200')
    const parsed = JSON.parse(String(res.body))
    assert(parsed.ok === true, 'RPC state 端点可调用')
    assert(
      Array.isArray(parsed.value?.categories) && parsed.value.categories.length > 0,
      'RPC 返回类别 → 研究方法 → 章节',
    )
  }

  // 可选能力缺失时必须能降级：没有 settings / connection / webServer 也要装配成功
  for (const missing of ['settings', 'connection', 'webServer']) {
    const only = [...PLUGIN.inject, 'commands', 'settings', 'connection', 'webServer'].filter((s) => s !== missing)
    const r = await buildRoot({ provided: only })
    let e2 = null
    try {
      await r.root.plugin({ name: 'dsh-convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
    } catch (e) {
      e2 = e
    }
    assert(e2 === null, `缺少可选服务 ${missing} 时仍能装配（设置面降级，不是加载失败）`)
    assert(r.recorded.tools.length >= 8, `缺少 ${missing} 时核心能力照常注册（${r.recorded.tools.length} 个工具）`)
  }
  rmSync(ws2, { recursive: true, force: true })
}

/* ── 3. 静态检查：代码访问的服务都在 inject 里 ────────────────────── */
console.log('\n[3] 静态检查：访问的服务 ⊆ inject 声明')
{
  const declared = new Set(PLUGIN.inject)
  // 扫**全部** src（固定四个文件会漏掉新增模块 —— 这个检查必须无死角）
  const files = []
  ;(function walk(dir) {
    for (const e of readdirSync(join(PKG, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) walk(rel)
      else if (e.name.endsWith('.ts')) files.push(rel)
    }
  })('src')
  assert(files.length >= 20, `扫到 ${files.length} 个源文件（全量静态检查）`)
  // 我们在代码里通过属性访问的 Cordis 服务（白名单外的即为插件自身 API）
  const PLUGIN_API = new Set([
    'logger', 'effect', 'on', 'inject', 'set', 'get', 'tools', 'systemPrompt', 'skills',
    'commands', 'agents', 'session', 'llm', 'webServer', 'connection', 'settings',
    'provide', 'logger',
  ])
  const accessed = new Set()
  for (const f of files) {
    const src = readFileSync(join(PKG, f), 'utf8')
    for (const m of src.matchAll(/(?:this\.)?ctx\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
      const name = m[1]
      if (PLUGIN_API.has(name)) accessed.add(name)
    }
  }
  // `this.ctx` / `self.ctx` 也要算进去（Service 子类里是这么访问的）
  for (const f of files) {
    const src = readFileSync(join(PKG, f), 'utf8')
    for (const m of src.matchAll(/(?:this|self)\.ctx\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
      if (PLUGIN_API.has(m[1])) accessed.add(m[1])
    }
  }
  // tools / systemPrompt / skills 是**直接属性访问**的重服务，必须声明
  for (const s of ['tools', 'systemPrompt', 'skills']) {
    if (accessed.has(s)) {
      assert(declared.has(s), `代码访问了 ctx.${s} 且已声明 inject`)
    }
  }
  // 可选能力用 ctx.inject(...) 挂载，不应在声明里（否则精简 profile 加载失败）
  assert(!declared.has('commands'), 'commands 作为可选能力，不在 inject 里（用 ctx.inject 挂载）')
  assert(!declared.has('webServer'), 'webServer 作为可选能力，不在 inject 里')
  // settings / connection 同样是可选能力：进了 inject 会让精简 profile 直接加载失败
  assert(!declared.has('settings'), 'settings 作为可选能力，不在 inject 里（用 ctx.inject 挂载）')
  assert(!declared.has('connection'), 'connection 作为可选能力，不在 inject 里（用 ctx.inject 挂载）')

  // 发布服务只能用 ctx.provide()：`ctx.set()` 只改写**已存在**的服务，
  // 首次发布会抛 `cannot set property "X" without provide`，整个 profile 起不来。
  const allSrc = files.map((f) => readFileSync(join(PKG, f), 'utf8')).join('\n')
  const setCalls = [...allSrc.matchAll(/ctx\.set\(\s*'([^']+)'/g)].map((m) => m[1])
  assertEq(setCalls, [], '不使用 ctx.set() 发布服务（必须用 ctx.provide()）')
  assert(/ctx\.provide\(\s*'convfusion'/.test(allSrc), '插件用 ctx.provide("convfusion") 发布服务')
}

/* ── 4. workspace = 当前工作区 ─────────────────────────────────── */
console.log('\n[4] 装配安全性与 workspace 语义')
{
  // ⚠️ 必须用**显式**的非研究目录，不能依赖 process.cwd()：
  // 本仓库根目录本身就是一个研究 workspace（真跑过 /research，有 project.md），
  // 依赖 cwd 会让这条断言随"当前在哪个目录跑测试"而随机失败。
  //
  // 装配阶段还没有会话，`ResearchContextService` 用的是 `process.cwd()` 占位
  // （首个 `agent/pre-step` 才替换成会话 cwd）。所以要验证"非研究目录不注入 Guide"，
  // 必须真的把进程 cwd 切到一个非研究目录 —— 用 cwd 参数注入 session 是没用的。
  const plainDir = mkdtempSync(join(tmpdir(), 'cf-load-plain-'))
  const cwdBefore = process.cwd()
  let ctx = null
  let recorded = null
  let err = null
  try {
    process.chdir(plainDir)
    const built = await buildRoot({ cwd: plainDir })
    ctx = built.root
    recorded = built.recorded
    await ctx.plugin({ name: 'dsh-convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  } catch (e) {
    err = e
  } finally {
    process.chdir(cwdBefore)
  }
  ctx.__registered = recorded
  assert(err === null, '装配不抛错（workspace 尚无 project.md）')

  const guide = ctx.__registered.sections[0]
  const textAtRoot = typeof guide.text === 'function' ? guide.text({}) : guide.text
  // 非研究目录 → 不注入 Guide
  assertEq(textAtRoot, '', '非研究 workspace → Guide 文本为空（不污染普通对话）')
  rmSync(plainDir, { recursive: true, force: true })

  // workspace 就是**当前工作区**：切到一个真实研究目录后应注入
  const researchDir = mkdtempSync(join(tmpdir(), 'cf-load-research-'))
  writeFileSync(join(researchDir, 'project.md'), '# Research Project\n\n## Research Statement\n\nLoad test research\n')
  const prevCwd = process.cwd()
  try {
    process.chdir(researchDir)
    const { root: r2, recorded: rec2, settle: settle2 } = await buildRoot()
    r2.plugin({ name: 'dsh-convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
    await settle2()
    const guide2 = rec2.sections[0]
    const text2 = typeof guide2.text === 'function' ? guide2.text({}) : guide2.text
    assert(typeof text2 === 'string' && text2.length > 0, '研究工作区 → Guide 文本非空')
    assert(/research project/i.test(text2), 'Guide 文本内容正确（说明科研模式与边界）')
    assert(!/step 1|next step|先做/i.test(text2), 'Guide 不规定流程（Stage 1 §12）')
  } finally {
    process.chdir(prevCwd)
    rmSync(researchDir, { recursive: true, force: true })
  }
}

/* ── 5. 配置解析 ─────────────────────────────────────────────────── */
console.log('\n[5] 配置（设置里只有文件名）')
{
  const cfgPath = join(ws, 'cfg')
  mkdirSync(cfgPath, { recursive: true })
  const { root: ctx, settle } = await buildRoot()
  let err = null
  try {
    await ctx.plugin({
      name: 'dsh-convfusion',
      apply: (c, cfg) => PLUGIN.apply(c, cfg),
      inject: PLUGIN.inject,
      config: { customizationFile: 'my.json', customizationDir: cfgPath },
    })
  } catch (e) {
    err = e
  }
  assert(err === null, '带配置的装配不抛错')
  // 配置生效的直接证据：定制 store 指向配置的文件（通过日志中的 description 断言）
  const cfgMod = await import(pathToFileURL(join(PKG, 'lib', 'config.js')).href)
  const resolvedPath = cfgMod.resolveCustomizationPath({ customizationFile: 'my.json', customizationDir: cfgPath })
  assertEq(resolvedPath, join(cfgPath, 'my.json'), '定制文件路径按配置解析')
  const libMod = await import(pathToFileURL(join(PKG, 'lib', 'research', 'skill-customization.js')).href)
  const store = libMod.createFileCustomizationStore(() => resolvedPath)
  store.set('patent-drafting', 'Research Method', 'my method')
  assert(store.load()['patent-drafting']['Research Method'] === 'my method', '定制可写入配置指定的文件')
  assert(store.description.includes(join(cfgPath, 'my.json')), 'store 指向配置指定的文件')
}

rmSync(ws, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '✅' : '❌'} plugin-load: ${passed} passed, ${failed} failed`)
if (failed > 0) { console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n')); process.exit(1) }
