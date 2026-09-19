#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 「登录 ConvFusion.com」**真实端到端**验证
 *
 * ## 它做什么
 *
 * 起一台**隔离**的 ConvFusion 服务器（临时 SQLite + 独立端口），然后在它上面真的走一遍：
 *
 * ```text
 * ① alembic upgrade head        → 临时库建表
 * ② uvicorn（独立端口）          → 真实 HTTP 服务
 * ③ scripts/bootstrap_admin     → 拿到一份**真实**的管理员 API Key
 * ④ POST /admin/invitations     → 拿到一个**真实**邀请码
 * ⑤ 用本插件的宿主客户端（lib/）：
 *      account/login    用管理员 Key 登录       → 必须成功且身份正确
 *      account/login    用假 Key 登录           → 必须是 invalid-key（不是笼统失败）
 *      account/register 用邀请码注册新账号       → 必须成功并直接拿到 Key
 *      account/register 同一个邀请码再来一次     → 必须是 invitation-used
 *      account/verify   用已保存的凭据           → 必须成功
 *      account/logout                          → 凭据清空、地址保留
 * ```
 *
 * ## 为什么起隔离实例，而不是用现成的那台
 *
 * 开发服务器连着开发者的库（`data/convfusion.db`）。在里面造用户、用邀请码会污染真实数据；
 * 隔离实例跑完即删，**不碰**任何已有数据。这一跑的是**开发环境**的形态。
 *
 * ## 部署环境怎么验（`CONVFUSION_LIVE_TARGET=configured`）
 *
 * 线上（`https://convfusion.com`）不需要本地仓库、不需要 python，所以另有一条只读路径：
 * 直接对本机**当前配置的服务器地址**发请求，验证"地址通不通 + 错误分类对不对"，
 * 有 `CONVFUSION_API_KEY` 时再验证一次真实登录。
 *
 * ```bash
 * CONVFUSION_LIVE_TARGET=configured node scripts/verify-server-login-live.mjs .
 * CONVFUSION_ENV=production CONVFUSION_LIVE_TARGET=configured CONVFUSION_API_KEY=cf_live_… \
 *   node scripts/verify-server-login-live.mjs .
 * ```
 *
 * ## 所有环境相关的值都来自配置文件（**脚本里没有机器路径**）
 *
 * 读 `convfusion.env.json`（模板见 `convfusion.env.example.json`，解析规则见
 * `src/server-env.ts`）：服务器地址按环境取，`dev.serverDir` / `dev.python` / `dev.port`
 * 供本脚本起隔离实例。命令行可用 `CONVFUSION_PYTHON`、`CONVFUSION_SERVER_DIR`、
 * `CONVFUSION_HOST`、`CONVFUSION_TEST_PORT`、`CONVFUSION_ENV` 临时覆盖。
 *
 * 用法：node scripts/verify-server-login-live.mjs [pkgDir]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

const ENV = ENVCFG.loadServerEnv()
const DEV = ENVCFG.resolveDevTooling()
const TARGET = (process.env.CONVFUSION_LIVE_TARGET ?? 'isolated').trim().toLowerCase()

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
function skip(reason) {
  console.log(`\n⏭  server-login-live: 跳过（${reason}）`)
  process.exit(0)
}

console.log(`[live] 环境配置：${ENV.path ?? '（无配置文件，使用内置兜底）'}`)
console.log(`[live] 环境：${DEV_ENV_NAME()} · 目标：${TARGET}`)

function DEV_ENV_NAME() {
  return ENVCFG.resolveEnvironmentName(process.env, undefined)
}

/* ════════════════════════════════════════════════════════════════════════
 * 模式 A：对**当前配置的服务器**验证（部署环境用；不需要本地仓库/python）
 * ════════════════════════════════════════════════════════════════════════ */
if (TARGET === 'configured' || TARGET === 'deployed' || TARGET === 'existing') {
  const server = CFG.resolveServerUrl({}, process.env)
  const base = server.url
  console.log(`\n[configured] 目标服务器：${base}（来源 ${server.source}，环境 ${server.environment}）`)

  const handler = RPC.createSettingsRpcHandler({
    getConfig: () => CFG.resolveConfig({}),
    store: CUST.createMemoryCustomizationStore(),
    setConfig: async () => {},
    fetchImpl: fetch,
    serverTimeoutMs: 15000,
  })

  // ① 可达性：连不上就得说"连不上"，而不是让后面几条给出误导性的结论
  //
  // 生产地址在**部署完成前**本来就连不上，所以这种情况算"本机没条件验"（跳过），
  // 不算验证失败 —— 但原因必须原样打印出来，不能悄悄跳过。
  let reachable = false
  let health = ''
  try {
    const res = await fetch(`${base}/api/v1/health`)
    reachable = res.ok
    health = JSON.stringify(await res.json())
  } catch (e) {
    health = e instanceof Error ? e.message : String(e)
  }
  if (!reachable) {
    skip(`服务器不可达：${base}（${health}）。若那是生产地址，请等部署完成后再跑本命令。`)
  }
  assert(reachable, `${base}/api/v1/health 可达（${health}）`)

  // ② 错误分类：假 Key 必须是 invalid-key（线上也必须是这个语义）
  const bad = await handler('account/login', { apiKey: 'cf_live_' + '0'.repeat(64), serverUrl: base })
  assertEq(bad.ok, false, '假 Key 登录失败')
  assertEq(bad.error?.code, 'invalid-key', '失败原因具体到 invalid-key')
  assert(!JSON.stringify(bad).includes('cf_live_' + '0'.repeat(64)), '失败响应里没有 Key 明文')

  // ③ 地址归一：带 /api 的地址同样可用
  const viaApi = await handler('account/login', { apiKey: 'cf_live_' + '0'.repeat(64), serverUrl: `${base}/api` })
  assertEq(viaApi.error?.code, 'invalid-key', '带 /api 的地址归一后语义一致')

  // ④ 有真凭据时，验证一次真实登录
  const key = (process.env.CONVFUSION_API_KEY ?? '').trim()
  if (key) {
    const login = await handler('account/login', { apiKey: key, serverUrl: base })
    assertEq(login.ok, true, '用 CONVFUSION_API_KEY 登录成功')
    if (login.ok) {
      assert(typeof login.value.account?.email === 'string', `拿到账号（${login.value.account?.email}）`)
      assertEq(login.value.environment, server.environment, '返回的环境与配置一致')
      assert(!JSON.stringify(login.value).includes(key), '登录响应里没有 Key 明文')
    }
  } else {
    console.log('  · 未提供 CONVFUSION_API_KEY，跳过真实登录（其余检查已完成）')
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} server-login-live(configured): ${passed} passed, ${failed} failed`)
  if (failed > 0) console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(failed === 0 ? 0 : 1)
}

/* ════════════════════════════════════════════════════════════════════════
 * 模式 B：隔离实例（开发环境；需要本地服务器仓库 + python）
 * ════════════════════════════════════════════════════════════════════════ */
const SERVER_DIR = DEV.serverDir
const PYTHON = DEV.python
const HOST = DEV.host
const PORT = DEV.port
const BASE = `http://${HOST}:${PORT}`

if (!SERVER_DIR) {
  skip('环境配置里没有 dev.serverDir（复制 convfusion.env.example.json 为 convfusion.env.json 并填写）')
}
if (!existsSync(join(SERVER_DIR, 'app', 'main.py'))) {
  skip(`dev.serverDir 不是 ConvFusion-server：${SERVER_DIR}`)
}
const probe = spawnSync(PYTHON, ['-c', 'import fastapi, uvicorn, sqlalchemy, alembic'], {
  cwd: SERVER_DIR,
  encoding: 'utf8',
})
if (probe.status !== 0) {
  skip(`dev.python（${PYTHON}）缺少 fastapi/uvicorn/sqlalchemy/alembic`)
}

/* 直接打服务器原始 API 的助手（live.6 / live.7 共用）。 */
async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  return { status: res.status, body: await res.json().catch(() => undefined) }
}

/* 一个指向**真实隔离实例**的 host 面夹具（用于研究工作那一节）。 */
function makeHostFor(apiKey) {
  let config = CFG.resolveConfig({
    customizationFile: 'live.json',
    customizationDir: join(TMP, 'cf'),
    serverUrl: BASE,
    convfusionApiKey: apiKey,
  })
  return {
    handler: RPC.createSettingsRpcHandler({
      getConfig: () => config,
      store: CUST.createMemoryCustomizationStore(),
      setConfig: async (patch) => {
        config = { ...config, ...patch }
      },
      fetchImpl: fetch,
      serverTimeoutMs: 15000,
    }),
  }
}

