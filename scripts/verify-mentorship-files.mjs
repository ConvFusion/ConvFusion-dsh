#!/usr/bin/env node
/**
 * 指导闭环 · 文件交换的离线验证（无 DSH、无真服务器）
 *
 * ## 覆盖什么
 *
 *   1. 下载：预检（`mentor/archiveInfo`）+ **同源 GET 代理**（`GET mentor/archive`）——
 *      宿主持凭据取回 ZIP，再以 `Content-Disposition: attachment` 交浏览器原生保存；
 *   2. 上传：`workspace/review/` 的扫描与按原相对路径回传（服务器只允许写 `review/**`）；
 *   3. 列表：ACCEPTED 提案的指导进展标注（`reviewFiles`）。
 *
 * 用法：node scripts/verify-mentorship-files.mjs [pkgDir]
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const RPC = await import(lib('settings-rpc.js'))
const CFG = await import(lib('config.js'))
const CUST = await import(lib('research/skill-customization.js'))
const SC = await import(lib('server-client.js'))

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
function section(title) {
  console.log(`\n${title}`)
}

const KEY = 'cf_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const PROJECT_ID = '6a628fdc-86e4-4935-b619-8b479b0e6218'

/** 建一个 host 夹具：假 fetch 按脚本作答。 */
function makeHost({ handler }) {
  let config = CFG.resolveConfig({
    customizationFile: 'mentor.json',
    customizationDir: mkdtempSync(join(tmpdir(), 'cf-cust-')),
    serverUrl: 'http://localhost:8000',
    convfusionApiKey: KEY,
  })
  const calls = []
  const fetchImpl = async (url, init) => {
    const call = { url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body }
    calls.push(call)
    const reply = await handler(call)
    if (reply instanceof Error) throw reply
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
      // 二进制端点（归档下载）走这个
      arrayBuffer: async () => {
        const b = reply.bytes ?? Buffer.from('')
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
      },
    }
  }
  const handlerFn = RPC.createSettingsRpcHandler({
    getConfig: () => config,
    store: CUST.createMemoryCustomizationStore(),
    setConfig: async (patch) => {
      config = { ...config, ...patch }
    },
    fetchImpl,
    serverTimeoutMs: 5000,
  })
  return { handler: handlerFn, calls }
}

const work = mkdtempSync(join(tmpdir(), 'cf-mentor-'))
const STUDENT_FILES = [
  ['project.md', '# 检索增强的长上下文推理\n\ntopic: retrieval\n'],
  ['research-state.md', '# Research State\n\n## Problem\n\n长上下文推理退化。\n'],
  ['plans/p0.md', '# P0\n\n先把决定性数字测出来。\n'],
  ['research/notes/检索笔记.md', '中文文件名也要能还原。\n'],
]

/* ════════════════════════════════════════════════════════════════════════
 * [5] 回传指导结果：按原相对路径上传 workspace/review/ 下的文件
 *
 * 服务器契约（docs/API.md §13.1）：关系方**只能**写 `review/**`，其他路径
 * `403 FILE_PATH_RESERVED` —— 结构上禁止导师改写研究事实。
 * ════════════════════════════════════════════════════════════════════════ */
