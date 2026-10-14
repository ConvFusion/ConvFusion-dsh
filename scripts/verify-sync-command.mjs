/**
 * `/research sync @某.zip` 的自检（宿主侧那一半）。
 *
 * 分工：`skills/sync.md` 装**固定流程**（由 `verify-workspace-identity.mjs` [4] 断言内容），
 * 这里断言**本次参数**怎么来 —— 引用怎么解、ZIP 怎么校验、判定怎么收集、交接文本怎么写。
 *
 * ```text
 * [1] 动词与引用：`sync` / `同步` 的识别，`@path` / `@"path with space"` 的解析
 * [2] 引用落盘校验：存在 / 目录 / 缺文件（给同前缀候选）
 * [3] ZIP 校验：真的 ZIP / 空文件 / 不是 ZIP / 旁边还有半成品
 * [4] 判定收集：便签 + 本机标记 → 五态（missing 归 new，缺一端绝不判"另一项"）
 * [5] 交接文本：只带参数、点明"先加载 sync 技能"、缺便签时不假装知道
 * [6] 下载便签：往返、realpath 归一（macOS /var 与 /private/var）、上限、坏文件不致命
 * [7] 静态接线：命令分支在 followup 之前、ZIP 不合格就拒绝、下载成功写便签
 * ```
 *
 * 用法：`node scripts/verify-sync-command.mjs [pkgDir]`
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const SYNC = await import(lib('research/sync-request.js'))
const CMD = await import(lib('research/commands.js'))
const WS = await import(lib('research/workspace.js'))
const NOTES = await import(lib('research/sync-note.js'))
const WI = await import(lib('research/work-identity.js'))

let passed = 0
let failed = 0
const failures = []
const section = (title) => console.log(`\n${title}`)
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
const assertEq = (actual, expect, label) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expect)
  if (!ok) console.log(`    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  assert(ok, label)
}

const work = mkdtempSync(join(tmpdir(), 'cf-sync-'))
const WS_A = 'ws_' + 'a'.repeat(32)
const WS_B = 'ws_' + 'b'.repeat(32)

/** 造一个最小的 ZIP（PK\x03\x04 头 + 随便几个字节；这里只验魔数，不解包）。 */
function makeZip(dir, name, bytes = 64) {
  const p = join(dir, name)
  const buf = Buffer.alloc(bytes)
  buf.write('PK\x03\x04', 0, 'binary')
  writeFileSync(p, buf)
  return p
}

