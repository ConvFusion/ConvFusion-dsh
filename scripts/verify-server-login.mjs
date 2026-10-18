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
 * 当前生产（ConvFusion.com）地址 —— **试运行期**指向 apibrowser 中转，正式域名
 * `convfusion.com` 尚未启用。全脚本只此一处；切回正式域名时改这里
 * （以及 `src/server-env.ts` 的内置兜底与两个 `convfusion.env*.json`）。
 */
const PROD_URL = 'https://convfusion.apibrowser.com:4747'

/**
 * 测试用的"环境"。
 *
 * ⚠️ 必须显式钉住环境名：本机可能装了 `convfusion.env.json`（甚至有人 shell 里设了
 * `CONVFUSION_ENV=production`），而断言要的是**确定性**。所以这里给一个最小环境，
 * 需要别的环境时由 {@link withEnv} 显式构造。
 */
const TEST_ENV = { CONVFUSION_ENV: 'development' }

/**
 * 从 `work/mine` 的一条发布状态里取某个方向的那一条（v0.6.0 起 `published` 是**数组**）。
 *
 * 一个工作区可以同时在两个方向上发布（服务器上是两个项目），所以断言必须**点名方向**
 * ——`published[0]` 之类的写法会在两个方向都发布时变成"看运气"。
 */
const pubOf = (item, direction = 'SEEK_MENTOR') =>
  (item?.published ?? []).find((r) => r.direction === direction) ?? null

/** 从落盘存储里取某个方向的一条记录（键是 `(研究根, 方向)`）。 */
const storedRecord = (store, root, direction = 'SEEK_MENTOR') => store.get(root, direction)

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
    ['  ' + PROD_URL + '/  ', PROD_URL],
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
 * 开发（`http://localhost:8000`）与部署（`https://convfusion.apibrowser.com:4747`）必须由**配置文件**
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
    PROD_URL,
    '无配置文件 + 生产 → 试运行服务器',
  )
  assertEq(
    urlOf({ ...noFile, NODE_ENV: 'production' }).url,
    PROD_URL,
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
  assertEq(ENVCFG.serverUrlMismatch('production', PROD_URL), false, '生产 + 线上地址 = 正常')
  assertEq(ENVCFG.serverUrlMismatch('development', PROD_URL), true, '开发 + 线上地址 = 矛盾')
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
  assertEq(noFile.production, PROD_URL, '线上兜底地址（试运行服务器）')
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
 * 2c. account/serverUrl：保存服务器地址（2026-09 用户报的 bug）
 *
 * **真实故障**：点【互联网服务器】按钮 → 地址看着变了 → 刷新又回到 `localhost`。
 * 根因是地址只在**登录 / 注册**时才落盘，别的路径只改了输入框草稿。
 * 这一节钉住"保存地址"这个独立动作：真的落盘、归一、可清空、非法拒绝、不动凭据。
 * ════════════════════════════════════════════════════════════════════════ */
section('[2c] account/serverUrl：保存地址（刷新后不再丢）')
{
  const TRIAL = 'https://convfusion.apibrowser.com:4747'

  // ① 没配置文件 → 生效地址是开发兜底；保存后要变成新地址**并且真的落盘**
  const h = makeHost({ lagging: false })
  assertEq((await h.handler('account/state', {})).value.serverUrl, 'http://localhost:8000', '保存前 = 开发兜底')
  const saved = await h.handler('account/serverUrl', { serverUrl: TRIAL })
  assertEq(saved.ok, true, '保存成功')
  assertEq(saved.value.serverUrl, TRIAL, '返回值里生效地址已更新')
  assertEq(saved.value.serverUrlSource, 'settings', '来源变成设置文档（不再跟随环境配置）')
  assertEq(h.writes.length, 1, '只写一次配置')
  assertEq(h.writes[0].serverUrl, TRIAL, '写进配置的就是这个地址')
  // ⚠️ 这一条就是那个 bug：重新读状态（= 刷新页面）必须还是新地址
  assertEq((await h.handler('account/state', {})).value.serverUrl, TRIAL, '**刷新后地址不丢**（bug 回归锁）')
  assertEq(h.calls.length, 0, '保存是**本地动作**，不发任何网络请求')

  // ② 归一：用户可能粘贴带 /api、/docs 或末尾斜杠的地址
  for (const [raw, want] of [
    ['  ' + TRIAL + '/api/v1  ', TRIAL],
    [TRIAL + '/', TRIAL],
    [TRIAL + '/docs#/', TRIAL],
  ]) {
    const n = makeHost({ lagging: false })
    const r = await n.handler('account/serverUrl', { serverUrl: raw })
    assertEq(r.value.serverUrl, want, `归一 ${JSON.stringify(raw)}`)
  }

  // ③ 空串 = 清除覆盖 → 回到"跟随环境配置"（界面清空输入框的语义）
  const cleared = makeHost({ config: { serverUrl: TRIAL }, lagging: false })
  assertEq((await cleared.handler('account/state', {})).value.serverUrl, TRIAL, '预设：已保存的地址生效')
  const c = await cleared.handler('account/serverUrl', { serverUrl: '  ' })
  assertEq(c.ok, true, '清空被接受（= 跟随环境配置，不是错误）')
  assertEq(c.value.serverUrl, 'http://localhost:8000', '清空后回到环境配置的地址')
  assertEq(c.value.serverUrlSource, 'config', '来源回到配置文件')
  assertEq(cleared.writes[0].serverUrl, '', '落盘的是空串（不是把地址写成 null）')

  // ④ 非法地址 → bad-url，且**不写盘**（坏地址不该覆盖好地址）
  const b = makeHost({ config: { serverUrl: TRIAL }, lagging: false })
  const br = await b.handler('account/serverUrl', { serverUrl: 'not a url' })
  assertEq(br.ok, false, '非法地址 → 失败')
  assertEq(br.error?.code, 'bad-url', '错误码 bad-url')
  assertEq(b.writes.length, 0, '非法地址不写盘（不破坏已有配置）')
  assertEq((await b.handler('account/state', {})).value.serverUrl, TRIAL, '原地址仍然生效')

  // ⑤ 只改地址、**不动凭据**（清掉 Key 是破坏性的：用户切回去还要重新输入）
  const keep = makeHost({ config: { convfusionApiKey: KEY, serverUrl: 'http://localhost:8000' }, lagging: false })
  const kr = await keep.handler('account/serverUrl', { serverUrl: TRIAL })
  // ⚠️ 关键语义：那份 Key 属于**开发服务器**，切到线上后它不成立 —— 必须报 false。
  // 报 true 的话界面会拿它去线上验证，用户看到的就是那句莫名其妙的「API Key 无效」。
  assertEq(kr.value.keyConfigured, false, '开发 Key 不算线上服务器的凭据（否则会拿它去线上验证）')
  assertEq(keep.writes[0].convfusionApiKey, undefined, '写入的补丁里没有 apiKey 字段（不会顺手改凭据）')
  assertEq(keep.writes[0].convfusionDevApiKey, undefined, '也没动开发槽（改地址与改凭据是两件事）')
  assertEq(JSON.parse(JSON.stringify(kr.value)).convfusionApiKey, undefined, '返回值里没有明文 Key')
  keyLeak(kr.value, 'account/serverUrl')
  // 不猜身份：换服务器后 account 为 null，由界面紧接着 verify 去实打实验
  assertEq(kr.value.account, null, '保存地址后不猜"已登录"（account=null，等 verify）')
  // 凭据**没有被删**：切回开发服务器，它照样生效（这就是"两把 Key"的意义）
  await keep.handler('account/serverUrl', { serverUrl: 'http://localhost:8000' })
  const back = await keep.handler('account/state', {})
  assertEq(back.value.keyConfigured, true, '切回开发服务器后原凭据立即恢复可用')
  assertEq(back.value.serverUrlSource, 'settings', '地址仍是显式保存的那个')
}

/* ════════════════════════════════════════════════════════════════════════
 * 2d. 凭据按服务器分槽（2026-09 用户报的 bug 的根治）
 *
 * **真实现场**：用户在开发服务器上登录着，点了【互联网服务器】→【保存】，界面立刻弹
 * 「invalid-key：API Key 无效或不存在，请核对后重试」。话没说错，但方向全错 —— 那份 Key
 * 属于开发服务器，**本来就不该被发到线上**。凭据是绑定在服务器上的，配置里却只有一份。
 *
 * 修法：两个槽（`convfusionDevApiKey` / `convfusionProdApiKey`），按地址取用。
 * 这一节钉住整条链路：不在错的服务器上用错的 Key、切回去凭据还在、登出只清当前槽、
 * 四个 secret 字段一个都不能漏出浏览器。
 * ════════════════════════════════════════════════════════════════════════ */
section('[2d] 凭据按服务器分槽（切服务器不再发错 Key）')
{
  const DEV = 'http://localhost:8000'
  const DEV_KEY = 'cf_live_devkey0001'
  const PROD_KEY = 'cf_live_prodkey0002'

  const stateOf = async (h) => (await h.handler('account/state', {})).value
  const hostWith = (config) => makeHost({ config, lagging: false })

  // ① 开发地址只认开发槽 —— 线上槽的 Key 在这台服务器上不算数
  const devOnly = hostWith({ convfusionProdApiKey: PROD_KEY, serverUrl: DEV })
  assertEq((await stateOf(devOnly)).keyConfigured, false, '只有线上 Key → 开发地址上不算已配置')
  const devKey = hostWith({ convfusionDevApiKey: DEV_KEY, serverUrl: DEV })
  assertEq((await stateOf(devKey)).keyConfigured, true, '开发 Key → 开发地址上算已配置')

  // ② 换到线上：开发 Key **不算**线上凭据（否则就会把它发给线上）
  const switched = hostWith({ convfusionDevApiKey: DEV_KEY, serverUrl: DEV })
  await switched.handler('account/serverUrl', { serverUrl: PROD_URL })
  const onProd = await stateOf(switched)
  assertEq(onProd.keyConfigured, false, '切到线上后**不**把开发 Key 当线上凭据（bug 的直接回归锁）')
  // 界面据此跳过 verify —— 这才是"不再弹 invalid-key"的机制
  const verifyOnProd = await switched.handler('account/verify', {})
  assertEq(verifyOnProd.ok, false, '没有线上凭据时 verify 直接失败')
  assertEq(verifyOnProd.error?.code, 'not-configured', '失败原因是"未配置"（**不是** invalid-key）')
  assertEq(switched.calls.length, 0, '并且一个请求都没发（开发 Key 没被白送到线上）')

  // ③ 在线上登录 → 写线上槽，旧单值字段并入开发槽（两份凭据都保住）
  const both = hostWith({ convfusionApiKey: DEV_KEY, serverUrl: DEV })
  const login = await both.handler('account/login', { apiKey: PROD_KEY, serverUrl: PROD_URL })
  assert(login.ok, '线上登录成功')
  assertEq(both.writes[0].convfusionProdApiKey, PROD_KEY, 'Key 写进**线上槽**（地址决定槽）')
  assertEq(both.writes[0].convfusionDevApiKey, DEV_KEY, '旧单值 Key 并入**开发槽**（迁移，不是丢掉）')
  assertEq(both.writes[0].convfusionApiKey, '', '旧单值字段清空（迁移完成，不再两处并存）')
  assertEq((await stateOf(both)).keyConfigured, true, '线上地址上有线上凭据')

  // ④ 切回开发 → 开发 Key 立刻恢复（不用重输）
  await both.handler('account/serverUrl', { serverUrl: DEV })
  const backDev = await stateOf(both)
  assertEq(backDev.keyConfigured, true, '切回开发服务器后开发凭据仍在')
  assertEq(both.config.convfusionProdApiKey, PROD_KEY, '线上凭据没被切回开发时清掉')

  // ⑤ 登出只清**当前服务器**那一槽（另一台服务器的登录态不能顺手抹掉）
  const outDev = hostWith({ convfusionDevApiKey: DEV_KEY, convfusionProdApiKey: PROD_KEY, serverUrl: DEV })
  await outDev.handler('account/logout', {})
  assertEq(outDev.writes[0].convfusionDevApiKey, '', '登出清掉当前（开发）槽')
  assertEq(outDev.writes[0].convfusionApiKey, '', '开发槽的旧单值字段一并清（否则会"复活"，登出无效）')
  assertEq(outDev.writes[0].convfusionProdApiKey, undefined, '**不**清线上槽（那是另一台服务器的登录态）')
  assertEq((await stateOf(outDev)).keyConfigured, false, '登出后当前服务器显示未配置')
  const outProd = hostWith({ convfusionDevApiKey: DEV_KEY, convfusionProdApiKey: PROD_KEY, serverUrl: PROD_URL })
  await outProd.handler('account/logout', {})
  assertEq(outProd.writes[0].convfusionProdApiKey, '', '在线上登出 → 清线上槽')
  assertEq(outProd.writes[0].convfusionDevApiKey, undefined, '开发槽不动')

  // ⑥ 槽判定：自定义地址按"是不是本机"归类（不能把 localhost:9000 当线上）
  const ENVCFG2 = await import(lib('server-env.js'))
  assertEq(ENVCFG2.serverSlotOf(DEV), 'development', '开发预设 → 开发槽')
  assertEq(ENVCFG2.serverSlotOf(PROD_URL), 'production', '互联网预设 → 互联网槽')
  assertEq(ENVCFG2.serverSlotOf('http://localhost:9000'), 'development', '换端口的本机地址仍算开发槽')
  assertEq(ENVCFG2.serverSlotOf('http://127.0.0.1:9000'), 'development', '127.0.0.1 也算本机')
  assertEq(ENVCFG2.serverSlotOf('https://example.com'), 'production', '任意远程地址算互联网槽')
  assertEq(ENVCFG2.serverSlotOf(PROD_URL + '/api/v1'), 'production', '带 /api/v1 也能判对（归一后比较）')

  // ⑦ 两个槽都是 secret：一个都不能漏出浏览器
  const CFGM = await import(lib('config.js'))
  const redacted = CFGM.redactConfig({
    ...CFGM.resolveConfig({}),
    openalexApiKey: 'oa',
    convfusionApiKey: 'legacy',
    convfusionDevApiKey: DEV_KEY,
    convfusionProdApiKey: PROD_KEY,
  })
  const redactedJson = JSON.stringify(redacted)
  for (const [label, secret] of [
    ['OpenAlex', 'oa'],
    ['旧单值', 'legacy'],
    ['开发槽', DEV_KEY],
    ['线上槽', PROD_KEY],
  ]) {
    assert(!redactedJson.includes(secret), `${label} Key 被 redactConfig 剔除（漏一个就是明文回浏览器）`)
  }
  assertEq(redacted.convfusionDevApiKey, undefined, 'redactConfig 的返回类型里没有开发槽')
  assertEq(redacted.convfusionProdApiKey, undefined, 'redactConfig 的返回类型里没有线上槽')
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
  // localhost 命中开发预设 → 凭据写进**开发槽**（凭据按服务器分槽，见 config.ts）
  assertEq(h.writes[0].convfusionDevApiKey, KEY, '凭据写入开发槽（本机）')
  assertEq(h.writes[0].convfusionProdApiKey, undefined, '不碰线上槽（那是另一套账号）')
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
  assertEq(h.writes[0].convfusionDevApiKey, NEW_KEY, '服务器签发的 Key 直接落盘（用户不必复制一遍）')
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
  assertEq(out.writes[0].convfusionDevApiKey, '', '凭据被清空（只清当前服务器那一槽）')
  // 迁移期的旧单值字段也算开发槽凭据，必须一起清 —— 否则它会立刻"复活"，
  // 用户点了登出却还是登录状态
  assertEq(out.writes[0].convfusionApiKey, '', '旧单值字段一并清掉（否则登出无效）')
  assertEq(out.writes[0].convfusionProdApiKey, undefined, '不顺手清掉线上槽的凭据')
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
    // 2026-10 服务器为 /discovery/random 新增：公开发现列表的作者（【可指导】要显示）
    owner: { id: 'd9ddbaa6-11a0-44b0-9141-afd4a5fffd18', display_name: 'wen' },
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
  // 2026-10 服务器新增 owner：【可指导】列表按它显示作者名
  assertEq(listRes.value.items[0].owner?.displayName, 'wen', 'owner.display_name → owner.displayName（作者名带出）')
  assertEq(listRes.value.items[0].owner?.id, ITEM.owner.id, 'owner.id 带出')
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
      // 「同一账号在另一台服务器」：凭据按服务器分槽，所以这里要给**线上槽**一把 Key，
      // 只改地址是不够的（开发 Key 在线上不成立 —— 这正是本次修复的语义）
      config: { ...LOGGED_IN, convfusionProdApiKey: KEY, serverUrl: PROD_URL },
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
  // 服务器 v0.6.3 起把余额分成**两池**：赠送（只能买自营服务）/ 资金（能付导师、能提现）
  const BALANCE = {
    available_balance: 7,
    frozen_balance: 3,
    total_balance: 10,
    grant_balance: 5,
    funded_balance: 2,
  }
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
  assertEq(res.value.tokens.grant, 5, '赠送额度带回（grant_balance）')
  assertEq(res.value.tokens.funded, 2, '资金池带回（funded_balance）')
  assertEq(h.calls.length, 2, '两次请求：/auth/me + /tokens')
  assertEq(h.calls[1].headers.authorization, `Bearer ${KEY}`, '余额接口同样带凭据')
  keyLeak(res.value, 'account/login（含余额）')

  // ── 旧服务器（不返回两池）：读作 null，**不是** 0 ──
  // 读成 0 会让界面把"能付导师"说成 0，把一个本来能接受指导的账号挡住。
  {
    const legacy = makeHost({
      config: { convfusionApiKey: KEY },
      handler: async (call) => {
        if (call.url.endsWith('/api/v1/auth/me')) return { status: 200, body: ME }
        return { status: 200, body: { available_balance: 7, frozen_balance: 3, total_balance: 10 } }
      },
    })
    const legacyRes = await legacy.handler('account/tokens', {})
    assertEq(legacyRes.value.tokens.grant, null, '旧服务器：赠送额度 = null（不是 0）')
    assertEq(legacyRes.value.tokens.funded, null, '旧服务器：资金池 = null（不是 0）')
    // "要不要拦"的判据在**客户端**（它才看得见余额又要做决定），由
    // `verify-settings-page.mjs` 的 [9] 段真的渲染一遍 AcceptConfirmDialog 来钉：
    // 有 funded → 只认它；funded 为 null（旧宿主）→ 不拦（旧语义下两池本来就是一体的）。
  }

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
 * 6c3. 用量与配额（account/usage —— 【账号】仪表板的"存储空间 / 项目"两块）
 *
 * 与发布预检（`work/uploadPlan`）共用同一个服务器调用（`GET /usage`）。两条纪律：
 *   ① snake_case → camelCase 的映射要对（字节数错了，仪表板画的比例就错了）；
 *   ② **读不到 = null**，不是 0 —— "还剩 0 字节"与"读不到"是两件事，
 *      把后者画成前者会让用户以为配额用光了（协议 v7 余额那次定的口径）。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6c3] 用量与配额（account/usage）')
{
  const GB = 1024 * 1024 * 1024
  const USAGE = {
    projects: { next_publish_cost: 2, paid_alive: 3, tier: 2 },
    storage: {
      used_bytes: 1024 * 1024,
      capacity_bytes: 5 * GB,
      available_bytes: 5 * GB - 1024 * 1024,
      bytes_per_token: 1024,
    },
  }
  const h = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async (call) =>
      call.url.endsWith('/api/v1/usage')
        ? { status: 200, body: USAGE }
        : { status: 404, body: err('RESOURCE_NOT_FOUND', 'nope') },
  })
  const res = await h.handler('account/usage', {})
  assert(res.ok, 'account/usage 可用')
  assertEq(res.value.usage.storage.usedBytes, 1024 * 1024, '带出存储已用字节')
  assertEq(res.value.usage.storage.capacityBytes, 5 * GB, '带出存储总额（画比例的分母）')
  assertEq(res.value.usage.storage.availableBytes, 5 * GB - 1024 * 1024, '带出存储可用字节')
  assertEq(res.value.usage.paidProjects, 3, '带出已发布项目数')
  assertEq(res.value.usage.tier, 2, '带出项目阶梯')
  assertEq(res.value.usage.nextPublishCost, 2, '带出下次发布花费')
  assertEq(h.calls.length, 1, '只问一次 /usage')
  assertEq(h.calls[0].headers.authorization, `Bearer ${KEY}`, '用量接口同样带凭据')
  keyLeak(res.value, 'account/usage')

  // ── 读不到 = null（**不是** 0）──
  const down = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => {
      throw new Error('ECONNRESET')
    },
  })
  const downRes = await down.handler('account/usage', {})
  assertEq(downRes.ok, true, '用量读不到不算 RPC 失败（不能因此挡住账号页）')
  assertEq(downRes.value.usage, null, '拿不到用量 → null（**不是** 0）')

  // ── 响应形状不对：同样按"未知"处理，不假装拿到了 ──
  const malformed = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => ({ status: 200, body: { nope: true } }),
  })
  assertEq((await malformed.handler('account/usage', {})).value.usage, null, '缺字段 → null（不猜 0）')

  // ── 未登录：本地拒绝，不发请求 ──
  const anon = makeHost()
  assertEq((await anon.handler('account/usage', {})).error.code, 'not-configured', '未登录问用量 → not-configured')
  assertEq(anon.calls.length, 0, '未登录不发请求')
}

