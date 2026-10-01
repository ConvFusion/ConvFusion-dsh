#!/usr/bin/env node
/**
 * 指导闭环 · 文件交换的离线验证（无 DSH、无真服务器）
 *
 * ## 覆盖什么
 *
 *   1. 下载：写进**用户选的 DSH 工作区**（`mentor/downloadState` 取目标列表 + 预检，
 *      `mentor/download` 逐文件写入研究根；范围按角色分：导师 `all`、学生 `review`）；
 *   2. 上传：**选 DSH 工作区**（只列含研究定义的）→ 拉研究根文件清单（`mentor` 口径：
 *      `review/` 与论文 PDF 推荐、机器产物排除）→ 与服务器 `sha256` 比对后**增量**分批回传，
 *      进度按秒可问（服务器侧需放开"协作者只能写 `review/**`"）；
 *   3. 列表：ACCEPTED 提案的指导进展标注（`reviewFiles`）——
 *      新服务器（`review_files` 在列表里）只发 **1 次**请求；旧服务器退回逐项目读 `/files`。
 *
 * 用法：node scripts/verify-mentorship-files.mjs [pkgDir]
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
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
function makeHost({ handler, listLocalWorkspaces, syncStore }) {
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
    ...(syncStore ? { syncStore } : {}),
  })
  return { handler: handlerFn, calls }
}

/**
 * 断言某个 `/files` 请求读的是哪一侧（v20 服务器 `?source=owner|mentor`，默认 owner）。
 *
 * `owner` 一侧**不带参数**（那是服务器的默认，也是旧服务器的唯一一侧）。
 */
function assertReadSide(url, side, label) {
  const has = String(url).includes('source=mentor')
  assert(
    side === 'mentor' ? has : !has,
    `${label}（实际 ${url}）`,
  )
}

const work = mkdtempSync(join(tmpdir(), 'cf-mentor-'))
const STUDENT_FILES = [
  ['project.md', '# 检索增强的长上下文推理\n\ntopic: retrieval\n'],
  ['research-state.md', '# Research State\n\n## Problem\n\n长上下文推理退化。\n'],
  ['plans/p0.md', '# P0\n\n先把决定性数字测出来。\n'],
  ['research/notes/检索笔记.md', '中文文件名也要能还原。\n'],
]

/* ════════════════════════════════════════════════════════════════════════
 * [5] 回传"我这一份工作区"：选工作区 → 文件清单 → 勾选 → 增量上传
 *
 * 用户要的语义（2026-09）：导师是**在学生的 workspace/ 里继续推进研究**的，
 * 回传的是整份工作区（含 `review/`），效果上替换学生原来那一份；学生下载后接着做。
 *
 * ⚠️ 服务器侧前提：放开"协作者只能写 `review/**`"这条限制（插件按契约实现，
 * 未放开时如实报错，不偷偷只传 `review/`）。见
 * `dev-notes/v0.5.4-mentor-workspace-upload.md`。
 * ════════════════════════════════════════════════════════════════════════ */
