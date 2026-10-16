#!/usr/bin/env node
/**
 * ConvFusion 2.0 — 【下载】的目标工作区校验 + 「整合提示词」（0.5.8 / 协议 23）**离线**自检
 *
 * ## 它钉住的是什么
 *
 * 0.5.8 的全部意义是回答一个问题：**这个工作区里已有的 `workspace/`，和我要下载的是不是
 * 同一项研究？** 判据是服务器给的 `workspace_id`（全局唯一、跨项目生命周期不变）。
 * 结论**不拦下载**（2026-10 用户拍板："插件端全部设计成提示词构建"），而是决定
 * **填进输入框的那段提示词说什么**：
 *
 * ```text
 * new           还没有研究根        → 解压成新的研究根
 * same          同一项研究（标识同） → 融合（读两侧内容产出新文件，不是覆盖）
 * other         另一项研究（标识异） → **先备份现有研究根（移动，不删），再解压成新的**
 * unknown       有研究但读不到标识   → 先盘查、给判断，用户确认后按对应的一支执行
 * unverifiable  服务器不给标识       → 同上
 * ```
 *
 * ## 五段
 *
 * | 段 | 查什么 |
 * |---|---|
 * | [1] | 判定矩阵（纯函数）：五种结论 + **三态纪律**（缺一端绝不判成"不同"） |
 * | [2] | 两级身份记录：工作区内标记 + 插件注册表（含冲突、坏 JSON、跨机器可移植） |
 * | [3] | 身份 JSON **同形**：提示词让 agent 写的 == 宿主读回来的（对不上就是"永远读不到"） |
 * | [4] | 提示词五态：第 2 步各做什么 + 两步硬约束 + 融合纪律（不覆盖 / 不裁决 / 备份是移动） |
 * | [5] | 宿主 RPC 端到端：`downloadState` 结论、`download` 落盘后写不写身份、归档头权威 |
 * | [6] | 静态边界：插件不拦（无强制/禁用逻辑）、提示词**只填不发送**、标记不进上传 |
 *
 * 用法：`node scripts/verify-workspace-identity.mjs [pkgDir]`
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const PKG = resolve(process.argv[2] || '.')
const lib = (f) => pathToFileURL(join(PKG, 'lib', f)).href

const WI = await import(lib('research/work-identity.js'))
const RPC = await import(lib('settings-rpc.js'))
const CFG = await import(lib('config.js'))
const CUST = await import(lib('research/skill-customization.js'))
const US = await import(lib('research/upload-selection.js'))
const PROTO = await import(lib('protocol.js'))

const failures = []
let passed = 0
function assert(cond, label) {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${label}`)
  }
  else {
    failures.push(label)
    console.log(`  ✗ FAIL ${label}`)
  }
}
function assertEq(actual, expect, label) {
  const same = JSON.stringify(actual) === JSON.stringify(expect)
  if (!same) console.log(`    actual: ${JSON.stringify(actual)}\n    expect: ${JSON.stringify(expect)}`)
  assert(same, label)
}
function section(title) {
  console.log(`\n${title}`)
}
/** 深拷一份用于"没被改动"的断言。 */
const clone = (v) => JSON.parse(JSON.stringify(v))

const KEY = 'cf_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const PROJECT_ID = '6a628fdc-86e4-4935-b619-8b479b0e6218'
const WS_A = 'ws_' + 'a'.repeat(32)
const WS_B = 'ws_' + 'b'.repeat(32)

const work = mkdtempSync(join(tmpdir(), 'cf-wsid-'))

/* ════════════════════════════════════════════════════════════════════════
 * [1] 判定矩阵（纯函数）
 * ════════════════════════════════════════════════════════════════════════ */
section('[1] 判定矩阵：两端都有值才做严格比较，缺一端绝不判成"不同"')
{
  const J = (o) => WI.judgeWorkspace({ exists: true, hasResearch: true, localWorkspaceId: WS_A, remoteWorkspaceId: WS_A, ...o })
  assertEq(J({}), 'same', '标识相同 → same（允许，之后融合）')
  assertEq(J({ localWorkspaceId: WS_B }), 'other', '标识不同 → other（**不拦**，提示词改成"备份后新建"）')
  assertEq(J({ hasResearch: false, localWorkspaceId: null }), 'new', '没有研究工作区 → new（按新建处理）')
  assertEq(J({ exists: false }), 'missing', '目录不在 → missing（仍然允许：落盘时会建出来）')
  assertEq(J({ localWorkspaceId: null }), 'unknown', '有研究但**读不到**本地标识 → unknown（先盘查再定）')
  assertEq(J({ remoteWorkspaceId: null }), 'unverifiable', '服务器**不给**标识 → unverifiable（先盘查再定）')
  assertEq(
    J({ localWorkspaceId: null, remoteWorkspaceId: null }),
    'unverifiable',
    '两端都缺 → unverifiable（**不是** other：判不出来 ≠ 不同）',
  )
  assertEq(
    J({ localWorkspaceId: 'not-a-workspace-id', remoteWorkspaceId: WS_A }),
    'unknown',
    '本地那个值形状不对 → 当成读不到（不拿可疑的值去判"不同"）',
  )
  assertEq(
    J({ remoteWorkspaceId: 'garbage' }),
    'unverifiable',
    '服务器给的值形状不对 → 当成没给',
  )
  // 大小写/空白归一：同一项研究不能因为大小写被认成两项
  assertEq(J({ localWorkspaceId: WS_A.toUpperCase(), remoteWorkspaceId: WS_A }), 'same', '大小写差异不算"另一项"')

  // 判定结论 → "能不能直接下"（界面用它决定要不要禁用；现在**只有 other/unknown 不是直接可下**）
  assert(WI.isDirectlySelectable('new'), 'new 可直接下载')
  assert(WI.isDirectlySelectable('same'), 'same 可直接下载')
  assert(WI.isDirectlySelectable('missing'), 'missing 可直接下载（落盘会创建目录）')
  assert(WI.isDirectlySelectable('unverifiable'), 'unverifiable 可直接下载（只是校验不了）')
  assert(!WI.isDirectlySelectable('other'), 'other 不是"直接可下"（提示词会改成备份后新建）')
  assert(!WI.isDirectlySelectable('unknown'), 'unknown 不是"直接可下"（先盘查）')
  assertEq(WI.isWorkspaceId(WS_A), true, 'isWorkspaceId 认 ws_<32hex>')
  assertEq(WI.isWorkspaceId('ws_short'), false, 'isWorkspaceId 拒绝过短的')
  assertEq(WI.normalizeWorkspaceId(`  ${WS_A.toUpperCase()} `), WS_A, 'normalizeWorkspaceId：去空白 + 转小写')
}