section('[5] 回传指导结果（review/ 前缀）')
{
  // 造一个"导师下载下来的工作区"，指导意见写在 workspace/review/ 下（含子目录）
  const ws = join(work, 'mentor-ws')
  mkdirSync(join(ws, 'workspace', 'review', 'figures'), { recursive: true })
  mkdirSync(join(ws, 'workspace', 'plans'), { recursive: true })
  writeFileSync(join(ws, 'workspace', 'project.md'), '# 学生项目\n')
  writeFileSync(join(ws, 'workspace', 'review', '01-总体意见.md'), '# 总体意见\n')
  writeFileSync(join(ws, 'workspace', 'review', 'figures', 'trend.png'), 'fakepng')
  writeFileSync(join(ws, 'workspace', 'review', '.hidden'), '不该被发现\n')

  const upload = makeHost({
    handler: async (call) => {
      assert(call.url.endsWith(`/api/v1/projects/${PROJECT_ID}/files`), '上传走 /files')
      assertEq(call.method, 'POST', '上传用 POST')
      return {
        status: 201,
        body: [{ id: 'f1', relative_path: 'review/01-总体意见.md', size: 12, sha256: 'sha256:x' }],
      }
    },
  })

  // 选目录里的文件要能被列出来（保留目录层次；隐藏文件不算）
  const scanHost = makeHost({ handler: async () => ({ status: 200, body: {} }) })
  const scan = await scanHost.handler('mentor/scanReview', { dir: ws })
  assert(scan.ok, 'mentor/scanReview 成功')
  const listed = (scan.value?.files ?? []).map((f) => f.relPath)
  assertEq(
    listed,
    ['review/01-总体意见.md', 'review/figures/trend.png'],
    `扫描出 review/ 下的文件（含子目录、跳过隐藏文件）：${listed.join(', ')}`,
  )
  assertEq(scan.value?.researchRoot, join(ws, 'workspace'), '研究根按 researchWorkspaceOf 判定')

  // 按原相对路径上传（不是拍平成文件名）
  const res = await upload.handler('mentor/upload', {
    projectId: PROJECT_ID,
    dir: ws,
    paths: ['review/01-总体意见.md', 'review/figures/trend.png'],
  })
  assert(res.ok, `mentor/upload 成功${res.ok ? '' : `（${res.error?.code}: ${res.error?.message}）`}`)
  assertEq(res.value?.uploaded?.[0]?.relativePath, 'review/01-总体意见.md', 'relative_path 带 review/ 前缀')
  const form = upload.calls[0]?.body
  assert(form instanceof FormData, '用 multipart 表单（不自己设 content-type）')
  assertEq(form.getAll('relative_paths'), ['review/01-总体意见.md', 'review/figures/trend.png'], '目录层次原样保留')

  // 界面递进来的路径必须限定在**扫描结果**内（不能读任意盘上文件）
  const outside = await upload.handler('mentor/upload', {
    projectId: PROJECT_ID,
    dir: ws,
    paths: ['workspace/project.md', '../outside.md'],
  })
  assertEq(outside.ok, false, '非 review/ 的路径被拒（哪怕它在工作区里）')
  assertEq(outside.error?.code, 'bad-request', '拒的原因是可读的 bad-request')

  // 服务器越界 → 403 FILE_PATH_RESERVED → 说清"只能写 review/"，不是"没权限"
  const reserved = makeHost({
    handler: async () => ({
      status: 403,
      body: { error: { code: 'FILE_PATH_RESERVED', message: 'reserved', details: {} } },
    }),
  })
  const reservedRes = await reserved.handler('mentor/upload', {
    projectId: PROJECT_ID,
    dir: ws,
    paths: ['review/01-总体意见.md'],
  })
  assertEq(reservedRes.ok, false, '越界上传失败')
  assertEq(reservedRes.error?.code, 'path-reserved', '403 FILE_PATH_RESERVED → path-reserved')
  assert(
    String(reservedRes.error?.message ?? '').includes('review/'),
    '文案点明只能写 review/（不是笼统的没权限）',
  )

  // 本地先拦一道：客户端自己也不允许拼出 review/ 之外的路径
  let clientBlocked = false
  try {
    await SC.uploadReviewFiles(
      'http://localhost:8000',
      KEY,
      PROJECT_ID,
      [{ relPath: 'project.md', bytes: Buffer.from('x') }],
      { fetchImpl: async () => ({ ok: true, status: 201, json: async () => [], arrayBuffer: async () => new ArrayBuffer(0) }) },
    )
  } catch (e) {
    clientBlocked = e instanceof SC.ServerError && e.code === 'bad-request'
  }
  assert(clientBlocked, '客户端在发请求前就拦住非 review/ 路径（省一次往返）')

  // 没有 review/ 目录时是"还没有指导结果"，不是错误
  const empty = makeHost({ handler: async () => ({ status: 200, body: {} }) })
  const emptyScan = await empty.handler('mentor/scanReview', { dir: join(work, 'empty-ws') })
  assertEq(emptyScan.ok, true, '没有 review/ 目录 → 成功（空列表，不是错误）')
  assertEq(emptyScan.value?.files, [], '空列表')
}