section('[5] 回传我这一份工作区（选工作区 → 清单 → 增量上传）')
{
  const ws = join(work, 'mentor-ws')
  const root = join(ws, 'workspace')
  mkdirSync(join(root, 'review', 'figures'), { recursive: true })
  mkdirSync(join(root, 'papers', 'paper-main'), { recursive: true })
  mkdirSync(join(root, 'research', 'literature', 'fulltext'), { recursive: true })
  mkdirSync(join(root, 'harness'), { recursive: true })
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
  const PROJECT_MD = '# 学生项目（导师改过）\n'
  writeFileSync(join(root, 'project.md'), PROJECT_MD)
  writeFileSync(join(root, 'papers', 'paper-main', 'paper.pdf'), 'x'.repeat(2048))
  writeFileSync(join(root, 'review', '01-总体意见.md'), '# 总体意见\n')
  writeFileSync(join(root, 'review', 'figures', 'trend.png'), 'fakepng')
  writeFileSync(join(root, 'research', 'literature', 'fulltext', '001_ref.pdf'), 'ref')
  writeFileSync(join(root, 'harness', 'session.log'), 'runtime')
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'dep')
  // 再放 21 个小组件：把清单撑过 20（服务器每批上限），用来验证"分批 + 进度是真的"
  for (let i = 0; i < 21; i += 1) {
    writeFileSync(join(root, 'review', `chunk-${String(i).padStart(2, '0')}.md`), `# ${i}\n`)
  }

  // 旧布局（研究定义直接在工作区根）与"没有研究"的工作区各一个
  const oldWs = join(work, 'old-ws')
  mkdirSync(oldWs, { recursive: true })
  writeFileSync(join(oldWs, 'project.md'), '# 旧布局\n')
  const plainWs = join(work, 'plain-ws')
  mkdirSync(plainWs, { recursive: true })
  writeFileSync(join(plainWs, 'notes.md'), '与本研究无关\n')

  const registry = async () => ({
    available: true,
    items: [
      { id: 'ws-mentor', title: '导师手上的学生快照', path: ws, updatedAt: '' },
      { id: 'ws-old', title: '旧布局工作区', path: oldWs, updatedAt: '' },
      { id: 'ws-plain', title: '无关工作区', path: plainWs, updatedAt: '' },
    ],
  })

  /* ── ① 工作区下拉：只列**含研究定义**的 ─────────────────────────────── */
  const listHost = makeHost({
    handler: async () => ({ status: 200, body: {} }),
    listLocalWorkspaces: registry,
  })
  const listed = await listHost.handler('mentor/uploadState', {})
  assertEq(listed.ok, true, 'mentor/uploadState 可用')
  assertEq(
    listed.value?.items?.map((w) => w.id),
    ['ws-mentor', 'ws-old'],
    '只列含研究定义的工作区（无关工作区不出现）',
  )
  assertEq(
    listed.value?.items?.[0]?.root,
    join(realpathSync(ws), 'workspace'),
    '新布局：研究根是 <ws>/workspace（真身路径）',
  )
  assertEq(listed.value?.items?.[1]?.root, realpathSync(oldWs), '旧布局兼容：研究根就是工作区本身')

  /* ── ② 文件清单：mentor 口径（review/ 与论文 PDF 都推荐，机器产物排除）── */
  const planHost = makeHost({
    handler: async () => ({ status: 200, body: {} }),
    listLocalWorkspaces: registry,
  })
  const planned = await planHost.handler('mentor/uploadPlan', { workspaceId: 'ws-mentor' })
  assertEq(planned.ok, true, 'mentor/uploadPlan 可用')
  const plan = planned.value?.plan
  const catOf = (rel) => plan.categories.find((c) => c.files.some((f) => f.relPath === rel))
  assertEq(catOf('review/01-总体意见.md')?.id, 'review', 'review/ 归"评阅记录"')
  assertEq(catOf('review/01-总体意见.md')?.decision, 'recommended', '导师侧 review/ 是**推荐**（要带回去）')
  assertEq(catOf('papers/paper-main/paper.pdf')?.id, 'papers', '论文 PDF 归"论文与图表"')
  assertEq(catOf('papers/paper-main/paper.pdf')?.decision, 'recommended', '论文 PDF 推荐')
  assertEq(catOf('harness/session.log'), undefined, 'harness/ 是机器产物：整枝排除，不进可选分类')
  assertEq(catOf('node_modules/pkg/index.js'), undefined, 'node_modules 整枝排除')
  assertEq(catOf('research/literature/fulltext/001_ref.pdf')?.decision, 'optional', '文献原文默认不传')
  assertEq(plan.defaultSelection.includes('review/01-总体意见.md'), true, '默认勾选含评阅记录')
  assertEq(plan.defaultSelection.includes('papers/paper-main/paper.pdf'), true, '默认勾选含论文 PDF')
  assertEq(
    plan.defaultSelection.includes('research/literature/fulltext/001_ref.pdf'),
    false,
    '默认不勾文献原文（是学生原件的回声）',
  )
  assert(plan.totals.excludedFiles > 0, '机器产物有计数（界面用它说"已跳过 N 个"）')

  /*
   * ⚠️ 两种用途的**刻意不对称**（有断言才不会被"顺手统一"改掉）：
   *   · 学生发布（`publish`）：`review/` 排除；≥10 MB 的论文 PDF 降级为可选；
   *   · 导师回传（`mentor`）：`review/` 推荐；论文 PDF 不因体积降级 ——
   *     用户原话"要去除机器生成文件，但是要有自己撰写的论文 PDF"。
   */
  {
    const UP = await import(lib('research/upload-selection.js'))
    assertEq(UP.classify('review/x.md', 100).decision, 'excluded', '发布侧把 review/ 排除')
    assertEq(UP.classify('review/x.md', 100, 'mentor').decision, 'recommended', '导师侧 review/ 推荐')
    assertEq(
      UP.classify('papers/p/paper.pdf', 12 * 1024 * 1024).decision,
      'optional',
      '发布侧：≥10 MB 的论文 PDF 降级为可选',
    )
    assertEq(
      UP.classify('papers/p/paper.pdf', 12 * 1024 * 1024, 'mentor').decision,
      'recommended',
      '导师侧：论文 PDF 不因体积降级',
    )
    assertEq(
      UP.classify('harness/session.log', 10, 'mentor').decision,
      'excluded',
      '导师侧照样排除机器产物（用户要求"去除机器生成文件"）',
    )
    assertEq(UP.isSelectable('excluded'), false, 'excluded 在对话框里不可勾选')
    /*
     * npm 缓存目录必须被排除（2026-09）：某真实工作区的
     * `papers/paper-main/presentation/.npmcache/_cacache/…` 有 158 个 blob、18.9 MiB，
     * 占那份工作区快照的 **55%**。两种用途都不能把它带上。
     */
    const cacache =
      'papers/paper-main/presentation/.npmcache/_cacache/content-v2/sha512/40/cc/ebe1c1a8'
    assertEq(UP.classify(cacache, 3496008).decision, 'excluded', 'npm 缓存目录（.npmcache）不发布')
    assertEq(UP.classify(cacache, 3496008, 'mentor').decision, 'excluded', 'npm 缓存目录也不回传')
    assertEq(
      UP.classify('papers/paper-main/presentation/talk-deck.html', 661774, 'mentor').decision,
      'recommended',
      '同一目录下的研究资产（讲稿）照常推荐 —— 排除的是缓存，不是整个目录',
    )
  }

  // 不含研究定义的工作区：明确说"没有研究工作"，不是给一个空清单
  const noResearch = await planHost.handler('mentor/uploadPlan', { workspaceId: 'ws-plain' })
  assertEq(noResearch.ok, false, '没有研究定义的工作区不能回传')
  assertEq(noResearch.error?.code, 'no-research', '原因码是 no-research')

  // 注册表里没有这个 id（工作区被删了）：不是"没东西可传"，是"找不到"
  const gone = await planHost.handler('mentor/uploadPlan', { workspaceId: 'ws-gone' })
  assertEq(gone.error?.code, 'not-found', '工作区不存在 → not-found（提示刷新重试）')

  /* ── ③ 上传：增量（sha256 一致就跳过）+ 分批 + 真实进度 ──────────────── */
  const digestOf = (text) => `sha256:${createHash('sha256').update(Buffer.from(text)).digest('hex')}`
  const serverItems = [
    // 与本地**完全一致** → 不该重传（服务器不去重：同路径再传 = 新行 + 新字节，配额照涨）
    { id: 'f1', relative_path: 'project.md', size: Buffer.byteLength(PROJECT_MD), sha256: digestOf(PROJECT_MD) },
    // 同一路径的历史多行：**最后一版**才算数（服务器按 created_at asc 返回）
    { id: 'f2', relative_path: 'review/01-总体意见.md', size: 9, sha256: 'sha256:old' },
  ]
  let postCount = 0
  let midUpload = null
  let uploadHost = null
  const upload = makeHost({
    listLocalWorkspaces: registry,
    handler: async (call) => {
      if (call.method === 'GET') {
        // 导师回传前比的是**自己那一侧**（v20：同名两侧并存，学生那份与这份无关）
        assertReadSide(call.url, 'mentor', '增量比对读导师那一侧')
        return { status: 200, body: { items: serverItems, total_bytes: 100 } }
      }
      postCount += 1
      if (postCount === 2) {
        // 第二批开始的那一刻问进度：第一批的 20 个文件应该已经报上去了
        // （宿主回的是**副本**，所以这里拿到的就是那一刻的数字）
        midUpload = await uploadHost.handler('mentor/uploadProgress', { projectId: PROJECT_ID })
      }
      const paths = call.body.getAll('relative_paths')
      return {
        status: 201,
        body: paths.map((p, i) => ({
          id: `u${postCount}-${i}`,
          relative_path: p,
          size: 1,
          sha256: 'sha256:new',
        })),
      }
    },
  })
  uploadHost = upload
  const picked = plan.defaultSelection
  const uploaded = await upload.handler('mentor/upload', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-mentor',
    paths: picked,
    source: 'mentor',
  })
  assert(
    uploaded.ok,
    `mentor/upload 成功${uploaded.ok ? '' : `（${uploaded.error?.code}: ${uploaded.error?.message}）`}`,
  )
  assertEq(uploaded.value?.skippedExisting, 1, '内容与服务器一致的 project.md 被跳过（增量，不白占配额）')
  assertEq(uploaded.value?.uploaded, picked.length - 1, '其余全部上传')
  assertEq(postCount, 2, '超过 20 个文件 → 分 2 批（服务器每批上限）')
  assertEq(midUpload?.value?.totalFiles, picked.length - 1, '进度总数 = 待传文件数')
  assertEq(midUpload?.value?.doneFiles, 20, '第二批开始时已报 20 个（进度是真的，不是装饰）')
  assertEq(midUpload?.value?.running, true, '上传期间 running = true')
  const form = upload.calls.find((c) => c.method === 'POST')?.body
  assert(form instanceof FormData, '用 multipart 表单（不自己设 content-type）')
  // 路径按字典序切批，所以某个文件可能落在**第二批** —— 看全部批次的并集
  const sentPaths = upload.calls
    .filter((c) => c.method === 'POST')
    .flatMap((c) => (c.body instanceof FormData ? c.body.getAll('relative_paths') : []))
  assert(
    sentPaths.includes('review/figures/trend.png') && sentPaths.includes('papers/paper-main/paper.pdf'),
    '相对路径保留目录层次（服务器的还原依据）',
  )
  assertEq(sentPaths.length, picked.length - 1, '传的正好是"变化的那些"（不含跳过的）')
  const after = await upload.handler('mentor/uploadProgress', { projectId: PROJECT_ID })
  assertEq(after.value?.running, false, '上传结束后 running = false')
  assertEq(after.value?.doneFiles, uploaded.value?.uploaded, '结束后已传数 = 本次上传数')

  /*
   * 省略 `source` = `owner`（服务器默认，也是 v19 界面的行为）：
   * 学生自己【上传】走的就是这一侧 —— 不能把导师那份当成"我已经有的"。
   */
  {
    let seen = null
    const studentSide = makeHost({
      listLocalWorkspaces: registry,
      handler: async (call) => {
        if (call.method === 'GET') {
          seen = call.url
          return { status: 200, body: { items: serverItems, total_bytes: 100 } }
        }
        const paths = call.body.getAll('relative_paths')
        return { status: 201, body: paths.map((p, i) => ({ id: `s${i}`, relative_path: p, size: 1, sha256: '' })) }
      },
    })
    const res = await studentSide.handler('mentor/upload', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-mentor',
      paths: ['project.md'],
    })
    assertEq(res.value?.skippedExisting, 1, '不传 source：按 owner 侧比对（默认口径）')
    assert(!String(seen).includes('source='), '不传 source → 不带查询参数（= 服务器的 owner 默认）')
  }

  // 旧服务器**不给 sha256** → 比对必然不等 → 保守全传（宁可多传，不可漏传）
  {
    let legacyPosts = 0
    const legacy = makeHost({
      listLocalWorkspaces: registry,
      handler: async (call) => {
        if (call.method === 'GET') {
          // 显式带 `?source=mentor`：旧服务器忽略它（那时只有一侧，读到的正是导师那份），
          // 新服务器则精确读到导师那一侧 —— 两种服务器上这个 URL 都是对的
          assertReadSide(call.url, 'mentor', '增量比对读导师那一侧')
          return { status: 200, body: { items: [{ id: 'f1', relative_path: 'project.md', size: 5 }], total_bytes: 5 } }
        }
        legacyPosts += 1
        const paths = call.body.getAll('relative_paths')
        return { status: 201, body: paths.map((p, i) => ({ id: `l${i}`, relative_path: p, size: 1, sha256: '' })) }
      },
    })
    const res = await legacy.handler('mentor/upload', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-mentor',
      paths: ['project.md'],
      source: 'mentor',
    })
    assertEq(res.value?.skippedExisting, 0, '旧服务器没有摘要可比 → 不跳过（保守）')
    assertEq(res.value?.uploaded, 1, '旧服务器上照传')
    assertEq(legacyPosts, 1, '一批搞定')
  }

  // 界面递进来的路径必须落在**扫描结果**内：机器产物、工作区外的一律拒绝
  const machine = await upload.handler('mentor/upload', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-mentor',
    paths: ['harness/session.log'],
  })
  assertEq(machine.ok, false, '机器产物不在白名单：拒')
  assertEq(machine.error?.code, 'bad-request', '拒的原因可读（bad-request）')
  const outside = await upload.handler('mentor/upload', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-mentor',
    paths: ['../outside.md'],
  })
  assertEq(outside.ok, false, '工作区外的路径被拒（不能读任意盘上文件）')

  // 服务器还没放开权限 → 403 FILE_PATH_RESERVED → 说清"服务器需放开"，不是"没权限"
  const reserved = makeHost({
    listLocalWorkspaces: registry,
    handler: async (call) => {
      if (call.method === 'GET') {
        assertReadSide(call.url, 'mentor', '增量比对读导师那一侧')
        return { status: 200, body: { items: [], total_bytes: 0 } }
      }
      return { status: 403, body: { error: { code: 'FILE_PATH_RESERVED', message: 'reserved', details: {} } } }
    },
  })
  const reservedRes = await reserved.handler('mentor/upload', {
    projectId: PROJECT_ID,
    workspaceId: 'ws-mentor',
    paths: ['review/01-总体意见.md'],
    source: 'mentor',
  })
  assertEq(reservedRes.ok, false, '越界上传失败')
  assertEq(reservedRes.error?.code, 'path-reserved', '403 FILE_PATH_RESERVED → path-reserved')
  assert(
    String(reservedRes.error?.message ?? '').includes('review/'),
    '文案点明"服务器只放开 review/"（不是笼统的没权限）',
  )

  // 客户端也先拦一道：绝对路径 / `..` 在发请求前就拒（省一次往返）
  let clientBlocked = false
  try {
    await SC.uploadWorkspaceFiles(
      'http://localhost:8000',
      KEY,
      PROJECT_ID,
      [{ relPath: '../evil.md', bytes: Buffer.from('x') }],
      {
        fetchImpl: async () => ({
          ok: true,
          status: 201,
          json: async () => [],
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      },
    )
  } catch (e) {
    clientBlocked = e instanceof SC.ServerError && e.code === 'bad-request'
  }
  assert(clientBlocked, '客户端在发请求前就拦住非法相对路径')

  // 读盘只允许在研究根内（`readResearchFile` 是唯一入口，safeJoin 兜底）
  let escaped = false
  try {
    SYNC.readResearchFile(root, '../outside.md')
  } catch {
    escaped = true
  }
  assert(escaped, 'readResearchFile 拒绝逃出研究根的相对路径')
  assertEq(SYNC.readResearchFile(root, 'review/01-总体意见.md').length, Buffer.byteLength('# 总体意见\n'), '正常路径读得到')

  /* ── ④ 超时按体积估（慢 ≠ 死，不能用一个与体积无关的常数）────────────── */
  assertEq(RPC.uploadTimeoutForBytes(0), SC.SERVER_TIMEOUT_MS, '空批量就是基础超时')
  assert(
    RPC.uploadTimeoutForBytes(50 * 1024 * 1024) > 15 * 60 * 1000,
    '50 MB 的一批给到 15 分钟以上（细链路上 8 秒必然假失败）',
  )
  assertEq(RPC.uploadTimeoutForBytes(10 ** 12), RPC.UPLOAD_TIMEOUT_MAX_MS, '再大也有 30 分钟硬上限')
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
      // 补读的是**导师那一侧**（v20 起两侧并存；旧服务器忽略这个参数，而那时
      // 导师的交付本来就在唯一的那一侧里 —— 两种服务器上都数得对）
      assert(
        call.url.endsWith(`/projects/${PROJECT_ID}/files?source=mentor`),
        `旧服务器：为 ACCEPTED 补读导师那一侧的文件列表（实际 ${call.url}）`,
      )
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
  const archiveReply = ({
    zip = ZIP,
    entries = 3,
    chunks,
    headers = true,
    chunkDelayMs,
    /** 归档水位头（`X-Source-Updated-At`；不给 = 老服务器没这个头）。 */
    watermark = null,
  } = {}) => ({
    status: 200,
    bytes: zip,
    ...(chunks ? { chunks, chunkDelayMs } : { chunks: [zip] }),
    headers: {
      get: (k) => {
        const key = k.toLowerCase()
        if (!headers) return null
        if (key === 'content-disposition') return DISPOSITION
        if (key === 'x-file-count') return String(entries)
        if (key === 'x-source-updated-at') return watermark
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
  /**
   * 导师那一侧的归档文件名带 `-mentor` 后缀（服务器 `archive_download_name`）——
   * 学生要能一眼看出"这份是导师的工作区"，而不是自己那份。
   */
  const DISPOSITION_MENTOR = DISPOSITION.replace('.zip', '-mentor.zip')
  /**
   * @param side 这次要读哪一侧：`owner`（默认，导师下学生的工作区）或 `mentor`
   *   （学生取导师的交付）—— 预检与归档**必须是同一侧**，测试替服务器把这件事断言住。
   */
  const hostFor = (dirs, { filename = true, archive = archiveReply(), side = 'owner' } = {}) => {
    const want = side === 'mentor' ? '?source=mentor' : ''
    return makeHost({
      handler: async (call) => {
        if (call.url.endsWith(`/files${want}`)) {
          return { status: 200, body: { items: FILES, total_bytes: 15 } }
        }
        assert(
          call.url.endsWith(`/projects/${PROJECT_ID}/files/archive${want}`),
          `下载取的是归档端点（ZIP），读 ${side} 侧（实际 ${call.url}）`,
        )
        return filename ? archive : { ...archive, headers: undefined }
      },
      listLocalWorkspaces: async () => ({
        available: true,
        items: dirs.map((d, i) => ({ id: `ws-${i}`, title: `工作区 ${i}`, path: d, updatedAt: '' })),
      }),
    })
  }

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

  /*
   * ⑭ **分侧读**（v20）：一个项目里同一路径可以同时存在两侧 —— 学生自己那份（`owner`）
   * 与导师回传那份（`mentor`），互不覆盖。
   *
   *   · 导师【下载】学生的工作区 → `owner`（默认，行为与 v19 完全一致，见上面 ①-⑬）；
   *   · 学生【下载】导师的交付 → `mentor`（服务器给的文件名带 `-mentor` 后缀）。
   *
   * 预检与下载**必须是同一侧**，否则会出现"预检说有 3 个文件、点下去 404"。
   */
  {
    const dir = makeWorkspace('dl-mentor-side')
    const studentHost = hostFor([dir], {
      side: 'mentor',
      archive: archiveReply({ headers: true }),
    })
    // 预检：读 mentor 侧，且预计文件名带 -mentor
    const st = await studentHost.handler('mentor/downloadState', {
      projectId: PROJECT_ID,
      prefix: '学生甲-长上下文推理',
      source: 'mentor',
    })
    assertEq(st.ok, true, '学生侧预检可用')
    assertEq(st.value?.files, 3, '预检读的是导师那一侧的文件数')
    assertEq(st.value?.expectedName, '学生甲-长上下文推理-mentor.zip', '预计文件名带 -mentor 后缀（与学生自己那份区分）')

    // 下载：同一侧；落盘文件名以服务器的 Content-Disposition 为准（同样带后缀）
    const archive = archiveReply({ headers: false })
    const withName = makeHost({
      listLocalWorkspaces: async () => ({
        available: true,
        items: [{ id: 'ws-0', title: 'w', path: dir, updatedAt: '' }],
      }),
      handler: async (call) => {
        if (call.url.includes('/files?') || call.url.endsWith('/files')) {
          return { status: 200, body: { items: FILES, total_bytes: 15 } }
        }
        assert(
          call.url.endsWith(`/projects/${PROJECT_ID}/files/archive?source=mentor`),
          `学生下载取导师那一侧的归档（实际 ${call.url}）`,
        )
        return {
          ...archive,
          headers: {
            get: (k) => {
              const key = k.toLowerCase()
              if (key === 'content-disposition') return DISPOSITION_MENTOR
              if (key === 'x-file-count') return '3'
              return null
            },
          },
        }
      },
    })
    const r = await withName.handler('mentor/download', {
      projectId: PROJECT_ID,
      workspaceId: 'ws-0',
      prefix: '学生甲-长上下文推理',
      source: 'mentor',
    })
    assertEq(r.ok, true, `学生取导师那一份成功${r.ok ? '' : `（${r.error?.code}: ${r.error?.message}）`}`)
    assertEq(
      leftovers(dir),
      ['学生甲-长上下文推理-mentor.zip'],
      '落盘文件名用服务器给的（带 -mentor），学生一眼能分出两份',
    )
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

/* ════════════════════════════════════════════════════════════════════════
 * [9] "学生更新了工作区" —— 水位**存自归档响应**，与列表比对后提示重新下载
 *
 * 判据两条互补、缺一不可（服务器 API.md §13 与 CHANGELOG）：
 *     workspace_updated_at > 水位   → 学生传了新文件 → 提示重新下载
 *     workspace_files      ≠ 文件数  → 学生删了文件   → 提示重新下载
 * 时间戳看不到删除（删文件不让 MAX(created_at) 前进），文件数看不到改写
 * （改同一路径只动时间戳）—— 所以两个水位都要存，且**都取自那一次归档响应**
 * （下载前后列表里的值与 ZIP 会错位：取早了多提示一次、取晚了**会漏文件**）。
 * ════════════════════════════════════════════════════════════════════════ */
section('[9] 学生更新工作区的检测（水位 → 比对 → 提示）')
{
  const SW = await import(lib('research/sync-watermarks.js'))
  const WM_AT = '2026-10-01T10:00:00+08:00'
  const wm = { updatedAt: WM_AT, fileCount: 3, downloadedAt: '2026-10-01T11:00:00.000Z' }

  /* ── ① 判据函数：两条互补判据 + 三态（纯函数先钉住）───────────────────── */
  assertEq(SW.checkStudentChange(undefined, WM_AT, 3), null, '从没下载过 → 无从判断（不编造"有更新"）')
  assertEq(SW.checkStudentChange(wm, undefined, undefined), null, '旧服务器不给列表字段 → 无从判断')
  assertEq(SW.checkStudentChange(wm, null, null), null, '服务器说不可知 → 无从判断（查不到 ≠ 没有）')
  assertEq(
    SW.checkStudentChange(wm, '2026-10-02T09:00:00+08:00', 3),
    { changed: true, reason: 'uploaded' },
    '时间戳变大、文件数没动 → 学生改了同一路径',
  )
  assertEq(
    SW.checkStudentChange(wm, WM_AT, 2),
    { changed: true, reason: 'deleted' },
    '文件数变了、时间戳没动 → 学生删了文件',
  )
  assertEq(
    SW.checkStudentChange(wm, '2026-10-02T09:00:00+08:00', 4),
    { changed: true, reason: 'uploaded' },
    '两个都变 → 报 uploaded（有证据就不放过）',
  )
  assertEq(
    SW.checkStudentChange(wm, WM_AT, 3),
    { changed: false, reason: null },
    '两个判据都可判且都说没动 → 没动',
  )
  assertEq(
    SW.checkStudentChange(wm, WM_AT, null),
    null,
    '只有一半判据可用 → 无从判断（查不全 ≠ 没变，会漏掉看不见的删除）',
  )
  assertEq(
    SW.checkStudentChange({ ...wm, fileCount: null }, WM_AT, 3),
    null,
    '老服务器没存文件数 → 只有时间戳不够断言"没动"',
  )
  assertEq(SW.checkStudentChange(wm, 'not-a-date', 3), null, '时间戳解析不了 → 该分支未知')
  // 同一台服务器给的 ISO：等值比较（毫秒级时差不算"更新"）
  assertEq(
    SW.checkStudentChange(wm, '2026-10-01T02:00:00Z', 3),
    { changed: false, reason: null },
    '同一时刻的不同写法（+08:00 vs Z）不算更新',
  )

  /* ── ② 水位存自**归档响应**：owner 侧存；mentor 侧 / 老服务器不存 ──────── */
  const zipBytes = (entries = 3) => {
    const local = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(26, 7)])
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(entries, 8)
    eocd.writeUInt16LE(entries, 10)
    return Buffer.concat([local, eocd])
  }
  const archiveHeaders = (watermark, entries = 3) => ({
    get: (k) => {
      const key = String(k).toLowerCase()
      if (key === 'content-disposition') return "attachment; filename*=UTF-8''w.zip"
      if (key === 'x-file-count') return String(entries)
      if (key === 'x-source-updated-at') return watermark
      return null
    },
  })
  const dlDir = join(work, 'wm-dl')
  const store = SW.createMemorySyncWatermarkStore()
  const dlHost = (watermark, entries = 3) =>
    makeHost({
      syncStore: store,
      handler: async (call) => {
        // ⚠️ 先判归档，且用 **includes**：`/files/archive?source=mentor` 结尾不是
        // `/files/archive`，而 `/files/archive` 又 includes('/files') —— 两种顺序/匹配
        // 写法都会把 ZIP 请求当成文件列表回 JSON（实测：下载拿到 0 字节 → 假失败）
        if (call.url.includes('/files/archive')) {
          return {
            status: 200,
            bytes: zipBytes(entries),
            chunks: [zipBytes(entries)],
            headers: archiveHeaders(watermark, entries),
          }
        }
        return { status: 200, body: { items: [], total_bytes: 0 } }
      },
      listLocalWorkspaces: async () => ({
        available: true,
        items: [{ id: 'ws-0', title: 'w', path: dlDir, updatedAt: '' }],
      }),
    })

  // owner 侧（导师下学生的工作区）→ 存水位，且两个值都来自这次归档响应
  const got = await dlHost(WM_AT, 3).handler('mentor/download', {
    projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner',
  })
  assertEq(got.ok, true, `owner 侧下载成功${got.ok ? '' : `（${got.error?.code}）`}`)
  const saved = Object.values(store.all())[0]
  assertEq(Object.keys(store.all()).length, 1, '只记一个项目的水位')
  assertEq(saved?.updatedAt, WM_AT, '水位取自 X-Source-Updated-At（不是下载前后列表里的值）')
  assertEq(saved?.fileCount, 3, '文件数取自 X-File-Count（默认快照口径 = workspace_files）')
  assert(Boolean(saved?.downloadedAt), '落盘时刻也有（诊断用，不参与比较）')

  // 老服务器没有水位头 → **不写**：保持"未知"比写个错的水位强
  const noHeader = await dlHost(null, 5).handler('mentor/download', {
    projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner',
  })
  assertEq(noHeader.ok, true, '老服务器（无水位头）下载照常成功')
  assertEq(store.all()[Object.keys(store.all())[0]]?.updatedAt, WM_AT, '没有水位头就不动旧水位（不覆盖成错值）')

  // mentor 侧（学生取导师那一份）→ 不存：列表的 workspace_* 是 owner 侧，存了也没得比
  const mentorDl = await dlHost('2026-10-05T00:00:00Z', 2).handler('mentor/download', {
    projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'mentor',
  })
  assertEq(mentorDl.ok, true, 'mentor 侧下载成功')
  assertEq(store.all()[Object.keys(store.all())[0]]?.updatedAt, WM_AT, 'mentor 侧的水位不写进 owner 记录（不可比）')

  /* ── ③ mentor/list 把比对结果给出来（三态 + 只挂在 ACCEPTED 上）────────── */
  const baseProposal = (over = {}) => ({
    id: 'p-wm',
    mentor_id: 'm-1',
    researcher_id: 'r-1',
    project_id: PROJECT_ID,
    guidance_scope: '-',
    total_fee: 100,
    deposit_amount: 20,
    success_payment_amount: 80,
    success_condition: { type: 'MUTUAL_COMPLETION' },
    status: 'ACCEPTED',
    review_files: 1,
    expires_at: '2026-12-01T00:00:00Z',
    created_at: '2026-09-19T00:00:00Z',
    ...over,
  })
  const listHost = (body, withStore = true) =>
    makeHost({
      ...(withStore ? { syncStore: store } : {}),
      handler: async (call) =>
        call.url.endsWith('/mentorship-proposals')
          ? { status: 200, body }
          : { status: 500, body: {} },
    })
  const list = async (body, withStore = true) =>
    (await listHost(body, withStore).handler('mentor/list', {})).value?.proposals ?? []

  // (a) 学生传了新文件（时间戳变大）→ uploaded，且三态字段照直读
  const [a] = await list([baseProposal({
    workspace_updated_at: '2026-10-02T09:00:00+08:00',
    workspace_files: 4,
  })])
  assertEq(a.sync, { changed: true, reason: 'uploaded' }, '(a) 水位之后学生又传了 → 提示重新下载')
  assertEq(a.workspaceFiles, 4, '(a) workspace_files 解析成数字')
  assertEq(a.workspaceUpdatedAt, '2026-10-02T09:00:00+08:00', '(a) workspace_updated_at 原样读出')

  // (b) 时间戳没动、文件数变了 → deleted（删除不会让时间戳前进）
  const [b] = await list([baseProposal({ workspace_updated_at: WM_AT, workspace_files: 2 })])
  assertEq(b.sync, { changed: true, reason: 'deleted' }, '(b) 文件数变小 → 学生删了文件')

  // (c) 两个判据都说没动 → changed: false（界面不提示）
  const [c] = await list([baseProposal({ workspace_updated_at: WM_AT, workspace_files: 3 })])
  assertEq(c.sync, { changed: false, reason: null }, '(c) 没动 → 不提示')

  // (d) 服务器说不可知（项目不可读 / 软删除）→ null，且**不**退化成 0 / epoch
  const [d] = await list([baseProposal({ workspace_updated_at: null, workspace_files: null })])
  assertEq(d.sync, null, '(d) 不可知 → 无从判断（三态不破）')
  assertEq(d.workspaceFiles, null, '(d) 显式 null 原样保留（不是 0）')

  // (e) 旧服务器：响应里没有这两个字段 → undefined / sync: null
  const [e] = await list([baseProposal()])
  assertEq(e.workspaceFiles, undefined, '(e) 旧服务器：字段缺失 → undefined（不是 0）')
  assertEq(e.workspaceUpdatedAt, undefined, '(e) 时间戳同样缺失')
  assertEq(e.sync, null, '(e) 没有字段就无从判断 → null（界面不提示）')

  // (f) **这个项目从没下载过**（store 里只有上面那个项目的水位）→ null：不编造"有更新"
  const [f2] = await list([baseProposal({
    project_id: 'never-downloaded',
    workspace_updated_at: '2026-10-02T09:00:00+08:00',
    workspace_files: 9,
  })])
  assertEq(f2.sync, null, '(f) 没有水位 → null（不是 true，也不是 false）')

  // (g) 宿主没装 syncStore（精简环境）→ 一律 null，不报错
  const [g] = await list([baseProposal({ workspace_updated_at: '2026-10-02T09:00:00+08:00', workspace_files: 9 })], false)
  assertEq(g.sync, null, '(g) 没有水位存储 → null（提示能力缺席 ≠ 报错）')

  // (h) 只有 ACCEPTED 才挂 sync：PROPOSED 行不谈"学生更新"
  const [h] = await list([baseProposal({ status: 'PROPOSED' })])
  assertEq('sync' in h, false, '(h) 非 ACCEPTED 行不带 sync 字段')
}

rmSync(work, { recursive: true, force: true })

console.log(`\n${failed === 0 ? '✅' : '❌'} mentorship-files: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exitCode = 1
}