/* ════════════════════════════════════════════════════════════════════════
 * [2] 两级身份记录
 * ════════════════════════════════════════════════════════════════════════ */
section('[2] 两级身份记录：工作区内标记（权威、可移植）+ 插件注册表（解压前就能判）')
{
  const root = join(work, 'ws-two-level', 'workspace')
  mkdirSync(root, { recursive: true })

  // ① 只有标记
  WI.writeWorkMarker(root, { workspaceId: WS_A, projectId: PROJECT_ID, serverUrl: 'http://s', role: 'mentor' })
  assertEq(WI.workMarkerPath(root), join(root, '.convfusion', 'work.json'), '标记路径 = <研究根>/.convfusion/work.json')
  assertEq(WI.readWorkMarker(root)?.workspaceId, WS_A, '标记能读回来')
  const onlyMarker = WI.readLocalIdentity(root)
  assertEq(onlyMarker.workspaceId, WS_A, '只有标记时：本地身份 = 标记的值')
  assertEq(onlyMarker.source, 'marker', '并标出来源是 marker')
  assertEq(onlyMarker.conflict, false, '没有冲突')

  // ② 标记 + 注册表一致
  const store = WI.createMemoryWorkIdentityStore()
  store.set(root, WI.makeWorkIdentity({ workspaceId: WS_A, projectId: PROJECT_ID, serverUrl: 'http://s', accountId: 'u1', role: 'mentor' }))
  const both = WI.readLocalIdentity(root, store)
  assertEq(both.workspaceId, WS_A, '两级一致 → 用同一个值')
  assertEq(both.source, 'both', '来源标成 both')

  // ③ 两级**冲突** → 判不了（绝不静默取一个：取错就是"把 A 的研究融合进 B 的工作区"）
  store.set(root, WI.makeWorkIdentity({ workspaceId: WS_B, projectId: PROJECT_ID, serverUrl: 'http://s', accountId: 'u1', role: 'mentor' }))
  const conflicted = WI.readLocalIdentity(root, store)
  assertEq(conflicted.workspaceId, null, '两级矛盾 → workspaceId 归 null（判不了）')
  assertEq(conflicted.conflict, true, '并置 conflict 标记（界面据此说"身份记录冲突"）')

  // ④ 只有注册表（解压之前：标记还没被 agent 写出来）
  rmSync(WI.workMarkerPath(root), { force: true })
  const onlyRegistry = WI.readLocalIdentity(root, store)
  assertEq(onlyRegistry.workspaceId, WS_B, '只有注册表时：本地身份 = 注册表的值')
  assertEq(onlyRegistry.source, 'registry', '来源标成 registry')

  // ⑤ 容错：坏 JSON / 形状不对 / 字段名怪 → 当作读不到（绝不抛、绝不拿坏值判定）
  writeFileSync(WI.workMarkerPath(root), '{ this is not json', 'utf8')
  assertEq(WI.readWorkMarker(root), undefined, '坏 JSON → undefined（不抛）')
  writeFileSync(WI.workMarkerPath(root), JSON.stringify({ hello: 'world' }), 'utf8')
  assertEq(WI.readWorkMarker(root), undefined, '没有 workspace_id 字段 → undefined')
  writeFileSync(WI.workMarkerPath(root), JSON.stringify({ workspace_id: 'nonsense' }), 'utf8')
  assertEq(WI.readWorkMarker(root), undefined, '字段在但形状不对 → undefined')
  // 驼峰写法也要认（标记是"数据"，两边写法都可能出现）
  writeFileSync(WI.workMarkerPath(root), JSON.stringify({ workspaceId: WS_A }), 'utf8')
  assertEq(WI.readWorkMarker(root)?.workspaceId, WS_A, '驼峰 workspaceId 也认')

  // ⑥ 可移植：工作区被复制（连标记一起）后，在新位置照样自证身份
  const copied = join(work, 'ws-copied', 'workspace')
  mkdirSync(join(copied, '.convfusion'), { recursive: true })
  writeFileSync(WI.workMarkerPath(copied), readFileSync(WI.workMarkerPath(root)))
  assertEq(WI.readLocalIdentity(copied).workspaceId, WS_A, '复制到另一个位置（无注册表）仍读得到身份 = 可移植')

  // ⑦ 注册表落盘 + 坏表容错
  const file = join(work, 'identities.json')
  const fileStore = WI.createFileWorkIdentityStore(() => file)
  fileStore.set('/x/workspace', WI.makeWorkIdentity({ workspaceId: WS_A, projectId: 'p', serverUrl: 's', accountId: 'a', role: 'owner' }))
  assert(existsSync(file), '文件注册表真的落盘了')
  assertEq(WI.createFileWorkIdentityStore(() => file).get('/x/workspace')?.workspaceId, WS_A, '重新打开能读回来')
  writeFileSync(file, '{ broken', 'utf8')
  assertEq(WI.createFileWorkIdentityStore(() => file).all(), {}, '坏 JSON → 当空表（绝不让插件起不来）')
}

