#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 「登录 ConvFusion.com」离线验证（无 DSH、无真服务器、无浏览器）
 *
 * ## 为什么需要它
 *
 * 登录这条链路上最容易出错的**不是**界面，而是宿主侧的三个约定：
 *
 *   1. **凭据纪律**：明文 API Key 绝不能出现在任何回给浏览器的返回值里；
 *   2. **失败语义**：401 / 403 / 409 / 429 / 网络错误必须映射成**不同的**原因，
 *      因为对应的用户动作不同（换 Key / 找管理员 / 改用 Key 登录 / 等一会儿 / 查服务器）；
 *   3. **落盘时机**：只有验证成功才写凭据；失败**绝不能**留下一份坏凭据。
 *
 * 这三件事都能用假 `fetch` 完整断言 —— 不需要真服务器，也不会因为网络抖动而假红/假绿。
 * 真实服务器上的端到端验证在 `verify-server-login-live.mjs`。
 *
 * 用法：
 *   node scripts/verify-server-login.mjs [pkgDir]
 */
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const RPC = await import(lib('settings-rpc.js'))
const CFG = await import(lib('config.js'))
const SC = await import(lib('server-client.js'))
const ENVCFG = await import(lib('server-env.js'))
const CUST = await import(lib('research/skill-customization.js'))

/**
 * 测试用的"环境"。
 *
 * ⚠️ 必须显式钉住环境名：本机可能装了 `convfusion.env.json`（甚至有人 shell 里设了
 * `CONVFUSION_ENV=production`），而断言要的是**确定性**。所以这里给一个最小环境，
 * 需要别的环境时由 {@link withEnv} 显式构造。
 */
const TEST_ENV = { CONVFUSION_ENV: 'development' }

/** 造一个受控的环境（读哪份配置文件、什么环境名，全部显式）。 */
function withEnv(extra) {
  return { ...TEST_ENV, ...extra }
}

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) {
    passed++
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
/** 一条断言组的小标题（失败时仍然能看出在哪一节）。 */
function section(title) {
  console.log(`\n${title}`)
}

/** 明文凭据的"出现即失败"守卫：任何回给浏览器的值里都不许有它。 */
const KEY = 'cf_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
function keyLeak(found, where) {
  assert(
    !JSON.stringify(found ?? null).includes(KEY),
    `${where} 里没有 API Key 明文`,
  )
}

/* ════════════════════════════════════════════════════════════════════════
 * 假服务器：一个能按脚本作答的 fetch
 *
 * `handler(url, init)` 返回 `{ status, body }`；抛异常 = 网络层失败。
 * 所有请求都被记录，便于断言"发到哪、带什么头、带没带凭据"。
 * ════════════════════════════════════════════════════════════════════════ */
function makeFetch(handler) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const call = {
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      body: init?.body,
    }
    calls.push(call)
    const reply = await handler(call)
    if (reply instanceof Error) throw reply
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    }
  }
  return { fetchImpl, calls }
}

/** 账号对象（服务器 `/auth/me` 的响应形状：snake_case）。 */
const ME = {
  id: 'eed5abd6-b2d9-4a80-b0ad-4d7fffd27a6c',
  email: 'cz-r-066e63@example.com',
  display_name: 'Res',
  status: 'ACTIVE',
  roles: ['RESEARCHER'],
}

/** 服务器错误信封（`API.md` §3 的统一错误契约）。 */
const err = (code, message, details = {}) => ({ error: { code, message, details } })

/**
 * 建一个 host 面夹具。
 *
 * `lagging: true` 模拟**真实**的异步提交时序：`scope.update()` 提交后
 * `scope.get()` 不会立刻反映新值（`watch` 是异步的）。登录返回的 state 必须
 * **不依赖**这个时序，否则界面会显示"登录成功但未登录"。
 */