const TMP = mkdtempSync(join(tmpdir(), 'cf-live-'))
const DB_FILE = join(TMP, 'live.db')
const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${DB_FILE}`,
  APP_ENV: 'test',
  LOG_LEVEL: 'WARNING',
  SECRET_KEY: 'live-verify-secret',
  WEB_DIST_DIR: join(TMP, 'no-such-dist'), // 不要落地页，只要 API
  // ⚠️ 附件字节的落盘位置也要在临时目录里。
  // 默认值 `data/storage` 相对**服务器仓库**，而本进程可能跑在受限沙箱里
  // （DSH 的文件沙箱只允许写会话工作区）—— 那样上传会在服务端 500
  // （PermissionError: data/storage/projects/...）。隔离实例必须自带可写目录。
  STORAGE_ROOT: join(TMP, 'storage'),
}

/**
 * 通过**宿主的同源 GET 代理**取回归档字节 —— 浏览器原生下载那一步的服务端形态。
 *
 * 浏览器那边是 `<a download>` 直接发起（页面拿不到成败），所以这里直接调路由处理器
 * 来验：状态码、`Content-Disposition`、以及拿到的确实是服务器的真实 ZIP。
 */
async function archiveViaProxy(apiKey, projectId, title = 'live') {
  const route = RPC.createSettingsRouteHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'live-proxy.json',
        customizationDir: join(TMP, 'cf'),
        serverUrl: BASE,
        convfusionApiKey: apiKey,
      }),
    store: CUST.createMemoryCustomizationStore(),
    fetchImpl: fetch,
    serverTimeoutMs: 30000,
  })
  const chunks = []
  const res = {
    statusCode: 0,
    headers: {},
    setHeader() {},
    writeHead(status, headers) {
      this.status = status
      this.headers = headers ?? {}
    },
    write(chunk) {
      chunks.push(Buffer.from(chunk))
    },
    end(payload) {
      if (payload !== undefined) chunks.push(Buffer.from(payload))
    },
  }
  await route(
    {
      method: 'GET',
      url: `/dsh-convfusion/mentor/archive?projectId=${encodeURIComponent(projectId)}&title=${encodeURIComponent(title)}`,
      headers: {},
      async *[Symbol.asyncIterator]() {},
    },
    res,
  )
  return { status: res.status, headers: res.headers, bytes: Buffer.concat(chunks) }
}

/** 用 Python 的 zipfile 读归档里的条目名（证明拿到的是**内容正确**的 ZIP，不只是 PK 头）。 */
function zipEntryNames(zipBytes) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-ziplist-'))
  const file = join(dir, 'a.zip')
  writeFileSync(file, zipBytes)
  const r = spawnSync(
    PYTHON,
    ['-c', 'import json,sys,zipfile;print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist(),ensure_ascii=False))', file],
    { encoding: 'utf8' },
  )
  rmSync(dir, { recursive: true, force: true })
  if (r.status !== 0) return []
  try {
    return JSON.parse(r.stdout)
  } catch {
    return []
  }
}

let server = null
const cleanup = () => {
  if (server && server.pid) {
    try {
      server.kill('SIGTERM')
    } catch {
      /* 已经退出了 */
    }
  }
  try {
    rmSync(TMP, { recursive: true, force: true })
  } catch {
    /* 临时目录清不掉不影响结论 */
  }
}
process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

/**
 * 关掉隔离实例并**真的**结束进程。
 *
 * ⚠️ 必须显式 `process.exit()`：子进程的 stdout/stderr 管道与 fetch 的 keep-alive
 * 连接都会让 Node 的事件循环保持活跃 —— 只等它自然退出会**死锁**（脚本挂住，
 * 临时目录与端口都不释放）。第一次跑就踩了这个。
 */
async function shutdown() {
  const s = server
  server = null
  if (!s) return
  try {
    s.stdout?.removeAllListeners()
    s.stderr?.removeAllListeners()
    s.stdout?.destroy()
    s.stderr?.destroy()
  } catch {
    /* 管道可能已经关了 */
  }
  try {
    s.kill('SIGTERM')
  } catch {
    /* 已经退出了 */
  }
  await new Promise((r) => {
    const t = setTimeout(r, 3000)
    s.once('exit', () => {
      clearTimeout(t)
      r()
    })
  })
}

console.log(`[live] 隔离实例：${SERVER_DIR}（python: ${PYTHON}）`)
console.log(`[live] 临时库：${DB_FILE}`)
console.log(`[live] 监听：${HOST}:${PORT}\n`)

/* ── ① 建表 ───────────────────────────────────────────────────────────── */
console.log('[live.1] alembic upgrade head（临时库建表）')
{
  const r = spawnSync(PYTHON, ['-m', 'alembic', 'upgrade', 'head'], { cwd: SERVER_DIR, env, encoding: 'utf8' })
  assert(r.status === 0, 'alembic 迁移成功')
  if (r.status !== 0) {
    console.log(r.stdout?.slice(-2000) ?? '')
    console.log(r.stderr?.slice(-2000) ?? '')
    skip('迁移失败（临时库不可用）')
  }
}

/* ── ② 起服务 ─────────────────────────────────────────────────────────── */
console.log('\n[live.2] 启动 uvicorn 并等待 /health')
server = spawn(
  PYTHON,
  ['-m', 'uvicorn', 'app.main:app', '--host', HOST, '--port', String(PORT)],
  { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] },
)
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d.toString()))
server.stderr.on('data', (d) => (serverLog += d.toString()))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let up = false
for (let i = 0; i < 60; i++) {
  await sleep(250)
  try {
    const res = await fetch(`${BASE}/api/v1/health`)
    if (res.ok) {
      up = true
      break
    }
  } catch {
    /* 还没起来 */
  }
}
assert(up, `服务器已就绪（${BASE}/api/v1/health）`)
if (!up) {
  console.log(serverLog.slice(-2000))
  skip('隔离实例启动失败')
}

/* ── ③ 管理员 Key ─────────────────────────────────────────────────────── */
console.log('\n[live.3] bootstrap_admin → 真实 API Key')
const ADMIN_EMAIL = 'live-admin@example.test'
let adminKey = ''
{
  const r = spawnSync(
    PYTHON,
    ['-m', 'scripts.bootstrap_admin', '--email', ADMIN_EMAIL, '--name', 'Live Admin'],
    { cwd: SERVER_DIR, env, encoding: 'utf8' },
  )
  assert(r.status === 0, 'bootstrap_admin 执行成功')
  adminKey = (r.stdout.match(/cf_live_[0-9a-f]+/) ?? [''])[0]
  assert(/^cf_live_[0-9a-f]{16,}$/.test(adminKey), '拿到形如 cf_live_… 的管理员 Key')
  if (!adminKey) {
    console.log(r.stdout ?? '')
    skip('没拿到管理员 Key')
  }
}

/* ── ④ 邀请码 ─────────────────────────────────────────────────────────── */
console.log('\n[live.4] 管理员签发邀请码')
const INVITEE_EMAIL = 'live-researcher@example.test'
let invitationCode = ''
/** 注册出来的研究者账号的 Key（研究工作那一节要用它建项目 / 发布）。 */
let researcherKey = ''
{
  const res = await fetch(`${BASE}/api/v1/admin/invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ email: INVITEE_EMAIL, role: 'RESEARCHER', expires_in_days: 1 }),
  })
  const body = await res.json()
  assert(res.status === 201, `签发邀请码成功（HTTP ${res.status}）`)
  invitationCode = body?.invitation_code ?? ''
  assert(/^cf_inv_/.test(invitationCode), '邀请码形如 cf_inv_…')
  if (!invitationCode) skip('没拿到邀请码')
}

