#!/usr/bin/env node
/**
 * ConvFusion — **分阶段上传 / 后台上传任务**离线验证（v0.7.3 / 协议 34）
 *
 * 覆盖两半：
 *
 * ```text
 * src/research/workspace-upload.ts   清单 → 只传缺的 → complete（含丢 ACK / 取消 / 失败收尾）
 * src/settings-rpc.ts                upload/start · upload/status · upload/cancel（作业壳）
 * ```
 *
 * 为什么这些必须在离线钉住：它们跑在**网络半路**上，出错的方式都很安静 ——
 * 重复开作业（服务器 409 后整台工作区被锁 24 小时）、重传已验证的批次（翻倍占空间）、
 * 取消没清干净（pending 作业挡住改名/发布）、失败没 `DELETE`（第二天用户莫名其妙发不出去）。
 *
 * 用桩 `fetch` 把服务器那一侧的行为写成可控的脚本：`/projects/{id}/uploads…` 一族。
 *
 * 用法：`node scripts/verify-upload-tasks.mjs .`
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

let passed = 0
let failed = 0
const failures = []
function assert(cond, label) {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) console.log(`    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expected)}`)
  assert(ok, label)
}

const sha = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`
const tick = (ms = 0) => new Promise((done) => setTimeout(done, ms))

const UP = await import(lib('research/workspace-upload.js'))
const RPC = await import(lib('settings-rpc.js'))
const CUST = await import(lib('research/skill-customization.js'))
const PUB = await import(lib('research/published-store.js'))
const CFG = await import(lib('config.js'))

const KEY = 'cf_live_upload_fixture'
const BASE = 'https://fixture.example.com'

/* ── 夹具：一个真的研究根（transferWorkspace 会读盘 + realpath 校验）────── */
const TMP = await mkdtemp(join(tmpdir(), 'cf-upload-tasks-'))
const WS = join(TMP, 'ws')
const ROOT = join(WS, 'workspace')
await mkdir(join(ROOT, 'sub'), { recursive: true })
const PROJECT_MD = Buffer.from('---\ntype: research-project\n---\n')
const DATA_JSON = Buffer.from('{"ok":true}\n')
await writeFile(join(ROOT, 'project.md'), PROJECT_MD)
await writeFile(join(ROOT, 'sub', 'data.json'), DATA_JSON)
const FILES = [
  { path: 'project.md', bytes: PROJECT_MD },
  { path: 'sub/data.json', bytes: DATA_JSON },
]

/* ── 桩服务器：`/projects/{id}/uploads` 一族 ────────────────────────────── */
/**
 * 造一个可控的"服务器"。
 *
 * @param over 覆盖项：
 *   - `needed(map)`: 决定哪些索引是缺的（默认全缺）
 *   - `failStart`: 第一次 `POST /uploads` 抛网络错误（启动 ACK 丢失）
 *   - `failStage`: 第一次 `PUT …/files` 抛网络错误（批次 ACK 丢失）
 *   - `failComplete`: 第一次 `POST …/complete` 抛网络错误（完成 ACK 丢失）
 *   - `completeError`: `complete` 回 409（业务失败）
 *   - `inProgress`: `POST /uploads` 回 409 UPLOAD_IN_PROGRESS
 *   - `active`: `GET /active` 回什么
 */