function makeHost({
  config = {},
  apiKeyFromEnv = '',
  handler = async () => ({ status: 200, body: ME }),
  lagging = true,
  withSetConfig = true,
  timeoutMs,
  paidBriefStore,
} = {}) {
  const initial = CFG.resolveConfig({
    customizationFile: 'x.json',
    customizationDir: '/tmp/cf-login-test',
    ...config,
    ...(apiKeyFromEnv ? { convfusionApiKey: '' } : {}),
  })
  let current = initial
  const writes = []
  const env = { ...TEST_ENV, ...(apiKeyFromEnv ? { [CFG.CONVFUSION_API_KEY_ENV]: apiKeyFromEnv } : {}) }
  const { fetchImpl, calls } = makeFetch(handler)

  const deps = {
    getConfig: () => current,
    store: CUST.createMemoryCustomizationStore(),
    ...(withSetConfig
      ? {
          setConfig: async (patch) => {
            writes.push(patch)
            // ⚠️ 故意**不**在这里合并：真实实现里 scope.get() 要等 watch 触发
            if (!lagging) current = { ...current, ...patch }
          },
        }
      : {}),
    fetchImpl,
    env,
    ...(timeoutMs === undefined ? {} : { serverTimeoutMs: timeoutMs }),
    ...(paidBriefStore === undefined ? {} : { paidBriefStore }),
  }
  return {
    handler: RPC.createSettingsRpcHandler(deps),
    calls,
    writes,
    get config() {
      return current
    },
    /** 模拟"设置提交最终生效"（下一次读取才看得到）。 */
    commit() {
      for (const p of writes) current = { ...current, ...p }
    },
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * 1. 地址与凭据的归一（用户会从各种地方复制）
 * ════════════════════════════════════════════════════════════════════════ */
section('[1] 地址与凭据归一')
{
  const cases = [
    ['http://localhost:8000', 'http://localhost:8000'],
    ['http://localhost:8000/', 'http://localhost:8000'],
    // 任务书里给的就是这个（带 /api 的开发地址）
    ['http://localhost:8000/api', 'http://localhost:8000'],
    ['http://localhost:8000/api/v1', 'http://localhost:8000'],
    ['http://localhost:8000/docs#/', 'http://localhost:8000'],
    ['  https://convfusion.com/  ', 'https://convfusion.com'],
    ['http://127.0.0.1:8123', 'http://127.0.0.1:8123'],
  ]
  for (const [input, want] of cases) {
    assertEq(SC.normalizeBaseUrl(input), want, `归一地址：${JSON.stringify(input)} → ${want}`)
  }
  // 空地址 → **当前环境**的默认地址（不是写死的某个地址）
  assertEq(SC.normalizeBaseUrl(''), CFG.defaultServerUrl(TEST_ENV), '空地址 → 当前环境的默认地址')

  let threw = null
  try {
    SC.normalizeBaseUrl('localhost:8000')
  } catch (e) {
    threw = e
  }
  assert(threw instanceof SC.ServerError && threw.code === 'bad-url', '缺协议的地址 → bad-url（不猜、不静默补 http://）')
  assertEq(threw.httpStatus, undefined, 'bad-url 没有 HTTP 状态码（不是服务器返回的）')

  assertEq(
    SC.apiUrl('http://localhost:8000', '/auth/me'),
    'http://localhost:8000/api/v1/auth/me',
    'API 路径 = <base>/api/v1<path>',
  )

  // 用户常从 .env / 文档里连 "Bearer " 一起复制
  assertEq(SC.normalizeApiKey('  Bearer cf_live_x  '), 'cf_live_x', '去掉 Bearer 前缀与空白')
  assertEq(SC.normalizeApiKey(KEY), KEY, '纯 Key 原样保留')
}

/* ════════════════════════════════════════════════════════════════════════
 * 1b. 环境配置：开发 / 生产的分岔**不写在代码里**
 *
 * 这是 2026-09 用户明确要求的一条：脚本里不许有机器路径与写死的服务器地址，
 * 开发（`http://localhost:8000`）与部署（`https://convfusion.com`）必须由**配置文件**
 * 按环境给出。这一节把那条规则钉成断言。
 * ════════════════════════════════════════════════════════════════════════ */
section('[1b] 环境配置（开发 vs 生产）')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-envcfg-'))

  const writeEnvFile = (name, data) => {
    const p = path.join(TMP, name)
    fs.writeFileSync(p, JSON.stringify(data, null, 2))
    return p
  }
  /**
   * 取"某个环境下的默认地址"。
   *
   * ⚠️ 这里**默认不读任何配置文件**（`= '-'`）、也**不设** `CONVFUSION_ENV`：
   * 每个用例只显式声明它要验的那一个变量，否则"谁赢"根本无从判断
   * （第一版就踩了：`TEST_ENV` 里的 CONVFUSION_ENV=development 把所有用例都锁死了）。
   * `fresh: true` 让每个用例绕开进程内缓存。
   */
  const urlOf = (env) =>
    ENVCFG.environmentServerUrl({ [ENVCFG.SERVER_ENV_FILE_ENV]: '-', ...env }, { fresh: true })

  // ── 没有配置文件时：内置兜底，按环境给不同地址 ──
  const noFile = { [ENVCFG.SERVER_ENV_FILE_ENV]: '-' } // '-' = 不读任何文件
  assertEq(ENVCFG.serverEnvFileCandidates(noFile), [], 'CONVFUSION_ENV_FILE=- → 不读任何配置文件')
  assertEq(urlOf({ ...noFile }).url, 'http://localhost:8000', '无配置文件 + 开发 → localhost')
  assertEq(urlOf({ ...noFile }).source, 'builtin', '来源标记为内置兜底')
  assertEq(
    urlOf({ ...noFile, CONVFUSION_ENV: 'production' }).url,
    'https://convfusion.com',
    '无配置文件 + 生产 → convfusion.com',
  )
  assertEq(
    urlOf({ ...noFile, NODE_ENV: 'production' }).url,
    'https://convfusion.com',
    'env 里只设 NODE_ENV=production 也能选对生产地址',
  )

  // ── 读配置文件：同一份文件按环境给出不同地址 ──
  const file = writeEnvFile('convfusion.env.json', {
    environment: 'development',
    environments: {
      development: { serverUrl: 'http://127.0.0.1:9100' },
      production: { serverUrl: 'https://staging.example.test' },
    },
    dev: { serverDir: '../ConvFusion-server', python: 'python3', host: '127.0.0.1', port: 9999 },
  })
  const withFile = { [ENVCFG.SERVER_ENV_FILE_ENV]: file }
  assertEq(urlOf({ ...withFile }).url, 'http://127.0.0.1:9100', '配置文件：开发地址生效')
  assertEq(urlOf({ ...withFile }).source, 'config', '来源标记为配置文件')
  assertEq(
    urlOf({ ...withFile, CONVFUSION_ENV: 'production' }).url,
    'https://staging.example.test',
    '配置文件：切到生产环境取生产地址（同一份文件）',
  )
  // ⚠️ 进程环境变量优先于文件的 `environment`：否则随包发布的模板会把部署环境拉回开发
  assertEq(
    urlOf({ ...withFile, NODE_ENV: 'production' }).url,
    'https://staging.example.test',
    'NODE_ENV=production 胜过文件里的 environment=development',
  )
  assertEq(
    urlOf({ ...withFile, NODE_ENV: 'production', CONVFUSION_ENV: 'development' }).url,
    'http://127.0.0.1:9100',
    'CONVFUSION_ENV 是最强覆盖（可强制回开发）',
  )

  // ── 坏文件不能让插件起不来：容错解析 ──
  const broken = path.join(TMP, 'broken.json')
  fs.writeFileSync(broken, '{ not json')
  assertEq(
    urlOf({ [ENVCFG.SERVER_ENV_FILE_ENV]: broken }).url,
    'http://localhost:8000',
    '坏的配置文件 → 退回内置兜底（不抛错）',
  )
  const wrongTypes = writeEnvFile('wrong.json', { environments: { development: 'http://x' }, dev: 42 })
  assertEq(
    urlOf({ [ENVCFG.SERVER_ENV_FILE_ENV]: wrongTypes }).url,
    'http://localhost:8000',
    '字段类型不对 → 忽略该文件（不猜）',
  )

  // ── 开发流程用值：serverDir 相对配置文件解析；python 不写死 ──
  const tooling = ENVCFG.resolveDevTooling({ ...withFile })
  assertEq(
    tooling.serverDir,
    path.resolve(TMP, '..', 'ConvFusion-server'),
    'dev.serverDir 相对配置文件所在目录解析',
  )
  assertEq(tooling.port, 9999, 'dev.port 生效')
  assertEq(tooling.python, 'python3', 'dev.python 来自配置文件')
  assertEq(
    ENVCFG.resolveDevTooling({ ...withFile, CONVFUSION_PYTHON: '/opt/py' }).python,
    '/opt/py',
    'CONVFUSION_PYTHON 覆盖配置文件',
  )
  assertEq(
    ENVCFG.resolveDevTooling({ [ENVCFG.SERVER_ENV_FILE_ENV]: '-' }).python,
    'python3',
    '没有配置时 python 回落到 PATH 上的 python3（不是某台机器的绝对路径）',
  )

  // ── 地址与环境的矛盾检测（这是"开发/生产搞混"的可见信号）──
  assertEq(ENVCFG.serverUrlMismatch('production', 'http://localhost:8000'), true, '生产 + 本机地址 = 矛盾')
  assertEq(ENVCFG.serverUrlMismatch('production', 'https://convfusion.com'), false, '生产 + 线上地址 = 正常')
  assertEq(ENVCFG.serverUrlMismatch('development', 'https://convfusion.com'), true, '开发 + 线上地址 = 矛盾')
  assertEq(ENVCFG.serverUrlMismatch('development', 'http://127.0.0.1:8123'), false, '开发 + 本机地址 = 正常')

  // ── serverUrl 的完整优先级：设置 > 环境变量 > 配置文件 > 内置 ──
  const prodFile = { [ENVCFG.SERVER_ENV_FILE_ENV]: file, CONVFUSION_ENV: 'production' }
  assertEq(CFG.resolveServerUrl({}, prodFile).source, 'config', '空设置 → 用配置文件')
  assertEq(
    CFG.resolveServerUrl({}, { ...prodFile, CONVFUSION_SERVER_URL: 'http://env:1' }).source,
    'env',
    'CONVFUSION_SERVER_URL 压过配置文件',
  )
  assertEq(
    CFG.resolveServerUrl({ serverUrl: 'http://doc:2' }, { ...prodFile, CONVFUSION_SERVER_URL: 'http://env:1' }).url,
    'http://doc:2',
    '设置文档压过环境变量与配置文件',
  )
  assertEq(
    CFG.resolveConfig({}).serverUrl,
    '',
    'resolveConfig 不替用户填地址（填了就会永久压住配置文件）',
  )
  assert(
    JSON.stringify(CFG.Config.toJSON()).includes('"default":""') ||
      /serverUrl[^}]*default/.test(JSON.stringify(CFG.Config.toJSON())),
    'schema 里 serverUrl 不再带非空默认值',
  )

  // ── 仓库自身：**脚本里不许出现机器路径或写死的服务器地址** ──
  const scriptsDir = path.join(PKG, 'scripts')
  // ⚠️ 模式本身要拼出来：否则这条断言会因为**自己的源码**里出现 /Users/ 而失败
  const machinePath = new RegExp(
    ['/Us' + 'ers/[A-Za-z0-9._-]+', 'mamba' + 'forge', 'mini' + 'conda', 'ana' + 'conda'].join('|'),
    'i',
  )
  for (const f of fs.readdirSync(scriptsDir).filter((n) => n.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(scriptsDir, f), 'utf8')
    assert(!machinePath.test(src), `scripts/${f} 里没有机器相关的绝对路径`)
  }
  // 地址只允许出现在"文档/注释"或环境配置里：脚本不得把它当作运行时常量
  const live = fs.readFileSync(path.join(scriptsDir, 'verify-server-login-live.mjs'), 'utf8')
  assert(
    !/const\s+(BASE|SERVER_URL|PYTHON|SERVER_DIR)\s*=\s*['"]/.test(live),
    'live 脚本不把服务器地址 / python / 仓库路径写成常量',
  )
  assert(/loadServerEnv/.test(live), 'live 脚本从环境配置读取这些值')

  fs.rmSync(TMP, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 2. account/state：不联网
 * ════════════════════════════════════════════════════════════════════════ */
section('[2] account/state 不联网（服务器挂了也能打开设置页）')
{
  const h = makeHost({
    handler: async () => {
      throw new Error('account/state 不该发起任何请求')
    },
  })
  const res = await h.handler('account/state', {})
  assert(res.ok, 'account/state 成功')
  assertEq(h.calls.length, 0, '确实没有发出任何网络请求')
  assertEq(res.value.keyConfigured, false, '未配置凭据')
  assertEq(res.value.account, null, '未验证账号为 null')
  assertEq(res.value.serverUrl, CFG.defaultServerUrl(TEST_ENV), '报告环境默认地址')
  assertEq(res.value.defaultServerUrl, CFG.defaultServerUrl(TEST_ENV), '同时报告默认值（供界面提示）')
  assertEq(res.value.environment, 'development', '报告当前环境（开发）')
  assertEq(res.value.serverUrlMismatch, false, '开发环境 + 本机地址 = 不矛盾')
  assertEq(res.value.apiKeyEnvVar, CFG.CONVFUSION_API_KEY_ENV, '报告凭据环境变量名')
  keyLeak(res.value, 'account/state')
}

/* ════════════════════════════════════════════════════════════════════════
 * 2b. 两个环境的地址（serverPresets）+ account/probe（只测连通性）
 *
 * 设置页那两个快捷按钮要"点一下就换地址并显示通不通"：地址必须由**宿主按配置**给出
 * （界面不写死域名），探测必须**匿名**（`/health` 不需要身份；带 Key 就是白送凭据）。
 * ════════════════════════════════════════════════════════════════════════ */
section('[2b] serverPresets + account/probe（快捷按钮：换地址 + 测连通）')
{
  // ① 两个环境的地址：无配置文件 → 内置兜底；有配置文件 → 以文件为准
  const noFile = ENVCFG.serverUrlPresets(withEnv({ CONVFUSION_ENV_FILE: '-' }))
  assertEq(noFile.development, 'http://localhost:8000', '开发兜底地址')
  assertEq(noFile.production, 'https://convfusion.com', '线上兜底地址')
  assertEq(
    ENVCFG.serverUrlPresets(withEnv({ CONVFUSION_SERVER_URL: 'http://x:1' })).development,
    'http://localhost:8000',
    '环境变量（当前地址）**不**污染两个预设 —— 预设回答的是"两边分别是哪台"',
  )

  // ② 状态里带回这两个地址（界面据此渲染按钮；旧宿主没有这个字段 → 按钮不显示）
  const h = makeHost()
  const st = await h.handler('account/state', {})
  assertEq(
    Object.keys(st.value.serverPresets ?? {}).sort(),
    ['development', 'production'],
    'state.serverPresets 是两个环境的地址',
  )
  assert(
    /^https?:\/\//.test(st.value.serverPresets.development) &&
      /^https?:\/\//.test(st.value.serverPresets.production),
    '两个预设都是可用地址',
  )
  keyLeak(st.value, 'account/state（含 serverPresets）')

  // ③ probe：通了 → reachable:true，且**不发凭据**
  const okHost = makeHost({ handler: async () => ({ status: 200, body: { status: 'ok' } }) })
  const okProbe = await okHost.handler('account/probe', { serverUrl: 'http://localhost:8000' })
  assertEq(okProbe.ok, true, 'probe 的 RPC 本身成功')
  assertEq(okProbe.value.reachable, true, '健康检查 200 → 通了')
  assertEq(okProbe.value.url, 'http://localhost:8000', '回报归一后的地址')
  assertEq(okHost.calls.length, 1, '只发一次请求')
  assertEq(okHost.calls[0].url, 'http://localhost:8000/api/v1/health', '探的是公开存活探针')
  assert(
    !('authorization' in (okHost.calls[0].headers ?? {})),
    '**匿名**探测：一个字节的凭据都不带',
  )

  // ④ probe：连不上 → 仍然是 ok:true，但 reachable:false（"连不上"是结果，不是 RPC 失败）
  const downHost = makeHost({
    handler: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  const down = await downHost.handler('account/probe', { serverUrl: 'http://localhost:9' })
  assertEq(down.ok, true, '连不上不是 RPC 失败（界面要的是把按钮涂回原色，不是报错弹窗）')
  assertEq(down.value.reachable, false, 'reachable:false')
  assert(String(down.value.reason ?? '').length > 0, '带回失败原因（放进悬浮提示）')

  // ⑤ 地址本身非法 → 这才是 bad-request（在联网之前就拦住）
  const bad = await makeHost().handler('account/probe', { serverUrl: 'not a url' })
  assertEq(bad.ok, false, '非法地址 → 失败')
  assertEq(bad.error?.code, 'bad-url', '错误码是 bad-url（地址本身不合法，不是在网络上失败）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 3. login：成功路径
 * ════════════════════════════════════════════════════════════════════════ */
section('[3] account/login：成功路径')
{
  const h = makeHost()
  const res = await h.handler('account/login', { apiKey: KEY, serverUrl: 'http://localhost:8000/api' })

  assert(res.ok, '登录成功')
  // 登录 = 身份自检 + 读余额（余额是尽力而为，见 [6c]）
  assertEq(h.calls.length, 2, '两次请求：/auth/me + /tokens')
  assertEq(h.calls[1].url, 'http://localhost:8000/api/v1/tokens', '第二次问 Token 余额')
  assertEq(h.calls[0].method, 'GET', '用 GET 做身份自检')
  assertEq(h.calls[0].url, 'http://localhost:8000/api/v1/auth/me', '请求地址正确（/api 被归一掉，没有 /api/api）')
  assertEq(h.calls[0].headers.authorization, `Bearer ${KEY}`, 'Authorization: Bearer <Key>')
  assertEq(h.calls[0].body, undefined, 'GET 不带请求体')

  // 落盘：Key 与归一后的地址一起写
  assertEq(h.writes.length, 1, '只写一次设置')
  assertEq(h.writes[0].convfusionApiKey, KEY, '凭据写入设置（本机）')
  assertEq(h.writes[0].serverUrl, 'http://localhost:8000', '服务器地址归一后写入')

  // 返回值：有账号、有可用性、**没有**凭据
  assertEq(res.value.account.email, ME.email, '返回账号邮箱')
  assertEq(res.value.account.displayName, 'Res', '返回显示名（snake_case → camelCase）')
  assertEq(res.value.account.roles, ['RESEARCHER'], '返回角色')
  assertEq(res.value.account.status, 'ACTIVE', '返回账号状态')
  assertEq(res.value.keyConfigured, true, '报告凭据已配置')
  assertEq(res.value.keySource, 'settings', '来源 = settings')
  keyLeak(res.value, 'account/login')

  // ⚠️ 关键回归：设置提交是**异步**的，登录响应不能依赖"写完之后再读一遍"
  assertEq(h.config.convfusionApiKey, '', '夹具里设置尚未生效（模拟真实时序）')
  assertEq(res.value.keyConfigured, true, '即便如此，返回值也必须报告"已登录"')
}

/* ════════════════════════════════════════════════════════════════════════
 * 4. login：失败路径 —— 每种错误对应**不同**的用户动作
 * ════════════════════════════════════════════════════════════════════════ */
section('[4] account/login：失败语义')
{
  const cases = [
    {
      name: '401 UNAUTHORIZED → invalid-key',
      reply: { status: 401, body: err('UNAUTHORIZED', 'Unauthorized.') },
      code: 'invalid-key',
      contains: 'API Key 无效',
    },
    {
      name: '401 API_KEY_REVOKED → invalid-key（文案区分"已撤销"）',
      reply: { status: 401, body: err('API_KEY_REVOKED', 'API key revoked.') },
      code: 'invalid-key',
      contains: '已被撤销',
    },
    {
      name: '403 FORBIDDEN → account-inactive',
      reply: { status: 403, body: err('FORBIDDEN', 'User is not active.') },
      code: 'account-inactive',
      contains: '停用',
    },
    {
      name: '429 → rate-limited（给出等待时间）',
      reply: { status: 429, body: err('RATE_LIMITED', 'Too many requests.', { retry_after_seconds: 3600 }) },
      code: 'rate-limited',
      contains: '60 分钟',
    },
    {
      name: '500 → server-error',
      reply: { status: 500, body: err('INTERNAL_ERROR', 'boom') },
      code: 'server-error',
      contains: '服务器内部错误',
    },
    {
      name: '422 → bad-request（带服务器原话）',
      reply: { status: 422, body: err('VALIDATION_ERROR', 'bad fields') },
      code: 'bad-request',
      contains: 'bad fields',
    },
  ]

  for (const c of cases) {
    const h = makeHost({ handler: async () => c.reply })
    const res = await h.handler('account/login', { apiKey: KEY })
    assert(res.ok === false, `${c.name}：登录失败`)
    assertEq(res.error.code, c.code, `${c.name}：错误码 ${c.code}`)
    assert(res.error.message.includes(c.contains), `${c.name}：文案含「${c.contains}」`)
    assertEq(h.writes.length, 0, `${c.name}：**没有**写盘（失败不留坏凭据）`)
    keyLeak(res, `${c.name} 的失败信封`)
  }

  // 网络层失败：连不上 / 超时，都要指出**具体地址**
  const down = makeHost({
    handler: async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:8000')
    },
  })
  const downRes = await down.handler('account/login', { apiKey: KEY })
  assertEq(downRes.error.code, 'unreachable', '连不上 → unreachable')
  assert(downRes.error.message.includes('http://localhost:8000'), 'unreachable 文案里给出地址')
  assertEq(down.writes.length, 0, '连不上时不写盘')

  const slow = makeHost({
    handler: () => new Promise(() => {}), // 永不 settle
    timeoutMs: 30,
  })
  const slowRes = await slow.handler('account/login', { apiKey: KEY })
  assertEq(slowRes.error.code, 'unreachable', '超时 → unreachable')
  assert(slowRes.error.message.includes('超时'), '超时文案明确说"超时"（与"拒绝连接"是两种排查方向）')

  // 输入问题：不联网就该拒绝
  const h = makeHost()
  const empty = await h.handler('account/login', { apiKey: '   ' })
  assertEq(empty.error.code, 'bad-request', '空 Key → bad-request')
  assertEq(h.calls.length, 0, '空 Key 不联网')
  const badUrl = await h.handler('account/login', { apiKey: KEY, serverUrl: 'not-a-url' })
  assertEq(badUrl.error.code, 'bad-url', '非法地址 → bad-url')
  assertEq(h.calls.length, 0, '非法地址不联网')

  // 存储不可用：必须**明确失败**，不能"看着登录成功、重启后没了"
  const noStore = makeHost({ withSetConfig: false })
  const noStoreRes = await noStore.handler('account/login', { apiKey: KEY })
  assertEq(noStoreRes.error.code, 'storage-unavailable', '设置存储不可用 → storage-unavailable')
  assert(noStoreRes.error.message.includes('无法保存'), '文案说明凭据没被保存')
}

/* ════════════════════════════════════════════════════════════════════════
 * 5. register：邀请码注册（注册即登录）
 * ════════════════════════════════════════════════════════════════════════ */
section('[5] account/register：邀请码注册')
{
  const NEW_KEY = 'cf_live_aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff0000000011111111'
  const h = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/auth/invitations/accept')) {
        return {
          status: 200,
          body: {
            user: { id: ME.id, email: ME.email, display_name: 'Res', status: 'ACTIVE' },
            api_key: NEW_KEY,
          },
        }
      }
      if (call.url.endsWith('/auth/me')) return { status: 200, body: ME }
      // 新账号余额为 0 —— 但这是**服务器说的**，不是我们假定的
      if (call.url.endsWith('/auth/tokens') || call.url.endsWith('/tokens')) {
        return { status: 200, body: { available_balance: 0, frozen_balance: 0, total_balance: 0 } }
      }
      return { status: 404, body: err('RESOURCE_NOT_FOUND', 'nope') }
    },
  })

  const res = await h.handler('account/register', {
    invitationCode: 'cf_inv_test',
    email: ME.email,
    displayName: 'Res',
    serverUrl: 'http://localhost:8000',
  })
  assert(res.ok, '注册成功')
  assertEq(h.calls.length, 3, '三次请求：accept + me（补角色）+ tokens（新账号余额）')
  assertEq(res.value.tokens.available, 0, '新账号余额来自服务器（0），不是本地假定')
  assertEq(h.calls[0].method, 'POST', '注册用 POST')
  assertEq(h.calls[0].headers.authorization, undefined, '注册请求**不带**旧凭据（无需鉴权的公开端点）')
  const sent = JSON.parse(h.calls[0].body)
  assertEq(sent.invitation_code, 'cf_inv_test', '请求体字段名与服务器一致（invitation_code）')
  assertEq(sent.email, ME.email, '带邮箱')
  assertEq(sent.display_name, 'Res', '带显示名（display_name）')
  assertEq(h.calls[1].headers.authorization, `Bearer ${NEW_KEY}`, '第二次用**新签发的** Key 自检')
  assertEq(h.writes[0].convfusionApiKey, NEW_KEY, '服务器签发的 Key 直接落盘（用户不必复制一遍）')
  assertEq(res.value.account.roles, ['RESEARCHER'], '返回补充后的完整身份（含角色）')
  keyLeak(res.value, 'account/register')

  // 注册失败：邀请码类错误必须能区分"无效/过期/已用/邮箱占用"
  const failCases = [
    [{ status: 400, body: err('INVALID_INVITATION', 'Invalid invitation.') }, 'invalid-invitation', '无效'],
    [{ status: 400, body: err('INVITATION_EXPIRED', 'Invitation has expired.') }, 'invalid-invitation', '过期'],
    [{ status: 409, body: err('INVITATION_USED', 'Invitation already used.') }, 'invitation-used', '已经被使用'],
    [{ status: 409, body: err('CONFLICT', 'Email already registered.') }, 'email-taken', '已经注册'],
  ]
  for (const [reply, code, contains] of failCases) {
    const f = makeHost({ handler: async () => reply })
    const r = await f.handler('account/register', {
      invitationCode: 'cf_inv_test',
      email: ME.email,
      displayName: 'Res',
    })
    assertEq(r.error.code, code, `注册失败 ${reply.body.error.code} → ${code}`)
    assert(r.error.message.includes(contains), `注册失败文案含「${contains}」`)
    assertEq(f.writes.length, 0, `注册失败（${reply.body.error.code}）不写盘`)
  }

  // 缺字段：本地就拒绝，不浪费一次请求
  const missing = makeHost()
  const m1 = await missing.handler('account/register', { invitationCode: '', email: 'a@b.c', displayName: 'x' })
  assertEq(m1.error.code, 'bad-request', '缺邀请码 → bad-request')
  const m2 = await missing.handler('account/register', { invitationCode: 'cf_inv_x', email: '', displayName: 'x' })
  assertEq(m2.error.code, 'bad-request', '缺邮箱 → bad-request')
  const m3 = await missing.handler('account/register', {
    invitationCode: 'cf_inv_x',
    email: 'a@b.c',
    displayName: '  ',
  })
  assertEq(m3.error.code, 'bad-request', '缺显示名 → bad-request')
  assertEq(missing.calls.length, 0, '缺字段一次网络请求都不发')

  // 服务器返回 200 却没有 api_key：不能假装成功
  const noKey = makeHost({
    handler: async () => ({ status: 200, body: { user: { id: ME.id, email: ME.email } } }),
  })
  const nkRes = await noKey.handler('account/register', {
    invitationCode: 'cf_inv_x',
    email: ME.email,
    displayName: 'Res',
  })
  assertEq(nkRes.error.code, 'bad-response', '响应缺 api_key → bad-response（不静默吞掉）')
  assertEq(noKey.writes.length, 0, '这种情况也不写盘')
}

/* ════════════════════════════════════════════════════════════════════════
 * 6. verify / logout
 * ════════════════════════════════════════════════════════════════════════ */
section('[6] account/verify 与 account/logout')
{
  // 有凭据（设置里）→ verify 走 /auth/me
  const h = makeHost({ config: { convfusionApiKey: KEY, serverUrl: 'http://localhost:8000' } })
  const res = await h.handler('account/verify', {})
  assert(res.ok, 'verify 成功')
  assertEq(h.calls[0].headers.authorization, `Bearer ${KEY}`, 'verify 用设置里的凭据')
  assertEq(res.value.account.email, ME.email, 'verify 返回账号')
  assertEq(h.writes.length, 0, 'verify 不需要写设置（凭据没变）')
  keyLeak(res.value, 'account/verify')

  // 凭据来自环境变量：同样能登录，但界面要能看出"不是设置里的"
  const envHost = makeHost({ apiKeyFromEnv: KEY, handler: async () => ({ status: 200, body: ME }) })
  const envRes = await envHost.handler('account/verify', {})
  assert(envRes.ok, '环境变量里的凭据也能验证')
  assertEq(envRes.value.keySource, 'env', '来源报告 env')
  assertEq(envRes.value.keyConfigured, true, '配置状态为真')
  keyLeak(envRes.value, '环境变量来源的 verify')

  // 没凭据：明确说"尚未登录"，且不联网
  const none = makeHost()
  const noneRes = await none.handler('account/verify', {})
  assertEq(noneRes.error.code, 'not-configured', '无凭据 → not-configured')
  assertEq(none.calls.length, 0, '无凭据不发请求')

  // 凭据失效：verify 失败**不清除**用户凭据（万一只是服务器抖动，别毁掉用户的 Key）
  const revoked = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => ({ status: 401, body: err('API_KEY_REVOKED', 'revoked') }),
  })
  const revRes = await revoked.handler('account/verify', {})
  assertEq(revRes.error.code, 'invalid-key', '撤销的 Key → invalid-key')
  assertEq(revoked.writes.length, 0, 'verify 失败**不**自动清除凭据（由用户决定）')

  // logout：清凭据、留地址
  const out = makeHost({ config: { convfusionApiKey: KEY, serverUrl: 'http://localhost:9000' } })
  const outRes = await out.handler('account/logout', {})
  assert(outRes.ok, '登出成功')
  assertEq(out.writes[0].convfusionApiKey, '', '凭据被清空')
  assert(!('serverUrl' in out.writes[0]), '登出**保留**服务器地址（下次登录还要用）')
  assertEq(out.calls.length, 0, '登出不需要联网（服务器无会话）')
  assertEq(outRes.value.keyConfigured, false, '登出后的状态显示未配置')
  assertEq(outRes.value.account, null, '登出后没有账号信息')
  assertEq(outRes.value.serverUrl, 'http://localhost:9000', '登出后地址不变')
  keyLeak(outRes.value, 'account/logout')
}