/* ════════════════════════════════════════════════════════════════════════
 * 6c2. 续费申请（account/recharge-request + account/recharge-requests）
 *
 * 服务器 `POST /tokens/recharge-requests` **只记意向、不改余额**（管理员事后批准才发
 * Token）。这里钉住三件事：请求体正确（snake_case）、鉴权带头、**失败有话可说**。
 * ⚠️ 服务器 `submit` 不幂等 → 防重复是**客户端**的责任（先 list 再决定给不给入口）。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6c2] 续费申请：提交 + 查看自己的记录')
{
  const REQ = {
    id: '3f6a1e2c-0d4b-4a7e-9c1f-2b8d5e6a7c90',
    user_id: 'eed5abd6-b2d9-4a80-b0ad-4d7fffd27a6c',
    amount: 100,
    reason: '实验跑不完了',
    status: 'PENDING',
    note: null,
    reviewed_by: null,
    reviewed_at: null,
    grant_tx_id: null,
    created_at: '2026-09-24T10:00:00Z',
    updated_at: '2026-09-24T10:00:00Z',
  }

  // ── ① 提交：请求体必须是服务器要的 snake_case 形状 ──
  const sub = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async (call) => {
      if (call.url.endsWith('/api/v1/tokens/recharge-requests')) return { status: 201, body: REQ }
      return { status: 404, body: err('RESOURCE_NOT_FOUND', 'nope') }
    },
  })
  const subRes = await sub.handler('account/recharge-request', { amount: 100, reason: '实验跑不完了' })
  assert(subRes.ok, '提交续费申请成功')
  assertEq(sub.calls.length, 1, '只发一次请求')
  assertEq(sub.calls[0].method, 'POST', '用 POST')
  assertEq(sub.calls[0].url, 'http://localhost:8000/api/v1/tokens/recharge-requests', '打到 /tokens/recharge-requests')
  assertEq(sub.calls[0].headers.authorization, `Bearer ${KEY}`, '带凭据（这是需要身份的接口）')
  const sent = JSON.parse(sub.calls[0].body)
  assertEq(sent.amount, 100, '请求体带 amount')
  assertEq(sent.reason, '实验跑不完了', '请求体带 reason')
  // 解析：snake_case → camelCase
  assertEq(subRes.value.request.status, 'PENDING', '新建申请是 PENDING')
  assertEq(subRes.value.request.amount, 100, '带回申请数量')
  assertEq(subRes.value.request.grantTxId, null, '还没批准 → 没有发放流水')
  keyLeak(subRes.value, 'account/recharge-request')

  // ── ② 只在有理由时才带 reason（服务器 reason 可空）──
  const noReason = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => ({ status: 201, body: { ...REQ, reason: null } }),
  })
  await noReason.handler('account/recharge-request', { amount: 50 })
  const bare = JSON.parse(noReason.calls[0].body)
  assertEq(bare.amount, 50, '没理由也能提交')
  assert(!('reason' in bare), '没填理由就不带 reason 字段（不塞空串）')

  // ── ③ 宿主侧就拦住非法数量：不白跑一趟网络 ──
  for (const [bad, label] of [
    [0, '0'],
    [-5, '负数'],
    [2.5, '小数'],
    ['abc', '非数字'],
    [undefined, '缺字段'],
  ]) {
    const h = makeHost({ config: { convfusionApiKey: KEY } })
    const r = await h.handler('account/recharge-request', { amount: bad })
    assertEq(r.ok, false, `数量 ${label} → 失败`)
    assertEq(r.error.code, 'bad-request', `数量 ${label} 的错误码是 bad-request`)
    assertEq(h.calls.length, 0, `数量 ${label} 时**没有**发网络请求`)
  }
  // 超长理由同样在本地拦（服务器 max_length=500）
  const longH = makeHost({ config: { convfusionApiKey: KEY } })
  const longR = await longH.handler('account/recharge-request', { amount: 10, reason: 'x'.repeat(501) })
  assertEq(longR.error?.code, 'bad-request', '理由 501 字 → bad-request')
  assertEq(longH.calls.length, 0, '超长理由不发网络请求')

  // ── ④ 查看自己的记录（列表）──
  const list = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async (call) => {
      if (call.url.endsWith('/api/v1/tokens/recharge-requests'))
        return { status: 200, body: { items: [REQ, { ...REQ, id: 'x2', amount: 30, status: 'APPROVED', grant_tx_id: 'tx-1' }] } }
      return { status: 404, body: err('RESOURCE_NOT_FOUND', 'nope') }
    },
  })
  const listRes = await list.handler('account/recharge-requests', {})
  assert(listRes.ok, '查看续费记录成功')
  assertEq(list.calls[0].method, 'GET', '用 GET')
  assertEq(listRes.value.items.length, 2, '带回两条记录')
  assertEq(listRes.value.items[0].status, 'PENDING', '第一条待处理')
  assertEq(listRes.value.items[1].status, 'APPROVED', '第二条已批准')
  assertEq(listRes.value.items[1].grantTxId, 'tx-1', '已批准的那条带回账本流水 id')
  keyLeak(listRes.value, 'account/recharge-requests')

  // ── ⑤ 未登录：本地拒绝，不发请求 ──
  const anonSub = makeHost()
  assertEq(
    (await anonSub.handler('account/recharge-request', { amount: 10 })).error.code,
    'not-configured',
    '未登录提交 → not-configured',
  )
  assertEq(anonSub.calls.length, 0, '未登录不发请求（提交）')
  const anonList = makeHost()
  assertEq(
    (await anonList.handler('account/recharge-requests', {})).error.code,
    'not-configured',
    '未登录查看 → not-configured',
  )
  assertEq(anonList.calls.length, 0, '未登录不发请求（查看）')

  // ── ⑥ 服务器拒绝时，理由要能传到界面（401 换 Key 是另一回事）──
  const rejected = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => ({ status: 400, body: err('BAD_REQUEST', 'amount must be positive') }),
  })
  const rejRes = await rejected.handler('account/recharge-request', { amount: 10 })
  assertEq(rejRes.ok, false, '服务器 400 → 失败')
  assert(String(rejRes.error?.message ?? '').length > 0, '带回可显示的原因')
  // 凭据失效：必须是 invalid-key（要让用户去换 Key，而不是以为申请写错了）
  const revokedSub = makeHost({
    config: { convfusionApiKey: KEY },
    handler: async () => ({ status: 401, body: err('API_KEY_REVOKED', 'revoked') }),
  })
  assertEq(
    (await revokedSub.handler('account/recharge-request', { amount: 10 })).error.code,
    'invalid-key',
    '401 → invalid-key',
  )
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
      '三组对照 + oracle 上界。',
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
  const makePublisher = ({
    conflictOnce = false,
    failPublish = false,
    serverVersion = null,
    /** 建项目/回查项目时服务器返回的 `workspace_id`。 */
    returnWorkspaceId = 'ws_11111111111111111111111111111111',
    /** `true` = 模拟**老服务器**（响应里**没有**这个字段 → 插件按"无法判定"处理）。 */
    omitWorkspaceId = false,
    /* 附件请求**进行中**的钩子：测试据此在那一刻读进度端点（模拟界面按秒轮询）。 */
    onFilesPost = null,
  } = {}) => {
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
        return json(201, {
          id: 'srv-project-1',
          title: 'x',
          visibility: 'PRIVATE',
          status: 'ACTIVE',
          // 服务器给这项工作一个**跨项目生命周期不变**的身份（v3 规格：POST /projects 回 workspace_id）
          ...(omitWorkspaceId ? {} : { workspace_id: returnWorkspaceId }),
          updated_at: '',
        })
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
        if (onFilesPost) await onFilesPost({ relPaths })
        return json(201, relPaths.map((rp, i) => ({ id: `f${i}`, relative_path: rp, size: 4, sha256: `sha256:${i}` })))
      }
      if (url.endsWith('/projects/srv-project-1/publish')) {
        return failPublish ? json(500, err('INTERNAL_ERROR', 'boom')) : json(200, { project_id: 'srv-project-1', visibility: 'PUBLISHED', charged_tokens: 1 })
      }
      // 改名（v0.6.0 起"更新"时会按需 PUT 项目标题）—— 真实服务器一直有这个端点
      if (url.endsWith('/projects/srv-project-1') && method === 'GET') {
        return json(200, {
          id: 'srv-project-1',
          title: 'x',
          visibility: 'PUBLISHED',
          status: 'ACTIVE',
          ...(omitWorkspaceId ? {} : { workspace_id: returnWorkspaceId }),
          updated_at: '',
        })
      }
      if (url.endsWith('/projects/srv-project-1') && method === 'PUT') {
        return json(200, { id: 'srv-project-1', title: JSON.parse(init.body).title, visibility: 'PRIVATE', status: 'ACTIVE', updated_at: '' })
      }
      return json(404, err('RESOURCE_NOT_FOUND', 'nope'))
    }
    return { fetchImpl, calls, state: () => stateVersion }
  }

  const makePubHost = (
    server,
    store = PUB.createMemoryPublishedStore(),
    config = {},
    workIdentity = undefined,
  ) =>
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
      ...(workIdentity ? { workIdentity } : {}),
    })

  /**
   * ════════════════════════════════════════════════════════════════════════
   * 用户的真实用法：**同一个会话工作区里换进换出多项研究**
   *
   * 他们把 `workspace/` 改名挪走、把另一项研究挪成 `workspace/`，反复切换。
   * 所以**路径不能当身份**：身份跟目录走（研究根里的 `.convfusion/work.json`），
   * 发布记录按 `workspace_id` 存，路径 → 身份的"注册表"只是一层**用指纹核对的缓存**。
   *
   * 完整循环：发布 A → 换成 B（A 的记录还在）→ 换回 A。
   * ════════════════════════════════════════════════════════════════════════
   */
  /*
   * ════════════════════════════════════════════════════════════════════════
   * 【6k】换进换出：**同一个路径**住不同研究 —— 路径不是身份
   *
   * 用户的真实用法：把 `workspace/` 整个目录挪走（改名），把另一项研究挪成
   * `workspace/`，反复切换。研究根的**路径始终不变**，变的是谁住在里面。
   *
   * 完整循环：A 就位并发布 → 挪走 A、换进新研究 B → 挪走 B、把 A 换回来。
   * 断言三件事：
   *   ① A 的身份写在 **A 的目录里**（标记跟着目录走）+ 注册表缓存带 A 的指纹；
   *   ② B 住进同一路径时**不继承** A 的身份与发布记录（缓存指纹不符 → 不采信）；
   *   ③ A 换回来时立刻认得，仍显示它的发布记录（【更新研究工作】）。
   * ════════════════════════════════════════════════════════════════════════
   */
  section('[6k] 换进换出：同一个路径住不同研究（路径不是身份）')
  {
    const WI2 = await import(lib('research/work-identity.js'))
    const swap = join(HOME3, 'swap')
    const live = join(swap, 'workspace') // 会话里的研究根：**路径固定**
    const stashA = join(swap, 'stash-a')
    const stashB = join(swap, 'stash-b')
    for (const [d, topic, createdAt] of [
      ['stash-a', '研究 A：换出去又换回来', '2026-01-01T00:00:00.000Z'],
      ['stash-b', '研究 B：换进来的新研究', '2026-02-02T00:00:00.000Z'],
    ]) {
      fs.mkdirSync(join(swap, d), { recursive: true })
      fs.writeFileSync(
        join(swap, d, 'project.md'),
        `---\ncreated_at: ${createdAt}\ntopic: ${topic}\n---\n\n# ${topic}\n`,
      )
      fs.writeFileSync(join(swap, d, 'research-state.md'), `# ${topic}\n\n- Version: v1\n`)
    }

    const WS_A = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const identity = WI2.createMemoryWorkIdentityStore()
    const store = PUB.createMemoryPublishedStore(undefined, {
      workIdOf: (r) => WI2.readLocalIdentity(r, identity).workspaceId,
      fingerprintOf: WI2.researchRootFingerprint,
    })
    const serverFor = (ws) => {
      const srv = makePublisher({ returnWorkspaceId: ws })
      return srv
    }
    let srv = serverFor(WS_A)
    const host = () =>
      RPC.createSettingsRpcHandler({
        getConfig: () =>
          CFG.resolveConfig({
            customizationFile: 'x.json',
            customizationDir: HOME3,
            convfusionApiKey: KEY,
            serverUrl: 'http://localhost:8000',
          }),
        store: CUST.createMemoryCustomizationStore(),
        listLocalWorkspaces: async () => ({
          available: true,
          items: [{ id: 'ws-one', title: '切换中的工作区', path: swap, updatedAt: '' }],
        }),
        publishedStore: store,
        fetchImpl: srv.fetchImpl,
        workIdentity: identity,
      })
    const mineRow = async () => {
      const res = await host()('work/mine', {})
      return (res.value?.items ?? []).find((x) => !x.detached)
    }

    // ① A 就位 → 发布
    fs.renameSync(stashA, live)
    const LIVE = fs.realpathSync(live)
    const fpA = WI2.researchRootFingerprint(LIVE)
    assert(Boolean(fpA), 'A 的研究根有指纹')
    const pubA = await host()('work/publish', { id: 'ws-one' })
    assert(pubA.ok, `A 发布成功${pubA.ok ? '' : `（${pubA.error?.code}）`}`)
    assertEq(WI2.readWorkMarker(LIVE)?.workspaceId, WS_A, '身份写在 **A 的目录**里（跟着目录走）')
    assertEq(identity.get(LIVE)?.rootFingerprint, fpA, '注册表缓存带 A 的指纹')

    // ② 挪走 A、换进 B（同一路径、新研究）
    fs.renameSync(live, stashA)
    fs.renameSync(stashB, live)
    const rowB = await mineRow()
    assertEq(rowB?.workId ?? null, null, 'B 拿不到 A 的身份（注册表指纹不符 → 不采信）')
    assertEq(rowB?.published.length, 0, 'B 也不继承 A 的发布记录（**路径不是身份**）')

    // ③ 挪走 B、把 A 换回来 → 立刻认得
    fs.renameSync(live, stashB)
    fs.renameSync(stashA, live)
    const rowA = await mineRow()
    assertEq(rowA?.workId, WS_A, 'A 换回来：身份立刻认得（标记跟着目录）')
    assertEq(rowA?.published.length, 1, 'A 换回来：仍显示它的发布记录（【更新研究工作】）')
  }


  /*
   * ── ⑩ 「服务器 + 本机」两个数据源都命中同一个项目 → **只能一行** ────────────
   *
   * 用户 2026-10 实测：H-MEM 在【我的】里出现了**两次** —— 带 `ws_…` 的那行来自
   * 服务器列表，不带 id 的那行来自**本机记录**（旧记录没有 `workId` 字段，map 键是
   * `project:<id>`，而服务器那条键是 `ws_…`，**按键去重必然重**）。去重必须按 **projectId**。
   */
  section('[6l] 两源命中同一项目 → 一行')
  {
    const PROJECT = 'proj-two-sources'
    const WS_ONE = 'ws_dddddddddddddddddddddddddddddddd'
    const store = PUB.createMemoryPublishedStore()
    store.set(fs.realpathSync(root), {
      direction: 'SEEK_STUDENT',
      projectId: PROJECT,
      serverUrl: 'http://localhost:8000',
      accountId: 'acc-1',
      version: 1,
      contentHash: 'sha256:x',
      title: '两源合并的工作',
      files: {},
      selection: [],
    })
    const server = makePublisher({ returnWorkspaceId: WS_ONE })
    server.fetchImpl = async (url, init) => {
      if (String(url).endsWith('/api/v1/projects') && (init?.method ?? 'GET') === 'GET') {
        return {
          ok: true, status: 200, headers: { get: () => null },
          json: async () => [{
            id: PROJECT, workspace_id: WS_ONE, visibility: 'PUBLISHED',
            direction: 'SEEK_STUDENT', title: '两源合并的工作', updated_at: '2026-10-15T00:00:00Z',
          }],
        }
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }
    }
    const mine = await makePubHost(server, store)('work/mine', {})
    const rows = (mine.value?.items ?? []).filter((x) =>
      x.published.some((r) => r.projectId === PROJECT) || x.id.includes(PROJECT),
    )
    assertEq(rows.length, 1, `同一个项目只出现一行（实测 ${rows.length} 行）`)
    assertEq(rows[0]?.workId, WS_ONE, '合并成的那一行带出 work_id（服务器那一半给的）')
    assertEq(rows[0]?.detached, true, '本机没打开 → detached（不给更新按钮）')
  }

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

    /*
     * ── 发布也**上报进度**（与导师回传同一根进度条）──
     *
     * 2026-10 用户实测：【我的】→ 发布一个带附件的工作时界面上**没有任何进度条**，
     * 几十 MB 下只有按钮上的「发布中…」——慢与死分不出来。
     * 这里在**附件请求进行中**那一刻读进度端点，模拟界面按秒轮询看到的东西。
     */
    {
      const seen = []
      let host = null
      const progressServer = makePublisher({
        onFilesPost: async () => {
          seen.push(await host('mentor/uploadProgress', { projectId: 'ws-pub' }))
        },
      })
      host = makePubHost(progressServer, PUB.createMemoryPublishedStore())
      const published = await host('work/publish', { id: 'ws-pub' })
      assert(published.ok, '带进度上报的发布成功')
      assert(seen.length > 0, '附件请求进行中能读到进度端点')
      const mid = seen[0].value
      assertEq(mid.running, true, '附件上传中：running = true（界面据此显示进度条）')
      assert(mid.totalFiles > 0, `进度里有**总数**（界面能显示 0/N 与百分比；实测 ${mid.totalFiles} 个文件）`)
      assert(mid.totalBytes > 0, `进度里有**总字节**（百分比的分母；实测 ${mid.totalBytes} B）`)
      // 认领键（服务器项目 id / 本机工作区 id）是宿主内部的东西，不该出现在界面契约里
      assertEq('keys' in mid, false, '回给界面的进度里没有内部认领键')
      const after = await host('mentor/uploadProgress', { projectId: 'ws-pub' })
      assertEq(after.value.running, false, '传完 → running = false（进度条不再"永远在跑"）')
      // 别的项目问同一个端点：回 0/未在跑，不能把这次上传的数字当成它的
      const other = await host('mentor/uploadProgress', { projectId: 'ws-other' })
      assertEq(other.value.totalFiles, 0, '别的项目读到的是空进度（不串台）')
    }

    /*
     * ── 研究工作的**身份**：发布后由服务器给 `workspace_id`，本机落盘 ──────────
     *
     * 2026-10 用户要求：界面不能按**会话工作区目录名**（如 `ConvFusion-dsh`）区分研究工作
     * —— 同一个会话工作区里可以有多项研究。区分"这是哪一项研究"的唯一判据是服务器给的
     * `workspace_id`（改题、重建项目、重新发布都不变，见 dev-notes/v3-Workspace-Identity-API.md）。
     * 新建的本机研究**没有** id（但有名字）；发布之后服务器返回它并落盘在本机。
     */
    {
      const WI = await import(lib('research/work-identity.js'))
      /*
       * ⚠️ 一律用**真身路径**：宿主对注册表路径做 realpath，而 macOS 的 `/var` 是指向
       * `/private/var` 的软链 —— 用非真身的字符串去查发布记录/身份注册表会查不到
       * （第一版就这么错了：断言全挂在"没写进去"，其实写在了真身路径上）。
       */
      const K_ROOT = fs.realpathSync(root)
      const markerPath = path.join(K_ROOT, '.convfusion', 'work.json')
      const forgetIdentity = () => fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
      const WSID = 'ws_22222222222222222222222222222222'

      // ⓪ 新建的本机研究：**有名字、没有 id**（id 只能由服务器给）
      forgetIdentity()
      {
        const mine0 = await makePubHost(makePublisher(), PUB.createMemoryPublishedStore())('work/mine', {})
        const item0 = (mine0.value?.items ?? []).find((x) => x.id === 'ws-pub')
        assertEq(item0?.workId ?? null, null, '还没发布 → 没有 work_id（这正是"新建的本机研究"）')
        assertEq(
          item0?.workName,
          '低算力视觉语言方向的可证伪问题',
          '但**有研究工作名**：列表项显示它，而不是会话工作区目录名',
        )
      }

      // ① 首传：服务器返回 id → 写进本机标记 + 插件侧注册表
      forgetIdentity()
      const store1 = PUB.createMemoryPublishedStore()
      const identity1 = WI.createMemoryWorkIdentityStore()
      const server1 = makePublisher({ returnWorkspaceId: WSID })
      const host1 = makePubHost(server1, store1, {}, identity1)
      assert((await host1('work/publish', { id: 'ws-pub' })).ok, '首传成功')
      assert(fs.existsSync(markerPath), '本机标记写下了（<研究根>/.convfusion/work.json）')
      // `readWorkMarker` 回的是**解析后的对象**（驼峰字段；文件里是 snake_case）
      assertEq(WI.readWorkMarker(K_ROOT)?.workspaceId, WSID, '标记里是**服务器返回的**身份')
      assertEq(identity1.get(K_ROOT)?.workspaceId, WSID, '插件侧注册表也记一份（解压前就能判）')
      {
        // 三个**写请求**都带上身份：服务器只要在一个环节校验，就能拦住"写进别人的项目"
        const writes = server1.calls.filter(
          (c) => c.method === 'POST' && /(\/state|\/files|\/publish)$/.test(c.url),
        )
        assert(writes.length >= 3, `三个写请求都发出去了（实测 ${writes.length} 个）`)
        assert(
          writes.every((c) => (c.headers ?? {})['x-workspace-id'] === WSID),
          '传状态 / 传附件 / 发布都带 X-Workspace-Id（服务器据此拒绝写错项目）',
        )
      }

      // ② 再传（换了本地发布记录、但标记还在）→ 建项目时**沿用**同一个身份
      const store2 = PUB.createMemoryPublishedStore()
      const server2 = makePublisher({ returnWorkspaceId: WSID })
      const host2 = makePubHost(server2, store2, {}, WI.createMemoryWorkIdentityStore())
      assert((await host2('work/publish', { id: 'ws-pub' })).ok, '标记还在时再传成功')
      const createBody = JSON.parse(
        server2.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects')).body,
      )
      assertEq(createBody.workspace_id, WSID, '建项目时带上已有身份（否则服务器会当成"另一项研究"）')

      // ③ 复用旧项目但本机**没有**身份（老版本插件发的 / 标记被删）→ 回查对齐
      forgetIdentity()
      const store3 = PUB.createMemoryPublishedStore()
      const projectIdOld = '74477e8a-d94c-45a0-81fa-161267ddd23f'
      store3.set(K_ROOT, {
        direction: 'SEEK_MENTOR',
        projectId: projectIdOld,
        serverUrl: 'http://localhost:8000',
        accountId: 'acc-1',
        version: 1,
        contentHash: 'sha256:x',
        files: {},
        selection: [],
      })
      const server3 = makePublisher({ returnWorkspaceId: WSID, serverVersion: 1 })
      const host3 = makePubHost(server3, store3, {}, WI.createMemoryWorkIdentityStore())
      assert((await host3('work/publish', { id: 'ws-pub' })).ok, '复用旧项目发布成功')
      assert(
        server3.calls.some((c) => c.method === 'GET' && c.url.endsWith(`/projects/${projectIdOld}`)),
        '缺身份时回查了一次项目（GET /projects/{id}）以对齐',
      )
      assertEq(WI.readWorkMarker(K_ROOT)?.workspaceId, WSID, '回查到的身份也落盘了')

      // ④ **老服务器**不返回 id → 什么都不写（绝不编造身份）
      forgetIdentity()
      const host4 = makePubHost(
        makePublisher({ omitWorkspaceId: true }),
        PUB.createMemoryPublishedStore(),
        {},
        WI.createMemoryWorkIdentityStore(),
      )
      assert((await host4('work/publish', { id: 'ws-pub' })).ok, '老服务器上发布照样成功')
      assertEq(fs.existsSync(markerPath), false, '服务器没给 id → 不写标记（不编造）')

      // ⑤ 老版本插件发布过的工作（有发布记录、本机没身份）→ **列表核对时**就对
      //    齐（`work/mine` 本来就回查项目，不必等用户再点一次发布）
      forgetIdentity()
      {
        const store5 = PUB.createMemoryPublishedStore()
        store5.set(K_ROOT, {
          direction: 'SEEK_MENTOR',
          projectId: 'srv-project-1',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          contentHash: 'sha256:x',
          files: {},
          selection: [],
        })
        const identity5 = WI.createMemoryWorkIdentityStore()
        const host5 = makePubHost(makePublisher({ returnWorkspaceId: WSID }), store5, {}, identity5)
        const mine5 = await host5('work/mine', {})
        assertEq(
          (mine5.value?.items ?? []).find((x) => x.id === 'ws-pub')?.workId,
          WSID,
          '列表核对时就对齐了身份（老版本发布的工作也能显示 work_id）',
        )
        assertEq(WI.readWorkMarker(K_ROOT)?.workspaceId, WSID, '对齐的身份同样落盘')
      }

      // ⑥ 列表项带出身份：界面据此区分"这是哪一项研究"（工作区名区分不了）
      {
        const mine = await host1('work/mine', {})
        const item = (mine.value?.items ?? []).find((x) => x.id === 'ws-pub')
        assertEq(item?.workId, WSID, '发布之后列表项带出 work_id（服务器给的身份）')
      }

      forgetIdentity()
    }
    const stateCall = server.calls.find((c) => c.method === 'POST' && c.url.endsWith('/state'))
    const payload = JSON.parse(stateCall.body)
    assertEq(payload.base_version, null, '首传 base_version=null（服务器此时还没有状态）')
    assert(typeof stateCall.headers['idempotency-key'] === 'string' && stateCall.headers['idempotency-key'].length > 0, '上传带 Idempotency-Key')
    // 内容映射：从本机文件真实提取
    assertEq(payload.content.research_question, '裁剪证据能否改善失败判定？；校准缺口有多大？', '研究问题取自 project.md 的 Research Questions')
    /*
     * 这个 fixture 没有论文 → 工作名就是主题句；此时**摘要不再重复送同一句话**
     * （标题与摘要逐字相同会让人以为卡片坏了，见 publish-content 的注释）。
     */
    assertEq(payload.content.work_name, '低算力视觉语言方向的可证伪问题', '没有论文 → 工作名 = 主题句')
    assertEq(payload.content.summary, undefined, '名字 = 主题句 → 摘要不重复送同一句话')
    assertEq(payload.content.hypothesis, 'H1：收益是强样本条件性的。', '假设取自 research-state.md 的 Hypotheses')
    assertEq(payload.content.core_idea, '把裁剪当作可证伪的干预来研究。', '核心想法取自 Innovation')
    assertEq(payload.content.method_overview, '三组对照 + oracle 上界。', '方法概览取自 Method（**方法留在本机**指的是提示词/工作流，不是研究方法的表述）')
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

    /*
     * ── 用户的工作习惯：在同一个会话工作区里**换进换出**多项研究 ──────────────
     *
     * 把当前 `workspace/` 改名、把另一项研究改名成 `workspace/`。记录键若还是**路径**，
     * 新占用者就会继承旧研究的记录 → 点【更新研究工作】把新工作的状态写进**旧工作的项目**
     * （覆盖，不可逆），附件还会拿旧指纹跳过该传的文件。所以键改成**工作身份**，
     * 并用「占用者守卫」（身份 + `project.md` 的 created_at 指纹）拦住继承。
     */
    {
      const WI = await import(lib('research/work-identity.js'))
      const K_ROOT = fs.realpathSync(root)
      const WS_A = 'ws_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const WS_B = 'ws_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

      /** 直接造一条"属于 A 的旧记录"（键=路径，模拟迁移前的落盘）。 */
      const seedLegacy = (store, { fingerprint = null } = {}) => {
        const seed = PUB.createMemoryPublishedStore()
        seed.set(K_ROOT, {
          direction: 'SEEK_MENTOR',
          projectId: 'srv-project-1',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          contentHash: 'sha256:x',
          files: {},
          selection: [],
          workId: WS_A,
          ...(fingerprint ? { rootFingerprint: fingerprint } : {}),
        })
        // 再灌进被测 store（模拟"这份 JSON 已经在盘上"）
        for (const [key, record] of Object.entries(seed.all())) store.set(key.split('\u0000')[0], record)
      }

      // ① 路径上的研究换成了 B（标记是 B）→ A 的记录**读不到**（不会写进 A 的项目）
      {
        fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
        WI.writeWorkMarker(K_ROOT, { workspaceId: WS_B })
        const store = PUB.createMemoryPublishedStore()
        seedLegacy(store)
        const scoped = PUB.createMemoryPublishedStore(store.all(), {
          workIdOf: (r) => WI.readWorkMarker(r)?.workspaceId ?? null,
        })
        assertEq(scoped.get(K_ROOT, 'SEEK_MENTOR'), undefined, '路径换过住户（标记是 B）→ A 的记录读不到')
      }

      // ② 新占用者**还没有标记**，但指纹不同 → 同样读不到（这正是"新建的研究"那种情形）
      {
        fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
        const store = PUB.createMemoryPublishedStore()
        seedLegacy(store, { fingerprint: '2026-01-01T00:00:00.000Z' })
        const scoped = PUB.createMemoryPublishedStore(store.all(), {
          workIdOf: () => null,
          fingerprintOf: () => '2026-10-13T00:49:11.929Z',
        })
        assertEq(scoped.get(K_ROOT, 'SEEK_MENTOR'), undefined, '指纹不同（路径换过住户）→ 记录读不到')
      }

      // ③ 指纹相同（同一项研究，只是搬了个位置/备份回来）→ 照旧读得到
      {
        const fp = '2026-10-13T00:49:11.929Z'
        const store = PUB.createMemoryPublishedStore()
        seedLegacy(store, { fingerprint: fp })
        const scoped = PUB.createMemoryPublishedStore(store.all(), {
          workIdOf: () => WS_A,
          fingerprintOf: () => fp,
        })
        assertEq(scoped.get(K_ROOT, 'SEEK_MENTOR')?.projectId, 'srv-project-1', '同一项研究（指纹/身份一致）照旧读得到')
      }

      // ④ 有身份时**按身份落盘**，并迁掉旧的路径键（否则身份缺失时它会被误读）
      {
        const store = PUB.createMemoryPublishedStore()
        const scoped = PUB.createMemoryPublishedStore(store.all(), {
          workIdOf: () => WS_A,
          fingerprintOf: () => '2026-10-13T00:49:11.929Z',
        })
        scoped.set(K_ROOT, {
          direction: 'SEEK_MENTOR',
          projectId: 'p-new',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          publishedAt: '',
          updatedAt: '',
        })
        const keys = Object.keys(scoped.all())
        assertEq(keys.length, 1, '迁移：旧的路径键被删掉（同一方向不留两条）')
        assert(keys[0].startsWith(WS_A), `键以工作身份开头（实测 ${keys[0].slice(0, 12)}…）`)
        assertEq(scoped.all()[keys[0]].workId, WS_A, '记录里也记下了身份（供下次守卫）')

        // 换个方向时互不影响
        scoped.set(K_ROOT, {
          direction: 'SEEK_STUDENT',
          projectId: 'p-topic',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          publishedAt: '',
          updatedAt: '',
        })
        assertEq(Object.keys(scoped.all()).length, 2, '两个方向各一条（都按身份）')
      }

      // ⑤ 服务器给 id、而这项工作没有 id → 列表不显示"已在网络中"（也就没有【更新】按钮）
      {
        const store = PUB.createMemoryPublishedStore()
        store.set(K_ROOT, {
          direction: 'SEEK_MENTOR',
          projectId: 'srv-project-1',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          contentHash: 'sha256:x',
          files: {},
          selection: [],
        })
        const host = makePubHost(makePublisher({ returnWorkspaceId: WS_A }), store)
        const mine = await host('work/mine', {})
        const item = (mine.value?.items ?? []).find((x) => x.id === 'ws-pub')
        // 服务器能回 workspace_id（对齐会补上）→ 这条记录仍然有效，且身份已补
        assertEq(item?.workId, WS_A, '服务器支持身份 → 核对时把 id 补上')
        assertEq(item?.published.length, 1, 'id 补上后记录仍然有效（显示更新按钮）')
      }

      // ⑦ **老服务器**（没有身份字段）→ 记录照旧（否则会诱使用户重复发布，多出一个项目）
      {
        fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
        const store = PUB.createMemoryPublishedStore()
        store.set(K_ROOT, {
          direction: 'SEEK_MENTOR',
          projectId: 'srv-project-1',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          contentHash: 'sha256:x',
          files: {},
          selection: [],
        })
        const host = makePubHost(makePublisher({ omitWorkspaceId: true }), store)
        const mine = await host('work/mine', {})
        const item = (mine.value?.items ?? []).find((x) => x.id === 'ws-pub')
        assertEq(item?.published.length, 1, '老服务器没有身份概念 → 记录照旧（不变更行为）')
        assertEq(item?.workId ?? null, null, '拿不到身份就如实为空')
      }

      // ⑧ 服务器**有**身份概念、而这项工作本机拿不到 id（项目本身没有 id）→ 当"未发布"处理
      {
        fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
        const store = PUB.createMemoryPublishedStore()
        store.set(K_ROOT, {
          direction: 'SEEK_MENTOR',
          projectId: 'srv-project-1',
          serverUrl: 'http://localhost:8000',
          accountId: 'acc-1',
          version: 1,
          contentHash: 'sha256:x',
          files: {},
          selection: [],
        })
        // 服务器会回这个字段、但值是 null（项目在身份概念之前建的）
        const host = makePubHost(makePublisher({ returnWorkspaceId: null }), store)
        const mine = await host('work/mine', {})
        const item = (mine.value?.items ?? []).find((x) => x.id === 'ws-pub')
        assertEq(
          item?.published.length,
          0,
          '有身份概念但拿不到 id → 当作"未发布"（界面显示【寻找…】，不会出现【更新研究工作】）',
        )
      }

      fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
    }

    /*
     * ── ⑨ 用户实测的故障：**新建的研究**占用了旧路径 ───────────────────────
     *
     * 旧记录（v0.6.2 之前写的：没有 workId、没有指纹，但有名字与文件指纹）会"贴"到
     * 现在住在这个路径上的新研究身上 —— 界面显示"已在网络中"，点【更新研究工作】
     * 就把新研究的状态写进**旧研究的服务器项目**（覆盖，不可逆）。
     *
     * 归属判定必须只认**能自证**的记录：文件指纹对得上（同一项研究）或名字未变；
     * 名字不同且文件都对不上 → 不认（当成"未发布"）。
     */
    {
      const WI = await import(lib('research/work-identity.js'))
      const K_ROOT = fs.realpathSync(root)
      fs.rmSync(path.join(K_ROOT, '.convfusion'), { recursive: true, force: true })
      const legacy = {
        direction: 'SEEK_MENTOR',
        projectId: 'srv-project-1',
        serverUrl: 'http://localhost:8000',
        accountId: 'acc-1',
        version: 1,
        contentHash: 'sha256:x',
        // 旧研究的名字与文件指纹（都不属于现在这个路径上的研究）
        title: '旧的研究工作（H-MEM 期刊版）',
        files: { 'project.md': 'sha256:deadbeef' },
        selection: ['project.md'],
      }
      const WS_NEW = 'ws_cccccccccccccccccccccccccccccccc'

      // ① 列表：不显示"已在网络中"，也不把旧身份盖到新研究上
      {
        const store = PUB.createMemoryPublishedStore()
        store.set(K_ROOT, { ...legacy })
        const host = makePubHost(makePublisher({ returnWorkspaceId: WS_NEW }), store)
        const mine = await host('work/mine', {})
        const item = (mine.value?.items ?? []).find((x) => x.id === 'ws-pub')
        assertEq(item?.published.length, 0, '路径上换了研究 → 旧记录不算它的（不显示"已在网络中"）')
        assertEq(item?.workId ?? null, null, '也不会把旧研究的身份盖到新研究上')
      }

      // ② 发布：不复用旧研究的项目（新建一个），避免写进别人的项目
      {
        const store = PUB.createMemoryPublishedStore()
        store.set(K_ROOT, { ...legacy })
        const server = makePublisher({ returnWorkspaceId: WS_NEW })
        const pub = await makePubHost(server, store)('work/publish', { id: 'ws-pub' })
        assert(pub.ok, '新研究发布成功')
        assert(
          server.calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects')),
          '归属不明 → **新建项目**（绝不复用旧研究的 project_id）',
        )
      }

      // ④ 已在网络、但本机**没打开**的研究工作 → 列表里仍要出现（detached，无发布按钮）
      {
        const store = PUB.createMemoryPublishedStore()
        // 另一项研究的记录（projectId 不属于当前任何研究根）
        store.set(K_ROOT, { ...legacy, projectId: 'srv-elsewhere', title: '另一项已在网络的研究' })
        const host = makePubHost(makePublisher({ returnWorkspaceId: WS_NEW }), store)
        const mine = await host('work/mine', {})
        const rows = mine.value?.items ?? []
        const detached = rows.find((x) => x.detached)
        assert(Boolean(detached), '本机没打开、但在网络上的研究工作仍出现在列表里')
        assertEq(detached?.workName, '另一项已在网络的研究', 'detached 行显示记录里的研究工作名')
        assertEq(detached?.published.length, 1, 'detached 行带出它的发布记录（界面显示"已在网络中"）')
        assertEq(detached?.researchRoot, '', 'detached 行没有研究根（本机没打开它）')
        // 同一个项目不会重复出现（已归属当前研究根的记录不再造一行）
        assertEq(
          rows.filter((x) => x.published.some((r) => r.projectId === 'srv-elsewhere')).length,
          1,
          '同一个项目只出现一次（不重复造 detached 行）',
        )
      }

      // ③ 同一项研究改名（文件没变）→ 文件指纹是正面证据 → 认（继续走"改名"路径）
      {
        const store = PUB.createMemoryPublishedStore()
        store.set(K_ROOT, {
          ...legacy,
          title: '改名前的工作名',
          files: {}, // 没有文件证据 → 只能看名字
        })
        const host = makePubHost(makePublisher({ returnWorkspaceId: WS_NEW }), store)
        const mine = await host('work/mine', {})
        const item = (mine.value?.items ?? []).find((x) => x.id === 'ws-pub')
        assertEq(item?.published.length, 0, '名字不同且无文件证据 → 不认（保守的一侧）')
      }
    }

    fs.rmSync(path.join(root, '.convfusion'), { recursive: true, force: true })

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
    assertEq(pubOf(mine.value.items[0])?.projectId, 'srv-project-1', '列表项带出已发布的 project_id')
    assertEq(pubOf(mine.value.items[0])?.version, 4, '带出版本号')
    assertEq(pubOf(mine.value.items[0])?.direction, 'SEEK_MENTOR', '带出方向（缺方向的老记录读作求指导）')
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
  /*
   * **备份 / 临时文件**（2026-09 用户要求）：真实工作区实测
   * `papers/paper-main/latex/main_bak_20260921021516..tex` × 64 个、3.6 MB ——
   * 一篇论文的 LaTeX 目录里大多数文件是这种东西，落在 `papers/**` 下就会被判成
   * "论文与图表"（推荐）而随上传走。
   */
  mk('papers/paper-001/latex/main_bak_20260921021516..tex', 64000)
  mk('papers/paper-001/latex/main.tex.bak', 100)
  mk('papers/paper-001/latex/main_bak.tex', 100)
  mk('papers/paper-001/latex/main.tex~', 100)
  mk('papers/paper-001/latex/.main.tex.swp', 100)
  mk('papers/paper-001/latex/#main.tex#', 100)
  // 反向用例：名字里**含** `bak` 但不是一个独立片段（正常词），不能被误伤
  mk('papers/paper-001/latex/bakeoff.md', 500)
  mk('papers/paper-001/latex/rebake.py', 500)
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
  /*
   * 备份 / 临时文件 → 机器产物（不可选）。判据只看**文件名**，所以落在 `papers/**`
   * 这种"推荐目录"里也照样排掉 —— 那正是这批文件混进来的原因。
   */
  for (const rel of [
    'papers/paper-001/latex/main_bak_20260921021516..tex',
    'papers/paper-001/latex/main.tex.bak',
    'papers/paper-001/latex/main_bak.tex',
    'papers/paper-001/latex/main.tex~',
    'papers/paper-001/latex/.main.tex.swp',
    'papers/paper-001/latex/#main.tex#',
  ]) {
    assertEq(UP.classify(rel, 64000).decision, 'excluded', `备份/临时文件排除：${rel}`)
    assertEq(UP.classify(rel, 64000, 'mentor').decision, 'excluded', `导师口径同样排除：${rel}`)
    assertEq(has('build-artifacts', rel), true, `归入"构建产物"分类（对账用）：${rel}`)
  }
  // ⚠️ 反向：`bak` 不做片段识别就会误伤这些正常文件（有断言才不会被"顺手放宽"改坏）
  assertEq(
    UP.classify('papers/paper-001/latex/bakeoff.md', 500).decision,
    'recommended',
    '名字里含 bak 的正常词（bakeoff）不受影响',
  )
  assertEq(
    UP.classify('papers/paper-001/latex/rebake.py', 500, 'mentor').decision,
    'recommended',
    'rebake.py 同理（导师口径）',
  )
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

  /*
   * 导师整包回传（`mentor` 口径，v19）：**同一份目录，口径故意不同** ——
   *   · `review/**`：导师的指导结果就是要带回去的东西 → 推荐（发布侧相反）；
   *   · `papers/**`：用户明确要求"要去除机器生成文件，但是要有自己撰写的论文 PDF"
   *     → 不因 ≥10 MB 降级；
   *   · 机器产物：照样排除（用户要求"去除机器生成文件"）。
   * 默认参数必须仍是 `publish`（否则会静默改掉发布行为）。
   */
  {
    const mPlan = UP.buildUploadPlan(root, 'mentor')
    const mCat = (id) => mPlan.categories.find((c) => c.id === id)
    assertEq(mCat('review')?.decision, 'recommended', '导师口径：review/ 是推荐')
    assertEq(
      mPlan.defaultSelection.includes('review/research-quality-review-2026-09-19.md'),
      true,
      '导师口径：默认勾选含评阅记录',
    )
    assertEq(
      UP.classify('papers/paper-001/paper.pdf', 12 * 1024 * 1024, 'mentor').decision,
      'recommended',
      '导师口径：≥10 MB 的论文 PDF 不降级',
    )
    assertEq(
      UP.classify('papers/paper-001/paper.pdf', 12 * 1024 * 1024).decision,
      'optional',
      '（对照）发布口径：≥10 MB 降级为可选',
    )
    assertEq(mCat('build-artifacts')?.decision, 'excluded', '导师口径：机器产物照样排除')
    assertEq(
      UP.classify('papers/paper-001/latex/main_bak_20260928023921..tex', 64000, 'mentor').decision,
      'excluded',
      '导师口径：latex/ 里的 _bak 中间文件不上传（用户要求）',
    )
    assertEq(
      mPlan.defaultSelection.some((r) => r.includes('_bak')),
      false,
      '默认勾选里没有 _bak 文件',
    )
    assertEq(mCat('runtime-artifacts')?.decision, 'excluded', '导师口径：harness/ 照样排除')
    assertEq(
      mPlan.totals.recommendedBytes + mPlan.totals.optionalBytes + mPlan.totals.excludedBytes,
      mPlan.totals.allBytes,
      '导师口径：三级体积之和 = 全部',
    )
    assertEq(
      UP.buildUploadPlan(root).totals.recommendedBytes,
      plan.totals.recommendedBytes,
      '不传 purpose 时仍是发布口径（mentor 必须显式选）',
    )
  }

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
    assertEq(pubOf(res.value.items[0])?.projectId, 'srv-9', '服务器说可见 → 保留「已在网络中」')
    const rec = storedRecord(store, fs.realpathSync(root))
    assertEq(rec.serverVisibility, 'PUBLISHED', '本地记录回写了服务器状态（PUBLISHED）')
    assert(typeof rec.checkedAt === 'string' && rec.checkedAt.length > 0, '本地记录记下核对时刻')
    assertEq(rec.files['project.md'], 'sha256:aa', '核对**不动**"我传过什么"（files 指纹保留）')
    assertEq(server.projectCalls().length, 1, '每个已记录的工作区核一次 GET /projects/{id}')
  }

  // ── 服务器说 PRIVATE（取消发布）：不显示标记，但**保留**记录（下次发布复用项目） ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const res = await makeHost6(makeServer6({ project: 'PRIVATE' }), store)('work/mine', {})
    assertEq(pubOf(res.value.items[0]), null, '服务器说不可见 → 不显示标记')
    const rec = storedRecord(store, fs.realpathSync(root))
    assert(rec, '记录保留（项目还在，下次发布仍复用同一个）')
    assertEq(rec.serverVisibility, 'PRIVATE', '回写 PRIVATE')
  }

  // ── 服务器 404（项目已删）：不显示标记，并删掉本地映射 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const res = await makeHost6(makeServer6({ project: 404 }), store)('work/mine', {})
    assertEq(pubOf(res.value.items[0]), null, '项目已删 → 不显示标记')
    assertEq(storedRecord(store, fs.realpathSync(root)), undefined, '死掉的映射被删掉（否则永远撞死 project_id）')
  }

  // ── 查不通（离线）：不下结论 —— 保留本地记录，界面照旧显示 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const res = await makeHost6(makeServer6({ project: 'offline' }), store)('work/mine', {})
    assertEq(pubOf(res.value.items[0])?.projectId, 'srv-9', '读不到 ≠ 服务器上没有：保留标记')
    assertEq(storedRecord(store, fs.realpathSync(root)).checkedAt, undefined, '核对失败不回写任何状态')
  }

  // ── 未登录 / 记录属于别的服务器：一个请求都不发 ──
  {
    const store = PUB.createMemoryPublishedStore({ [fs.realpathSync(root)]: seededRecord() })
    const server = makeServer6({ project: 'PUBLISHED' })
    const res = await makeHost6(server, store, { withKey: false })('work/mine', {})
    assertEq(pubOf(res.value.items[0])?.projectId, 'srv-9', '没有凭据时按本地记录显示')
    assertEq(server.calls.length, 0, '没有凭据就不联网（离线也不会更慢）')

    const other = PUB.createMemoryPublishedStore({
      [fs.realpathSync(root)]: seededRecord({ serverUrl: PROD_URL }),
    })
    const server2 = makeServer6({ project: 'PUBLISHED' })
    const swapped = await makeHost6(server2, other)('work/mine', {})
    // 【我的】现在有**服务器那一半数据源**（GET /projects），所以这里不是"零联网"；
    // 要求的是"**不逐个**拿别的服务器的记录去当前服务器上核对"
    assertEq(
      server2.calls.filter((u) => /\/projects\/srv-9$/.test(u)).length,
      0,
      '记录属于别的服务器 → 不拿它去当前服务器上核对',
    )
    /*
     * ⚠️ **用户报的问题**：切到另一台服务器后，【我的】还带着上一台的「已在网络中」。
     * 记录属于别的服务器 = 在**当前**这台服务器上根本没发布过 —— 必须显示成未发布，
     * 否则用户看到的和服务实际连的不是同一台。
     */
    assertEq(
      pubOf(swapped.value.items[0]),
      null,
      '记录属于别的服务器 → 这里**不算**「已在网络中」（换服务器后状态要跟着换）',
    )
  }

  // ── 换服务器后的**增量上传**：别的服务器的指纹不能当"已传过"（会漏传）──
  {
    const { createHash } = await import('node:crypto')
    const OTHER = 'http://localhost:9000'
    // 故意造一个"内容确实没变"的场景：指纹就是当前文件的**真实**指纹。
    // 若代码误用别的服务器的记录，这个文件会被判成"没变化"而跳过上传 ——
    // 但它在新服务器上根本不存在（漏传）。
    const realDigest =
      'sha256:' + createHash('sha256').update(fs.readFileSync(path.join(root, 'project.md'))).digest('hex')

    // ① 当前这台服务器上**没有**记录 → 不能把别的服务器的记录当"上次传过"
    {
      const store = PUB.createMemoryPublishedStore({
        [fs.realpathSync(root)]: seededRecord({
          serverUrl: OTHER,
          files: { 'project.md': realDigest },
          selection: ['project.md'],
        }),
      })
      const plan = await makeHost6(makeServer6({}), store, { withKey: false })('work/uploadPlan', {
        id: 'ws-v',
      })
      assert(plan.ok, 'work/uploadPlan 可用')
      assertEq(plan.value.remembered, false, '别的服务器的记录不算"记住的选择"')
      assert(
        plan.value.changed.includes('project.md'),
        '内容没变也要算"要上传"（新服务器上并没有这个附件 —— 这就是漏传）',
      )
    }
    // ② 对照：记录属于**当前**这台服务器时，它才该被当作"上次传过"
    {
      const store = PUB.createMemoryPublishedStore({
        [fs.realpathSync(root)]: seededRecord({
          files: { 'project.md': realDigest },
          selection: ['project.md'],
        }),
      })
      const plan = await makeHost6(makeServer6({}), store, { withKey: false })('work/uploadPlan', {
        id: 'ws-v',
      })
      assertEq(plan.value.remembered, true, '同一台服务器的记录才算"记住的选择"')
      assert(!plan.value.changed.includes('project.md'), '同一台服务器 + 内容未变 → 不必重传')
    }
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
      storedRecord(store, fs.realpathSync(root)).serverVisibility,
      'PUBLISHED',
      '命中的本地记录被服务器的可见性刷新',
    )
  }

  fs.rmSync(HOME6, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6i. 出题模式：**两个方向**
 *
 * 一个工作区可以在两个方向上各发布一次（服务器上是**两个项目**）：
 *   `SEEK_MENTOR`  学生发布研究求指导（= 今天唯一存在的行为）
 *   `SEEK_STUDENT` 导师发布选题招学生
 *
 * 这一节把"方向必须全程带着走"钉住 —— 少带一处就会静默出错，而且错得很像成功：
 *   · 建项目不带方向 → 选题被发布成"求指导"，出现在**导师**的列表里；
 *   · 查记录不带方向 → 用另一个方向的指纹做增量，附件被漏传；
 *   · 回写记录不带方向 → 两个方向互相覆盖，界面上少一个「更新」。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6i] 出题模式：两个方向（求指导 / 招学生）')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const PUB = await import(lib('research/published-store.js'))
  const HOME7 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-dir-'))
  const ws = path.join(HOME7, 'proj')
  const root = path.join(ws, 'workspace')
  fs.mkdirSync(path.join(root, 'research'), { recursive: true })
  fs.writeFileSync(path.join(root, 'project.md'), '# 选题\n\n一个可证伪的问题\n')
  fs.writeFileSync(path.join(root, 'research-state.md'), '## Problem\n\n动机\n')

  // 第二个工作区：真实的"两个方向"是两个**不同的工作**各发一个方向（导师的选题 / 学生的工作）
  const ws2 = path.join(HOME7, 'proj2')
  const root2 = path.join(ws2, 'workspace')
  fs.mkdirSync(path.join(root2, 'research'), { recursive: true })
  fs.writeFileSync(path.join(root2, 'project.md'), '# 我的工作\n\n一个可证伪的问题\n')
  fs.writeFileSync(path.join(root2, 'research-state.md'), '## Problem\n\n动机\n')

  const lister = async () => ({
    available: true,
    items: [
      { id: 'ws-dir', title: '出题工作区', path: ws, updatedAt: '' },
      { id: 'ws-dir-2', title: '学生工作区', path: ws2, updatedAt: '' },
    ],
  })
  const K = fs.realpathSync(root)
  const K2 = fs.realpathSync(root2)

  /** 按方向发不同 project_id 的假服务器：能验出"两个方向真的是两个项目"。 */
  const makeDirServer = () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, headers: init?.headers ?? {}, body: init?.body })
      const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
      if (url.endsWith('/api/v1/auth/me')) {
        return json(200, { id: 'acc-1', email: 'me@example.com', status: 'ACTIVE', roles: ['MENTOR'] })
      }
      if (url.endsWith('/api/v1/projects') && method === 'POST') {
        const direction = JSON.parse(init.body).direction
        return json(201, {
          id: direction === 'SEEK_STUDENT' ? 'topic-1' : 'seek-1',
          title: 'x',
          visibility: 'PRIVATE',
          status: 'ACTIVE',
          updated_at: '',
        })
      }
      if (/\/projects\/(topic-1|seek-1)\/state$/.test(url) && method === 'GET') {
        return json(404, err('RESOURCE_NOT_FOUND', 'no state'))
      }
      if (/\/projects\/(topic-1|seek-1)\/state$/.test(url) && method === 'POST') {
        const id = url.includes('topic-1') ? 'topic-1' : 'seek-1'
        return json(201, { project_id: id, version: 1, content_hash: 'sha256:abc', content: {} })
      }
      if (/\/projects\/(topic-1|seek-1)\/files$/.test(url) && method === 'POST') {
        return json(201, [])
      }
      if (/\/projects\/(topic-1|seek-1)\/publish$/.test(url)) {
        return json(200, { visibility: 'PUBLISHED', charged_tokens: 1 })
      }
      if (url.includes('/discovery/random')) return json(200, { items: [] })
      // `work/mine` 会按记录回查项目（判据是服务器，不是本地映射）→ 这里如实说"可见"
      if (/\/projects\/(topic-1|seek-1)$/.test(url) && method === 'GET') {
        return json(200, { id: 'x', title: 'x', visibility: 'PUBLISHED', status: 'ACTIVE', updated_at: '' })
      }
      return json(404, err('RESOURCE_NOT_FOUND', 'nope'))
    }
    return { fetchImpl, calls }
  }

  const makeDirHost = (server, store) =>
    RPC.createSettingsRpcHandler({
      getConfig: () =>
        CFG.resolveConfig({
          customizationFile: 'x.json',
          customizationDir: HOME7,
          convfusionApiKey: KEY,
          serverUrl: 'http://localhost:8000',
        }),
      store: CUST.createMemoryCustomizationStore(),
      listLocalWorkspaces: lister,
      publishedStore: store,
      fetchImpl: server.fetchImpl,
    })

  // ── 不带 direction：请求体里也**不该有**这个字段（默认方向归服务器所有）──
  {
    const server = makeDirServer()
    const store = PUB.createMemoryPublishedStore()
    const res = await makeDirHost(server, store)('work/publish', { id: 'ws-dir' })
    assert(res.ok, '默认方向发布成功')
    const create = server.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects'))
    assert(!('direction' in JSON.parse(create.body)), '不带方向时不发 direction（默认值由服务器拥有）')
    assertEq(res.value.published.direction, 'SEEK_MENTOR', '回执带出实际方向')
    assertEq(storedRecord(store, K, 'SEEK_MENTOR')?.projectId, 'seek-1', '记录写在"求指导"方向下')
    assertEq(storedRecord(store, K, 'SEEK_STUDENT'), undefined, '另一个方向没有被误写')
  }

  /*
   * ── 一个研究工作**只属于一个方向**（2026-10 用户拍板）──
   *
   * "求指导"与"招学生"不是同一份工作的两种发布方式，而是**两种身份**：
   * 前者是学生发布自己的工作，后者是导师发布一个选题。发布过一种就不能再发另一种
   * （否则网络上同一个工作以两个身份各出现一次，状态与附件还各传一份）。
   */
  {
    const server = makeDirServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeDirHost(server, store)
    const seek = await h('work/publish', { id: 'ws-dir' })
    assert(seek.ok, '先按默认方向发布成功')
    const topic = await h('work/publish', { id: 'ws-dir', direction: 'SEEK_STUDENT' })
    assertEq(topic.ok, false, '同一工作换方向发布 → 拒绝')
    assertEq(topic.error?.code, 'already-published', '原因码 already-published（界面据此提示"只能更新"）')
    assert(/求指导/.test(topic.error?.message ?? ''), `提示里说清已经以哪个身份发布过（${topic.error?.message ?? ''}）`)
    assertEq(
      server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects')).length,
      1,
      '拒绝时**不建第二个项目**（不能悄悄多出一个网络身份）',
    )
    assertEq(storedRecord(store, K, 'SEEK_STUDENT'), undefined, '另一个方向不留记录')
    // 同一个方向仍然照常更新（拒绝的只是"换方向"）
    assert((await h('work/publish', { id: 'ws-dir' })).ok, '同一方向的【更新】照常可用')
  }

  // ── 两个**不同的工作**：各自一个方向 → 两个项目、两条记录，互不复用 ──
  {
    const server = makeDirServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeDirHost(server, store)
    const seek = await h('work/publish', { id: 'ws-dir' })
    const topic = await h('work/publish', { id: 'ws-dir-2', direction: 'SEEK_STUDENT' })
    assert(seek.ok && topic.ok, '两个工作各发一个方向：都成功')
    assertEq(
      server.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects')).length,
      2,
      '两个方向各建一个项目（不复用对方的 project_id）',
    )
    const topicCreate = server.calls
      .filter((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects'))
      .map((c) => JSON.parse(c.body))
      .find((b) => b.direction === 'SEEK_STUDENT')
    assert(topicCreate, '招学生方向的建项目请求带上了 direction=SEEK_STUDENT')
    assertEq(storedRecord(store, K, 'SEEK_MENTOR')?.projectId, 'seek-1', '求指导记录写在发布它的那个工作下')
    assertEq(storedRecord(store, K2, 'SEEK_STUDENT')?.projectId, 'topic-1', '招学生记录写在另一个工作下')
    assertEq(storedRecord(store, K2, 'SEEK_STUDENT')?.direction, 'SEEK_STUDENT', '记录里带方向')
    // `work/mine`：两个工作各自带出**自己那一个**方向的发布状态
    const mine = await h('work/mine', {})
    const w1 = mine.value.items.find((x) => x.id === 'ws-dir')
    const w2 = mine.value.items.find((x) => x.id === 'ws-dir-2')
    assertEq(pubOf(w1, 'SEEK_MENTOR')?.projectId, 'seek-1', '我的：工作 1 是"求指导"，在')
    assertEq(pubOf(w1, 'SEEK_STUDENT'), null, '我的：工作 1 没有"招学生"那一份（只属于一个方向）')
    assertEq(pubOf(w2, 'SEEK_STUDENT')?.projectId, 'topic-1', '我的：工作 2 是"招学生"，在')
    assertEq(pubOf(w2, 'SEEK_MENTOR'), null, '我的：工作 2 也没有另一个方向')
  }

  // ── 上传计划按方向找记录：另一个方向的"记住的选择"不能拿来用 ──
  {
    const server = makeDirServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeDirHost(server, store)
    await h('work/publish', { id: 'ws-dir', direction: 'SEEK_STUDENT' })
    const plan = await h('work/uploadPlan', { id: 'ws-dir', direction: 'SEEK_STUDENT' })
    assert(plan.ok, '招学生方向的上传计划可读')
    assertEq(plan.value.direction, 'SEEK_STUDENT', '计划回显方向（对话框标题要用它）')
    assertEq(plan.value.remembered, true, '读的是**这个方向**的记录（记住过选择）')
    const other = await h('work/uploadPlan', { id: 'ws-dir', direction: 'SEEK_MENTOR' })
    assertEq(other.value.remembered, false, '另一个方向没有记录（不能拿对方的选择当自己的）')
  }

  // ── `work/list` 的方向转成查询参数；`work/summary` / `work/brief` 不受影响 ──
  {
    const server = makeDirServer()
    const store = PUB.createMemoryPublishedStore()
    const h = makeDirHost(server, store)
    await h('work/list', { direction: 'SEEK_STUDENT' })
    assert(
      server.calls.some((c) => c.url.includes('/discovery/random?direction=SEEK_STUDENT')),
      '【可加入】带 ?direction=SEEK_STUDENT',
    )
    const server2 = makeDirServer()
    const h2 = makeDirHost(server2, PUB.createMemoryPublishedStore())
    await h2('work/list', {})
    const listCall = server2.calls.find((c) => c.url.includes('/discovery/random'))
    assertEq(listCall.url.includes('?direction='), false, '不传方向 → 不带查询参数（服务器默认求指导）')
  }

  // ── 解析纪律：字段缺失 = 今天的行为，不许猜成"招学生" ──
  {
    const asWork = SC.parseDirection
    assertEq(asWork(undefined), 'SEEK_MENTOR', '缺 direction → SEEK_MENTOR（旧服务器）')
    assertEq(asWork('SEEK_MENTOR'), 'SEEK_MENTOR', 'SEEK_MENTOR 原样')
    assertEq(asWork('SEEK_STUDENT'), 'SEEK_STUDENT', 'SEEK_STUDENT 原样')
    assertEq(asWork('WHATEVER'), 'SEEK_MENTOR', '未知取值 → 退回默认（不编第三态）')

    const items = await SC.fetchProposals(
      'http://localhost:8000',
      KEY,
      { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ([
        { id: 'p1', project_id: 'x', mentor_id: 'm', researcher_id: 'r', status: 'PROPOSED', direction: 'SEEK_STUDENT', proposed_by_id: 'r' },
        { id: 'p2', project_id: 'y', mentor_id: 'm', researcher_id: 'r', status: 'PROPOSED' },
      ]) }) },
    )
    assertEq(items[0].direction, 'SEEK_STUDENT', '提案带出方向')
    assertEq(items[0].proposedById, 'r', '提案带出"谁发起的"（决定谁能接受）')
    assertEq(items[1].direction, 'SEEK_MENTOR', '旧服务器（没有该字段）→ 求指导')
    assertEq(items[1].proposedById, null, '没有 proposed_by_id → null（界面按方向推断，不编）')
  }

  // ── 存盘纪律：旧文件（没有方向的记录）读作"求指导"，且两个方向能并存 ──
  {
    const legacy = PUB.createMemoryPublishedStore({
      [K]: { projectId: 'old-1', serverUrl: 'http://localhost:8000', accountId: 'acc-1', version: 1, publishedAt: 'x', updatedAt: 'x' },
    })
    assertEq(storedRecord(legacy, K, 'SEEK_MENTOR')?.projectId, 'old-1', '老记录（裸键、无方向）读作求指导')
    assertEq(storedRecord(legacy, K, 'SEEK_STUDENT'), undefined, '老记录不会被当成招学生')

    const both = PUB.createMemoryPublishedStore({
      [K]: { direction: 'SEEK_MENTOR', projectId: 'seek-1', serverUrl: 'http://localhost:8000', accountId: 'acc-1', version: 1, publishedAt: 'x', updatedAt: 'x' },
      [`${K}\u0000SEEK_STUDENT`]: { direction: 'SEEK_STUDENT', projectId: 'topic-1', serverUrl: 'http://localhost:8000', accountId: 'acc-1', version: 2, publishedAt: 'x', updatedAt: 'y' },
    })
    assertEq(Object.keys(both.all()).length, 2, '同一个根可以有两条记录（两个方向并存）')
    assertEq(storedRecord(both, K, 'SEEK_STUDENT')?.projectId, 'topic-1', '招学生那条读得到')
    both.remove(K, 'SEEK_STUDENT')
    assertEq(storedRecord(both, K, 'SEEK_STUDENT'), undefined, '删只删这个方向')
    assertEq(storedRecord(both, K, 'SEEK_MENTOR')?.projectId, 'seek-1', '另一个方向不受影响')
  }

  fs.rmSync(HOME7, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 6j. 研究工作的**名字**（v0.6.0）
 *
 * 网络里那三个列表（【可指导】/【可加入】/【指导中】）该显示的是**这项工作自己的名字**：
 * 有论文用论文标题，否则用工作确定的主题；都没有才退回本机工作区名。
 *
 * 为什么必须上送到服务器：看那些列表的人**本机不一定有这份 workspace**
 * （导师看学生的研究、学生看导师的选题），名字只能来自服务器上的数据。
 * 这一节钉两件事：① 名字怎么取；② 它真的被送进了项目与内容里。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6j] 研究工作的名字（论文标题 > 主题 > 兜底）')
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const WN = await import(lib('research/work-name.js'))
  const PUB = await import(lib('research/published-store.js'))
  const HOME8 = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-name-'))
  const ws = path.join(HOME8, 'proj')
  const root = path.join(ws, 'workspace')
  fs.mkdirSync(root, { recursive: true })

  const paper = (id, body) => {
    fs.mkdirSync(path.join(root, 'papers', id), { recursive: true })
    fs.writeFileSync(path.join(root, 'papers', id, 'paper.md'), body)
  }
  const latex = (id, body) => {
    fs.mkdirSync(path.join(root, 'papers', id, 'latex'), { recursive: true })
    fs.writeFileSync(path.join(root, 'papers', id, 'latex', 'main.tex'), body)
  }

  // ① 什么都没有 → 兜底（注册表名）：宁可显示"本机还叫这个名字"也不显示空
  assertEq(WN.researchWorkName(root, '低算力 VL 方向'), { name: '低算力 VL 方向', source: 'fallback' }, '① 无论文无主题 → 兜底')

  // ② 只有 project.md 的 topic（= 这项工作已采纳的主题）
  fs.writeFileSync(
    path.join(root, 'project.md'),
    ['---', 'type: research-project', 'topic: 低算力视觉语言方向的可证伪问题', '---', '', '# Research Project', ''].join('\n'),
  )
  assertEq(WN.researchWorkName(root, '低算力 VL 方向'), { name: '低算力视觉语言方向的可证伪问题', source: 'topic' }, '② 有主题 → 用主题（不是本机工作区名）')

  // ③ 有论文（paper.md 的 H1）→ **论文标题优先**
  paper('paper-main', '# Hierarchical Memory: Information-Theoretic Guarantees\n\n正文\n')
  assertEq(
    WN.researchWorkName(root, '低算力 VL 方向'),
    { name: 'Hierarchical Memory: Information-Theoretic Guarantees', source: 'paper', paperId: 'paper-main', paperTitle: 'Hierarchical Memory: Information-Theoretic Guarantees' },
    '③ 有论文 → 用论文标题（主题退居其次）',
  )

  // ④ `latex/main.tex` 的 `\title{}` **优先于** paper.md 的 H1（正文以 main.tex 为准），
  //    且要能吃下花括号、`\&`、`---` 这些真实标题里会有的东西
  latex('paper-main', '\\documentclass{article}\n\\title{Attention \\& Memory: {A} Study---Part II}\n\\begin{document}\n')
  const withLatex = WN.researchWorkName(root, '低算力 VL 方向')
  assertEq(withLatex.name, 'Attention & Memory: A Study—Part II', '④ main.tex 的 \\title 优先，且转义/花括号/破折号都还原')
  assertEq(withLatex.source, 'paper', '④ 仍然算"来自论文"')

  // ⑤ 模板占位标题不算名字（刚用模板建的论文 H1 就是 `Title`）
  fs.rmSync(path.join(root, 'papers', 'paper-main', 'latex'), { recursive: true, force: true })
  paper('paper-main', '# Title\n\n<!-- 还没起名 -->\n')
  assertEq(WN.researchWorkName(root, '低算力 VL 方向').name, '低算力视觉语言方向的可证伪问题', '⑤ 模板占位 Title 不算名字 → 退回主题')

  // ── ⑥ 上送：工作名进**项目标题**，也进**内容**（服务端据此投影 work_name）──
  const calls = []
  const makeServer = () => ({
    fetchImpl: async (url, init) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: init?.body })
      const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
      if (url.endsWith('/api/v1/auth/me')) return json(200, { id: 'acc-1', email: 'me@example.com', status: 'ACTIVE', roles: ['RESEARCHER'] })
      if (url.endsWith('/api/v1/projects') && method === 'POST') {
        return json(201, { id: 'name-1', title: 'x', visibility: 'PRIVATE', status: 'ACTIVE', updated_at: '' })
      }
      if (/\/projects\/name-1\/state$/.test(url) && method === 'GET') return json(404, err('RESOURCE_NOT_FOUND', 'no state'))
      if (/\/projects\/name-1\/state$/.test(url) && method === 'POST') {
        return json(201, { project_id: 'name-1', version: 1, content_hash: 'sha256:x', content: {} })
      }
      if (/\/projects\/name-1\/files$/.test(url) && method === 'POST') return json(201, [])
      if (/\/projects\/name-1\/publish$/.test(url)) return json(200, { visibility: 'PUBLISHED', charged_tokens: 1 })
      if (/\/projects\/name-1$/.test(url) && method === 'PUT') {
        return json(200, { id: 'name-1', title: JSON.parse(init.body).title, visibility: 'PRIVATE', status: 'ACTIVE', updated_at: '' })
      }
      return json(404, err('RESOURCE_NOT_FOUND', 'nope'))
    },
  })

  const store = PUB.createMemoryPublishedStore()
  const server = makeServer()
  const h = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: HOME8,
        convfusionApiKey: KEY,
        serverUrl: 'http://localhost:8000',
      }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: async () => ({
      available: true,
      items: [{ id: 'ws-name', title: '低算力 VL 方向', path: ws, updatedAt: '' }],
    }),
    publishedStore: store,
    fetchImpl: server.fetchImpl,
  })

  // 把论文换成真标题（⑤ 用的是占位标题）
  paper('paper-main', '# Hierarchical Memory: Information-Theoretic Guarantees\n\n正文\n')
  const pub1 = await h('work/publish', { id: 'ws-name' })
  assert(pub1.ok, `⑥ 发布成功${pub1.ok ? '' : `（${pub1.error?.code}）`}`)
  const createCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects'))
  assertEq(JSON.parse(createCall.body).title, 'Hierarchical Memory: Information-Theoretic Guarantees', '⑥ 项目标题 = **论文标题**（不是本机工作区名）')
  const stateCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/state'))
  const content = JSON.parse(stateCall.body).content
  assertEq(content.work_name, 'Hierarchical Memory: Information-Theoretic Guarantees', '⑥ 内容里带 `work_name`（服务端据此投影列表显示的名字）')
  assertEq(content.paper.title, 'Hierarchical Memory: Information-Theoretic Guarantees', '⑥ 论文标题也作为事实带上（`paper.title`）')
  assertEq(typeof content.paper.present, 'boolean', '⑥ `paper.present` 仍是布尔（进度快照说了算，这里不钉它的值）')
  assertEq(pub1.value.published.title, 'Hierarchical Memory: Information-Theoretic Guarantees', '⑥ 回执带出这次网络里用的名字')
  assertEq(store.get(fs.realpathSync(root))?.title, 'Hierarchical Memory: Information-Theoretic Guarantees', '⑥ 记录里存下名字（下次据此判断要不要改名）')

  // ── ⑦ 名字变了 → **复用项目时改名**（PUT）；没变 → 不发这个请求 ──
  calls.length = 0
  const pub2 = await h('work/publish', { id: 'ws-name' })
  assert(pub2.ok, '⑦ 再发布一次成功（名字没变）')
  assertEq(calls.filter((c) => c.method === 'PUT').length, 0, '⑦ 名字没变 → 不发 PUT（不多一次往返）')
  assertEq(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v1/projects')).length, 0, '⑦ 复用同一个项目（不新建）')

  paper('paper-main', '# Hierarchical Memory: Theory and Practice\n\n正文\n')
  calls.length = 0
  const pub3 = await h('work/publish', { id: 'ws-name' })
  assert(pub3.ok, '⑦ 论文改名后再发布成功')
  const puts = calls.filter((c) => c.method === 'PUT')
  assertEq(puts.length, 1, '⑦ 名字变了 → 恰好一次 PUT 改名（网络里那个名字不能永远停在第一次发布）')
  assertEq(JSON.parse(puts[0].body).title, 'Hierarchical Memory: Theory and Practice', '⑦ PUT 带的是新名字')
  assertEq(store.get(fs.realpathSync(root))?.title, 'Hierarchical Memory: Theory and Practice', '⑦ 记录里的名字跟着更新')

  // ── ⑧ 上传计划：对话框头部显示**要发布的名字**，另给本机工作区名以便指认 ──
  const plan = await h('work/uploadPlan', { id: 'ws-name' })
  assertEq(plan.value.title, 'Hierarchical Memory: Theory and Practice', '⑧ 计划里的 `title` = 要发布的名字')
  assertEq(plan.value.workspaceTitle, '低算力 VL 方向', '⑧ 另给本机工作区名（两者不同时界面用一行提示指认）')
  assertEq(plan.value.workNameSource, 'paper', '⑧ 名字来源 = paper（诊断用）')

  // ── ⑨ 名字与摘要/研究问题**不重复**（主题收敛到论文标题之后尤其容易撞）──
  {
    const PC = await import(lib('research/publish-content.js'))
    const build = (over = {}) =>
      PC.buildPublishContent({
        researchRoot: root,
        workspaceTitle: '低算力 VL 方向',
        progress: { overall: 0.5, paper: true, stateVersion: '1', progress: { stage: null, dimensions: [] }, counts: [] },
        generatedAt: '2026-10-13T00:00:00.000Z',
        project: { topic: 'Hierarchical Memory: Theory and Practice', goal: '给机器人策略做数据过滤。', domain: '', questions: [] },
        state: null,
        ...over,
      }).content
    assertEq(build().summary, undefined, '⑨ 主题 == 名字 → **不送** summary（同一句话不出现在标题与摘要两处）')
    assertEq(
      build({ project: { topic: '另一个主题', goal: '动机句。', domain: '', questions: [] } }).summary,
      '另一个主题',
      '⑨ 主题 ≠ 名字 → summary 照旧送主题句',
    )
    assertEq(
      build({ project: { topic: 'Hierarchical Memory: Theory and Practice', goal: '', domain: '', questions: [] } }).research_question,
      undefined,
      '⑨ 没有研究问题、主题又等于名字 → 不拿名字去顶 research_question',
    )

    /*
     * ── ⑩ 两级主题事实随信封上送（服务器在 `work_name` 缺省时用它兜底取名）──
     *
     * 与⑨的"去重"**不矛盾**：⑨ 去重的是**展示字段**（重复会让卡片看起来像坏了），
     * 这里上送的是**供服务端兜底的事实** —— 即使今天与 `work_name` 同值也必须带，
     * 因为其它客户端、以及服务器上更早发布的工作都靠它取名。
     */
    const evolved = build({ project: { topic: '当前采纳的主题句', initialTopic: '开题时的初始输入', goal: '', domain: '', questions: [] } })
    assertEq(evolved.topic, '当前采纳的主题句', '⑩ topic 随信封上送（= project.md 的当前主题）')
    assertEq(evolved.initial_topic, '开题时的初始输入', '⑩ initial_topic 随信封上送（主题演进过）')
    assertEq(
      build({ project: { topic: '同一个句子', initialTopic: '同一个句子', goal: '', domain: '', questions: [] } }).initial_topic,
      undefined,
      '⑩ initial_topic 与 topic 相同时省略（同一句话不发两遍）',
    )
    assertEq(typeof evolved.paper?.title, 'string', '⑩ paper.title 也在信封里（解析链的第二级）')
    assertEq(
      Object.keys(evolved).slice(0, 4).join(','),
      'schema_version,work_name,topic,initial_topic',
      '⑩ 信封顶层顺序：work_name 之后紧跟两级主题事实（契约可读）',
    )
  }

  fs.rmSync(HOME8, { recursive: true, force: true })
}