/* ════════════════════════════════════════════════════════════════════════
 * [6] mentor/list 的进展标注：ACCEPTED 的提案带 reviewFiles（导师传了几份）
 *
 * ⚠️ 提案状态接受之后就不变了，列表会永远停在"已接受"；用户要看的是指导进展。
 * 这个事实只在项目文件里，所以宿主在 mentor/list 里补齐：
 * 逐个项目读一次 `/files`，数 `review/` 下的条目。
 * ════════════════════════════════════════════════════════════════════════ */
section('[6] mentor/list 带出指导进展（reviewFiles）')
{
  const ACCEPTED = {
    id: 'p-accepted',
    mentor_id: 'm-1',
    researcher_id: 'r-1',
    project_id: PROJECT_ID,
    guidance_scope: '-',
    total_fee: 100,
    deposit_amount: 20,
    success_payment_amount: 80,
    success_condition: { type: 'MUTUAL_COMPLETION' },
    status: 'ACCEPTED',
    expires_at: '2026-10-01T00:00:00Z',
    created_at: '2026-09-19T00:00:00Z',
  }
  const PROPOSED = { ...ACCEPTED, id: 'p-proposed', status: 'PROPOSED' }

  // 导师已传 2 份 review/ 文件 → reviewFiles = 2
  const withReview = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/mentorship-proposals')) return { status: 200, body: [ACCEPTED] }
      assert(call.url.endsWith(`/projects/${PROJECT_ID}/files`), '为 ACCEPTED 补读项目文件列表')
      return {
        status: 200,
        body: {
          items: [
            { id: 'f1', relative_path: 'review/01-意见.md', size: 10 },
            { id: 'f2', relative_path: 'review/figures/a.png', size: 20 },
            { id: 'f3', relative_path: 'project.md', size: 30 },
          ],
          total_bytes: 60,
        },
      }
    },
  })
  const listed = await withReview.handler('mentor/list', {})
  assertEq(listed.ok, true, 'mentor/list 成功')
  assertEq(listed.value?.proposals?.[0]?.reviewFiles, 2, '只数 review/ 下的条目（project.md 不算）')

  // 导师还没传 → 0（界面据此显示"等待指导意见"并不给【下载】）
  const noReview = makeHost({
    handler: async (call) =>
      call.url.endsWith('/mentorship-proposals')
        ? { status: 200, body: [ACCEPTED] }
        : { status: 200, body: { items: [{ id: 'f1', relative_path: 'plans/p0.md', size: 1 }] } },
  })
  assertEq((await noReview.handler('mentor/list', {})).value?.proposals?.[0]?.reviewFiles, 0, '没有 review/ → 0')

  // 提案还没被接受 → 不必问文件（省一次请求）
  const proposed = makeHost({
    handler: async (call) => {
      assert(call.url.endsWith('/mentorship-proposals'), 'PROPOSED 的提案不该去读文件列表')
      return { status: 200, body: [PROPOSED] }
    },
  })
  const proposedRes = await proposed.handler('mentor/list', {})
  assertEq(proposedRes.value?.proposals?.[0]?.reviewFiles, undefined, '未接受 → 不带 reviewFiles')

  // 文件列表读失败（403/网络）**不能**拖垮整个列表：标 null（未知），界面保守保留按钮
  const failing = makeHost({
    handler: async (call) =>
      call.url.endsWith('/mentorship-proposals')
        ? { status: 200, body: [ACCEPTED] }
        : { status: 403, body: { error: { code: 'FULL_STATE_ACCESS_REQUIRED', message: 'no', details: {} } } },
  })
  const failingRes = await failing.handler('mentor/list', {})
  assertEq(failingRes.ok, true, '文件列表失败时 mentor/list 仍然成功')
  assertEq(failingRes.value?.proposals?.[0]?.reviewFiles, null, '读不到 → null（未知，不是"没有"）')
}