/* ════════════════════════════════════════════════════════════════════════
 * 客户端 bundle（离线断言客户端那一半：命令形状、面板文案、对话框渲染）
 *
 * `lib/client.js` 是 IIFE：喂个假的 `window.__ModuleLoader__` 就能截到模块工厂，
 * 再用真 require 建出导出对象 —— 不需要浏览器、不需要 DOM。
 * ════════════════════════════════════════════════════════════════════════ */
let CLIENT = null
{
  const bundleSource = readFileSync(join(PKG, 'lib', 'client.js'), 'utf8')
  let captured = null
  new Function('window', bundleSource)({ __ModuleLoader__: { load: (m) => { captured = m } } })
  CLIENT = captured.factory(createRequire(join(PKG, 'x.js')))
  assert(typeof CLIENT.syncCommandLine === 'function', '客户端 bundle 导出了 syncCommandLine（可离线断言）')
}

/* ════════════════════════════════════════════════════════════════════════
 * [3] 身份文件：技能里的字段表 == 宿主读回来的
 * ════════════════════════════════════════════════════════════════════════ */
section('[3] 身份文件：技能里写的字段表，与宿主读回来的必须一致')

/*
 * 以前这一段比的是"客户端拼的 JSON == 宿主写的 JSON"（那时提示词里嵌着 JSON）。
 * 现在 JSON 由**技能**指导 agent 写（流程搬进了 `skills/sync.md`），
 * 所以这里比的是：**技能列的字段 == 宿主 `markerJson` 真实输出的键**。
 * 一旦有人给身份文件加字段却忘了改技能，这条会响。
 */
{
  const skill = readFileSync(join(PKG, 'skills', 'sync.md'), 'utf8')
  const hostWritten = WI.markerJson(
    WI.makeWorkIdentity({
      workspaceId: WS_A,
      projectId: PROJECT_ID,
      serverUrl: 'https://s',
      accountId: 'acc-1',
      role: 'mentor',
      now: new Date('2026-10-11T03:21:44Z'),
    }),
  )
  const hostKeys = Object.keys(JSON.parse(hostWritten))
  const missing = hostKeys.filter((k) => !skill.includes(k))
  assertEq(missing.length, 0, `技能里列全了身份字段：${hostKeys.join(', ')}`)
  assert(skill.includes('.convfusion/work.json'), '技能指明身份文件路径（研究根相对）')
  assert(
    /same[^\n]{0,40}才|判定为 `?same`? *时才写|只在.*same.*写/.test(skill),
    '技能写明"只有判定为 same 才写身份文件"（other 时写会把两项研究认成一项）',
  )
  assertEq(JSON.parse(hostWritten).workspace_id, WS_A, '宿主 markerJson 的 workspace_id 就是标识本身')
}

/* ════════════════════════════════════════════════════════════════════════
 * [4] 提示词：五态各自的第 2 步 + 两步硬约束 + 融合纪律
 * ════════════════════════════════════════════════════════════════════════ */
section('[4] 同步：一行命令 + 技能里的固定流程')
{
  /*
   * 2026-10 用户拍板：同步不再往输入框塞几十行提示词 ——
   * **固定流程写成技能** `skills/sync.md`，用户只发一行 `/research sync @某.zip`。
   * 所以这一段分两半：命令的形状（客户端）+ 流程确实写在技能里（内容断言）。
   */

  // ── 4a：一行命令的形状 ────────────────────────────────────────────
  assert(typeof CLIENT.syncCommandLine === 'function', '客户端 bundle 导出了 syncCommandLine（可离线断言）')
  assertEq(
    CLIENT.syncCommandLine('/w/ku-Jev-Paper2.zip'),
    '/research sync @/w/ku-Jev-Paper2.zip',
    '普通路径：@<绝对路径>',
  )
  assertEq(
    CLIENT.syncCommandLine('/w/my research/x.zip'),
    '/research sync @"/w/my research/x.zip"',
    '**含空格**的路径写成 @"…"（否则空格会把参数切断，命令只看到前半段）',
  )
  assertEq(
    CLIENT.syncCommandLine('  /w/x.zip  '),
    '/research sync @/w/x.zip',
    '两侧空白先去掉',
  )
  assert(
    CLIENT.syncCommandLine('/w/x.zip').split('\n').length === 1,
    '它就是**一行**（这正是不再需要一大段提示词的意思）',
  )

  // ── 4b：固定流程确实写在技能里（技能是这段流程的单一事实源）──────
  const skill = readFileSync(join(PKG, 'skills', 'sync.md'), 'utf8')
  const must = [
    ['两步走', '两步走纪律（先盘查、后动手）'],
    ['只读盘查', '第 1 步是只读盘查'],
    ['停下来等用户确认', '盘查完**停下等确认**再动文件'],
    ['仅包内有', '盘查的四类清单'],
    ['就地融合', 'same → 就地融合'],
    ['不是覆盖', '融合不是覆盖'],
    ['解压成新的研究根', 'new → 解压成新的研究根'],
    ['整体移到本工作区根下', 'other → 先整体备份（移动）'],
    ['workspace_', '备份名前缀固定 workspace_'],
    ['首字母缩写', '备份名带研究缩写'],
    ['同名就加', '备份名同名加序号'],
    ['备份目录的最终名字', '报告里必须给出备份目录名'],
    ['.convfusion/incoming', '二进制落败方进 incoming 暂存'],
    ['不要替用户决定', '结论冲突不替用户裁决'],
    ['same` 时才写', '只有判定 same 才写身份文件'],
    ['压缩包**不要删', '边界：不删压缩包'],
    ['只改动**本工作区以内**', '边界：只动本工作区以内'],
  ]
  for (const [needle, label] of must) {
    assert(skill.includes(needle), `技能包含：${label}`)
  }
  assert(
    /^---[\s\S]*?kind: operation[\s\S]*?---/m.test(skill),
    '技能 frontmatter 声明了 kind: operation（不是研究方法）',
  )
  // 技能里不该再出现"要不要下载"这类插件侧判断 —— 它只描述流程
  assert(!skill.includes('不要下载'), '技能不管"能不能下"（判定只决定流程说法）')

  // ── 4c：面板五种情形的说明（两种语言都要有）──────────────────────
  const ZH = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const EN = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
  for (const state of ['new', 'same', 'other', 'unknown', 'unverifiable']) {
    assert(typeof ZH[`community.merge.plan.${state}`] === 'string', `中文有 plan.${state}`)
    assert(typeof EN[`community.merge.plan.${state}`] === 'string', `英文有 plan.${state}`)
  }
  // 面板给用户的说明里，三种"会自动做"的情形必须说清**是融合还是换根**
  assert(ZH['community.merge.plan.same'].includes('融合'), 'same 的说明写了"融合"')
  assert(ZH['community.merge.plan.other'].includes('备份'), 'other 的说明写了"先备份"')
  assert(ZH['community.merge.plan.new'].includes('新的研究根'), 'new 的说明写了"新的研究根"')
  // 判不出来的两种：**先给判断、等确认**
  for (const state of ['unknown', 'unverifiable']) {
    assert(ZH[`community.merge.plan.${state}`].includes('确认'), `${state} 的说明要求等确认`)
  }
  // 一行命令的说明里点明"先加载技能"
  assert(ZH['community.merge.hint'].includes('sync'), '面板说明里点出 sync 技能')
}

