#!/usr/bin/env node
/**
 * 指导闭环 · 文件交换的离线验证（无 DSH、无真服务器）
 *
 * ## 覆盖什么
 *
 *   1. 下载：写进**用户选的 DSH 工作区**（`mentor/downloadState` 取目标列表 + 预检，
 *      `mentor/download` 逐文件写入研究根；范围按角色分：导师 `all`、学生 `review`）；
 *   2. 上传：`workspace/review/` 的扫描与按原相对路径回传（服务器只允许写 `review/**`）；
 *   3. 列表：ACCEPTED 提案的指导进展标注（`reviewFiles`）——
 *      新服务器（`review_files` 在列表里）只发 **1 次**请求；旧服务器退回逐项目读 `/files`。
 *
 * 用法：node scripts/verify-mentorship-files.mjs [pkgDir]
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const SYNC = await import(lib('research/workspace-sync.js'))

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
function makeHost({ handler, listLocalWorkspaces }) {
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
      // 二进制端点（归档下载）走这个 —— 老运行时没有正文流时的兜底
      arrayBuffer: async () => {
        const b = reply.bytes ?? Buffer.from('')
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
      },
      // 给了 chunks 就暴露**正文流**：走真实的"边收边写"路径（有进度、有落盘中间态）
      ...(reply.chunks
        ? {
            body: {
              getReader: () => {
                let i = 0
                return {
                  read: async () => {
                    if (i >= reply.chunks.length) return { done: true, value: undefined }
                    const value = reply.chunks[i]
                    i += 1
                    if (value instanceof Error) throw value
                    if (typeof reply.chunkDelayMs === 'number' && reply.chunkDelayMs > 0) {
                      await new Promise((r) => setTimeout(r, reply.chunkDelayMs))
                    }
                    return { done: false, value }
                  },
                }
              },
            },
          }
        : {}),
      // 服务器给的文件名走 Content-Disposition（`<owner>-<title>.zip`）
      ...(reply.headers ? { headers: reply.headers } : {}),
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
    ...(listLocalWorkspaces ? { listLocalWorkspaces } : {}),
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

  /*
   * ⚠️ 刻意的不对称（有断言才不会被"顺手统一"改掉）：
   *   - **学生发布/更新**（`work/publish` → `classify`）：`review/` 判为 `excluded`，不传；
   *   - **导师回传**（本端点的 `scanReviewFiles`）：照列 `review/` 下的文件并上传。
   * 理由：这一层里的导师指导本来就来自服务器（传回去是回声），而学生的自查不是要发布的
   * 研究事实；反过来，导师的【上传】正是靠这条通道把指导结果送回服务器。
   */
  {
    const UP = await import(lib('research/upload-selection.js'))
    assertEq(UP.classify('review/x.md', 100).decision, 'excluded', '发布侧把 review/ 排除')
    assertEq(UP.isSelectable('excluded'), false, 'excluded 在对话框里不可勾选')
    assert(
      (scan.value?.files ?? []).length > 0,
      '导师回传侧仍然照传 review/（两条通道的取舍不同）',
    )
    /*
     * npm 缓存目录必须被排除（2026-09）：某真实工作区的
     * `papers/paper-main/presentation/.npmcache/_cacache/…` 有 158 个 blob、18.9 MiB，
     * 占那份工作区快照的 **55%** —— 只因为"落在 papers/** 下"就被判成 recommended，
     * 于是随发布上传、再被导师原样下载回来。这正是那次"下载 13.6 MB 太慢"的一半。
     */
    const cacache =
      'papers/paper-main/presentation/.npmcache/_cacache/content-v2/sha512/40/cc/ebe1c1a8'
    assertEq(UP.classify(cacache, 3496008).decision, 'excluded', 'npm 缓存目录（.npmcache）不发布')
    assertEq(
      UP.classify('papers/paper-main/presentation/talk-deck.html', 661774).decision,
      'recommended',
      '同一目录下的研究资产（讲稿）照常推荐 —— 排除的是缓存，不是整个目录',
    )
  }

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
 * 这个事实的来源分两种，**判据是字段在不在**（见 ConvFusion-server
 * `docs/mentorship-list-performance.md` §3）：
 *   · 新服务器：列表里直接给 `review_files`（三态 n / 0 / null）→ 宿主照用，**1 次请求**；
 *   · 旧服务器：响应里没有这个字段 → 宿主退回逐项目读 `/files` 自己数 `review/` 前缀。
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
  const callsFiles = (host) => host.calls.filter((c) => c.url.endsWith('/files')).length

  /* ── 新服务器：字段就在列表里 ────────────────────────────────────────── */

  // 服务器按 DISTINCT relative_path 数好的值直接用；
  // 同一个 review/a.md 传过两次的那份历史（/files 里是 2 行）**不能**被数成 2 份。
  const served = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/mentorship-proposals')) {
        return { status: 200, body: [{ ...ACCEPTED, review_files: 2 }] }
      }
      // 走到这里 = 又去拉文件清单了 —— 那正是这次要消掉的 N+1
      return {
        status: 200,
        body: {
          items: [
            { id: 'f1', relative_path: 'review/a.md', size: 10 },
            { id: 'f2', relative_path: 'review/a.md', size: 10 },
            { id: 'f3', relative_path: 'review/b.png', size: 20 },
            { id: 'f4', relative_path: 'project.md', size: 30 },
          ],
          total_bytes: 70,
        },
      }
    },
  })
  const servedRes = await served.handler('mentor/list', {})
  assertEq(servedRes.ok, true, 'mentor/list 成功')
  assertEq(servedRes.value?.proposals?.[0]?.reviewFiles, 2, '新服务器：直接用 review_files（2 份）')
  assertEq(callsFiles(served), 0, '新服务器：**不再**逐项目读 /files（1 + N → 1 次请求）')

  // 0（导师还没传）也是"明确知道"，同样不该再去问
  const zero = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/mentorship-proposals')) return { status: 200, body: [{ ...ACCEPTED, review_files: 0 }] }
      return { status: 200, body: { items: [], total_bytes: 0 } }
    },
  })
  assertEq((await zero.handler('mentor/list', {})).value?.proposals?.[0]?.reviewFiles, 0, '新服务器：0 = 明确没有')
  assertEq(callsFiles(zero), 0, '0 与 2 一样，都不需要再读文件清单')

  // `null` = 服务器说"不可知"（无读权限 / 项目已软删除）→ 照抄，**不要去问**
  const unknowable = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/mentorship-proposals')) return { status: 200, body: [{ ...ACCEPTED, review_files: null }] }
      return { status: 403, body: { error: { code: 'FULL_STATE_ACCESS_REQUIRED', message: 'no', details: {} } } }
    },
  })
  const unknownRes = await unknowable.handler('mentor/list', {})
  assertEq(unknownRes.value?.proposals?.[0]?.reviewFiles, null, '不可知 → null（**不是** 0）')
  assertEq(callsFiles(unknowable), 0, '服务器已说不可知，再去问也是 403 → 不必多一次请求')

  /* ── 旧服务器：响应里没有 review_files → 退回逐项目读 /files ─────────── */

  // 旧服务器仍要能工作：导师已传 2 份 review/ 文件 → reviewFiles = 2
  const legacyHost = makeHost({
    handler: async (call) => {
      if (call.url.endsWith('/mentorship-proposals')) return { status: 200, body: [ACCEPTED] }
      assert(call.url.endsWith(`/projects/${PROJECT_ID}/files`), '旧服务器：为 ACCEPTED 补读项目文件列表')
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
  const legacyRes = await legacyHost.handler('mentor/list', {})
  assertEq(legacyRes.ok, true, '旧服务器：mentor/list 仍成功')
  assertEq(legacyRes.value?.proposals?.[0]?.reviewFiles, 2, '旧服务器：只数 review/ 下的条目（project.md 不算）')

  // 导师还没传 → 0（界面据此显示"等待指导意见"并不给【下载】）
  const noReview = makeHost({
    handler: async (call) =>
      call.url.endsWith('/mentorship-proposals')
        ? { status: 200, body: [ACCEPTED] }
        : { status: 200, body: { items: [{ id: 'f1', relative_path: 'plans/p0.md', size: 1 }] } },
  })
  assertEq((await noReview.handler('mentor/list', {})).value?.proposals?.[0]?.reviewFiles, 0, '旧服务器：没有 review/ → 0')

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
 * [7] 【下载】= 把 ZIP 存进**用户选的 DSH 工作区**
 *
 * 2026-09 用户拍板：**下载只负责把 .zip 保存下来**，其余交给用户处理。因此：
 *   · 不调起浏览器默认下载（页面拿不到保存位置），也不要求输地址；
 *   · 目标按**注册表 id 在宿主侧解析** —— 客户端递不进任意路径；
 *   · 写在**工作区根目录**（用户材料，不进 <工作区>/workspace/ 研究数据区）；
 *   · **不解压、无 scope、不因"已有研究项目"拒绝**；同名不覆盖（自动加序号），
 *     所以所选工作区里原有的东西一个都不动，任何工作区都能选。
 * ════════════════════════════════════════════════════════════════════════ */
section('[7] 【下载】把 ZIP 存进选定的 DSH 工作区')
{
  const FILES = [
    { id: 'f1', relative_path: 'project.md', size: 4 },
    { id: 'f2', relative_path: 'research/evidence/E001.md', size: 5 },
    { id: 'f3', relative_path: 'review/指导意见.md', size: 6 },
  ]
  /**
   * 造一个**结构上合法**的最小 ZIP（本地文件头 + EOCD）。
   *
   * 为什么不能再用随便几个字节：下载端点现在会校验 ZIP 完整性（末尾必须有 EOCD、
   * 且注释长度让它正好结束在文件末尾、条目数要与 `X-File-Count` 对得上）。
   * 那正是 2026-09 那次"服务器传了 126 KB 就断，旧代码照样报已保存"的修法。
   */
  const makeZip = (entries = 1) => {
    const local = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(26, 7)])
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(entries, 8) // 本盘条目数
    eocd.writeUInt16LE(entries, 10) // 总条目数
    return Buffer.concat([local, eocd])
  }
  const ZIP = makeZip(3)
  /** 目录里**下载留下的东西**（`.zip` 与 `.part`）—— 工作区自己的 `workspace/` 不算。 */
  const leftovers = (dir) => readdirSync(dir).filter((n) => n.endsWith('.zip') || n.endsWith('.part'))
  /** 一次归档响应：默认用**正文流**（走真实的边收边写路径）。 */
  const archiveReply = ({ zip = ZIP, entries = 3, chunks, headers = true, chunkDelayMs } = {}) => ({
    status: 200,
    bytes: zip,
    ...(chunks ? { chunks, chunkDelayMs } : { chunks: [zip] }),
    headers: {
      get: (k) => {
        const key = k.toLowerCase()
        if (!headers) return null
        if (key === 'content-disposition') return DISPOSITION
        if (key === 'x-file-count') return String(entries)
        return null
      },
    },
  })
  /** 造一个工作区目录（可选先放一个研究项目，用来验证"原文件不动"）。 */
  const makeWorkspace = (name, { withResearch = false } = {}) => {
    const dir = join(work, name)
    mkdirSync(join(dir, 'workspace'), { recursive: true })
    if (withResearch) {
      writeFileSync(join(dir, 'workspace', 'project.md'), '# 我自己的研究\n')
      writeFileSync(join(dir, 'workspace', 'research-state.md'), '# state\n')
    }
    return dir
  }
  /** 服务器那把 ZIP 命名成 `<owner>-<title>.zip`，用 Content-Disposition 回给我们。 */
  const DISPOSITION = "attachment; filename*=UTF-8''%E5%AD%A6%E7%94%9F%E7%94%B2-%E9%95%BF%E4%B8%8A%E4%B8%8B%E6%96%87%E6%8E%A8%E7%90%86.zip"
  const hostFor = (dirs, { filename = true, archive = archiveReply() } = {}) =>
    makeHost({
      handler: async (call) => {
        if (call.url.endsWith('/files')) return { status: 200, body: { items: FILES, total_bytes: 15 } }
        assert(call.url.endsWith(`/projects/${PROJECT_ID}/files/archive`), '下载取的是归档端点（ZIP）')
        return filename ? archive : { ...archive, headers: undefined }
      },
      listLocalWorkspaces: async () => ({
        available: true,
        items: dirs.map((d, i) => ({ id: `ws-${i}`, title: `工作区 ${i}`, path: d, updatedAt: '' })),
      }),
    })

  // ① 对话框要的三样：可选工作区（**全部可选**）、预检、预计文件名
  const empty = makeWorkspace('dl-empty')
  const mine = makeWorkspace('dl-mine', { withResearch: true })
  const host = hostFor([empty, mine])
  const state = await host.handler('mentor/downloadState', { projectId: PROJECT_ID, prefix: '学生甲-长上下文推理' })
  assertEq(state.ok, true, 'downloadState 可用')
  assertEq(state.value?.files, 3, '预检报 3 个文件（全量，不再按 scope 过滤）')
  assertEq(state.value?.bytes, 15, '预检报总体积')
  assertEq(state.value?.items?.length, 2, '列出两个工作区')
  assertEq(
    state.value?.items?.map((w) => Object.keys(w).sort()),
    [['id', 'path', 'title'], ['id', 'path', 'title']],
    '工作区只给 id/title/path —— 没有 hasResearch 之类的禁用标记',
  )
  assertEq(state.value?.expectedName, '学生甲-长上下文推理.zip', '预计文件名走宿主安全化')

  // ② 落盘：ZIP 写进工作区**根目录**，文件名取服务器给的 Content-Disposition
  const res = await host.handler('mentor/download', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-0',
    prefix: '学生甲-长上下文推理',
  })
  assertEq(res.ok, true, `写入空工作区成功${res.ok ? '' : `（${res.error?.code}）`}`)
  assertEq(res.value?.dir, empty, '回报写到哪个工作区')
  assertEq(res.value?.name, '学生甲-长上下文推理.zip', '文件名以服务器的 Content-Disposition 为准')
  assertEq(res.value?.bytes, ZIP.byteLength, '回报写入字节数')
  assertEq(readFileSync(join(empty, '学生甲-长上下文推理.zip')), ZIP, 'ZIP 内容逐字节一致')
  assertEq(existsSync(join(empty, 'workspace', 'project.md')), false, '**不解压**：研究数据区里什么都不该多出来')
  assertEq(
    existsSync(join(empty, 'workspace', '学生甲-长上下文推理.zip')),
    false,
    '落在工作区根（用户材料），不是研究数据区',
  )

  // ③ **已有研究项目的工作区照写**：只是多一个 ZIP，原有的东西一个都不动
  const intoMine = await host.handler('mentor/download', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-1',
    prefix: '学生甲-长上下文推理',
  })
  assertEq(intoMine.ok, true, '已有研究项目的工作区**也能选**（不再 workspace-occupied 拒绝）')
  assertEq(readFileSync(join(mine, 'workspace', 'project.md'), 'utf8'), '# 我自己的研究\n', '原有 project.md 没被动')
  assertEq(existsSync(join(mine, '学生甲-长上下文推理.zip')), true, 'ZIP 与自己的研究并存')

  // ④ 同名**不覆盖**：再下一次自动加序号（这是"任何工作区都能选"的结构性保证）
  const again = await host.handler('mentor/download', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-0',
    prefix: '学生甲-长上下文推理',
  })
  assertEq(again.value?.name, '学生甲-长上下文推理-2.zip', '同名第二次 → 自动加 -2，绝不覆盖')
  assertEq(existsSync(join(empty, '学生甲-长上下文推理.zip')), true, '第一份还在')

  // ⑤ 服务器没给文件名 → 用客户端前缀兜底（而不是叫 workspace.zip）
  const plain = makeWorkspace('dl-plain')
  const noName = hostFor([plain], { filename: false })
  const fallback = await noName.handler('mentor/download', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-0',
    prefix: '学生甲-长上下文推理',
  })
  assertEq(fallback.value?.name, '学生甲-长上下文推理.zip', '服务器没给名字时用前缀兜底')

  // ⑥ 客户端只能按**注册表 id** 指定目标：递路径进来无效
  const bad = await host.handler('mentor/download', {
    projectId: PROJECT_ID,
    workspaceId: '/tmp/anywhere',
    prefix: 'x',
  })
  assertEq(bad.ok, false, '未知工作区 id → 拒绝')
  assertEq(bad.error?.code, 'not-found', '按 id 解析不到就报 not-found（不接受任意路径）')

  // ⑦ 没有任何文件时预检为 0（界面据此不给下载）
  const noFilesHost = makeHost({
    handler: async () => ({ status: 200, body: { items: [], total_bytes: 0 } }),
    listLocalWorkspaces: async () => ({
      available: true,
      items: [{ id: 'ws-0', title: 'w', path: empty, updatedAt: '' }],
    }),
  })
  const none = await noFilesHost.handler('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(none.value?.files, 0, '项目还没有文件 → 预检为 0')

  // ⑧ 预检口径 = **快照口径**（每路径取最新），不是 `/files` 的历史行数
  {
    const dupHost = makeHost({
      handler: async () => ({
        status: 200,
        body: {
          items: [
            { id: 'a', relative_path: 'review/x.md', size: 10 },
            { id: 'b', relative_path: 'review/x.md', size: 40 }, // 同一路径的**修订**
            { id: 'c', relative_path: 'project.md', size: 5 },
          ],
          total_bytes: 55,
        },
      }),
      listLocalWorkspaces: async () => ({
        available: true,
        items: [{ id: 'ws-0', title: 'w', path: empty, updatedAt: '' }],
      }),
    })
    const st = await dupHost.handler('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
    assertEq(st.value?.files, 2, '预检文件数按快照口径（修订不是新增一份）')
    assertEq(st.value?.bytes, 45, '预检体积同样取最新那份（40 + 5，不是三行相加）')
  }

  /* ── 2026-09 那次「一直读取中」的修法：边收边写 + 进度 + 不留半成品 ────── */

  // ⑨ 下载期间**宿主如实报出已收字节**（界面按秒问，才有"已下载 x MB"）
  {
    const dir = makeWorkspace('dl-progress')
    const streamed = hostFor([dir], {
      archive: archiveReply({
        chunks: [ZIP.subarray(0, 20), ZIP.subarray(20)],
        chunkDelayMs: 150,
      }),
    })
    const inflight = streamed.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: 'progress',
    })
    let mid = null
    for (let i = 0; i < 40 && !(mid?.received > 0); i += 1) {
      await new Promise((r) => setTimeout(r, 25))
      mid = (await streamed.handler('mentor/downloadProgress', { projectId: PROJECT_ID })).value
    }
    assertEq(mid?.running, true, '下载中 → running=true')
    assert(mid?.received > 0, `下载中收到的字节数 > 0（实际 ${mid?.received}）`)
    assert(mid?.received < ZIP.byteLength, '还没传完 → 小于总字节数（不是"收完才报"）')

    const done = await inflight
    assertEq(done.ok, true, '流式下载最终成功')
    const after = (await streamed.handler('mentor/downloadProgress', { projectId: PROJECT_ID })).value
    assertEq(after?.running, false, '下载结束 → running=false')
    assertEq(after?.received, ZIP.byteLength, '结束时报的字节数 = 落盘字节数')
    assertEq(
      (await streamed.handler('mentor/downloadProgress', { projectId: 'another-project' })).value,
      { received: 0, running: false },
      '项目对不上 → 0 / 未在跑（进度不串号）',
    )
    assertEq(readdirSync(dir).filter((n) => n.endsWith('.part')), [], '成功落盘后没有 .part 残留')
  }

  // ⑩ 正文被截断（没有 EOCD）→ **不报成功**，且不留半成品
  {
    const dir = makeWorkspace('dl-truncated')
    const cut = makeZip(3).subarray(0, 24) // 有 PK 头，结尾没有中央目录记录
    const broken = hostFor([dir], { archive: archiveReply({ zip: cut, chunks: [cut] }) })
    const r = await broken.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: 'broken',
    })
    assertEq(r.ok, false, '截断的 ZIP → 失败（旧写法会当成功写下来）')
    assert(String(r.error?.message ?? '').includes('不完整'), '说清是"下载不完整"，不是笼统的失败')
    assertEq(leftovers(dir), [], '失败不留半成品（既没有 .zip，也没有 .part）')
  }

  // ⑪ 条目数对不上（服务器说有 3 个，ZIP 里只有 2 个）→ 也算不完整
  {
    const dir = makeWorkspace('dl-miscount')
    const short = makeZip(2)
    const miscount = hostFor([dir], {
      archive: archiveReply({ zip: short, entries: 3, chunks: [short] }),
    })
    const r = await miscount.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: 'miscount',
    })
    assertEq(r.ok, false, '条目数对不上 → 失败')
    assert(
      String(r.error?.message ?? '').includes('2 个条目'),
      `错误里说出"只有 2 个条目"（实际：${r.error?.message}）`,
    )
  }

  // ⑫ 传了一半**连接就断**（正文流抛错）→ 失败 + 清干净
  {
    const dir = makeWorkspace('dl-drop')
    const dropped = hostFor([dir], {
      archive: archiveReply({ chunks: [ZIP.subarray(0, 12), new Error('socket hang up')] }),
    })
    const r = await dropped.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: 'dropped',
    })
    assertEq(r.ok, false, '正文中途断掉 → 失败')
    assert(String(r.error?.message ?? '').includes('socket hang up'), '把底层原因带出来（不是只说"失败"）')
    assertEq(leftovers(dir), [], '断流不留半成品')
  }

  // ⑬ 失败的下载必须把 running 收回去（否则界面会一直转圈）
  {
    const dir = makeWorkspace('dl-after-fail')
    const cut = makeZip(3).subarray(0, 24)
    const failing = hostFor([dir], { archive: archiveReply({ zip: cut, chunks: [cut] }) })
    const r = await failing.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: 'after-fail',
    })
    assertEq(r.ok, false, '（前置）这次下载失败')
    const after = (await failing.handler('mentor/downloadProgress', { projectId: PROJECT_ID })).value
    assertEq(after?.running, false, '失败后 running=false（界面据此停止轮询、显示错误）')

    // 然后再下一次仍然能成功：进度状态是**这一次**的，不残留
    const dir2 = makeWorkspace('dl-after-fail-2')
    const okHost = hostFor([dir2])
    const ok = await okHost.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: 'after-fail',
    })
    assertEq(ok.ok, true, '失败之后仍然能正常下载')
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * [8] 正文"卡死"必须有超时（2026-09「一直读取中」的根因之一）
 *
 * 旧写法：`Promise.race([fetch, timeout])` 一拿到**响应头**就 clearTimeout，
 * 之后 `res.arrayBuffer()` 读正文**没有任何超时** —— 正文不来了就永远挂着。
 * 新的判据是"多久**没有新数据**"（stall），不是给整段设总时长：
 * 这条链路实测 ~118 KB/s，一个 13.6 MB 的快照本来就要两分钟，慢不等于死。
 * ════════════════════════════════════════════════════════════════════════ */