/* ════════════════════════════════════════════════════════════════════════
 * [7] 【下载】= 同源 GET 代理 → 浏览器原生保存
 *
 * 为什么必须由宿主代理：服务器要 `Authorization: Bearer cf_live_…`，浏览器直接点
 * URL 拿不到凭据（凭据也绝不能进浏览器）。所以宿主带凭据取回 ZIP，再以
 * `Content-Disposition: attachment` 回给浏览器 —— 浏览器看到"这是文件"就走自己的
 * 保存流程。
 *
 * 这里直接调**路由处理器**（拿假 req/res），验的是真实 HTTP 层行为：
 * 状态码、响应头、字节、以及栅栏与 405。
 * ════════════════════════════════════════════════════════════════════════ */
section('[7] GET mentor/archive（同源代理，交给浏览器保存）')
{
  const ARCHIVE = Buffer.from('PK\u0003\u0004 fake-zip-bytes')
  /** 服务器给的文件名（`filename*` 是 RFC 5987 的 UTF-8 形态）。 */
  const SERVER_CD = `attachment; filename="zengsn-project.zip"; filename*=UTF-8''${encodeURIComponent('曾老师-检索增强推理.zip')}`
  /** 假 res：记录 writeHead 的头与写入的字节。 */
  const makeRes = () => {
    const out = { status: 0, headers: {}, chunks: [] }
    return {
      out,
      statusCode: 0,
      setHeader() {},
      writeHead(status, headers) {
        out.status = status
        out.headers = headers ?? {}
      },
      write(chunk) {
        out.chunks.push(Buffer.from(chunk))
      },
      end(payload) {
        if (payload !== undefined) out.chunks.push(Buffer.from(payload))
      },
    }
  }
  const makeReq = (url, method = 'GET') => ({
    method,
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {},
  })

  const route = RPC.createSettingsRouteHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: work,
        serverUrl: 'http://localhost:8000',
        convfusionApiKey: KEY,
      }),
    store: CUST.createMemoryCustomizationStore(),
    fetchImpl: async (url) => {
      assert(String(url).endsWith(`/api/v1/projects/${PROJECT_ID}/files/archive`), '代理去取 /files/archive')
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        arrayBuffer: async () =>
          ARCHIVE.buffer.slice(ARCHIVE.byteOffset, ARCHIVE.byteOffset + ARCHIVE.byteLength),
        // 服务器按 `<owner>-<project>.zip` 命名（`app/api/v1/files.py` 的 download_name）
        headers: {
          get: (name) =>
            name.toLowerCase() === 'content-disposition' ? SERVER_CD : null,
        },
      }
    },
  })

  // ① 正常下载：200 + attachment + 原始字节
  const res = makeRes()
  await route(makeReq(`/dsh-convfusion/mentor/archive?projectId=${PROJECT_ID}&title=${encodeURIComponent('检索增强推理')}`), res)
  assertEq(res.out.status, 200, 'GET 代理返回 200')
  assertEq(res.out.headers['content-type'], 'application/zip', 'content-type 是 zip')
  assertEq(res.out.headers['content-length'], String(ARCHIVE.byteLength), 'content-length 与字节数一致')
  // ⚠️ 文件名必须**原样透传服务器**的 Content-Disposition。
  // 自己按 title 拼的后果实测过：服务器改成 `<owner>-<title>.zip` 之后，
  // 下载下来仍然是旧的 `<title>.zip`。
  assertEq(
    res.out.headers['content-disposition'],
    SERVER_CD,
    'Content-Disposition 原样透传（服务器才是文件名的唯一权威）',
  )
  assertEq(Buffer.concat(res.out.chunks).toString('latin1'), ARCHIVE.toString('latin1'), '响应体就是服务器给的原字节')

  // ①b 服务器没给 Content-Disposition 时兜底（否则浏览器会拿 URL 末段当文件名：
  //     `archive` —— 连扩展名都没有）
  const noHeader = RPC.createSettingsRouteHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: work,
        serverUrl: 'http://localhost:8000',
        convfusionApiKey: KEY,
      }),
    store: CUST.createMemoryCustomizationStore(),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      arrayBuffer: async () =>
        ARCHIVE.buffer.slice(ARCHIVE.byteOffset, ARCHIVE.byteOffset + ARCHIVE.byteLength),
      headers: { get: () => null },
    }),
  })
  const fallbackRes = makeRes()
  await noHeader(
    makeReq(`/dsh-convfusion/mentor/archive?projectId=${PROJECT_ID}&title=${encodeURIComponent('检索增强推理')}`),
    fallbackRes,
  )
  const cd = String(fallbackRes.out.headers['content-disposition'] ?? '')
  assert(cd.startsWith('attachment;'), '没有服务器头时仍给 attachment')
  assert(cd.includes(encodeURIComponent('检索增强推理')), '兜底名字来自 title，且带 UTF-8 编码')

  // ② 缺 projectId → 400（而不是流一个空 zip 出去）
  const bad = makeRes()
  await route(makeReq('/dsh-convfusion/mentor/archive'), bad)
  assertEq(bad.out.status, 400, '缺 projectId → 400')

  // ③ 服务器侧失败（403 无关系）→ 5xx JSON，绝不 stream 坏 zip
  const forbidden = RPC.createSettingsRouteHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: work,
        serverUrl: 'http://localhost:8000',
        convfusionApiKey: KEY,
      }),
    store: CUST.createMemoryCustomizationStore(),
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'FULL_STATE_ACCESS_REQUIRED', message: 'no', details: {} } }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  })
  const denied = makeRes()
  await forbidden(makeReq(`/dsh-convfusion/mentor/archive?projectId=${PROJECT_ID}`), denied)
  assertEq(denied.out.status, 502, '上游 403 → 502（JSON 错误，不是 attachment）')
  assertEq(denied.out.headers['content-type'], 'application/json; charset=utf-8', '失败时回 JSON 错误')
  assert(
    !String(denied.out.headers['content-disposition'] ?? '').includes('attachment'),
    '失败时**不能**带 attachment（否则浏览器会把错误存成一个坏 zip）',
  )

  // ④ 信任栅栏在 GET 上也必须生效（否则是一个本机可读的裸下载端点）
  const fenced = RPC.createSettingsRouteHandler({
    getConfig: () =>
      CFG.resolveConfig({
        customizationFile: 'x.json',
        customizationDir: work,
        serverUrl: 'http://localhost:8000',
        convfusionApiKey: KEY,
      }),
    store: CUST.createMemoryCustomizationStore(),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => ARCHIVE.buffer.slice(ARCHIVE.byteOffset, ARCHIVE.byteOffset + ARCHIVE.byteLength) }),
    reject: () => 401,
  })
  const rejected = makeRes()
  await fenced(makeReq(`/dsh-convfusion/mentor/archive?projectId=${PROJECT_ID}`), rejected)
  assertEq(rejected.out.status, 401, 'GET 下载同样过信任栅栏（401）')
  assert(
    Buffer.concat(rejected.out.chunks).toString('utf8').includes('未认证'),
    '被栅栏拒绝时回的是可读错误（不是文件字节）',
  )

  // ⑤ 其它端点仍然只接受 POST
  const wrong = makeRes()
  await route(makeReq('/dsh-convfusion/state', 'GET'), wrong)
  assertEq(wrong.out.status, 405, '非下载端点用 GET → 405')
}

rmSync(work, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} mentorship-files: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