function makeServer(over = {}) {
  const jobs = new Map()
  const calls = []
  let failStart = Boolean(over.failStart)
  let failStage = Boolean(over.failStage)
  let failStageAfter = Boolean(over.failStageAfter)
  let failComplete = Boolean(over.failComplete)
  let completed = 0
  let deleted = 0
  let stagedBatches = []

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fail = (code, status = 409) => json({ error: { code, message: code, details: {} } }, status)
  const network = () => {
    throw new Error('fetch failed (simulated lost ACK)')
  }
  /** 挂住一个请求直到 `gate` 放行；`signal` 中断时立刻拒绝（模拟真实 fetch）。 */
  const waitAbortable = (gate, signal) =>
    new Promise((done, reject) => {
      if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
      const onAbort = () => reject(signal.reason ?? new Error('aborted'))
      signal?.addEventListener('abort', onAbort, { once: true })
      void gate.then(() => {
        signal?.removeEventListener('abort', onAbort)
        done()
      })
    })

  const fetchImpl = async (url, init = {}) => {
    const raw = String(url)
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ method, url: raw })
    // 只关心上传接口；其余一律 404（这些用例不碰别的端点）
    const m = /\/projects\/([^/]+)\/uploads(.*)$/.exec(raw)
    if (!m) return json({ error: { code: 'NOT_FOUND', message: 'nope', details: {} } }, 404)
    const [, projectId, suffix] = m
    let body = init.body
    if (typeof body === 'string') body = JSON.parse(body)

    if (!suffix && method === 'POST') {
      if (failStart) {
        failStart = false
        network()
      }
      if (over.inProgress) return fail('UPLOAD_IN_PROGRESS')
      const manifest = body
      const prior = jobs.get(manifest.id)
      if (prior) {
        // 同一个 id 必须是**同一份清单**（服务器 `UPLOAD_ID_REUSED` 的语义）
        if (prior.hash !== JSON.stringify(manifest.files)) return fail('UPLOAD_ID_REUSED')
        return json(statusOf(prior))
      }
      const needed = over.needed
        ? manifest.files.map((f, i) => i).filter((i) => over.needed.includes(i))
        : manifest.files.map((_, i) => i)
      const job = { id: manifest.id, files: manifest.files, received: [], needed, receipt: null, status: 'pending' }
      job.hash = JSON.stringify(manifest.files)
      jobs.set(job.id, job)
      return json(statusOf(job))
    }
    if (suffix === '/active' && method === 'GET') {
      if (over.active === undefined) return json(null)
      return json(over.active)
    }
    const jobMatch = /^\/([^/]+)(\/files|\/complete)?$/.exec(suffix)
    if (!jobMatch) return json({ error: { code: 'NOT_FOUND', message: 'nope', details: {} } }, 404)
    const job = jobs.get(jobMatch[1])
    if (!job) return json({ error: { code: 'PROJECT_NOT_FOUND', message: 'no job', details: {} } }, 404)
    if (jobMatch[2] === '/files' && method === 'PUT') {
      if (over.gateStage) await waitAbortable(over.gateStage, init.signal)
      if (failStage) {
        failStage = false
        network()
      }
      const indexes = body.getAll('indexes').map(Number)
      // 逐字节对清单校验（服务器真实行为：size + sha256 不符 → 422）
      const files = body.getAll('files')
      for (let i = 0; i < indexes.length; i += 1) {
        const index = indexes[i]
        const expected = job.files[index]
        const bytes = Buffer.from(await files[i].arrayBuffer())
        if (bytes.length !== expected.size || sha(bytes) !== expected.sha256) {
          return json({ error: { code: 'INVALID_FILE', message: 'checksum', details: {} } }, 422)
        }
        if (!job.received.includes(index)) job.received.push(index)
      }
      stagedBatches.push(indexes)
      // 批次 ACK 丢失的**真实**形态：服务器收下了，但响应没回来（所以客户端必须先 GET 核对）
      if (failStageAfter) {
        failStageAfter = false
        network()
      }
      return json({ received: indexes })
    }
    if (jobMatch[2] === '/complete' && method === 'POST') {
      if (failComplete) {
        failComplete = false
        network()
      }
      if (over.completeError) return fail(over.completeError)
      if (!job.needed.every((i) => job.received.includes(i))) return fail('UPLOAD_INCOMPLETE')
      job.status = 'completed'
      completed += 1
      job.receipt = {
        uploaded: job.needed.length,
        uploaded_bytes: job.needed.reduce((n, i) => n + job.files[i].size, 0),
        total_files: job.files.length,
        skipped_existing: job.files.length - job.needed.length,
        version: 7,
        content_hash: 'sha256:deadbeef',
      }
      return json(statusOf(job))
    }
    if (!jobMatch[2] && method === 'DELETE') {
      deleted += 1
      job.status = job.status === 'completed' ? 'completed' : 'cancelled'
      job.received = job.status === 'cancelled' ? [] : job.received
      return json(statusOf(job))
    }
    if (!jobMatch[2] && method === 'GET') return json(statusOf(job))
    return json({ error: { code: 'NOT_FOUND', message: 'nope', details: {} } }, 404)
  }

  function statusOf(job) {
    return {
      id: job.id,
      status: job.status,
      received: job.status === 'pending' ? job.received : [],
      needed: job.status === 'pending' ? job.needed : [],
      received_bytes: job.received.reduce((n, i) => n + job.files[i].size, 0),
      total_bytes: job.needed.reduce((n, i) => n + job.files[i].size, 0),
      total_files: job.files.length,
      receipt: job.receipt,
    }
  }

  return {
    fetchImpl,
    jobs,
    calls,
    stats: () => ({ completed, deleted, stagedBatches }),
  }
}