try {
  /* ════════════════════════════════════════════════════════════════════ */
  section('[1] 动词与引用：`/research sync @某.zip`')
  {
    assert(SYNC.isSyncArg('sync @x.zip'), '识别 sync')
    assert(SYNC.isSyncArg('  同步 @x.zip'), '识别中文别名 同步（与"导出研究方法"同习惯）')
    assert(SYNC.isSyncArg('sync'), '只有动词也算（后面会报"没给压缩包"）')
    assert(SYNC.isSyncArg('sync: @x.zip'), '允许 sync: 这种冒号写法')
    assert(!SYNC.isSyncArg('synchronize the data'), '**不**把 synchronize 当动词（词边界）')
    assert(!SYNC.isSyncArg('分析一下 sync 机制'), '动词必须在**开头**（句中不触发）')
    assert(!SYNC.isSyncArg('导出研究方法'), '不抢其它子命令')

    assertEq(SYNC.zipRefOf('sync @/w/x.zip'), '@/w/x.zip', '取出动词之后的引用原文')
    assertEq(SYNC.zipRefOf('sync'), '', '没给引用时是空串')

    assertEq(SYNC.normalizeZipRef('@/w/x.zip', '/sess'), '/w/x.zip', '`@绝对路径`')
    assertEq(SYNC.normalizeZipRef('@"my research/x.zip"', '/sess'), '/sess/my research/x.zip', '`@"含空格"` 去引号并按会话工作区解析')
    assertEq(SYNC.normalizeZipRef('mentors/x.zip', '/sess'), '/sess/mentors/x.zip', '裸相对路径也接受')
    assertEq(SYNC.normalizeZipRef('  @/w/x.zip  ', '/sess'), '/w/x.zip', '去掉两侧空白')
    assertEq(SYNC.normalizeZipRef('"/w/x.zip"', '/sess'), '/w/x.zip', '只有成对引号也接受（手打粘贴的常见形态）')
  }

  /* ════════════════════════════════════════════════════════════════════ */
  section('[2] 引用落盘校验')
  {
    const ws = join(work, 'ws-ref')
    mkdirSync(ws, { recursive: true })
    const zip = makeZip(ws, 'Jev-Paper2.zip')
    const ok = SYNC.resolveZipReference('@Jev-Paper2.zip', ws)
    assert(ok.ok && ok.path === zip, '存在 → 解析成绝对路径')

    const missing = SYNC.resolveZipReference('@Nope.zip', ws)
    assert(!missing.ok, '不存在 → 失败')
    assert(missing.error.includes('找不到这个文件'), '失败信息说清"找不到这个文件"')
    assertEq(missing.candidates, [], '没有候选时不硬凑')

    /*
     * 宿主同名会加序号：真实场景是用户按记忆写了 `Jev-Paper2.zip`，
     * 而盘上（因为重下过）只有 `Jev-Paper2-2.zip` —— 这时必须把候选列出来，
     * 否则用户只看到"找不到"，会以为文件没了。
     */
    const ws2 = join(work, 'ws-ref2')
    mkdirSync(ws2, { recursive: true })
    makeZip(ws2, 'Jev-Paper2-2.zip')
    makeZip(ws2, 'Jev-Paper2-3.zip')
    const cand = SYNC.resolveZipReference('@Jev-Paper2.zip', ws2)
    assertEq(
      cand.candidates.map((c) => c.split('/').pop()),
      ['Jev-Paper2-2.zip', 'Jev-Paper2-3.zip'],
      '同前缀候选列出来（否则用户只会看到"找不到"）',
    )

    const dirRes = SYNC.resolveZipReference('@.', ws)
    assert(!dirRes.ok && dirRes.error.includes('不是文件'), '目录 → 明确说"不是文件"')

    const empty = SYNC.resolveZipReference('   ', ws)
    assert(!empty.ok && empty.error.includes('没有给出压缩包'), '引用为空 → 明确提示（`/research sync` 后面什么都没写）')
  }

  /* ════════════════════════════════════════════════════════════════════ */
  section('[3] ZIP 校验：能不能用来同步')
  {
    const dir = join(work, 'ws-zip')
    mkdirSync(dir, { recursive: true })
    const good = makeZip(dir, 'good.zip', 128)
    const g = SYNC.inspectZip(good)
    assert(g.ok && g.bytes === 128, '真 ZIP（PK\\x03\\x04）→ 通过，并给出字节数')

    const emptyFile = join(dir, 'empty.zip')
    writeFileSync(emptyFile, '')
    assert(!SYNC.inspectZip(emptyFile).ok, '空文件 → 不通过')
    assert(SYNC.inspectZip(emptyFile).error.includes('空文件'), '空文件的原因说清了')

    const notZip = join(dir, 'note.zip')
    writeFileSync(notZip, 'this is not a zip at all')
    const nz = SYNC.inspectZip(notZip)
    assert(!nz.ok && nz.error.includes('不是 ZIP'), '不是 ZIP → 不通过（"可能还没下完，或者选错了文件"）')

    // 下载中的半成品（openDownloadPart 落的就是 .convfusion-*.part）
    writeFileSync(join(dir, '.convfusion-good-abc123.zip.part'), Buffer.alloc(32))
    const withPart = SYNC.inspectZip(good)
    assert(withPart.ok, '旁边有半成品**不阻断**（用户可能只是还没清掉）')
    assert((withPart.notice ?? '').includes('没写完的下载片段'), '但要**提醒**一下（这是现场检查，比提示词里写一句话强）')
  }

  /* ════════════════════════════════════════════════════════════════════ */
  section('[4] 判定收集：便签 + 本机标记 → 五态')
  {
    const mk = (name, opts = {}) => {
      const root = join(work, name, 'workspace')
      mkdirSync(root, { recursive: true })
      if (opts.research !== false) {
        writeFileSync(join(root, 'project.md'), `---\ntopic: ${opts.topic ?? '分层记忆'}\n---\n`)
        writeFileSync(join(root, 'research-state.md'), '# state\n')
      }
      if (opts.localId) {
        mkdirSync(join(root, '.convfusion'), { recursive: true })
        writeFileSync(join(root, '.convfusion', 'work.json'), JSON.stringify({ workspace_id: opts.localId }))
      }
      const zip = makeZip(join(work, name), 'snap.zip')
      return { root, zip }
    }
    const notes = NOTES.createMemorySyncNoteStore()
    const factsFor = (root, zip, sessionWs) =>
      SYNC.collectSyncFacts({ zip, sessionWorkspace: sessionWs, researchRoot: root, noteStore: notes })

    // new：研究根不存在
    {
      const t = mk('f-new', { research: false })
      rmSync(join(work, 'f-new', 'workspace'), { recursive: true, force: true })
      const f = factsFor(t.root, t.zip, join(work, 'f-new'))
      assertEq(f.status, 'new', '没有研究根 → new')
      assertEq(f.localWorkspaceId, null, 'new 时本机标识为空')
      assertEq(f.remoteWorkspaceId, null, '没便签时服务器标识为空')
    }
    // same：两端一致
    {
      const t = mk('f-same', { localId: WS_A, topic: '分层记忆的信息论' })
      notes.put({
        zipPath: t.zip,
        remoteWorkspaceId: WS_A,
        projectId: 'p1',
        projectTitle: '学生甲的工作区',
        serverUrl: 'https://s',
        source: 'owner',
        savedAt: new Date().toISOString(),
      })
      const f = factsFor(t.root, t.zip, join(work, 'f-same'))
      assertEq(f.status, 'same', '两端标识一致 → same')
      assertEq(f.localWorkspaceId, WS_A, '本机标识读到了')
      assertEq(f.remoteWorkspaceId, WS_A, '服务器标识来自便签')
      assertEq(f.localTopic, '分层记忆的信息论', '顺带读到研究主题（帮 agent 认人）')
    }
    // other：两端都有、不一致
    {
      const t = mk('f-other', { localId: WS_B })
      notes.put({
        zipPath: t.zip,
        remoteWorkspaceId: WS_A,
        projectId: null,
        projectTitle: null,
        serverUrl: null,
        source: 'mentor',
        savedAt: new Date().toISOString(),
      })
      assertEq(factsFor(t.root, t.zip, join(work, 'f-other')).status, 'other', '两端不一致 → other')
    }
    // unknown：有研究但本地读不到标识
    {
      const t = mk('f-unknown', { localId: null })
      notes.put({
        zipPath: t.zip,
        remoteWorkspaceId: WS_A,
        projectId: null,
        projectTitle: null,
        serverUrl: null,
        source: 'owner',
        savedAt: new Date().toISOString(),
      })
      assertEq(factsFor(t.root, t.zip, join(work, 'f-unknown')).status, 'unknown', '本地无标识 → unknown（绝不判"另一项"）')
    }
    // unverifiable：服务器没给（没便签）
    {
      const t = mk('f-unver', { localId: WS_A })
      assertEq(
        factsFor(t.root, t.zip, join(work, 'f-unver')).status,
        'unverifiable',
        '服务器没标识 → unverifiable（也绝不判"另一项"）',
      )
    }
    // 注册表那一半也生效（解压前只有注册表时）
    {
      const t = mk('f-registry', { localId: null })
      const store = WI.createMemoryWorkIdentityStore()
      store.set(t.root, WI.makeWorkIdentity({ workspaceId: WS_A, projectId: 'p', serverUrl: 's', accountId: 'a', role: 'owner' }))
      notes.put({
        zipPath: t.zip,
        remoteWorkspaceId: WS_A,
        projectId: null,
        projectTitle: null,
        serverUrl: null,
        source: 'owner',
        savedAt: new Date().toISOString(),
      })
      const f = SYNC.collectSyncFacts({
        zip: t.zip,
        sessionWorkspace: join(work, 'f-registry'),
        researchRoot: t.root,
        noteStore: notes,
        identityStore: store,
      })
      assertEq(f.status, 'same', '注册表里的标识也算数（解压前就判得出来）')
    }
    assertEq(SYNC.syncStatusOf('missing'), 'new', 'missing 归到 new（落盘那一步会把目录建出来）')
    for (const s of ['new', 'same', 'other', 'unknown', 'unverifiable']) {
      assert(SYNC.syncStatusText(s).length > 0, `判定 ${s} 有一句人话说明`)
    }
    assert(SYNC.syncStatusText('other').includes('备份'), 'other 的说明写明"先备份再换"')
    assert(SYNC.syncStatusText('unverifiable').includes('盘查'), 'unverifiable 的说明是"先盘查"')
  }

  /* ════════════════════════════════════════════════════════════════════ */
  section('[5] 交接文本：只带本次参数')
  {
    const t = { zip: join(work, 't.zip'), bytes: 12_900_000 }
    const made = SYNC.buildSyncText(
      {
        ...t,
        zipOk: true,
        workspace: '/w',
        researchRoot: '/w/workspace',
        status: 'other',
        localWorkspaceId: WS_B,
        localConflict: false,
        localTopic: '分层记忆',
        remoteWorkspaceId: WS_A,
        projectId: 'p1',
        projectTitle: null,
        serverUrl: 'https://s',
      },
      'workspace/',
    )
    assert(made.includes('先加载 `sync` 技能'), '**点明"先加载 sync 技能"**（否则 agent 可能凭自己理解动手）')
    assert(made.includes(t.zip), '带上了压缩包的绝对路径')
    assert(made.includes('12.3 MB'), '带上了体积（用户能对一眼）')
    assert(made.includes('other'), '带上了判定')
    assert(made.includes('先整体备份') || made.includes('先备份'), '判定说明与技能口径一致')
    assert(made.includes(WS_B) && made.includes(WS_A), '两端标识都给出（agent 自己也能核）')
    assert(made.includes('/w/workspace'), '给出研究根')
    assert(made.includes('workspace/'), '给出研究根相对会话工作区的写法')
    // 流程不该在命令里重复 —— 它属于技能
    assert(!made.includes('═══ 第 1 步'), '命令文本**不重复**技能里的流程（避免两处各说一套）')
    assert(made.split('\n').length < 30, '交接文本很短（一行命令 + 一段参数）')

    const noNote = SYNC.buildSyncText(
      {
        ...t,
        zipOk: true,
        workspace: '/w',
        researchRoot: '/w/workspace',
        status: 'unverifiable',
        localWorkspaceId: null,
        localConflict: false,
        localTopic: null,
        remoteWorkspaceId: null,
        projectId: null,
        projectTitle: null,
        serverUrl: null,
      },
      '',
    )
    assert(noNote.includes('没有记录'), '没便签时**明说"没记录"**，不假装知道')
    assert(noNote.includes('读不到'), '本机标识也读不到时说清')
    assert(noNote.includes('`.'), '旧布局时相对前缀写成 `.`（相对会话工作区就是它自己）')

    const conflicted = SYNC.buildSyncText(
      {
        ...t,
        zipOk: true,
        workspace: '/w',
        researchRoot: '/w/workspace',
        status: 'unknown',
        localWorkspaceId: null,
        localConflict: true,
        localTopic: null,
        remoteWorkspaceId: WS_A,
        projectId: null,
        projectTitle: null,
        serverUrl: null,
      },
      '',
    )
    assert(conflicted.includes('自相矛盾'), '本机标识冲突时**明确标出**（以盘查为准）')

    const noted = SYNC.buildSyncText(
      {
        ...t,
        zipOk: true,
        notice: 'x.zip 旁边还有没写完的下载片段',
        workspace: '/w',
        researchRoot: '/w/workspace',
        status: 'new',
        localWorkspaceId: null,
        localConflict: false,
        localTopic: null,
        remoteWorkspaceId: null,
        projectId: null,
        projectTitle: null,
        serverUrl: null,
      },
      '',
    )
    assert(noted.includes('没写完的下载片段'), 'ZIP 校验的提醒会带进交接文本')

    const receipt = SYNC.syncReceipt({
      zip: t.zip,
      bytes: t.bytes,
      zipOk: true,
      workspace: '/w',
      researchRoot: '/w/workspace',
      status: 'other',
      localWorkspaceId: null,
      localConflict: false,
      localTopic: null,
      remoteWorkspaceId: null,
      projectId: null,
      projectTitle: null,
      serverUrl: null,
    })
    assert(receipt.includes('已把同步任务交给 Agent'), '回执说清"任务已经交出去"')
    assert(receipt.includes('停下等你确认'), '回执点明第 1 步会停下等确认')
  }

  /* ════════════════════════════════════════════════════════════════════ */
  section('[6] 下载便签')
  {
    const file = join(work, 'notes', 'pending-syncs.json')
    const store = NOTES.createFileSyncNoteStore(() => file)
    const zip = join(work, 'note-ws', 'a.zip')
    mkdirSync(join(work, 'note-ws'), { recursive: true })
    makeZip(join(work, 'note-ws'), 'a.zip')
    const note = {
      zipPath: zip,
      remoteWorkspaceId: WS_A,
      projectId: 'p1',
      projectTitle: 'x',
      serverUrl: 'https://s',
      source: 'owner',
      savedAt: new Date('2026-10-11T00:00:00Z').toISOString(),
    }
    store.put(note)
    assert(existsSync(file), '落盘了（与身份注册表同目录的一个 JSON）')
    assertEq(store.get(zip)?.remoteWorkspaceId, WS_A, '按路径查得回来')
    assertEq(store.get(zip)?.source, 'owner', '记住"下的是哪一侧"（写身份文件时 role 要用）')

    // realpath 归一：macOS 上 /var/folders/... 与 /private/var/folders/... 是同一处
    const viaTmp = join(tmpdir(), 'note-ws', 'a.zip')
    if (viaTmp !== zip && existsSync(viaTmp)) {
      assertEq(store.get(viaTmp)?.remoteWorkspaceId, WS_A, '另一条路径写法（未 realpath）也查得到')
    } else {
      assertEq(NOTES.canonicalZipPath(zip), realpathSync(zip), 'canonicalZipPath 走 realpath')
    }

    // 同路径覆盖，不重复
    store.put({ ...note, remoteWorkspaceId: WS_B, savedAt: new Date('2026-10-12T00:00:00Z').toISOString() })
    assertEq(store.get(zip)?.remoteWorkspaceId, WS_B, '同一路径再写 → 覆盖成最新（不是两条）')
    assertEq(store.all().filter((n) => NOTES.canonicalZipPath(n.zipPath) === NOTES.canonicalZipPath(zip)).length, 1, '不重复存')

    // 上限：用一个干净的 store（否则前一条 2026-10 的便签比这批 2026-01 的更新）
    const limitFile = join(work, 'notes', 'limit.json')
    const limitStore = NOTES.createFileSyncNoteStore(() => limitFile)
    for (let i = 0; i < NOTES.SYNC_NOTE_LIMIT + 5; i += 1) {
      limitStore.put({
        ...note,
        zipPath: join(work, 'note-ws', `z${i}.zip`),
        savedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      })
    }
    assertEq(limitStore.all().length, NOTES.SYNC_NOTE_LIMIT, `便签最多留 ${NOTES.SYNC_NOTE_LIMIT} 条（新的在前）`)
    assert(limitStore.all()[0].zipPath.endsWith('z54.zip'), '最新的排在最前')
    assert(!limitStore.all().some((n) => n.zipPath.endsWith('z0.zip')), '最旧的被挤掉')

    // 坏文件不致命
    writeFileSync(file, '{ this is not json')
    assertEq(NOTES.createFileSyncNoteStore(() => file).all(), [], '坏 JSON → 当空表（绝不让命令起不来）')

    // 内存后端（未配置路径时）
    const mem = NOTES.createMemorySyncNoteStore()
    mem.put(note)
    assertEq(mem.get(zip)?.projectId, 'p1', '内存后端可用（未配置时）')
  }

  /* ════════════════════════════════════════════════════════════════════ */
  section('[7] 静态接线：命令分支 + 下载写便签')
  {
    const cmdSrc = readFileSync(join(PKG, 'src', 'research', 'commands.ts'), 'utf8')
    const idxSrc = readFileSync(join(PKG, 'src', 'index.ts'), 'utf8')
    const rpcSrc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')

    const syncAt = cmdSrc.indexOf('if (isSyncArg(arg))')
    const followAt = cmdSrc.indexOf('followup(ctx, agent, buildKickoffText')
    assert(syncAt > 0, '注册了 sync 分支')
    assert(
      syncAt > 0 && followAt > 0 && syncAt < followAt,
      'sync 分支**先于**一般推进（否则这一行会被当成研究意图丢给 agent）',
    )
    assert(cmdSrc.includes('resolveZipReference'), '分支里解析引用')
    assert(cmdSrc.includes("kind: 'error'") && cmdSrc.includes('下载完成之后再发一次'), 'ZIP 不能用时**明确拒绝**并给下一步')
    assert(cmdSrc.includes('collectSyncFacts'), '分支里收集判定参数')
    assert(cmdSrc.includes('syncNoteStore') && cmdSrc.includes('workIdentity'), '拿得到便签与本机标识')
    assert(cmdSrc.includes('buildSyncText'), '交接文本来自 sync-request（单一来源）')
    assert(/sync \| sync @workspace\.zip/.test(cmdSrc) || /sync @workspace\.zip/.test(cmdSrc), '命令提示里带了用法')

    assert(idxSrc.includes('createFileSyncNoteStore'), '入口建了文件便签 store')
    assert(/pending-syncs\.json/.test(idxSrc), '便签文件与身份注册表同目录')
    assert(/defineResearchCommand\([\s\S]{0,240}?syncNoteStore/.test(idxSrc), '命令拿到便签 store')
    assert(/syncNotes: syncNoteStore/.test(idxSrc), 'RPC 也拿到它（下载成功时写入）')

    const putAt = rpcSrc.indexOf('deps.syncNotes?.put(')
    const okAt = rpcSrc.indexOf('progress.received = received')
    assert(putAt > 0 && okAt > 0 && putAt < okAt, '下载成功路径里写便签（在 return 之前）')
    assert(rpcSrc.includes('remoteWorkspaceId: identityId'), '便签里的标识用**归档响应头**那个权威值')
    assert(/deps\.syncNotes\?\.put\([\s\S]{0,600}?\}\)\s*\} catch \{/.test(rpcSrc), '写便签失败被吞掉（不能因为记账让下载失败）')
    assert(rpcSrc.includes('syncNotes?: SyncNoteStore'), 'deps 里声明了它（可选：没配也能跑）')
  }
  /* ════════════════════════════════════════════════════════════════════ */
  section('[8] 端到端：真的走一遍 `/research sync @某.zip`')
  {
    /** 假 ctx：抓住注册的 CommandDefinition（同 verify-research-command 的做法）。 */
    const mountCommand = (noteStore, identityStore) => {
      let definition = null
      const ctx = {
        get: (name) =>
          name === 'commands' ? { register: (d) => { definition = d; return () => {} } } : undefined,
        inject: () => () => {},
        effect: () => () => {},
        logger: { info: () => {}, warn: () => {}, error: () => {} },
      }
      const disposers = CMD.defineResearchCommand(ctx, () => process.cwd(), undefined, noteStore, identityStore)
      assert(disposers !== null && definition !== null, '命令注册成功（拿到 CommandDefinition）')
      return definition
    }
    /*
     * ⚠️ cwd 必须挂在 `agent.session.header.cwd` —— 那才是命令读会话工作区的位置
     * （放别处会回退到 process.cwd()，测试就悄悄跑在真实工作区上）。
     */
    const makeInvocation = (rawInput, cwd, withFollowup = true) => {
      const sent = []
      const agent = {
        ...(withFollowup ? { followup: (m) => sent.push(m) } : {}),
        session: { header: { cwd } },
      }
      return { invocation: { rawInput, agent, commandId: 'c1', attachments: [], signal: new AbortController().signal }, sent }
    }
    const textOf = (msg) => msg?.content?.map((b) => b.text ?? '').join('\n') ?? ''

    // 一个有研究根的会话工作区：`<ws>/workspace` 里已有另一项研究
    const sess = join(work, 'e2e')
    const root = WS.researchWorkspaceOf(sess)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'project.md'), '---\ntopic: 我自己的研究\n---\n')
    writeFileSync(join(root, 'research-state.md'), '# state\n')
    const zip = makeZip(sess, 'ku-Jev-Paper2.zip', 4096)
    const notes = NOTES.createMemorySyncNoteStore()
    notes.put({
      zipPath: zip,
      remoteWorkspaceId: WS_A,
      projectId: 'p1',
      projectTitle: '学生甲的研究',
      serverUrl: 'https://s',
      source: 'owner',
      savedAt: new Date().toISOString(),
    })
    const definition = mountCommand(notes, WI.createMemoryWorkIdentityStore())

    // ① 正常一次：交接 + 回执
    {
      const { invocation, sent } = makeInvocation('sync @ku-Jev-Paper2.zip', sess)
      const res = await definition.handler(invocation)
      assertEq(res.kind, 'success', 'sync 成功返回 success')
      assertEq(sent.length, 1, 'agent.followup 被调用**恰好一次**（这才叫"交给 agent 了"）')
      assertEq(sent[0]?.source?.kind, 'plugin:convfusion', '来源标记为 plugin:convfusion')
      const text = textOf(sent[0])
      assert(text.includes('先加载 `sync` 技能'), '交接文本要求先加载 sync 技能')
      assert(text.includes(zip), '交接文本带上了 ZIP 绝对路径')
      assert(text.includes(root), '交接文本带上了研究根')
      /*
       * 现场判定：本机读不到标识、便签里有 → `unknown`（有研究但读不到它的标识）。
       * 关键在于**绝不会**武断成 `same`（本地那份明明没有身份）。
       */
      assert(/现场判定：\*\*(unknown|unverifiable|other)\*\*/.test(text), '带上了现场判定')
      assert(!/现场判定：\*\*same\*\*/.test(text), '本机无标识时**绝不**判成 same')
      assert(!text.includes('═══ 第 1 步'), '**不**在命令里重复技能里的流程')
      assert(res.text.includes('已把同步任务交给 Agent'), '回执说清任务已经交出去')
      assert(res.text.includes('停下等你确认'), '回执点明第 1 步会停下等确认')
      // 同步不许顺手建项目：这个工作区里本来就有研究，project.md 不该被动
      assertEq(readFileSync(join(root, 'project.md'), 'utf8').includes('我自己的研究'), true, '没有改动已有 project.md')
    }

    // ② 中文别名
    {
      const { invocation, sent } = makeInvocation('同步 @ku-Jev-Paper2.zip', sess)
      const res = await definition.handler(invocation)
      assertEq(res.kind, 'success', '`/research 同步 @某.zip` 同样可用')
      assertEq(sent.length, 1, '也同样交给 agent')
    }

    // ③ 缺文件：报错 + 候选，而且**绝不**交给 agent
    {
      const { invocation, sent } = makeInvocation('sync @Kuo-Jev-Paper2.zip', sess)
      const res = await definition.handler(invocation)
      assertEq(res.kind, 'error', '文件不存在 → error')
      assertEq(sent.length, 0, '**绝不**把"文件都找不到"的任务交给 agent')
      assert(res.text.includes('找不到这个文件'), '错误信息说清"找不到这个文件"')
      assert(res.text.includes('@'), '顺带教一句怎么用 @ 选文件')
    }

    // ④ 不是 ZIP（或还没下完）：同样拒绝
    {
      const bad = join(sess, 'not-a-zip.zip')
      writeFileSync(bad, 'plain text')
      const { invocation, sent } = makeInvocation('sync @not-a-zip.zip', sess)
      const res = await definition.handler(invocation)
      assertEq(res.kind, 'error', '不是 ZIP → error')
      assertEq(sent.length, 0, '半成品/错文件**不交给** agent（比提示词里写"可能还在下载中"可靠）')
      assert(res.text.includes('不是 ZIP'), '说清"不是 ZIP"')
      assert(res.text.includes('下载完成之后再发一次'), '给出下一步：下载完再发一次')
    }

    // ⑤ 没给引用
    {
      const { invocation, sent } = makeInvocation('sync', sess)
      const res = await definition.handler(invocation)
      assertEq(res.kind, 'error', '没给压缩包 → error')
      assertEq(sent.length, 0, '也不交给 agent')
    }

    // ⑥ 没有 followup 的宿主：明确报错，不假装
    {
      const { invocation } = makeInvocation('sync @ku-Jev-Paper2.zip', sess, false)
      const res = await definition.handler(invocation)
      assertEq(res.kind, 'error', '宿主不提供 agent.followup 时明确报错')
    }

    // ⑦ 便签缺失（换了机器/挪过文件）：退化为"先盘查再判断"，仍然可用
    {
      const sess2 = join(work, 'e2e2')
      const root2 = WS.researchWorkspaceOf(sess2)
      mkdirSync(root2, { recursive: true })
      writeFileSync(join(root2, 'project.md'), '---\ntopic: 另一项\n---\n')
      const zip2 = makeZip(sess2, 'x.zip', 1024)
      const def2 = mountCommand(NOTES.createMemorySyncNoteStore(), WI.createMemoryWorkIdentityStore())
      const { invocation, sent } = makeInvocation('sync @x.zip', sess2)
      const res = await def2.handler(invocation)
      assertEq(res.kind, 'success', '没有便签也能同步（不阻断）')
      const text = textOf(sent[0])
      assert(text.includes('unverifiable'), '退化为 unverifiable（先盘查、给判断、等确认）')
      assert(text.includes('没有记录'), '明说"这次下载没有记录"，不假装知道')
      void zip2
    }
  }

} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`\n${failed === 0 ? '✅' : '❌'} sync-command: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