section('[8] 下载正文的卡死超时（stall）')
{
  const neverEndingFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({}),
    arrayBuffer: () => new Promise(() => {}),
    body: {
      getReader: () => ({
        read: async () => {
          // 第一块照常给，之后**永远不再来数据** —— 模拟"服务器传了一半就不动了"
          if (!sent) {
            sent = true
            return { done: false, value: Buffer.from('PK\u0003\u0004') }
          }
          return new Promise(() => {})
        },
      }),
    },
  })
  let sent = false

  const dir = join(work, 'stall-ws')
  mkdirSync(dir, { recursive: true })
  const part = SYNC.openDownloadPart(dir, 'stalled')
  const t0 = Date.now()
  let err = null
  try {
    await SC.fetchProjectArchive('http://localhost:1', KEY, PROJECT_ID, part, {
      fetchImpl: neverEndingFetch,
      stallTimeoutMs: 120,
    })
  } catch (e) {
    err = e
  }
  const dt = Date.now() - t0
  assert(err !== null, '正文不再来数据 → 抛错（旧写法会永远挂着）')
  assert(dt < 3000, `按 stall 判据及时收手（实际 ${dt} ms）`)
  assert(
    String(err?.message ?? '').includes('没有收到数据'),
    `错误文案说清是"多久没有收到数据"（实际：${err?.message}）`,
  )
  part.abort()
  assertEq(readdirSync(dir), [], '卡死后宿主清掉 .part（不留半成品）')
}

rmSync(work, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} mentorship-files: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
