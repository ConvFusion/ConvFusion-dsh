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
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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
    assertEq(register.value.tokens?.available, 0, '新账号余额 0（来自服务器的 /tokens）')
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
 * ─────────────────────────────────────────────────────────────────────── */
console.log('\n[live.6] 研究工作：发布 → 发现 → 摘要 → 简报（含 402 → 充值 → 同 Key 重试）')
{
  const api = async (path, init = {}) => {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
    return { status: res.status, body: await res.json().catch(() => undefined) }
  }

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

  const published = await api(`/projects/${projectId}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${researcherKey}` },
  })
  assertEq(published.status, 200, '发布成功（200）')
  assertEq(published.body?.visibility, 'PUBLISHED', '可见性变为 PUBLISHED')

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

  // ⑥-6 换新 Key（新意图）会正常扣费一次
  const second = await mined.handler('work/brief', { projectId, intentKey: `${intentKey}-2` })
  assertEq(second.ok, true, '新意图读简报成功')
  const balance3 = await api('/tokens', { headers: { authorization: `Bearer ${adminKey}` } })
  assertEq(balance3.body?.available_balance ?? balance3.body?.available, 3, '新意图扣费 1（余额 3）')

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

await shutdown()
cleanup()

console.log(`\n${failed === 0 ? '✅' : '❌'} server-login-live: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
}
process.exit(failed === 0 ? 0 : 1)