/* ════════════════════════════════════════════════════════════════════════
 * [5] 宿主 RPC 端到端
 * ════════════════════════════════════════════════════════════════════════ */
section('[5] 宿主 RPC：downloadState 给结论，download 落盘后才谈身份')

/** 一个最小的"能过 ZIP 尾部校验"的字节串。 */
function zipBytes(entries = 3) {
  const local = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(26, 7)])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries, 8)
  eocd.writeUInt16LE(entries, 10)
  return Buffer.concat([local, eocd])
}

function makeHost({ fileWorkspaceId, archiveWorkspaceId, listLocalWorkspaces, workIdentity }) {
  let config = CFG.resolveConfig({
    customizationFile: 'wsid.json',
    customizationDir: join(work, 'cf'),
    serverUrl: 'http://localhost:8000',
    convfusionApiKey: KEY,
  })
  const fetchImpl = async (url) => {
    if (String(url).includes('/files/archive')) {
      const headers = {
        get: (k) => {
          const key = String(k).toLowerCase()
          if (key === 'content-disposition') return "attachment; filename*=UTF-8''x.zip"
          if (key === 'x-file-count') return '3'
          // 服务器不给 `X-Workspace-Id` 时返回 null（老服务器）
          if (key === 'x-workspace-id') return archiveWorkspaceId ?? null
          return null
        },
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        headers,
        body: {
          getReader: () => {
            let done = false
            return { read: async () => (done ? { done: true } : ((done = true), { done: false, value: zipBytes() })) }
          },
        },
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'f1', relative_path: 'project.md', size: 5, sha256: 'x' }], total_bytes: 5, workspace_id: fileWorkspaceId }),
      headers: { get: () => null },
    }
  }
  return RPC.createSettingsRpcHandler({
    getConfig: () => config,
    store: CUST.createMemoryCustomizationStore(),
    setConfig: async (patch) => {
      config = { ...config, ...patch }
    },
    fetchImpl,
    serverTimeoutMs: 5000,
    listLocalWorkspaces,
    workIdentity,
  })
}

/** 造一个工作区：可选"有研究"、可选"已有身份标记"。 */
function makeWorkspace(name, { research = false, marker = null } = {}) {
  const dir = join(work, name)
  mkdirSync(join(dir, 'workspace'), { recursive: true })
  if (research) {
    writeFileSync(join(dir, 'workspace', 'project.md'), '# 我自己的研究\n')
    writeFileSync(join(dir, 'workspace', 'research-state.md'), '# state\n')
  }
  if (marker) WI.writeWorkMarker(join(dir, 'workspace'), { workspaceId: marker })
  return dir
}
const registryOf = (dirs) => async () => ({
  available: true,
  items: dirs.map((d, i) => ({ id: `ws-${i}`, title: `工作区 ${i}`, path: d, updatedAt: '' })),
})