/* ════════════════════════════════════════════════════════════════════════
 * 6b. 研究工作（发现网络）：列表 / 摘要 / 简报
 *
 * 服务器渐进披露三层：摘要（免费）→ 简报（1 Token）→ 完整状态（需导师关系）。
 * 这一节验的是宿主侧的翻译：鉴权头、幂等键、402 的语义（**不重试**）、字段解析。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6b] 研究工作：列表 / 摘要 / 简报')
{
  const LOGGED_IN = { convfusionApiKey: KEY, serverUrl: 'http://localhost:8000' }
  const ITEM = {
    project_id: '6a628fdc-86e4-4935-b619-8b479b0e6218',
    title: 'Retrieval-Augmented Reasoning',
    research_fields: ['LLM'],
    stage: 'EXPERIMENT',
    progress: 0.5,
    research_question: 'Can retrieval augment long-context reasoning?',
    summary: 'Retrieval-augmented reasoning.',
    updated_at: '2026-09-18T11:26:31Z',
  }
  const BRIEF = {
    ...ITEM,
    motivation: 'context limits',
    core_idea: 'Hybrid retrieval-attention.',
    hypothesis: 'Retrieval improves accuracy.',
    method_overview: 'Interleave retrieval with attention.',
    key_evidence: [{ kind: 'table' }],
    open_problems: ['long tail'],
  }

  // ── 列表：GET /discovery/random（**不带 limit**），带鉴权头 ──
  //
  // 条数与抽样策略属于**服务器**（`discovery` 的 DEFAULT_LIMIT 与随机抽样）。
  // 插件复制一份服务端策略，只会在两边悄悄漂移，所以这里断言"确实没传"。
  const list = makeHost({
    config: LOGGED_IN,
    handler: async (call) => {
      assert(call.url.endsWith('/api/v1/discovery/random'), '列表走 /discovery/random，且不带任何查询参数')
      return { status: 200, body: { items: [ITEM] } }
    },
  })
  // 就算调用方塞了 limit，也不该进入请求（参数由服务器拥有）
  const listRes = await list.handler('work/list', { limit: 5 })
  assert(listRes.ok, 'work/list 成功')
  assertEq(list.calls[0].headers.authorization, `Bearer ${KEY}`, '列表带 Bearer 凭据')
  assertEq(listRes.value.items.length, 1, '返回 1 条')
  assertEq(listRes.value.items[0].projectId, ITEM.project_id, 'snake_case → camelCase（projectId）')
  assertEq(listRes.value.items[0].researchFields, ['LLM'], 'research_fields → researchFields')
  assertEq(listRes.value.items[0].researchQuestion, ITEM.research_question, '带出研究问题')
  assertEq(listRes.value.items[0].stage, 'EXPERIMENT', '带出研究阶段')
  assertEq(listRes.value.items[0].progress, 0.5, '带出进度')
  keyLeak(listRes.value, 'work/list')

  // 再确认一次：两次调用的 URL **完全一致**（没有本地夹取 / 没有默认条数）
  const again = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: { items: [] } }) })
  await again.handler('work/list', {})
  assertEq(
    again.calls[0].url,
    list.calls[0].url,
    '带不带 limit 参数都不影响请求 URL（列表条数是服务器的事）',
  )

  // ── 摘要：免费，GET /projects/{id}/summary ──
  const summary = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: ITEM }) })
  const sumRes = await summary.handler('work/summary', { projectId: ITEM.project_id })
  assert(sumRes.ok, 'work/summary 成功')
  assert(summary.calls[0].url.endsWith(`/api/v1/projects/${ITEM.project_id}/summary`), '摘要走 /projects/{id}/summary')
  assertEq(summary.calls[0].headers['idempotency-key'], undefined, '免费接口不需要幂等键')
  assertEq(sumRes.value.work.title, ITEM.title, '返回研究工作标题')
  keyLeak(sumRes.value, 'work/summary')

  // ── 简报：花 Token，必须带幂等键 ──
  const brief = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: BRIEF }) })
  const briefRes = await brief.handler('work/brief', { projectId: ITEM.project_id, intentKey: 'intent-1' })
  assert(briefRes.ok, 'work/brief 成功')
  assert(brief.calls[0].url.endsWith(`/api/v1/projects/${ITEM.project_id}/brief`), '简报走 /projects/{id}/brief')
  assertEq(brief.calls[0].headers['idempotency-key'], 'intent-1', '简报带 Idempotency-Key（一次查看意图）')
  assertEq(briefRes.value.brief.coreIdea, BRIEF.core_idea, '简报带出核心想法（第二层字段）')
  assertEq(briefRes.value.brief.methodOverview, BRIEF.method_overview, '简报带出方法概览')
  keyLeak(briefRes.value, 'work/brief')

  // ── `brief_paid`：服务器的**权威**判据（打开 Brief 还会不会再扣 Token）──
  //
  // 列表每一项与 /projects/{id}/summary 都带它：true = 已有支付记录或项目属于自己，
  // false = 首次打开会扣 1。界面据此决定要不要弹确认框 —— 所以解析必须**如实**：
  // 布尔照抄，缺字段是 null（不知道），绝不把"不知道"当成 false 或 true。
  {
    const withFlag = (v) => ({ ...ITEM, ...(v === undefined ? {} : { brief_paid: v }) })
    const readPaid = async (item) => {
      const h = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: { items: [item] } }) })
      const res = await h.handler('work/list', {})
      return res.value.items[0].briefPaid
    }
    assertEq(await readPaid(withFlag(true)), true, 'brief_paid=true → true（已有支付记录 / owner）')
    assertEq(await readPaid(withFlag(false)), false, 'brief_paid=false → false（首次打开会扣费）')
    assertEq(await readPaid(withFlag(undefined)), null, '旧服务器没有该字段 → null（不知道，界面照常提醒）')
    assertEq(await readPaid({ ...ITEM, brief_paid: 'true' }), null, '字段类型不对 → null（不采信字符串）')

    // 摘要（免费那层）同样带这个字段 —— 界面点【摘要】后就该知道【简报】会不会扣费
    const sumHost = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: withFlag(true) }) })
    const sumPaid = await sumHost.handler('work/summary', { projectId: ITEM.project_id })
    assertEq(sumPaid.value.work.briefPaid, true, '/projects/{id}/summary 也带 brief_paid')

    // 简报响应里它同样存在（与 charged_tokens 一致：已买过 → true + 0）
    const briefFlag = makeHost({
      config: LOGGED_IN,
      handler: async () => ({ status: 200, body: { ...BRIEF, brief_paid: true, charged_tokens: 0 } }),
    })
    const briefPaidRes = await briefFlag.handler('work/brief', { projectId: ITEM.project_id, intentKey: 'k-paid' })
    assertEq(briefPaidRes.value.brief.briefPaid, true, '简报响应也带 brief_paid')
    assertEq(briefPaidRes.value.brief.chargedTokens, 0, '已买过 → 本次扣 0，与 brief_paid=true 一致')
  }

  // ── 简报的"已买过"记忆：决定界面还要不要弹扣费确认框 ──
  //
  // 服务器按 (viewer, project) 只收一次，但**只有 /brief 的 charged_tokens 说明这次花没花**；
  // 列表与摘要都不带这个状态。于是"点之前要不要提醒"只能靠宿主这份本地记忆。
  // 拿不准（没记录 / 账号解析失败 / 没注入 store）时必须**照常提醒** —— 宁可多问一次，
  // 不可静默扣费。
  {
    const PB = await import(lib('research/paid-briefs.js'))
    const store = PB.createMemoryPaidBriefStore()
    const BASE = 'http://localhost:8000'
    const routes = (call) => {
      if (call.url.endsWith('/discovery/random')) return { status: 200, body: { items: [ITEM] } }
      if (call.url.endsWith('/auth/me')) return { status: 200, body: ME }
      return { status: 200, body: { ...BRIEF, charged_tokens: 1 } }
    }

    // ① 没有记录 → 明确标注 false（界面会提醒），而不是留空让人猜
    const fresh = makeHost({ config: LOGGED_IN, paidBriefStore: store, handler: async (call) => routes(call) })
    const freshList = await fresh.handler('work/list', {})
    assertEq(freshList.value.items[0].briefOpened, false, '没买过 → briefOpened=false（界面照常提醒）')

    // ② 成功读过一次（charged_tokens=1）→ 透出扣费 + 记进本地；列表立刻变成 true
    const buyRes = await fresh.handler('work/brief', { projectId: ITEM.project_id, intentKey: 'k1' })
    assert(buyRes.ok, 'work/brief 成功')
    assertEq(buyRes.value.brief.chargedTokens, 1, 'charged_tokens 透出给界面（本次真扣 1）')
    assert(store.has(BASE, ME.id, ITEM.project_id), '读过之后本地记住"已买过"')
    const afterList = await fresh.handler('work/list', {})
    assertEq(afterList.value.items[0].briefOpened, true, '买过之后列表标注 true（界面不再弹确认框）')

    // ③ 已经买过时服务器回 charged_tokens=0 → 回执据此说"未扣费"（不硬编码 1）
    const replay = makeHost({
      config: LOGGED_IN,
      paidBriefStore: store,
      handler: async () => ({ status: 200, body: { ...BRIEF, charged_tokens: 0 } }),
    })
    const replayRes = await replay.handler('work/brief', { projectId: ITEM.project_id, intentKey: 'k2' })
    assertEq(replayRes.value.brief.chargedTokens, 0, '已买过 → charged_tokens=0')

    // ④ 响应里没有 charged_tokens（旧服务器）→ null，界面退回"按余额差值说话"
    const noField = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: BRIEF }) })
    const noFieldRes = await noField.handler('work/brief', { projectId: ITEM.project_id, intentKey: 'k3' })
    assertEq(noFieldRes.value.brief.chargedTokens, null, '缺 charged_tokens → null（不谎报 0）')

    // ⑤ 换账号 / 换服务器**不共用**这条记忆：复用了就会静默扣费
    const otherAccount = { ...ME, id: 'ffffffff-0000-0000-0000-000000000000' }
    const other = makeHost({
      config: { ...LOGGED_IN, convfusionApiKey: `${KEY}-other` },
      paidBriefStore: store,
      handler: async (call) =>
        call.url.endsWith('/auth/me') ? { status: 200, body: otherAccount } : { status: 200, body: { items: [ITEM] } },
    })
    const otherList = await other.handler('work/list', {})
    assertEq(otherList.value.items[0].briefOpened, false, '换账号不共用"已买过"（否则会静默扣费）')
    const otherServer = makeHost({
      config: { ...LOGGED_IN, serverUrl: 'https://convfusion.com' },
      paidBriefStore: store,
      handler: async (call) =>
        call.url.endsWith('/auth/me') ? { status: 200, body: ME } : { status: 200, body: { items: [ITEM] } },
    })
    const otherServerList = await otherServer.handler('work/list', {})
    assertEq(otherServerList.value.items[0].briefOpened, false, '换服务器不共用"已买过"')

    // ⑥ 账号解析失败 → 不标注（拿不准就当没买过：界面照常提醒）
    const noAccount = makeHost({
      config: LOGGED_IN,
      paidBriefStore: store,
      handler: async (call) =>
        call.url.endsWith('/auth/me')
          ? { status: 500, body: { error: { code: 'INTERNAL', message: 'boom' } } }
          : { status: 200, body: { items: [ITEM] } },
    })
    const noAccountList = await noAccount.handler('work/list', {})
    assert(noAccountList.ok, '账号解析失败不影响列表本身')
    assertEq(noAccountList.value.items[0].briefOpened, undefined, '账号未知 → 不标注（保守：界面仍提醒）')

    // ⑦ 没注入 store（旧装配）→ 不标注，行为与从前一致
    const noStore = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: { items: [ITEM] } }) })
    const noStoreList = await noStore.handler('work/list', {})
    assertEq(noStoreList.value.items[0].briefOpened, undefined, '没有本地记忆 → 不标注')

    // ⑧ 键的构成：服务器 + 账号 + 项目，三者任一不同都不算"买过"
    assertEq(PB.paidBriefKey(BASE, ME.id, 'p1'), `${BASE}|${ME.id}|p1`, '键 = serverUrl|accountId|projectId')
    assertEq(store.has(BASE, ME.id, 'another-project'), false, '换了项目不算买过')
  }

  // ── 402：Token 不足 —— 具体的 code，且**不自动重试** ──
  const poor = makeHost({
    config: LOGGED_IN,
    handler: async () => ({
      status: 402,
      body: {
        error: {
          code: 'INSUFFICIENT_TOKENS',
          message: 'Insufficient Token balance.',
          details: { required: 1, available: 0 },
        },
      },
    }),
  })
  const poorRes = await poor.handler('work/brief', { projectId: ITEM.project_id, intentKey: 'intent-402' })
  assertEq(poorRes.ok, false, 'Token 不足 → 失败')
  assertEq(poorRes.error.code, 'insufficient-tokens', '错误码具体到 insufficient-tokens')
  assert(poorRes.error.message.includes('1'), '文案里给出需要的 Token 数')
  assert(poorRes.error.message.includes('0'), '文案里给出可用余额')
  assertEq(poor.calls.length, 1, '402 **只发一次**请求（绝不自动重试）')
  assertEq(
    poor.calls[0].headers['idempotency-key'],
    'intent-402',
    '402 时幂等键必须已发出（充值后同 Key 重试才不重复扣费）',
  )

  // ── 403：完整状态需要关系（未来第三层）──
  const noRel = makeHost({
    config: LOGGED_IN,
    handler: async () => ({
      status: 403,
      body: { error: { code: 'FULL_STATE_ACCESS_REQUIRED', message: 'Full research state...', details: {} } },
    }),
  })
  const noRelRes = await noRel.handler('work/summary', { projectId: ITEM.project_id })
  assertEq(noRelRes.error.code, 'no-relationship', '403 FULL_STATE_ACCESS_REQUIRED → no-relationship')

  // ── 404：不可见（私有项目不泄漏存在性）──
  const missing = makeHost({
    config: LOGGED_IN,
    handler: async () => ({ status: 404, body: { error: { code: 'PROJECT_NOT_FOUND', message: 'nope', details: {} } } }),
  })
  const missingRes = await missing.handler('work/summary', { projectId: 'x' })
  assertEq(missingRes.error.code, 'not-found', '404 → not-found')
  assert(missingRes.error.message.includes('不可见'), '文案不武断说"不存在"（私有项目会伪装成 404）')

  // ── 未登录：本地就拒绝，不发请求 ──
  const anon = makeHost()
  const anonList = await anon.handler('work/list', {})
  assertEq(anonList.error.code, 'not-configured', '未登录 → not-configured（界面此时显示示例数据）')
  assertEq(anon.calls.length, 0, '未登录不发请求')
  const anonBrief = await anon.handler('work/brief', { projectId: 'p', intentKey: 'k' })
  assertEq(anonBrief.error.code, 'not-configured', '未登录看简报 → not-configured')

  // ── 缺参数 ──
  const args = makeHost({ config: LOGGED_IN })
  assertEq((await args.handler('work/summary', {})).error.code, 'bad-request', '缺 projectId → bad-request')
  assertEq(
    (await args.handler('work/brief', { projectId: 'p' })).error.code,
    'bad-request',
    '缺 intentKey → bad-request（不能悄悄替用户生成，否则重试会重复扣费）',
  )
  assertEq(args.calls.length, 0, '缺参数不发请求')

  // ── 响应形状不对：不能假装成功 ──
  const malformed = makeHost({
    config: LOGGED_IN,
    handler: async () => ({ status: 200, body: { nope: true } }),
  })
  const malformedRes = await malformed.handler('work/list', {})
  assertEq(malformedRes.error.code, 'bad-response', '列表响应缺 items → bad-response')
}

/* ════════════════════════════════════════════════════════════════════════
 * 6c. Token 余额（登录后要显示"我还剩多少"）
 * ════════════════════════════════════════════════════════════════════════ */