const control = () => ({
  signal: new AbortController().signal,
  progress: { doneFiles: 0, totalFiles: 0, sentBytes: 0, totalBytes: 0, running: true },
  finishing: false,
})

const transfer = (server, extra = {}) => {
  const ctl = extra.control ?? control()
  return UP.transferWorkspace({
    base: BASE,
    apiKey: KEY,
    projectId: 'p1',
    root: ROOT,
    paths: FILES.map((f) => f.path),
    options: { fetchImpl: server.fetchImpl },
    control: ctl,
    timeoutForBytes: () => 10_000,
    ...extra,
  }).then((result) => ({ result, ctl }))
}

/* ════════════════════════════════════════════════════════════════════════ */
console.log('\n[1] 清单 → 只传缺的 → complete')
{
  const server = makeServer()
  const { result, ctl } = await transfer(server)
  const start = server.calls.find((c) => c.method === 'POST' && c.url.endsWith('/uploads'))
  assert(start !== undefined, '先发清单（POST /uploads）')
  const manifest = server.jobs.get(result.jobId)
  assert(manifest.files.length === 2, '清单两项')
  assert(
    manifest.files.every((f) => /^sha256:[0-9a-f]{64}$/.test(f.sha256)),
    '清单里的 sha256 带 `sha256:` 前缀（服务器正则要求）',
  )
  assertEq(result.receipt.uploaded, 2, '回执：上传 2 个')
  assertEq(result.receipt.skippedExisting, 0, '回执：0 个已存在')
  assertEq(result.receipt.version, 7, '回执带研究状态版本（owner 路径要用它）')
  assertEq(ctl.progress.doneFiles, 2, '进度：完成 2 个')
  assertEq(ctl.progress.running, true, '进度记录的 running 由作业层负责收尾（这里仍为 true）')
  assertEq(server.stats().deleted, 0, '成功路径不 DELETE')
}

console.log('\n[2] 服务器已经有 → 只传缺的')
{
  const server = makeServer({ needed: [1] })
  const { result, ctl } = await transfer(server)
  assertEq(server.stats().stagedBatches, [[1]], '只暂存索引 1（索引 0 服务器已有）')
  assertEq(result.receipt.skippedExisting, 1, '回执如实说跳过了 1 个')
  assertEq(ctl.progress.totalFiles, 1, '进度总数只算缺的')
}

console.log('\n[3] 启动 ACK 丢失 → 同一个 id 重发（不重复开作业）')
{
  const server = makeServer({ failStart: true })
  const { result } = await transfer(server)
  const starts = server.calls.filter((c) => c.method === 'POST' && /\/uploads$/.test(c.url))
  assertEq(starts.length, 2, '启动了两次（第一次 ACK 丢失 → 重发）')
  const ids = [...server.jobs.keys()]
  assertEq(ids.length, 1, '服务器上只有一个作业（同一个 id）')
  assertEq(result.jobId, ids[0], '回执里的作业就是那一个')
}

