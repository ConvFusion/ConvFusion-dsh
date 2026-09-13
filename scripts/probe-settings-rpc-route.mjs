#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 设置面的 HTTP 路由**真的挂上了吗**？（能真的收发吗）
 *
 * ## 为什么必须单独有这么一支测试
 *
 * 这里踩过两次坑，都是"插件报告装配成功、功能却是死的"：
 *
 * 1. **第一版**用 `connection.rpc.handle('/convfusion', …)`。它内部是
 *    `owner.effect(() => owner.webServer.register(route), …)`，而 `owner` 上挂着指向
 *    connection 插件自身 fiber 的 shadow（`owner.fiber` 看着是我们，实际属性访问从
 *    shadow 起步），那个 fiber 没有 `webServer` → 抛
 *    `cannot get property "webServer" without inject` → 异常被它自己的 `effect()` 吞掉。
 *    结果：插件加载无错、界面正常出现，浏览器 `POST /convfusion/state` 落到
 *    `dsh-host-frontend-static` 的 fallback 上收到 **HTTP 405**。
 * 2. **第二版**改成自己注册 `webServer` 路由。这次能注册（消费者 context 可以），
 *    但**必须**验证处理器真的能收发 —— 只断言"register 被调用过"是不够的。
 *
 * 所以这支测试用真实的 `HostConnectionService`（提供 `requestRejection` 栅栏）+ 可观测的
 * `webServer` 替身，然后：
 *
 *   - 断言 `POST /dsh-convfusion/state` 走完整条链路，拿到 200 与类别数据；
 *   - 断言信任栅栏**真的被调用**，拒绝时返回 401 而不是数据；
 *   - 断言 GET / 未知路径 / 穿越路径 / 非法 JSON / 超大 body 都被正确拒绝；
 *   - 断言注册失败会**吵出来**（不允许静默成功）。
 *
 * 用法：
 *   node scripts/probe-settings-rpc-route.mjs packages/dsh-convfusion
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || 'packages/dsh-convfusion')

/**
 * 解析一个 DSH 包。
 *
 * `@deepseek-ai/dsh-client-connection` **不是**本插件的依赖（由 profile 提供），
 * 所以按多个根依次尝试：插件自身 → DSH profile → npx 缓存。
 * 找不到时**跳过**并大声说明 —— 静默跳过正是这类问题能溜过去的原因。
 */
function resolveDsh(name) {
  const roots = [
    join(PKG, 'package.json'),
    join(
      process.env.DSH_HOME || join(process.env.HOME ?? '', '.dsh'),
      'profiles',
      'web',
      'package.json',
    ),
  ]
  const npx = join(process.env.HOME ?? '', '.npm', '_npx')
  try {
    for (const d of readdirSync(npx)) roots.push(join(npx, d, 'package.json'))
  } catch {
    /* 没有 npx 缓存也无所谓 */
  }
  for (const root of roots) {
    try {
      return createRequire(root).resolve(name)
    } catch {
      /* 试下一个根 */
    }
  }
  return null
}

const cordisPath = resolveDsh('@deepseek-ai/cordis')
const connPath = resolveDsh('@deepseek-ai/dsh-client-connection')
if (cordisPath === null || connPath === null) {
  console.log(
    '⚠️  SKIPPED settings-rpc-route：找不到 @deepseek-ai/dsh-client-connection。\n' +
      '    这支测试必须用**真实的** HostConnectionService 才有意义。\n' +
      '    安装 DSH profile 后重跑：dsh plugin --profile web add <本包>',
  )
  process.exit(0)
}

const { Context } = await import(pathToFileURL(cordisPath).href)
const { HostConnectionService } = await import(pathToFileURL(connPath).href)
const PLUGIN = await import(pathToFileURL(join(PKG, 'lib', 'index.js')).href)
const RPC = await import(pathToFileURL(join(PKG, 'lib', 'settings-rpc.js')).href)

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

/** 一个够真的 node:http 响应替身。 */
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v
    },
    writeHead(code, h) {
      this.statusCode = code
      Object.assign(this.headers, h ?? {})
    },
    end(payload) {
      this.body = payload
    },
    on() {},
    writableEnded: false,
  }
}