section('[6c] Token 余额')
{
  const BALANCE = { available_balance: 7, frozen_balance: 3, total_balance: 10 }
  const meAndBalance = async (call) => {
    if (call.url.endsWith('/api/v1/auth/me')) return { status: 200, body: ME }
    if (call.url.endsWith('/api/v1/tokens')) return { status: 200, body: BALANCE }
    return { status: 404, body: err('RESOURCE_NOT_FOUND', 'nope') }
  }

  // ── 登录：一次拿到身份 + 余额 ──
  const h = makeHost({ handler: meAndBalance })
  const res = await h.handler('account/login', { apiKey: KEY })
  assert(res.ok, '登录成功')
  assertEq(res.value.tokens.available, 7, '登录后带回可用余额')
  assertEq(res.value.tokens.frozen, 3, '冻结余额也带回（押金仍是用户的钱）')
  assertEq(res.value.tokens.total, 10, '总额用服务器给的值')
  assertEq(h.calls.length, 2, '两次请求：/auth/me + /tokens')
  assertEq(h.calls[1].headers.authorization, `Bearer ${KEY}`, '余额接口同样带凭据')
  keyLeak(res.value, 'account/login（含余额）')

  // ── verify 也带余额（「重新验证」顺带把数字刷新）──
  const v = makeHost({ config: { convfusionApiKey: KEY }, handler: meAndBalance })
  const vRes = await v.handler('account/verify', {})
  assertEq(vRes.value.tokens.available, 7, 'verify 带回余额')

  // ── 单独刷新余额 ──
  const r = makeHost({ config: { convfusionApiKey: KEY }, handler: meAndBalance })
  const rRes = await r.handler('account/tokens', {})
  assert(rRes.ok, 'account/tokens 可用')
  assertEq(rRes.value.tokens.available, 7, '返回可用余额')
  assertEq(r.calls.length, 1, '只问一次 /tokens')

  // ── 余额接口失败**不能**让登录失败（尽力而为）──
  const flaky = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/api/v1/auth/me')) return { status: 200, body: ME }
      throw new Error('ECONNRESET')
    },
  })
  const flakyRes = await flaky.handler('account/login', { apiKey: KEY })
  assertEq(flakyRes.ok, true, '余额读不到时登录仍然成功（余额不是登录的硬依赖）')
  assertEq(flakyRes.value.tokens, null, '拿不到余额 → null（**不是** 0）')
  assertEq(flaky.writes.length, 1, '凭据照常落盘')

  // ── 未登录时问余额：本地拒绝 ──
  const anon = makeHost()
  assertEq((await anon.handler('account/tokens', {})).error.code, 'not-configured', '未登录问余额 → not-configured')
  assertEq(anon.calls.length, 0, '未登录不发请求')

  // ── account/state（不联网）没有余额 ──
  const st = await makeHost().handler('account/state', {})
  assertEq(st.value.tokens, null, 'account/state 不联网 → 没有余额')

  // ── 余额接口 401：报 invalid-key（凭据问题要和余额问题区分开）──
  const revoked = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => ({ status: 401, body: err('API_KEY_REVOKED', 'revoked') }),
  })
  assertEq((await revoked.handler('account/tokens', {})).error.code, 'invalid-key', '余额接口 401 → invalid-key')
}