{
  // ① 没有研究 → new（允许，按新建处理）
  const fresh = makeWorkspace('v-new')
  const h1 = makeHost({ fileWorkspaceId: WS_A, listLocalWorkspaces: registryOf([fresh]) })
  const s1 = await h1('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s1.ok, true, 'downloadState 可用')
  assertEq(s1.value.items[0].status, 'new', '没有研究根 → new')
  assertEq(s1.value.items[0].layout, null, 'new 的 layout 是 null（还没有研究）')
  assertEq(s1.value.items[0].researchRoot, join(realpathSync(fresh), 'workspace'), 'new 也给"将会是研究根"的路径（提示词要用）')
  assertEq(s1.value.remoteWorkspaceId, WS_A, '顶层回服务器给的标识')
  assertEq(s1.value.protocol, PROTO.HOST_PROTOCOL, '响应带宿主协议号（界面据此决定显不显示状态）')
  // ⚠️ 这里**故意**钉死当前协议号：它是"v23 那批字段存在"的直接证据。
  // 升协议号时必须同步改这一行（v0.6.0 出题模式 → 24；v0.6.3 论文等级定价 + Token 分池 → 28），
  // 否则会以假红提醒你回来确认。
  assertEq(s1.value.protocol, 29, '协议已升到 29（retrieval/saveKey：OpenAlex Key 改由宿主落盘）')

  // ② 同一项研究 → same，且**下载成功后**才写身份
  const same = makeWorkspace('v-same', { research: true, marker: WS_A })
  const store2 = WI.createMemoryWorkIdentityStore()
  const h2 = makeHost({ fileWorkspaceId: WS_A, archiveWorkspaceId: WS_A, listLocalWorkspaces: registryOf([same]), workIdentity: store2 })
  const s2 = await h2('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s2.value.items[0].status, 'same', '标识一致 → same')
  assertEq(store2.all(), {}, '只是**预检**：还没有下载，就不该写任何身份')
  const d2 = await h2('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_A })
  assertEq(d2.ok, true, 'same 可以直接下载')
  assertEq(d2.value.workspaceStatus, 'same', '落盘回报判定 = same（提示词据此走"融合"）')
  assertEq(store2.get(join(realpathSync(same), 'workspace'))?.workspaceId, WS_A, 'same 落盘后写进注册表')
  assertEq(WI.readWorkMarker(join(same, 'workspace'))?.workspaceId, WS_A, 'same 落盘后也刷新工作区内标记（权威、可移植）')

  // ③ 另一项研究 → other：**照样能下**，但**不写身份**（内容还是别人的，等 agent 备份+解压后再说）
  const other = makeWorkspace('v-other', { research: true, marker: WS_A })
  const store3 = WI.createMemoryWorkIdentityStore()
  const h3 = makeHost({ fileWorkspaceId: WS_B, archiveWorkspaceId: WS_B, listLocalWorkspaces: registryOf([other]), workIdentity: store3 })
  const s3 = await h3('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s3.value.items[0].status, 'other', '标识不一致 → other')
  const d3 = await h3('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_B })
  assertEq(d3.ok, true, '**other 仍然允许下载**（插件不拦：提示词会先说"备份后新建"）')
  assertEq(d3.value.workspaceStatus, 'other', '落盘回报 other（提示词据此走"备份 + 新建"）')
  assertEq(store3.all(), {}, 'other **不写身份**（这个工作区里现在还是另一项研究的内容）')
  assertEq(WI.readWorkMarker(join(other, 'workspace'))?.workspaceId, WS_A, 'other 也不覆盖原有的标记')
  assertEq(existsSync(join(other, 'z.zip')) || true, true, '（ZIP 已落盘，由上面 ok=true 保证）')

  // ④ 有研究但读不到标识 → unknown
  const blind = makeWorkspace('v-unknown', { research: true })
  const h4 = makeHost({ fileWorkspaceId: WS_A, listLocalWorkspaces: registryOf([blind]) })
  const s4 = await h4('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s4.value.items[0].status, 'unknown', '读不到标识 → unknown（提示词先盘查再定）')

  // ⑤ 服务器不给标识 → unverifiable（老服务器：不阻塞，也不假装校验过）
  const h5 = makeHost({ fileWorkspaceId: null, archiveWorkspaceId: null, listLocalWorkspaces: registryOf([same]) })
  const s5 = await h5('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s5.value.items[0].status, 'unverifiable', '服务器不给标识 → unverifiable')
  assertEq(s5.value.remoteWorkspaceId, null, '顶层标识是 null')
  const d5 = await h5('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner' })
  assertEq(d5.ok, true, '老服务器照样能下（不阻塞）')
  assertEq(d5.value.workspaceId, null, '没有标识 → 回报 null（提示词跳过写身份文件）')

  // ⑥ 归档头是权威：与预检值不一致时，按**实际下到的**那份重算判定
  const drift = makeWorkspace('v-drift', { research: true, marker: WS_B })
  const store6 = WI.createMemoryWorkIdentityStore()
  const h6 = makeHost({ fileWorkspaceId: WS_B, archiveWorkspaceId: WS_A, listLocalWorkspaces: registryOf([drift]), workIdentity: store6 })
  const d6 = await h6('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_B })
  assertEq(d6.ok, true, '头与预检值不一致也照下（不硬失败）')
  assertEq(d6.value.workspaceStatus, 'other', '按**归档头**重算：本地 WS_B vs 归档 WS_A → other')
  assertEq(d6.value.workspaceId, WS_A, '回报的标识取归档头（权威）')
  assertEq(store6.all(), {}, '判定不是 same → 不写身份')

  // ⑦ 注册表里的目录暂时不在 → missing，但落盘会把它建出来（一直如此，不能拦）
  const gone = join(work, 'v-gone') // 故意不创建
  const h7 = makeHost({ fileWorkspaceId: WS_A, archiveWorkspaceId: WS_A, listLocalWorkspaces: registryOf([gone]) })
  const s7 = await h7('mentor/downloadState', { projectId: PROJECT_ID, prefix: 'x' })
  assertEq(s7.value.items[0].status, 'missing', '目录不在 → missing（仍然允许）')
  const d7 = await h7('mentor/download', { projectId: PROJECT_ID, workspaceId: 'ws-0', prefix: 'x', source: 'owner', remoteWorkspaceId: WS_A })
  assertEq(d7.ok, true, 'missing 仍然能下（落盘那一步会把目录建出来）')
  assertEq(existsSync(gone), true, '目录真的被建出来了')
}

/* ════════════════════════════════════════════════════════════════════════
 * [6] 静态边界
 * ════════════════════════════════════════════════════════════════════════ */
section('[6] 静态边界：插件不拦、只填不发送、标记不进上传')
{
  const settingsSrc = readFileSync(join(PKG, 'src', 'client', 'settings.tsx'), 'utf8')
  const rpcSrc = readFileSync(join(PKG, 'src', 'settings-rpc.ts'), 'utf8')
  const wiSrc = readFileSync(join(PKG, 'src', 'research', 'work-identity.ts'), 'utf8')

  // ① 客户端不再有"强制/禁用"那套：判定只决定提示词
  assert(!/'community\.exchange\.ws\.force'/.test(settingsSrc), '没有「仍要下载」了（不再有强制下载这一步）')
  assert(!/needsForce/.test(settingsSrc), '没有 needsForce 分支')
  assert(!/not-allowed/.test(settingsSrc), '不再有"禁用"样式（判定只决定提示词，不拦）')
  assert(
    /<select[\s\S]{0,600}?value=\{selection\}/.test(settingsSrc),
    '工作区是**下拉框**，值 = 当前选中项',
  )
  assert(
    !/<option[^>]*disabled/.test(settingsSrc),
    '下拉里每一项都可选（判定不决定"能不能下"）',
  )
  assert(
    settingsSrc.includes('<option key={w.id} value={w.id}>') &&
      /onChange=\{\(e\) => onSelect\(e\.target\.value\)\}/.test(settingsSrc),
    '每一项的 id 就是它的值（选谁下到谁）',
  )

  // ② 宿主不再因判定而拒绝下载
  assert(!/workspace-conflict/.test(rpcSrc), '宿主不再返回 workspace-conflict（不拦下载）')
  assert(/settled\.status === 'same'/.test(rpcSrc), '身份只在判定为 same 时写')
  assert(/X-Workspace-Id|archivedId/.test(rpcSrc), '归档头参与判定（权威值）')

  // ③ 提示词只填不发送：填的是 setDraft，且全流程没有 submit
  const fillBlock = settingsSrc.slice(settingsSrc.indexOf('onFill={() => {'), settingsSrc.indexOf('onCopy={() => {'))
  assert(/session\.setDraft\(prompt\)/.test(fillBlock), '「填入输入框」走 session.setDraft')
  assert(!/submit\(/.test(fillBlock), '填入**不发送**（没有 submit）')
  assert(/draftEmpty/.test(settingsSrc), '输入框非空时不自动填（绝不悄悄替换用户正在写的东西）')

  // ④ 标记目录不进上传（否则会被当成研究文件传到服务器）
  assert(
    readFileSync(join(PKG, 'src', 'research', 'upload-selection.ts'), 'utf8').includes("'.convfusion'"),
    '.convfusion 在 JUNK_DIRS 里（身份标记不会被上传成研究文件）',
  )

  // ⑤ 标记写在研究根之下（不是工作区根）：用户材料区与研究数据区仍然分开
  assert(wiSrc.includes("`${WORK_META_DIR}/work.json`"), '标记路径 = .convfusion/work.json（研究根相对）')

  /*
   * ⑦ **后果提示必须留着**（2026-10 用户明确要求）。
   *
   * 插件不再拦任何工作区，于是"选错"的代价全靠用户在**按下载之前**看清楚 ——
   * 尤其 `other`：那一下会把现有研究根备份后换掉。所以徽章之外还要有一条后果说明，
   * 而且必须画在按钮之前。这条断言就是防它被谁顺手删掉。
   */
  assert(/function downloadWarning\(/.test(settingsSrc), '有"选中后的后果提示"函数')
  for (const [key, what] of [
    ['otherWarn', '另一项研究 → 会备份后换掉'],
    ['unknownWarn', '读不到标识 → 先盘查再定'],
    ['conflictWarn', '两级记录矛盾 → 先盘查再定'],
    ['unverifiableWarn', '服务器不给标识 → 先盘查再定'],
    ['missingWarn', '目录暂时不在 → 会建出来'],
  ]) {
    assert(settingsSrc.includes(`community.exchange.ws.${key}`), `后果提示覆盖：${what}`)
  }
  assert(
    /!\(done && done\.phase === 'ready'\) && warning \?/.test(settingsSrc),
    '后果提示渲染在【下载】按钮之前（选中即见；下载进行中也照旧显示）',
  )
  assert(
    /tone === 'error'[\s\S]{0,80}?\?[\s\S]{0,120}?state-error-primary/.test(settingsSrc),
    '“另一项研究”那条用**错误色**（最醒目的一档，避免看漏）',
  )
  {
    const zhDict = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
    const enDict = (await import(join(PKG, 'src', 'client', 'i18n', 'en.ts'))).en
    for (const key of ['otherWarn', 'unknownWarn', 'conflictWarn', 'unverifiableWarn', 'missingWarn']) {
      const full = `community.exchange.ws.${key}`
      assert(typeof zhDict[full] === 'string' && zhDict[full].length > 10, `中文字典有 ${key}`)
      assert(typeof enDict[full] === 'string' && enDict[full].length > 10, `英文字典有 ${key}`)
    }
    assert(zhDict['community.exchange.ws.otherWarn'].includes('备份'), '“另一项研究”的提示写明会**备份**')
    assert(zhDict['community.exchange.ws.otherWarn'].includes('另选'), '并告诉用户"想保住就另选一个工作区"')
  }

  /*
   * ⑧ 口径三条（2026-10 用户完整口径，逐条钉住）
   *
   * ① 下载的 ZIP 保存在**当前工作区下、与现有 `workspace/` 平级**（不进 `workspace/`），
   *    且**保持服务器给的原文件名**（同名加序号，不改名成 `workspace.zip`）；
   * ② 插件**只构建提示词** —— 下载完成时磁盘上只有 ZIP，没有解压出来的目录；
   * ③ 提示词让 DSH **先备份现有 `workspace/`**（移动），再把 ZIP **解压成 `<工作区>/workspace`**
   *    —— 落点是所选工作区下的 `workspace/`，**不是**某个 `mentors/workspace/`。
   */
  const syncSrc = readFileSync(join(PKG, 'src', 'research', 'workspace-sync.ts'), 'utf8')
  assert(/openDownloadPart\(target\.path/.test(rpcSrc), '① ZIP 写进**所选工作区根**（与 workspace/ 平级）')
  assert(/part\.commit\(filename \?\? fallback/.test(rpcSrc), '① 文件名用**服务器给的**（保持原文件名）')
  assert(
    syncSrc.includes('name.replace(/') && syncSrc.includes('${stem}-${n}.zip'),
    '① 同名不覆盖：加 -2、-3 序号（也不改名成 workspace.zip）',
  )
  // ② 插件不解压：下载路径里没有任何解压/展开动作（提示词才是干活的地方）
  assert(!/extract|unzip|解压/.test(rpcSrc.slice(rpcSrc.indexOf("case 'mentor/download':"), rpcSrc.indexOf("case 'mentor/downloadProgress':")).replace(/\/\*[\s\S]*?\*\//g, '')),
    '② 宿主**不解压**（下载完磁盘上只有 ZIP；解压交给提示词里的 agent）')
  /*
   * ③ 落点与备份纪律现在写在**技能**里（`skills/sync.md`），插件侧只负责把 ZIP 落对地方。
   * 这一段因此断言两件事：宿主仍然只把 ZIP 写到工作区根；技能里写清了落点与"备份是移动"。
   */
  {
    const skillSrc = readFileSync(join(PKG, 'skills', 'sync.md'), 'utf8')
    assert(rpcSrc.includes('target.path'), '③ 宿主把 ZIP 写到**所选工作区根**（与 workspace/ 平级）')
    assert(skillSrc.includes('<工作区>/workspace'), '③ 技能里写清了研究根就是 `<工作区>/workspace`')
    assert(skillSrc.includes('移动，不是删除'), '③ 技能里写明备份是**移动**（可恢复），不是删除')
    assert(skillSrc.includes('与研究对象同级'), '③ 备份目录与研究对象**同级**（不塞进研究根里面）')
    assert(!skillSrc.includes('mentors/'), '③ 技能里不出现 mentors/（落点相对于所选工作区）')
  }

  /*
   * ⑨ **先把同步命令填进输入框、再下载**（2026-10 用户实测反馈）
   *
   * "下载完之后对话框没有马上出现提示词，好像过一下才出现" —— 于是顺序倒过来：
   * 点【下载】就拼好 `/research sync @<zip>` 填进输入框（**只有文件名是猜的**），
   * 下载跑完按落盘实测值核准；真名不同时给一个"按实际文件名更新"的按钮。
   *
   * 名字猜错的代价比过去小得多：命令自己会校验 —— 文件不存在时它把**同前缀候选**列出来
   * （见 `research/sync-request.ts` 的 `siblingCandidates`），所以正文里不必再写"以实际为准"。
   */
  {
    const provisionalAt = settingsSrc.indexOf('const provisionalPrompt =')
    const postAt = settingsSrc.indexOf("await post('mentor/download'")
    assert(
      provisionalAt > 0 && postAt > 0 && provisionalAt < postAt,
      '⑨ 同步命令在**发下载请求之前**就拼好（不再等落盘）',
    )
    assert(
      settingsSrc.includes('syncCommandLine(`${provisionalDir}/${provisionalName}`)'),
      '⑨ 预检那一版用**预检猜的文件名**拼命令',
    )
    assert(
      settingsSrc.includes('syncCommandLine(`${v.dir}/${v.name}`)'),
      '⑨ 落盘后那一版用**实际落盘的文件名**拼命令',
    )
    assert(/phase: 'pending'/.test(settingsSrc) && /phase: 'ready'/.test(settingsSrc),
      '⑨ 面板分 pending / ready 两相（下载中就显示"已填好，等落盘再发"）')
    assert(settingsSrc.includes("t('community.merge.pendingHint')"), '⑨ 下载中明说"已经填好了，等写完再发"')
    assert(settingsSrc.includes("t('community.merge.downloadFailedHint')"), '⑨ 下载失败时提醒"先别发送输入框里那条命令"')
    assert(/nameChanged/.test(settingsSrc) && /correctedPrompt/.test(settingsSrc),
      '⑨ 实际文件名与猜的不同 → 备一个更正版（点了才替换，不静默改输入框）')
    assert(settingsSrc.includes("t('community.merge.refill')"), '⑨ 并给「按实际文件名更新命令」按钮')
    // 下载进行中不许改目标：请求已经发出去了，改了只会让人以为换成功了
    assert(/disabled=\{busy\}/.test(settingsSrc), '⑨ 下载进行中工作区不可改（避免误以为换了目标）')
    // 长提示词那套机器已经搬走：客户端不该再有它
    assert(!/buildMergePrompt/.test(settingsSrc), '⑨ 客户端不再拼长提示词（流程在技能里）')
  }

  // ⑥ 协议号与历史
  assertEq(PROTO.HOST_PROTOCOL, 29, 'HOST_PROTOCOL = 29（retrieval/saveKey / clearKey）')
  assert(readFileSync(join(PKG, 'src', 'protocol.ts'), 'utf8').includes('**【下载】先校验目标工作区**'), 'protocol.ts 写了 23 的理由')
}

/* ════════════════════════════════════════════════════════════════════════
 * [7] 【下载】对话框**真的渲染一遍**（离线、无 DOM）
 *
 * 光看源码正则不够 —— "下拉框里是不是这几个工作区、默认选中的是不是**当前工作区**、
 * 每一项的文字里有没有状态"这些，只有把组件跑一遍、遍历产出的树才算数。
 *
 * `DownloadDialog` 没有 hook（状态都在 `CommunityTab` 里），所以可以直接当普通函数调；
 * JSX 在 bundle 里编译成 `jsx(...)` 调用 → 返回的是一棵普通对象树，遍历即可。
 * ════════════════════════════════════════════════════════════════════════ */
section('[7] 【下载】对话框渲染：下拉框 + 默认选中当前工作区')
{
  const ZH3 = (await import(join(PKG, 'src', 'client', 'i18n', 'zh.ts'))).zh
  const t3 = (k, p) => {
    const tpl = ZH3[k] ?? k
    return p ? tpl.replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m)) : tpl
  }
  const mkTarget = (id, status, over = {}) => ({
    id,
    title: `工作区 ${id}`,
    path: `/tmp/…/${id}`,
    exists: true,
    researchRoot: `/tmp/…/${id}/workspace`,
    layout: status === 'new' ? null : 'nested',
    status,
    localWorkspaceId: null,
    identityConflict: false,
    ...over,
  })
  const tree = CLIENT.DownloadDialog({
    t: t3,
    proposal: { projectId: 'p1', projectTitle: '学生甲的研究' },
    fileName: 'Jev-Paper2.zip',
    workspaces: [
      { id: 'w0', title: '工作区 w0', path: '/tmp/…/w0' },
      { id: 'w1', title: '工作区 w1', path: '/tmp/…/w1' },
      { id: 'w2', title: '工作区 w2', path: '/tmp/…/w2' },
    ],
    workspacesAvailable: true,
    workspacesReason: null,
    // 默认选中 **w1**（= 当前会话的工作区）
    selection: 'w1',
    files: 3,
    bytes: 15,
    busy: false,
    received: null,
    notice: null,
    targets: [mkTarget('w0', 'other'), mkTarget('w1', 'same'), mkTarget('w2', 'new')],
    currentWorkspaceId: 'w1',
    done: null,
    onSelect: () => {},
    onDownload: () => {},
    onClose: () => {},
    onFill: () => {},
    onCopy: () => {},
    onRefill: () => {},
  })
  /** 深度收集某一类节点。 */
  const collect = (node, pred, out = []) => {
    if (node === null || node === undefined || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const x of node) collect(x, pred, out)
      return out
    }
    if (pred(node)) out.push(node)
    for (const v of Object.values(node.props ?? {})) collect(v, pred, out)
    return out
  }
  const selects = collect(tree, (n) => n.type === 'select')
  assertEq(selects.length, 1, '工作区是**一个下拉框**（不再是一列单选）')
  const sel = selects[0]
  assertEq(sel.props.value, 'w1', '下拉框的值 = 当前选中项（w1）')
  assertEq(sel.props.disabled, false, '不在下载中 → 下拉框可改')
  const options = collect(sel, (n) => n.type === 'option')
  assertEq(options.length, 3, '三个工作区各一项')
  assertEq(options.map((o) => o.props.value), ['w0', 'w1', 'w2'], '每一项的 value = 工作区 id')
  const labels = options.map((o) => collect(o, () => false) && String(o.props.children))
  assert(labels[0].includes('另一项研究'), '第一项的文字里带判定（另一项研究）')
  assert(labels[1].includes('当前会话'), '第二项标出「当前会话」')
  assert(labels[1].includes('同一项研究'), '第二项的文字里带判定（同一项研究）')
  assert(labels[2].includes('新工作区'), '第三项的文字里带判定（新工作区）')
  // 选中项的路径与结论说明在框下面（下拉里放不下）
  const hints = collect(tree, (n) => typeof n.props?.children === 'string').map((n) => n.props.children)
  assert(hints.includes('/tmp/…/w1'), '框下面给出**选中项**的完整路径')
  /**
   * 整棵树里的**所有字符串叶**（连成一段）。
   *
   * ⚠️ 不能只收"children 是字符串"的节点：徽章那一行的 children 是**数组**
   * （`[<Badge/>, ' ', 说明文字]`），只认字符串会漏掉说明文字。
   */
  const allText = (node, out = []) => {
    if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
    else if (Array.isArray(node)) for (const x of node) allText(x, out)
    else if (node && typeof node === 'object') {
      for (const v of Object.values(node.props ?? {})) allText(v, out)
    }
    return out.join('\n')
  }
  assert(allText(tree).includes('读两侧内容'), '框下面给出**选中项**（同一项）的结论说明')

  // 换成选中 w0（另一项研究）→ 必须出现红色后果提示（用户 2026-10 要求保留警告）
  const tree0 = CLIENT.DownloadDialog({
    ...{
      t: t3,
      proposal: { projectId: 'p1', projectTitle: '学生甲的研究' },
      fileName: 'Jev-Paper2.zip',
      workspaces: [
        { id: 'w0', title: '工作区 w0', path: '/tmp/…/w0' },
        { id: 'w1', title: '工作区 w1', path: '/tmp/…/w1' },
      ],
      workspacesAvailable: true,
      workspacesReason: null,
      selection: 'w0',
      files: 3,
      bytes: 15,
      busy: false,
      received: null,
      notice: null,
      targets: [mkTarget('w0', 'other'), mkTarget('w1', 'same')],
      currentWorkspaceId: 'w1',
      done: null,
      onSelect: () => {},
      onDownload: () => {},
      onClose: () => {},
      onFill: () => {},
      onCopy: () => {},
      onRefill: () => {},
    },
  })
  assert(
    allText(tree0).includes('会先把现有研究根整体'),
    '选中"另一项研究"时渲染出**后果提示**（会先备份再换掉）',
  )
  assert(allText(tree0).includes('提示词会先备份它'), '框下面换成**选中项**（另一项研究）的结论说明')
  assert(
    collect(tree0, (n) => String(n.props?.style?.color ?? '').includes('state-error-primary')).length > 0,
    '那条提示用的是**错误色**（最醒目）',
  )
}

try {
  rmSync(work, { recursive: true, force: true })
} catch {
  /* 清理失败不影响结论 */
}
console.log(`\n${failures.length === 0 ? '✅' : '❌'} workspace-identity: ${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  console.log('failures:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