console.log('\n[4] 批次 ACK 丢失（服务器已收下）→ GET 核对，不重传已验证的批次')
{
  const server = makeServer({ failStageAfter: true })
  const { result } = await transfer(server)
  const puts = server.calls.filter((c) => c.method === 'PUT')
  assertEq(puts.length, 1, '只发了一次 PUT（已收下的批次没有重传）')
  assertEq(server.stats().stagedBatches.length, 1, '服务器只收到一批（没有重复占空间）')
  assertEq(result.receipt.uploaded, 2, '最终仍然提交成功')
}

console.log('\n[5] 完成 ACK 丢失 → GET 状态收下 completed')
{
  const server = makeServer({ failComplete: true })
  const { result } = await transfer(server)
  assertEq(result.receipt.uploaded, 2, '回执仍然拿到')
  assertEq(server.stats().completed, 1, '服务器只提交了一次')
}

console.log('\n[6] 工作区已有别的作业 → upload-in-progress，且不误删别人的作业')
{
  const server = makeServer({ inProgress: true, active: { id: 'other', status: 'pending', received: [], needed: [0], received_bytes: 0, total_bytes: 10, total_files: 1, receipt: null } })
  let code = ''
  const ctl = control()
  try {
    await transfer(server, { control: ctl })
  } catch (e) {
    code = e?.code ?? e?.message
  }
  assertEq(code, 'upload-in-progress', '错误码 = upload-in-progress')
  assertEq(server.stats().deleted, 0, '不去 DELETE 别人的作业')
  assert(typeof ctl.cancelRemote === 'function', '把"那个作业"的取消动作交给界面（用户不用干等 24 小时）')
}

console.log('\n[7] 提交失败（UPLOAD_INCOMPLETE）→ 必须 DELETE，别让 pending 作业挡住整台工作区')
{
  const server = makeServer({ completeError: 'UPLOAD_INCOMPLETE' })
  let code = ''
  try {
    await transfer(server)
  } catch (e) {
    code = e?.code ?? e?.message
  }
  assertEq(code, 'upload-incomplete', '错误码 = upload-incomplete')
  assertEq(server.stats().deleted, 1, '失败后自动 DELETE（释放工作区）')
}

console.log('\n[8] 取消 → 中断 + DELETE')
{
  let releaseStage
  const gate = new Promise((done) => {
    releaseStage = done
  })
  const server = makeServer({ gateStage: gate })
  const abort = new AbortController()
  const ctl = {
    signal: abort.signal,
    progress: { doneFiles: 0, totalFiles: 0, sentBytes: 0, totalBytes: 0, running: true },
    finishing: false,
  }
  const running = transfer(server, { control: ctl })
  // 等它真的进到"传输中"再取消（否则可能已经传完）
  for (let i = 0; i < 200 && !server.calls.some((c) => c.method === 'PUT'); i += 1) await tick(5)
  assert(server.calls.some((c) => c.method === 'PUT'), '（前提）已经开始了传输')
  abort.abort(new Error('cancelled by user'))
  let aborted = false
  try {
    await running
  } catch {
    aborted = true
  } finally {
    releaseStage()
  }
  assert(aborted, '取消后 transfer 抛错（不静默成功）')
  assert(server.stats().deleted >= 1, '取消会 DELETE 服务器作业')
}