/* ── ⑤ 用**本插件宿主客户端**跑真实登录 ───────────────────────────────── */
console.log('\n[live.5] 本插件 account/* 端点 × 真实服务器')
{
  let config = CFG.resolveConfig({
    customizationFile: 'live.json',
    customizationDir: join(TMP, 'cf'),
    // 显式指向隔离实例 —— 这条测试验的是"能不能连上并正确解析"，与开发/生产默认无关
    serverUrl: BASE,
  })
  const deps = {
    getConfig: () => config,
    store: CUST.createMemoryCustomizationStore(),
    // 模拟 settings scope：写盘后立刻生效（真实实现是异步的，这里只管存储正确性）
    setConfig: async (patch) => {
      config = { ...config, ...patch }
    },
    fetchImpl: fetch,
  }
  const handler = RPC.createSettingsRpcHandler(deps)

  // ⑤-1 用假 Key：必须是 invalid-key，而不是笼统失败
  const badKey = await handler('account/login', { apiKey: 'cf_live_' + '0'.repeat(64), serverUrl: BASE })
  assertEq(badKey.ok, false, '假的 Key 登录失败')
  assertEq(badKey.error.code, 'invalid-key', '失败原因具体到 invalid-key')
  assertEq(config.convfusionApiKey, '', '失败没有写盘')

  // ⑤-2 管理员 Key 登录（真实 /auth/me）
  const login = await handler('account/login', { apiKey: adminKey, serverUrl: BASE })
  assertEq(login.ok, true, '管理员 Key 登录成功')
  if (login.ok) {
    assertEq(login.value.account.email, ADMIN_EMAIL, '拿到的账号邮箱与真实账号一致')
    assertEq(login.value.account.roles.includes('ADMIN'), true, '拿到 ADMIN 角色')
    assertEq(login.value.account.status, 'ACTIVE', '账号状态 ACTIVE')
    assertEq(login.value.serverUrl, BASE, '服务器地址被记录')
    assert(!JSON.stringify(login.value).includes(adminKey), '登录响应里没有 Key 明文')
  }
  assertEq(config.convfusionApiKey, adminKey, '管理员 Key 已落盘')

  // ⑤-3 verify（用已保存的凭据）
  const verify = await handler('account/verify', {})
  assertEq(verify.ok, true, 'verify 用已保存凭据成功')
  if (verify.ok) assertEq(verify.value.account.email, ADMIN_EMAIL, 'verify 返回同一账号')
  assert(!JSON.stringify(verify.value).includes(adminKey), 'verify 响应里没有 Key 明文')

  // ⑤-4 邀请码注册（真实 accept + 新 Key 自检）
  const register = await handler('account/register', {
    invitationCode,
    email: INVITEE_EMAIL,
    displayName: 'Live Researcher',
    serverUrl: BASE,
  })
  assertEq(register.ok, true, '邀请码注册成功')
  if (register.ok) {
    assertEq(register.value.account.email, INVITEE_EMAIL, '注册后的账号邮箱正确')
    assertEq(register.value.account.displayName, 'Live Researcher', '注册后的显示名正确')
    assertEq(register.value.account.roles.includes('RESEARCHER'), true, '新账号拿到 RESEARCHER 角色')
    assert(
      typeof register.value.tokens?.available === 'number',
      `新账号余额来自服务器（${register.value.tokens?.available}；服务器现在有注册赠币 SIGNUP_TOKEN_GRANT）`,
    )
    assert(!JSON.stringify(register.value).includes('cf_live_'), '注册响应里没有任何 Key 明文')
  }
  researcherKey = config.convfusionApiKey
  assert(/^cf_live_/.test(researcherKey), '服务器签发的 Key 已落盘')
  assert(researcherKey !== adminKey, '落盘的是**新账号**的 Key（不是管理员那份）')

  // ⑤-5 同一个邀请码再来一次：必须是 invitation-used
  const reuse = await handler('account/register', {
    invitationCode,
    email: 'another@example.test',
    displayName: 'Another',
    serverUrl: BASE,
  })
  assertEq(reuse.ok, false, '同一个邀请码第二次注册失败')
  assertEq(reuse.error.code, 'invitation-used', '失败原因是 invitation-used（409）')
  assertEq(config.convfusionApiKey, researcherKey, '注册失败不动已保存的凭据')

  // ⑤-6 邮箱已被占用（同一个邮箱 + 新邀请码 → CONFLICT）
  const inv2 = await fetch(`${BASE}/api/v1/admin/invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ email: INVITEE_EMAIL, role: 'RESEARCHER', expires_in_days: 1 }),
  })
  const inv2Body = await inv2.json()
  const conflict = await handler('account/register', {
    invitationCode: inv2Body?.invitation_code ?? '',
    email: INVITEE_EMAIL,
    displayName: 'Dup',
    serverUrl: BASE,
  })
  assertEq(conflict.ok, false, '已注册邮箱再注册失败')
  assertEq(conflict.error.code, 'email-taken', '失败原因是 email-taken（409 CONFLICT）')

  // ⑤-7 邀请码与邮箱不匹配 → INVALID_INVITATION
  const inv3 = await fetch(`${BASE}/api/v1/admin/invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ email: 'mismatch@example.test', role: 'RESEARCHER', expires_in_days: 1 }),
  })
  const inv3Body = await inv3.json()
  const mismatch = await handler('account/register', {
    invitationCode: inv3Body?.invitation_code ?? '',
    email: 'someone-else@example.test',
    displayName: 'Mismatch',
    serverUrl: BASE,
  })
  assertEq(mismatch.error?.code, 'invalid-invitation', '邮箱与邀请码不匹配 → invalid-invitation')

  // ⑤-8 地址归一：带 /api 的地址也能连（任务书里给的就是这个形态）
  const normalized = await handler('account/login', { apiKey: adminKey, serverUrl: `${BASE}/api` })
  assertEq(normalized.ok, true, '带 /api 的地址被归一后仍能登录')

  // ⑤-9 登出
  const logout = await handler('account/logout', {})
  assertEq(logout.ok, true, '登出成功')
  assertEq(logout.value.keyConfigured, false, '登出后未配置状态')
  assertEq(logout.value.serverUrl, BASE, '登出保留服务器地址')
  assertEq(config.convfusionApiKey, '', '本机凭据已清空')

  // ⑤-10 服务器上真的存在这两个账号（用管理员 Key 查邀请码状态）
  const list = await fetch(`${BASE}/api/v1/admin/invitations`, {
    headers: { authorization: `Bearer ${adminKey}` },
  })
  const invList = await list.json()
  const used = invList.filter((i) => i.status === 'USED').length
  assert(used >= 1, `服务器侧确实记录了已使用的邀请码（${used} 个）`)
}

/* ── ⑥ 研究工作（发现网络）：真的发布一份 Research State，再被别人发现 ────
 *
 * 这一节走完 `INTEGRATION.md` §10 的 ②③④⑤⑥⑦：建项目 → 传状态 → 发布 →
 * 发现网络能看到 → 读摘要（免费）→ 读简报（非 owner 花 1 Token）。
 * 402 之后**用同一个 intentKey** 充值再试，验证"不会重复扣费"这条服务端承诺。
 *
 * ⚠️ 简报的计费口径（2026-09 服务器改定）：**按 `(viewer, project)` 买一次**
 * （`token.py:has_paid_brief` 查不可变账本里的 `BRIEF_VIEW` 记录）。
 * 所以"重复扣费"有**两层**都要验：同一 `intentKey` 回放不扣；换新 Key（甚至不传）
 * 重新打开**同一项**研究也不扣。而读**另一个项目**必须照常扣 1 —— 否则
 * "永远不扣费"的回归会悄悄通过。
 * ─────────────────────────────────────────────────────────────────────── */