/** 一个够真的 node:http 请求替身（body 走 asyncIterator）。 */
function fakeRequest({ method = 'POST', url = '/dsh-convfusion/state', headers = {}, body = {} } = {}) {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  return {
    method,
    url,
    headers: { 'content-type': 'application/json', host: '127.0.0.1:3080', ...headers },
    async *[Symbol.asyncIterator]() {
      yield buf
    },
  }
}

/**
 * 搭一个"真实连接服务 + 可观测 webServer"的宿主。
 *
 * @param opts.withWebServer false = 故意不提供 webServer（验证失败会被吵出来）
 * @param opts.authenticated false = 让信任栅栏拒绝
 */
async function buildHost(opts = {}) {
  const withWebServer = opts.withWebServer !== false
  const routes = []
  const logs = { info: [], warn: [], error: [] }
  const root = new Context()

  if (withWebServer) {
    await root.plugin({
      name: 'webserver-stub',
      apply(c) {
        c.provide('webServer', {
          register: (route) => {
            if (opts.registerThrows) throw new Error('duplicate route: ' + route.path)
            routes.push(route)
            return () => {}
          },
          registerUpgrade: () => () => {},
          registerFallback: () => () => {},
          renderIndex: (h) => h,
        })
      },
    })
  }

  // 真实的宿主连接服务 —— 提供 requestRejection 栅栏
  const browserAuth = {
    isAuthenticated: () => opts.authenticated !== false,
    authorizeIndex: () => true,
    authenticatedUrl: (u) => u,
  }
  await root.plugin({
    name: 'connection-plugin',
    apply(c) {
      new HostConnectionService(c, ['127.0.0.1'], browserAuth)
    },
  })

  await root.plugin({
    name: 'core-stub',
    apply(c) {
      c.provide('tools', { register: () => () => {} })
      c.provide('systemPrompt', {
        section: () => () => {},
        context: () => () => {},
        getSectionOrder: () => 0,
        getContextOrder: () => 0,
      })
      c.provide('skills', { registerProvider: () => () => {} })
      c.provide('settings', { register: () => ({ get: () => ({}), watch: () => () => {} }) })
    },
  })

  root.logger = {
    info: (m) => logs.info.push(String(m)),
    warn: (m) => logs.warn.push(String(m)),
    error: (m) => logs.error.push(String(m)),
  }

  return { root, routes, logs }
}

const HOME = mkdtempSync(join(tmpdir(), 'cf-route-'))
process.env.DSH_HOME = HOME