/* ── 作业层：宿主 upload/* ─────────────────────────────────────────────── */
console.log('\n[9] 作业层：start 立即返回 / 重复点同一作业 / status 到终点 / cancel')
{
  const server = makeServer()
  let releaseStage
  const gate = new Promise((done) => {
    releaseStage = done
  })
  // 让第一批暂存挂住，观察"start 立即返回"
  const slowFetch = async (url, init) => {
    if ((init?.method ?? 'GET').toUpperCase() === 'PUT') await gate
    return server.fetchImpl(url, init)
  }
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: join(TMP, 'home'),
        convfusionProdApiKey: KEY,
        serverUrl: BASE,
      }),
    // 地址是 HTTPS 的 fixture → 生产槽（`convfusionProdApiKey`）
    env: { CONVFUSION_ENV: 'production' },
    store: CUST.createMemoryCustomizationStore(),
    publishedStore: PUB.createMemoryPublishedStore(),
    listLocalWorkspaces: async () => ({ items: [{ id: 'ws-1', title: 'fixture', path: WS }] }),
    fetchImpl: slowFetch,
    workspaceUploads: true,
    serverTimeoutMs: 5000,
  })
  const target = { kind: 'mentor', projectId: 'p-1' }
  const start = await handler('upload/start', {
    ...target,
    intent: 'intent-1',
    workspaceId: 'ws-1',
    paths: ['project.md', 'sub/data.json'],
    source: 'mentor',
  })
  assert(start.ok && start.value.result === null, 'start 立即返回（result 为 null = 还在跑）')
  assert(start.value.progress.running === true, 'start 时进度标为 running')

  const again = await handler('upload/start', { ...target, intent: 'intent-2', workspaceId: 'ws-1', paths: ['project.md'] })
  assert(again.ok && again.value.result === null, '重复点【上传】仍是同一个作业（不新开一份）')

  let final = null
  for (let i = 0; i < 100; i += 1) {
    const st = await handler('upload/status', target)
    if (st.value?.result) {
      final = st.value
      break
    }
    await tick(10)
  }
  releaseStage()
  for (let i = 0; i < 100 && !final; i += 1) {
    const st = await handler('upload/status', target)
    if (st.value?.result) final = st.value
    await tick(10)
  }
  assert(final !== null, 'status 最终拿到 result')
  assert(final?.result?.ok === true, '上传成功（result.ok）')
  assertEq(final?.result?.value?.uploaded, 2, '回执里有 uploaded 数字')
  assertEq(final?.canCancel, false, '结束之后没有【取消上传】')
}

console.log('\n[10] 作业层：cancel → upload-cancelled（且不会再提交）')
{
  const server = makeServer()
  let releaseStage
  const gate = new Promise((done) => {
    releaseStage = done
  })
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: join(TMP, 'home'),
        convfusionProdApiKey: KEY,
        serverUrl: BASE,
      }),
    // 地址是 HTTPS 的 fixture → 生产槽（`convfusionProdApiKey`）
    env: { CONVFUSION_ENV: 'production' },
    store: CUST.createMemoryCustomizationStore(),
    publishedStore: PUB.createMemoryPublishedStore(),
    listLocalWorkspaces: async () => ({ items: [{ id: 'ws-1', title: 'fixture', path: WS }] }),
    fetchImpl: async (url, init) => {
      if ((init?.method ?? 'GET').toUpperCase() === 'PUT') await gate
      return server.fetchImpl(url, init)
    },
    workspaceUploads: true,
    serverTimeoutMs: 5000,
  })
  const target = { kind: 'mentor', projectId: 'p-2' }
  const started = await handler('upload/start', {
    ...target,
    intent: 'i-1',
    workspaceId: 'ws-1',
    paths: ['project.md'],
    source: 'mentor',
  })
  assert(started.ok && started.value.canCancel === true, '（前提）上传中可取消')
  const cancelled = await handler('upload/cancel', target)
  assert(cancelled.ok, 'cancel 立刻回 ok（真正的收尾在后台）')
  releaseStage()
  let final = null
  for (let i = 0; i < 200; i += 1) {
    const st = await handler('upload/status', target)
    if (st.value?.result) {
      final = st.value.result
      break
    }
    await tick(10)
  }
  assertEq(final?.ok, false, '取消后的终点不是一个成功回执')
  assertEq(final?.error?.code, 'upload-cancelled', '错误码 = upload-cancelled')
  assertEq(server.stats().completed, 0, '取消的上传绝不会 complete')
}