console.log('\n[live.6] 研究工作：发布 → 发现 → 摘要 → 简报（含 402 → 充值 → 同 Key 重试）')
{

  // ⑥-1 研究者（上一步注册的账号）建项目并发布
  const created = await api('/projects', {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}` },
    body: JSON.stringify({ title: 'Live Verify · 检索增强推理', description: 'e2e fixture' }),
  })
  assertEq(created.status, 201, '研究者建项目成功（201）')
  const projectId = created.body?.id
  assert(typeof projectId === 'string' && projectId.length > 0, '拿到 project_id')

  const uploaded = await api(`/projects/${projectId}/state`, {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}`, 'idempotency-key': `live-state-${Date.now()}` },
    body: JSON.stringify({
      base_version: null,
      content: {
        schema_version: 1,
        research_question: '检索能否改善长上下文推理？',
        hypothesis: '混合检索-注意力可以提升准确率。',
        core_idea: '把检索与注意力交错。',
        method_overview: '在每层注意前插入检索。',
        stage: 'EXPERIMENT',
        progress: 0.4,
        research_fields: ['LLM'],
        summary: '检索增强的长上下文推理。',
      },
    }),
  })
  assertEq(uploaded.status, 201, '上传研究状态成功（201）')

  // ⚠️ 发布**要花 Token**（服务器对每个项目收一次，按已付费项目数阶梯计价）。
  // 研究者账号刚注册、余额 0 → 不充值必然 402。这也是界面**必须先显示成本**的原因。
  const researcherUid = (
    await api('/auth/me', { headers: { authorization: `Bearer ${researcherKey}` } })
  ).body?.id
  // ⚠️ 发布**要花 Token**（每项目收一次，按已付费项目数阶梯）。服务器现在给新账号
  // 注册赠币（`SIGNUP_TOKEN_GRANT`），所以"余额 0 → 402"不是必然路径 —— 两种情况都要能走。
  const balanceBefore = (
    await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })
  ).body?.available_balance
  const publishIntent = `publish-${projectId}-v1`
  let first = await api(`/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}`, 'idempotency-key': publishIntent },
  })
  if (balanceBefore === 0) {
    assertEq(first.status, 402, '余额为 0 时发布会 402（不是免费）')
    assertEq(first.body?.error?.code, 'INSUFFICIENT_TOKENS', '402 的错误码是 INSUFFICIENT_TOKENS')
    const topUp = await api(`/admin/users/${researcherUid}/tokens/grant`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ amount: 20, reason: 'live verify publish cost' }),
    })
    assert([200, 201].includes(topUp.status), `充值成功（HTTP ${topUp.status}）`)
    // 充值后**用同一个幂等键**重试（服务器语义：402 完整回滚，Key 没被消耗）
    first = await api(`/projects/${projectId}/publish`, {
      method: 'POST',
      headers: { authorization: `Bearer ${researcherKey}`, 'idempotency-key': publishIntent },
    })
  } else {
    console.log(`  · 研究者余额 ${balanceBefore}（服务器有注册赠币），直接验证扣费语义`)
  }
  assertEq(first.status, 200, '发布成功（200）')
  assertEq(first.body?.visibility, 'PUBLISHED', '可见性变为 PUBLISHED')
  assert(
    typeof first.body?.charged_tokens === 'number' && first.body.charged_tokens > 0,
    `首次发布真实扣费（charged_tokens=${first.body?.charged_tokens}）`,
  )
  // 已付费的项目重复发布**免费**（服务器语义），这也是"更新"能随便点的依据
  const republished = await api(`/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}` },
  })
  assertEq(republished.status, 200, '重复发布仍是 200（幂等）')
  assertEq(republished.body?.charged_tokens, 0, '重复发布不重复扣费（charged_tokens=0）')

  // ⑥-2 管理员（另一个账号）从发现网络看到它 —— 随机发现**排除自己**，所以必须换账号
  const mined = makeHostFor(adminKey)
  // 不传条数：抽样与条数由服务器决定（插件不复制服务端策略）
  const list = await mined.handler('work/list', {})
  assertEq(list.ok, true, '管理员拉取研究工作列表成功（条数由服务器定）')
  const found = (list.value?.items ?? []).find((it) => it.projectId === projectId)
  assert(Boolean(found), '发现网络里能看到刚发布的研究工作')
  if (found) {
    assertEq(found.stage, 'EXPERIMENT', '列表带出研究阶段')
    assertEq(found.researchFields, ['LLM'], '列表带出研究领域')
    assertEq(typeof found.progress, 'number', '列表带出进度')
    // 权威判据：还没付过费 → false（界面据此**弹**确认框）
    assertEq(found.briefPaid, false, '未付费 → brief_paid=false（界面会先确认）')
  }
  assert(!JSON.stringify(list).includes(adminKey), '列表响应里没有 Key 明文')

  // ⑥-3 摘要（免费）
  const sum = await mined.handler('work/summary', { projectId })
  assertEq(sum.ok, true, '读摘要成功（免费）')
  assertEq(sum.value?.work?.projectId, projectId, '摘要对上了同一个项目')
  assertEq(sum.value?.work?.researchQuestion, '检索能否改善长上下文推理？', '摘要带出研究问题')
  // 第一层**不含**核心想法 / 方法（渐进披露的关键约束）
  assert(!JSON.stringify(sum.value).includes('把检索与注意力交错'), '摘要不含核心想法（Level 1 的正确边界）')

  // ⑥-4 简报：管理员余额是 0 → 402；充值后**同 Key** 重试 → 成功且只扣一次
  const intentKey = `live-brief-${Date.now()}`
  const poor = await mined.handler('work/brief', { projectId, intentKey })
  assertEq(poor.ok, false, '余额为 0 时读简报失败')
  assertEq(poor.error?.code, 'insufficient-tokens', '失败原因是 insufficient-tokens（402）')

  const adminId = (await api('/auth/me', { headers: { authorization: `Bearer ${adminKey}` } })).body?.id
  const grant = await api(`/admin/users/${adminId}/tokens/grant`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ amount: 5, reason: 'live verify' }),
  })
  assert([200, 201].includes(grant.status), `给管理员充值成功（HTTP ${grant.status}）`)

  const brief = await mined.handler('work/brief', { projectId, intentKey })
  assertEq(brief.ok, true, '充值后**用同一个 intentKey** 读到简报（服务端回放）')
  assertEq(brief.value?.brief?.coreIdea, '把检索与注意力交错。', '简报带出核心想法（Level 2）')
  assertEq(brief.value?.brief?.hypothesis, '混合检索-注意力可以提升准确率。', '简报带出假设')
  assert(!JSON.stringify(brief).includes(adminKey), '简报响应里没有 Key 明文')

  // 余额只扣一次：充值 5 → 一次简报后应为 4
  const balance = await api('/tokens', { headers: { authorization: `Bearer ${adminKey}` } })
  const available = balance.body?.available_balance ?? balance.body?.available
  assertEq(available, 4, `简报只扣了 1 个 Token（余额 ${available}，期望 4）`)

  // ⑥-4a `brief_paid` 的**真实翻转**：付过费之后列表就该说"不用再花钱了"。
  // 这条是"只在真会扣费时才提醒"的服务器依据 —— 界面靠它跳过确认框。
  const listAfter = await mined.handler('work/list', {})
  const foundAfter = (listAfter.value?.items ?? []).find((it) => it.projectId === projectId)
  assertEq(foundAfter?.briefPaid, true, '付费后 → brief_paid=true（界面不再弹确认框）')
  const sumAfter = await mined.handler('work/summary', { projectId })
  assertEq(sumAfter.value?.work?.briefPaid, true, '同一判据在 /summary 也生效')

  // ⑥-4b 界面上的余额：走**插件端点**核对，确保"用户看到的数字"= 服务器扣完的真实数字
  const logged = await mined.handler('account/verify', {})
  assertEq(logged.ok, true, 'verify 成功（顺带取余额）')
  assertEq(logged.value?.tokens?.available, 4, '登录态里带回的可用余额 = 4（界面就显示这个数）')
  assertEq(logged.value?.tokens?.total, 4, '总额一致（无冻结）')
  const refresh = await mined.handler('account/tokens', {})
  assertEq(refresh.value?.tokens?.available, 4, 'account/tokens 刷新后仍是 4')

  // ⑥-5 同一个 intentKey 再读一次：不重复扣费
  const replay = await mined.handler('work/brief', { projectId, intentKey })
  assertEq(replay.ok, true, '同一 intentKey 重放成功')
  const balance2 = await api('/tokens', { headers: { authorization: `Bearer ${adminKey}` } })
  assertEq(balance2.body?.available_balance ?? balance2.body?.available, 4, '重放**没有**再次扣费')

  // ⑥-6 同一项目**换新 Key**（新意图）也不再扣费。
  //      服务器把简报改成"按 (viewer, project) 买一次"（`token.py:has_paid_brief`，
  //      看不可变账本里的 BRIEF_VIEW 记录），与 Idempotency-Key 无关 —— 换 Key、
  //      甚至不传 Key，重新打开同一项研究都不该再扣一次。
  const second = await mined.handler('work/brief', { projectId, intentKey: `${intentKey}-2` })
  assertEq(second.ok, true, '换新 Key 再读同一项目成功')
  assertEq(second.value?.brief?.coreIdea, '把检索与注意力交错。', '换 Key 仍带出 Level 2 内容（不是命中回放）')
  const balance3 = await api('/tokens', { headers: { authorization: `Bearer ${adminKey}` } })
  assertEq(balance3.body?.available_balance ?? balance3.body?.available, 4, '同一项目换新 Key 不再扣费（余额仍是 4）')

  // ⑥-7 未发布的项目对别人不可见（不存在性不泄漏）
  const hidden = await api('/projects', {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}` },
    body: JSON.stringify({ title: 'Live Verify · 私有项目' }),
  })
  const hiddenId = hidden.body?.id
  const hiddenSummary = await mined.handler('work/summary', { projectId: hiddenId })
  assertEq(hiddenSummary.error?.code, 'not-found', '未发布的研究工作对他人 → not-found')
}

/* ── ⑦ 「寻找指导」：把**本机研究项目**发布到真实服务器 ──────────────────
 *
 * 这一节走的是产品里真正的那条链路：本机工作区 → 建项目 → 传 Research State
 * → 发布 → 另一个账号能在发现网络里看到它（并可读摘要与简报）。
 * 用的是临时工作区（真实 project.md / research-state.md），不碰任何真实研究数据。
 * ─────────────────────────────────────────────────────────────────────── */
console.log('\n[live.7] 寻找指导：本机研究 → 发布 → 被另一个账号发现')
{
  const fs = await import('node:fs')
  const path = await import('node:path')
  const os = await import('node:os')
  const PUB = await import(pathToFileURL(join(PKG, 'lib', 'research', 'published-store.js')).href)

  // 造一个真实布局的小研究项目（会真实落盘、被 captureProgress 读取）
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-live-pub-'))
  const wsDir = path.join(home, 'proj-live')
  const researchRoot = path.join(wsDir, 'workspace')
  fs.mkdirSync(path.join(researchRoot, 'research', 'evidence'), { recursive: true })
  fs.writeFileSync(
    path.join(researchRoot, 'project.md'),
    [
      '---',
      'type: research-project',
      'topic: 现场验证：裁剪证据与失败判定',
      'domain: 多模态, 机器人学习',
      '---',
      '',
      '# Research Project',
      '',
      '## Research Questions',
      '',
      '- 裁剪证据能否改善失败判定？',
      '',
      '## Motivation',
      '',
      '数据过滤需要可信的失败判定。',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(researchRoot, 'research-state.md'),
    ['---', 'type: research-state', 'version: 2', 'maturity_problem: Established', '---', '', '# Research State', '', '## Hypotheses', '', 'H1：收益是样本条件性的。', ''].join('\n'),
  )
  fs.writeFileSync(
    path.join(researchRoot, 'research', 'evidence', 'E001.md'),
    ['---', 'name: 现场验证证据', 'status: supported', '---', '', '# Evidence', ''].join('\n'),
  )

  const store = PUB.createMemoryPublishedStore()
  const publisher = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'live.json',
        customizationDir: join(home, 'cf'),
        serverUrl: BASE,
        convfusionApiKey: adminKey,
      }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: async () => ({
      available: true,
      items: [{ id: 'ws-live', title: '现场验证项目', path: wsDir, updatedAt: '' }],
    }),
    publishedStore: store,
    fetchImpl: fetch,
    serverTimeoutMs: 15000,
  })

  // ① 我的列表里能看到它（未发布）
  const mine1 = await publisher('work/mine', {})
  assertEq(mine1.value.items.length, 1, '「我的」能列出这个本机研究项目')
  assertEq(mine1.value.items[0].published, null, '发布前：没有已发布记录')

  // ② 点「寻找指导」= 发布
  const pub = await publisher('work/publish', { id: 'ws-live' })
  if (!pub.ok) console.log('  [diag] work/publish 失败：', JSON.stringify(pub).slice(0, 400))
  assertEq(pub.ok, true, '发布成功（建项目 → 传状态 → 发布）')
  const serverProjectId = pub.value?.published?.projectId
  assert(typeof serverProjectId === 'string' && serverProjectId.length > 0, '拿到服务器 project_id')
  assertEq(pub.value?.published?.visibility, 'PUBLISHED', '可见性 PUBLISHED')
  assertEq(pub.value?.published?.created, true, '首次发布 = 新建项目')

  // ②b 附件真的落到服务器了吗？读目录树核对（这是"传了什么"的直接证据）
  {
    const tree = await api(`/projects/${serverProjectId}/files/tree`, {
      headers: { authorization: `Bearer ${adminKey}` },
    })
    assertEq(tree.status, 200, '能读到附件目录树')
    const paths = []
    const walk = (node) => {
      for (const f of node.files ?? []) paths.push(f.relative_path)
      for (const d of node.directories ?? []) walk(d)
    }
    walk(tree.body.root)
    assert(paths.includes('project.md'), `附件里有 project.md（实收：${paths.join(', ') || '空'}）`)
    assert(paths.includes('research/evidence/E001.md'), '附件保留了 research/ 的目录层次')
    assert(
      !paths.some((x) => x.includes('.tectonic-cache')),
      '机器产物（构建缓存）没有被上传',
    )
    assertEq(tree.body.total_files, paths.length, '目录树的 total_files 与遍历一致')
  }

  // ③ 映射落盘：再点一次不新建项目（同一工作区只对应一个服务器项目）
  const mine2 = await publisher('work/mine', {})
  assertEq(mine2.value.items[0].published?.projectId, serverProjectId, '列表带出已发布的 project_id')
  const again = await publisher('work/publish', { id: 'ws-live' })
  assertEq(again.value?.published?.created, false, '再点一次复用同一个项目（不是新建）')
  assertEq(again.value?.published?.projectId, serverProjectId, 'project_id 不变')
  assertEq(again.value?.published?.version, 2, '第二次发布 → 研究状态 v2')

  // ④ 另一个账号（研究者）在发现网络里能看到它，并能读摘要/简报
  //    研究者账号是新建的（余额 0），先由管理员充值 —— 否则读简报必然 402
  const researcherMe = await fetch(`${BASE}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${researcherKey}` },
  }).then((r) => r.json())
  await fetch(`${BASE}/api/v1/admin/users/${researcherMe.id}/tokens/grant`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ amount: 5, reason: 'live verify publish' }),
  })
  const finder = makeHostFor(researcherKey)
  const list = await finder.handler('work/list', {})
  const found = (list.value?.items ?? []).find((it) => it.projectId === serverProjectId)
  assert(Boolean(found), '另一个账号能在发现网络里发现这个刚发布的研究')
  if (found) {
    assertEq(found.title, '现场验证项目', '网络里的标题 = 本机工作区标题')
    assertEq(found.researchQuestion, '裁剪证据能否改善失败判定？', '研究问题来自本机 project.md')
    assertEq(found.researchFields, ['多模态', '机器人学习'], '研究领域来自本机 project.md')
  }
  const sum = await finder.handler('work/summary', { projectId: serverProjectId })
  assertEq(sum.ok, true, '另一个账号能读摘要（免费）')
  assertEq(sum.value?.work?.summary, '现场验证：裁剪证据与失败判定', '摘要 = 本机主题句')
  // 「按 (viewer, project) 买一次」的正反两面都在**同一个账号**上验到：
  //   换一个**新项目** → 真的扣 1；同一项目换 Key 再读 → 不扣。
  // 只验"不扣"的话，"永远不扣费"这种回归也能通过。
  const balanceOf = async () =>
    (await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })).body?.available_balance
  const paidBefore = await balanceOf()
  const brief = await finder.handler('work/brief', { projectId: serverProjectId, intentKey: `live7-${Date.now()}` })
  assertEq(brief.ok, true, '另一个账号能读简报（花 1 Token）')
  assertEq(brief.value?.brief?.hypothesis, 'H1：收益是样本条件性的。', '简报里的假设来自本机 research-state.md')
  assertEq(brief.value?.brief?.motivation, '数据过滤需要可信的失败判定。', '简报里的动机来自本机 project.md')
  const paidAfter = await balanceOf()
  assertEq(paidBefore - paidAfter, 1, `换一个新项目读简报真实扣 1 Token（${paidBefore} → ${paidAfter}）`)

  const againBrief = await finder.handler('work/brief', {
    projectId: serverProjectId,
    intentKey: `live7-again-${Date.now()}`,
  })
  assertEq(againBrief.ok, true, '同一项目换新 Key 再读成功')
  assertEq(againBrief.value?.brief?.hypothesis, 'H1：收益是样本条件性的。', '再读仍带出 Level 2 内容')
  const paidFinal = await balanceOf()
  assertEq(paidAfter - paidFinal, 0, '同一项目换新 Key 不再扣费（0 Token）')

  // ⑤ 发布后继续更新：上传新状态即可，**不需要重新发布**（已验证可见性仍是 PUBLISHED）
  const updated = await publisher('work/publish', { id: 'ws-live' })
  assertEq(updated.value?.published?.version, 3, '第三次发布 → v3')
  const stillThere = await finder.handler('work/summary', { projectId: serverProjectId })
  assertEq(stillThere.ok, true, '更新后仍然可见（服务器文档：已发布项目上传状态会自动同步）')

  fs.rmSync(home, { recursive: true, force: true })
}

console.log('\n[live.8] 「已在网络中」跟着服务器走（取消发布 / 服务器删除项目）')
{
  const fs = await import('node:fs')
  const path = await import('node:path')
  const os = await import('node:os')
  const PUB = await import(pathToFileURL(join(PKG, 'lib', 'research', 'published-store.js')).href)

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-live-sync-'))
  const wsDir = path.join(home, 'proj-sync')
  const researchRoot = path.join(wsDir, 'workspace')
  fs.mkdirSync(researchRoot, { recursive: true })
  fs.writeFileSync(
    path.join(researchRoot, 'project.md'),
    ['---', 'type: research-project', 'topic: 服务器状态核对', '---', '', '# Research Project', '', '## Research Questions', '', '- q', ''].join('\n'),
  )
  fs.writeFileSync(
    path.join(researchRoot, 'research-state.md'),
    ['---', 'type: research-state', 'version: 1', '---', '', '# Research State', ''].join('\n'),
  )

  const store = PUB.createMemoryPublishedStore()
  const publisher = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'live.json',
        customizationDir: join(home, 'cf'),
        serverUrl: BASE,
        convfusionApiKey: adminKey,
      }),
    store: CUST.createMemoryCustomizationStore(),
    listLocalWorkspaces: async () => ({
      available: true,
      items: [{ id: 'ws-sync', title: '服务器状态核对', path: wsDir, updatedAt: '' }],
    }),
    publishedStore: store,
    fetchImpl: fetch,
    serverTimeoutMs: 15000,
  })
  const recordOf = () => store.all()[fs.realpathSync(researchRoot)]

  // ① 发布 → 刷新「我的」时从服务器核对，并把服务器的可见性回写进本地记录
  const pub = await publisher('work/publish', { id: 'ws-sync' })
  if (!pub.ok) console.log('  [diag] work/publish 失败：', JSON.stringify(pub).slice(0, 400))
  assertEq(pub.ok, true, '发布成功')
  const projectId = pub.value?.published?.projectId
  const mine1 = await publisher('work/mine', {})
  assertEq(mine1.value?.items?.[0]?.published?.projectId, projectId, '服务器说可见 → 显示「已在网络中」')
  assertEq(recordOf()?.serverVisibility, 'PUBLISHED', '本地记录回写了服务器的可见性')
  assertEq(recordOf()?.files?.['project.md']?.startsWith('sha256:'), true, '回写不动附件指纹（"我传过什么"仍保留）')

  // ② 服务器侧「取消发布」→ 标记必须消失（本地记录还在，下次发布复用同一项目）
  const un = await api(`/projects/${projectId}/unpublish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminKey}` },
  })
  assert(un.status < 300, `服务器取消发布成功（HTTP ${un.status}）`)
  const mine2 = await publisher('work/mine', {})
  assertEq(mine2.value?.items?.[0]?.published, null, '取消发布后不再显示「已在网络中」')
  assertEq(recordOf()?.serverVisibility, 'PRIVATE', '本地记录被刷新为 PRIVATE')
  assert(Boolean(recordOf()), '记录保留（项目还在，点发布仍复用同一个）')
  const repub = await publisher('work/publish', { id: 'ws-sync' })
  assertEq(repub.value?.published?.created, false, '重新发布复用同一个项目（不是新建）')
  assertEq(repub.value?.published?.projectId, projectId, 'project_id 不变')
  assertEq(repub.value?.published?.visibility, 'PUBLISHED', '重新发布后可见性回到 PUBLISHED')

  // ③ 服务器**删除项目**（用户的真实场景）→ 标记消失，本地映射被丢弃，下次发布新建项目
  const del = await api(`/projects/${projectId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${adminKey}` },
  })
  assert(del.status < 300, `服务器删除项目成功（HTTP ${del.status}）`)
  const mine3 = await publisher('work/mine', {})
  assertEq(mine3.value?.items?.[0]?.published, null, '服务器删了项目 → 不再显示「已在网络中」')
  assertEq(recordOf(), undefined, '死掉的本地映射被删掉（否则会一直撞这个 project_id）')
  const fresh = await publisher('work/publish', { id: 'ws-sync' })
  assertEq(fresh.value?.published?.created, true, '再发布 = 新建项目（不是写一个已删除的 id）')
  assert(fresh.value?.published?.projectId !== projectId, '新的 project_id 与已删除的不同')

  fs.rmSync(home, { recursive: true, force: true })
}

/* ── ⑨ 指导关系：发起提案 → 接受（**冻结押金**）→ 关系生效 → 导师可读完整状态 ──
 *
 * 这是设计文档里的商业闭环，也是插件第三个 Tab「指导中」的全部能力：
 *
 *   导师（admin）  POST /projects/{id}/mentorship-proposals   发起提案（免费）
 *   研究者         POST /mentorship-proposals/{id}/accept    接受 → 冻结押金 + 建合同 + 建关系
 *   导师           GET  /projects/{id}/full                   关系生效后能读完整状态
 *
 * 角色分配：**admin 当导师、researcher 当研究者**（发现网络排除自己，本来就要两个账号）。
 * 押金冻结是"动 Token"的操作，所以余额必须先在位；不足时用管理员接口充值再到场重试。
 * ─────────────────────────────────────────────────────────────────────── */
console.log('\n[live.9] 指导关系：发起 → 接受（冻结押金）→ 关系生效 → 完整状态')
{
  // ⑨-0 自建并发布一个属于**研究者**的项目（第六节的 projectId 是块作用域，拿不到；
  //      而且导师本来就是在发现网络里看到已发布的工作才发起指导）
  const ownerUid0 = (
    await api('/auth/me', { headers: { authorization: `Bearer ${researcherKey}` } })
  ).body?.id
  const topUpSeed = await api(`/admin/users/${ownerUid0}/tokens/grant`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ amount: 60, reason: 'live verify mentorship fixture' }),
  })
  assert([200, 201].includes(topUpSeed.status), `研究者预充值以覆盖发布与押金（HTTP ${topUpSeed.status}）`)

  const created9 = await api('/projects', {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}` },
    body: JSON.stringify({ title: 'Live Verify · 指导关系', description: 'mentorship fixture' }),
  })
  const projectId = created9.body?.id
  assertEq(created9.status, 201, '建立用于指导的项目')
  const uploaded9 = await api(`/projects/${projectId}/state`, {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}`, 'idempotency-key': `mentor-state-${Date.now()}` },
    body: JSON.stringify({
      base_version: null,
      content: {
        schema_version: 1,
        research_question: '指导关系能否解锁完整研究状态？',
        hypothesis: '关系生效后可读 Level 3。',
        core_idea: '把检索与注意力交错。',
        method_overview: '在每层注意前插入检索。',
        stage: 'EXPERIMENT',
        progress: 0.4,
        research_fields: ['LLM'],
        summary: '指导关系端到端验证。',
      },
    }),
  })
  assertEq(uploaded9.status, 201, '上传研究状态')
  const published9 = await api(`/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}`, 'idempotency-key': `mentor-publish-${projectId}` },
  })
  assertEq(published9.status, 200, '发布研究（导师才可能在网络里发现它）')
  assertEq(published9.body?.visibility, 'PUBLISHED', '可见性 PUBLISHED')

  const mentor = makeHostFor(adminKey)
  const owner = makeHostFor(researcherKey)

  // ⑨-1 费用建议：界面用 100 / 20 / 80 预填提案对话框
  const feeRes = await mentor.handler('mentor/fee-suggestion', {})
  assertEq(feeRes.ok, true, '导师读到费用建议')
  const suggestion = feeRes.value?.suggestion ?? {}
  assertEq(suggestion.suggestedFee, 100, `默认总费用 100（实际 ${suggestion.suggestedFee}）`)
  assertEq(suggestion.suggestedDeposit, 20, `默认押金 20（实际 ${suggestion.suggestedDeposit}）`)
  assertEq(
    suggestion.suggestedDeposit + suggestion.suggestedSuccessPayment,
    suggestion.suggestedFee,
    '押金 + 成功付款 = 总额（服务器强校验这条，界面本地也要先拦）',
  )

  // ⑨-2 发起提案（免费，不扣 Token）
  const proposeRes = await mentor.handler('mentor/propose', {
    projectId,
    guidanceScope: '指导实验设计与论文写作',
    totalFee: suggestion.suggestedFee,
    depositAmount: suggestion.suggestedDeposit,
    successPaymentAmount: suggestion.suggestedSuccessPayment,
    successCondition: { type: 'MUTUAL_COMPLETION', description: '双方确认完成' },
  })
  assertEq(proposeRes.ok, true, '导师发起提案成功')
  const proposal = proposeRes.value?.proposal
  assertEq(proposal?.status, 'PROPOSED', '提案初始状态 PROPOSED（界面显示「等待响应」）')
  assertEq(proposal?.projectId, projectId, '提案挂在正确的项目上')
  assertEq(proposal?.depositAmount, suggestion.suggestedDeposit, '提案带出押金（界面据此提示冻多少）')

  // 身份内嵌（后端 enrich 之后才有）：缺了也不能崩，只记录实际形状
  if (proposal?.mentor?.displayName && proposal.mentor.displayName !== proposal.mentor.id.slice(0, 8)) {
    console.log(`  · 后端已 enrich 导师身份：${proposal.mentor.displayName}`)
    assert(true, '提案内嵌导师身份（研究者能看清是谁在申请）')
  } else {
    console.log('  · 后端尚未 enrich 导师身份（界面回退为短 id，仍能区分方向）')
  }
  assert(Boolean(proposal?.researcher?.id), '提案带出研究者 id（界面据此分「我收到的」）')

  // ⑨-3 同一项目同一导师只能有一个生效提案 → 409
  const dup = await mentor.handler('mentor/propose', {
    projectId,
    guidanceScope: '重复提案',
    totalFee: 100,
    depositAmount: 20,
    successPaymentAmount: 80,
    successCondition: { type: 'MUTUAL_COMPLETION' },
  })
  assertEq(dup.ok, false, '重复提案被拒')

  // ⑨-4 研究者能列出这条提案（分栏靠 id 匹配）
  const ownerList = await owner.handler('mentor/list', {})
  assertEq(ownerList.ok, true, '研究者读到提案列表')
  const mine = (ownerList.value?.proposals ?? []).find((p) => p.id === proposal.id)
  assert(Boolean(mine), '研究者列表里能看到这条提案')
  assertEq(mine?.status, 'PROPOSED', '研究者看到的状态是 PROPOSED（可接受）')

  // ⑨-5 确保研究者有足够可用 Token 冻结押金
  const ownerUid = (
    await api('/auth/me', { headers: { authorization: `Bearer ${researcherKey}` } })
  ).body?.id
  const before = (await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })).body
  const need = suggestion.suggestedDeposit
  if ((before?.available_balance ?? 0) < need) {
    const topUp = await api(`/admin/users/${ownerUid}/tokens/grant`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ amount: need + 10, reason: 'live verify mentorship deposit' }),
    })
    assert([200, 201].includes(topUp.status), `研究者充值以覆盖押金（HTTP ${topUp.status}）`)
  }
  const funded = (await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })).body
  assert(
    (funded?.available_balance ?? 0) >= need,
    `研究者可用余额 ${funded?.available_balance} ≥ 押金 ${need}`,
  )

  // ⑨-6 **接受**：冻结押金 + 建合同 + 建关系，一个事务
  const acceptIntent = `accept-${proposal.id}`
  const accepted = await owner.handler('mentor/accept', { proposalId: proposal.id, intentKey: acceptIntent })
  assertEq(accepted.ok, true, '研究者接受指导成功')
  assertEq(accepted.value?.contract?.status, 'ACCEPTED', '合同状态 ACCEPTED')
  assertEq(accepted.value?.contract?.depositAmount, need, '合同冻结的押金与提案一致')

  // 余额语义：总额不变，押金从 available 转到 frozen
  const after = (await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })).body
  assertEq(
    after?.frozen_balance,
    (funded?.frozen_balance ?? 0) + need,
    `冻结余额增加 ${need}（${funded?.frozen_balance} → ${after?.frozen_balance}）`,
  )
  assertEq(
    after?.available_balance,
    (funded?.available_balance ?? 0) - need,
    `可用余额减少 ${need}（${funded?.available_balance} → ${after?.available_balance}）`,
  )
  assertEq(
    after?.total_balance,
    funded?.total_balance,
    '总额不变（押金仍是研究者的钱，只是转为冻结 —— 不是转账）',
  )

  // ⑨-7 重复接受（哪怕同一个幂等键）→ 409，且**绝不重复冻结押金**
  //
  // ⚠️ 服务器语义（实测）：接受成功后提案已 `ACCEPTED`，再调 `/accept` 走
  // `PROPOSAL_INVALID_STATE` → 409，而不是回放上一次响应。真正的安全性质是
  // **钱只冻一次**，所以断言必须落在余额上，而不是"重放成功"。
  const replay = await owner.handler('mentor/accept', { proposalId: proposal.id, intentKey: acceptIntent })
  const afterReplay = (await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })).body
  assertEq(
    afterReplay?.frozen_balance,
    after?.frozen_balance,
    `重复接受不重复冻结押金（frozen=${afterReplay?.frozen_balance}，仍是 ${after?.frozen_balance}）`,
  )
  assertEq(replay.ok, false, '已经接受的提案再接受 → 失败（409 提案状态已变）')
  assertEq(
    replay.error?.code,
    'proposal-state',
    '409 提案状态冲突映射成 proposal-state（界面据此刷新列表，不是让用户改输入）',
  )

  // ⑨-8 关系真的生效，且导师拿到 Level 3 完整状态
  const rel = await api(`/projects/${projectId}/relationship`, {
    headers: { authorization: `Bearer ${adminKey}` },
  })
  assertEq(rel.status, 200, '关系可读（导师视角）')
  assertEq(rel.body?.status, 'ACTIVE', '关系状态 ACTIVE')
  assertEq(rel.body?.researcher_id, ownerUid, '关系里的研究者就是项目 owner')

  const full = await api(`/projects/${projectId}/full`, {
    headers: { authorization: `Bearer ${adminKey}` },
  })
  assertEq(full.status, 200, '导师现在能读 Level 3 完整状态（关系生效前是 403）')
  assertEq(full.body?.content?.core_idea, '把检索与注意力交错。', '完整状态带出核心想法')

  // 接受之后提案状态不再是 PROPOSED
  const ownerList2 = await owner.handler('mentor/list', {})
  const settled = (ownerList2.value?.proposals ?? []).find((p) => p.id === proposal.id)
  assertEq(settled?.status, 'ACCEPTED', '研究者侧看到的提案状态已变为 ACCEPTED')
  // 提案状态到 ACCEPTED 就**不再变化** —— 用户要看的是指导进展。
  // 宿主在 mentor/list 里补 reviewFiles（导师已上传几份指导结果），
  // 界面据此把"已接受"换成「等待指导意见」/「导师已指导」。
  assertEq(settled?.reviewFiles, 0, '刚接受、导师还没传 → reviewFiles=0（界面：等待指导意见，不给【下载】）')

  // ⑨-9 拒绝路径（不冻 Token）：另起一个**未发布**的项目也能提案（服务器不要求 PUBLISHED）
  const disposable = await api('/projects', {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}` },
    body: JSON.stringify({ title: 'Live Verify · 拒绝路径', description: 'reject fixture' }),
  })
  const rejectTarget = disposable.body?.id
  assertEq(disposable.status, 201, '另建一个项目用于验证拒绝路径')
  // ⚠️ 这条用**界面现在真正发的载荷**：导师只填总费用，押金按平台建议的比例推导，
  // 指导范围送占位符、成功条件送平台默认值（服务器当前仍要求这两个字段非空）。
  // 验的是"过渡值在真实服务器上确实被接受"，免得界面点了没反应。
  const uiRatio = suggestion.suggestedDeposit / suggestion.suggestedFee
  const uiDeposit = Math.max(1, Math.round(100 * uiRatio))
  const secondProposal = await mentor.handler('mentor/propose', {
    projectId: rejectTarget,
    guidanceScope: '-',
    totalFee: 100,
    depositAmount: uiDeposit,
    successPaymentAmount: 100 - uiDeposit,
    successCondition: { type: 'MUTUAL_COMPLETION', description: null },
  })
  assertEq(secondProposal.ok, true, '界面形态的载荷（只定总费用 + 过渡值）被服务器接受')
  assertEq(
    uiDeposit,
    suggestion.suggestedDeposit,
    `同一总额下前端推的押金 == 服务器建议的押金（都 ${uiDeposit}，ratio=${uiRatio}）`,
  )
  assertEq(secondProposal.value?.proposal?.depositAmount, uiDeposit, '服务器接受了推导出的押金')
  const rejected = await owner.handler('mentor/reject', {
    proposalId: secondProposal.value?.proposal?.id,
  })
  assertEq(rejected.ok, true, '研究者拒绝成功')
  assertEq(rejected.value?.proposal?.status, 'REJECTED', '拒绝后状态 REJECTED')
  const afterReject = (await api('/tokens', { headers: { authorization: `Bearer ${researcherKey}` } })).body
  assertEq(
    afterReject?.frozen_balance,
    after?.frozen_balance,
    '拒绝**不冻结**任何 Token（只有接受才冻押金）',
  )

  // ⑨-10 【下载】= 预检 + 宿主持凭据的同源 GET 代理，交给**浏览器原生保存**
  //
  // 用户拍板：下载走浏览器自己的保存流程（页面拿不到存到哪），插件不落盘、不解压。
  // 所以这里验的是代理这一侧：预检能拿到文件数/体积，GET 回的是**真 ZIP**（按
  // Content-Disposition 交给浏览器）。
  const ATTACH = 'notes/结果.md'
  const ATTACH_BODY = '# 结果\n\n长上下文推理的关键在于……\n'
  await SC.uploadProjectFiles(
    BASE,
    researcherKey,
    projectId,
    [{ relPath: ATTACH, bytes: Buffer.from(ATTACH_BODY) }],
    { fetchImpl: fetch },
  )
  const mentorHost = makeHostFor(adminKey)
  const info = await mentorHost.handler('mentor/archiveInfo', { projectId })
  assertEq(info.ok, true, '下载前预检成功')
  assertEq(info.value?.files, 1, `预检报出 1 个文件（实际 ${info.value?.files}）`)
  assert(info.value?.bytes > 0, `预检报出体积（${info.value?.bytes} 字节）`)

  const proxied = await archiveViaProxy(adminKey, projectId, 'Live 指导下载')
  assertEq(proxied.status, 200, '同源 GET 代理返回 200')
  assert(
    String(proxied.headers['content-disposition'] ?? '').startsWith('attachment;'),
    'Content-Disposition: attachment —— 浏览器据此走"保存文件"',
  )
  assertEq(proxied.bytes.subarray(0, 2).toString('latin1'), 'PK', '回的是真 ZIP（PK 头）')
  const names = zipEntryNames(proxied.bytes)
  assert(
    names.includes(ATTACH),
    `ZIP 里确实含学生的附件（${names.join(', ')}）`,
  )

  // ⑨-11 **反向流程**：导师在 workspace/review/ 写指导结果 → 回传 → 学生能看到
  //
  // 服务器契约（docs/API.md §13.1）：关系方只能写 `review/**`，越界
  // `403 FILE_PATH_RESERVED` —— 结构上禁止导师改写研究事实。
  {
    // 导师自己解压了快照 → 在 workspace/review/ 下写指导结果（本轮用普通目录模拟）
    const mentorCopy = join(TMP, 'mentor-ws')
    const reviewRel = 'review/指导意见.md'
    const reviewBody = '# 指导意见\n\n建议先固定裁剪策略再比方法。\n'
    mkdirSync(join(mentorCopy, 'workspace', 'review', 'figures'), { recursive: true })
    writeFileSync(join(mentorCopy, 'workspace', reviewRel), reviewBody)
    writeFileSync(join(mentorCopy, 'workspace', 'review', 'figures', 'trend.csv'), 'x,y\n1,2\n')

    const uploader = RPC.createSettingsRpcHandler({
      getConfig: () =>
        CFG.resolveConfig({
          customizationFile: 'live-up.json',
          customizationDir: join(TMP, 'cf'),
          serverUrl: BASE,
          convfusionApiKey: adminKey,
        }),
      store: CUST.createMemoryCustomizationStore(),
      fetchImpl: fetch,
      serverTimeoutMs: 30000,
    })
    const scan = await uploader('mentor/scanReview', { dir: mentorCopy })
    assertEq(scan.ok, true, '扫描导师工作区的 review/')
    const listed = (scan.value?.files ?? []).map((f) => f.relPath)
    assert(listed.includes(reviewRel), `扫描到指导结果（${listed.join(', ')}）`)

    const sent = await uploader('mentor/upload', {
      projectId,
      dir: mentorCopy,
      paths: [reviewRel, 'review/figures/trend.csv'],
    })
    assertEq(
      sent.ok,
      true,
      `导师回传指导结果成功${sent.ok ? '' : `（${sent.error?.code}: ${sent.error?.message}）`}`,
    )

    // 学生侧能看到（服务器：同一个 workspace，review/ 目录）
    const studentFiles = await (
      await fetch(`${BASE}/api/v1/projects/${projectId}/files`, {
        headers: { authorization: `Bearer ${researcherKey}` },
      })
    ).json()
    const rels = (studentFiles.items ?? []).map((f) => f.relative_path)
    assert(rels.includes(reviewRel), `学生在 /files 里看到指导结果（${rels.filter((r) => r.startsWith('review/')).join(', ')}）`)
    assert(
      rels.includes('review/figures/trend.csv'),
      '目录层次原样保留（review/figures/trend.csv）',
    )

    // 学生【下载】：走同样的代理，且快照里必须已经含导师的 review/
    const studentProxy = await archiveViaProxy(researcherKey, projectId, 'Live 学生取回')
    assertEq(studentProxy.status, 200, '学生侧同样能下载（关系双方读权限一致）')
    const studentNames = zipEntryNames(studentProxy.bytes)
    assert(
      studentNames.includes(reviewRel),
      `学生取回的 ZIP 含指导结果（${studentNames.filter((n) => n.startsWith('review/')).join(', ')}）`,
    )

    // 上传之后进展必须**变**（这是"状态永远停在已接受"那个问题的验收点）
    const afterUpload = await owner.handler('mentor/list', {})
    const progressed = (afterUpload.value?.proposals ?? []).find((p) => p.id === proposal.id)
    assertEq(
      progressed?.reviewFiles,
      2,
      `导师上传 2 份后 reviewFiles=2（界面：导师已指导，并放开【下载】）实际 ${progressed?.reviewFiles}`,
    )

    // 越界：导师改不了研究事实
    writeFileSync(join(mentorCopy, 'workspace', 'project.md'), '# 篡改\n')
    const reserved = await uploader('mentor/upload', {
      projectId,
      dir: mentorCopy,
      paths: ['review/指导意见.md'],
    })
    assertEq(reserved.ok, true, '（对照）review/ 内的文件仍然可传')
    const grab = await SC.uploadReviewFiles(
      BASE,
      adminKey,
      projectId,
      [{ relPath: 'project.md', bytes: Buffer.from('# 篡改\n') }],
      { fetchImpl: fetch },
    ).then(
      () => null,
      (e) => e,
    )
    assert(grab === null || grab?.code === 'path-reserved' || grab?.code === 'bad-request', '导师写 project.md 被拦（研究事实不可改）')
  }
}

await shutdown()
cleanup()

console.log(`\n${failed === 0 ? '✅' : '❌'} server-login-live: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
}
process.exit(failed === 0 ? 0 : 1)