/* ── 1. 路由真的注册，且能收发 ────────────────────────────────────── */
console.log('\n[1] webServer 可得 → 路由注册，POST 端到端可用')
{
  const { root, routes, logs } = await buildHost()
  let err = null
  try {
    await root.plugin({ name: 'convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  } catch (e) {
    err = e
  }
  assert(err === null, `装配不抛错${err ? `（${err.message}）` : ''}`)
  if (logs.error.length) console.log('    [宿主 error 日志]', JSON.stringify(logs.error))

  const hit = routes.find((r) => r.path === RPC.SETTINGS_ROUTE_PREFIX)
  assert(
    hit !== undefined,
    `路由注册到 webServer（已注册：${routes.map((r) => r.path).join(', ') || '无'}）`,
  )
  assertEq(hit?.kind, 'prefix', '路由是 prefix（覆盖前缀下的所有端点）')

  if (hit) {
    const res = fakeResponse()
    await hit.handler(fakeRequest({ url: `${RPC.SETTINGS_ROUTE_PREFIX}/state` }), res)
    assertEq(res.statusCode, 200, `POST /state 返回 200（不是 405/404）—— 实际 ${res.statusCode}`)
    const parsed = JSON.parse(String(res.body))
    assert(parsed.ok === true, '响应信封 ok = true')
    assert(Array.isArray(parsed.value?.categories), 'RPC 返回类别 → 研究方法 → 章节')
    assert(parsed.value.categories.length > 0, `类别非空（${parsed.value.categories.length} 个）`)
  }
}

/* ── 2. 信任栅栏真的生效 ──────────────────────────────────────────── */
console.log('\n[2] 信任 / 鉴权栅栏')
{
  const { root, routes } = await buildHost({ authenticated: false })
  await root.plugin({ name: 'convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  const hit = routes.find((r) => r.path === RPC.SETTINGS_ROUTE_PREFIX)
  assert(hit !== undefined, '路由已注册')

  if (hit) {
    const res = fakeResponse()
    await hit.handler(fakeRequest(), res)
    assertEq(res.statusCode, 401, '未认证 → 401（栅栏真的被调用）')
    assert(!String(res.body).includes('categories'), '拒绝时**不返回**任何数据')
  }
}

/* ── 3. 方法 / 路径 / body 的边界 ─────────────────────────────────── */
console.log('\n[3] 方法、路径与请求体边界')
{
  const { root, routes } = await buildHost()
  await root.plugin({ name: 'convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  const hit = routes.find((r) => r.path === RPC.SETTINGS_ROUTE_PREFIX)
  assert(hit !== undefined, '路由已注册')

  if (hit) {
    const get = fakeResponse()
    await hit.handler(fakeRequest({ method: 'GET' }), get)
    assertEq(get.statusCode, 405, 'GET → 405（只接受 POST）')

    const unknown = fakeResponse()
    await hit.handler(fakeRequest({ url: '/dsh-convfusion/nope/nothing' }), unknown)
    assertEq(unknown.statusCode, 200, '未知端点仍返回 200（错误在信封里）')
    assertEq(JSON.parse(String(unknown.body)).error.code, 'unknown-endpoint', '错误码 = unknown-endpoint')

    const traversal = fakeResponse()
    await hit.handler(fakeRequest({ url: '/dsh-convfusion/../secret' }), traversal)
    assertEq(traversal.statusCode, 404, '路径穿越被拒（404）')

    const outside = fakeResponse()
    await hit.handler(fakeRequest({ url: '/other/state' }), outside)
    assertEq(outside.statusCode, 404, '前缀之外的路径不归我们管（404）')

    const badJson = fakeResponse()
    await hit.handler(fakeRequest({ body: '{ not json' }), badJson)
    assertEq(badJson.statusCode, 400, '非法 JSON → 400')
    assertEq(JSON.parse(String(badJson.body)).error.code, 'bad-body', '错误码 = bad-body')

    const tooBig = fakeResponse()
    await hit.handler(fakeRequest({ body: 'x'.repeat(RPC.SETTINGS_MAX_BODY_BYTES + 10) }), tooBig)
    assert(tooBig.statusCode === 400 || tooBig.statusCode === 413, `超大 body 被拒（${tooBig.statusCode}）`)
  }
}

/* ── 4. 失败不能静默 ───────────────────────────────────────────────── */
console.log('\n[4] 两种失败路径都不许静默')
{
  // 4a：注册抛错（例如路由冲突）→ 插件整体仍可用，但必须记 error。
  //     这正是第一版 RPC 渠道的真实形态：异常被 effect 吞掉、日志里什么都没有。
  const throwing = await buildHost({ registerThrows: true })
  let err = null
  try {
    await throwing.root.plugin({ name: 'convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  } catch (e) {
    err = e
  }
  assert(err === null, '注册抛错时装配仍不抛错（插件其余部分照常工作）')
  assertEq(throwing.routes.length, 0, '注册失败 → 没有路由')
  const complained = throwing.logs.error.some((l) => /路由注册失败/.test(l))
  assert(complained, `注册失败必须记 error（实际 error=${JSON.stringify(throwing.logs.error)}）`)

  // 4b：profile 里根本没有 webServer（headless）→ 插件照常工作，只是没有设置面。
  //     这不是错误，不该吵；但也绝不能"看起来注册了"。
  const headless = await buildHost({ withWebServer: false })
  let err2 = null
  try {
    await headless.root.plugin({ name: 'convfusion', apply: PLUGIN.apply, inject: PLUGIN.inject })
  } catch (e) {
    err2 = e
  }
  assert(err2 === null, 'headless（无 webServer）时插件照常装配')
  assertEq(headless.routes.length, 0, 'headless 时没有路由（事实，不是错误）')
  assert(
    headless.logs.info.some((l) => /research context|user customizations/.test(l)),
    'headless 时插件其余部分确实在跑（有 info 日志）',
  )
}

rmSync(HOME, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} settings-rpc-route: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