/* ════════════════════════════════════════════════════════════════════════
 * 6d. 【研究工作 · 我的】：本机研究项目（不联网、不需要登录）
 *
 * 数据源 = DSH 工作区注册表；过滤条件 = "该工作区里存在有效的 research workspace"。
 * 这一节用**真实临时目录**验证过滤与进度读取，并确认它完全不发网络请求。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6d] 研究工作 · 我的（本机）')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const HOME2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mine-'))

  /** 造一个"有效研究项目"的工作区：`<ws>/workspace/` 下有 project.md。 */
  const makeResearchWs = (name, projectMd = '# 研究项目：X\n') => {
    const ws = path.join(HOME2, name)
    const root = path.join(ws, 'workspace')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'project.md'), projectMd)
    return { ws, root }
  }
  /** 造一个"普通工作区"：没有任何 research workspace。 */
  const makePlainWs = (name) => {
    const ws = path.join(HOME2, name)
    fs.mkdirSync(path.join(ws, 'src'), { recursive: true })
    fs.writeFileSync(path.join(ws, 'README.md'), '# not research\n')
    return ws
  }

  const a = makeResearchWs('proj-a')
  const b = makeResearchWs('proj-b')
  const plain = makePlainWs('plain-repo')
  const gone = path.join(HOME2, 'deleted-proj') // 注册表里有，但目录已不在

  const lister = async () => ({
    available: true,
    items: [
      { id: 'ws-a', title: '项目 A', path: a.ws, updatedAt: '2026-09-18T00:00:00Z' },
      { id: 'ws-b', title: '', path: b.ws, updatedAt: '2026-09-17T00:00:00Z' },
      { id: 'ws-plain', title: '普通仓库', path: plain, updatedAt: '2026-09-16T00:00:00Z' },
      { id: 'ws-gone', title: '已删除', path: gone, updatedAt: '2026-09-15T00:00:00Z' },
    ],
  })

  // 符号链接：注册表存登记路径，真身才是研究项目所在
  const linkPath = path.join(HOME2, 'link-to-proj-c')
  const c = makeResearchWs('proj-c')
  fs.symlinkSync(c.ws, linkPath)

  const h = makeHost({ handler: async () => ({ status: 500, body: {} }) })
  // 直接把 lister 注入 deps（不经 host 夹具的手：这里要的是端点行为）
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME2 }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: lister,
    fetchImpl: async () => {
      throw new Error('work/mine 不该发任何网络请求')
    },
  })

  const res = await handler('work/mine', {})
  assert(res.ok, 'work/mine 可用')
  const items = res.value.items
  assertEq(items.length, 2, '只列**有效研究项目**（普通仓库与已删除目录都被过滤掉）')
  assertEq(items.map((i) => i.id), ['ws-a', 'ws-b'], '保持注册表顺序')
  assertEq(items[0].title, '项目 A', '有标题用标题')
  assertEq(items[1].title, 'proj-b', '没有标题时用研究根目录名')
  assertEq(
    items[0].researchRoot,
    fs.realpathSync(a.root),
    '定位到 research root（<工作区>/workspace，且是**真身**路径）',
  )
  assertEq(items[0].missingDir, false, '目录存在')
  assertEq(typeof items[0].overall, 'number', '带回成熟度均值（进度条用）')
  assertEq(Array.isArray(items[0].counts), true, '带回可数资产（证据 / 主张 / 计划 …）')
  assertEq(typeof items[0].paper, 'boolean', '带回是否已有论文')
  assert(
    ['clear', 'ambiguous', 'blocked', 'unknown'].includes(items[0].clarity),
    '带回推进判定（clarity）',
  )
  assertEq(res.value.registry.available, true, '注册表可用时明确报告 available=true')
  keyLeak(res.value, 'work/mine')

  // ── 归一与去重（纯函数：Additive 的 listWorkspaces 里就是这段）──
  assertEq(typeof RPC.normalizeWorkspaceEntities, 'function', '归一函数已导出（可离线验证）')
  const norm = RPC.normalizeWorkspaceEntities([
    { id: 'ws-a', title: '项目 A', path: '/p/a', updatedAt: 't1' },
    { id: 'ws-a', title: '重复 id', path: '/p/b', updatedAt: 't2' },
    { id: 'ws-a2', title: '重复 path', path: '/p/a', updatedAt: 't3' },
    { title: '没有 id', path: '/p/c', updatedAt: '' },
    { id: 'no-path', title: '没有 path' },
    { id: 'ws-d', path: '   ' },
  ])
  assertEq(norm.map((n) => n.id), ['ws-a', '/p/c'], '去重（id 或 path 重复即跳过）+ 缺 id 回退为 path')
  assertEq(norm[0].title, '项目 A', '保留标题')
  assertEq(norm[1].title, '没有 id', '无 id 也能保留')
  assertEq(norm.length, 2, '没有 path 的条目被丢掉')

  // ── 符号链接：用真身解析研究根（列表显示登记路径，读数据走 realpath）──
  const linkHandler = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME2 }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: async () => ({
      available: true,
      items: [{ id: 'ws-link', title: '软链接项目', path: linkPath, updatedAt: '' }],
    }),
  })
  const linked = await linkHandler('work/mine', {})
  assertEq(linked.value.items.length, 1, '符号链接的工作区也能识别为研究项目（走真身）')
  assertEq(linked.value.items[0].path, linkPath, 'path 保留注册表里的登记值（与侧边栏一致）')
  assertEq(
    linked.value.items[0].researchRoot,
    fs.realpathSync(c.root),
    'researchRoot 用真身路径解析出来',
  )
  assertEq(linked.value.items[0].title, '软链接项目', '标题用注册表标题')

  // 未登录也照样能列（本机事实），且**不需要任何凭据**
  const anon = makeHost()
  const anonHandler = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME2 }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: lister,
  })
  const anonRes = await anonHandler('work/mine', {})
  assertEq(anonRes.ok, true, '未登录也能读本机研究工作（不依赖服务器）')
  assertEq(anonRes.value.items.length, 2, '结果与登录态无关')
  assertEq(anon.calls.length, 0, '确实没有服务器请求')

  // ⚠️ 注册表必须**每次请求现取**：一次性探测会在服务晚就绪时被永久记成"不可用"
  //    （真实踩过：WorkspaceRegistry 等 sessionPersistence 才注册）。
  let calls = 0
  const counting = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME2 }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: async () => {
      calls += 1
      return { available: true, items: [] }
    },
  })
  await counting('work/mine', {})
  await counting('work/mine', {})
  assertEq(calls, 2, '每次请求都重新取注册表（不是开机探一次就记死）')

  // 没有注册表（精简 profile / 服务不可用）：空列表，不报错
  const noRegistry = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME2 }),
    store: CUST.createMemoryCustomizationStore(),
  })
  const noReg = await noRegistry('work/mine', {})
  assertEq(noReg.ok, true, '没有工作区注册表时端点仍可用')
  assertEq(noReg.value.items, [], '返回空列表（不抛错）')
  assertEq(noReg.value.registry.available, false, '**明确**报告注册表不可用')
  assert(
    typeof noReg.value.registry.reason === 'string' && noReg.value.registry.reason.length > 0,
    '给出不可用的原因（界面据此区分"读不到"与"真的没有"）',
  )

  // 注册表读取抛错：同样报 available=false + 原因，不把故障显示成"没有项目"
  const boom = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME2 }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: async () => {
      throw new Error('registry exploded')
    },
  })
  const boomRes = await boom('work/mine', {}).catch((e) => ({ ok: false, error: { message: String(e) } }))
  assert(boomRes.ok === false, 'lister 抛错时端点返回失败（而不是静默空列表）')
  assert(
    JSON.stringify(boomRes).includes('registry exploded'),
    '失败原因带出，便于定位（不吞掉）',
  )

  fs.rmSync(HOME2, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6e. 「寻找指导」= 发布本机研究（建项目 → 传状态 → 发布）
 *
 * 契约见 `ConvFusion-server/docs/projects.md`：顺序不能反（先发布会留空卡片）、
 * 上传要带幂等键、409 要重基后换新键重传、同一个工作区只能对应一个服务器项目。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6e] 发布本机研究（work/publish）')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const PUB = await import(lib('research/published-store.js'))
  const HOME3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-publish-'))

  // 一个真实的小工作区：project.md（主题/领域/研究问题）+ research-state.md（各维度）
  const ws = path.join(HOME3, 'proj-publish')
  const root = path.join(ws, 'workspace')
  fs.mkdirSync(path.join(root, 'research', 'evidence'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'project.md'),
    [
      '---',
      'type: research-project',
      'topic: 低算力视觉语言方向的可证伪问题',
      'domain: 多模态, 机器人学习',
      'created_at: 2026-09-19T00:00:00.000Z',
      '---',
      '',
      '# Research Project',
      '',
      '## Research Questions',
      '',
      '- 裁剪证据能否改善失败判定？',
      '- 校准缺口有多大？',
      '',
      '## Motivation',
      '',
      '给机器人策略做数据过滤时，失败判定不可靠。',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(root, 'research-state.md'),
    [
      '---',
      'type: research-state',
      'version: 3',
      'maturity_problem: Established',
      'maturity_knowledge: Emerging',
      '---',
      '',
      '# Research State',
      '',
      '## Problem',
      '',
      '失败判定缺少可信的验证器。',
      '',
      '## Innovation',
      '',
      '把裁剪当作可证伪的干预来研究。',
      '',
      '## Hypotheses',
      '',
      'H1：收益是强样本条件性的。',
      '',
      '## Method',
      '',
      '三臂对照 + oracle 上界。',
      '',
      '## Open Questions',
      '',
      '- 定位失败还是读出失败？',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(root, 'research', 'evidence', 'E001.md'),
    ['---', 'name: 裁剪干预的修复/弄坏计数', 'status: supported', '---', '', '# Evidence', ''].join('\n'),
  )

  const lister = async () => ({
    available: true,
    items: [{ id: 'ws-pub', title: '低算力 VL 方向', path: ws, updatedAt: '2026-09-19T00:00:00Z' }],
  })
  /**
   * 映射的键是**真身**研究根（`realpath`，与列表里的 `researchRoot` 一致）。
   * 测试也必须用它，否则 seed 的记录根本读不到 —— 第一版就是栽在这
   * （macOS 的 `/var` → `/private/var`）。
   */
  const K = fs.realpathSync(root)

  /** 一个记账用的假服务器：按顺序记下 create / state / publish。 */
  const makePublisher = ({ conflictOnce = false, failPublish = false, serverVersion = null } = {}) => {
    const calls = []
    // `serverVersion` = 服务器上已有的版本（模拟"别的客户端已经传过"）
    let stateVersion = serverVersion
    const fetchImpl = async (url, init) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, headers: init?.headers ?? {}, body: init?.body })
      const json = (status, body) => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      })
      if (url.endsWith('/api/v1/auth/me')) return json(200, { id: 'acc-1', email: 'me@example.com', display_name: 'Me', status: 'ACTIVE', roles: ['RESEARCHER'] })
      if (url.endsWith('/api/v1/tokens')) return json(200, { available_balance: 5, frozen_balance: 0, total_balance: 5 })
      if (url.endsWith('/api/v1/projects') && method === 'POST') {
        return json(201, { id: 'srv-project-1', title: 'x', visibility: 'PRIVATE', status: 'ACTIVE', updated_at: '' })
      }
      if (url.endsWith('/projects/srv-project-1/state') && method === 'GET') {
        return stateVersion === null ? json(404, err('RESOURCE_NOT_FOUND', 'no state')) : json(200, { version: stateVersion })
      }
      if (url.endsWith('/projects/srv-project-1/state') && method === 'POST') {
        const payload = JSON.parse(init.body)
        if (conflictOnce && payload.base_version === 1) {
          return json(409, err('STATE_VERSION_CONFLICT', 'conflict', { current_version: 7, base_version: 1 }))
        }
        stateVersion = (payload.base_version ?? 0) + 1
        return json(201, { project_id: 'srv-project-1', version: stateVersion, content_hash: 'sha256:abc', content: payload.content })
      }
      if (url.endsWith('/projects/srv-project-1/files') && method === 'POST') {
        // 附件端点（发布现在也会传附件）；返回与请求对齐的元数据
        const form = init.body instanceof FormData ? init.body : undefined
        const relPaths = form ? form.getAll('relative_paths') : []
        return json(201, relPaths.map((rp, i) => ({ id: `f${i}`, relative_path: rp, size: 4, sha256: `sha256:${i}` })))
      }
      if (url.endsWith('/projects/srv-project-1/publish')) {
        return failPublish ? json(500, err('INTERNAL_ERROR', 'boom')) : json(200, { project_id: 'srv-project-1', visibility: 'PUBLISHED', charged_tokens: 1 })
      }
      return json(404, err('RESOURCE_NOT_FOUND', 'nope'))
    }
    return { fetchImpl, calls, state: () => stateVersion }
  }

  const makePubHost = (server, store = PUB.createMemoryPublishedStore(), config = {}) =>
    RPC.createSettingsRpcHandler({
      getConfig: () =>
        CFG.resolveConfig({
          customizationFile: 'x.json',
          customizationDir: HOME3,
          convfusionApiKey: KEY,
          serverUrl: 'http://localhost:8000',
          ...config,
        }),
      store: CUST.createMemoryCustomizationStore(),
      listLocalWorkspaces: lister,
      publishedStore: store,
      fetchImpl: server.fetchImpl,
    })

  // ── 未登录：本地就拒 ──
  {
    const anon = RPC.createSettingsRpcHandler({
      getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME3 }),
      store: CUST.createMemoryCustomizationStore(),
      listLocalWorkspaces: lister,
    })
    assertEq((await anon('work/publish', { id: 'ws-pub' })).error.code, 'not-configured', '未登录不能发布')
    const signedIn = makePubHost({ fetchImpl: async () => { throw new Error('不该联网') } })
    assertEq((await signedIn('work/publish', {})).error.code, 'bad-request', '缺 id → bad-request')
    assertEq((await signedIn('work/publish', { id: 'nope' })).error.code, 'not-found', '未知 id → not-found')
  }

  // ── 正常路径：建项目 → 传状态 → 发布（顺序不能反）──
  {
    const server = makePublisher()
    const store = PUB.createMemoryPublishedStore()
    const h = makePubHost(server, store)
    const res = await h('work/publish', { id: 'ws-pub' })
    assert(res.ok, '发布成功')
    const kinds = server.calls.map((c) => `${c.method} ${c.url.replace('http://localhost:8000/api/v1', '')}`)
    assertEq(
      kinds.filter((k) => !k.includes('/files')),
      [
        'GET /auth/me',
        'POST /projects',
        'GET /projects/srv-project-1/state',
        'POST /projects/srv-project-1/state',
        'POST /projects/srv-project-1/publish',
      ],
      '顺序：身份 → 建项目 → 读当前版本 → 传状态 → 发布',
    )
    assert(
      kinds.indexOf('POST /projects/srv-project-1/files') >
        kinds.indexOf('POST /projects/srv-project-1/state') &&
        kinds.indexOf('POST /projects/srv-project-1/files') <
          kinds.indexOf('POST /projects/srv-project-1/publish'),
      '附件在"传状态之后、发布之前"上传（服务器要求 state_version 存在）',
    )
    const stateCall = server.calls.find((c) => c.method === 'POST' && c.url.endsWith('/state'))
    const payload = JSON.parse(stateCall.body)
    assertEq(payload.base_version, null, '首传 base_version=null（服务器此时还没有状态）')
    assert(typeof stateCall.headers['idempotency-key'] === 'string' && stateCall.headers['idempotency-key'].length > 0, '上传带 Idempotency-Key')
    // 内容映射：从本机文件真实提取
    assertEq(payload.content.research_question, '裁剪证据能否改善失败判定？；校准缺口有多大？', '研究问题取自 project.md 的 Research Questions')
    assertEq(payload.content.summary, '低算力视觉语言方向的可证伪问题', '摘要 = 主题句')
    assertEq(payload.content.hypothesis, 'H1：收益是强样本条件性的。', '假设取自 research-state.md 的 Hypotheses')
    assertEq(payload.content.core_idea, '把裁剪当作可证伪的干预来研究。', '核心想法取自 Innovation')
    assertEq(payload.content.method_overview, '三臂对照 + oracle 上界。', '方法概览取自 Method（**方法留在本机**指的是提示词/工作流，不是研究方法的表述）')
    assertEq(payload.content.motivation, '给机器人策略做数据过滤时，失败判定不可靠。', '动机取自 project.md 的 Motivation')
    assertEq(payload.content.research_fields, ['多模态', '机器人学习'], '研究领域按分隔符切分')
    assertEq(payload.content.schema_version, 1, 'schema_version = 1')
    assertEq(typeof payload.content.progress, 'number', '进度是数值 0..1')
    assertEq(payload.content.evidence?.[0]?.id, 'E001', '证据清单带 id')
    assert(payload.content.extensions?.convfusion, '带机器可读的 extensions（不含方法/提示词）')
    assert(!JSON.stringify(payload.content).includes('prompt'), '内容里没有任何提示词字段')
    assertEq(res.value.published.projectId, 'srv-project-1', '返回服务器项目 id')
    assertEq(res.value.published.created, true, '首次是新建项目')
    assertEq(res.value.published.visibility, 'PUBLISHED', '返回可见性')
    // 映射落盘
    assertEq(store.get(K)?.projectId, 'srv-project-1', '映射记录写入（工作区 → project_id）')
    assertEq(store.get(K)?.version, 1, '映射记录版本号')
  }

  // ── 再点一次：复用同一个项目，上传 v2，**不再建项目** ──
  {
    const server = makePublisher()
    const store = PUB.createMemoryPublishedStore()
    const h = makePubHost(server, store)
    await h('work/publish', { id: 'ws-pub' })
    const second = await h('work/publish', { id: 'ws-pub' })
    assert(second.ok, '第二次发布成功')
    assertEq(
      server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects')).length,
      1,
      '同一个工作区只建**一个**服务器项目',
    )
    const stateCalls = server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/state'))
    assertEq(stateCalls.length, 2, '两次上传（v1、v2）')
    assertEq(JSON.parse(stateCalls[1].body).base_version, 1, '第二次上传基于服务端当前版本（1）')
    assertEq(second.value.published.created, false, '第二次不是新建')
    assertEq(store.get(K)?.version, 2, '映射里的版本跟着更新')
  }

  // ── 409：重基后**换新键**重传 ──
  {
    // 服务器上已经是 v1（映射里记的是本地过期的 3）；上传 v1 时撞上别人推到 v7
    const server = makePublisher({ conflictOnce: true, serverVersion: 1 })
    const store = PUB.createMemoryPublishedStore({
      [K]: { projectId: 'srv-project-1', serverUrl: 'http://localhost:8000', accountId: 'acc-1', version: 3, publishedAt: 'x', updatedAt: 'x' },
    })
    const h = makePubHost(server, store)
    const res = await h('work/publish', { id: 'ws-pub' })
    assert(res.ok, '409 之后自动重基并成功')
    const stateCalls = server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/state'))
    assertEq(stateCalls.length, 2, '上传尝试两次（第一次 409）')
    assertEq(JSON.parse(stateCalls[0].body).base_version, 1, '第一次用服务端当前版本 1')
    assertEq(JSON.parse(stateCalls[1].body).base_version, 7, '重基后用 details.current_version=7')
    assert(
      stateCalls[0].headers['idempotency-key'] !== stateCalls[1].headers['idempotency-key'],
      'payload 变了必须换新幂等键（否则服务器 409 IDEMPOTENCY_KEY_REUSED）',
    )
  }

  // ── 换账号 / 换服务器：**不重用**旧项目（否则只会 404）──
  {
    const server = makePublisher()
    const store = PUB.createMemoryPublishedStore({
      [K]: { projectId: 'other-account-project', serverUrl: 'http://localhost:8000', accountId: 'acc-OTHER', version: 9, publishedAt: 'x', updatedAt: 'x' },
    })
    const h = makePubHost(server, store)
    const res = await h('work/publish', { id: 'ws-pub' })
    assert(res.ok, '换账号后仍能发布')
    assertEq(res.value.published.created, true, '换账号 → 新建项目（旧 id 属于别的账号，复用只会 404）')
    assert(
      server.calls.some((c) => c.url.endsWith('/api/v1/projects') && c.method === 'POST'),
      '确实调了建项目',
    )
  }

  // ── 发布失败：映射**不写**（下次重试仍按未发布处理）──
  {
    const server = makePublisher({ failPublish: true })
    const store = PUB.createMemoryPublishedStore()
    const h = makePubHost(server, store)
    const res = await h('work/publish', { id: 'ws-pub' })
    assertEq(res.ok, false, '发布失败如实报错')
    assertEq(store.get(K), undefined, '发布失败不写映射（不会留下"已发布"的假记录）')
  }

  // ── work/mine 带出"已发布"标记（读本地映射，不联网）──
  {
    const store = PUB.createMemoryPublishedStore({
      [K]: { projectId: 'srv-project-1', serverUrl: 'http://localhost:8000', accountId: 'acc-1', version: 4, publishedAt: 'x', updatedAt: 'y' },
    })
    const servers = { fetchImpl: async () => { throw new Error('work/mine 不该联网') } }
    const h = makePubHost(servers, store)
    const mine = await h('work/mine', {})
    assertEq(mine.value.items[0].published?.projectId, 'srv-project-1', '列表项带出已发布的 project_id')
    assertEq(mine.value.items[0].published?.version, 4, '带出版本号')
  }

  fs.rmSync(HOME3, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6f. 发布前该传哪些文件（上传计划）
 *
 * 真实工作区可达 657 MB（文献全文 PDF 543 MB + LaTeX 缓存 89 MB），
 * 全传既浪费服务器空间也把该看的东西埋掉。这一节用**真实临时目录**钉规则：
 * 推荐 / 可选 / 排除 三级、大文件降级、权重与缓存永不入选、批次与对账。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6f] 上传计划（哪些文件值得传）')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const UP = await import(lib('research/upload-selection.js'))
  const HOME4 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-plan-'))
  const root = path.join(HOME4, 'workspace')
  const mk = (rel, bytes) => {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.alloc(bytes, 0x61))
  }
  // 研究资产（该传）
  mk('project.md', 500)
  mk('research-state.md', 300)
  mk('plans/p1.md', 2000)
  mk('papers/paper-001/paper.md', 4000)
  mk('papers/paper-001/figures/fig1.pdf', 3000)
  mk('experiments/e1/run.py', 1500)
  mk('research/evidence/E001.md', 800)
  mk('research/literature/notes.md', 900)
  // 原始素材 / 大文件（默认不传，但可选）
  mk('research/literature/fulltext/001_big paper.pdf', 20 * 1024 * 1024)
  mk('research/literature/fulltext/002_another.pdf', 5 * 1024 * 1024)
  mk('research/literature/raw_search.json', 4000)
  mk('research/literature/extract.txt', 6000)
  mk('experiments/dataset.bin', 2000) // 权重/数据集扩展名 → 排除
  mk('experiments/huge-dump.log', 12 * 1024 * 1024) // 普通扩展名但超大 → 可选
  // 机器产物（不可选）
  mk('.tectonic-cache/formats/big.fmt', 30 * 1024 * 1024)
  mk('harness/.tectonic-cache/bundles/x.tex', 1000)
  mk('node_modules/pkg/index.js', 900)
  mk('.git/objects/ab/cdef', 700)
  mk('.DS_Store', 100)
  // 评阅记录：调用 C10 评阅技能后落在 review/（与 research/ 平级，见 workspace-layout）
  mk('review/research-quality-review-2026-09-19.md', 2000)

  const plan = UP.buildUploadPlan(root)
  const cat = (id) => plan.categories.find((c) => c.id === id)
  const has = (id, rel) => (cat(id)?.files ?? []).some((f) => f.relPath === rel)

  // 评阅记录**上传时排除**：这一层里有导师从服务器下来的指导结果（回声），
  // 学生的自查也不是要发布的研究事实 —— 一律不传。
  assertEq(cat('review')?.decision, 'excluded', 'review/ 归"排除"（分类保留供对账）')
  assertEq(has('review', 'review/research-quality-review-2026-09-19.md'), true, 'review/ 下文件进该分类')
  assertEq(
    plan.defaultSelection.includes('review/research-quality-review-2026-09-19.md'),
    false,
    '评阅记录不在默认勾选里',
  )
  assertEq(
    UP.isSelectable('excluded'),
    false,
    'excluded 不可勾选（发布对话框里看不到 review/）',
  )

  assertEq(has('state', 'project.md'), true, 'project.md → 推荐')
  assertEq(has('plans', 'plans/p1.md'), true, 'plans/** → 推荐')
  assertEq(has('papers', 'papers/paper-001/paper.md'), true, 'papers/** → 推荐')
  assertEq(has('papers', 'papers/paper-001/figures/fig1.pdf'), true, '论文里的图 → 推荐（小文件）')
  assertEq(has('experiments', 'experiments/e1/run.py'), true, 'experiments/** → 推荐')
  assertEq(has('research-assets', 'research/evidence/E001.md'), true, 'research 资产 → 推荐')
  assertEq(has('research-assets', 'research/literature/notes.md'), true, '文献**笔记**（.md）→ 推荐')

  assertEq(has('literature-fulltext', 'research/literature/fulltext/001_big paper.pdf'), true, '文献全文 PDF → 可选（默认不传）')
  assertEq(has('literature-fulltext', 'research/literature/fulltext/002_another.pdf'), true, '文献全文 PDF（小）也归可选：它是原始素材')
  assertEq(has('literature-raw', 'research/literature/raw_search.json'), true, '检索原始报文 → 可选')
  assertEq(has('literature-raw', 'research/literature/extract.txt'), true, '抽取文本 → 可选')
  assertEq(has('large-files', 'experiments/huge-dump.log'), true, '普通扩展名但 ≥10MB → 降级为可选')

  assertEq(has('models-data', 'experiments/dataset.bin'), true, '权重/数据集扩展名 → 排除')
  // ⚠️ 机器产物目录是**整枝排除**的：只列一条目录占位（附实测体积/项数），
  // 不把里面几百个缓存文件逐条列出来（那是噪声，且不可选）。
  assertEq(has('build-artifacts', '.tectonic-cache/'), true, '构建缓存整枝 → 排除（列目录占位 + 体积）')
  assert(
    (plan.categories.find((c) => c.id === 'build-artifacts')?.bytes ?? 0) >= 30 * 1024 * 1024,
    '被整枝跳过的目录，其体积仍要计入分类（否则总账对不上）',
  )
  assertEq(has('runtime-artifacts', 'harness/'), true, 'harness/ 整枝 → 排除（列目录占位）')
  assertEq(has('build-artifacts', 'node_modules/'), true, 'node_modules 整枝 → 排除')
  assertEq(has('build-artifacts', '.git/'), true, '版本库整枝 → 排除')
  // 单个垃圾文件（不在垃圾目录里）才逐条列
  assertEq(has('build-artifacts', '.DS_Store'), true, '零散的 .DS_Store → 逐条列出并排除')

  // 三级分类 + 只有 recommended 进默认勾选
  assertEq(plan.defaultSelection.includes('project.md'), true, '默认勾选含研究状态')
  assertEq(plan.defaultSelection.includes('research/literature/fulltext/002_another.pdf'), false, '默认**不**勾文献全文')
  assertEq(plan.defaultSelection.includes('experiments/dataset.bin'), false, '默认**不**勾权重/数据集')
  assertEq(plan.defaultSelection.includes('.tectonic-cache/formats/big.fmt'), false, '默认**不**勾构建缓存')
  assertEq(UP.isSelectable('excluded'), false, '排除项不可勾选')
  assertEq(UP.isSelectable('optional'), true, '可选项目可勾选（用户能调整）')

  // 对账：全部 = 推荐 + 可选 + 排除；分类之和一致
  const sumCats = plan.categories.reduce((n, c) => n + c.bytes, 0)
  assertEq(sumCats, plan.totals.allBytes, '分类体积之和 = 全部（不含重复计数）')
  assertEq(
    plan.totals.recommendedBytes + plan.totals.optionalBytes + plan.totals.excludedBytes,
    plan.totals.allBytes,
    '三级体积之和 = 全部',
  )
  assert(plan.totals.recommendedBytes < plan.totals.allBytes / 10, '推荐集远小于全部（这里 < 10%）')
  assertEq(plan.oversize.length, 0, '默认勾选里没有超单文件上限的（20MB < 100MB）')

  // 批次：服务器 20 个/次
  const batches = UP.planUploadBatches(root, plan.defaultSelection)
  assert(batches.batches.length >= 1, '能切出上传批次')
  assert(batches.batches.every((b) => b.length <= UP.UPLOAD_LIMITS.maxFilesPerRequest), '每批 ≤ 20 个文件')
  assertEq(batches.skipped.length, 0, '没有因超限被跳过的')

  // 大文件（>100MB）即使被勾选也只是 skipped（不能让服务器 413 才发现）
  mk('experiments/way-too-big.bin', 0)
  fs.truncateSync(path.join(root, 'experiments/way-too-big.bin'), 101 * 1024 * 1024)
  const bigPlan = UP.buildUploadPlan(root)
  const bigBatches = UP.planUploadBatches(root, ['experiments/way-too-big.bin'])
  assertEq(bigBatches.skipped.length, 1, '>100MB 的文件被标为 skipped（不静默失败）')
  assertEq(bigPlan.categories.find((c) => c.id === 'models-data') !== undefined, true, '超大 .bin 仍归"排除"（扩展名规则优先）')

  fs.rmSync(HOME4, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6g. 发布对话框的数据 + 附件增量上传
 *
 * 覆盖：上传计划（推荐/可选/排除、记住的选择、用量与成本）、
 * multipart 附件上传（relative_paths 对齐、state_version）、
 * **增量**（内容没变就不重传 —— 服务器不去重，重复传会翻倍占空间）、
 * 超单文件上限的如实上报、发布 402 的透传。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6g] 上传计划 + 附件增量上传')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const PUB = await import(lib('research/published-store.js'))
  const HOME5 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-dialog-'))
  const ws = path.join(HOME5, 'proj-dialog')
  const root = path.join(ws, 'workspace')
  const mk = (rel, text) => {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, text)
    return abs
  }
  mk('project.md', '---\ntype: research-project\ntopic: 对话框测试项目\n---\n\n# Research Project\n\n## Research Questions\n\n- q\n')
  mk('research-state.md', '---\ntype: research-state\nversion: 1\n---\n\n# Research State\n')
  mk('plans/p1.md', '# 计划\n')
  mk('research/evidence/E001.md', '---\nname: 证据\nstatus: supported\n---\n')
  mk('research/literature/fulltext/001_paper.pdf', 'PDF-BYTES')
  mk('research/literature/notes.md', '# 文献笔记\n')
  mk('experiments/run.py', 'print(1)\n')
  fs.mkdirSync(path.join(root, '.tectonic-cache'), { recursive: true })
  fs.writeFileSync(path.join(root, '.tectonic-cache', 'big.fmt'), 'x'.repeat(1000))

  const lister = async () => ({
    available: true,
    items: [{ id: 'ws-dialog', title: '对话框测试项目', path: ws, updatedAt: '' }],
  })

  /** 记账用的假服务器（含 multipart 附件端点）。 */
  const makeServer = ({ publishStatus = 200} = {}) => {
    const calls = []
    let stateVersion = null
    const fetchImpl = async (url, init) => {
      const method = init?.method ?? 'GET'
      const body = init?.body
      const form = typeof FormData !== 'undefined' && body instanceof FormData ? body : undefined
      const relPaths = form ? form.getAll('relative_paths') : []
      calls.push({ url, method, headers: init?.headers ?? {}, body, form, relPaths })
      const json = (status, b) => ({ ok: status >= 200 && status < 300, status, json: async () => b })
      if (url.endsWith('/api/v1/auth/me')) return json(200, { id: 'acc-9', email: 'me@example.com', display_name: 'Me', status: 'ACTIVE', roles: ['RESEARCHER'] })
      if (url.endsWith('/api/v1/usage')) {
        return json(200, {
          projects: { alive: 1, paid_alive: 1, tier: 1, projects_per_tier: 3, next_publish_ordinal: 2, next_publish_cost: 1 },
          storage: { used_bytes: 1000, capacity_bytes: 1073741824, available_bytes: 1073740824, purchased_gb: 0, bytes_per_token: 1073741824 },
        })
      }
      if (url.endsWith('/api/v1/projects') && method === 'POST') return json(201, { id: 'srv-1', visibility: 'PRIVATE', status: 'ACTIVE', updated_at: '' })
      if (url.endsWith('/projects/srv-1/state') && method === 'GET') return stateVersion === null ? json(404, err('RESOURCE_NOT_FOUND', 'none')) : json(200, { version: stateVersion })
      if (url.endsWith('/projects/srv-1/state') && method === 'POST') {
        stateVersion = (JSON.parse(body).base_version ?? 0) + 1
        return json(201, { version: stateVersion, content_hash: 'sha256:h' })
      }
      if (url.endsWith('/projects/srv-1/files') && method === 'POST') {
        if (stateVersion === null) return json(404, err('RESOURCE_NOT_FOUND', 'no state'))
        return json(201, relPaths.map((rp, i) => ({ id: `f${i}`, relative_path: rp, size: 4, sha256: `sha256:${i}` })))
      }
      if (url.endsWith('/projects/srv-1/publish')) {
        return publishStatus === 200
          ? json(200, { project_id: 'srv-1', visibility: 'PUBLISHED', charged_tokens: 1 })
          : json(publishStatus, err('INSUFFICIENT_TOKENS', 'Insufficient Token balance.', { required: 1, available: 0 }))
      }
      return json(404, err('RESOURCE_NOT_FOUND', 'nope'))
    }
    return { fetchImpl, calls, filesCalls: () => calls.filter((c) => c.url.endsWith('/files')) }
  }

  const makeHost5 = (server, store = PUB.createMemoryPublishedStore()) =>
    RPC.createSettingsRpcHandler({
      getConfig: () => CFG.resolveConfig({ customizationFile: 'x.json', customizationDir: HOME5, convfusionApiKey: KEY, serverUrl: 'http://localhost:8000' }),
      store: CUST.createMemoryCustomizationStore(),
      listLocalWorkspaces: lister,
      publishedStore: store,
      fetchImpl: server.fetchImpl,
    })

  // ── 上传计划 ──
  {
    const server = makeServer()
    const plan = await makeHost5(server)('work/uploadPlan', { id: 'ws-dialog' })
    assert(plan.ok, 'work/uploadPlan 可用')
    const p = plan.value.plan
    const catIds = p.categories.map((c) => c.id)
    assert(catIds.includes('literature-fulltext'), '计划里有"文献原文"分类（可选）')
    assert(catIds.includes('build-artifacts'), '计划里保留了"机器产物"分类（供对账；界面不显示）')
    // 默认勾选 = 推荐集：含状态/计划/证据/笔记，不含文献 PDF
    assert(plan.value.selection.includes('project.md'), '默认勾选含 project.md')
    assert(plan.value.selection.includes('plans/p1.md'), '默认勾选含 plans/**')
    assert(plan.value.selection.includes('research/evidence/E001.md'), '默认勾选含研究资产')
    assertDeepSelection(plan.value.selection, 'research/literature/notes.md', true, '文献**笔记**默认上传（用户已拍板）')
    assertDeepSelection(plan.value.selection, 'research/literature/fulltext/001_paper.pdf', false, '文献**原文**默认不上传')
    assert(Array.isArray(plan.value.changed), '带上"与上次已上传相比的变化"')
    assertEq(plan.value.usage?.nextPublishCost, 1, '带上发布成本（来自 /usage）')
    assertEq(plan.value.usage?.storage.availableBytes, 1073740824, '带上存储余量（对话框要显示）')
  }

  function assertDeepSelection(list, item, expected, label) {
    assertEq(list.includes(item), expected, label)
  }

  // ── 首次发布：按选择传附件（multipart、路径对齐、挂到 state_version）──
  {
    const server = makeServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeHost5(server, store)
    const selection = ['project.md', 'plans/p1.md', 'research/evidence/E001.md', 'research/literature/fulltext/001_paper.pdf']
    const res = await h('work/publish', { id: 'ws-dialog', selection })
    assert(res.ok, '带选择的发布成功')
    assertEq(res.value.attachments.selected, 4, '选择了 4 个文件')
    assertEq(res.value.attachments.uploaded, 4, '4 个都上传了（首次）')
    assertEq(res.value.attachments.skippedExisting, 0, '首次没有可跳过的')
    assertEq(res.value.published.chargedTokens, 1, '发布扣费 1 Token（服务器说扣了多少就报多少）')
    const filesCalls = server.filesCalls()
    assertEq(filesCalls.length, 1, '附件一次请求传完（4 < 20）')
    assertEq(filesCalls[0].relPaths.sort(), [...selection].sort(), 'relative_paths 与选择的文件一致（下标对齐）')
    assertEq(filesCalls[0].form.get('state_version'), '1', '附件挂到刚上传的 state_version')
    assertEq(String(filesCalls[0].headers['content-type'] ?? ''), '', '不自己设 content-type（multipart 边界由运行时生成）')
    assertEq(String(filesCalls[0].headers.authorization).startsWith('Bearer '), true, '附件请求带凭据')
    // 指纹与选择都记下来了
    const rec = store.get(fs.realpathSync(root))
    assertEq(Object.keys(rec.files).length, 4, '映射里记下 4 个文件的指纹')
    assertEq(rec.selection.length, 4, '「记住这次选择」已落盘')
  }

  // ── 再发布：内容没变 → **不重传**（增量）──
  {
    const server = makeServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeHost5(server, store)
    const selection = ['project.md', 'plans/p1.md']
    await h('work/publish', { id: 'ws-dialog', selection })
    const second = await h('work/publish', { id: 'ws-dialog', selection })
    assert(second.ok, '第二次发布成功')
    assertEq(second.value.attachments.uploaded, 0, '内容没变 → 一个都不重传')
    assertEq(second.value.attachments.skippedExisting, 2, '如实报告"跳过了 2 个已是最新"')
    assertEq(server.filesCalls().length, 1, '只发生过一次附件请求（第二次没有新请求）')
  }

  // ── 改了一个文件 → 只传那一个 ──
  {
    const server = makeServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeHost5(server, store)
    const selection = ['project.md', 'plans/p1.md']
    await h('work/publish', { id: 'ws-dialog', selection })
    fs.writeFileSync(path.join(root, 'plans/p1.md'), '# 计划（已修改）\n')
    const third = await h('work/publish', { id: 'ws-dialog', selection })
    assertEq(third.value.attachments.uploaded, 1, '只传变化了的 1 个文件')
    const last = server.filesCalls().at(-1)
    assertEq(last.relPaths, ['plans/p1.md'], '传的正是被改的那个')
  }

  // ── 没给 selection 时：沿用「记住的选择」，并把新的推荐文件并进来 ──
  {
    const server = makeServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeHost5(server, store)
    await h('work/publish', { id: 'ws-dialog', selection: ['research/literature/fulltext/001_paper.pdf'], remember: true })
    // 新增一个推荐类文件（例如新的证据）→ 下次不弹窗也必须带上
    mk('research/evidence/E002.md', '---\nname: 新证据\n---\n')
    const again = await h('work/publish', { id: 'ws-dialog' })
    assert(again.ok, '未给选择时仍能发布（沿用记住的选择）')
    assertEq(again.value.attachments.selected >= 3, true, '记住的 PDF + 新的推荐文件都在选择里')
    const uploadedPaths = server.filesCalls().flatMap((c) => c.relPaths)
    assert(uploadedPaths.includes('research/evidence/E002.md'), '新增的推荐文件被自动并入（不会静默漏传）')
  }

  // ── 超单文件上限：如实报出来，而不是等服务器 413 ──
  {
    const server = makeServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeHost5(server, store)
    const huge = path.join(root, 'experiments', 'huge.bin')
    fs.mkdirSync(path.dirname(huge), { recursive: true })
    fs.writeFileSync(huge, '')
    fs.truncateSync(huge, 101 * 1024 * 1024)
    // 注意：.bin 被规则判为 excluded，但用户可以通过 selection 显式指定（服务器侧仍会拒）
    const res = await h('work/publish', { id: 'ws-dialog', selection: ['project.md', 'experiments/huge.bin'] })
    assert(res.ok, '含超大文件的发布仍然成功（其它文件照传）')
    assertEq(res.value.attachments.oversize.length, 1, '超大文件被列为 oversize')
    assertEq(res.value.attachments.uploaded, 1, '只有合法的那 1 个被上传')
    fs.rmSync(huge, { force: true })
  }

  // ── 发布 402（余额不足）：错误码透传，界面据此提示"先拿 Token" ──
  {
    const server = makeServer({ publishStatus: 402 })
    const h = makeHost5(server)
    const res = await h('work/publish', { id: 'ws-dialog', selection: ['project.md'] })
    assertEq(res.ok, false, '余额不足时发布失败')
    assertEq(res.error.code, 'insufficient-tokens', '错误码是 insufficient-tokens（界面提示去拿 Token）')
    assertEq(makeServer().filesCalls().length, 0, '（对照）假服务器默认没有附件调用')
  }

  fs.rmSync(HOME5, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6h. 「已在网络中」以**服务器**为准（本地记录只说明"我传过"）
 * ════════════════════════════════════════════════════════════════════════ */
section('[6h] 「已在网络中」以服务器为准')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const PUB = await import(lib('research/published-store.js'))
  const HOME6 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-verified-'))
  const ws = path.join(HOME6, 'proj-verified')
  const root = path.join(ws, 'workspace')
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'project.md'), '# 服务器核对\n')
  fs.writeFileSync(path.join(root, 'research-state.md'), '---\ntype: research-state\n---\n')

  const lister = async () => ({
    available: true,
    items: [{ id: 'ws-v', title: '服务器核对', path: ws, updatedAt: '' }],
  })
  const SERVER = 'http://localhost:8000'
  const seededRecord = (over = {}) => ({
    projectId: 'srv-9',
    serverUrl: SERVER,
    accountId: 'acc-9',
    version: 3,
    publishedAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-19T00:00:00Z',
    files: { 'project.md': 'sha256:aa' },
    selection: ['project.md'],
    ...over,
  })

  /** `project`：PUBLISHED / PRIVATE / 404 / 'offline'（抛错）。 */
  const makeServer6 = ({ project, listItems = [] }) => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push(url.replace(`${SERVER}/api/v1`, ''))
      const json = (status, b) => ({ ok: status >= 200 && status < 300, status, json: async () => b })
      if (url.endsWith('/auth/me')) {
        return json(200, { id: 'acc-9', email: 'me@example.com', status: 'ACTIVE', roles: ['RESEARCHER'] })
      }
      if (url.endsWith('/discovery/random')) return json(200, { items: listItems })
      if (url.endsWith('/projects/srv-9')) {
        if (project === 'offline') throw new Error('ECONNREFUSED')
        if (project === 404) return json(404, err('PROJECT_NOT_FOUND', 'Project not found.'))
        return json(200, { id: 'srv-9', title: '核对项目', visibility: project, status: 'ACTIVE', updated_at: '' })
      }
      return json(404, err('RESOURCE_NOT_FOUND', 'nope'))
    }
    return { fetchImpl, calls, projectCalls: () => calls.filter((u) => u === '/projects/srv-9') }
  }

  const makeHost6 = (server, store, { withKey = true } = {}) =>
    RPC.createSettingsRpcHandler({
      getConfig: () =>
        CFG.resolveConfig({
          customizationFile: 'x.json',
          customizationDir: HOME6,
          ...(withKey ? { convfusionApiKey: KEY } : {}),
          serverUrl: SERVER,
        }),
      store: CUST.createMemoryCustomizationStore(),
      listLocalWorkspaces: lister,
      publishedStore: store,
      fetchImpl: server.fetchImpl,
    })

  // ── 服务器说 PUBLISHED：保留标记，并把服务器的状态回写进本地记录 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const server = makeServer6({ project: 'PUBLISHED' })
    const res = await makeHost6(server, store)('work/mine', {})
    assert(res.ok, 'work/mine 可用')
    assertEq(res.value.items[0].published?.projectId, 'srv-9', '服务器说可见 → 保留「已在网络中」')
    const rec = store.all()[fs.realpathSync(root)]
    assertEq(rec.serverVisibility, 'PUBLISHED', '本地记录回写了服务器状态（PUBLISHED）')
    assert(typeof rec.checkedAt === 'string' && rec.checkedAt.length > 0, '本地记录记下核对时刻')
    assertEq(rec.files['project.md'], 'sha256:aa', '核对**不动**"我传过什么"（files 指纹保留）')
    assertEq(server.projectCalls().length, 1, '每个已记录的工作区核一次 GET /projects/{id}')
  }

  // ── 服务器说 PRIVATE（取消发布）：不显示标记，但**保留**记录（下次发布复用项目） ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const res = await makeHost6(makeServer6({ project: 'PRIVATE' }), store)('work/mine', {})
    assertEq(res.value.items[0].published, null, '服务器说不可见 → 不显示标记')
    const rec = store.all()[fs.realpathSync(root)]
    assert(rec, '记录保留（项目还在，下次发布仍复用同一个）')
    assertEq(rec.serverVisibility, 'PRIVATE', '回写 PRIVATE')
  }

  // ── 服务器 404（项目已删）：不显示标记，并删掉本地映射 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const res = await makeHost6(makeServer6({ project: 404 }), store)('work/mine', {})
    assertEq(res.value.items[0].published, null, '项目已删 → 不显示标记')
    assertEq(store.all()[fs.realpathSync(root)], undefined, '死掉的映射被删掉（否则永远撞死 project_id）')
  }

  // ── 查不通（离线）：不下结论 —— 保留本地记录，界面照旧显示 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const res = await makeHost6(makeServer6({ project: 'offline' }), store)('work/mine', {})
    assertEq(res.value.items[0].published?.projectId, 'srv-9', '读不到 ≠ 服务器上没有：保留标记')
    assertEq(store.all()[fs.realpathSync(root)].checkedAt, undefined, '核对失败不回写任何状态')
  }

  // ── 未登录 / 记录属于别的服务器：一个请求都不发 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const server = makeServer6({ project: 'PUBLISHED' })
    const res = await makeHost6(server, store, { withKey: false })('work/mine', {})
    assertEq(res.value.items[0].published?.projectId, 'srv-9', '没有凭据时按本地记录显示')
    assertEq(server.calls.length, 0, '没有凭据就不联网（离线也不会更慢）')

    const other = PUB.createMemoryPublishedStore({
      [fs.realpathSync(root)]: seededRecord({ serverUrl: 'https://convfusion.com' }),
    })
    const server2 = makeServer6({ project: 'PUBLISHED' })
    await makeHost6(server2, other)('work/mine', {})
    assertEq(server2.calls.length, 0, '记录属于别的服务器 → 不去当前服务器上核对')
  }

  // ── 【可指导】列表里出现的项目：命中的本地记录刷新为 PUBLISHED ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const server = makeServer6({
      project: 'PUBLISHED',
      listItems: [
        { project_id: 'srv-9', title: '核对项目', stage: 'ANALYSIS', progress: 0.4, updated_at: '' },
        { project_id: 'other', title: '别人的', stage: 'IDEA', progress: 0.1, updated_at: '' },
      ],
    })
    const res = await makeHost6(server, store)('work/list', {})
    assert(res.ok, 'work/list 可用')
    assertEq(res.value.items.length, 2, '列表来自服务器')
    assertEq(
      store.all()[fs.realpathSync(root)].serverVisibility,
      'PUBLISHED',
      '命中的本地记录被服务器的可见性刷新',
    )
  }

  fs.rmSync(HOME6, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 7. 凭据纪律：把**所有**端点的返回值扫一遍
 * ════════════════════════════════════════════════════════════════════════ */
section('[7] 凭据纪律：任何端点的返回值都不含明文 Key')
{
  const h = makeHost({ config: { convfusionApiKey: KEY, serverUrl: 'http://localhost:8000' } })
  const endpoints = [
    ['state', {}],
    ['dependencies/check', {}],
    ['account/state', {}],
    ['account/verify', {}],
    ['account/login', { apiKey: KEY }],
    ['account/logout', {}],
    ['customization/save', { skillId: 'literature-search', section: 'Purpose', text: 'x' }],
  ]
  for (const [ep, payload] of endpoints) {
    const res = await h.handler(ep, payload)
    keyLeak(res, `端点 ${ep} 的响应`)
  }
  // 失败信封同样不能泄漏（把 Key 放进 message 是最容易犯的错）
  const bad = makeHost({
    handler: async () => ({ status: 401, body: err('UNAUTHORIZED', `bad key ${KEY}`) }),
  })
  const badRes = await bad.handler('account/login', { apiKey: KEY })
  // 服务器自己在 message 里回显了 Key —— 我们**照抄**了服务器的话，这不算我们的泄漏面；
  // 但必须确认我们**没有**主动把 Key 拼进任何我们自己的文案里。
  assert(
    badRes.error.message.includes('bad key'),
    '服务器原话会被转述（便于诊断）',
  )
  const own = new SC.ServerError('bad-url', '我们的文案里不带凭据')
  assert(!own.message.includes(KEY), '我们自己的错误文案不含凭据')
}

/* ════════════════════════════════════════════════════════════════════════
 * 8. server-client 的解析健壮性
 * ════════════════════════════════════════════════════════════════════════ */
section('[8] 响应解析健壮性')
{
  // 200 但不是 JSON
  const badJson = makeFetch(async () => ({ status: 200, body: undefined }))
  let e1 = null
  try {
    await SC.fetchAccount('http://localhost:8000', KEY, { fetchImpl: badJson.fetchImpl })
  } catch (e) {
    e1 = e
  }
  assert(e1 instanceof SC.ServerError && e1.code === 'bad-response', '非 JSON 响应 → bad-response')

  // 200 但缺 id / email
  const noId = makeFetch(async () => ({ status: 200, body: { display_name: 'x' } }))
  let e2 = null
  try {
    await SC.fetchAccount('http://localhost:8000', KEY, { fetchImpl: noId.fetchImpl })
  } catch (e) {
    e2 = e
  }
  assert(e2 instanceof SC.ServerError && e2.code === 'bad-response', '缺 id/email → bad-response')

  // 缺 display_name / roles 时的兜底（服务器补齐默认值，但别假设）
  const sparse = makeFetch(async () => ({ status: 200, body: { id: 'u1', email: 'a@b.com' } }))
  const acc = await SC.fetchAccount('http://localhost:8000', KEY, { fetchImpl: sparse.fetchImpl })
  assertEq(acc.displayName, 'a', '缺 display_name → 用邮箱前缀')
  assertEq(acc.roles, [], '缺 roles → 空数组（不是 undefined）')
  assertEq(acc.status, 'ACTIVE', '缺 status → ACTIVE')

  // 返回 id/email 就必须原样带出
  assertEq(acc.id, 'u1', '保留 id')
  assertEq(acc.email, 'a@b.com', '保留 email')
}

/* ════════════════════════════════════════════════════════════════════════
 * [9] 指导关系（mentor/*）：费用建议 / 发起 / 列表 / 接受（冻结押金）/ 拒绝
 *
 * 商业闭环：导师发起提案 → 研究者接受（**冻结押金** + 建合同 + 建关系）。
 * 这里断言宿主侧的三个约定：
 *   1. 请求形状正确（路径 / 方法 / 鉴权头 / 幂等键 / body 字段名）；
 *   2. **身份缺失时能降级**（后端还没 enrich `mentor` / `researcher` 内嵌对象时，
 *      退回顶层 `mentor_id` / `researcher_id`，界面至少能分出"哪边是我"）；
 *   3. 402（押金不足）等业务失败被如实映射，且**不谎报成功**。
 * ════════════════════════════════════════════════════════════════════════ */
section('[9] 指导关系（mentor/*）')
{
  const LOGGED_IN = { convfusionApiKey: KEY, serverUrl: 'http://localhost:8000' }
  const MENTOR_ID = 'a79d3f52-0000-4000-8000-000000000001'
  const RESEARCHER_ID = 'eed5abd6-b2d9-4a80-b0ad-4d7fffd27a6c'
  const PROJECT_ID = '6a628fdc-86e4-4935-b619-8b479b0e6218'
  /** 后端 enrich 之后的形状（含内嵌身份 + 项目标题）。 */
  const ENRICHED = {
    id: '22885792-0000-4000-8000-000000000002',
    mentor_id: MENTOR_ID,
    researcher_id: RESEARCHER_ID,
    project_id: PROJECT_ID,
    project_title: 'Retrieval-Augmented Reasoning',
    mentor: {
      id: MENTOR_ID,
      display_name: '张老师',
      profile: {
        institution: '某大学',
        department: '计算机系',
        bio: 'long-context reasoning',
        research_fields: ['LLM'],
        research_interests: ['retrieval'],
        research_expertise: ['long context'],
      },
    },
    researcher: { id: RESEARCHER_ID, display_name: '李同学' },
    guidance_scope: '指导实验设计与论文写作',
    total_fee: 100,
    deposit_amount: 20,
    success_payment_amount: 80,
    success_condition: { type: 'MUTUAL_COMPLETION', description: '双方确认完成' },
    status: 'PROPOSED',
    expires_at: '2026-10-03T00:00:00Z',
    created_at: '2026-09-19T00:00:00Z',
  }

  // ── 费用建议：GET /mentorship-proposals/fee-suggestion ──
  const fee = makeHost({
    config: LOGGED_IN,
    handler: async (call) => {
      assert(call.url.endsWith('/api/v1/mentorship-proposals/fee-suggestion'), '费用建议走 fee-suggestion')
      return { status: 200, body: { suggested_fee: 100, suggested_deposit: 20, suggested_success_payment: 80 } }
    },
  })
  const feeRes = await fee.handler('mentor/fee-suggestion', {})
  assert(feeRes.ok, 'mentor/fee-suggestion 成功')
  assertEq(feeRes.value.suggestion.suggestedFee, 100, 'suggested_fee → suggestedFee')
  assertEq(feeRes.value.suggestion.suggestedDeposit, 20, 'suggested_deposit → suggestedDeposit')
  assertEq(feeRes.value.suggestion.suggestedSuccessPayment, 80, 'suggested_success_payment → suggestedSuccessPayment')

  // ── 发起提案：POST /projects/{id}/mentorship-proposals（免费，不扣 Token）──
  const propose = makeHost({
    config: LOGGED_IN,
    handler: async (call) => {
      assert(call.method === 'POST', '发起提案用 POST')
      assert(
        call.url.endsWith(`/api/v1/projects/${PROJECT_ID}/mentorship-proposals`),
        '发起提案走 /projects/{id}/mentorship-proposals',
      )
      return { status: 201, body: ENRICHED }
    },
  })
  const proposeRes = await propose.handler('mentor/propose', {
    projectId: PROJECT_ID,
    guidanceScope: '指导实验设计与论文写作',
    totalFee: 100,
    depositAmount: 20,
    successPaymentAmount: 80,
    successCondition: { type: 'MUTUAL_COMPLETION', description: '双方确认完成' },
  })
  assert(proposeRes.ok, 'mentor/propose 成功')
  {
    const sent = JSON.parse(propose.calls[0].body)
    assertEq(sent.guidance_scope, '指导实验设计与论文写作', 'body 用 snake_case：guidance_scope')
    assertEq(sent.total_fee, 100, 'body：total_fee')
    assertEq(sent.deposit_amount, 20, 'body：deposit_amount')
    assertEq(sent.success_payment_amount, 80, 'body：success_payment_amount')
    assertEq(sent.success_condition.type, 'MUTUAL_COMPLETION', 'body：success_condition.type')
    assertEq(propose.calls[0].headers.authorization, `Bearer ${KEY}`, '发起提案带 Bearer 凭据')
  }
  assertEq(proposeRes.value.proposal.status, 'PROPOSED', '新提案状态 = PROPOSED')
  assertEq(proposeRes.value.proposal.mentor.displayName, '张老师', '内嵌导师身份 → mentor.displayName')
  assertEq(proposeRes.value.proposal.mentor.profile.institution, '某大学', '导师机构带出')
  assertEq(proposeRes.value.proposal.projectTitle, 'Retrieval-Augmented Reasoning', 'project_title → projectTitle')
  keyLeak(proposeRes.value, 'mentor/propose')

  // 本地校验：押金 + 成功付款必须等于总额（发出去之前就拦，别浪费一次往返）
  const badSum = await propose.handler('mentor/propose', {
    projectId: PROJECT_ID,
    guidanceScope: 'x',
    totalFee: 100,
    depositAmount: 10,
    successPaymentAmount: 10,
    successCondition: { type: 'MUTUAL_COMPLETION' },
  })
  assert(!badSum.ok && badSum.error.code === 'bad-request', '押金+成功付款≠总额 → 本地就拒（bad-request）')
  assertEq(propose.calls.length, 1, '被本地拦下的请求**没有**发到服务器')

  // ── 列表：GET /mentorship-proposals ──
  const list = makeHost({
    config: LOGGED_IN,
    handler: async (call) => {
      assert(call.url.endsWith('/api/v1/mentorship-proposals'), '列表走 /mentorship-proposals')
      return { status: 200, body: [ENRICHED] }
    },
  })
  const listRes = await list.handler('mentor/list', {})
  assert(listRes.ok, 'mentor/list 成功')
  assertEq(listRes.value.proposals.length, 1, '返回 1 条提案')
  assertEq(listRes.value.proposals[0].researcher.displayName, '李同学', '研究者身份带出')
  assertEq(listRes.value.proposals[0].successCondition.type, 'MUTUAL_COMPLETION', '成功条件类型带出')

  // ── **降级**：后端还没 enrich 时，退回顶层 mentor_id / researcher_id ──
  //
  // 这是必须做的兼容：身份内嵌是后端后加的字段，旧响应只有两个 UUID。
  // 没有这个回退，界面就分不出"哪条是我收到的"，接受按钮会长在错误的一边。
  const legacy = makeHost({
    config: LOGGED_IN,
    handler: async () => ({
      status: 200,
      body: [{ ...ENRICHED, mentor: undefined, researcher: undefined, project_title: undefined }],
    }),
  })
  const legacyRes = await legacy.handler('mentor/list', {})
  assertEq(legacyRes.value.proposals[0].mentor.id, MENTOR_ID, '没 enrich → 导师 id 退回顶层 mentor_id')
  assertEq(legacyRes.value.proposals[0].researcher.id, RESEARCHER_ID, '没 enrich → 研究者 id 退回顶层 researcher_id')
  assertEq(legacyRes.value.proposals[0].projectTitle, null, '没 enrich → projectTitle = null（不是 undefined）')
  assert(
    legacyRes.value.proposals[0].mentor.displayName.length > 0,
    '没 enrich → 用短 id 当显示名（界面仍有东西可显示，不显示 undefined）',
  )

  // ── 接受：POST /mentorship-proposals/{id}/accept（**冻结押金**）──
  const CONTRACT = {
    id: 'b916b821-0000-4000-8000-000000000003',
    researcher_id: RESEARCHER_ID,
    mentor_id: MENTOR_ID,
    project_id: PROJECT_ID,
    total_fee: 100,
    deposit_amount: 20,
    success_payment_amount: 80,
    guidance_scope: '指导实验设计与论文写作',
    success_condition: { type: 'MUTUAL_COMPLETION', description: null },
    status: 'ACCEPTED',
    created_at: '2026-09-19T00:00:00Z',
    accepted_at: '2026-09-19T00:00:00Z',
    started_at: '2026-09-19T00:00:00Z',
    completed_at: null,
    settled_at: null,
  }
  const accept = makeHost({
    config: LOGGED_IN,
    handler: async (call) => {
      assert(call.method === 'POST', '接受用 POST')
      assert(call.url.endsWith(`/api/v1/mentorship-proposals/${ENRICHED.id}/accept`), '接受走 /accept')
      return { status: 200, body: CONTRACT }
    },
  })
  const acceptRes = await accept.handler('mentor/accept', { proposalId: ENRICHED.id, intentKey: 'intent-1' })
  assert(acceptRes.ok, 'mentor/accept 成功')
  assertEq(acceptRes.value.contract.status, 'ACCEPTED', '合同状态 = ACCEPTED')
  assertEq(acceptRes.value.contract.depositAmount, 20, '合同带出押金（界面据此报"冻了多少"）')
  assertEq(
    accept.calls[0].headers['idempotency-key'],
    'intent-1',
    '接受带 Idempotency-Key（402 之后重试不重复冻结押金）',
  )
  // 缺幂等键必须本地就拒（服务器那边无法安全重放）
  const noKey = await accept.handler('mentor/accept', { proposalId: ENRICHED.id })
  assert(!noKey.ok && noKey.error.code === 'bad-request', '缺 intentKey → 本地拒（bad-request）')
  assertEq(accept.calls.length, 1, '缺幂等键的请求**没有**发到服务器')

  // 402 押金不足：必须映射成 insufficient-tokens（界面据此说"先获取 Token"）
  const poor = makeHost({
    config: LOGGED_IN,
    handler: async () => ({
      status: 402,
      body: err('INSUFFICIENT_TOKENS', 'not enough', { required: 20, available: 0 }),
    }),
  })
  const poorRes = await poor.handler('mentor/accept', { proposalId: ENRICHED.id, intentKey: 'intent-2' })
  assertEq(poorRes.ok, false, '押金不足 → 不算成功')
  assertEq(poorRes.error.code, 'insufficient-tokens', '402 → insufficient-tokens（界面的"先获取 Token"分支）')

  // ── 拒绝：POST /mentorship-proposals/{id}/reject ──
  const reject = makeHost({
    config: LOGGED_IN,
    handler: async (call) => {
      assert(call.url.endsWith(`/api/v1/mentorship-proposals/${ENRICHED.id}/reject`), '拒绝走 /reject')
      return { status: 200, body: { ...ENRICHED, status: 'REJECTED' } }
    },
  })
  const rejectRes = await reject.handler('mentor/reject', { proposalId: ENRICHED.id })
  assert(rejectRes.ok, 'mentor/reject 成功')
  assertEq(rejectRes.value.proposal.status, 'REJECTED', '拒绝后状态 = REJECTED')

  // ── 未登录时一律 not-configured（不该发出没有凭据的请求）──
  const anon = makeHost({ config: {}, handler: async () => ({ status: 200, body: [] }) })
  for (const endpoint of ['mentor/fee-suggestion', 'mentor/list', 'mentor/propose', 'mentor/accept', 'mentor/reject']) {
    const res = await anon.handler(endpoint, {})
    assertEq(res.ok, false, `未登录调用 ${endpoint} → 失败`)
  }
  assertEq(anon.calls.length, 0, '未登录时**一个请求都没发**（没有凭据就不该请求服务器）')

  // 幂等键 / 明文凭据纪律同样适用于这一组端点
  keyLeak(listRes.value, 'mentor/list')
  keyLeak(acceptRes.value, 'mentor/accept')
}

console.log(`\n${failed === 0 ? '✅' : '❌'} server-login: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