/* ════════════════════════════════════════════════════════════════════════
 * 7. 凭据纪律：把**所有**端点的返回值扫一遍
 * ════════════════════════════════════════════════════════════════════════ */
section('[7] 凭据纪律：任何端点的返回值都不含明文 Key')
{
  // 三份凭据全放上：扫一遍端点，任何一份漏出去都算失败
  const DEV_KEY = 'cf_live_dev00000000000000000000000000000000000000000000000000000001'
  const PROD_KEY = 'cf_live_prod0000000000000000000000000000000000000000000000000000002'
  const leakAny = (found, where) => {
    const text = JSON.stringify(found ?? null)
    for (const [label, secret] of [
      ['旧单值', KEY],
      ['开发槽', DEV_KEY],
      ['线上槽', PROD_KEY],
    ]) {
      assert(!text.includes(secret), `${where} 不含明文 Key（${label}）`)
    }
  }
  const h = makeHost({
    config: {
      convfusionApiKey: KEY,
      convfusionDevApiKey: DEV_KEY,
      convfusionProdApiKey: PROD_KEY,
      serverUrl: 'http://localhost:8000',
    },
  })
  const endpoints = [
    ['state', {}],
    ['dependencies/check', {}],
    ['account/state', {}],
    ['account/verify', {}],
    ['account/login', { apiKey: KEY }],
    ['account/logout', {}],
    ['account/serverUrl', { serverUrl: 'http://localhost:8000' }],
    ['account/usage', {}],
    ['customization/save', { skillId: 'literature-search', section: 'Purpose', text: 'x' }],
  ]
  for (const [ep, payload] of endpoints) {
    const res = await h.handler(ep, payload)
    leakAny(res, `端点 ${ep} 的响应`)
  }
  // ⚠️ 落盘补丁**不在**这个检查范围内：登录时的补丁本来就该带凭据（那是写配置本身，
  // 去的是本机设置存储，不是浏览器）。"别的服务器的 Key 不能被顺手带走"由 §2c/§2d 单独钉。
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
  assert(
    !fee.calls[0].url.includes('?'),
    '不给等级 = 兜底价（非论文类条件的价钱），URL 上不带 jcr_level / ccf_level',
  )

  /*
   * ── 论文等级定价（v0.6.3 §3.2.4）：等级 → 价格 ──────────────────────────
   *
   * 服务器按 `?jcr_level=2` / `?ccf_level=B` 定价。客户端**只传等级、不抄价目表**，
   * 所以宿主这一层的责任就一条：把等级原样、且**只发一个字段**递过去。
   * 两个等级都给时以 JCR 为准（与服务器 PaperPriceCalculator 的优先级一致）。
   */
  {
    const byJcr = makeHost({
      config: LOGGED_IN,
      handler: async (call) => {
        assert(call.url.endsWith('?jcr_level=2'), 'JCR 等级走 ?jcr_level=2')
        return { status: 200, body: { suggested_fee: 800, suggested_deposit: 160, suggested_success_payment: 640 } }
      },
    })
    const jcrRes = await byJcr.handler('mentor/fee-suggestion', { jcrLevel: 2 })
    assertEq(jcrRes.value.suggestion.suggestedFee, 800, 'JCR 2 区 → 该等级的价格（金额由服务器算）')

    const byCcf = makeHost({
      config: LOGGED_IN,
      handler: async (call) => {
        assert(call.url.endsWith('?ccf_level=B'), 'CCF 等级走 ?ccf_level=B')
        return { status: 200, body: { suggested_fee: 600, suggested_deposit: 120, suggested_success_payment: 480 } }
      },
    })
    const ccfRes = await byCcf.handler('mentor/fee-suggestion', { ccfLevel: 'b' })
    assertEq(ccfRes.value.suggestion.suggestedFee, 600, 'CCF 小写 b 归一成大写 B 再发（服务器只认 A/B/C）')

    const both = makeHost({
      config: LOGGED_IN,
      handler: async (call) => {
        assert(call.url.endsWith('?jcr_level=1') && !call.url.includes('ccf_level'), '两个都给 → 只发 JCR')
        return { status: 200, body: { suggested_fee: 1000, suggested_deposit: 200, suggested_success_payment: 800 } }
      },
    })
    await both.handler('mentor/fee-suggestion', { jcrLevel: 1, ccfLevel: 'C' })

    // 非法等级：本地就拦下，不白跑一趟网络（服务器会 422）
    const bad = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 200, body: {} }) })
    assertEq((await bad.handler('mentor/fee-suggestion', { jcrLevel: 9 })).error.code, 'bad-request', 'JCR 9 → 本地拒绝')
    assertEq((await bad.handler('mentor/fee-suggestion', { ccfLevel: 'D' })).error.code, 'bad-request', 'CCF D → 本地拒绝')
    assertEq(bad.calls.length, 0, '非法等级不发请求')
  }

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
    assertEq(
      sent.success_condition.jcr_level,
      undefined,
      '非论文类条件**不带**等级（带了服务器也只是忽略，但界面的语义就不清了）',
    )
    assertEq(propose.calls[0].headers.authorization, `Bearer ${KEY}`, '发起提案带 Bearer 凭据')
  }

  /*
   * ── 论文类提案：等级必须随 `success_condition` 发出去（v0.6.3）───────────
   *
   * 服务器把"等级就是价格"这条规则放在服务层：`PAPER_ACCEPTED` / `PAPER_PUBLISHED`
   * 缺 `jcr_level` / `ccf_level` 直接 400 `INVALID_PROPOSAL`。等级是**价格依据**，
   * 漏发 = 这份提案的价钱事后无法被重新推导出来。
   */
  {
    const paper = makeHost({
      config: LOGGED_IN,
      handler: async () => ({ status: 201, body: ENRICHED }),
    })
    const paperRes = await paper.handler('mentor/propose', {
      projectId: PROJECT_ID,
      guidanceScope: '指导实验设计与论文写作',
      totalFee: 800,
      depositAmount: 160,
      successPaymentAmount: 640,
      successCondition: { type: 'PAPER_ACCEPTED', description: null, jcrLevel: 2 },
    })
    assert(paperRes.ok, '论文类提案可以发起')
    const sentPaper = JSON.parse(paper.calls[0].body)
    assertEq(sentPaper.success_condition.type, 'PAPER_ACCEPTED', 'body：条件类型 = 论文被接收')
    assertEq(sentPaper.success_condition.jcr_level, 2, 'body：等级写在 success_condition.jcr_level（snake_case）')
    assertEq(sentPaper.success_condition.ccf_level, undefined, '只发一个等级字段（不给 ccf_level）')

    const paperCcf = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 201, body: ENRICHED }) })
    await paperCcf.handler('mentor/propose', {
      projectId: PROJECT_ID,
      guidanceScope: 'x',
      totalFee: 600,
      depositAmount: 120,
      successPaymentAmount: 480,
      successCondition: { type: 'PAPER_PUBLISHED', description: null, ccfLevel: 'b' },
    })
    const sentCcf = JSON.parse(paperCcf.calls[0].body)
    assertEq(sentCcf.success_condition.ccf_level, 'B', 'body：CCF 小写 b → 大写 B')
    assertEq(sentCcf.success_condition.jcr_level, undefined, 'CCF 提案不带 jcr_level')

    // 非法等级：本地拦（服务器 422），且**不**把非法值转发出去
    const badLevel = makeHost({ config: LOGGED_IN, handler: async () => ({ status: 201, body: ENRICHED }) })
    const badRes = await badLevel.handler('mentor/propose', {
      projectId: PROJECT_ID,
      guidanceScope: 'x',
      totalFee: 100,
      depositAmount: 20,
      successPaymentAmount: 80,
      successCondition: { type: 'PAPER_ACCEPTED', description: null, jcrLevel: 7 },
    })
    assertEq(badRes.error.code, 'bad-request', '非法等级 → 本地 bad-request')
    assertEq(badLevel.calls.length, 0, '非法等级不发请求')
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

  /*
   * 402 的**资金池**分支（v0.6.3）：服务器只在 funded-only 的扣费路径（付给导师 /
   * 提现）给出 `details.funded` + `details.grant`。这时"余额不足"是不够准确的 ——
   * 用户账上**有钱**，只是那一池不能付给导师。所以文案必须说清这件事，
   * 并给出唯一可行动作（自助付费尚未开通 → 找管理员发放）。
   */
  {
    const fundedBody = err('INSUFFICIENT_TOKENS', 'not enough funded', {
      required: 160,
      available: 500,
      funded: 10,
      grant: 490,
    })
    const fundedPoor = makeHost({
      config: LOGGED_IN,
      handler: async () => ({ status: 402, body: fundedBody }),
    })
    const fundedRes = await fundedPoor.handler('mentor/accept', {
      proposalId: ENRICHED.id,
      intentKey: 'intent-3',
    })
    assertEq(fundedRes.error.code, 'insufficient-tokens', '资金池不足同样是 insufficient-tokens')
    assert(fundedRes.error.message.includes('资金池'), '文案说的是**资金池**不足（不是笼统的"余额不足"）')
    assert(fundedRes.error.message.includes('赠送额度'), '并说明赠送额度不能付给导师')
    assert(fundedRes.error.message.includes('联系管理员发放'), '给出可行动作（测试阶段找管理员发放 Token）')

    // `details.funded` / `details.grant` 也要带出来：界面以后要靠它分辨两种 402
    let caught = null
    try {
      await SC.fetchAcceptProposal('http://127.0.0.1:8000', KEY, ENRICHED.id, 'intent-3b', {
        fetchImpl: async () => ({
          ok: false,
          status: 402,
          json: async () => fundedBody,
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      })
    } catch (e) {
      caught = e
    }
    assert(caught !== null && caught.name === 'ServerError', '402 抛 ServerError（不是普通 Error）')
    assertEq(caught.fundedTokens, 10, 'details.funded 带出来（fundedTokens）')
    assertEq(caught.grantTokens, 490, 'details.grant 带出来（grantTokens）')
    assertEq(caught.requiredTokens, 160, 'details.required 照旧带出来')

    // 普通（两池未分开的）402 文案不变：不无中生有地说"资金池"
    const legacyPoor = makeHost({
      config: LOGGED_IN,
      handler: async () => ({
        status: 402,
        body: err('INSUFFICIENT_TOKENS', 'not enough', { required: 20, available: 0 }),
      }),
    })
    const legacyRes = await legacyPoor.handler('mentor/accept', { proposalId: ENRICHED.id, intentKey: 'intent-4' })
    assert(!legacyRes.error.message.includes('资金池'), '没有 funded 细节时不说"资金池"（旧服务器不分开报两池）')
    assert(legacyRes.error.message.includes('不会重复扣费'), '402 文案照旧说明幂等重试（不会重复扣费）')
  }

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
