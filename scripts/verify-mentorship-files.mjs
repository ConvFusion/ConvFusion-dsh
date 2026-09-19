#!/usr/bin/env node
/**
 * 指导闭环 · 文件交换的离线验证（无 DSH、无真服务器）
 *
 * ## 覆盖什么
 *
 *   1. 下载：写进**用户选的 DSH 工作区**（`mentor/downloadState` 取目标列表 + 预检，
 *      `mentor/download` 逐文件写入研究根；范围按角色分：导师 `all`、学生 `review`）；
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
      // 二进制端点（归档下载）走这个
      arrayBuffer: async () => {
        const b = reply.bytes ?? Buffer.from('')
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
      },
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
  const ZIP = Buffer.from('PK\u0003\u0004fake-zip-bytes')
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
  const hostFor = (dirs, { filename = true } = {}) =>
    makeHost({
      handler: async (call) => {
        if (call.url.endsWith('/files')) return { status: 200, body: { items: FILES, total_bytes: 15 } }
        assert(call.url.endsWith(`/projects/${PROJECT_ID}/files/archive`), '下载取的是归档端点（ZIP）')
        return {
          status: 200,
          bytes: ZIP,
          headers: { get: (k) => (filename && k.toLowerCase() === 'content-disposition' ? DISPOSITION : null) },
        }
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
}

rmSync(work, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} mentorship-files: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