console.log('\n[11] 宿主重启后：mentor 作业能问服务器 /active（本地没作业）')
{
  const server = makeServer({
    active: {
      id: 'remote-1',
      status: 'pending',
      received: [0],
      needed: [1],
      received_bytes: 10,
      total_bytes: 20,
      total_files: 2,
      receipt: null,
    },
  })
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: join(TMP, 'home'),
        convfusionProdApiKey: KEY,
        serverUrl: BASE,
      }),
    // 地址是 HTTPS 的 fixture → 生产槽（`convfusionProdApiKey`）
    env: { CONVFUSION_ENV: 'production' },
    store: CUST.createMemoryCustomizationStore(),
    publishedStore: PUB.createMemoryPublishedStore(),
    listLocalWorkspaces: async () => ({ items: [{ id: 'ws-1', title: 'fixture', path: WS }] }),
    fetchImpl: server.fetchImpl,
    workspaceUploads: true,
    serverTimeoutMs: 5000,
  })
  const st = await handler('upload/status', { kind: 'mentor', projectId: 'p-3' })
  assert(st.ok && st.value?.orphaned === true, '认出"服务器上有本机没有的作业"（orphaned）')
  assertEq(st.value?.progress.doneFiles, 1, '带回已收 1 个文件')
  assertEq(st.value?.canCancel, true, '可以取消它')
}

console.log('\n[12] 旧服务器（没有 /uploads）→ mentor 上传回退老路径')
{
  const server = makeServer()
  const legacyCalls = []
  const fetchImpl = async (url, init = {}) => {
    const raw = String(url)
    const method = (init.method ?? 'GET').toUpperCase()
    const path = new URL(raw).pathname
    legacyCalls.push(`${method} ${path}`)
    if (/\/uploads/.test(path)) {
      // 旧服务器：路由不存在（FastAPI 的 404 没有 error.code）
      return new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 })
    }
    if (method === 'GET' && /\/files$/.test(path)) {
      // `fetchProjectFiles` 期望 `{ items: [...] }`
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (method === 'POST' && /\/files$/.test(path)) {
      const uploaded = [{ id: 'f1', relative_path: 'project.md', size: PROJECT_MD.length, sha256: sha(PROJECT_MD) }]
      return new Response(JSON.stringify(uploaded), { status: 201, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'x', details: {} } }), { status: 404 })
  }
  const handler = RPC.createSettingsRpcHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: join(TMP, 'home'),
        convfusionProdApiKey: KEY,
        serverUrl: BASE,
      }),
    // 地址是 HTTPS 的 fixture → 生产槽（`convfusionProdApiKey`）
    env: { CONVFUSION_ENV: 'production' },
    store: CUST.createMemoryCustomizationStore(),
    publishedStore: PUB.createMemoryPublishedStore(),
    listLocalWorkspaces: async () => ({ items: [{ id: 'ws-1', title: 'fixture', path: WS }] }),
    fetchImpl,
    workspaceUploads: true,
    serverTimeoutMs: 5000,
  })
  const target = { kind: 'mentor', projectId: 'p-4' }
  const started = await handler('upload/start', {
    ...target,
    intent: 'fallback-1',
    workspaceId: 'ws-1',
    paths: ['project.md'],
    source: 'mentor',
  })
  assert(started.ok, 'start 仍然受理（回退在作业内部发生）')
  let res = null
  for (let i = 0; i < 200 && !res; i += 1) {
    const st = await handler('upload/status', target)
    if (st.value?.result) res = st.value.result
    await tick(10)
  }
  assert(res !== null, '作业给出终点结果')
  assert(res?.ok === true, `老路径仍然上传成功（回退无感）：${JSON.stringify(res?.error ?? '')}`)
  assertEq(res.value?.uploaded, 1, '回执里有上传数')
  assert(legacyCalls.some((c) => c.includes('/uploads')), '确实探测过 /uploads（能力探测）')
  assert(legacyCalls.some((c) => c === 'POST /api/v1/projects/p-4/files'), '随后走了老的 multipart 上传')
}

await rm(TMP, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} upload-tasks: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
